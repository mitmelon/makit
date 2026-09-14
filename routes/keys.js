'use strict';

const express = require('express');
const { z } = require('zod');
const { getStore } = require('../lib/db');
const { encrypt, decrypt } = require('../lib/crypto');
const { requireAuth } = require('../lib/auth');
const { listBedrockModels, listGeminiModels, BEDROCK_REGIONS } = require('../lib/agent/modelFactory');

const CreateKeySchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('bedrock'),
    label: z.string().min(1).max(80),
    region: z.enum(BEDROCK_REGIONS.map((r) => r.code)),
    accessKeyId: z.string().max(200).optional().default(''),
    secretAccessKey: z.string().max(200).optional().default(''),
  }),
  z.object({
    provider: z.literal('gemini'),
    label: z.string().min(1).max(80),
    key: z.string().min(1),
  }),
  z.object({
    provider: z.literal('parallel'),
    label: z.string().min(1).max(80),
    key: z.string().min(1),
  }),
]);

const MODEL_PROVIDERS = ['bedrock', 'gemini'];

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const store = await getStore();
    const keys = await store.listApiKeys(req.userId);
    // Never send the encrypted key material back to the client.
    res.json({ keys: keys.map(({ encryptedKey, ...rest }) => rest) });
  } catch (err) {
    next(err);
  }
});

router.get('/regions', (req, res) => {
  res.json({ regions: BEDROCK_REGIONS });
});

router.post('/', async (req, res, next) => {
  try {
    const parsed = CreateKeySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const data = parsed.data;
    const store = await getStore();

    const encryptedKey =
      data.provider === 'bedrock'
        ? encrypt(JSON.stringify({ accessKeyId: data.accessKeyId, secretAccessKey: data.secretAccessKey, region: data.region }))
        : encrypt(data.key);

    const saved = await store.createApiKey({
      userId: req.userId,
      label: data.label,
      provider: data.provider,
      region: data.provider === 'bedrock' ? data.region : null,
      encryptedKey,
      createdAt: Date.now(),
    });
    const { encryptedKey: _omit, ...safe } = saved;
    res.status(201).json({ key: safe });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const store = await getStore();
    const deleted = await store.deleteApiKey(req.params.id, req.userId);
    if (!deleted) return res.status(404).json({ error: 'Key not found' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/models', async (req, res, next) => {
  try {
    const store = await getStore();
    const keys = await store.listApiKeys(req.userId);
    const modelKeys = keys.filter((k) => MODEL_PROVIDERS.includes(k.provider));

    const modelsPerKey = await Promise.all(
      modelKeys.map(async (key) => {
        try {
          if (key.provider === 'bedrock') {
            const creds = JSON.parse(decrypt(key.encryptedKey));
            const models = await listBedrockModels(creds);
            return models.map((m) => ({ apiKeyId: key.id, apiKeyLabel: key.label, provider: 'bedrock', providerLabel: 'Amazon Bedrock', modelId: m.modelId, label: m.label }));
          }
          if (key.provider === 'gemini') {
            const models = await listGeminiModels(decrypt(key.encryptedKey));
            return models.map((m) => ({ apiKeyId: key.id, apiKeyLabel: key.label, provider: 'gemini', providerLabel: 'Google Gemini', modelId: m.modelId, label: m.label }));
          }
          return [];
        } catch (err) {
          console.error(`Failed to list models for key ${key.id} (${key.provider}):`, err.message);
          return [];
        }
      })
    );

    res.json({
      models: modelsPerKey.flat(),
      keys: keys.filter((k) => MODEL_PROVIDERS.includes(k.provider)).map(({ encryptedKey, ...rest }) => rest),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
