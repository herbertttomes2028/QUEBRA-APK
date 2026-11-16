'use strict';
// FILEIRA DE 5 (pedido do proprietário, 15/11/2026): com 20, 30 e 48 peças fica UMA fileira de 5 vagas abaixo da grade (imagem maior);
// as outras peças ficam guardadas e vão aparecendo na vaga que ficou livre. Até 3 peças soltas na grade a fileira continua completa;
// no teto (5 + 3 = 8 à vista sem encaixar) só um encaixe certo libera a próxima. Vale no Sozinho, no Cooperativo (uma fileira para os
// dois) e no Desafio Comum (uma por jogador). 6 e 12 peças e o Quebrando Cabeças não mudam. O servidor decide tudo.
// Servidor real + clientes Socket.IO.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, client, ROOT } = require('./helpers');
const fila = require('../fila');

let srv, img;
test.before(async () => { srv = await startServer({ ROOM_CREATES_PER_10MIN: '100' }); img = (await (await fetch(srv.url + '/api/config')).json()).images[0].file; });
test.after(async () => { await srv.stop(); });

const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const pid = () => 'pid-fila-' + Math.random().toString(36).slice(2);
const fecha = (...s) => s.forEach((x) => x.close());

// cópia local do estado (o que o celular sabe), atualizada pelos eventos do servidor
function espelho(s, snap, prefixo) {
  const ps = snap.pieces.map((p) => Object.assign({}, p));
  const log = [];
  s.on(prefixo + 'fila', (d) => { log.push(d); for (const g of d.pieces) Object.assign(ps[g.id], { out: true, x: g.x, y: g.y }); });
  s.on('released', (d) => { Object.assign(ps[d.id], { x: d.x, y: d.y }); });
  s.on('locked', (d) => { Object.assign(ps[d.id], { x: d.x, y: d.y, locked: true }); });
  return { ps, log };
}
function conta(cfg, ps) {
  let fileiraN = 0, soltas = 0, guardadas = 0;
  for (const p of ps) { if (p.locked) continue; if (!p.out) guardadas++; else if (p.y >= cfg.TRAY_LINE) fileiraN++; else soltas++; }
  return { fila: fileiraN, soltas, guardadas, vista: fileiraN + soltas };
}
// casa ERRADA na grade (longe do ímã): o centro de outra casa
function casaErrada(cfg, p, k) {
  const col = (p.col + 1 + k) % cfg.COLS, row = (p.row + Math.floor((k + 1) / cfg.COLS) + 1) % cfg.ROWS;
  return { x: cfg.BOARD_X + col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + row * cfg.TILE + cfg.TILE / 2 };
}
async function solta(s, p, pos, pre) {
  s.emit(pre + 'grab', { id: p.id });
  await s.once_('grabbed', (d) => d.id === p.id);
  const r = s.once_('released', (d) => d.id === p.id);
  s.emit(pre + 'drop', { id: p.id, x: pos.x, y: pos.y });
  await r; await dorme(60);
}
async function encaixa(s, cfg, p, pre) {
  s.emit(pre + 'grab', { id: p.id });
  await s.once_('grabbed', (d) => d.id === p.id);
  const r = s.once_('locked', (d) => d.id === p.id);
  s.emit(pre + 'drop', Object.assign({ id: p.id }, alvo(cfg, p)));
  await r; await dorme(60);
}

async function solo(pieces, opts) {
  const s = await client(srv.url, opts === undefined ? { fila: true } : opts);
  const r = await s.emitAck('create', { pid: pid(), imageId: img, pieces, solo: true, name: 'Ana' });
  assert.ok(r.ok, JSON.stringify(r));
  return { s, snap: r.snapshot };
}

