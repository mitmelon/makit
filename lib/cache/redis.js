'use strict';

const config = require('../config');

let client = null;
let attempted = false;

/**
 * Returns the shared Redis connection, or null if REDIS_URL isn't
 * configured. Every caller of this module treats a null client as
 * "caching/rate-limiting disabled" rather than an error — Redis is an
 * optimization here (search-result cache, distributed rate limiting),
 * not a hard dependency the app refuses to boot without.
 */
function getRedis() {
  if (attempted) return client;
  attempted = true;

  if (!config.redis.url) return null;

  const Redis = require('ioredis');
  client = new Redis(config.redis.url, {
    maxRetriesPerRequest: 2,
    lazyConnect: false,
  });
  client.on('error', (err) => {
    console.error('Redis connection error:', err.message);
  });
  return client;
}

/**
 * Fetches a cached JSON value by key, or null on a miss or when Redis
 * isn't configured. Never throws — a cache failure should degrade to
 * "do the work again", not break the caller.
 */
async function cacheGet(key) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Stores a JSON-serializable value with a TTL in seconds. Silently
 * no-ops on failure or when Redis isn't configured, for the same
 * reason as cacheGet.
 */
async function cacheSet(key, value, ttlSeconds) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // best-effort — a failed cache write shouldn't fail the request
  }
}

module.exports = { getRedis, cacheGet, cacheSet };
