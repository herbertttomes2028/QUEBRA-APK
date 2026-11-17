'use strict';
// Defensive limits for this single-instance Render service. No private identifiers are logged.
const { ipOfSocket } = require('./security');
function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}
const HEAVY_AUTH_RE = /^\/api\/acc\/(profile\/(login|new|erase|new-secret)|delete)$/;
function windowGate({ max, windowMs, entries = 6000, now = Date.now }) {
  const map = new Map();
  function allow(key) {
    const t = now();
    let item = map.get(key);
    if (item && t - item.at >= windowMs) { map.delete(key); item = null; }
    if (!item) {
      // Do not evict live counters: eviction would let attackers reset a quota by changing IPs.
      if (map.size >= entries) return false;
      item = { at: t, n: 0 }; map.set(key, item);
    }
    if (item.n >= max) return false;
    item.n++;
    return true;
  }
  function sweep() { const t = now(); for (const [key, item] of map) if (t - item.at >= windowMs) map.delete(key); }
  const timer = setInterval(sweep, Math.min(windowMs, 60000)); timer.unref?.();
  return { allow, sweep, count: () => map.size, close: () => clearInterval(timer) };
}
function makeProtection(env = process.env) {
  const roomsMax = boundedInt(env.MAX_ACTIVE_ROOMS, 240, 20, 1500);
  const socketsMax = boundedInt(env.MAX_LIVE_SOCKETS, 500, 50, 2000);
  const socketsPerIp = boundedInt(env.MAX_SOCKETS_PER_IP, 32, 4, 128);
  const createRoomGate = windowGate({ max: boundedInt(env.ROOM_CREATES_PER_10MIN, 12, 3, 100), windowMs: 600000 });
  const apiGate = windowGate({ max: 360, windowMs: 60000 });
  const downloadGate = windowGate({ max: 150, windowMs: 60000 });
  const staticGate = windowGate({ max: 1500, windowMs: 60000 });
  const diagGate = windowGate({ max: 25, windowMs: 60000 });
  const motionGate = windowGate({ max: 240, windowMs: 3000 });
  const controlGate = windowGate({ max: 90, windowMs: 3000 });
  const socketIps = new Map();
  let activeSockets = 0;
  let activeApi = 0;
  let costlyAuth = 0;
  const maxInflightApi = boundedInt(env.MAX_API_INFLIGHT, 80, 10, 200);
  const maxCostlyAuth = boundedInt(env.MAX_AUTH_INFLIGHT, 8, 2, 32);
  const keyOfSocket = socket => String(ipOfSocket(socket) || 'unknown').slice(0, 100);
  function allowRoom(socket, activeRooms) {
    return activeRooms < roomsMax && createRoomGate.allow(keyOfSocket(socket));
  }
  function httpMiddleware(req, res, next) {
    const pathname = req.path || '';
    const ip = String(req.ip || 'unknown').slice(0, 100);
    if (pathname === '/diagnostico' || pathname === '/api/csp-report') {
      if (!diagGate.allow(ip)) return res.status(429).json({ ok: false, error: 'rate' });
    } else if (pathname.startsWith('/api/')) {
      if (!apiGate.allow(ip) || (pathname.startsWith('/api/up/') && !downloadGate.allow(ip)))
        return res.status(429).json({ ok: false, error: 'rate' });
    } else if (pathname !== '/health' && !staticGate.allow(ip)) {
      return res.status(429).json({ ok: false, error: 'rate' });
    }
    // A small global concurrency budget protects the PostgreSQL pool and scrypt workers
    // when traffic comes from many IPs and per-IP limits alone cannot stop exhaustion.
    if (pathname.startsWith('/api/')) {
      // Rotas que rodam scrypt (código-chave). Eram as do login antigo (login, register, verify, password/*, google), que não existem
      // mais desde o perfil gerado: as novas passavam sem este limite (auditoria de 14/11/2026, SEC-03). Um teste confere a lista.
      const heavy = req.method === 'POST' && HEAVY_AUTH_RE.test(pathname);
      if (activeApi >= maxInflightApi || (heavy && costlyAuth >= maxCostlyAuth))
        return res.status(503).json({ ok: false, error: 'busy' });
      activeApi++; if (heavy) costlyAuth++;
      let done = false;
      const release = () => { if (done) return; done = true; activeApi--; if (heavy) costlyAuth--; };
      res.once('finish', release);
      res.once('close', release);
    }
    next();
  }
  function sameOrigin(req) {
    const value = req.headers && req.headers.origin;
    if (!value) return true; // native clients do not always send Origin; other quotas still apply.
    try {
      const origin = new URL(value);
      const host = String(req.headers.host || '').toLowerCase();
      if (!host || origin.host.toLowerCase() !== host) return false;
      return origin.protocol === 'https:' || (origin.protocol === 'http:' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host));
    } catch (_) { return false; }
  }
  // SEC-11 (auditoria de 17/11/2026): um evento com dados malformados (ex.: um objeto cujo toString/valueOf não são funções) lançava erro
  // dentro do ouvinte e DERRUBAVA o processo inteiro (todas as salas, e os contadores de tentativas na memória voltavam a zero).
  // Todo ouvinte registrado DESTE ponto em diante roda dentro de try/catch, e promessas recusadas também são pegas. Nada muda para o
  // evento que funciona: mesmos argumentos, mesmo "this", mesmo retorno. O registro anota só o NOME do evento e a mensagem (nunca os dados).
  let handlerErrors = 0, lastHandlerLog = 0;
  function handlerFail(event, err) {
    handlerErrors++;
    const t = Date.now();
    if (t - lastHandlerLog < 10000) return;                    // no máximo uma linha a cada 10 s (quem envia lixo não enche o registro)
    lastHandlerLog = t;
    let msg = 'erro sem descrição';
    try { msg = String((err && err.message) || err).slice(0, 120); } catch (_) { /* o próprio erro pode ser um objeto que não vira texto */ }
    console.error('[socket] evento com dados inválidos ignorado:', String(event).slice(0, 40), '-', msg, '(total ' + handlerErrors + ')');
  }
  function guardHandlers(socket) {
    const on = socket.on;
    socket.on = function (event, fn) {
      if (typeof fn !== 'function') return on.call(this, event, fn);
      const guarded = function (...args) {
        try {
          const r = fn.apply(this, args);
          if (r && typeof r.then === 'function') r.then(undefined, (e) => handlerFail(event, e));
          return r;
        } catch (e) { handlerFail(event, e); return undefined; }
      };
      guarded.listener = fn;                                     // como o Node marca ouvintes embrulhados: socket.off(fn) e o "once" continuam removendo o ouvinte
      return on.call(this, event, guarded);
    };
  }
  function installSocketShield(io) {
    io.use((socket, next) => {
      const ip = keyOfSocket(socket);
      if (activeSockets >= socketsMax || (socketIps.get(ip) || 0) >= socketsPerIp) return next(new Error('busy'));
      activeSockets++;
      socketIps.set(ip, (socketIps.get(ip) || 0) + 1);
      let released = false;
      const release = () => {
        if (released) return;
        released = true; activeSockets--;
        const n = (socketIps.get(ip) || 1) - 1;
        if (n) socketIps.set(ip, n); else socketIps.delete(ip);
      };
      socket.once('disconnect', release);
      // Rejected packets must never generate an unhandled EventEmitter error.
      socket.on('error', () => {});
      guardHandlers(socket);
      // Also release a reservation if the handshake fails after middleware admission.
      if (socket.conn && typeof socket.conn.once === 'function') socket.conn.once('close', release);
      socket.use((packet, pass) => {
        const event = String(packet[0] || '');
        const moves = event === 'move' || event === 'ch:move';
        const gate = moves ? motionGate : controlGate;
        if (!gate.allow(socket.id + ':' + (moves ? 'move' : 'control'))) return pass(new Error('rate'));
        pass();
      });
      next();
    });
  }
  return { allowRoom, httpMiddleware, installSocketShield, sameOrigin, roomLimit: roomsMax, socketLimit: socketsMax, handlerErrors: () => handlerErrors,
    stats: () => ({ activeSockets, activeApi, costlyAuth, distinctIps: socketIps.size }), close: () => {
      for (const gate of [createRoomGate, apiGate, downloadGate, staticGate, diagGate, motionGate, controlGate]) gate.close();
    } };
}
module.exports = { boundedInt, windowGate, makeProtection, HEAVY_AUTH_RE };