test('layout: 20, 30 e 48 peças têm UMA fileira de 5 vagas e a grade fica maior; 6 e 12 continuam iguais', async () => {
  const antes = { 20: { bw: 960, h: 1720 }, 30: { bw: 950, h: 1745 }, 48: { bw: 780, h: 1845 } };      // medidas da bandeja grande (main cb346a9)
  for (const n of [20, 30, 48]) {
    const { s, snap } = await solo(n);
    const cfg = snap.cfg;
    assert.ok(cfg.FILA && cfg.FILA.slots.length === 5, n + ': 5 vagas');
    assert.equal(cfg.FILA.soltas, 3);
    assert.equal(cfg.TRAY_ROWS, 1);
    assert.equal(cfg.BOARD_W, 980, n + ': grade mais larga');
    assert.ok(cfg.BOARD_W >= antes[n].bw && cfg.FIELD_H < antes[n].h, n + ': campo mais baixo (a imagem cresce na tela)');
    assert.equal(cfg.SNAP, Math.round(cfg.TILE * 0.35), 'o ímã segue a mesma fórmula');
    for (const v of cfg.FILA.slots) { assert.ok(v.y > cfg.TRAY_LINE && v.y + cfg.TRAY / 2 <= cfg.FIELD_H, 'vaga abaixo da grade'); }
    const vis = snap.pieces.filter((p) => p.out);
    assert.equal(vis.length, 5, n + ': só 5 peças à vista na largada');
    assert.deepEqual(vis.map((p) => cfg.FILA.slots.findIndex((v) => v.x === p.x && v.y === p.y)).sort(), [0, 1, 2, 3, 4], 'uma em cada vaga');
    fecha(s);
  }
  for (const n of [6, 12]) {
    const { s, snap } = await solo(n);
    assert.equal(snap.cfg.FILA, undefined, n + ' peças: sem fileira');
    assert.ok(snap.pieces.every((p) => p.out), n + ' peças: todas à vista, como sempre');
    fecha(s);
  }
});

test('Sozinho: peça guardada não pode ser pega nem mostrada pelo 📍; encaixe libera a próxima NA VAGA da peça encaixada', async () => {
  const { s, snap } = await solo(20);
  const cfg = snap.cfg, m = espelho(s, snap, '');
  const guardada = snap.pieces.find((p) => !p.out);
  let pegou = false; s.on('grabbed', (d) => { if (d.id === guardada.id) pegou = true; });
  s.emit('grab', { id: guardada.id });
  await dorme(150);
  assert.equal(pegou, false, 'ninguém pega peça guardada');
  const sp = await s.emitAck('spot', { id: guardada.id });
  assert.equal(sp.ok, false, 'o 📍 não revela peça guardada');

  const p = snap.pieces.find((q) => q.out);
  const vaga = cfg.FILA.slots.findIndex((v) => v.x === p.x && v.y === p.y);
  const veio = s.once_('fila');
  await encaixa(s, cfg, p, '');
  const f = await veio;
  assert.equal(f.pieces.length, 1);
  assert.equal(f.pieces[0].slot, vaga, 'a nova aparece na vaga da que foi encaixada');
  assert.deepEqual([f.pieces[0].x, f.pieces[0].y], [cfg.FILA.slots[vaga].x, cfg.FILA.slots[vaga].y]);
  assert.equal(conta(cfg, m.ps).fila, 5);
  fecha(s);
});

test('Sozinho: até 3 soltas a fileira se completa; a 4ª solta deixa a vaga vazia até um encaixe (teto de 8 à vista)', async () => {
  const { s, snap } = await solo(30);
  const cfg = snap.cfg, m = espelho(s, snap, '');
  for (let k = 0; k < 3; k++) {
    const p = m.ps.find((q) => q.out && !q.locked && q.y >= cfg.TRAY_LINE);
    const antes = m.log.length;
    await solta(s, p, casaErrada(cfg, p, k), '');
    assert.equal(m.log.length, antes + 1, 'solta nº ' + (k + 1) + ': aparece outra na vaga');
    const c = conta(cfg, m.ps);
    assert.deepEqual([c.fila, c.soltas], [5, k + 1]);
  }
  const quarta = m.ps.find((q) => q.out && !q.locked && q.y >= cfg.TRAY_LINE);
  const antes = m.log.length;
  await solta(s, quarta, casaErrada(cfg, quarta, 3), '');
  await dorme(120);
  assert.equal(m.log.length, antes, 'no teto nada aparece');
  let c = conta(cfg, m.ps);
  assert.deepEqual([c.fila, c.soltas, c.vista], [4, 4, 8]);
  // voltar uma solta para a fileira não libera peça nova (continua no teto)
  // encaixar uma solta: fica 4 na fileira + 3 soltas = 7 → a vaga vazia ganha a próxima
  const veio = s.once_('fila');
  await encaixa(s, cfg, m.ps.find((q) => q.out && !q.locked && q.y < cfg.TRAY_LINE), '');
  assert.equal((await veio).pieces.length, 1);
  c = conta(cfg, m.ps);
  assert.deepEqual([c.fila, c.soltas, c.vista], [5, 3, 8]);
  fecha(s);
});

test('Sozinho: a partida inteira de 20 peças termina (todas aparecem e encaixam)', async () => {
  const { s, snap } = await solo(20);
  const cfg = snap.cfg, m = espelho(s, snap, '');
  const venceu = s.once_('won', null, 15000);
  for (let n = 0; n < 20; n++) {
    const p = m.ps.find((q) => q.out && !q.locked);
    assert.ok(p, 'sempre há peça à vista enquanto falta peça');
    await encaixa(s, cfg, p, '');
    assert.ok(conta(cfg, m.ps).vista <= 8);
  }
  await venceu;
  assert.equal(m.ps.filter((p) => p.locked).length, 20);
  fecha(s);
});

