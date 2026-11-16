'use strict';
// Ímã ao ARRASTAR (segurando a peça), versão MAIS FRACA desde 15/11/2026 (pedido do proprietário): a peça só é puxada se o dedo FICAR perto
// da casa certa (a até DRAG_FACTOR × casa, padrão 0,25) por DWELL_MS (padrão 180 ms), inclusive com o dedo parado. Passar por cima, mesmo
// atravessando o centro, NÃO encaixa mais (antes encaixava: quem passeava com a peça pela grade encaixava sem querer). Ao SOLTAR vale o raio
// do tryLock (SNAP_FACTOR × casa, padrão 0,35). A regra de encaixe (tryLock) e o lugar onde ela vive (só no servidor) não mudaram.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, client, DIAG_TOKEN } = require('./helpers');
const magnet = require('../magnet');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });

test('ímã (regra pura): raio ao arrastar = 0,25 casa (nunca maior que o de soltar); precisa ficar perto pelo tempo de espera; sair zera; soltar cancela', () => {
  assert.equal(magnet.DRAG_FACTOR, 0.25); assert.equal(magnet.DWELL_MS, 180); assert.equal(magnet.ENABLED, true);
  const cfg = { BOARD_X: 10, BOARD_Y: 100, TILE: 100, SNAP: 35 }, p = { col: 2, row: 1, x: 0, y: 0 }, t = magnet.target(cfg, p);
  assert.deepEqual(t, { x: 260, y: 250 }); assert.equal(magnet.dragRadius(cfg), 25);
  assert.equal(magnet.dragRadius({ TILE: 100, SNAP: 20 }), 20, 'nunca maior que o raio de soltar');
  assert.equal(magnet.near(cfg, p, 284, 250), true); assert.equal(magnet.near(cfg, p, 286, 250), false); assert.equal(magnet.near(cfg, p, 277, 267), true, 'círculo (diagonal, a 24 do centro)'); assert.equal(magnet.near(cfg, p, 279, 269), false, 'diagonal a 26,9: fora');
  // relógio falso
  const timers = []; const fake = { setTimeout: (fn, ms) => { const h = { fn, ms, on: true }; timers.push(h); return h; }, clearTimeout: (h) => { if (h) h.on = false; } };
  const d = magnet.createDwell(Object.assign({ dwellMs: 180 }, fake)); let tentativas = 0; const tenta = () => { tentativas++; return true; };
  Object.assign(p, { x: 270, y: 250 }); assert.equal(d.onMove(cfg, p, 1000, tenta), false, 'entrou: ainda não puxa'); assert.equal(tentativas, 0);
  assert.equal(timers.length, 1); assert.equal(timers[0].ms, 180, 'confere de novo quando o tempo vencer (dedo parado)');
  Object.assign(p, { x: 268, y: 252 }); assert.equal(d.onMove(cfg, p, 1100, tenta), false, 'ainda perto, 100 ms: não puxa'); assert.equal(timers.length, 1, 'não empilha conferências');
  timers[0].fn(); assert.equal(tentativas, 1, 'o tempo venceu com o dedo perto (sem mexer): puxa');
  // passou por cima e saiu antes do tempo: nada
  const q = { col: 2, row: 1, x: 260, y: 250 }; tentativas = 0;
  d.onMove(cfg, q, 2000, tenta); Object.assign(q, { x: 380, y: 250 }); d.onMove(cfg, q, 2060, tenta); timers[timers.length - 1].fn();
  assert.equal(tentativas, 0, 'passou pelo centro e seguiu: não puxa');
  // ficou perto o tempo todo, mandando posições: puxa na amostra que completa o tempo
  const r = { col: 2, row: 1, x: 262, y: 250 }; tentativas = 0;
  d.onMove(cfg, r, 3000, tenta); Object.assign(r, { x: 264, y: 249 }); d.onMove(cfg, r, 3100, tenta); Object.assign(r, { x: 263, y: 251 }); assert.equal(d.onMove(cfg, r, 3190, tenta), true); assert.equal(tentativas, 1);
  // saiu e voltou: o tempo recomeça
  const w = { col: 2, row: 1, x: 262, y: 250 }; tentativas = 0;
  d.onMove(cfg, w, 4000, tenta); Object.assign(w, { x: 400, y: 250 }); d.onMove(cfg, w, 4100, tenta); Object.assign(w, { x: 262, y: 250 }); d.onMove(cfg, w, 4150, tenta);
  assert.equal(d.onMove(cfg, w, 4250, tenta), false, 'voltou há só 100 ms'); assert.equal(tentativas, 0);
  // soltou: cancela a conferência pendente
  const z = { col: 2, row: 1, x: 262, y: 250 }; tentativas = 0; d.onMove(cfg, z, 5000, tenta); const h = timers[timers.length - 1]; d.cancel(z); assert.equal(h.on, false);
});

