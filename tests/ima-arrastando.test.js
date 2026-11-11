'use strict';
// Ímã ao ARRASTAR: segurando a peça (dedo ainda na tela) e passando pela zona do ímã da casa certa, o servidor puxa a peça na hora.
// Antes só conferia ao SOLTAR. A regra de encaixe continua a mesma (tryLock: giro 0 e distância ≤ SNAP) e continua só no servidor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, client } = require('./helpers');
const magnet = require('../magnet');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });

test('ímã (geometria pura): o trecho entre duas amostras que passa pela zona vale; salto grande, trecho que erra e fora da zona não valem', () => {
  const cfg = { BOARD_X: 10, BOARD_Y: 100, TILE: 100, SNAP: 50 }, p = { col: 2, row: 1 }, t = magnet.target(cfg, p);
  assert.deepEqual(t, { x: 260, y: 250 }, 'centro da casa');
  assert.deepEqual(magnet.closestOnSegment(0, 0, 10, 0, 5, 7), { x: 5, y: 0 }); assert.deepEqual(magnet.closestOnSegment(0, 0, 10, 0, -5, 7), { x: 0, y: 0 }, 'antes do início'); assert.deepEqual(magnet.closestOnSegment(0, 0, 10, 0, 50, 7), { x: 10, y: 0 }, 'depois do fim');
  assert.deepEqual(magnet.closestOnSegment(3, 4, 3, 4, 9, 9), { x: 3, y: 4 }, 'trecho de um ponto só');
  // atravessou a casa: amostras 120 px antes e 120 px depois do centro, na mesma linha: o ponto mais próximo é o próprio centro
  assert.deepEqual(magnet.pullPoint(cfg, p, 140, 250, 380, 250), { x: 260, y: 250 }, 'passou pelo centro entre as amostras');
  // passou raspando a borda da zona (a 40 do centro): ainda vale
  const raspa = magnet.pullPoint(cfg, p, 140, 290, 380, 290); assert.deepEqual(raspa, { x: 260, y: 290 });
  // passou a 60 do centro (fora do raio 50): não vale, devolve a posição nova
  assert.deepEqual(magnet.pullPoint(cfg, p, 140, 310, 380, 310), { x: 380, y: 310 }, 'passou longe: nada de ímã');
  // salto maior que 2,5 casas (250 px): rede lenta ou peça saindo da bandeja; nunca conta como "passou por cima"
  assert.deepEqual(magnet.pullPoint(cfg, p, 60, 250, 460, 250), { x: 460, y: 250 }, 'salto de 400 px não vale');
  assert.deepEqual(magnet.pullPoint(cfg, p, 135, 250, 385, 250), { x: 260, y: 250 }, 'exatamente 2,5 casas ainda vale');
  assert.deepEqual(magnet.pullPoint(cfg, p, 134, 250, 386, 250), { x: 386, y: 250 }, 'um pouco mais de 2,5 casas já não');
  assert.deepEqual(magnet.pullPoint(cfg, p, 270, 255, 275, 260), { x: 270, y: 250 }.x === 270 ? magnet.pullPoint(cfg, p, 270, 255, 275, 260) : null, 'consistência');
  // quem já está dentro da zona: o próprio trecho decide (o tryLock confere depois)
  const dentro = magnet.pullPoint(cfg, p, 250, 245, 255, 248); assert.ok(Math.hypot(dentro.x - 260, dentro.y - 250) <= 50);
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
const fecha = (...s) => s.forEach((x) => x.close());
// pega a peça e conta o que acontece quando ela é MOVIDA (nunca solta): 'locked' (puxada), 'released' (nunca deveria) e 'moved' (para o outro jogador)
async function pega(sala, p) { sala.a.emit(sala.ev.grab, { id: p.id }); await dorme(80); }
async function move(sala, p, x, y) { sala.a.emit(sala.ev.move, { id: p.id, x, y }); await dorme(60); }       // >25 ms entre amostras (limite do servidor)
function escuta(sala, p) {
  const r = { locked: null, released: 0, moved: 0, lockedB: null };
  sala.a.on('locked', (d) => { if (d.id === p.id) r.locked = d; }); sala.a.on('released', (d) => { if (d.id === p.id) r.released++; });
  sala.b.on('moved', (d) => { if (d.id === p.id) r.moved++; }); sala.b.on('locked', (d) => { if (d.id === p.id) r.lockedB = d; });
  return r;
}

test('Cooperativo: segurando a peça (sem soltar) e entrando na zona do ímã da casa certa, ela é PUXADA; antes disso, não', async () => {
  const s = await salaCoop(12), cfg = s.snap.cfg, S = cfg.SNAP, p = s.snap.pieces[0], t = alvo(cfg, p), r = escuta(s, p);
  await pega(s, p);
  await move(s, p, t.x + S + 8, t.y); assert.equal(r.locked, null, 'a SNAP+8 ainda não puxa'); assert.ok(r.moved >= 1, 'o outro jogador vê a peça se mexer');
  await move(s, p, t.x + S + 3, t.y + 4); assert.equal(r.locked, null, 'a SNAP+3 ainda não puxa');
  await move(s, p, t.x + S - 2, t.y); await dorme(120);
  assert.ok(r.locked, 'entrou na zona (SNAP-2): puxada SEM soltar'); assert.deepEqual([r.locked.x, r.locked.y], [t.x, t.y], 'o servidor crava no centro exato da casa');
  assert.equal(r.locked.by, 0); assert.equal(r.locked.locked, 1, 'conta como 1 peça encaixada'); assert.ok(r.lockedB && r.lockedB.id === p.id, 'o outro jogador também vê encaixar');
  // o dedo continua mexendo e depois solta: nada de "released" nem de desencaixar
  await move(s, p, t.x + 300, t.y + 300); s.a.emit('drop', { id: p.id, x: t.x + 300, y: t.y + 300 }); await dorme(200);
  assert.equal(r.released, 0, 'soltar uma peça já encaixada não faz nada'); assert.deepEqual(r.locked && [r.locked.x, r.locked.y], [t.x, t.y]);
  fecha(s.a, s.b);
});

test('um arrasto RÁPIDO que atravessa a casa entre duas amostras também é puxado; salto grande, passar longe e casa errada não', async () => {
  const s = await salaCoop(12), cfg = s.snap.cfg, T = cfg.TILE, P = s.snap.pieces, rs = new Map(P.map((p) => [p.id, escuta(s, p)]));
  const meio = P.filter((p) => p.col === 1), borda = P.filter((p) => p.col === 0), dir = P.filter((p) => p.col === 2);     // coluna do meio: andar 1,2 casa para os lados não esbarra na borda do campo
  // (a) atravessou: 1,2 casa antes → 1,2 casa depois (trecho de 2,4 casas, dentro do limite de 2,5)
  let p = meio[0], t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x - Math.round(T * 1.2), t.y); assert.equal(rs.get(p.id).locked, null, 'antes de atravessar: ainda solta'); await move(s, p, t.x + Math.round(T * 1.2), t.y); await dorme(120);
  assert.ok(rs.get(p.id).locked, 'atravessou a zona entre duas amostras: puxada'); assert.deepEqual([rs.get(p.id).locked.x, rs.get(p.id).locked.y], [t.x, t.y]);
  // (b) salto grande (bordas do campo limitam a 2,6 casas, ainda acima de 2,5): não vale como "passou por cima"
  p = meio[1]; t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x - Math.round(T * 1.6), t.y); await move(s, p, t.x + Math.round(T * 1.6), t.y); await dorme(120);
  assert.equal(rs.get(p.id).locked, null, 'trecho maior que 2,5 casas: sem ímã');
  // (c) passou longe (a 0,7 casa de distância: fora do raio de 0,5)
  p = meio[2]; t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x - Math.round(T * 1.2), t.y + Math.round(T * 0.7)); await move(s, p, t.x + Math.round(T * 1.2), t.y + Math.round(T * 0.7)); await dorme(120);
  assert.equal(rs.get(p.id).locked, null, 'passou a 0,7 casa: fora da zona');
  // (d) em cima do centro de OUTRA casa (aproximando na vertical, na coluna dela): nunca encaixa
  p = borda[0]; const o = alvo(cfg, dir[0]); await pega(s, p); await move(s, p, o.x, cfg.FIELD_H - 100); await move(s, p, o.x, o.y); await move(s, p, o.x + 3, o.y + 3); await dorme(120);
  assert.equal(rs.get(p.id).locked, null, 'casa errada: sem ímã');
  // (e) ninguém puxa a peça que o OUTRO jogador está segurando
  p = dir[1]; t = alvo(cfg, p); s.b.emit('grab', { id: p.id }); await dorme(100); s.a.emit('move', { id: p.id, x: t.x, y: t.y }); await dorme(150);
  assert.equal(rs.get(p.id).locked, null, 'peça do outro jogador: o servidor ignora');
  fecha(s.a, s.b);
});