test('Cooperativo: uma fileira para os dois; os dois celulares recebem as peças que aparecem', async () => {
  const a = await client(srv.url, { fila: true }), b = await client(srv.url, { fila: true });
  const r = await a.emitAck('create', { pid: pid(), imageId: img, pieces: 20, name: 'Ana' });
  assert.ok(r.ok);
  const j = await b.emitAck('join', { pid: pid(), code: r.snapshot.code, name: 'Beto' });
  assert.ok(j.ok, JSON.stringify(j));
  assert.deepEqual(j.snapshot.pieces.filter((p) => p.out).map((p) => p.id).sort(), r.snapshot.pieces.filter((p) => p.out).map((p) => p.id).sort());
  const cfg = r.snapshot.cfg;
  const fa = a.once_('fila'), fb = b.once_('fila');
  await encaixa(b, cfg, j.snapshot.pieces.find((p) => p.out), '');
  const [da, db] = await Promise.all([fa, fb]);
  assert.deepEqual(da, db);
  fecha(a, b);
});

test('celular com a cópia ANTIGA do jogo: cria sala sem fileira; se entra numa sala com fileira, recebe o tabuleiro inteiro', async () => {
  const velho = await client(srv.url, null);
  const r = await velho.emitAck('create', { pid: pid(), imageId: img, pieces: 20, solo: true, name: 'Ana' });
  assert.equal(r.snapshot.cfg.FILA, undefined, 'sem a fileira (o jogo antigo não sabe mostrar peças que aparecem)');
  assert.equal(r.snapshot.cfg.BOARD_W, 960, 'bandeja de antes');
  assert.ok(r.snapshot.pieces.every((p) => p.out));
  fecha(velho);

  const novo = await client(srv.url, { fila: true }), antigo = await client(srv.url, null);
  const c = await novo.emitAck('create', { pid: pid(), imageId: img, pieces: 20, name: 'Ana' });
  const j = await antigo.emitAck('join', { pid: pid(), code: c.snapshot.code, name: 'Beto' });
  assert.ok(j.ok);
  const st = antigo.once_('state');
  await encaixa(novo, c.snapshot.cfg, c.snapshot.pieces.find((p) => p.out), '');
  const snap = await st;
  assert.equal(snap.pieces.filter((p) => p.out && !p.locked).length, 5, 'o tabuleiro completo já traz a peça nova');
  fecha(novo, antigo);
});

async function largada(pieces, mode, fa, fb) {
  const a = await client(srv.url, fa === false ? null : { fila: true }), b = await client(srv.url, fb === false ? null : { fila: true });
  const c1 = await a.emitAck('ch:create', { pid: pid(), imageId: img, pieces, mode: mode || 'comum', name: 'Ana' });
  assert.ok(c1.ok, JSON.stringify(c1));
  assert.ok((await b.emitAck('ch:join', { pid: pid(), code: c1.lobby.code, name: 'Beto' })).ok);
  const sa = a.once_('ch:start', null, 8000), sb = b.once_('ch:start', null, 8000);
  for (const s of [a, b]) { assert.ok((await s.emitAck('ch:imgready', {})).ok); }
  for (const s of [a, b]) { assert.ok((await s.emitAck('ch:ready', { ready: true })).ok); }
  const [ia, ib] = await Promise.all([sa, sb]);
  return { a, b, snapA: ia.snapshot, snapB: ib.snapshot };
}

test('Desafio Comum: cada um tem a sua fileira, com as MESMAS peças na mesma ordem; o que um faz não mexe na fileira do outro', async () => {
  const { a, b, snapA, snapB } = await largada(20);
  const cfg = snapA.cfg;
  assert.ok(cfg.FILA, 'fileira no Desafio Comum');
  const ids = (sn) => sn.pieces.filter((p) => p.out).map((p) => [p.id, p.x, p.y]);
  assert.deepEqual(ids(snapA), ids(snapB), 'largada justa: mesmas peças nas mesmas vagas');
  const mA = espelho(a, snapA, 'ch:');
  let doOutro = 0; b.on('ch:fila', () => { doOutro++; });
  const veio = a.once_('ch:fila');
  await encaixa(a, cfg, snapA.pieces.find((p) => p.out), 'ch:');
  const f = await veio;
  assert.equal(f.pieces.length, 1);
  await dorme(120);
  assert.equal(doOutro, 0, 'a fileira do outro não muda');
  // o outro, encaixando a mesma peça, recebe a mesma peça nova (mesma ordem)
  const vb = b.once_('ch:fila');
  await encaixa(b, cfg, snapB.pieces.find((p) => p.id === snapA.pieces.find((q) => q.out).id), 'ch:');
  assert.equal((await vb).pieces[0].id, f.pieces[0].id, 'a mesma próxima peça para os dois');
  assert.equal(conta(cfg, mA.ps).fila, 5);
  fecha(a, b);
});

