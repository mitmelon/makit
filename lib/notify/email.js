'use strict';

const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!config.notify.smtp.host) return null;
  transporter = nodemailer.createTransport({
    host: config.notify.smtp.host,
    port: config.notify.smtp.port,
    secure: config.notify.smtp.port === 465,
    auth: { user: config.notify.smtp.user, pass: config.notify.smtp.pass },
  });
  return transporter;
}

function digestToEmailBody(task, run) {
  const d = run.digest;
  const statusLabel = { good: 'Good day to sell', caution: 'Mixed conditions', slow: 'Slow day expected' }[d.status] || d.status;
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 560px; margin: 0 auto; color: #1d1d1f;">
      <p style="font-size: 13px; color: #6e6e73; margin-bottom: 4px;">${task.businessName} &middot; today's digest</p>
      <h2 style="font-size: 20px; margin: 0 0 12px;">${statusLabel}</h2>
      <p style="font-size: 15px; line-height: 1.5;">${d.headline}</p>
      <ul style="font-size: 14px; color: #444; line-height: 1.6;">
        ${d.whats_happening.map((s) => `<li>${s}</li>`).join('')}
      </ul>
      <p style="font-size: 15px; font-weight: 600; margin-top: 16px;">What to do today</p>
      <p style="font-size: 14px; line-height: 1.5;">${d.what_to_do}</p>
    </div>
  `;
}

async function sendDigestEmail(task, run) {
  if (!task.notify?.email?.enabled || !task.notify.email.address) return;
  const t = getTransporter();
  if (!t) throw new Error('SMTP is not configured on this server');

  await t.sendMail({
    from: config.notify.smtp.from,
    to: task.notify.email.address,
    subject: `${task.businessName} — today's market digest`,
    html: digestToEmailBody(task, run),
  });
}

module.exports = { sendDigestEmail };
