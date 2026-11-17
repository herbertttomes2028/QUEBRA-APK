'use strict';
// Auditoria final de segurança (17/11/2026): SEC-10 (IP real atrás do Cloudflare), SEC-11 (evento de socket malformado derrubava o servidor)
// e SEC-12 (chave herdada do JavaScript chegava ao SQL da Loja). Servidor real, sem banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, startServer, client, wait } = require('./helpers');
const { io } = require('socket.io-client');
const security = require('../security');
const { makeProtection } = require('../resource-guard');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const VENENO = () => JSON.parse('{"toString":1,"valueOf":1}');          // String()/Number() lançam erro com este objeto

/* ============================ SEC-11 ============================ */
test('SEC-11: objetos malformados no código da sala, na quantidade e no número da peça NÃO derrubam o servidor (cooperativo, Solo e Desafio)', async () => {
  const srv = await startServer({ ROOM_CREATES_PER_10MIN: '100' });
  try {
    const a = await client(srv.url, { fila: true });
    const r = await a.emitAck('create', { pid: 'sec11-dono-x', imageId: 'lib:lib-fauna-01.webp', pieces: 20, name: 'A', avatar: '🙂' });
    assert.equal(r.ok, true);
    const ruins = [['join', { pid: 'sec11-b-xxx', code: VENENO() }], ['create', { pid: 'sec11-c-xxx', imageId: 'lib:lib-fauna-01.webp', pieces: VENENO() }], ['restart', { pieces: VENENO() }],
      ['grab', { id: VENENO() }], ['move', { id: VENENO(), x: VENENO(), y: VENENO() }], ['drop', { id: VENENO(), x: VENENO(), y: VENENO() }], ['spot', { id: VENENO() }], ['rotate', { id: VENENO() }],
      ['ch:join', { pid: 'sec11-d-xxx', code: VENENO() }], ['ch:create', { pid: 'sec11-e-xxx', imageId: 'lib:lib-fauna-01.webp', pieces: VENENO(), mode: 'comum' }]];
    const b = await client(srv.url, { fila: true });
    const dentro = new Set(['restart', 'grab', 'move', 'drop', 'spot', 'rotate']);             // o dono só manda os de DENTRO da sala (criar outra sala fecharia esta, de propósito)
    for (const [ev, d] of ruins) { b.emit(ev, d, () => {}); if (dentro.has(ev)) a.emit(ev, d, () => {}); }
    // a peça segurada recebe posição venenosa (o clamp antes lançava erro aqui)
    const id = r.snapshot.pieces.find((p) => p.out !== false).id;
    a.emit('grab', { id }); await wait(80); a.emit('move', { id, x: VENENO(), y: 10 }); a.emit('drop', { id, x: 10, y: VENENO() });
    await wait(400);
    assert.equal(await (await fetch(srv.url + '/health')).text(), 'ok', 'o servidor continua de pé');
    const c = await client(srv.url, { fila: true });
    const ok = await c.emitAck('join', { pid: 'sec11-normal', code: r.snapshot.code, name: 'B', avatar: '🙂' });
    assert.equal(ok.ok, true, 'e uma pessoa de verdade ainda entra na sala: ' + JSON.stringify(ok));
    assert.doesNotMatch(srv.log(), /TypeError: Cannot convert object to primitive value\n\s+at String/, 'nenhuma pilha de erro de conversão escapou');
    for (const s of [a, b, c]) s.disconnect();
  } finally { await srv.stop(); }
});

test('SEC-11: Desafio COM a partida em andamento (o 2º ponto que o teste inicial não alcançava): peça, posição e marcador venenosos não derrubam', async () => {
  const srv = await startServer({ ROOM_CREATES_PER_10MIN: '100' });
  try {
    const a = await client(srv.url, { fila: true }), b = await client(srv.url, { fila: true });
    const c1 = await a.emitAck('ch:create', { pid: 'sec11-duelo-a', imageId: 'lib:lib-fauna-01.webp', pieces: 20, mode: 'comum', name: 'Ana' });
    assert.ok(c1.ok, JSON.stringify(c1));
    assert.ok((await b.emitAck('ch:join', { pid: 'sec11-duelo-b', code: c1.lobby.code, name: 'Beto' })).ok);
    const sa = a.once_('ch:start', null, 8000);
    for (const s of [a, b]) assert.ok((await s.emitAck('ch:imgready', {})).ok);
    for (const s of [a, b]) assert.ok((await s.emitAck('ch:ready', { ready: true })).ok);
    const st = await sa; const id = st.snapshot.pieces.find((p) => p.out).id;
    for (const ev of ['ch:grab', 'ch:move', 'ch:drop', 'ch:rotate', 'ch:spot', 'ch:hint', 'ch:gift']) a.emit(ev, { id: VENENO(), x: VENENO(), y: VENENO() }, () => {});
    a.emit('ch:grab', { id }); await wait(80); a.emit('ch:move', { id, x: VENENO(), y: 50 }); a.emit('ch:drop', { id, x: 50, y: VENENO() });
    await wait(400);
    assert.equal(await (await fetch(srv.url + '/health')).text(), 'ok', 'o servidor continua de pé');
    const spot = await b.emitAck('ch:spot', { id });
    assert.equal(spot.ok, true, 'e a partida do outro jogador segue normal (marcador 📍 funcionando): ' + JSON.stringify(spot));
    a.disconnect(); b.disconnect();
  } finally { await srv.stop(); }
});

