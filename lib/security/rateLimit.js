'use strict';

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const config = require('../config');
const { getRedis } = require('../cache/redis');

function redisStore(prefix) {
  const redis = getRedis();
  if (!redis) return undefined;
  const { RedisStore } = require('rate-limit-redis');
  return new RedisStore({
    prefix,
    sendCommand: (...args) => redis.call(...args),
  });
}

const authLimiter = rateLimit({
  windowMs: config.rateLimit.authWindowMs,
  max: config.rateLimit.authMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
  store: redisStore('rl:auth:'),
});

const webhookLimiter = rateLimit({
  windowMs: config.rateLimit.webhookWindowMs,
  max: config.rateLimit.webhookMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.params.token || ipKeyGenerator(req.ip),
  message: { error: 'Too many requests for this webhook. Please slow down.' },
  store: redisStore('rl:webhook:'),
});

const apiLimiter = rateLimit({
  windowMs: config.rateLimit.apiWindowMs,
  max: config.rateLimit.apiMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  store: redisStore('rl:api:'),
});

module.exports = { authLimiter, webhookLimiter, apiLimiter };
