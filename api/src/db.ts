import { MongoClient, Db } from 'mongodb';
import Redis from 'redis';
import { logger } from '.';

let db: Db;

export default async function buildDBClient(): Promise<Db> {
    if (db) return db;
    const url = getDBUrl();
    const client = new MongoClient(url);
    try {
        await client.connect();
        db = client.db();
        logger.info('Connected successfully to MongoDB');
        return db;
    } catch (error) {
        logger.error('Failed to connect to MongoDB', error);
        throw error;
    }
}

const redis = Redis.createClient({ url: process.env.REDIS_URL });

export { redis };

// Checks if all required env vars were supplied, and returns the mongo db URL
function getDBUrl(): string {
    const env = process.env;
    if (env['DB_URL']) return env['DB_URL'];
    
    if (!env['DB_HOST']) {
        logger.error(`Environment variable 'DB_HOST' not set, unable to connect to database`);
        logger.error(`Specify either 'DB_URL' or 'DB_HOST', 'DB_USERNAME', 'DB_PASS' and 'DB_NAME'`);
        throw new Error('Missing environment variables');
    }

    // mongodb://username:password@hostname:port/dbname
    let dburl = 'mongodb://';
    if (env['DB_USERNAME']) dburl += env['DB_USERNAME'];
    if (env['DB_PASS']) dburl += `:${env['DB_PASS']}`;
    dburl += `${env['DB_USERNAME'] ? '@' : ''}${env['DB_HOST']}`; // DB_HOST is assumed to contain the port
    dburl += `/${env['DB_NAME'] ?? 'automod'}`;
    return dburl;
}
