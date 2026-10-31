'use strict';
// Partida cooperativa de verdade: servidor real + dois clientes Socket.IO. Sem banco (modo visitante).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

let srv, cfgJson;
test.before(async () => { srv = await startServer(); cfgJson = await (await fetch(srv.url + '/api/config')).json(); });
test.after(async () => { await srv.stop(); });

async function novaSala(pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const r1 = await a.emitAck('create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, name: 'Ana' });
  assert.ok(r1.ok, JSON.stringify(r1));
  const r2 = await b.emitAck('join', { pid: 'pid-b-' + Math.random(), code: r1.snapshot.code, name: 'Beto' });
  assert.ok(r2.ok, JSON.stringify(r2));
  return { a, b, snap: r2.snapshot, code: r1.snapshot.code };
}
const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });
const fecha = (...s) => s.forEach((x) => x.close());

test('/api/config traz os campos que o cliente lê', () => {
  for (const k of ['images', 'presets', 'defaultPieces', 'hints', 'spots', 'maxName', 'chat', 'codeLen', 'phrases', 'avatars', 'push', 'accounts', 'upload']) assert.ok(k in cfgJson, 'faltou ' + k);
  assert.equal(cfgJson.accounts.enabled, false, 'sem DATABASE_URL as contas ficam desligadas');
  assert.deepEqual(cfgJson.presets.map((p) => p.pieces), [6, 12, 20, 30, 48]);
  assert.equal(cfgJson.codeLen, 6);
  assert.ok(cfgJson.images.length >= 1);
});

test('entrar: sala só comporta 2 e código errado dá "notfound"', async () => {
  const { a, b, snap, code } = await novaSala(6);
  assert.equal(code.length, 6);
  assert.equal(snap.pieces.length, 6);
  assert.ok(snap.pieces.every((p) => p.rot === 0), 'peças prontas para encaixar');
  assert.equal(snap.cfg.SNAP, Math.round(snap.cfg.TILE * 0.33));
  const c = await client(srv.url);
  const r = await c.emitAck('join', { pid: 'pid-carla-0001', code, name: 'Carla' });
  assert.equal(r.ok, false);
  const x = await c.emitAck('join', { pid: 'pid-carla-0001', code: 'ZZZZZZ', name: 'Carla' });
  assert.deepEqual([x.ok, x.error], [false, 'notfound']);
  fecha(a, b, c);
});

test('encaixe: só trava com rot===0 e a distância ≤ SNAP; o servidor crava a posição exata', async () => {
  const { a, b, snap } = await novaSala(12);
  const cfg = snap.cfg;
  assert.ok(snap.pieces.every((q) => q.rot === 0), 'cooperativo: peças já orientadas');
  const p = snap.pieces[0];
  const t = alvo(cfg, p);

  // 1) peça nasce rot===0; a distância de SNAP continua sendo exigida.
  a.emit('grab', { id: p.id });
  await b.once_('grabbed', (d) => d.id === p.id);
  // Afasta do encaixe antes de soltar; o giro não é necessário.
  a.emit('move', { id: p.id, x: cfg.FIELD_W / 2, y: cfg.FIELD_H - cfg.TRAY });
  await new Promise((r) => setTimeout(r, 80));
  const lockedCedo = [];
  a.on('locked', (d) => lockedCedo.push(d));
  // 3) solta a SNAP+3 do centro: não trava
  const fora = cfg.SNAP + 3;
  const solta1 = a.once_('released', (d) => d.id === p.id);
  const dir = t.x > cfg.FIELD_W / 2 ? -1 : 1;                 // para o centro: perto da borda o servidor limita (clamp) a coordenada
  a.emit('drop', { id: p.id, x: t.x + dir * fora, y: t.y });
  await solta1;
  assert.equal(lockedCedo.length, 0, 'travou longe demais');
  // 4) solta a SNAP-1 do centro: trava e a posição vira exatamente o centro
  a.emit('grab', { id: p.id });
  await b.once_('grabbed', (d) => d.id === p.id);
  const trava = b.once_('locked', (d) => d.id === p.id);
  a.emit('drop', { id: p.id, x: t.x + dir * (cfg.SNAP - 1), y: t.y });
  const L = await trava;
  assert.equal(L.x, t.x); assert.equal(L.y, t.y);
  assert.equal(L.locked, 1);
  fecha(a, b);
});