test('SEC-11: a proteção central pega erro síncrono e promessa recusada de QUALQUER ouvinte, sem mudar argumentos, "this" nem retorno', async () => {
  const EventEmitter = require('node:events');
  const prot = makeProtection({}); let mw = null; const fakeIo = { use: (fn) => { mw = fn; } };
  prot.installSocketShield(fakeIo);
  const socket = new EventEmitter(); socket.id = 'x'; socket.handshake = { headers: {}, address: '10.0.0.1' }; socket.use = () => {};
  await new Promise((res) => mw(socket, res));
  let recebido = null, self = null;
  socket.on('bom', function (a, b) { recebido = [a, b]; self = this; return 42; });
  socket.on('ruim', () => { throw new TypeError('quebrou'); });
  socket.on('async', async () => { throw new Error('recusou'); });
  const antes = prot.handlerErrors();
  assert.doesNotThrow(() => socket.emit('ruim', 1));
  socket.emit('async'); await wait(20);
  socket.emit('bom', 'a', 'b');
  assert.deepEqual(recebido, ['a', 'b']); assert.equal(self, socket);
  let n = 0; socket.once('umaVez', () => n++); socket.emit('umaVez'); socket.emit('umaVez');
  assert.equal(n, 1); assert.equal(socket.listenerCount('umaVez'), 0, 'o "once" protegido é removido depois de disparar (sem vazamento)');
  socket.on('lancaVeneno', () => { throw VENENO(); }); socket.on('recusaVeneno', async () => { throw VENENO(); });
  assert.doesNotThrow(() => socket.emit('lancaVeneno')); socket.emit('recusaVeneno'); await wait(20);
  assert.equal(prot.handlerErrors() - antes, 4, 'os 4 erros (comum e "venenoso", síncrono e promessa) foram contados sem derrubar o tratamento; o registro diz só o nome do evento');
  let m = 0; const f = () => m++; socket.on('sai', f); socket.off('sai', f); socket.emit('sai');
  assert.deepEqual([m, socket.listenerCount('sai')], [0, 0], 'socket.off(fn) continua removendo um ouvinte protegido');
  const src = read('resource-guard.js');
  assert.match(src, /socket\.on\('error', \(\) => \{\}\);\n\s+guardHandlers\(socket\);/, 'a proteção é ligada na blindagem, antes de qualquer evento do jogo ser registrado');
});

