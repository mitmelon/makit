'use strict';

const config = require('../config');
const { getRedis } = require('../cache/redis');
const { executeTaskRun } = require('../agent/runner');
const { notifyChannels } = require('../notify');

const QUEUE_NAME = 'makit:task-runs';

let queue = null;
let worker = null;

function getQueue() {
  if (queue) return queue;
  const connection = getRedis();
  if (!connection) return null;

  const { Queue } = require('bullmq');
  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 500 },
    },
  });
  return queue;
}

async function enqueueOrRunTaskRun({ store, task }) {
  const q = getQueue();
  if (q) {
    await q.add('run', { taskId: task.id, userId: task.userId }, { jobId: `${task.id}:${Date.now()}` });
    return null; // caller doesn't get the run record synchronously in queued mode
  }
  return executeTaskRun({ store, task, notify: notifyChannels });
}

function startWorker({ store }) {
  const connection = getRedis();
  if (!connection) return null;
  if (worker) return worker;

  const { Worker } = require('bullmq');
  worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const task = await store.findTaskById(job.data.taskId, job.data.userId);
      if (!task) {
        console.error(`Queue: task ${job.data.taskId} no longer exists, skipping run`);
        return;
      }
      await executeTaskRun({ store, task, notify: notifyChannels });
    },
    { connection, concurrency: 5 }
  );

  worker.on('failed', (job, err) => {
    console.error(`Queue: job ${job?.id} failed unexpectedly:`, err.message);
  });

  return worker;
}

module.exports = { getQueue, enqueueOrRunTaskRun, startWorker };
