'use strict';

const express = require('express');
const { getStore } = require('../lib/db');
const { webhookLimiter } = require('../lib/security/rateLimit');

const router = express.Router();

router.use(webhookLimiter);

router.post('/:token', async (req, res, next) => {
  try {
    
    const store = await getStore();
    const task = await store.findTaskByWebhookToken(req.params.token);
    if (!task) return res.status(404).json({ error: 'Unknown webhook token' });

    const body = req.body;
    if (body === undefined || body === null || typeof body !== 'object') {
      return res.status(400).json({ error: 'Request body must be a JSON object' });
    }

    const entry = await store.insertTaskData({
      taskId: task.id,
      data: body,
      receivedAt: Date.now(),
    });

    res.status(201).json({ ok: true, id: entry.id });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
