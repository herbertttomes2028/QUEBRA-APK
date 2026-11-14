'use strict';
// VAGA RESERVADA no cooperativo (decisão do proprietário em 14/11/2026; auditoria SEC-04).
//  - quem CAIU (internet, app fechado sem querer) continua dono da vaga: ninguém mais entra no lugar dele, e ele volta com o mesmo pid;
//  - quem SAIU de propósito (botão Sair = socket.disconnect()) não volta e a sala FECHA: o código não serve mais para ninguém entrar;
//  - quem ficou termina a partida sozinho.
// Antes, qualquer pessoa com o código tomava a vaga de quem caiu no meio da partida, e quem caiu recebia "sala cheia".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, client, wait } = require('./helpers');

const ack = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));
const pid = (n) => 'pid-' + n + '-' + Math.random().toString(36).slice(2, 10);
const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });
async function sala(srv) {
  const img = (await (await fetch(srv.url + '/api/config')).json()).images[0].file;
  const a = await client(srv.url), b = await client(srv.url);
  const pa = pid('a'), pb = pid('b');
  const cr = await ack(a, 'create', { pid: pa, imageId: img, pieces: 6 });
  const jb = await ack(b, 'join', { pid: pb, code: cr.snapshot.code });
  assert.equal(jb.ok, true); assert.equal(jb.snapshot.status, 'playing', 'com os dois na sala a partida começa');
  return { a, b, pa, pb, code: cr.snapshot.code, snap: jb.snapshot };
}
// simula app fechado / internet caída: a conexão some sem o aplicativo chamar socket.disconnect()
const cair = async (s) => { s.io.engine.close(); await wait(250); };

test('caiu (app fechado/internet): a vaga fica reservada; quem tem o código não entra; quem caiu volta para o mesmo lugar', async () => {
  const srv = await startServer();
  try {
    const r = await sala(srv);
    await cair(r.b);
    const c = await client(srv.url);
    const jc = await ack(c, 'join', { pid: pid('c'), code: r.code });
    assert.deepEqual([jc.ok, jc.error], [false, 'full'], 'terceira pessoa NÃO toma a vaga de quem caiu (antes tomava)');
    const b2 = await client(srv.url);
    const volta = await ack(b2, 'join', { pid: r.pb, code: r.code });
    assert.equal(volta.ok, true, 'quem caiu volta'); assert.equal(volta.idx, 1, 'para a MESMA vaga'); assert.equal(volta.snapshot.status, 'playing');
    const meta = volta.snapshot.players; assert.equal(meta.filter((p) => p.connected).length, 2);
    [r.a, c, b2].forEach((s) => s.close());
  } finally { await srv.stop(); }
});

test('saiu de propósito (botão Sair): a sala fecha para todos os outros; quem ficou termina sozinho e pode cair e voltar', async () => {
  const srv = await startServer();
  try {
    const r = await sala(srv);
    r.b.disconnect(); await wait(250);                                     // é o que o botão Sair faz (leaveCoop → socket.disconnect())
    const c = await client(srv.url);
    assert.deepEqual(await ack(c, 'join', { pid: pid('c'), code: r.code }).then((x) => [x.ok, x.error]), [false, 'notfound'], 'o código não serve mais (mesma resposta de sala inexistente)');
    const b2 = await client(srv.url);
    assert.deepEqual(await ack(b2, 'join', { pid: r.pb, code: r.code }).then((x) => [x.ok, x.error]), [false, 'notfound'], 'quem saiu de propósito não volta');
    // quem ficou cai e volta (a reserva continua valendo para ele)
    await cair(r.a);
    const a2 = await client(srv.url);
    const va = await ack(a2, 'join', { pid: r.pa, code: r.code }); assert.equal(va.ok, true); assert.equal(va.idx, 0);
    // e termina a partida sozinho
    const won = new Promise((ok) => a2.once('won', ok));
    for (const p of va.snapshot.pieces.filter((q) => !q.locked)) {
      const t = alvo(va.snapshot.cfg, p);
      a2.emit('grab', { id: p.id }); await wait(30);
      a2.emit('drop', { id: p.id, x: t.x, y: t.y }); await wait(30);
    }
    const w = await Promise.race([won, wait(4000).then(() => null)]);
    assert.ok(w, 'quem ficou concluiu a partida sozinho (evento won)');
    [c, b2, a2].forEach((s) => s.close());
  } finally { await srv.stop(); }
});

test('ir para outra sala também é sair de propósito; antes de alguém entrar a segunda vaga continua livre', async () => {
  const srv = await startServer();
  try {
    const img = (await (await fetch(srv.url + '/api/config')).json()).images[0].file;
    const a = await client(srv.url), b = await client(srv.url), c = await client(srv.url);
    const cr = await ack(a, 'create', { pid: pid('a'), imageId: img, pieces: 6 });
    assert.equal(cr.snapshot.status, 'waiting');
    const pb = pid('b');
    assert.equal((await ack(b, 'join', { pid: pb, code: cr.snapshot.code })).ok, true, 'vaga nunca ocupada: entra normalmente');
    assert.equal((await ack(b, 'create', { pid: pb, imageId: img, pieces: 6 })).ok, true, 'B criou outra sala (saiu da primeira)');
    const jc = await ack(c, 'join', { pid: pid('c'), code: cr.snapshot.code });
    assert.deepEqual([jc.ok, jc.error], [false, 'notfound'], 'a primeira sala fechou para novos');
    [a, b, c].forEach((s) => s.close());
  } finally { await srv.stop(); }
});

test('código: a tomada da vaga de quem caiu não existe mais; o motivo da desconexão decide entre "caiu" e "saiu"', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.ok(!/assume a vaga de quem caiu/.test(s) && !/findIndex\(\(p\) => p && !p\.connected\)/.test(s), 'sem tomada de vaga no cooperativo');
  assert.match(s, /socket\.on\('disconnect', \(reason\) => leaveCurrent\(socket, reason === 'client namespace disconnect'\)\);/);
  assert.match(s, /if \(explicit === true && !room\.solo\) \{ pl\.left = true; room\.closed = true; \}/);
});

test('celular: lembra a sala cooperativa, volta para ela ao abrir o app e esquece ao sair pelo botão Sair', () => {
  const g = fs.readFileSync(path.join(__dirname, '..', 'public', 'game.js'), 'utf8');
  assert.match(g, /var COOP_KEY = 'coop';/);
  assert.match(g, /function leaveCoop\(\) \{ clearCoopLocal\(\); socket\.disconnect\(\); reloadClean\(\); \}/);
  assert.match(g, /if \(!param && \(maybeResumeDuel\(\) \|\| maybeResumeCoop\(\)\)\) return;/);
  assert.match(g, /state\.pid = coopPidFor\(code\);/, 'entrar pelo código usa a identidade guardada daquela sala');
  assert.match(g, /if \(res\.snapshot && res\.snapshot\.code && !res\.snapshot\.solo\) saveCoopLocal\(res\.snapshot\.code\); else clearCoopLocal\(\);/);
  assert.match(g, /function goHome\(\) \{\n    clearCoopLocal\(\);/);
  assert.equal((g.match(/else leaveCoop\(\);/g) || []).length, 3, 'Sair, bloquear e denunciar+bloquear usam o mesmo caminho');
  assert.ok(!/socket\.disconnect\(\); reloadClean\(\);/.test(g.replace(/function leaveCoop\(\) \{[^}]*\}/, '')), 'nenhuma saída do cooperativo esquece de apagar a lembrança');
});