test('Cooperativo: encaixar a última peça ARRASTANDO termina a partida (vitória), sem precisar soltar', async () => {
  const s = await salaCoop(6), cfg = s.snap.cfg, P = s.snap.pieces; let venceu = null; s.a.on('won', (d) => { venceu = d; });
  for (const p of P) { const t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x + 200, t.y + 160); await move(s, p, t.x + 4, t.y - 3); await dorme(120); }
  await dorme(200); assert.ok(venceu, 'todas encaixadas só arrastando: partida vencida'); assert.ok(venceu.elapsedMs >= 0);
  fecha(s.a, s.b);
});

for (const modo of ['comum', 'quebra']) {
  test('Sala Desafio (' + modo + '): o ímã também puxa ao arrastar, só no tabuleiro de quem arrasta; casa errada e fora da zona não', async () => {
    const s = await salaDesafio(modo, 12), cfg = s.snap.cfg, T = cfg.TILE, S = cfg.SNAP;
    const ids = modo === 'quebra' ? s.gifts.map((g) => g.id) : s.snap.pieces.map((q) => q.id), P = ids.map((id) => s.snap.pieces.find((q) => q.id === id)); assert.ok(P.length >= 3);
    const rs = P.map((p) => escuta(s, p)); let t = alvo(cfg, P[0]);
    const sx = t.x > cfg.FIELD_W / 2 ? -1 : 1;       // o lado com espaço: perto da borda o servidor limita a coordenada para dentro do campo
    await pega(s, P[0]); await move(s, P[0], t.x + sx * (S + 6), cfg.FIELD_H - 90); await move(s, P[0], t.x + sx * (S + 6), t.y); assert.equal(rs[0].locked, null, 'fora da zona (aproximando na vertical, o trecho fica sempre fora do raio)'); await move(s, P[0], t.x + sx * (S - 3), t.y); await dorme(150);
    assert.ok(rs[0].locked, 'dentro da zona, sem soltar: puxada'); assert.deepEqual([rs[0].locked.x, rs[0].locked.y], [t.x, t.y]); assert.equal(rs[0].lockedB, null, 'o adversário NÃO recebe a peça do tabuleiro de outro');
    // atravessou entre amostras
    t = alvo(cfg, P[1]); await pega(s, P[1]); await move(s, P[1], t.x - Math.round(T * 1.2), t.y); await move(s, P[1], t.x + Math.round(T * 1.2), t.y); await dorme(150); assert.ok(rs[1].locked, 'atravessou: puxada');
    // casa errada e passando longe
    const o = alvo(cfg, s.snap.pieces.find((q) => q.id !== P[2].id && q.id !== P[0].id && q.id !== P[1].id)); await pega(s, P[2]); await move(s, P[2], o.x, o.y); await move(s, P[2], o.x + 2, o.y + 2); await dorme(150); assert.equal(rs[2].locked, null, 'casa errada: sem ímã');
    // o progresso de quem arrasta subiu (2 encaixes), o do adversário não
    const prog = []; s.b.on('ch:progress', (d) => prog.push(d)); s.a.emit(s.ev.drop, { id: P[2].id, x: o.x, y: o.y }); await dorme(200);
    fecha(s.a, s.b);
  });
}

