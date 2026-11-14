'use strict';
// Arrasto visto pelo AMIGO no cooperativo (correção de 14/11/2026). Antes o arrasto ia como "volatile" (celular → servidor e
// servidor → amigo): com a conexão ocupada (modo polling, rede lenta), as posições eram descartadas e o amigo via a peça parada
// até ela encaixar (medido: de 60 posições chegavam 8 a 14). Agora: nada é descartado e, com a conexão ocupada, o celular guarda
// só a ÚLTIMA posição. E a peça do amigo que encaixa desliza até a casa em vez de pular.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const { startServer, wait } = require('./helpers');
const { io } = require('socket.io-client');

const ROOT = path.join(__dirname, '..');
const game = fs.readFileSync(path.join(ROOT, 'public', 'game.js'), 'utf8');
const server = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

function sendMoveIn(socket) {
  const a = game.indexOf('  var movePend = null'), b = game.indexOf('\n  }\n', game.indexOf('  function sendMove(')) + 4;
  assert.ok(a > 0 && b > a, 'sendMove encontrada');
  const ctx = { socket };
  vm.runInNewContext(game.slice(a, b), ctx, { filename: 'public/game.js:sendMove' });
  return ctx;
}
function fakeSocket(writable) {
  const sent = [], handlers = [];
  const engine = { transport: { writable }, once: (ev, fn) => { assert.equal(ev, 'drain'); handlers.push(fn); } };
  return { sent, handlers, engine, connected: true, io: { engine }, emit: (ev, d) => sent.push([ev, d]) };
}

