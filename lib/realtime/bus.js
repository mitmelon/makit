'use strict';

const { EventEmitter } = require('events');
const { getRedis } = require('../cache/redis');

const CHANNEL = 'makit:events';
const localBus = new EventEmitter();
localBus.setMaxListeners(0);

let subClient = null;
let subscribed = false;

async function publish(userId, event, payload) {
  const message = JSON.stringify({ userId, event, payload });
  const redis = getRedis();
  if (redis) {
    try {
      await redis.publish(CHANNEL, message);
      return;
    } catch {
      // fall through to local emit so at least same-process listeners still get it
    }
  }
  localBus.emit('message', { userId, event, payload });
}

function subscribe(onMessage) {
  const redis = getRedis();
  if (redis && !subscribed) {
    subscribed = true;
    subClient = redis.duplicate();
    subClient.subscribe(CHANNEL).catch((err) => {
      console.error('Realtime: failed to subscribe to Redis channel:', err.message);
    });
    subClient.on('message', (_channel, raw) => {
      try {
        const parsed = JSON.parse(raw);
        localBus.emit('message', parsed);
      } catch {
        // ignore malformed messages
      }
    });
  }

  localBus.on('message', onMessage);
  return () => localBus.off('message', onMessage);
}

module.exports = { publish, subscribe };
