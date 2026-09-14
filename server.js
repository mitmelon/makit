'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const config = require('./lib/config');
const { getStore } = require('./lib/db');
const { requireAuthPage } = require('./lib/auth');
const { startScheduler } = require('./lib/scheduler');
const { startWorker } = require('./lib/queue');
const { authLimiter, apiLimiter } = require('./lib/security/rateLimit');
const { attachRealtime } = require('./lib/realtime/server');

const authRoutes = require('./routes/auth');
const keysRoutes = require('./routes/keys');
const tasksRoutes = require('./routes/tasks');
const mcpRoutes = require('./routes/mcp');
const webhookRoutes = require('./routes/webhook');

function redirectIfAuthenticated(req, res, next) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) return next();

  try {
    const { verifyToken } = require('./lib/auth');
    verifyToken(token);
    return res.redirect('/dashboard');
  } catch {
    return next();
  }
}

async function main() {
  await getStore(); // fail fast if the configured DB driver can't connect

  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  app.use(express.json({ limit: '256kb' }));
  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );

  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/keys', apiLimiter, keysRoutes);
  app.use('/api/tasks', apiLimiter, tasksRoutes);
  app.use('/api/mcp', apiLimiter, mcpRoutes);
  app.use('/api/webhook', webhookRoutes);

  app.get('/api/session', async (req, res) => {
    const { verifyToken } = require('./lib/auth');
    const { LANGUAGES } = require('./lib/i18n/locales');
    const token = req.cookies?.[config.auth.cookieName];
    if (!token) return res.json({ user: null, languages: LANGUAGES });
    try {
      const payload = verifyToken(token);
      const store = await getStore();
      const dbUser = await store.findUserById(payload.sub);
      res.json({
        user: { id: payload.sub, email: payload.email, language: dbUser?.language || 'en' },
        languages: LANGUAGES,
      });
    } catch {
      res.json({ user: null, languages: LANGUAGES });
    }
  });

  app.get('/api/i18n/strings', (req, res) => {
    const { STRINGS } = require('./lib/i18n/locales');
    res.json({ strings: STRINGS });
  });

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  // Static assets (css/js/images)
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  // Pages
  app.get('/', (req, res) => res.render('landing'));
  app.get('/login', redirectIfAuthenticated, (req, res) => res.render('login'));
  app.get('/register', redirectIfAuthenticated, (req, res) => res.render('register'));
  app.get('/dashboard', requireAuthPage, (req, res) => res.render('dashboard'));
  app.get('/tasks/new', requireAuthPage, (req, res) => res.render('task-new'));
  app.get('/tasks/:id', requireAuthPage, (req, res) => res.render('task-detail'));
  app.get('/settings', requireAuthPage, (req, res) => res.render('settings'));

  app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    console.error(err);
    res.status(500).json({ error: err.message });
  });

  const store = await getStore();
  startScheduler({ store });
  startWorker({ store }); // no-ops if Redis isn't configured

  const httpServer = http.createServer(app);
  attachRealtime(httpServer);

  httpServer.listen(config.port, () => {
    console.log(`Makit listening on :${config.port} (db driver: ${config.db.driver})`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
