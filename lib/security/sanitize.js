'use strict';

function sanitizeText(value) {
  if (typeof value !== 'string') return value;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

function sanitizeFields(obj, keys) {
  const out = { ...obj };
  for (const key of keys) {
    if (typeof out[key] === 'string') out[key] = sanitizeText(out[key]);
  }
  return out;
}

module.exports = { sanitizeText, sanitizeFields };
