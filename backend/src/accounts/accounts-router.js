import { Listing, publishNumberedAd } from '../listings/listing-model.js';
import { validateDetails } from '../../../shared/profile-details.js';
import express from 'express';
import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, immutable: true, unique: true },
  name: { type: String, required: true, maxlength: 121 },
  firstName: String,
  lastName: String,
  address: String,
  phone: String,
  photo: { type: String, maxlength: 200000 },
  favorites: { type: [String], default: [] },
  accountType: { type: String, required: true, enum: ['individual', 'business'] },
  businessName: { type: String, maxlength: 120, default: '' },
  role: { type: String, default: 'member', enum: ['member', 'admin'] },
}, { timestamps: true, bufferCommands: false });

export const AccountProfile = mongoose.model('AccountProfile', profileSchema);

const rentalRequestSchema = new mongoose.Schema({
  firebaseUid: { type: String, required: true, immutable: true },
  requestId: { type: String, required: true, immutable: true },
  listing: { type: String, required: true, immutable: true },
  startsAt: { type: Date, required: true, immutable: true },
  quantity: { type: Number, required: true, immutable: true },
}, { timestamps: true, bufferCommands: false });

rentalRequestSchema.index({ firebaseUid: 1, requestId: 1 }, { unique: true });
export const RentalRequest = mongoose.model('RentalRequest', rentalRequestSchema);

export const accountProfiles = {
  find: (firebaseUid) => AccountProfile.findOne({ firebaseUid }),
  async create(firebaseUid, fields) {
    try {
      return await AccountProfile.findOneAndUpdate(
        { firebaseUid }, { $setOnInsert: { ...fields, firebaseUid } },
        { upsert: true, new: true, runValidators: true, timestamps: false },
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      const existing = await this.find(firebaseUid);
      if (!existing) throw error;
      return existing;
    }
  },
  favorite: (firebaseUid, slug, saved) => AccountProfile.findOneAndUpdate(
    { firebaseUid }, saved ? { $addToSet: { favorites: slug } } : { $pull: { favorites: slug } },
    { new: true },
  ),
  importFavorites: (firebaseUid, slugs) => AccountProfile.findOneAndUpdate(
    { firebaseUid }, { $addToSet: { favorites: { $each: slugs } } }, { new: true },
  ),
  update: (firebaseUid, fields) => AccountProfile.findOneAndUpdate(
    { firebaseUid }, { $set: fields }, { new: true, runValidators: true },
  ),
};

export function validateProfile(body, creating = false) {
  const permitted = ['name', 'firstName', 'lastName', 'phone', 'address', 'accountType', 'businessName'];
  if (creating) permitted.push('photo');
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !permitted.includes(key))) {
    return { error: 'Unexpected profile field.' };
  }
  const details = validateDetails(body);
  if (details.error) return details;
  const businessName = typeof body.businessName === 'string' ? body.businessName.trim() : '';
  const accountType = body.accountType;
  if (!['individual', 'business'].includes(accountType)) return { error: 'Choose an account type.' };
  if (accountType === 'business' && (!businessName || businessName.length > 120)) {
    return { error: 'Enter a business name of 1 to 120 characters.' };
  }
  const { photo } = body;
  if (photo !== undefined && !validPhoto(photo)) return { error: 'Choose a valid profile photo.' };
  return { fields: { ...details.fields, accountType, businessName: accountType === 'business' ? businessName : '', ...(photo ? { photo } : {}) } };
}

function profileView(profile, identity) {
  if (!profile) return null;
  const { name, firstName, lastName, address, phone, photo, accountType, businessName } = profile;
  return { name, firstName, lastName, address, phone, photo, accountType, businessName, ...(profile.favorites?.length ? { favorites: profile.favorites } : {}), email: identity.email };
}

function validPhoto(photo) {
  return typeof photo === 'string' && photo.length <= 200000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(photo);
}

