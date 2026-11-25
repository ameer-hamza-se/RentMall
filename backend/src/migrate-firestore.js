import { applicationDefault, deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import mongoose from 'mongoose';
import { accountProfiles, AccountProfile, validateProfile } from './accounts.js';
import { Listing } from './listings/listing-model.js';
import { configuredMongoUri } from './mongo-config.js';

let app;
let operation = 'checking configuration';
try {
  const uri = configuredMongoUri();
  if (!uri || !process.env.FIREBASE_PROJECT_ID) throw new Error('Missing configuration');
  const apply = process.argv.includes('--apply');
  app = initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID, credential: applicationDefault() });
  const firestore = getFirestore(app);
  operation = 'reading Firestore';
  const profiles = firestore.collection('rentmallProfiles');
  const ads = firestore.collection('rentmallAds');
  const [profileCount, adCount] = await Promise.all([profiles.count().get(), ads.count().get()]);
  console.log('Firestore records:', profileCount.data().count, 'profiles and', adCount.data().count, 'published ads.');
  if (!apply) {
    console.log('Preview only. Pass --apply to copy records to MongoDB.');
  } else {
    operation = 'connecting to MongoDB';
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    if (mongoose.connection.name !== 'rentmall') throw new Error('Unexpected target database');
    await Promise.all([Listing.init(), AccountProfile.init()]);
    operation = 'copying profiles';
    let copiedProfiles = 0;
    for await (const document of profiles.stream()) {
      const { name, firstName, lastName, phone, address, accountType, businessName, photo } = document.data();
      const { fields, error } = validateProfile({
        name, firstName, lastName, phone, address, accountType, businessName, ...(photo ? { photo } : {}),
      }, true);
      if (error) throw new Error('Invalid saved profile');
      const timestamps = { createdAt: document.createTime.toDate(), updatedAt: document.updateTime.toDate() };
      await accountProfiles.create(document.id, { ...fields, ...timestamps });
      copiedProfiles += 1;
    }
    operation = 'copying published ads';
    let copiedAds = 0;
    for await (const document of ads.stream()) {
      const { id: adId } = document;
      if (!/^[1-8]\d{5}$/.test(adId)) throw new Error('Invalid published ad ID');
      const { title, summary, keywords, category, city, area, priceMinor, rateUnit, ownerType,
        ownerUid, terms, available, imageCount, createdAt } = document.data();
      if (!ownerUid || city !== 'sahiwal' || !Number.isInteger(imageCount) || imageCount < 0 || imageCount > 5) {
        throw new Error('Invalid published ad');
      }
      const existing = await Listing.findOne({ slug: adId }).select('adId ownerUid').lean();
      if (existing) {
        if (existing.adId !== adId || existing.ownerUid !== ownerUid) throw new Error('Conflicting published ad ID');
      } else {
        const media = document.ref.collection('media');
        const photos = await Promise.all(Array.from({ length: imageCount }, (_, index) => media.doc(String(index)).get()));
        if (photos.some((photo) => !photo.exists || typeof photo.data().image !== 'string')) throw new Error('Missing listing photo');
        await Listing.create({
          slug: adId, adId, title, summary, keywords, category, city, area: area || 'Sahiwal',
          priceMinor, rateUnit, ownerType, ownerUid, terms, available, imageCount,
          images: photos.map((photo) => photo.data().image), status: 'published',
          createdAt: createdAt.toDate(), updatedAt: document.updateTime.toDate(),
        });
      }
      copiedAds += 1;
    }
    console.log('Verified in MongoDB:', copiedProfiles, 'profiles and', copiedAds, 'published ads.');
  }
} catch (error) {
  console.error('Migration stopped while', operation + ' (' + (error.code ?? error.name) + ').');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
  if (app) await deleteApp(app);
}
