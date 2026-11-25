export function configuredMongoUri(value = process.env.MONGODB_URI) {
  const uri = value?.trim();
  if (uri?.includes('<db_password>')) {
    throw new Error('Replace <db_password> in backend/.env with your MongoDB database user password.');
  }
  return uri;
}