let srv, cfgJson;
test.before(async () => { srv = await startServer({ ROOM_CREATES_PER_10MIN: '100' }); cfgJson = await (await fetch(srv.url + '/api/config')).json(); });
test.after(async () => { await srv.stop(); });

async function salaCoop(pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const r1 = await a.emitAck('create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, name: 'Ana' }); assert.ok(r1.ok, JSON.stringify(r1));
  const r2 = await b.emitAck('join', { pid: 'pid-b-' + Math.random(), code: r1.snapshot.code, name: 'Beto' }); assert.ok(r2.ok, JSON.stringify(r2));
  return { a, b, snap: r2.snapshot, ev: { grab: 'grab', move: 'move', drop: 'drop' }, desafio: false };
}
async function salaDesafio(mode, pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const c1 = await a.emitAck('ch:create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, mode, name: 'Ana' }); assert.ok(c1.ok, JSON.stringify(c1));
  const c2 = await b.emitAck('ch:join', { pid: 'pid-b-' + Math.random(), code: c1.lobby.code, name: 'Beto' }); assert.ok(c2.ok, JSON.stringify(c2));
  const sa = a.once_('ch:start', null, 8000), sb = b.once_('ch:start', null, 8000); const gifts = []; a.on('ch:gift', (g) => gifts.push(g));
  for (const s of [a, b]) { assert.ok((await s.emitAck('ch:imgready', {})).ok); assert.ok((await s.emitAck('ch:ready', { ready: true })).ok); }
  const [ia] = await Promise.all([sa, sb]); await dorme(250);
  return { a, b, snap: ia.snapshot, gifts, ev: { grab: 'ch:grab', move: 'ch:move', drop: 'ch:drop' }, desafio: true };
}

// pega a peça e conta o que acontece quando ela é MOVIDA (nunca solta): 'locked' (puxada), 'released' (nunca deveria) e 'moved' (para o outro jogador)
async function pega(sala, p) { sala.a.emit(sala.ev.grab, { id: p.id }); await dorme(80); }
async function move(sala, p, x, y) { sala.a.emit(sala.ev.move, { id: p.id, x, y }); await dorme(60); }       // >25 ms entre amostras (limite do servidor)
function escuta(sala, p) {
  const r = { locked: null, released: 0, moved: 0, lockedB: null };
  sala.a.on('locked', (d) => { if (d.id === p.id) r.locked = d; }); sala.a.on('released', (d) => { if (d.id === p.id) r.released++; });
  sala.b.on('moved', (d) => { if (d.id === p.id) r.moved++; }); sala.b.on('locked', (d) => { if (d.id === p.id) r.lockedB = d; });
  return r;
}
const fecha = (...s) => s.forEach((x) => x.close());
const DR = (cfg) => magnet.dragRadius(cfg);

test('Cooperativo: segurando e PARANDO perto da casa certa (dedo parado), a peça é puxada depois de ~0,18 s; antes disso, não', async () => {
  const s = await salaCoop(12), cfg = s.snap.cfg, p = s.snap.pieces[0], t = alvo(cfg, p), r = escuta(s, p);
  assert.ok(DR(cfg) < cfg.SNAP, 'ao arrastar o raio é menor que ao soltar');
  await pega(s, p);
  await move(s, p, t.x + DR(cfg) + 8, t.y); await dorme(300); assert.equal(r.locked, null, 'parado logo FORA do raio de arrastar: não puxa'); assert.ok(r.moved >= 1, 'o outro jogador vê a peça se mexer');
  s.a.emit('move', { id: p.id, x: t.x + DR(cfg) - 3, y: t.y }); await dorme(70);
  assert.equal(r.locked, null, 'acabou de entrar: ainda não puxa');
  await dorme(300);
  assert.ok(r.locked, 'ficou perto, com o dedo parado: puxada SEM soltar'); assert.deepEqual([r.locked.x, r.locked.y], [t.x, t.y], 'o servidor crava no centro exato da casa');
  assert.equal(r.locked.by, 0); assert.equal(r.locked.locked, 1); assert.ok(r.lockedB && r.lockedB.id === p.id, 'o outro jogador também vê encaixar');
  await move(s, p, t.x + 300, t.y + 300); s.a.emit('drop', { id: p.id, x: t.x + 300, y: t.y + 300 }); await dorme(200);
  assert.equal(r.released, 0, 'soltar uma peça já encaixada não faz nada');
  fecha(s.a, s.b);
});

test('passar por cima NÃO encaixa mais: atravessar a casa entre amostras, passar pelo centro e seguir, ou ficar entre os dois raios segurando', async () => {
  const s = await salaCoop(12), cfg = s.snap.cfg, T = cfg.TILE, P = s.snap.pieces, rs = new Map(P.map((p) => [p.id, escuta(s, p)]));
  const meio = P.filter((p) => p.col === 1), dir = P.filter((p) => p.col === 2);
  // (a) atravessou entre duas amostras (antes encaixava)
  let p = meio[0], t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x - Math.round(T * 1.2), t.y); await move(s, p, t.x + Math.round(T * 1.2), t.y); await dorme(350);
  assert.equal(rs.get(p.id).locked, null, 'atravessou a casa: não puxa');
  // (b) uma amostra cravada no centro e o dedo seguiu em 60 ms
  p = meio[1]; t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x - T, t.y); await move(s, p, t.x, t.y); await move(s, p, t.x + T, t.y); await dorme(350);
  assert.equal(rs.get(p.id).locked, null, 'passou pelo centro e seguiu: não puxa');
  // (c) segurando entre o raio de arrastar e o de soltar: não puxa; ao SOLTAR ali, encaixa (raio de soltar)
  p = meio[2]; t = alvo(cfg, p); const entre = Math.round((DR(cfg) + cfg.SNAP) / 2); await pega(s, p); await move(s, p, t.x + entre, t.y); await dorme(400);
  assert.equal(rs.get(p.id).locked, null, 'segurando a ' + entre + ' (entre ' + DR(cfg) + ' e ' + cfg.SNAP + '): não puxa');
  s.a.emit('drop', { id: p.id, x: t.x + entre, y: t.y }); await dorme(200); assert.ok(rs.get(p.id).locked, 'soltou ali: encaixa');
  // (d) casa errada, parado no centro dela: nunca encaixa
  p = P.find((q) => q.col === 0 && q.row === 0); const o = alvo(cfg, dir[0]); await pega(s, p); await move(s, p, o.x, o.y); await dorme(400);
  assert.equal(rs.get(p.id).locked, null, 'casa errada: sem ímã');
  // (e) ninguém puxa a peça que o OUTRO jogador está segurando
  p = dir[1]; t = alvo(cfg, p); s.b.emit('grab', { id: p.id }); await dorme(100); s.a.emit('move', { id: p.id, x: t.x, y: t.y }); await dorme(400);
  assert.equal(rs.get(p.id).locked, null, 'peça do outro jogador: o servidor ignora');
  fecha(s.a, s.b);
});

