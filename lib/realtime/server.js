'use strict';

const { WebSocketServer } = require('ws');
const { parseCookie } = require('cookie');
const config = require('../config');
const { verifyToken } = require('../auth');
const { subscribe } = require('./bus');

function attachRealtime(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    if (req.url !== '/ws') {
      socket.destroy();
      return;
    }

    const cookies = parseCookie(req.headers.cookie || '');
    const token = cookies[config.auth.cookieName];
    let userId = null;
    try {
      userId = token ? verifyToken(token).sub : null;
    } catch {
      userId = null;
    }

    if (!userId) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, userId);
    });
  });

  wss.on('connection', (ws, req, userId) => {
    const unsubscribe = subscribe((msg) => {
      if (msg.userId !== userId) return; // only forward this connection's own events
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ event: msg.event, payload: msg.payload }));
      }
    });

    const heartbeat = setInterval(() => {
      if (ws.readyState === ws.OPEN) ws.ping();
    }, 30000);

    ws.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return wss;
}

module.exports = { attachRealtime };
