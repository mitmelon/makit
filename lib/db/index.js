'use strict';

const config = require('../config');
const { createMemoryStore } = require('./memory');
const { createMongoStore } = require('./mongo');
const { createFileStore } = require('./file');

let instancePromise = null;

/**
 * Returns the singleton store for the process. Resolved once, lazily,
 * since the Mongo adapter needs an async connect().
 */
function getStore() {
  if (!instancePromise) {
    if (config.db.driver === 'mongo') {
      instancePromise = createMongoStore();
    } else if (config.db.driver === 'memory') {
      instancePromise = Promise.resolve(createMemoryStore());
    } else {
      instancePromise = Promise.resolve(createFileStore());
    }
  }
  return instancePromise;
}

module.exports = { getStore };
