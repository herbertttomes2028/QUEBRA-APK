'use strict';
// Ímã de encaixe: a peça solta encaixa sozinha quando o CENTRO dela está a até SNAP = round(TILE × SNAP_FACTOR) do centro da casa certa.
// Padrão 0,5 (era 0,33). Vale igual no Cooperativo, no Solo e nos dois modos da Sala Desafio. Nada além do raio mudou: giro 0 continua exigido,
// a posição final continua cravada pelo servidor e uma peça NUNCA encaixa em casa errada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, client, DIAG_TOKEN } = require('./helpers');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });

let srv, cfgJson;
// este arquivo testa o raio do ímã AO SOLTAR: o servidor sobe com o puxão ao arrastar desligado (DRAG_MAGNET=0), senão levar a peça de uma vaga até longe poderia roçar a zona e travá-la no caminho
test.before(async () => { srv = await startServer({ ROOM_CREATES_PER_10MIN: '100', DRAG_MAGNET: '0' }); cfgJson = await (await fetch(srv.url + '/api/config')).json(); });
test.after(async () => { await srv.stop(); });

async function salaCoop(pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const r1 = await a.emitAck('create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, name: 'Ana' }); assert.ok(r1.ok, JSON.stringify(r1));
  const r2 = await b.emitAck('join', { pid: 'pid-b-' + Math.random(), code: r1.snapshot.code, name: 'Beto' }); assert.ok(r2.ok, JSON.stringify(r2));
  return { a, b, snap: r2.snapshot, ev: { grab: 'grab', move: 'move', drop: 'drop' } };
}
async function salaDesafio(mode, pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const c1 = await a.emitAck('ch:create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, mode, name: 'Ana' }); assert.ok(c1.ok, JSON.stringify(c1));
  const c2 = await b.emitAck('ch:join', { pid: 'pid-b-' + Math.random(), code: c1.lobby.code, name: 'Beto' }); assert.ok(c2.ok, JSON.stringify(c2));
  const sa = a.once_('ch:start', null, 8000), sb = b.once_('ch:start', null, 8000);
  const gifts = []; a.on('ch:gift', (g) => gifts.push(g));
  for (const s of [a, b]) { assert.ok((await s.emitAck('ch:imgready', {})).ok); assert.ok((await s.emitAck('ch:ready', { ready: true })).ok); }
  const [ia] = await Promise.all([sa, sb]); await dorme(250);
  return { a, b, snap: ia.snapshot, gifts, ev: { grab: 'ch:grab', move: 'ch:move', drop: 'ch:drop' } };
}
// pega a peça, leva ao fundo (longe do alvo), solta a (dx, dy) do centro da casa certa e diz o que o servidor decidiu
async function solta(sala, cfg, p, dx, dy) {
  const s = sala.a, t = alvo(cfg, p);
  s.emit(sala.ev.grab, { id: p.id }); await dorme(70);
  s.emit(sala.ev.move, { id: p.id, x: cfg.FIELD_W / 2, y: cfg.FIELD_H - cfg.TRAY }); await dorme(70);
  const sx = t.x > cfg.FIELD_W / 2 ? -1 : 1, sy = t.y > cfg.FIELD_H / 2 ? -1 : 1;        // para o centro do campo: perto da borda o servidor limita (clamp) a coordenada
  const res = new Promise((ok) => { s.on('locked', (d) => { if (d.id === p.id) ok({ r: 'locked', d }); }); s.on('released', (d) => { if (d.id === p.id) ok({ r: 'released', d }); }); });
  s.emit(sala.ev.drop, { id: p.id, x: t.x + sx * dx, y: t.y + sy * dy });
  return Promise.race([res, dorme(1500).then(() => ({ r: 'timeout' }))]);
}
const fecha = (...s) => s.forEach((x) => x.close());

test('o raio do ímã é SNAP_FACTOR × casa (0,5) para TODAS as quantidades de peças, no Cooperativo e nos dois modos da Sala Desafio', async () => {
  for (const n of [6, 12, 20, 30, 48]) {
    const c = await salaCoop(n); const cfg = c.snap.cfg;
    assert.equal(cfg.SNAP, Math.round(cfg.TILE * 0.5), 'coop ' + n); assert.ok(cfg.SNAP < cfg.TILE, 'o raio nunca chega ao centro da casa vizinha (' + n + ')'); fecha(c.a, c.b);
  }
  for (const [modo, n] of [['comum', 12], ['comum', 48], ['quebra', 12], ['quebra', 48]]) {
    const d = await salaDesafio(modo, n); const cfg = d.snap.cfg;
    assert.equal(cfg.SNAP, Math.round(cfg.TILE * 0.5), 'desafio ' + modo + ' ' + n); fecha(d.a, d.b);
  }
});

test('Cooperativo: encaixa a SNAP-1 (inclusive na faixa 0,33–0,5 que o ímã antigo recusava), recusa a SNAP+3, e é um CÍRCULO (diagonal)', async () => {
  const c = await salaCoop(12); const cfg = c.snap.cfg, P = c.snap.pieces; const S = cfg.SNAP, antigo = Math.round(cfg.TILE * 0.33);
  assert.ok(S > antigo + 20, 'o ímã novo é bem maior que o antigo (' + antigo + ' → ' + S + ')');
  const r1 = await solta(c, cfg, P[0], S - 1, 0); assert.equal(r1.r, 'locked', 'a SNAP-1');
  assert.deepEqual([r1.d.x, r1.d.y], [alvo(cfg, P[0]).x, alvo(cfg, P[0]).y], 'o servidor crava a posição exata do centro');
  const r2 = await solta(c, cfg, P[1], antigo + Math.round(cfg.TILE * 0.1), 0); assert.equal(r2.r, 'locked', 'faixa que o ímã antigo recusava (' + (antigo + Math.round(cfg.TILE * 0.1)) + ' > ' + antigo + ')');
  assert.equal((await solta(c, cfg, P[2], S + 3, 0)).r, 'released', 'a SNAP+3');
  assert.equal((await solta(c, cfg, P[3], 0, S + 3)).r, 'released', 'a SNAP+3 na vertical');
  assert.equal((await solta(c, cfg, P[4], Math.round(S * 0.7), Math.round(S * 0.7))).r, 'locked', 'diagonal a 0,99 do raio');
  assert.equal((await solta(c, cfg, P[5], Math.round(S * 0.75), Math.round(S * 0.75))).r, 'released', 'diagonal a 1,06 do raio');
  fecha(c.a, c.b);
});

test('NUNCA encaixa em casa errada: soltar uma peça sobre o centro de OUTRA casa, ou a 0,75 casa da sua, não trava', async () => {
  const c = await salaCoop(12); const cfg = c.snap.cfg, P = c.snap.pieces;
  assert.equal((await solta(c, cfg, P[0], cfg.TILE, 0)).r, 'released', 'a 1 casa de distância (o centro da vizinha)');
  assert.equal((await solta(c, cfg, P[1], Math.round(cfg.TILE * 0.75), 0)).r, 'released', 'a 0,75 casa');
  assert.equal((await solta(c, cfg, P[2], 0, cfg.TILE)).r, 'released', 'a 1 casa na vertical');
  // e na bandeja (abaixo da linha da bandeja) nunca encaixa, mesmo que a peça seja da última linha
  const ultima = P.find((q) => q.row === cfg.ROWS - 1), t = alvo(cfg, ultima);
  c.a.emit('grab', { id: ultima.id }); await dorme(70);
  const res = new Promise((ok) => { c.a.on('locked', (d) => { if (d.id === ultima.id) ok('locked'); }); c.a.on('released', (d) => { if (d.id === ultima.id) ok('released'); }); });
  c.a.emit('drop', { id: ultima.id, x: t.x, y: cfg.TRAY_LINE + cfg.TRAY });
  assert.equal(await Promise.race([res, dorme(1500).then(() => 'timeout')]), 'released', 'solta na bandeja, abaixo da última linha');
  fecha(c.a, c.b);
});

for (const modo of ['comum', 'quebra']) {
  test('Sala Desafio (' + modo + '): o mesmo ímã. Encaixa a SNAP-1 (e na faixa que o ímã antigo recusava), recusa a SNAP+3, não encaixa em casa errada', async () => {
    const d = await salaDesafio(modo, 12); const cfg = d.snap.cfg; const S = cfg.SNAP, antigo = Math.round(cfg.TILE * 0.33);
    assert.equal(S, Math.round(cfg.TILE * 0.5));
    // em "quebra" só as peças que a caixa já cuspiu estão nas mãos; no "comum" todas estão na bandeja
    const ids = modo === 'quebra' ? d.gifts.map((g) => g.id) : d.snap.pieces.map((q) => q.id); assert.ok(ids.length >= 3, 'peças disponíveis: ' + ids.length);
    const P = ids.map((id) => d.snap.pieces.find((q) => q.id === id));
    assert.equal((await solta(d, cfg, P[0], S - 1, 0)).r, 'locked', 'a SNAP-1');
    assert.equal((await solta(d, cfg, P[1], antigo + Math.round(cfg.TILE * 0.1), 0)).r, 'locked', 'faixa que o ímã antigo recusava');
    assert.equal((await solta(d, cfg, P[2], S + 3, 0)).r, 'released', 'a SNAP+3');
    assert.equal((await solta(d, cfg, P[2], cfg.TILE, 0)).r, 'released', 'sobre o centro da casa vizinha');
    fecha(d.a, d.b);
  });
}

test('ajuste pelo painel do Render: SNAP_FACTOR de 0,25 a 0,75 vale; qualquer outro valor é ignorado e vale 0,5; o /diagnostico mostra o que está em uso', async () => {
  const lePor = async (env) => { const s = await startServer(Object.assign({ ROOM_CREATES_PER_10MIN: '100' }, env)); try { const j = await (await fetch(s.url + '/diagnostico?token=' + DIAG_TOKEN)).json(); const cj = await (await fetch(s.url + '/api/config')).json();
      const a = await client(s.url); const r = await a.emitAck('create', { pid: 'p' + Math.random(), imageId: cj.images[0].file, pieces: 12, name: 'Ana' }); const cfg = r.snapshot.cfg; a.close(); return { enc: j.encaixe, snap: cfg.SNAP, tile: cfg.TILE }; } finally { await s.stop(); } };
  const padrao = await lePor({}); assert.deepEqual([padrao.enc.raio_em_casas, padrao.enc.padrao, padrao.enc.origem], [0.5, 0.5, 'padrão']); assert.equal(padrao.snap, Math.round(padrao.tile * 0.5));
  for (const v of ['0.4', '0.25', '0.75']) { const r = await lePor({ SNAP_FACTOR: v }); assert.equal(r.enc.raio_em_casas, Number(v), v); assert.equal(r.enc.origem, 'variável SNAP_FACTOR'); assert.equal(r.snap, Math.round(r.tile * Number(v)), 'o servidor usa ' + v); }
  for (const v of ['0.9', '0.1', 'abc', '', '-1', '0.2499', '1']) { const r = await lePor({ SNAP_FACTOR: v }); assert.equal(r.enc.raio_em_casas, 0.5, 'inválido "' + v + '" volta ao padrão'); assert.equal(r.snap, Math.round(r.tile * 0.5)); }
});

test('código: o fator é definido UMA vez no servidor e usado nos dois layouts; a regra de encaixe e o cliente não mudaram', () => {
  const sv = read('server.js'), ch = read('challenge.js'), gm = read('public/game.js');
  assert.equal((sv.match(/const SNAP_FACTOR = /g) || []).length, 1, 'definido uma vez'); assert.match(sv, /const SNAP_FACTOR_DEFAULT = 0\.5;/); assert.match(sv, /v >= 0\.25 && v <= 0\.75/);
  assert.equal((sv.match(/SNAP: Math\.round\(tile \* SNAP_FACTOR\)/g) || []).length, 1); assert.equal((ch.match(/SNAP: Math\.round\(tile \* SNAP_FACTOR\)/g) || []).length, 1);
  assert.match(sv, /createChallenge|require\('\.\/challenge'\)\(\{\s*io, PRESETS, DEFAULT_PIECES, SNAP_FACTOR,/); assert.match(ch, /io, PRESETS, DEFAULT_PIECES, SNAP_FACTOR,/);
  assert.doesNotMatch(ch, /const SNAP_FACTOR/, 'o Desafio recebe o valor do servidor (não tem cópia própria)');
  for (const src of [sv, ch]) { assert.match(src, /if \(p\.rot !== 0\) return false;\n\s+if \(Math\.hypot\(p\.x - tx, p\.y - ty\) > cfg\.SNAP\) return false;/, 'tryLock igual: giro 0 e distância ≤ SNAP'); assert.match(src, /p\.x = tx;/); }
  assert.doesNotMatch(gm, /SNAP_FACTOR|cfg\.SNAP/, 'o cliente nunca decide o encaixe: a regra vive só no servidor');
  assert.match(sv, /socket\.on\('move', \(data\) => \{[\s\S]{0,1100}?magnet\.pullPoint[\s\S]{0,300}?tryLock\(c\.room, p, c\.idx\)[\s\S]{0,200}?socket\.to\(c\.room\.code\)\.emit\('moved'/, 'o ímã também puxa ENQUANTO se arrasta (ver tests/ima-arrastando.test.js)');
  assert.match(ch, /socket\.on\('ch:move'[\s\S]{0,1100}?tryLock\(c\.room, c\.idx, c\.board, p, socket\)/, 'a Sala Desafio também puxa ao arrastar');
});