test('soltar ANTES do tempo de espera: vale o encaixe ao soltar, e a conferência pendente não faz nada depois', async () => {
  const s = await salaCoop(12), cfg = s.snap.cfg, P = s.snap.pieces;
  const p = P[3], t = alvo(cfg, p), r = escuta(s, p); await pega(s, p);
  s.a.emit('move', { id: p.id, x: t.x + 5, y: t.y }); await dorme(40); s.a.emit('drop', { id: p.id, x: t.x + 5, y: t.y }); await dorme(400);
  assert.ok(r.locked, 'soltou perto: encaixa'); assert.equal(r.released, 0);
  const q = P[4], u = alvo(cfg, q), r2 = escuta(s, q); await pega(s, q);
  s.a.emit('move', { id: q.id, x: u.x + 5, y: u.y }); await dorme(40); s.a.emit('drop', { id: q.id, x: u.x + 2 * cfg.TILE, y: u.y + cfg.TILE }); await dorme(400);
  assert.equal(r2.locked, null, 'entrou perto e soltou LONGE antes do tempo: a conferência pendente não encaixa a peça solta'); assert.equal(r2.released, 1);
  fecha(s.a, s.b);
});

test('Cooperativo: encaixar a última peça ARRASTANDO (parando perto) termina a partida (vitória), sem precisar soltar', async () => {
  const s = await salaCoop(6), cfg = s.snap.cfg, P = s.snap.pieces; let venceu = null; s.a.on('won', (d) => { venceu = d; });
  for (const p of P) { const t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x + 200, t.y + 160); await move(s, p, t.x + 4, t.y - 3); await dorme(300); }
  await dorme(200); assert.ok(venceu, 'todas encaixadas só arrastando: partida vencida'); assert.ok(venceu.elapsedMs >= 0);
  fecha(s.a, s.b);
});