test('Desafio: um dos celulares com o jogo antigo → bandeja de antes; Quebrando Cabeças continua com a caixa', async () => {
  let r = await largada(20, 'comum', true, false);
  assert.equal(r.snapA.cfg.FILA, undefined);
  assert.ok(r.snapA.pieces.every((p) => p.out));
  fecha(r.a, r.b);
  r = await largada(20, 'quebra');
  assert.ok(r.snapA.cfg.GIFT, 'caixa mágica');
  assert.equal(r.snapA.cfg.FILA, undefined, 'sem fileira no Quebrando Cabeças');
  fecha(r.a, r.b);
});

test('fila.js: o teto e a regra de vagas livres (unidade)', () => {
  const cfg = { TRAY_LINE: 100, FILA: { slots: [0, 1, 2, 3, 4].map((k) => ({ x: 100 + 200 * k, y: 200 })) } };
  const ps = Array.from({ length: 20 }, (_, id) => ({ id, locked: false, x: 0, y: 0 }));
  fila.init(cfg, ps, ps.map((p) => p.id));
  assert.deepEqual(ps.filter((p) => p.out).map((p) => p.id), [0, 1, 2, 3, 4], 'segue a ordem dada');
  assert.deepEqual(fila.freeSlots(cfg, ps), []);
  ps[2].y = 50;                                                   // puxada para a grade
  const r = fila.refill(cfg, ps);
  assert.deepEqual(r.map((g) => [g.id, g.slot]), [[5, 2]], 'a vaga 2 ficou livre');
  ps[0].y = 50; fila.refill(cfg, ps); ps[1].y = 50; fila.refill(cfg, ps);          // 3 soltas, fileira cheia
  assert.deepEqual(fila.count(cfg, ps), { fila: 5, soltas: 3, guardadas: 12 });
  ps[3].y = 50;
  assert.deepEqual(fila.refill(cfg, ps), [], 'a 4ª solta não traz peça (teto 8)');
  ps[3].locked = true;
  assert.equal(fila.refill(cfg, ps).length, 1, 'encaixou: libera');
  // "Continuar jogando": peças já encaixadas ficam no lugar; a fileira recomeça com 5 das que faltam
  const salvo = Array.from({ length: 20 }, (_, id) => ({ id, locked: id < 7, x: 0, y: 0 }));
  fila.init(cfg, salvo);
  assert.ok(salvo.filter((p) => p.locked).every((p) => p.out === true), 'encaixadas continuam à vista');
  assert.equal(salvo.filter((p) => !p.locked && p.out).length, 5, '5 das que faltam na fileira');
  assert.deepEqual(fila.freeSlots(cfg, salvo), []);
  const sem = ps.map((p) => Object.assign({}, p));
  assert.deepEqual(fila.refill({ TRAY_LINE: 100 }, sem), [], 'sem fileira no layout: não faz nada');
});

test('código: o cliente só desenha o que o servidor manda; contratos preservados', () => {
  const js = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');
  const sv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  const ch = fs.readFileSync(path.join(ROOT, 'challenge.js'), 'utf8');
  assert.match(js, /auth: \{ fila: 1 \}/, 'o jogo novo avisa que sabe mostrar a fileira');
  assert.match(js, /socket\.on\('fila', applyFila\);\s*socket\.on\('ch:fila', applyFila\);/);
  const body = js.slice(js.indexOf('function applyFila('), js.indexOf('function classify('));
  assert.doesNotMatch(body, /socket\.emit|gameEmit|\.locked\s*=/, 'o celular não decide nada da fileira');
  assert.match(sv, /if \(!p \|\| room\.status === 'won' \|\| p\.out === false\) return;/, 'servidor recusa pegar peça guardada');
  assert.match(ch, /if \(!p \|\| !p\.out\) return;/, 'Sala Desafio recusa pegar peça guardada');
  assert.equal((sv.match(/SNAP: Math\.round\(tile \* SNAP_FACTOR\)/g) || []).length, 1);
  assert.match(sv, /FILEIRA=0/, 'há um jeito de desligar no Render sem mexer no código');
});
