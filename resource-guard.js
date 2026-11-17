'use strict';
// Defensive limits for this single-instance Render service. No private identifiers are logged.
const { ipOfSocket } = require('./security');
function boundedInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= min && n <= max ? n : fallback;
}
const HEAVY_AUTH_RE = /^\/api\/acc\/(profile\/(login|new|erase|new-secret)|delete)$/;
function windowGate({ max, windowMs, entries = 6000, now = Date.now, openWhenFull = false }) {
  const map = new Map();
  function allow(key) {
    const t = now();
    let item = map.get(key);
    if (item && t - item.at >= windowMs) { map.delete(key); item = null; }
    if (!item) {
      // Do not evict live counters: eviction would let attackers reset a quota by changing IPs.
      // openWhenFull: contadores de APARELHO (a conexão muda a cada reabertura) não barram ninguém se o mapa encher; o limite por endereço continua.
      if (map.size >= entries) { if (!openWhenFull) return false; sweep(); if (map.size >= entries) return true; }
      item = { at: t, n: 0 }; map.set(key, item);
    }
    if (item.n >= max) return false;
    item.n++;
    return true;
  }
  function sweep() { const t = now(); for (const [key, item] of map) if (t - item.at >= windowMs) map.delete(key); }
  const timer = setInterval(sweep, Math.min(windowMs, 60000)); timer.unref?.();
  // quantas vezes a chave já usou na janela atual (sem contar nada)
  function used(key) { const item = map.get(key); return item && now() - item.at < windowMs ? item.n : 0; }
  return { allow, used, sweep, max, count: () => map.size, close: () => clearInterval(timer) };
}
/* Limites por ENDEREÇO (17/11/2026). Um endereço não é uma pessoa: numa escola a turma inteira sai pelo mesmo endereço, e na rede móvel
 * centenas de celulares dividem um. Os valores abaixo cabem uma turma (ou duas) jogando ao mesmo tempo; quem abusa continua barrado por:
 *   - limites por APARELHO (conexão ou perfil) onde existe ação repetível (criar sala; palpites de código ficam em security.createJoinGuard);
 *   - RESERVA quando o servidor está quase cheio (75% do teto): um endereço que já tem muitas conexões (ou já criou muitas salas na janela)
 *     não abre mais, e as vagas que sobram ficam para quem tem pouco. Assim um ou dois endereços não esgotam o jogo para todo mundo;
 *   - os tetos gerais e a concorrência máxima da API, que não mudaram.
 * Tudo continua ajustável pelo Render (MAX_SOCKETS_PER_IP, ROOM_CREATES_PER_10MIN, MAX_LIVE_SOCKETS, MAX_ACTIVE_ROOMS...). */
const FULLISH = 0.75;
function makeProtection(env = process.env) {
  const roomsMax = boundedInt(env.MAX_ACTIVE_ROOMS, 240, 20, 1500);
  const socketsMax = boundedInt(env.MAX_LIVE_SOCKETS, 500, 50, 2000);
  const socketsPerIp = boundedInt(env.MAX_SOCKETS_PER_IP, 120, 4, 400);
  const socketsFair = Math.min(socketsPerIp, boundedInt(env.MAX_SOCKETS_PER_IP_WHEN_FULL, 32, 4, 400));     // reserva: acima de 75% do teto
  const roomsPerIp = boundedInt(env.ROOM_CREATES_PER_10MIN, 60, 3, 300);
  const createRoomGate = windowGate({ max: roomsPerIp, windowMs: 600000 });
  const roomsFair = Math.min(roomsPerIp, boundedInt(env.ROOM_CREATES_PER_10MIN_WHEN_FULL, 12, 3, 300));   // reserva: acima de 75% do teto de salas
  const createRoomDevGate = windowGate({ max: boundedInt(env.ROOM_CREATES_PER_DEVICE_10MIN, 20, 3, 300), windowMs: 600000, entries: 20000, openWhenFull: true });
  const apiGate = windowGate({ max: boundedInt(env.API_PER_IP_PER_MIN, 1500, 100, 20000), windowMs: 60000 });
  const downloadGate = windowGate({ max: 150, windowMs: 60000 });
  const staticGate = windowGate({ max: boundedInt(env.STATIC_PER_IP_PER_MIN, 6000, 300, 60000), windowMs: 60000 });
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
  // aparelho: o perfil (se logado) ou a conexão
  const devOfSocket = socket => (socket.data && socket.data.uid ? 'u:' + socket.data.uid : 's:' + socket.id);
  function allowRoom(socket, activeRooms) {
    if (activeRooms >= roomsMax) return false;
    const ip = keyOfSocket(socket);
    if (activeRooms >= roomsMax * FULLISH && createRoomGate.used(ip) >= roomsFair) return false;   // quase cheio: quem já criou muitas espera
    return createRoomDevGate.allow(devOfSocket(socket)) && createRoomGate.allow(ip);            // o aparelho primeiro: quem insiste não gasta a cota da rede
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
      const mine = socketIps.get(ip) || 0;
      if (activeSockets >= socketsMax || mine >= socketsPerIp || (activeSockets >= socketsMax * FULLISH && mine >= socketsFair)) return next(new Error('busy'));
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
  // os números em vigor (para o /diagnostico; nenhum endereço)
  const limits = {
    conexoes: { por_endereco: socketsPerIp, por_endereco_com_servidor_quase_cheio: socketsFair, total: socketsMax },
    criar_sala_em_10_min: { por_endereco: roomsPerIp, por_aparelho: createRoomDevGate.max, por_endereco_com_servidor_quase_cheio: roomsFair, salas_ao_mesmo_tempo: roomsMax },
    pedidos_por_minuto: { api: apiGate.max, arquivos: staticGate.max },
    quase_cheio_a_partir_de: Math.round(FULLISH * 100) + '%'
  };
  return { allowRoom, httpMiddleware, installSocketShield, sameOrigin, roomLimit: roomsMax, socketLimit: socketsMax, limits, handlerErrors: () => handlerErrors,
    stats: () => ({ activeSockets, activeApi, costlyAuth, distinctIps: socketIps.size }), close: () => {
      for (const gate of [createRoomGate, createRoomDevGate, apiGate, downloadGate, staticGate, diagGate, motionGate, controlGate]) gate.close();
    } };
}
module.exports = { boundedInt, windowGate, makeProtection, HEAVY_AUTH_RE };
