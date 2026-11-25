import { Router } from 'express';
import { Listing } from './listing-model.js';
import { rateUnits } from '../../../shared/catalog.js';
import { listingSearchCriteria, listingSorts, matchesListingSearch, relatedSearchFields, searchableFields, sortListings } from '../../../shared/listing-discovery.js';

const publicListing = { status: 'published', city: 'sahiwal', ownerUid: { $type: 'string', $ne: '' } };
const publicFields = 'slug adId title category city area priceMinor rateUnit summary keywords terms photoUrl imageCount available ownerType createdAt -_id';

function readFilters(query) {
  const { q = '', city = '', category = '', rateUnit = '', sort = '', maxPrice = '', page = '1', limit = '12' } = query;
  const textFields = [q, city, category, rateUnit];

  if (textFields.some((value) => typeof value !== 'string' || value.length > 80)) return null;
  if (rateUnit && !rateUnits.includes(rateUnit)) return null;
  if (!listingSorts.some(({ value }) => value === sort)) return null;
  if (typeof page !== 'string' || !/^[1-9]\d{0,3}$/.test(page)) return null;
  if (typeof limit !== 'string' || !/^[1-9]\d?$/.test(limit) || Number(limit) > 60) return null;
  if (maxPrice && (!rateUnit || typeof maxPrice !== 'string' || !/^\d{1,8}$/.test(maxPrice))) return null;

  return {
    search: listingSearchCriteria(q),
    city: city.trim().toLowerCase(),
    category,
    rateUnit,
    sort,
    maxPriceMinor: maxPrice === '' ? null : Number(maxPrice) * 100,
    page: Number(page),
    pageSize: Number(limit),
  };
}

async function discoverListings(filters, useDatabase, fallbackListings) {
  const { search, city, category, rateUnit, maxPriceMinor, sort, page, pageSize } = filters;
  const offset = (page - 1) * pageSize;
  if (city && city !== 'sahiwal') return { items: [], total: 0 };

  if (!useDatabase) {
    const matches = fallbackListings.filter((listing) => (
      listing.city === 'sahiwal'
      && (!category || listing.category === category)
      && (!rateUnit || listing.rateUnit === rateUnit)
      && (maxPriceMinor === null || listing.priceMinor <= maxPriceMinor)
      && matchesListingSearch(listing, search)
    ));

    return { items: sortListings(matches, sort).slice(offset, offset + pageSize), total: matches.length };
  }

  const filter = { ...publicListing };
  if (category) filter.category = category;
  if (rateUnit) filter.rateUnit = rateUnit;
  if (maxPriceMinor !== null) filter.priceMinor = { $lte: maxPriceMinor };
  if (search.length) {
    filter.$and = search.map(({ pattern, matchingCategories, relatedCategory, relatedPattern }) => {
      const matches = searchableFields.map((field) => ({ [field]: pattern }));
      if (matchingCategories.length) matches.push({ category: { $in: matchingCategories } });
      if (relatedPattern) {
        matches.push({
          category: relatedCategory,
          $or: relatedSearchFields.map((field) => ({ [field]: relatedPattern })),
        });
      }
      return { $or: matches };
    });
  }

  const postingOrder = { createdAt: 1, slug: 1 };
  const order = sort ? { priceMinor: sort === 'price-asc' ? 1 : -1, ...postingOrder } : postingOrder;
  const [items, total] = await Promise.all([
    Listing.find(filter).select(publicFields).sort(order).skip(offset).limit(pageSize).lean(),
    Listing.countDocuments(filter),
  ]);

  return { items, total };
}

export function createListingsRouter({ useDatabase, fallbackListings }) {
  const router = Router();

  router.get('/', async (request, response) => {
    const filters = readFilters(request.query);
    if (!filters) return response.status(400).json({ error: 'Check the listing filters and try again.' });

    const results = await discoverListings(filters, useDatabase, fallbackListings);
    response.json({ ...results, page: filters.page, pageSize: filters.pageSize });
  });

  router.get('/:slug/photos/:index', async (request, response) => {
    const { slug, index } = request.params;
    if (!/^[0-4]$/.test(index) || !useDatabase) return response.sendStatus(404);
    const item = await Listing.findOne({ ...publicListing, slug }, { images: { $slice: [Number(index), 1] } }).schemaLevelProjections(false).lean();
    if (!item?.images?.[0]) return response.sendStatus(404);
    response.set('Cross-Origin-Resource-Policy', 'cross-origin').type('jpeg').send(Buffer.from(item.images[0].split(',')[1], 'base64'));
  });

  router.get('/:slug', async (request, response) => {
    const { slug } = request.params;
    const item = !useDatabase
      ? fallbackListings.find((listing) => listing.slug === slug)
      : await Listing.findOne({ ...publicListing, slug }).select(publicFields).lean();

    if (!item) return response.status(404).json({ error: 'Listing not found.' });
    response.json({ item });
  });

  return router;
}
