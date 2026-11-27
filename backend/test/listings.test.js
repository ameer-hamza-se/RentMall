import assert from 'node:assert/strict';
import { once } from 'node:events';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { Listing } from '../src/listings/listing-model.js';

const testListings = [
  { slug: 'test-hatchback', title: 'Compact hatchback', category: 'vehicles', rateUnit: 'day', priceMinor: 550000, area: 'Farid Town' },
  { slug: 'test-sedan', title: 'Automatic sedan', category: 'vehicles', rateUnit: 'day', priceMinor: 720000 },
  { slug: 'test-suv', title: 'Family SUV', category: 'vehicles', rateUnit: 'day', priceMinor: 430000 },
  { slug: 'test-scooter', title: 'Electric scooter', category: 'vehicles', rateUnit: 'day', priceMinor: 160000 },
  { slug: 'test-ground', title: 'Sports ground', category: 'sports-grounds', rateUnit: 'hour', priceMinor: 150000 },
  { slug: 'test-room', title: 'Private room', category: 'rooms', rateUnit: 'month', priceMinor: 4200000 },
  { slug: 'test-wearable', title: 'Formal suit', category: 'wearables', rateUnit: 'day', priceMinor: 200000 },
  { slug: 'test-event', title: 'Event space', category: 'events', rateUnit: 'day', priceMinor: 3000000 },
  { slug: 'test-tool', title: 'Electric drill', category: 'tools', rateUnit: 'day', priceMinor: 80000 },
].map((listing) => ({ city: 'sahiwal', ...listing }));

let server;
let catalog;

before(async () => {
  server = createApp({ allowedOrigins: [], getDatabaseStatus: () => 'not_configured', fallbackListings: testListings }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  catalog = `http://127.0.0.1:${server.address().port}/api/v1/listings`;
});

after(async () => {
  if (server?.listening) {
    server.close();
    await once(server, 'close');
  }
});

test('a maximum price requires a rate unit and excludes listings charged by other units', async () => {
  const missingUnit = await fetch(`${catalog}?maxPrice=6000`);
  assert.equal(missingUnit.status, 400);
  await missingUnit.json();

  const response = await fetch(`${catalog}?rateUnit=day&maxPrice=6000&limit=60`);
  assert.equal(response.status, 200);
  const { items } = await response.json();
  assert.ok(items.some((item) => item.slug === 'test-hatchback'));
  assert.ok(items.every((item) => item.rateUnit === 'day' && item.priceMinor <= 600000));
});

test('public catalog filters by city and category and exposes a stable detail URL', async () => {
  const response = await fetch(`${catalog}?city=Sahiwal&category=vehicles&q=Compact`);
  assert.equal(response.status, 200);
  const { items, total } = await response.json();
  assert.equal(total, 1);

  const detail = await fetch(`${catalog}/${items[0].slug}`);
  assert.equal(detail.status, 200);
  assert.deepEqual((await detail.json()).item, items[0]);

  const missing = await fetch(`${catalog}/missing-listing`);
  assert.equal(missing.status, 404);
  await missing.json();
});

test('catalog test fixtures cover six categories and upcoming cities have no listings', async () => {
  const response = await fetch(`${catalog}?city=sahiwal&limit=60`);
  assert.equal(response.status, 200);
  const { items, total } = await response.json();
  assert.equal(total, testListings.length);
  assert.equal(new Set(items.map(({ category }) => category)).size, 6);

  for (const city of ['lahore', 'faisalabad']) {
    const pending = await fetch(`${catalog}?city=${city}`);
    assert.deepEqual((await pending.json()).items, []);
  }
});

test('car searches include vehicle types and preserve posting order unless price sorting is requested', async () => {
  const { items } = await (await fetch(`${catalog}?q=cars`)).json();
  assert.deepEqual(items.map(({ slug }) => slug), ['test-hatchback', 'test-sedan', 'test-suv']);

  for (const [sort, priceDifference] of [['price-asc', 1], ['price-desc', -1]]) {
    const { items: sorted } = await (await fetch(`${catalog}?q=car&sort=${sort}&limit=3`)).json();
    const prices = items.map(({ priceMinor }) => priceMinor).sort((a, b) => (a - b) * priceDifference);
    assert.deepEqual(sorted.map(({ priceMinor }) => priceMinor), prices.slice(0, 3));
  }

  const { items: nearby } = await (await fetch(`${catalog}?q=car+farid+town`)).json();
  assert.deepEqual(nearby.map(({ slug }) => slug), ['test-hatchback']);
});

test('the normal unconfigured API exposes zero ads and no former demo detail', async () => {
  const blank = createApp({ allowedOrigins: [], getDatabaseStatus: () => 'not_configured' }).listen(0, '127.0.0.1');
  await once(blank, 'listening');
  const url = 'http://127.0.0.1:' + blank.address().port + '/api/v1/listings';
  try {
    const response = await fetch(url + '?city=sahiwal&limit=60');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { items: [], total: 0, page: 1, pageSize: 60 });
    const removed = await fetch(url + '/compact-hatchback');
    assert.equal(removed.status, 404);
    await removed.json();
  } finally {
    blank.close();
    await once(blank, 'close');
  }
});

test('the API reports brief database failures and recovers without changing the listing route', async (context) => {
  let database = 'disconnected';
  let queryFailed = true;
  const regressionServer = createApp({
    allowedOrigins: [], getDatabaseStatus: () => database, useDatabase: true, revision: 'test123',
  }).listen(0, '127.0.0.1');
  await once(regressionServer, 'listening');
  context.after(() => new Promise((resolve) => regressionServer.close(resolve)));
  const api = 'http://127.0.0.1:' + regressionServer.address().port + '/api/v1';

  context.mock.method(Listing, 'findOne', () => ({
    select: () => ({
      lean: async () => {
        if (queryFailed) throw Object.assign(new Error('Database connection interrupted'), { name: 'MongoNetworkError' });
        return testListings[0];
      },
    }),
  }));

  const initialHealth = await fetch(api + '/health');
  assert.equal(initialHealth.status, 503);
  assert.deepEqual(await initialHealth.json(), { status: 'unavailable', database: 'disconnected', revision: 'test123' });

  const itemUrl = api + '/listings/' + testListings[0].slug;
  const disconnected = await fetch(itemUrl);
  assert.equal(disconnected.status, 503);
  assert.equal(disconnected.headers.get('Retry-After'), '2');
  await disconnected.json();

  database = 'connected';
  const interrupted = await fetch(itemUrl);
  assert.equal(interrupted.status, 503);
  await interrupted.json();

  queryFailed = false;
  const recoveredHealth = await fetch(api + '/health');
  assert.equal(recoveredHealth.status, 200);
  assert.deepEqual(await recoveredHealth.json(), { status: 'ok', database: 'connected', revision: 'test123' });
  const recovered = await fetch(itemUrl);
  assert.equal(recovered.status, 200);
  assert.deepEqual((await recovered.json()).item, testListings[0]);
});
