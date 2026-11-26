import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { categories, maxIndividualAdsPerCategory, rateUnits } from '../../../shared/catalog.js';
import { maxKeywordLength, maxListingKeywords } from '../../../shared/listing-discovery.js';

export const publishedSahiwal = { status: 'published', city: 'sahiwal' };

const listingSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  adId: { type: String, unique: true, sparse: true, match: /^[1-8]\d{5}$/ },
  title: { type: String, required: true },
  category: { type: String, required: true, enum: categories.map(({ id }) => id) },
  city: { type: String, required: true, lowercase: true, trim: true },
  area: { type: String, required: true },
  priceMinor: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  rateUnit: { type: String, required: true, enum: rateUnits },
  summary: { type: String, required: true },
  keywords: {
    type: [{ type: String, trim: true, lowercase: true, maxlength: maxKeywordLength }],
    validate: (keywords) => keywords.length <= maxListingKeywords,
  },
  terms: { type: String, required: true },
  photoUrl: String,
  ownerUid: { type: String, immutable: true, index: true },
  available: { type: Boolean, default: true },
  images: {
    type: [String], select: false,
    validate: (images) => images.length <= 5 && images.every((image) =>
      image.length <= 900000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(image)),
  },
  imageCount: { type: Number, default: 0 },
  ownerType: { type: String, enum: ['individual', 'business'] },
  status: { type: String, required: true, enum: ['draft', 'published', 'paused'], default: 'draft' },
}, { timestamps: true, bufferCommands: false });

listingSchema.index({ status: 1, city: 1, category: 1, rateUnit: 1, priceMinor: 1 });

export const Listing = mongoose.model('Listing', listingSchema);

async function allocateAdNumber(save) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const adId = String(randomInt(100000, 900000));
    try {
      return await save(adId);
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.adId) throw error;
    }
  }
  throw new Error('Could not assign an ad ID.');
}

export class IndividualAdLimitError extends Error {}

export async function requireIndividualAdSlot({ ownerUid, category }, session) {
  const count = await Listing.countDocuments({ ownerUid, category, ownerType: { $ne: 'business' } }).session(session);
  if (count >= maxIndividualAdsPerCategory) throw new IndividualAdLimitError();
}

export function publishNumberedAd(ad, writeAds) {
  const key = { slug: ad.slug, ownerUid: ad.ownerUid };
  return allocateAdNumber((adId) => writeAds(async (session) => {
    const existing = await Listing.findOne(key, 'adId', { session }).lean();
    if (existing) return existing;
    if (ad.ownerType !== 'business') await requireIndividualAdSlot(ad, session);
    return Listing.findOneAndUpdate(
      key, { $setOnInsert: { ...ad.toObject(), adId } }, { upsert: true, new: true, session },
    );
  }));
}

export function ensureAdNumber(listing) {
  return allocateAdNumber((adId) => Listing.updateOne(
    { _id: listing._id, adId: { $exists: false } },
    { $set: { adId } },
    { runValidators: true },
  ));
}