test('pacotes rotate antigos não giram peças cooperativas nem fazem encaixe', async () => {
  const { a, b, snap } = await novaSala(6);
  const p = snap.pieces[0], t = alvo(snap.cfg, p);
  a.emit('grab', { id: p.id });
  await b.once_('grabbed', (d) => d.id === p.id);
  a.emit('move', { id: p.id, x: t.x, y: t.y });
  await new Promise((r) => setTimeout(r, 80));
  let lockedByRotation = false;
  a.on('locked', () => { lockedByRotation = true; });
  const unchanged = b.once_('rotated', (d) => d.id === p.id);
  a.emit('rotate', { id: p.id });
  const r = await unchanged;
  assert.equal(r.rot, 0, 'servidor deve manter a peça correta');
  await new Promise((resolve) => setTimeout(resolve, 70));
  assert.equal(lockedByRotation, false, 'rotação antiga não encaixa sozinha');
  const trava = a.once_('locked', (d) => d.id === p.id);
  a.emit('drop', { id: p.id, x: t.x, y: t.y });
  await trava;
  fecha(a, b);
});

test('exclusividade: peça segurada ou travada recusa o outro jogador com "deny"', async () => {
  const { a, b, snap } = await novaSala(6);
  const p = snap.pieces[0];
  a.emit('grab', { id: p.id });
  await b.once_('grabbed', (d) => d.id === p.id);
  b.emit('grab', { id: p.id });
  const d1 = await b.once_('deny', (d) => d.id === p.id);
  assert.equal(d1.reason, 'held');
  fecha(a, b);
});

test('vitória: encaixar todas as peças dispara "won" nos dois e o jogo trava', async () => {
  const { a, b, snap } = await novaSala(6);
  const cfg = snap.cfg;
  const venceu = Promise.all([a.once_('won', null, 15000), b.once_('won', null, 15000)]);
  for (const p of snap.pieces) {
    const t = alvo(cfg, p);
    a.emit('grab', { id: p.id });
    await b.once_('grabbed', (d) => d.id === p.id);
    const trava = a.once_('locked', (d) => d.id === p.id);
    a.emit('drop', { id: p.id, x: t.x, y: t.y });
    await trava;
  }
  const [wa, wb] = await venceu;
  assert.equal(typeof wa.elapsedMs, 'number');
  assert.equal(wa.counts[0] + wa.counts[1], 6);
  assert.deepEqual(wa.counts, wb.counts);
  // depois de ganhar, não dá para pegar peças
  let pegou = false; b.on('grabbed', () => { pegou = true; });
  b.emit('grab', { id: 0 });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(pegou, false);
  fecha(a, b);
});

test('bate-papo: só frases prontas; texto livre é recusado', async () => {
  const { a, b } = await novaSala(6);
  const recebe = b.once_('chat', null, 3000);
  a.emit('chat', { p: 'oi' });
  const m = await recebe;
  assert.equal(m.p, 'oi');
  let livre = false; b.on('chat', (d) => { if (JSON.stringify(d).includes('ATAQUE-LIVRE')) livre = true; });
  const r1 = await a.emitAck('chat', { text: 'ATAQUE-LIVRE' });
  const r2 = await a.emitAck('chat', { p: 'ATAQUE-LIVRE' });
  assert.deepEqual([r1.ok, r2.ok], [false, false]);
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(livre, false, 'texto livre chegou ao outro jogador');
  fecha(a, b);
});
