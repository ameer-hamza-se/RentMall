import mongoose from 'mongoose';
import { configuredMongoUri } from '../src/config/mongo-config.js';

let uri;
try {
  uri = configuredMongoUri();
  if (!uri) throw new Error('Set MONGODB_URI in backend/.env to check the Atlas connection.');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  await mongoose.connection.db.command({ ping: 1 });
  console.log('MongoDB connected. Database: ' + mongoose.connection.name);
} catch (error) {
  console.error('MongoDB connection failed (' + error.name + '). Check the connection string, database user and Atlas IP access list.');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
