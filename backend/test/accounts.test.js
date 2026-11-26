import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { Listing } from '../src/listings/listing-model.js';

const records = new Map();
let server;
let url;

before(async () => {
  const accounts = {
    isReady: () => true,
    async verifyToken(token) {
      if (!['first', 'second'].includes(token)) {
        throw Object.assign(new Error('Invalid token'), { code: 'auth/invalid-id-token' });
      }
      return { uid: token, email: `${token}@example.com` };
    },
    profiles: {
      find: (uid) => records.get(uid),
      create(uid, details) {
        if (!records.has(uid)) records.set(uid, { ...details, role: 'member' });
        return records.get(uid);
      },
      update(uid, details) {
        const record = records.get(uid);
        if (!record) return null;
        Object.assign(record, details);
        return record;
      },
      favorite(uid, slug, saved) {
        const record = records.get(uid);
        if (!record) return null;
        const favorites = new Set(record.favorites);
        if (saved) favorites.add(slug);
        else favorites.delete(slug);
        record.favorites = [...favorites];
        return record;
      },
      importFavorites(uid, slugs) {
        const record = records.get(uid);
        if (!record) return null;
        record.favorites = [...new Set([...(record.favorites ?? []), ...slugs])];
        return record;
      },
    },
  };
  server = createApp({ allowedOrigins: [], getDatabaseStatus: () => 'test', accounts }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  url = `http://127.0.0.1:${server.address().port}/api/v1/account/me`;
});

after(async () => {
  if (!server?.listening) return;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function request(token, method = 'GET', profile, path = '') {
  return fetch(url + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(profile ? { 'Content-Type': 'application/json' } : {}),
    },
    body: profile ? JSON.stringify(profile) : undefined,
  });
}

test('a profile requires a verified identity', async () => {
  for (const token of [null, 'invalid']) {
    const response = await request(token);
    assert.equal(response.status, 401);
    await response.json();
  }
});

test('profiles are private, setup is repeatable, and only permitted details can change', async () => {
  const individual = { name: 'Test Member', firstName: 'Test', lastName: 'Member', address: 'Test Street, Sahiwal', phone: '+923001234567', accountType: 'individual' };
  const created = await request('first', 'PUT', individual);
  assert.equal(created.status, 200);
  assert.equal(created.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual((await created.json()).profile, {
    ...individual, businessName: '', email: 'first@example.com',
  });

  const repeat = await request('first', 'PUT', { ...individual, firstName: 'Retry' });
  assert.equal((await repeat.json()).profile.name, individual.name);
  const otherAccount = await request('second');
  assert.deepEqual(await otherAccount.json(), { profile: null });
  const missing = await request('second', 'PATCH', individual);
  assert.equal(missing.status, 404);
  await missing.json();

  for (const extra of [{ firstName: '123' }, { lastName: ' ' }, { phone: '+123' }, { address: '' }, { role: 'admin' }, { firebaseUid: 'second' }, { accountType: 'business' }]) {
    const invalid = await request('first', 'PATCH', { ...individual, ...extra });
    assert.equal(invalid.status, 400);
    await invalid.json();
  }
  const business = { ...individual, accountType: 'business', businessName: 'Rent Test' };
  const edited = await request('first', 'PATCH', business);
  assert.equal(edited.status, 200);
  assert.deepEqual((await edited.json()).profile, { ...business, email: 'first@example.com' });
  assert.equal(records.get('first').role, 'member');
});

test('only an authenticated profile owner can update their photo', async () => {
  const photo = 'data:image/jpeg;base64,/9j/2Q==';
  assert.equal((await request(null, 'PATCH', { photo }, '/photo')).status, 401);
  assert.equal((await request('first', 'PATCH', { photo: 'https://example.com/photo' }, '/photo')).status, 400);
  assert.equal((await request('second', 'PATCH', { photo }, '/photo')).status, 404);
  assert.equal((await request('first', 'PATCH', { photo }, '/photo')).status, 200);
  assert.equal((await (await request('first')).json()).profile.photo, photo);
  assert.deepEqual(await (await request('second')).json(), { profile: null });
});

test('saved listing imports merge repeatably and skip the owner’s ads', async ({ mock }) => {
  const path = '/favorites/import';
  mock.method(Listing, 'distinct', async (field, query) => {
    assert.equal(field, 'slug');
    assert.equal(query.ownerUid, 'first');
    return query.slug.$in.includes('117845') ? ['117845'] : [];
  });
  assert.equal((await request(null, 'POST', { slugs: ['123456'] }, path)).status, 401);
  assert.equal((await request('second', 'POST', { slugs: ['123456'] }, path)).status, 404);
  assert.equal((await request('first', 'POST', { slugs: [{ $ne: null }] }, path)).status, 400);
  for (const slugs of [['123456', '117845'], ['123456', '654321']]) {
    assert.equal((await request('first', 'POST', { slugs }, path)).status, 200);
  }
  assert.deepEqual((await (await request('first')).json()).profile.favorites, ['123456', '654321']);
  assert.deepEqual(await (await request('second')).json(), { profile: null });
});

test('rental requests require sign-in, a completed profile and valid input', async () => {
  const path = '/requests/00000000-0000-4000-8000-000000000000';
  const payload = { listing: '123456', startsAt: new Date(Date.now() + 60_000).toISOString(), quantity: 1 };
  assert.equal((await request(null, 'PUT', payload, path)).status, 401);
  assert.equal((await request('second', 'PUT', payload, path)).status, 403);
  assert.equal((await request('first', 'PUT', { ...payload, quantity: 0 }, path)).status, 400);
});

test('owners cannot save their own ads through the account API', async ({ mock }) => {
  mock.method(Listing, 'exists', async ({ slug, ownerUid }) => slug === '117845' && ownerUid === 'first');
  assert.equal((await request('first', 'PUT', undefined, '/favorites/117845')).status, 409);
  assert.equal((await request('first', 'PUT', undefined, '/favorites/100001')).status, 200);
  assert.equal((await request('first', 'DELETE', undefined, '/favorites/100001')).status, 200);
  assert.ok(!(await (await request('first')).json()).profile.favorites.includes('117845'));
});

test('ad edits, availability and deletion are scoped to the owner and work with a six-digit legacy slug', async ({ mock }) => {
  const path = '/ads/117845';
  let ad = { slug: '117845', ownerUid: 'first', adId: '117845', title: 'Original', available: false, imageCount: 1 };
  const matches = ({ slug, ownerUid }) => ad?.slug === slug && ad.ownerUid === ownerUid;
  mock.method(Listing, 'findOneAndUpdate', (key, update, options) => ({
    select: () => ({
      lean: async () => {
        assert.equal(options.runValidators, true);
        if (!matches(key)) return null;
        ad = { ...ad, ...update.$set };
        return ad;
      },
    }),
  }));
  mock.method(Listing, 'updateOne', async (key, update) => {
    if (!matches(key)) return { matchedCount: 0 };
    ad = { ...ad, ...update.$set };
    return { matchedCount: 1 };
  });
  mock.method(Listing, 'deleteOne', async (key) => {
    if (!matches(key)) return { deletedCount: 0 };
    ad = null;
    return { deletedCount: 1 };
  });

  const fields = { title: 'Updated title', summary: 'Updated details', category: 'vehicles', area: ' Farid Town ', priceMinor: 300000,
    rateUnit: 'day', keywords: ['car'], ownerType: 'individual' };
  assert.equal((await request(null, 'PATCH', fields, path)).status, 401);
  assert.equal((await request('first', 'PATCH', { ...fields, adId: '999999' }, path)).status, 400);
  assert.equal((await request('second', 'PATCH', fields, path)).status, 404);
  assert.equal(ad.title, 'Original');
  const result = await request('first', 'PATCH', fields, path);
  assert.equal(result.status, 200);
  const { item } = await result.json();
  assert.equal(item.title, fields.title);
  assert.equal(item.area, 'Farid Town');
  assert.equal(item.imageCount, 1);
  assert.equal(item.adId, '117845');
  assert.equal(item.available, false);
  assert.equal((await request('first', 'PATCH', { ...fields, images: [] }, path)).status, 200);
  assert.equal(ad.imageCount, 0);
  assert.equal((await request('second', 'PATCH', { available: true }, path)).status, 404);
  assert.equal((await request('first', 'PATCH', { available: true }, path)).status, 204);
  assert.equal(ad.available, true);
  assert.equal((await request('second', 'DELETE', undefined, path)).status, 404);
  assert.ok(ad);
  assert.equal((await request('first', 'DELETE', undefined, path)).status, 204);
  assert.equal(ad, null);
  assert.equal((await request('first', 'PATCH', fields, path)).status, 404);
});

test('contact details require a complete signed-in profile and a currently available public ad', async ({ mock }) => {
  records.set('contact-owner', {
    name: 'Listing Owner', businessName: 'Sahiwal Rentals', phone: '0300 1234567',
    photo: 'data:image/jpeg;base64,/9j/2Q==', address: 'Private address, Sahiwal',
    createdAt: new Date('2023-05-01T10:00:00Z'),
  });
  mock.method(Listing, 'findOne', (filter) => ({
    select: () => ({
      lean: async () => {
        assert.equal(filter.status, 'published');
        assert.equal(filter.city, 'sahiwal');
        assert.deepEqual(filter.available, { $ne: false });
        return filter.slug === '123456' ? { ownerUid: 'contact-owner', ownerType: 'business' } : null;
      },
    }),
  }));
  mock.method(Listing, 'countDocuments', async (filter) => {
    assert.deepEqual(filter, { status: 'published', city: 'sahiwal', ownerUid: 'contact-owner' });
    return 2;
  });

  const path = '/listings/123456/contact';
  assert.equal((await request(null, 'GET', undefined, path)).status, 401);
  assert.equal((await request('second', 'GET', undefined, path)).status, 403);
  assert.equal((await request('first', 'GET', undefined, '/listings/999999/contact')).status, 404);

  const response = await request('first', 'GET', undefined, path);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), {
    contact: { name: 'Sahiwal Rentals', phone: '+923001234567', photo: 'data:image/jpeg;base64,/9j/2Q==', memberSince: 2023, activeAds: 2 },
  });

  records.get('contact-owner').phone = '';
  const missingPhone = await request('first', 'GET', undefined, path);
  assert.equal((await missingPhone.json()).contact.phone, null);
});
