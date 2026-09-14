'use strict';

const { sendDigestEmail } = require('./email');
const { sendDigestTelegram } = require('./telegram');

async function notifyChannels(task, run) {
  const results = await Promise.allSettled([sendDigestEmail(task, run), sendDigestTelegram(task, run)]);
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);
  if (errors.length) {
    console.error(`Notification errors for task ${task.id}:`, errors);
  }
}

module.exports = { notifyChannels };
