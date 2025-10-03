import { MongoClient } from 'mongodb';

/**
 * MongoDB configuration
 */
const DB_USERNAME = 'NGabroad';
const DB_PASSWORD = 'Khashef2017';
const DB_HOST = '72.60.69.171';
const DB_PORT = 27017;
const DATABASE_NAME = 'NGabroad';
const COLLECTION_NAME = 'edvoy';

// Connection URI
const uri = `mongodb://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}`;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (!global._mongoClientPromise) {
  client = new MongoClient(uri, {
    connectTimeoutMS: 10000,
    socketTimeoutMS: 10000,
    maxPoolSize: 10,
    retryWrites: true,
  });
  global._mongoClientPromise = client.connect();
}

clientPromise = global._mongoClientPromise!;

export async function getDb(dbName = DATABASE_NAME) {
  const cli = await clientPromise;
  return cli.db(dbName);
}

export { COLLECTION_NAME };
