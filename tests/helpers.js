'use strict';
// Utilitários dos testes: sobe o servidor real (server.js) numa porta livre, SEM banco (modo visitante), e conecta clientes Socket.IO.
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

async function startServer(extraEnv) {
  const port = await freePort();
  const env = Object.assign({}, process.env, { PORT: String(port), PUSH_ENABLED: 'false', CH_COUNTDOWN_MS: '300' }, extraEnv || {});
  delete env.DATABASE_URL;
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const url = 'http://127.0.0.1:' + port;
  const t0 = Date.now();
  for (;;) {
    try { const r = await fetch(url + '/health'); if (r.ok) break; } catch (e) { /* ainda subindo */ }
    if (Date.now() - t0 > 15000) { child.kill(); throw new Error('servidor não subiu:\n' + log); }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { url, port, stop: () => new Promise((r) => { child.once('exit', r); child.kill(); }), log: () => log };
}

function client(url) {
  const s = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
  s.emitAck = (ev, data) => new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('sem resposta de ' + ev)), 5000);
    s.emit(ev, data, (r) => { clearTimeout(t); res(r); });
  });
  s.once_ = (ev, pred, ms) => new Promise((res, rej) => {
    const t = setTimeout(() => { s.off(ev, h); rej(new Error('evento não chegou: ' + ev)); }, ms || 5000);
    const h = (d) => { if (!pred || pred(d)) { clearTimeout(t); s.off(ev, h); res(d); } };
    s.on(ev, h);
  });
  return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
module.exports = { ROOT, startServer, client, wait };
