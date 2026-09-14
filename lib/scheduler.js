'use strict';

const cron = require('node-cron');
const config = require('./config');
const { computeNextRunAt } = require('./schedule');
const { enqueueOrRunTaskRun } = require('./queue');

function startScheduler({ store }) {
  const job = cron.schedule(config.scheduler.tickIntervalCron, async () => {
    let due = [];
    try {
      due = await store.findDueTasks(Date.now());
    } catch (err) {
      console.error('Scheduler: failed to query due tasks:', err.message);
      return;
    }

    for (const task of due) {
      const nextRunAt = computeNextRunAt(task.schedule, new Date());
      await store.setTaskSchedule(task.id, { nextRunAt });
      enqueueOrRunTaskRun({ store, task }).catch((err) => {
        console.error(`Scheduler: run failed for task ${task.id}:`, err.message);
      });
    }
  });

  return job;
}

module.exports = { startScheduler };