const rejectedTokenCodes = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
  'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found',
]);

export function createAccountsRouter({ verifyToken, profiles, isReady } = {}) {
  const router = express.Router();
  router.use(async (request, response, next) => {
    response.set('Cache-Control', 'no-store');
    if (!verifyToken || !profiles || !isReady()) {
      return response.status(503).json({ error: 'Account services are unavailable. Try again shortly.' });
    }
    const token = request.get('Authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
    if (!token) return response.status(401).json({ error: 'Sign in to continue.' });
    try {
      request.identity = await verifyToken(token);
    } catch (error) {
      if (rejectedTokenCodes.has(error.code)) {
        return response.status(401).json({ error: 'Your session is invalid or expired. Sign in again.' });
      }
      console.error('Firebase token verification unavailable', error.code ?? error.name);
      return response.status(503).json({ error: 'Account services are unavailable. Try again shortly.' });
    }
    next();
  });

  router.get('/me/ads', async (request, response) => {
    const items = await Listing.find({ ownerUid: request.identity.uid }).select('-_id -__v').sort({ createdAt: 1 }).lean();
    response.json({ items });
  });

  router.put('/me/ads/:slug', express.json({ limit: '5mb', inflate: false }), async (request, response) => {
    const { slug } = request.params;
    if (!/^(?:ad|demo)-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(slug)) return response.status(400).json({ error: 'Invalid ad ID.' });
    if (!await profiles.find(request.identity.uid)) return response.status(403).json({ error: 'Complete your profile first.' });
    const { title, category, area, priceMinor, rateUnit, summary, keywords, terms, images = [], ownerType } = request.body ?? {};
    const textFields = [[title, 100], [summary, 2000], [area ?? '', 80], [terms, 400]];
    if (textFields.some(([value, limit]) => typeof value !== 'string' || value.length > limit)
      || !Number.isSafeInteger(priceMinor) || priceMinor <= 0 || priceMinor > 999999900
      || !Array.isArray(images) || images.length > 5 || images.some((image) => typeof image !== 'string')
      || (keywords !== undefined && (!Array.isArray(keywords) || keywords.some((keyword) => typeof keyword !== 'string')))) {
      return response.status(400).json({ error: 'Check the ad details and images.' });
    }
    const ad = new Listing({ slug, ownerUid: request.identity.uid, title, category, area: area || 'Sahiwal', priceMinor, rateUnit,
      summary, keywords, terms, images, imageCount: Array.isArray(images) ? images.length : 0, ownerType, city: 'sahiwal', status: 'published' });
    try {
      await ad.validate();
      const saved = await publishNumberedAd(ad);
      response.json({ adId: saved.adId });
    } catch (error) {
      if (error.name === 'ValidationError') return response.status(400).json({ error: 'Check the ad details and images.' });
      if (error.code === 11000) return response.status(409).json({ error: 'Ad ID already exists.' });
      throw error;
    }
  });

  router.patch('/me/ads/:slug', express.json({ limit: '2kb', inflate: false }), async (request, response) => {
    if (typeof request.body?.available !== 'boolean') return response.status(400).json({ error: 'Choose an availability status.' });
    const result = await Listing.updateOne({ slug: request.params.slug, ownerUid: request.identity.uid }, { $set: { available: request.body.available } });
    response.sendStatus(result.matchedCount ? 204 : 404);
  });

  router.delete('/me/ads/:slug', async (request, response) => {
    await Listing.deleteOne({ slug: request.params.slug, ownerUid: request.identity.uid });
    response.sendStatus(204);
  });

  router.put('/me/requests/:id', express.json({ limit: '2kb', inflate: false }), async (request, response) => {
    const { id: requestId } = request.params;
    const { listing, startsAt, quantity } = request.body ?? {};
    const date = typeof startsAt === 'string' ? new Date(startsAt) : null;
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(requestId)
      || typeof listing !== 'string' || !/^[a-z0-9-]{1,180}$/.test(listing)
      || !date || !Number.isFinite(date.getTime()) || !Number.isInteger(quantity) || quantity < 1 || quantity > 365) {
      return response.status(400).json({ error: 'Check the rental request details.' });
    }
    const firebaseUid = request.identity.uid;
    if (!await profiles.find(firebaseUid)) return response.status(403).json({ error: 'Complete your profile first.' });
    const key = { firebaseUid, requestId };
    let saved = await RentalRequest.findOne(key).lean();
    if (!saved) {
      if (date.getTime() <= Date.now()) return response.status(400).json({ error: 'Choose a start time in the future.' });
      if (!await Listing.exists({ slug: listing, city: 'sahiwal', status: 'published', available: { $ne: false } })) {
        return response.status(404).json({ error: 'This listing is unavailable.' });
      }
      saved = await RentalRequest.findOneAndUpdate(key, {
        $setOnInsert: { ...key, listing, startsAt: date, quantity },
      }, { new: true, upsert: true });
    }
    if (saved.listing !== listing || saved.startsAt.getTime() !== date.getTime() || saved.quantity !== quantity) {
      return response.status(409).json({ error: 'This rental request has already been saved.' });
    }
    response.sendStatus(204);
  });

  router.get('/me', async (request, response) => {
    const profile = await profiles.find(request.identity.uid);
    response.json({ profile: profileView(profile, request.identity) });
  });

  router.put('/me', express.json({ limit: '210kb', inflate: false }), async (request, response) => {
    const { fields, error } = validateProfile(request.body, true);
    if (error) return response.status(400).json({ error });
    const profile = await profiles.create(request.identity.uid, {
      ...fields, createdAt: new Date(), updatedAt: new Date(),
    });
    response.json({ profile: profileView(profile, request.identity) });
  });

  router.patch('/me', express.json({ limit: '8kb', inflate: false }), async (request, response) => {
    const { fields, error } = validateProfile(request.body);
    if (error) return response.status(400).json({ error });
    const profile = await profiles.update(request.identity.uid, fields);
    if (!profile) return response.status(404).json({ error: 'Complete your profile first.' });
    response.json({ profile: profileView(profile, request.identity) });
  });

  async function setFavorite(request, response) {
    const { slug } = request.params;
    if (!/^[a-z0-9-]{1,180}$/.test(slug)) return response.status(400).json({ error: 'Invalid ad ID.' });
    const profile = await profiles.favorite(request.identity.uid, slug, request.method === 'PUT');
    if (!profile) return response.status(404).json({ error: 'Complete your profile first.' });
    response.json({ profile: profileView(profile, request.identity) });
  }
  router.post('/me/favorites/import', express.json({ limit: '40kb', inflate: false }), async (request, response) => {
    const { slugs } = request.body ?? {};
    if (!Array.isArray(slugs) || !slugs.length || slugs.length > 200
      || slugs.some((slug) => typeof slug !== 'string' || !/^[a-z0-9-]{1,180}$/.test(slug))) {
      return response.status(400).json({ error: 'Check the saved listings.' });
    }
    const profile = await profiles.importFavorites(request.identity.uid, slugs);
    if (!profile) return response.status(404).json({ error: 'Complete your profile first.' });
    response.json({ profile: profileView(profile, request.identity) });
  });
  router.put('/me/favorites/:slug', setFavorite);
  router.delete('/me/favorites/:slug', setFavorite);

  router.patch('/me/photo', express.json({ limit: '210kb', inflate: false }), async (request, response) => {
    const { photo } = request.body ?? {};
    if (!validPhoto(photo)) {
      return response.status(400).json({ error: 'Choose a valid profile photo.' });
    }
    const profile = await profiles.update(request.identity.uid, { photo });
    if (!profile) return response.status(404).json({ error: 'Complete your profile first.' });
    response.json({ profile: profileView(profile, request.identity) });
  });

  return router;
}
