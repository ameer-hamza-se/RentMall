export const maxListingKeywords = 5;
export const maxKeywordLength = 40;
export const listingSorts = [
  { value: '', label: 'Oldest first' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
];
export const searchableFields = ['title', 'area', 'city', 'summary', 'keywords'];
export const relatedSearchFields = ['title', 'keywords'];
const commonSearchWords = new Set(['a', 'an', 'for', 'in', 'rent', 'rental', 'rentals', 'the', 'to']);

const categoryTerms = {
  vehicles: ['vehicle', 'transport'],
  'sports-grounds': ['sport', 'ground', 'facility'],
  rooms: ['room', 'accommodation', 'lodging', 'stay'],
  wearables: ['wearable', 'clothing', 'clothes', 'outfit', 'garment'],
  events: ['event'],
  tools: ['tool', 'toolkit'],
};

const relatedTerms = {
  car: ['vehicles', 'auto', 'automobile', 'hatchback', 'sedan', 'saloon', 'suv', 'crossover', 'coupe', 'wagon', 'minivan', 'pickup', 'corolla', 'civic', 'mehran', 'cultus', 'alto', 'swift', 'vitz', 'sportage'],
  automobile: ['vehicles', 'car', 'hatchback', 'sedan', 'suv', 'crossover', 'coupe', 'wagon', 'minivan', 'pickup'],
  sedan: ['vehicles', 'saloon'],
  bike: ['vehicles', 'bicycle', 'motorcycle', 'motorbike', 'scooter'],
  motorcycle: ['vehicles', 'motorbike'],
  motorbike: ['vehicles', 'motorcycle'],
  football: ['sports-grounds', 'soccer', 'futsal'],
  soccer: ['sports-grounds', 'football', 'futsal'],
  apartment: ['rooms', 'flat', 'studio'],
  dress: ['wearables', 'gown'],
  jewellery: ['wearables', 'jewelry'],
  jewelry: ['wearables', 'jewellery'],
  party: ['events', 'birthday', 'celebration'],
  wedding: ['events', 'marquee', 'bridal', 'groom', 'baraat', 'mehndi'],
};

function wordPattern(words) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])(?:${words.join('|')})(?:s|es)?(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

export function listingSearchCriteria(query) {
  const words = (query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((word) => !commonSearchWords.has(word));
  return [...new Set(words)].map((word) => {
    const singular = word.replace(/s$/, '');
    const matchingCategories = Object.keys(categoryTerms).filter((category) => (
      categoryTerms[category].includes(word) || categoryTerms[category].includes(singular)
    ));
    const relatedKey = Object.hasOwn(relatedTerms, word) ? word : singular;
    const [relatedCategory, ...aliases] = Object.hasOwn(relatedTerms, relatedKey) ? relatedTerms[relatedKey] : [];
    return {
      pattern: wordPattern([...new Set([word, singular])].filter(Boolean)),
      matchingCategories,
      relatedCategory,
      relatedPattern: aliases.length ? wordPattern(aliases) : null,
    };
  });
}

function matchesFields(listing, fields, pattern) {
  return fields.some((field) => (
    [listing[field]].flat().some((value) => typeof value === 'string' && pattern.test(value))
  ));
}

export function matchesListingSearch(listing, criteria) {
  return criteria.every(({ pattern, matchingCategories, relatedCategory, relatedPattern }) => (
    matchingCategories.includes(listing.category)
    || matchesFields(listing, searchableFields, pattern)
    || (listing.category === relatedCategory && matchesFields(listing, relatedSearchFields, relatedPattern))
  ));
}

export function sortListings(listings, sort) {
  return listings.toSorted((left, right) => {
    const price = left.priceMinor - right.priceMinor;
    if (sort === 'price-asc' && price) return price;
    if (sort === 'price-desc' && price) return -price;
    return (new Date(left.createdAt).getTime() || 0) - (new Date(right.createdAt).getTime() || 0);
  });
}