test('Quebrando Cabeças: encaixar as 3 peças da rodada ARRASTANDO faz a caixa cuspir as 3 seguintes sozinha', async () => {
  const s = await salaDesafio('quebra', 12), cfg = s.snap.cfg; const antes = s.gifts.length; assert.equal(antes, 3);
  for (const g of s.gifts.slice(0, 3)) { const p = s.snap.pieces.find((q) => q.id === g.id), t = alvo(cfg, p); await pega(s, p); await move(s, p, t.x + 180, t.y + 120); await move(s, p, t.x - 3, t.y + 2); await dorme(150); }
  await dorme(400); assert.equal(s.gifts.length, 6, 'rodada completa por arrasto: as 3 seguintes saem sozinhas'); assert.ok(s.gifts.slice(3).every((g) => g.auto === true && !g.start));
  fecha(s.a, s.b);
});

test('código: a regra de encaixe não mudou (tryLock idêntico), o cliente nunca decide o encaixe e termina o arrasto quando o ímã puxa', () => {
  const sv = read('server.js'), ch = read('challenge.js'), gm = read('public/game.js'), mg = read('magnet.js');
  for (const src of [sv, ch]) { assert.match(src, /if \(p\.rot !== 0\) return false;\n\s+if \(Math\.hypot\(p\.x - tx, p\.y - ty\) > cfg\.SNAP\) return false;/, 'tryLock igual'); assert.match(src, /magnet\.ENABLED \? magnet\.pullPoint\(c\.room\.cfg, p, px, py, nx, ny\) : \{ x: nx, y: ny \}/); }
  assert.match(sv, /const magnet = require\('\.\/magnet'\);/); assert.match(ch, /const magnet = require\('\.\/magnet'\);/);
  // se não encaixou, a posição guardada é a que o dedo mandou (o ponto "mais próximo" só vale quando a peça é puxada)
  assert.match(sv, /if \(magnet\.ENABLED && tryLock\(c\.room, p, c\.idx\)\) return;\n\s+p\.x = nx; p\.y = ny;/); assert.match(ch, /if \(magnet\.ENABLED && tryLock\(c\.room, c\.idx, c\.board, p, socket\)\) return;\n\s+p\.x = nx; p\.y = ny;/);
  assert.doesNotMatch(gm, /cfg\.SNAP|magnet|SNAP_FACTOR/, 'o celular não decide nada: quem puxa é o servidor');
  assert.match(gm, /if \(state\.drag && state\.drag\.id === p\.id\) \{[^}]*state\.drag = null;\s*if \(typeof QC !== 'undefined' && QC\.tray\) QC\.tray\.drag\(false\);/, 'peça puxada com o dedo segurando: o arrasto termina e a bandeja volta a animar');
  assert.doesNotMatch(mg, /require\(|socket|io\.|Date|Math\.random/, 'módulo puro: só geometria');
});

test('chave de segurança DRAG_MAGNET=0: volta ao comportamento antigo (só encaixa ao SOLTAR), e o /diagnostico mostra o estado', async () => {
  const off = await startServer({ DRAG_MAGNET: '0', ROOM_CREATES_PER_10MIN: '100' });
  try {
    assert.equal((await (await fetch(off.url + '/diagnostico')).json()).encaixe.puxa_ao_arrastar, false); assert.equal((await (await fetch(srv.url + '/diagnostico')).json()).encaixe.puxa_ao_arrastar, true, 'padrão: ligado');
    const cj = await (await fetch(off.url + '/api/config')).json(), a = await client(off.url), b = await client(off.url);
    const r1 = await a.emitAck('create', { pid: 'pa' + Math.random(), imageId: cj.images[0].file, pieces: 12, name: 'Ana' }); const r2 = await b.emitAck('join', { pid: 'pb' + Math.random(), code: r1.snapshot.code, name: 'Beto' });
    const cfg = r2.snapshot.cfg, p = r2.snapshot.pieces[0], t = alvo(cfg, p); let locked = false; a.on('locked', () => { locked = true; });
    a.emit('grab', { id: p.id }); await dorme(80); a.emit('move', { id: p.id, x: t.x + 5, y: t.y }); await dorme(150); assert.equal(locked, false, 'desligado: dentro da zona, segurando, NÃO puxa');
    const trava = a.once_('locked', (d) => d.id === p.id); a.emit('drop', { id: p.id, x: t.x + 5, y: t.y }); await trava;           // e soltar continua encaixando como sempre
    a.close(); b.close();
  } finally { await off.stop(); }
});
