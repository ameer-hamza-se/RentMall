import mongoose from 'mongoose';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Listing, ensureAdNumber } from './listings/listing-model.js';
import { createApp } from './app.js';
import { accountProfiles, AccountProfile, RentalRequest } from './accounts/accounts-router.js';
import { configuredMongoUri } from './config/mongo-config.js';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 4000);
let mongoUri;
try {
  mongoUri = configuredMongoUri();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const firebaseProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be an integer between 1 and 65535.');
  process.exit(1);
}

if (mongoUri) {
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    await Listing.init();
    for await (const ad of Listing.find({ ownerUid: { $exists: true }, adId: { $exists: false } }).select('adId').cursor()) {
      await ensureAdNumber(ad);
    }
  } catch (error) {
    console.error(`MongoDB connection failed (${error.name}). Check MONGODB_URI and network access.`);
    process.exit(1);
  }
}

function getDatabaseStatus() {
  if (!mongoUri) return 'not_configured';
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
}

let accounts;
if (mongoUri && firebaseProjectId) {
  const firebase = getAuth(initializeApp({ projectId: firebaseProjectId, credential: applicationDefault() }));
  await Promise.all([AccountProfile.init(), RentalRequest.init()]);
  accounts = {
    profiles: accountProfiles,
    verifyToken: (token) => firebase.verifyIdToken(token, true),
    isReady: () => getDatabaseStatus() === 'connected',
  };
}

const app = createApp({ allowedOrigins, getDatabaseStatus, useDatabase: Boolean(mongoUri), accounts });

app.listen(port, host, () => {
  console.log(`RentMall API listening at http://${host}:${port}`);
}).on('error', (error) => {
  console.error(`Unable to listen on ${host}:${port} (${error.code || error.name}).`);
  process.exit(1);
});
