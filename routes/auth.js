'use strict';

const express = require('express');
const { z } = require('zod');
const { getStore } = require('../lib/db');
const { hashPassword, verifyPassword, issueToken, requireAuth } = require('../lib/auth');
const { sanitizeText } = require('../lib/security/sanitize');
const { LANGUAGES } = require('../lib/i18n/locales');
const config = require('../lib/config');

const RegisterSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const router = express.Router();

function setSessionCookie(res, token) {
  res.cookie(config.auth.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.env === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

router.post('/register', async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const { name, email, password } = parsed.data;
    const cleanName = sanitizeText(name);
    const store = await getStore();

    const existing = await store.findUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await hashPassword(password);
    const user = await store.createUser({
      name: cleanName,
      email: email.toLowerCase(),
      passwordHash,
      language: 'en',
      createdAt: Date.now(),
    });

    const token = issueToken(user);
    setSessionCookie(res, token);
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

    const { email, password } = parsed.data;
    const store = await getStore();
    const user = await store.findUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = issueToken(user);
    setSessionCookie(res, token);
    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(config.auth.cookieName);
  res.json({ ok: true });
});

router.patch('/language', requireAuth, async (req, res, next) => {
  try {
    const code = String(req.body.language || '');
    if (!LANGUAGES.some((l) => l.code === code)) {
      return res.status(400).json({ error: `Unsupported language: ${code}` });
    }
    const store = await getStore();
    const user = await store.setUserLanguage(req.userId, code);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ language: user.language });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
