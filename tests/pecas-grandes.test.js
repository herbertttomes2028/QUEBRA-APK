'use strict';
// QUANTIDADES GRANDES (rodada pecas-grandes, 17/11/2026): 64 (8×8), 88 (8×11) e 96 (8×12) peças, em todos os modos.
// Só nelas: ímã mais forte (×1,4), lâmpada sem limite e mais dicas de lugar 📍 (10, 15 e 25). As quantidades de sempre não mudam.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, client } = require('./helpers');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });
const GRANDES = { 64: { cols: 8, rows: 8, spots: 10 }, 88: { cols: 8, rows: 11, spots: 15 }, 96: { cols: 8, rows: 12, spots: 25 } };

let srv, cfgJson;
test.before(async () => { srv = await startServer({ ROOM_CREATES_PER_10MIN: '100', DRAG_MAGNET: '0' }); cfgJson = await (await fetch(srv.url + '/api/config')).json(); });
test.after(async () => { await srv.stop(); });

async function salaCoop(pieces, solo) {
  const a = await client(srv.url);
  const r1 = await a.emitAck('create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, name: 'Ana', solo: solo === true }); assert.ok(r1.ok, JSON.stringify(r1));
  if (solo) return { a, b: null, snap: r1.snapshot, ev: { grab: 'grab', move: 'move', drop: 'drop', hint: 'hint', spot: 'spot' } };
  const b = await client(srv.url);
  const r2 = await b.emitAck('join', { pid: 'pid-b-' + Math.random(), code: r1.snapshot.code, name: 'Beto' }); assert.ok(r2.ok, JSON.stringify(r2));
  return { a, b, snap: r2.snapshot, ev: { grab: 'grab', move: 'move', drop: 'drop', hint: 'hint', spot: 'spot' } };
}
async function salaDesafio(mode, pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const c1 = await a.emitAck('ch:create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, mode, name: 'Ana' }); assert.ok(c1.ok, JSON.stringify(c1));
  const c2 = await b.emitAck('ch:join', { pid: 'pid-b-' + Math.random(), code: c1.lobby.code, name: 'Beto' }); assert.ok(c2.ok, JSON.stringify(c2));
  const sa = a.once_('ch:start', null, 8000), sb = b.once_('ch:start', null, 8000);
  for (const s of [a, b]) { assert.ok((await s.emitAck('ch:imgready', {})).ok); assert.ok((await s.emitAck('ch:ready', { ready: true })).ok); }
  const [ia] = await Promise.all([sa, sb]); await dorme(250);
  return { a, b, snap: ia.snapshot, ev: { grab: 'ch:grab', move: 'ch:move', drop: 'ch:drop', hint: 'ch:hint', spot: 'ch:spot' } };
}
const fecha = (...s) => s.forEach((x) => x && x.close());
async function solta(sala, cfg, p, dx) {
  const s = sala.a, t = alvo(cfg, p);
  s.emit(sala.ev.grab, { id: p.id }); await dorme(70);
  s.emit(sala.ev.move, { id: p.id, x: cfg.FIELD_W / 2, y: cfg.FIELD_H - cfg.TRAY }); await dorme(70);
  const sx = t.x > cfg.FIELD_W / 2 ? -1 : 1;
  const res = new Promise((ok) => { s.on('locked', (d) => { if (d.id === p.id) ok('locked'); }); s.on('released', (d) => { if (d.id === p.id) ok('released'); }); });
  s.emit(sala.ev.drop, { id: p.id, x: t.x + sx * dx, y: t.y });
  return Promise.race([res, dorme(1500).then(() => 'timeout')]);
}

test('/api/config: 8 quantidades, as 3 grandes por último, com 8 colunas e as ajudas próprias', () => {
  assert.deepEqual(cfgJson.presets.map((p) => p.pieces), [6, 12, 20, 30, 48, 64, 88, 96]);
  for (const p of cfgJson.presets) {
    const g = GRANDES[p.pieces];
    if (!g) { assert.ok(!p.grande && !p.ima && !p.lampadaLivre && !p.spots, 'quantidade de sempre sem mudança: ' + p.pieces); continue; }
    assert.equal(p.cols, g.cols); assert.equal(p.rows, g.rows); assert.equal(p.cols * p.rows, p.pieces);
    assert.equal(p.grande, true); assert.equal(p.ima, 1.4); assert.equal(p.lampadaLivre, true); assert.equal(p.spots, g.spots);
    assert.ok(p.rows / p.cols >= 1, 'grade em pé ou quadrada (a imagem é em pé)');
  }
});

test('ímã: mais forte só nas 3 grandes (0,35 × 1,4), igual nos modos; nas outras continua 0,35', async () => {
  for (const n of [6, 12, 20, 30, 48]) { const c = await salaCoop(n); assert.equal(c.snap.cfg.SNAP, Math.round(c.snap.cfg.TILE * 0.35), 'coop ' + n); assert.equal(c.snap.cfg.IMA, 1); fecha(c.a, c.b); }
  for (const n of [64, 88, 96]) {
    const c = await salaCoop(n), cfg = c.snap.cfg;
    assert.equal(cfg.COLS, 8); assert.equal(cfg.PIECES, n); assert.equal(cfg.IMA, 1.4);
    assert.equal(cfg.SNAP, Math.round(cfg.TILE * 0.35 * 1.4), 'coop ' + n); assert.ok(cfg.SNAP < cfg.TILE / 2 + 1, 'nunca alcança o centro da casa vizinha');
    fecha(c.a, c.b);
    const s = await salaCoop(n, true); assert.equal(s.snap.cfg.SNAP, cfg.SNAP, 'solo ' + n); fecha(s.a);
    for (const modo of ['comum', 'quebra']) { const d = await salaDesafio(modo, n); assert.equal(d.snap.cfg.SNAP, Math.round(d.snap.cfg.TILE * 0.35 * 1.4), modo + ' ' + n); assert.equal(d.snap.cfg.PIECES, n); fecha(d.a, d.b); }
  }
});

test('encaixe com o ímã forte: trava a SNAP-1 e recusa a SNAP+3 (a regra continua só no servidor)', async () => {
  for (const n of [64, 96]) {
    const c = await salaCoop(n), cfg = c.snap.cfg, P = c.snap.pieces.filter((p) => p.out !== false && !p.locked);
    assert.equal(await solta(c, cfg, P[0], cfg.SNAP - 1), 'locked', n + ': a SNAP-1');
    assert.equal(await solta(c, cfg, P[1], cfg.SNAP + 3), 'released', n + ': a SNAP+3');
    assert.ok(cfg.SNAP - 1 > Math.round(cfg.TILE * 0.35), n + ': encaixa onde o ímã normal recusaria');
    fecha(c.a, c.b);
  }
});

test('ajudas: lâmpada sem limite nas 3 grandes (o contador não desce), 📍 = 10/15/25; nas outras, 10 e 5 como sempre', async () => {
  for (const n of [64, 88, 96]) {
    for (const tipo of ['coop', 'comum']) {
      const c = tipo === 'coop' ? await salaCoop(n) : await salaDesafio('comum', n), cfg = c.snap.cfg;
      assert.equal(cfg.HINTS_INF, true); assert.equal(cfg.SPOTS, GRANDES[n].spots);
      for (let i = 0; i < 14; i++) { const r = await c.a.emitAck(c.ev.hint, {}); assert.ok(r.ok, tipo + ' ' + n + ' lâmpada ' + (i + 1)); assert.equal(r.left, 999); }
      const p = c.snap.pieces.find((x) => x.out !== false && !x.locked);
      const r = await c.a.emitAck(c.ev.spot, { id: p.id }); assert.ok(r.ok); assert.equal(r.left, GRANDES[n].spots - 1, tipo + ' ' + n + ' 📍 desconta');
      fecha(c.a, c.b);
    }
  }
  const c = await salaCoop(48); assert.equal(c.snap.cfg.HINTS_INF, false); assert.equal(c.snap.cfg.HINTS, 10); assert.equal(c.snap.cfg.SPOTS, 5);
  let left = null; for (let i = 0; i < 10; i++) left = (await c.a.emitAck('hint', {})).left;
  assert.equal(left, 0, '48 peças: 10 lâmpadas'); assert.equal((await c.a.emitAck('hint', {})).ok, false); fecha(c.a, c.b);
});

test('gemas e XP: valores próprios e maiores para as 3 grandes; os de sempre não mudam', () => {
  const gems = require('../gems'), xp = require('../xp');
  assert.deepEqual(gems.VALUES, { 6: 1, 12: 2, 20: 3, 30: 5, 48: 8, 64: 15, 88: 20, 96: 25 });
  assert.deepEqual([6, 12, 20, 30, 48, 64, 88, 96].map(xp.baseXp), [20, 45, 80, 130, 220, 300, 380, 420]);
  assert.deepEqual([64, 88, 96].map(xp.minMs), [120000, 150000, 180000]);
});

test('código: ímã por quantidade nos dois layouts, arrastar também mais forte, imagem nítida e a 2ª linha na escolha', () => {
  const sv = read('server.js'), ch = read('challenge.js'), mg = read('magnet.js'), gm = read('public/game.js'), wk = read('public/crop-worker.js'), css = read('public/style.css');
  assert.equal((sv.match(/function snapFactorFor\(/g) || []).length, 1); assert.doesNotMatch(ch, /function snapFactorFor/, 'o Desafio usa a do servidor');
  assert.match(sv, /return Math\.min\(0\.75, SNAP_FACTOR \* \(pr && pr\.ima > 1 \? pr\.ima : 1\)\);/);
  assert.match(mg, /Math\.min\(0\.5, DRAG_FACTOR \* \(cfg\.IMA > 1 \? cfg\.IMA : 1\)\)/);
  const m = require('../magnet'); assert.equal(m.dragRadius({ SNAP: 50, TILE: 100, IMA: 1 }), Math.round(100 * m.DRAG_FACTOR)); assert.equal(m.dragRadius({ SNAP: 50, TILE: 100, IMA: 1.4 }), Math.min(50, Math.round(100 * Math.min(0.5, m.DRAG_FACTOR * 1.4))));
  assert.match(sv, /if \(!room\.cfg\.HINTS_INF\) room\.hints\[idx\]--;/); assert.match(ch, /if \(!c\.room\.cfg\.HINTS_INF\) c\.board\.hints--;/);
  assert.match(gm, /if \(cols >= 8\) \{[\s\S]{0,200}W = Math\.max\(320, Math\.min\(1080, Math\.round\(Math\.min\(nw, nh \* cols \/ rows\)\)\)\); q = 0\.95;/);
  assert.match(wk, /var q = d\.q > 0 && d\.q <= 1 \? d\.q : 0\.9;/);
  assert.match(gm, /\$\('#hint-badge'\)\.textContent = livre \? '∞' : state\.hints;/);
  assert.match(gm, /b\.className = p\.grande \? 'size-btn size-big' : 'size-btn';/);
  assert.match(css, /\.size-grid > \.size-btn \{ grid-column: span 3; \}/); assert.match(css, /\.size-grid > \.size-btn\.size-big \{ grid-column: span 5; \}/);
});
