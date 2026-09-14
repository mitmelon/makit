'use strict';

const express = require('express');
const crypto = require('crypto');
const { z } = require('zod');
const { getStore } = require('../lib/db');
const { requireAuth } = require('../lib/auth');
const { computeNextRunAt } = require('../lib/schedule');
const { enqueueOrRunTaskRun } = require('../lib/queue');
const { sanitizeFields, sanitizeText } = require('../lib/security/sanitize');

const ScheduleSchema = z.union([
  z.object({ type: z.literal('daily'), time: z.string().regex(/^\d{2}:\d{2}$/), timezone: z.string() }),
  z.object({ type: z.literal('interval'), minutes: z.number().int().min(5).max(10080) }),
]);

const NotifySchema = z.object({
  email: z.object({ enabled: z.boolean(), address: z.string().email().optional().or(z.literal('')) }).optional(),
  telegram: z
    .object({ enabled: z.boolean(), botToken: z.string().optional(), chatId: z.string().optional() })
    .optional(),
});

const CreateTaskSchema = z.object({
  name: z.string().min(1).max(120),
  businessName: z.string().min(1).max(160),
  businessAddress: z.string().min(1).max(300),
  businessCategory: z.string().min(3).max(200),
  customInstructions: z.string().max(1000).optional().default(''),
  apiKeyId: z.string().min(1),
  modelId: z.string().min(1),
  parallelApiKeyId: z.string().optional(),
  mcpServerIds: z.array(z.string()).max(5).optional().default([]),
  schedule: ScheduleSchema,
  notify: NotifySchema.optional().default({}),
});

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const store = await getStore();
    const tasks = await store.listTasks(req.userId);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = CreateTaskSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
    const data = sanitizeFields(parsed.data, ['name', 'businessName', 'businessAddress', 'businessCategory', 'customInstructions']);

    const store = await getStore();
    const apiKey = await store.findApiKeyById(data.apiKeyId, req.userId);
    if (!apiKey) return res.status(400).json({ error: 'Selected API key was not found' });

    const nextRunAt = computeNextRunAt(data.schedule, new Date());
    const webhookToken = crypto.randomBytes(20).toString('hex');

    const task = await store.createTask({
      ...data,
      userId: req.userId,
      status: 'active',
      webhookToken,
      nextRunAt,
      lastRunAt: null,
      lastRunStatus: null,
      createdAt: Date.now(),
    });

    res.status(201).json({ task });
  } catch (err) {
    next(err);
  }
});

router.get('/feeds/latest', async (req, res, next) => {
  try {
    const store = await getStore();
    const tasks = await store.listTasks(req.userId);
    const feeds = await store.listFeedItemsForUser(
      req.userId,
      tasks.map((t) => t.id),
      { limit: parseInt(req.query.limit, 10) || 20 }
    );
    res.json({ feeds });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const store = await getStore();
    const task = await store.findTaskById(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ task });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const store = await getStore();
    const existing = await store.findTaskById(req.params.id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Task not found' });

    const patch = {};
    if (req.body.status && ['active', 'paused'].includes(req.body.status)) patch.status = req.body.status;
    if (req.body.name && typeof req.body.name === 'string') patch.name = sanitizeText(req.body.name.slice(0, 120));
    if (req.body.businessName && typeof req.body.businessName === 'string') patch.businessName = sanitizeText(req.body.businessName.slice(0, 160));
    if (req.body.businessAddress && typeof req.body.businessAddress === 'string') patch.businessAddress = sanitizeText(req.body.businessAddress.slice(0, 300));
    if (req.body.businessCategory && typeof req.body.businessCategory === 'string') patch.businessCategory = sanitizeText(req.body.businessCategory.slice(0, 200));
    if (req.body.customInstructions !== undefined) patch.customInstructions = sanitizeText(String(req.body.customInstructions).slice(0, 1000));
    if (req.body.apiKeyId && typeof req.body.apiKeyId === 'string') patch.apiKeyId = req.body.apiKeyId;
    if (req.body.modelId && typeof req.body.modelId === 'string') patch.modelId = req.body.modelId;
    if (req.body.parallelApiKeyId !== undefined) patch.parallelApiKeyId = req.body.parallelApiKeyId || null;
    if (Array.isArray(req.body.mcpServerIds)) patch.mcpServerIds = req.body.mcpServerIds.slice(0, 5);
    if (req.body.notify) {
      const parsedNotify = NotifySchema.safeParse(req.body.notify);
      if (parsedNotify.success) patch.notify = { ...existing.notify, ...parsedNotify.data };
    }
    if (req.body.schedule) {
      const parsedSchedule = ScheduleSchema.safeParse(req.body.schedule);
      if (parsedSchedule.success) {
        patch.schedule = parsedSchedule.data;
        patch.nextRunAt = computeNextRunAt(parsedSchedule.data, new Date());
      }
    }

    const updated = await store.updateTask(req.params.id, req.userId, patch);
    res.json({ task: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const store = await getStore();
    const deleted = await store.deleteTask(req.params.id, req.userId);
    if (!deleted) return res.status(404).json({ error: 'Task not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Manual "Run now" trigger from the dashboard.
router.post('/:id/run', async (req, res, next) => {
  try {
    const store = await getStore();
    const task = await store.findTaskById(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const run = await enqueueOrRunTaskRun({ store, task });
    if (run) {
      // Ran directly (no Redis configured) — the caller gets the
      // finished run immediately.
      return res.status(run.status === 'completed' ? 200 : 502).json({ run });
    }
    // Went through the queue — a worker will process it shortly.
    // The frontend polls /runs to pick it up once it lands.
    res.status(202).json({ queued: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/runs', async (req, res, next) => {
  try {
    const store = await getStore();
    const task = await store.findTaskById(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
    const runs = await store.listRunsForTask(task.id, { limit });
    res.json({ runs });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/runs/:runId/feedback', async (req, res, next) => {
  try {
    const feedback = req.body.feedback;
    if (!['helpful', 'not_helpful', null].includes(feedback)) {
      return res.status(400).json({ error: 'feedback must be "helpful", "not_helpful", or null to clear it' });
    }
    const store = await getStore();
    const task = await store.findTaskById(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const run = await store.findRunById(req.params.runId);
    if (!run || run.taskId !== task.id) return res.status(404).json({ error: 'Run not found' });
    const updated = await store.updateRun(req.params.runId, { feedback });
    res.json({ run: updated });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/data', async (req, res, next) => {
  try {
    const store = await getStore();
    const task = await store.findTaskById(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const entries = await store.listTaskData(task.id, { limit: 50 });
    res.json({ entries, webhookUrl: `/api/webhook/${task.webhookToken}` });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/feeds', async (req, res, next) => {
  try {
    const store = await getStore();
    const task = await store.findTaskById(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const [feeds, competitors, opportunities] = await Promise.all([
      store.listFeedItemsForTask(task.id, { limit: 20 }),
      store.listCompetitors(task.id),
      store.listOpportunities(task.id),
    ]);
    res.json({ feeds, competitors, opportunities });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/rotate-webhook', async (req, res, next) => {
  try {
    const store = await getStore();
    const task = await store.findTaskById(req.params.id, req.userId);
    if (!task) return res.status(404).json({ error: 'Task not found' });
    const webhookToken = crypto.randomBytes(20).toString('hex');
    const updated = await store.updateTask(req.params.id, req.userId, { webhookToken });
    res.json({ task: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