for (const modo of ['comum', 'quebra']) {
  test('Sala Desafio (' + modo + '): o mesmo ímã mais fraco, só no tabuleiro de quem arrasta; passar por cima e casa errada não', async () => {
    const s = await salaDesafio(modo, 12), cfg = s.snap.cfg, T = cfg.TILE;
    const ids = modo === 'quebra' ? s.gifts.map((g) => g.id) : s.snap.pieces.map((q) => q.id), P = ids.map((id) => s.snap.pieces.find((q) => q.id === id)); assert.ok(P.length >= 3);
    const rs = P.map((p) => escuta(s, p)); let t = alvo(cfg, P[0]);
    await pega(s, P[0]); await move(s, P[0], t.x + 3, t.y - 2); assert.equal(rs[0].locked, null, 'acabou de entrar: ainda não'); await dorme(350);
    assert.ok(rs[0].locked, 'ficou perto, sem soltar: puxada'); assert.deepEqual([rs[0].locked.x, rs[0].locked.y], [t.x, t.y]); assert.equal(rs[0].lockedB, null, 'o adversário NÃO recebe a peça do tabuleiro de outro');
    t = alvo(cfg, P[1]); const sx = t.x > cfg.FIELD_W / 2 ? -1 : 1;
    await pega(s, P[1]); await move(s, P[1], t.x - sx * Math.round(T * 0.9), t.y); await move(s, P[1], t.x + sx * Math.round(T * 0.9), t.y); await dorme(350); assert.equal(rs[1].locked, null, 'atravessou: não puxa');
    const o = alvo(cfg, s.snap.pieces.find((q) => ![P[0].id, P[1].id, P[2].id].includes(q.id))); await pega(s, P[2]); await move(s, P[2], o.x, o.y); await dorme(350); assert.equal(rs[2].locked, null, 'casa errada: não');
    fecha(s.a, s.b);
  });
}

test('Quebrando Cabeças: encaixar as 3 peças da rodada ARRASTANDO (parando perto) faz a caixa cuspir as 3 seguintes sozinha', async () => {
  const s = await salaDesafio('quebra', 12), cfg = s.snap.cfg; assert.equal(s.gifts.length, 3);
  for (const g of s.gifts.slice(0, 3)) { const p = s.snap.pieces.find((q) => q.id === g.id), t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x + 180, t.y + 120); await move(s, p, t.x - 3, t.y + 2); await dorme(300); }
  await dorme(400); assert.equal(s.gifts.length, 6, 'rodada completa por arrasto: as 3 seguintes saem sozinhas'); assert.ok(s.gifts.slice(3).every((g) => g.auto === true && !g.start));
  fecha(s.a, s.b);
});

