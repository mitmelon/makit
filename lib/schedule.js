'use strict';

function computeNextRunAt(schedule, from = new Date()) {
  if (schedule.type === 'interval') {
    const minutes = Math.max(5, schedule.minutes || 60);
    return from.getTime() + minutes * 60 * 1000;
  }

  if (schedule.type === 'daily') {
    const [hh, mm] = (schedule.time || '08:00').split(':').map(Number);
    const timezone = schedule.timezone || 'UTC';

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(from)
      .reduce((acc, p) => {
        acc[p.type] = p.value;
        return acc;
      }, {});

    const nowLocalMinutes = Number(parts.hour) * 60 + Number(parts.minute);
    const targetMinutes = hh * 60 + mm;

    const asUTC = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour === '24' ? '0' : parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const offsetMinutes = Math.round((asUTC - from.getTime()) / 60000);

    let dayOffset = 0;
    if (nowLocalMinutes >= targetMinutes) dayOffset = 1; // already past today's slot

    const targetUTC =
      Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + dayOffset, 0, 0, 0) +
      targetMinutes * 60 * 1000 -
      offsetMinutes * 60 * 1000;

    return targetUTC;
  }

  throw new Error(`Unknown schedule type: ${schedule.type}`);
}

module.exports = { computeNextRunAt };