test('SEC-11: as conversões dos dados do celular só aceitam número e texto (server.js e challenge.js); promessa sem tratamento não derruba', () => {
  const sv = read('server.js'), ch = read('challenge.js');
  assert.match(sv, /process\.on\('unhandledRejection', \(err\) => \{[\s\S]{0,300}try \{ msg = String\(/, 'a rede final de promessas existe e não quebra com um erro que não vira texto');
  assert.match(read('resource-guard.js'), /try \{ msg = String\(\(err && err\.message\) \|\| err\)\.slice\(0, 120\); \} catch/, 'o registro da proteção central também não quebra');
  assert.doesNotMatch(sv, /process\.on\('uncaughtException'/, 'erro síncrono fora dos eventos continua encerrando (o Render reinicia): não se esconde estado ruim');
  assert.match(sv, /const asNum = \(v\) => \(typeof v === 'number' \? v : typeof v === 'string' \? Number\(v\) : NaN\);/);
  for (const re of [/function validPieces\(n, fallback\) \{\n\s+n = asNum\(n\);/, /function clamp\(v, min, max\) \{\n\s+v = asNum\(v\);/, /function pieceFrom\(room, id\) \{\n\s+id = asNum\(id\);/, /const code = asStr\(data\.code\)/]) assert.match(sv, re);
  assert.doesNotMatch(sv, /String\(data\.|Number\(data\./, 'nenhum String()/Number() direto em dado do socket');
  assert.doesNotMatch(ch, /String\(data\.code \|\||id = Number\(id\)/);
});

/* ============================ SEC-12 ============================ */
test('SEC-12: "constructor", "__proto__" e outros nomes herdados não escolhem coluna na Loja (nem chegam ao banco)', async () => {
  const shop = require('../shop');
  const db = { pool: { connect: async () => { throw new Error('não deveria chegar ao banco'); } }, q: async () => { throw new Error('não deveria chegar ao banco'); } };
  const svc = shop.makeService(db);
  for (const cat of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    const r = await svc.equip('00000000-0000-0000-0000-000000000000', null, cat);
    assert.deepEqual([r.ok, r.error], [false, 'invalid'], cat);
  }
  assert.match(read('shop.js'), /Object\.prototype\.hasOwnProperty\.call\(PET_SLOT, category\)/);
});

/* ============================ SEC-10 ============================ */
test('SEC-10: IP real atrás do Cloudflare + Render; sem Cloudflare na frente, nada muda; ninguém forja o endereço', () => {
  const ip = security.clientIp, CF = '104.22.17.40';
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.1, ' + CF, 'cf-connecting-ip': '201.1.0.1' }, '10.0.0.5'), '201.1.0.1', 'o celular, não o Cloudflare');
  assert.equal(ip({ 'x-forwarded-for': '8.8.8.8, 201.1.0.9, ' + CF, 'cf-connecting-ip': '201.1.0.9' }, '10.0.0.5'), '201.1.0.9', 'endereço inventado pelo celular é ignorado');
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.2, ' + CF }, '10.0.0.5'), '201.1.0.2', 'sem CF-Connecting-IP: o endereço que o Cloudflare acrescentou');
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.3', 'cf-connecting-ip': '9.9.9.9' }, '10.0.0.5'), '201.1.0.3', 'CF-Connecting-IP sem Cloudflare na frente é ignorado (forjado)');
  assert.equal(ip({ 'x-forwarded-for': '10.88.0.1' }, '127.0.0.1'), '10.88.0.1', 'sem Cloudflare: o último, como antes');
  assert.equal(ip({}, '127.0.0.1'), '127.0.0.1');
  assert.equal(ip({ 'x-forwarded-for': '2804:14c::1, 2606:4700::6810:1111', 'cf-connecting-ip': '2804:14c::1' }, '::1'), '2804:14c:0:0::/64', 'IPv6 pelo Cloudflare: conta pelo bloco /64');
  assert.equal(ip({ 'x-forwarded-for': '2804:14c:65a1:8000::9, ' + CF, 'cf-connecting-ip': '2804:14c:65a1:8000::9' }), ip({ 'x-forwarded-for': '2804:14c:65a1:8000:ffff::1, ' + CF, 'cf-connecting-ip': '2804:14c:65a1:8000:ffff::1' }), 'trocar de endereço dentro do mesmo /64 não escapa do limite');
  assert.equal(ip({ 'x-forwarded-for': '2001:db8::5' }, '::1'), '2001:db8::5', 'sem Cloudflare o IPv6 fica como sempre foi');
  assert.equal(ip({ 'x-forwarded-for': 'texto-livre, ' + CF }), CF, 'corrente estranha atrás do Cloudflare: fica o endereço do Cloudflare (como antes), nunca um texto livre');
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.6, ' + CF, 'cf-connecting-ip': '::ffff:201.1.0.6' }), '201.1.0.6', 'IPv4 escrito como IPv6 vira o IPv4');
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.4, ' + CF, 'cf-connecting-ip': ['1.1.1.1'] }, '10.0.0.5'), '201.1.0.4', 'cabeçalho repetido/estranho não vale');
  for (const x of ['104.16.0.1', '172.64.1.1', '162.158.9.9', '::ffff:104.22.17.40', '2a06:98c0::1']) assert.equal(security.isCloudflare(x), true, x);
  for (const x of ['201.1.0.1', '10.0.0.1', '127.0.0.1', '', 'lixo', '104.32.0.1']) assert.equal(security.isCloudflare(x), false, x);
  assert.equal(security.CLOUDFLARE_V4.length, 15); assert.equal(security.CLOUDFLARE_V6.length, 7);
  const shape = security.ipShape({ 'x-forwarded-for': '201.1.0.1, ' + CF, 'cf-connecting-ip': '201.1.0.1' });
  assert.equal(JSON.stringify(shape).includes('201.1'), false, 'o diagnóstico nunca mostra endereços');
});

test('SEC-10: req.ip do HTTP e o IP do socket usam a MESMA regra (dois celulares atrás do mesmo Cloudflare têm limites separados)', async () => {
  const sv = read('server.js');
  assert.match(sv, /Object\.defineProperty\(app\.request, 'ip', \{ configurable: true, enumerable: true, get\(\) \{ return security\.clientIp\(this\.headers, this\.socket && this\.socket\.remoteAddress\); \} \}\);/);
  assert.match(read('security.js'), /function ipOfSocket\(socket\) \{\n\s+const h = socket\.handshake \|\| \{\};\n\s+return clientIp\(h\.headers, h\.address\);/);
  const srv = await startServer({ ROOM_CREATES_PER_10MIN: '3' });
  try {
    const CF = '104.22.17.40', criar = async (ip, n) => { const s = io(srv.url, { transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { 'x-forwarded-for': ip + ', ' + CF, 'cf-connecting-ip': ip } }); await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); }); const r = await new Promise((res) => s.emit('create', { pid: 'sec10-' + ip + '-' + n, imageId: 'lib:lib-fauna-01.webp', pieces: 6, name: 'A', avatar: '🙂' }, res)); s.disconnect(); return r.ok; };
    const a = []; for (let n = 0; n < 4; n++) a.push(await criar('201.5.0.1', n));
    assert.deepEqual(a, [true, true, true, false], 'o mesmo celular continua limitado (3 salas)');
    assert.equal(await criar('201.5.0.2', 0), true, 'outro celular atrás do MESMO Cloudflare não é barrado pelo limite do primeiro');
  } finally { await srv.stop(); }
});
