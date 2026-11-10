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

async function largada(mode, pieces, antes) {
  const a = await client(srv.url), b = await client(srv.url);
  const pidA = 'pid-a-' + Math.random(), pidB = 'pid-b-' + Math.random();
  const c1 = await a.emitAck('ch:create', { pid: pidA, imageId: cfgJson.images[0].file, pieces, mode, name: 'Ana' });
  assert.ok(c1.ok, JSON.stringify(c1));
  const code = c1.lobby.code;
  const c2 = await b.emitAck('ch:join', { pid: pidB, code, name: 'Beto' });
  assert.ok(c2.ok, JSON.stringify(c2));
  if (antes) antes(a, b);                                   // escuta eventos que chegam junto com a largada
  const sa = a.once_('ch:start', null, 8000), sb = b.once_('ch:start', null, 8000);
  assert.ok((await a.emitAck('ch:imgready', {})).ok);
  assert.ok((await b.emitAck('ch:imgready', {})).ok);
  assert.ok((await a.emitAck('ch:ready', { ready: true })).ok);
  assert.ok((await b.emitAck('ch:ready', { ready: true })).ok);
  const [ia, ib] = await Promise.all([sa, sb]);
  return { a, b, snapA: ia.snapshot, snapB: ib.snapshot, code, pidA, pidB };
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

test('Sala Desafio: NÃO há giro. Todas as peças nascem na orientação certa (rot 0), nos dois tabuleiros e nos dois modos, e o evento de girar é ignorado', async () => {
  for (const [modo, n] of [['comum', 12], ['quebra', 12]]) {
    const { a, b, snapA, snapB } = await largada(modo, n);
    for (const snap of [snapA, snapB]) assert.ok(snap.pieces.length === n && snap.pieces.every((p) => p.rot === 0), modo + ': toda peça começa com rot 0');
    if (modo === 'comum') {
      assert.deepEqual(snapA.pieces.map((p) => [p.id, p.x, p.y, p.rot]), snapB.pieces.map((p) => [p.id, p.x, p.y, p.rot]), 'os dois recebem as mesmas posições');
      let girou = 0; a.on('rotated', () => { girou++; });
      const p0 = snapA.pieces[0]; a.emit('ch:grab', { id: p0.id }); await dorme(80);
      for (let i = 0; i < 3; i++) a.emit('ch:rotate', { id: p0.id });                 // clientes antigos podem mandar: nada acontece
      await dorme(150); assert.equal(girou, 0, 'o servidor não responde mais ao giro');
      // a peça continua em rot 0 e encaixa de primeira, sem ninguém girar
      await encaixa(a, snapA.cfg, { id: p0.id, col: p0.col, row: p0.row, rot: 0 }); await dorme(80);
    }
    fecha(a, b);
  }
});

test('Quebrando Cabeças: a caixa cospe sozinha as 3 primeiras peças na largada (nos dois tabuleiros, na mesma ordem), e as 3 seguintes quando elas são encaixadas', async () => {
  const giftsA = [], giftsB = [], rotados = [];
  const { a, b, snapA, snapB } = await largada('quebra', 12, (ca, cb) => { ca.on('ch:gift', (d) => giftsA.push(d)); cb.on('ch:gift', (d) => giftsB.push(d)); ca.on('rotated', (d) => rotados.push(d)); });
  assert.equal(snapA.mode, 'quebra');
  assert.ok(snapA.pieces.every((p) => p.out === false), 'o tabuleiro da largada ainda mostra todas as peças dentro da caixa (o cliente monta e depois anima)');
  await dorme(200);
  for (const g of [giftsA, giftsB]) {
    assert.equal(g.length, 3, 'a largada cospe exatamente 3 peças, sem ninguém tocar');
    assert.ok(g.every((x) => x.auto === true && x.start === true), 'marcadas como automáticas e de largada');
    assert.deepEqual(g.map((x) => x.k), [0, 1, 2]);
    assert.ok(g[0].delay >= 700 && g[1].delay - g[0].delay === 190 && g[2].delay - g[1].delay === 190, 'uma depois da outra, com o 1º atraso da largada: ' + g.map((x) => x.delay));
    assert.equal(new Set(g.map((x) => x.id)).size, 3, 'peças diferentes');
    assert.ok(g.every((x) => x.rot === 0), 'saem já na orientação certa');
    assert.deepEqual(g.map((x) => x.box.n), [1, 2, 3], 'o contador da rodada acompanha');
    assert.equal(g[2].box.blocked, true, 'com 3 fora, a caixa espera o encaixe');
  }
  assert.deepEqual(giftsA.map((x) => x.id), giftsB.map((x) => x.id), 'ordem justa: os dois recebem as mesmas peças, na mesma ordem');
  // tocar na caixa não existe mais: o pedido é recusado e nenhuma peça extra sai
  const r = await a.emitAck('ch:gift', {}); assert.deepEqual([r.ok, r.error], [false, 'auto']);
  await dorme(150); assert.equal(giftsA.length, 3, 'nenhuma peça extra por toque');
  // encaixa as 3 que saíram: a caixa cospe sozinha as 3 seguintes (sem marca de largada)
  const porId = new Map(snapA.pieces.map((p) => [p.id, p]));
  const antes = giftsA.length;
  for (const g of giftsA.slice(0, 3)) await encaixa(a, snapA.cfg, { id: g.id, col: porId.get(g.id).col, row: porId.get(g.id).row, rot: g.rot });
  await dorme(200);
  const novas = giftsA.slice(antes); assert.equal(novas.length, 3, 'rodada completa solta as 3 seguintes');
  assert.ok(novas.every((x) => x.auto === true && !x.start), 'rodadas seguintes não levam a marca de largada');
  assert.ok(novas.every((x) => giftsA.slice(0, 3).every((m) => m.id !== x.id)), 'peças novas');
  assert.equal(rotados.length, 0, 'nunca houve giro');
  fecha(a, b);
});

test('Quebrando Cabeças: as peças cuspidas na largada seguem no lugar para quem volta depois de uma queda de internet', async () => {
  const gifts = [];
  const { a, b, pidA, code } = await largada('quebra', 12, (ca) => ca.on('ch:gift', (d) => gifts.push(d)));
  await dorme(200); assert.equal(gifts.length, 3);
  a.close(); await dorme(150);
  const a2 = await client(srv.url);
  const rj = await a2.emitAck('ch:join', { pid: pidA, code, name: 'Ana' }); assert.ok(rj.ok, JSON.stringify(rj));
  assert.ok(rj.snapshot, 'quem volta recebe o tabuleiro');
  const fora = rj.snapshot.pieces.filter((p) => p.out);
  assert.deepEqual(fora.map((p) => p.id).sort((x, y) => x - y), gifts.map((g) => g.id).sort((x, y) => x - y), 'as 3 peças cuspidas estão fora da caixa, as outras não');
  assert.ok(fora.every((p) => p.rot === 0), 'e na orientação certa');
  assert.deepEqual(rj.snapshot.box && [rj.snapshot.box.n, rj.snapshot.box.blocked], [3, true]);
  fecha(a2, b);
});

test('Desafio: sair no meio da disputa dá a vitória ao outro', async () => {
  const { a, b } = await largada('comum', 6);
  const fim = b.once_('ch:end', null, 5000);
  a.emit('ch:leave');
  const e = await fim;
  assert.equal(e.winner, 1);
  fecha(a, b);
});
