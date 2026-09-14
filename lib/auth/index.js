'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, config.auth.jwtSecret, {
    expiresIn: config.auth.tokenTtl,
  });
}

function verifyToken(token) {
  return jwt.verify(token, config.auth.jwtSecret);
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Session expired or invalid' });
  }
}

function requireAuthPage(req, res, next) {
  const token = req.cookies?.[config.auth.cookieName];
  if (!token) return res.redirect('/login');
  try {
    const payload = verifyToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch (err) {
    res.redirect('/login');
  }
}

module.exports = { hashPassword, verifyPassword, issueToken, verifyToken, requireAuth, requireAuthPage };
