'use strict';

const path = require('path');
require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 8080,

  db: {
    driver: (() => {
      const value = (process.env.DB_DRIVER || 'file').toLowerCase();
      if (value === 'mongo') return 'mongo';
      if (value === 'memory') return 'memory';
      return 'file';
    })(),
    mongoUrl: process.env.MONGO_URL || '',
    dbName: process.env.MONGO_DB_NAME || 'makit',
  },

  redis: {
    url: process.env.REDIS_URL || '',
  },

  memory: {
    baseDir: process.env.MEMORY_BASE_DIR || path.join(process.cwd(), 'data', 'agent-memory'),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    tokenTtl: process.env.JWT_TTL || '30d',
    cookieName: 'makit_session',
  },

  crypto: {
    encryptionKey: process.env.ENCRYPTION_KEY || '',
  },

  scheduler: {
    tickIntervalCron: process.env.SCHEDULER_CRON || '* * * * *', // every minute
  },

  notify: {
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || 'Makit <no-reply@makit.app>',
    },
  },

  rateLimit: {
    authWindowMs: 15 * 60 * 1000,
    authMax: 20, // login/register attempts per window per IP
    webhookWindowMs: 60 * 1000,
    webhookMax: 60, // streamed data points per minute per task token
    apiWindowMs: 60 * 1000,
    apiMax: 120, // general authenticated API calls per minute per IP
  },
};

if (config.env === 'production') {
  const missing = [];
  if (config.db.driver === 'mongo' && !config.db.mongoUrl) missing.push('MONGO_URL');
  if (config.auth.jwtSecret === 'dev-secret-change-in-production') missing.push('JWT_SECRET');
  if (!config.crypto.encryptionKey) missing.push('ENCRYPTION_KEY');
  if (missing.length) {
    throw new Error(`Missing required environment variables for production: ${missing.join(', ')}`);
  }
}

module.exports = config;
