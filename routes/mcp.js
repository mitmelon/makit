'use strict';

const express = require('express');
const { z } = require('zod');
const { getStore } = require('../lib/db');
const { encrypt } = require('../lib/crypto');
const { requireAuth } = require('../lib/auth');
const { sanitizeText } = require('../lib/security/sanitize');

const CreateMcpServerSchema = z.object({
  label: z.string().min(1).max(80),
  url: z.string().url(),
  authToken: z.string().max(2000).optional().default(''),
});

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const store = await getStore();
    const servers = await store.listMcpServers(req.userId);
    // Never send the encrypted token material back to the client.
    res.json({ servers: servers.map(({ encryptedAuthToken, ...rest }) => rest) });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = CreateMcpServerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const { label, url, authToken } = parsed.data;
    const store = await getStore();
    const saved = await store.createMcpServer({
      userId: req.userId,
      label: sanitizeText(label),
      url,
      encryptedAuthToken: encrypt(authToken),
      createdAt: Date.now(),
    });
    const { encryptedAuthToken, ...safe } = saved;
    res.status(201).json({ server: safe });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const store = await getStore();
    const deleted = await store.deleteMcpServer(req.params.id, req.userId);
    if (!deleted) return res.status(404).json({ error: 'MCP server not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
