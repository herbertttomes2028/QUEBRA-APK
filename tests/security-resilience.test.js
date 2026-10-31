'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { boundedInt, windowGate, makeProtection } = require('../resource-guard');
const { sslOptions } = require('../db');
const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('limites numéricos de configuração não aceitam infinitos, negativos e valores excessivos', () => {
  for (const bad of [-1, 0, 'Infinity', 100000000, 'abc', 1.7, null])
    assert.equal(boundedInt(bad, 30, 5, 80), 30);
  assert.equal(boundedInt('40', 30, 5, 80), 40);
});
test('janela deslizante simplificada: limita e recupera depois do intervalo', () => {
  let now = 1000;
  const gate = windowGate({ max: 2, windowMs: 2000, entries: 2, now: () => now });
  try {
    assert.equal(gate.allow('a'), true);
    assert.equal(gate.allow('a'), true);
    assert.equal(gate.allow('a'), false);
    assert.equal(gate.allow('b'), true);
    assert.equal(gate.allow('c'), false, 'mapa saturado deve recusar em vez de remover contador de vítima');
    assert.equal(gate.count(), 2);
    now += 2001;
    gate.sweep();
    assert.equal(gate.count(), 0);
    assert.equal(gate.allow('c'), true);
  } finally { gate.close(); }
});
test('simulação controlada de 20000 pedidos: memória por chave fica limitada', () => {
  const gate = windowGate({ max: 2, windowMs: 60000, entries: 200 });
  try {
    let ok = 0, denied = 0;
    for (let n = 0; n < 20000; n++) (gate.allow('ip' + n) ? ok++ : denied++);
    assert.equal(ok, 200);
    assert.equal(denied, 19800);
    assert.equal(gate.count(), 200);
  } finally { gate.close(); }
});
test('HTTP: APIs e diagnóstico limitados; arquivos e health permanecem acessíveis', () => {
  const shield = makeProtection();
  const call = (path, ip = 'test') => {
    const req = { ip, path, method: 'GET' }, res = new EventEmitter();
    res.statusCode = 200;
    res.status = function (n) { this.statusCode = n; return this; };
    res.json = function (x) { this.result = x; };
    let next = false; shield.httpMiddleware(req, res, () => { next = true; });
    if (next) res.emit('finish');
    return { code: res.statusCode, next, result: res.result };
  };
  try {
    for (let n = 0; n < 25; n++) assert.equal(call('/diagnostico').next, true);
    assert.deepEqual(call('/diagnostico').result, { ok: false, error: 'rate' });
    for (let n = 0; n < 360; n++) assert.equal(call('/api/acc/me').next, true);
    assert.equal(call('/api/acc/me').code, 429);
    assert.equal(call('/health').next, true);
    assert.equal(call('/biblioteca/lib-fauna-01.webp').next, true);
    assert.equal(call('/api/acc/me', 'outro-ip').next, true);
    for (let n = 0; n < 1500; n++) assert.equal(call('/style.css', 'large-client').next, true);
    assert.equal(call('/style.css', 'large-client').code, 429);
  } finally { shield.close(); }
});
test('concorrência: protege API e scrypt, libera vagas após concluir ou falhar', () => {
  const shield = makeProtection({ MAX_API_INFLIGHT: '10', MAX_AUTH_INFLIGHT: '2' });
  function start(path, ip, method = 'POST') {
    const req = { path, method, ip }, res = new EventEmitter();
    res.statusCode = 200;
    res.status = function (n) { this.statusCode = n; return this; };
    res.json = function (x) { this.payload = x; };
    let admitted = false;
    shield.httpMiddleware(req, res, () => { admitted = true; });
    return { res, admitted };
  }
  try {
    const a = start('/api/acc/login', 'a'), b = start('/api/acc/login', 'b');
    assert.equal(a.admitted, true); assert.equal(b.admitted, true);
    const c = start('/api/acc/login', 'c');
    assert.equal(c.admitted, false); assert.equal(c.res.statusCode, 503);
    assert.deepEqual(shield.stats().costlyAuth, 2);
    a.res.emit('close'); a.res.emit('finish');
    assert.equal(shield.stats().costlyAuth, 1);
    const d = start('/api/acc/login', 'd'); assert.equal(d.admitted, true);
    b.res.emit('finish'); d.res.emit('finish');
    const running = Array.from({ length: 10 }, (_, i) => start('/api/acc/library', 'ip-' + i, 'GET'));
    assert.equal(running.every(x => x.admitted), true);
    assert.equal(start('/api/acc/library', 'overflow', 'GET').res.statusCode, 503);
    for (const x of running) x.res.emit('finish');
    assert.equal(shield.stats().activeApi, 0);
  } finally { shield.close(); }
});
test('CSP: relatórios não vazam parâmetros privados no diagnóstico', () => {
  const sec = require('../security');
  const handler = sec.cspReportHandler({ json() { return (_req, _res, next) => next(); } })[1];
  const req = { ip: '127.0.0.1', body: { 'csp-report': {
    'violated-directive': 'script-src',
    'blocked-uri': 'https://cdn.example.test/test.js?session=VERY_PRIVATE',
    'document-uri': 'https://quebra-apk.onrender.com/?token=VERY_PRIVATE'
  } } };
  const res = { status(n) { assert.equal(n, 204); return this; }, end() {} };
  handler(req, res);
  const last = sec.cspStats.ultimas[sec.cspStats.ultimas.length - 1];
  assert.equal(last.bloqueado, 'https://cdn.example.test/test.js');
  assert.equal(last.pagina, 'https://quebra-apk.onrender.com/');
  assert.equal(JSON.stringify(last).includes('VERY_PRIVATE'), false);
});
test('admissão de salas vale para os dois modos; limite por IP e teto global', () => {
  const shield = makeProtection({ MAX_ACTIVE_ROOMS: '20', ROOM_CREATES_PER_10MIN: '3' });
  const sock = { handshake: { address: '127.0.0.1' } };
  try {
    assert.equal(shield.allowRoom(sock, 20), false);
    assert.equal(shield.allowRoom(sock, 19), true);
    assert.equal(shield.allowRoom(sock, 19), true);
    assert.equal(shield.allowRoom(sock, 19), true);
    assert.equal(shield.allowRoom(sock, 19), false);
  } finally { shield.close(); }
});
test('proteção de adivinhação de salas tem mapa de IPs limitado em vez de crescer indefinidamente', () => {
  const { createJoinGuard } = require('../security');
  const guard = createJoinGuard({});
  for (let i = 0; i < 8000; i++) assert.equal(guard.fail('100.1.' + i, 'XXXXXX').locked, false);
  const blocked = guard.fail('novo-ip', 'XXXXXX');
  assert.equal(blocked.locked, true);
  assert.ok(blocked.retryMs > 0);
});
test('origens de Socket.IO: apenas a própria origem, sem bloquear clientes nativos sem Origin', () => {
  const shield = makeProtection();
  try {
    const host = 'quebra-apk.onrender.com';
    assert.equal(shield.sameOrigin({ headers: { host, origin: 'https://' + host } }), true);
    assert.equal(shield.sameOrigin({ headers: { host, origin: 'https://outro-site.test' } }), false);
    assert.equal(shield.sameOrigin({ headers: { host, origin: 'null' } }), false);
    assert.equal(shield.sameOrigin({ headers: { host } }), true);
    assert.equal(shield.sameOrigin({ headers: { host: '127.0.0.1:4567', origin: 'http://127.0.0.1:4567' } }), true);
    assert.equal(shield.sameOrigin({ headers: { host, origin: 'http://' + host } }), false);
  } finally { shield.close(); }
});
test('conexões Socket.IO: cotas, pacotes excessivos e liberação após fechar', () => {
  const shield = makeProtection({ MAX_SOCKETS_PER_IP: '4', MAX_LIVE_SOCKETS: '50' });
  let middleware;
  const io = { use(fn) { middleware = fn; } };
  shield.installSocketShield(io);
  const fake = (ip, id) => {
    const sock = new EventEmitter(); sock.id = id;
    sock.handshake = { address: ip };
    sock.conn = new EventEmitter();
    sock.use = (fn) => { sock.packetGuard = fn; };
    return sock;
  };
  try {
    const sockets = Array.from({ length: 5 }, (_, i) => fake('1.2.3.4', 's' + i));
    for (let i = 0; i < 4; i++) middleware(sockets[i], e => assert.equal(e, undefined));
    middleware(sockets[4], e => assert.equal(e.message, 'busy'));
    assert.equal(shield.stats().activeSockets, 4);
    sockets[0].emit('disconnect');
    sockets[0].conn.emit('close');
    assert.equal(shield.stats().activeSockets, 3, 'idempotência evita decremento duplo');
    middleware(sockets[4], e => assert.equal(e, undefined));
    let reject = 0;
    for (let i = 0; i < 95; i++) sockets[4].packetGuard(['ch:ready', {}], e => { if (e) reject++; });
    assert.equal(reject, 5);
    assert.equal(shield.stats().activeSockets, 4);
    for (const sock of sockets.slice(1)) sock.emit('disconnect');
    assert.equal(shield.stats().activeSockets, 0);
  } finally { shield.close(); }
});
test('TLS de banco rejeita certificados inválidos em produção e preserva Postgres local', () => {
  assert.equal(sslOptions(true, {}), false);
  assert.deepEqual(sslOptions(false, { DB_SSL_VERIFY: '0', NODE_ENV: 'production' }), { rejectUnauthorized: true });
  assert.deepEqual(sslOptions(false, { DB_SSL_VERIFY: '0', NODE_ENV: 'test' }), { rejectUnauthorized: true });
});
test('sessões revogadas e códigos de email têm validação e consumo atômico', () => {
  const acc = read('accounts.js');
  assert.match(acc, /DELETE FROM email_codes WHERE id = \$1 AND code_hash = \$2 AND attempts < \$3 AND expires_at > now\(\) RETURNING id/);
  assert.match(acc, /revokeSocketSessions\(req\.user\.id\)/);
  assert.match(acc, /socketSessionValid\(socket\)/);
  assert.match(acc, /sequence !== authGeneration/);
  assert.match(acc, /SELECT 1 FROM sessions WHERE user_id = \$1 AND token_hash = \$2 AND expires_at > now\(\)/);
});
test('workflow verifica CVEs conhecidas e regressões antes de integrar o PR', () => {
  const yml = read('.github/workflows/seguranca-dependencias.yml');
  assert.match(yml, /npm audit --omit=dev --audit-level=high/);
  assert.match(yml, /npm ci/);
  assert.match(yml, /npm test/);
});
test('nenhum script visual ou migração SQL é alterado e o protocolo do jogo é preservado', () => {
  const main = read('server.js'), challenge = read('challenge.js'), guard = read('resource-guard.js');
  assert.match(main, /protection\.allowRoom\(socket, rooms\.size \+ challenge\.size\(\)\)/);
  assert.match(challenge, /allowRoom && !allowRoom\(socket\)/);
  assert.match(main, /maxHttpBufferSize: 1e5/);
  assert.doesNotMatch(main, /app\.get\('\/api\/test-outbox'/);
  assert.match(main, /socket\.on\('create'/);
  assert.match(challenge, /socket\.on\('ch:create'/);
  assert.match(guard, /activeSockets/);
});
