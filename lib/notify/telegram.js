'use strict';

async function sendDigestTelegram(task, run) {
  if (!task.notify?.telegram?.enabled) return;
  const { botToken, chatId } = task.notify.telegram;
  if (!botToken || !chatId) return;

  const d = run.digest;
  const statusEmoji = { good: '🟢', caution: '🟡', slow: '🔴' }[d.status] || '⚪️';
  const lines = [
    `${statusEmoji} *${task.businessName}* — today's digest`,
    '',
    d.headline,
    '',
    ...d.whats_happening.map((s) => `• ${s}`),
    '',
    `*What to do today:* ${d.what_to_do}`,
  ];

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: lines.join('\n'),
      parse_mode: 'Markdown',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Telegram send failed (${res.status}): ${body.slice(0, 200)}`);
  }
}

module.exports = { sendDigestTelegram };
