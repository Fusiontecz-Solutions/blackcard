/**
 * Quick Redis connection test. Run from backend root: node scripts/test-redis.js
 */
require('dotenv').config();
const Redis = require('ioredis');

const url = process.env.REDIS_URL;
if (!url || !url.trim()) {
  console.log('REDIS_URL is not set in .env – Redis check skipped.');
  process.exit(0);
}

const client = new Redis(url, {
  maxRetriesPerRequest: 2,
  connectTimeout: 10000,
  lazyConnect: true,
});

client
  .ping()
  .then((pong) => {
    console.log('Redis ping:', pong);
    console.log('Redis is working.');
    client.quit();
    process.exit(0);
  })
  .catch((err) => {
    console.error('Redis check failed:', err.message);
    client.quit().catch(() => {});
    process.exit(1);
  });
