import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';

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

test('saved listing imports merge repeatably into the authenticated profile', async () => {
  const path = '/favorites/import';
  assert.equal((await request(null, 'POST', { slugs: ['123456'] }, path)).status, 401);
  assert.equal((await request('second', 'POST', { slugs: ['123456'] }, path)).status, 404);
  assert.equal((await request('first', 'POST', { slugs: [{ $ne: null }] }, path)).status, 400);
  for (const slugs of [['123456'], ['123456', '654321']]) {
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
