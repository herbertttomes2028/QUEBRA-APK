'use strict';
// Sala Desafio de verdade: servidor real + dois clientes. Contagem encurtada para 300 ms (CH_COUNTDOWN_MS).
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

let srv, cfgJson;
test.before(async () => { srv = await startServer(); cfgJson = await (await fetch(srv.url + '/api/config')).json(); });
test.after(async () => { await srv.stop(); });

const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });
const fecha = (...s) => s.forEach((x) => x.close());
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));

async function largada(mode, pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const c1 = await a.emitAck('ch:create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, mode, name: 'Ana' });
  assert.ok(c1.ok, JSON.stringify(c1));
  const code = c1.lobby.code;
  const c2 = await b.emitAck('ch:join', { pid: 'pid-b-' + Math.random(), code, name: 'Beto' });
  assert.ok(c2.ok, JSON.stringify(c2));
  const sa = a.once_('ch:start', null, 8000), sb = b.once_('ch:start', null, 8000);
  assert.ok((await a.emitAck('ch:imgready', {})).ok);
  assert.ok((await b.emitAck('ch:imgready', {})).ok);
  assert.ok((await a.emitAck('ch:ready', { ready: true })).ok);
  assert.ok((await b.emitAck('ch:ready', { ready: true })).ok);
  const [ia, ib] = await Promise.all([sa, sb]);
  return { a, b, snapA: ia.snapshot, snapB: ib.snapshot, code };
}

// encaixa uma peça já "na mão" do jogador (ch:grab → gira → ch:drop em cima do alvo)
async function encaixa(s, cfg, p) {
  const t = alvo(cfg, p);
  s.emit('ch:grab', { id: p.id });
  await s.once_('grabbed', (d) => d.id === p.id);
  for (let i = 0; i < (4 - p.rot) % 4; i++) s.emit('ch:rotate', { id: p.id });
  const trava = s.once_('locked', (d) => d.id === p.id);
  s.emit('ch:drop', { id: p.id, x: t.x, y: t.y });
  return trava;
}

test('Desafio comum: lobby → contagem → jogo; cada um tem o seu tabuleiro', async () => {
  const { a, b, snapA, snapB } = await largada('comum', 6);
  assert.equal(snapA.mode, 'comum');
  assert.equal(snapA.pieces.length, 6);
  // os dois recebem as peças nas mesmas posições e giros
  assert.deepEqual(snapA.pieces.map((p) => [p.id, p.x, p.y, p.rot]), snapB.pieces.map((p) => [p.id, p.x, p.y, p.rot]));
  fecha(a, b);
});

test('Desafio comum: quem encaixa a última peça primeiro vence; o outro tabuleiro não muda', async () => {
  const { a, b, snapA, snapB } = await largada('comum', 6);
  const fim = Promise.all([a.once_('ch:end', null, 15000), b.once_('ch:end', null, 15000)]);
  for (const p of snapA.pieces) await encaixa(a, snapA.cfg, p);
  const [ea, eb] = await fim;
  assert.equal(ea.winner, 0); assert.equal(eb.winner, 0);
  assert.equal(ea.reason, 'complete');
  assert.equal(ea.total, 6);
  assert.equal(ea.players[0].locked, 6); assert.equal(ea.players[1].locked, 0);
  assert.equal(typeof ea.elapsedMs, 'number');
  // B nada encaixou: o tabuleiro dele continua com todas as peças soltas
  assert.equal(snapB.locked, 0);
  fecha(a, b);
});

test('Desafio: a regra de encaixe é a mesma (rot 0 e distância ≤ SNAP)', async () => {
  const { a, b, snapA } = await largada('comum', 12);
  const cfg = snapA.cfg;
  const p = snapA.pieces.find((q) => q.rot !== 0) || snapA.pieces[0];
  const t = alvo(cfg, p);
  a.emit('ch:grab', { id: p.id });
  await a.once_('grabbed', (d) => d.id === p.id);
  a.emit('ch:move', { id: p.id, x: cfg.FIELD_W / 2, y: cfg.FIELD_H - cfg.TRAY });
  await dorme(80);
  for (let i = 0; i < (4 - p.rot) % 4; i++) a.emit('ch:rotate', { id: p.id });
  await dorme(120);
  let travouCedo = false; a.on('locked', () => { travouCedo = true; });
  const solta = a.once_('released', (d) => d.id === p.id);
  const dir = t.x > cfg.FIELD_W / 2 ? -1 : 1;                 // para o centro: perto da borda o servidor limita (clamp) a coordenada
  a.emit('ch:drop', { id: p.id, x: t.x + dir * (cfg.SNAP + 3), y: t.y });
  await solta;
  assert.equal(travouCedo, false, 'travou além do SNAP');
  a.emit('ch:grab', { id: p.id });
  await a.once_('grabbed', (d) => d.id === p.id);
  const trava = a.once_('locked', (d) => d.id === p.id);
  a.emit('ch:drop', { id: p.id, x: t.x + dir * (cfg.SNAP - 1), y: t.y });
  const L = await trava;
  assert.deepEqual([L.x, L.y], [t.x, t.y]);
  fecha(a, b);
});

test('Quebrando Cabeças: caixa libera até 3 por rodada; a 4ª é bloqueada; rodada completa cospe as próximas 3', async () => {
  const { a, b, snapA } = await largada('quebra', 12);
  assert.equal(snapA.mode, 'quebra');
  assert.ok(snapA.pieces.every((p) => p.out === false), 'sem bandeja: nenhuma peça começa fora da caixa');
  const porId = new Map(snapA.pieces.map((p) => [p.id, p]));
  const manuais = [], autos = [];
  a.on('ch:gift', (d) => { (d.auto ? autos : manuais).push(d); });
  for (let i = 0; i < 3; i++) { const r = await a.emitAck('ch:gift', {}); assert.ok(r.ok, JSON.stringify(r)); }
  const r4 = await a.emitAck('ch:gift', {});
  assert.deepEqual([r4.ok, r4.error], [false, 'blocked']);
  await dorme(100);
  assert.equal(manuais.length, 3, 'a caixa deve ter entregue 3 peças');
  assert.equal(new Set(manuais.map((g) => g.id)).size, 3, 'peças diferentes');
  // encaixa as 3 pedidas: rodada completa → a caixa solta sozinha as 3 seguintes
  for (const g of manuais) await encaixa(a, snapA.cfg, { id: g.id, col: porId.get(g.id).col, row: porId.get(g.id).row, rot: g.rot });
  await dorme(150);
  assert.equal(autos.length, 3, 'rodada completa de 3 deve soltar 3 automáticas');
  assert.ok(autos.every((g) => manuais.every((m) => m.id !== g.id)), 'automáticas são peças novas');
  fecha(a, b);
});

test('Desafio: sair no meio da disputa dá a vitória ao outro', async () => {
  const { a, b } = await largada('comum', 6);
  const fim = b.once_('ch:end', null, 5000);
  a.emit('ch:leave');
  const e = await fim;
  assert.equal(e.winner, 1);
  fecha(a, b);
});