test('código: a regra de encaixe não mudou (tryLock idêntico), não há mais "passou pela zona", e o cliente nunca decide o encaixe', () => {
  const sv = read('server.js'), ch = read('challenge.js'), gm = read('public/game.js'), mg = read('magnet.js');
  for (const src of [sv, ch]) {
    assert.match(src, /if \(p\.rot !== 0\) return false;\n\s+if \(Math\.hypot\(p\.x - tx, p\.y - ty\) > cfg\.SNAP\) return false;/, 'tryLock igual');
    assert.doesNotMatch(src, /pullPoint|closestOnSegment/, 'o trecho entre amostras não conta mais');
    assert.match(src, /const dragDwell = magnet\.createDwell\(\);/); assert.match(src, /dragDwell\.cancel\(p\);/, 'soltar cancela a espera');
  }
  assert.doesNotMatch(mg, /pullPoint|closestOnSegment/);
  assert.match(sv, /p\.x = nx; p\.y = ny;\n\s+\/\/ ímã ao ARRASTAR/, 'a posição guardada é sempre a do dedo');
  assert.match(sv, /p\.heldBy === idx && !p\.locked && rooms\.get\(room\.code\) === room && tryLock\(room, p, idx\)/, 'a conferência atrasada confere tudo de novo');
  assert.match(ch, /p\.heldBy === idx && !p\.locked && room\.status === 'playing' && room\.boards\[idx\] === board && tryLock\(room, idx, board, p, socket\)/);
  assert.doesNotMatch(gm, /cfg\.SNAP|magnet|SNAP_FACTOR/, 'o celular não decide nada: quem puxa é o servidor');
  assert.match(gm, /if \(state\.drag && state\.drag\.id === p\.id\) \{[^}]*state\.drag = null;\s*if \(typeof QC !== 'undefined' && QC\.tray\) QC\.tray\.drag\(false\);/, 'peça puxada com o dedo segurando: o arrasto termina');
  assert.doesNotMatch(mg, /socket|io\.|Math\.random/, 'sem rede nem sorteio: só regra e relógio');
});

test('ajustes no Render: DRAG_MAGNET=0 desliga o puxão ao arrastar; DRAG_MAGNET_FACTOR/DRAG_MAGNET_MS fora da faixa são ignorados; o /diagnostico mostra tudo', async () => {
  const off = await startServer({ DRAG_MAGNET: '0', ROOM_CREATES_PER_10MIN: '100' });
  try {
    const dg = (await (await fetch(off.url + '/diagnostico?token=' + DIAG_TOKEN)).json()).encaixe; assert.equal(dg.puxa_ao_arrastar, false);
    const on = (await (await fetch(srv.url + '/diagnostico?token=' + DIAG_TOKEN)).json()).encaixe; assert.equal(on.puxa_ao_arrastar, true); assert.deepEqual(on.ao_arrastar, { raio_em_casas: 0.25, espera_ms: 180 });
    const cj = await (await fetch(off.url + '/api/config')).json(), a = await client(off.url), b = await client(off.url);
    const r1 = await a.emitAck('create', { pid: 'pa' + Math.random(), imageId: cj.images[0].file, pieces: 12, name: 'Ana' }); const r2 = await b.emitAck('join', { pid: 'pb' + Math.random(), code: r1.snapshot.code, name: 'Beto' });
    const cfg = r2.snapshot.cfg, p = r2.snapshot.pieces[0], t = alvo(cfg, p); let locked = false; a.on('locked', () => { locked = true; });
    a.emit('grab', { id: p.id }); await dorme(80); a.emit('move', { id: p.id, x: t.x + 5, y: t.y }); await dorme(400); assert.equal(locked, false, 'desligado: parado perto, segurando, NÃO puxa');
    const trava = a.once_('locked', (d) => d.id === p.id); a.emit('drop', { id: p.id, x: t.x + 5, y: t.y }); await trava;
    a.close(); b.close();
  } finally { await off.stop(); }
  const aj = await startServer({ DRAG_MAGNET_FACTOR: '0.4', DRAG_MAGNET_MS: '300' });
  try { assert.deepEqual((await (await fetch(aj.url + '/diagnostico?token=' + DIAG_TOKEN)).json()).encaixe.ao_arrastar, { raio_em_casas: 0.4, espera_ms: 300 }); } finally { await aj.stop(); }
  const ruim = await startServer({ DRAG_MAGNET_FACTOR: '2', DRAG_MAGNET_MS: '-5' });
  try { assert.deepEqual((await (await fetch(ruim.url + '/diagnostico?token=' + DIAG_TOKEN)).json()).encaixe.ao_arrastar, { raio_em_casas: 0.25, espera_ms: 180 }); } finally { await ruim.stop(); }
});