test('código: o arrasto não usa mais "volatile" (nem no celular nem no repasse do servidor)', () => {
  assert.ok(!/volatile\.emit\(state\.duel \? 'ch:move' : 'move'/.test(game), 'celular: sem volatile no move');
  assert.match(game, /sendMove\(state\.duel \? 'ch:move' : 'move', \{ id: p\.id, x: Math\.round\(p\.x\), y: Math\.round\(p\.y\) \}\)/);
  assert.ok(!/volatile\.emit\('moved'/.test(server), 'servidor: sem volatile no moved');
  assert.match(server, /socket\.to\(c\.room\.code\)\.emit\('moved', \{ id: p\.id, x: Math\.round\(p\.x\), y: Math\.round\(p\.y\) \}\)/);
});

test('sendMove: conexão livre envia na hora; ocupada guarda só a última e envia ao liberar; sem conexão não guarda nada', () => {
  const livre = fakeSocket(true), c1 = sendMoveIn(livre);
  c1.sendMove('move', { id: 1, x: 10, y: 10 }); c1.sendMove('move', { id: 1, x: 20, y: 10 });
  assert.deepEqual(livre.sent.map((s) => s[1].x), [10, 20], 'websocket livre: tudo sai na hora, na ordem');

  const ocup = fakeSocket(false), c2 = sendMoveIn(ocup);
  for (let x = 10; x <= 50; x += 10) c2.sendMove('move', { id: 1, x, y: 10 });
  assert.equal(ocup.sent.length, 0, 'ocupada: nada sai ainda');
  assert.equal(ocup.handlers.length, 1, 'espera a conexão liberar UMA vez (sem empilhar ouvintes)');
  ocup.handlers[0]();
  assert.deepEqual(ocup.sent, [['move', { id: 1, x: 50, y: 10 }]], 'ao liberar, sai só a ÚLTIMA posição (sem fila)');
  c2.sendMove('move', { id: 1, x: 60, y: 10 });
  assert.equal(ocup.handlers.length, 2, 'depois de liberar, volta a esperar na próxima vez');

  const troca = fakeSocket(false), c3 = sendMoveIn(troca);
  c3.sendMove('move', { id: 1, x: 1, y: 1 });
  troca.io.engine = { transport: { writable: false }, once: (ev, fn) => troca.handlers.push(fn) };   // reconectou: conexão nova
  c3.sendMove('move', { id: 1, x: 2, y: 2 });
  assert.equal(troca.handlers.length, 2, 'conexão nova: volta a esperar nela (não fica preso na antiga)');
  troca.handlers[1]();
  assert.deepEqual(troca.sent, [['move', { id: 1, x: 2, y: 2 }]]);

  const off = fakeSocket(false), c4 = sendMoveIn(off); off.connected = false;
  c4.sendMove('move', { id: 1, x: 5, y: 5 });
  assert.equal(off.sent.length + off.handlers.length, 0, 'sem conexão: não guarda posição velha para depois');
});

test('tela do amigo: peça que ELE encaixou desliza até a casa; a minha e o modo "menos animações" continuam pulando direto', () => {
  const h = game.slice(game.indexOf("socket.on('locked'"), game.indexOf("socket.on('meta'"));
  assert.match(h, /if \(d\.by !== state\.idx && !reducedMotion\(\) && Math\.hypot\(fromX - d\.x, fromY - d\.y\) > 2\)/);
  assert.match(h, /p\.glide = \{ fx: fromX, fy: fromY, t0: performance\.now\(\), dur: 180 \}/);
  assert.match(h, /p\.x = d\.x; p\.y = d\.y; p\.tx = d\.x; p\.ty = d\.y;/, 'o alvo (tx/ty) é sempre a casa certa');
  const f = game.slice(game.indexOf('  function frame(now)'), game.indexOf('\n  function ', game.indexOf('  function frame(now)') + 10));
  assert.match(f, /\} else if \(p\.glide\) \{/);
  assert.match(f, /if \(gu >= 1 \|\| !p\.locked\) \{ p\.x = p\.tx; p\.y = p\.ty; p\.glide = null; \}/, 'termina exatamente na casa');
});

// proxy local que atrasa os dados (imita 4G), para o amigo ficar em polling com rede lenta
function delayProxy(targetPort, ms) {
  const srv = net.createServer({ allowHalfOpen: true }, (c) => {
    const up = net.connect({ port: targetPort, host: '127.0.0.1', allowHalfOpen: true });
    const pipe = (from, to) => { from.on('data', (d) => setTimeout(() => { if (!to.destroyed) to.write(d); }, ms)); from.on('end', () => setTimeout(() => { if (!to.destroyed) to.end(); }, ms + 5)); };
    pipe(c, up); pipe(up, c);
    const kill = () => { c.destroy(); up.destroy(); }; c.on('error', kill); up.on('error', kill);
  });
  return new Promise((res) => srv.listen(0, '127.0.0.1', () => res({ port: srv.address().port, close: () => srv.close() })));
}

test('sala real: com o amigo em polling atrás de rede lenta, todas as posições do arrasto chegam a ele', { timeout: 30000 }, async () => {
  const srv = await startServer();
  const px = await delayProxy(srv.port, 60);
  const mk = (url, t) => new Promise((res, rej) => { const s = io(url, { transports: t, upgrade: false, forceNew: true, reconnection: false }); s.on('connect', () => res(s)); s.on('connect_error', rej); });
  let a, b;
  try {
    a = await mk(srv.url, ['websocket']);
    b = await mk('http://127.0.0.1:' + px.port, ['polling']);
    const ack = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
    const img = (await (await fetch(srv.url + '/api/config')).json()).images[0].file;
    const cr = await ack(a, 'create', { pid: 'pa-' + Date.now(), imageId: img, pieces: 12 });
    assert.equal((await ack(b, 'join', { pid: 'pb-' + Date.now(), code: cr.snapshot.code })).ok, true);
    await wait(400);
    const cfg = cr.snapshot.cfg, pc = cr.snapshot.pieces[0], got = [];
    b.on('moved', (d) => { if (d.id === pc.id) got.push(d.x); });
    a.emit('grab', { id: pc.id }); await wait(100);
    const xs = [];
    for (let i = 0; i < 30; i++) { const x = 100 + i * 20; xs.push(x); a.emit('move', { id: pc.id, x, y: cfg.FIELD_H - 80 }); await wait(50); }   // longe da casa: o ímã não puxa
    await wait(1200);
    assert.ok(got.length >= 28, 'o amigo em polling recebeu ' + got.length + ' de 30 posições (antes, com volatile, a maioria se perdia)');
    assert.equal(got[got.length - 1], xs[xs.length - 1], 'a última posição chega');
  } finally { if (a) a.close(); if (b) b.close(); px.close(); await srv.stop(); }
});
