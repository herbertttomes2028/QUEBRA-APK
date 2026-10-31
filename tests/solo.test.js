'use strict';
// Modo Solo: servidor real + clientes Socket.IO, sem banco. (As proteções do progresso salvo e do XP exigem PostgreSQL e ficam no pacote de integração.)
const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, client } = require('./helpers');

let srv, cfgJson;
test.before(async () => { srv = await startServer(); cfgJson = await (await fetch(srv.url + '/api/config')).json(); });
test.after(async () => { await srv.stop(); });

const alvo = (cfg, p) => ({ x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });
const pidNovo = (n) => 'pid-' + n + '-' + Math.random().toString(36).slice(2, 10);
async function criaSolo(pieces) {
  const a = await client(srv.url), pid = pidNovo('solo');
  const r = await a.emitAck('create', { pid, imageId: cfgJson.images[0].file, pieces: pieces || 6, name: 'Ana', solo: true });
  assert.ok(r.ok, JSON.stringify(r));
  return { a, pid, snap: r.snapshot, code: r.snapshot.code };
}
async function encaixa(a, snap, p) {
  const t = alvo(snap.cfg, p);
  a.emit('grab', { id: p.id });
  await a.once_('grabbed', (d) => d.id === p.id);
  const trava = a.once_('locked', (d) => d.id === p.id);
  a.emit('drop', { id: p.id, x: t.x, y: t.y });
  return trava;
}

test('Solo começa sozinho (1 pessoa, relógio correndo); o cooperativo continua esperando o amigo', async () => {
  const { a, snap } = await criaSolo();
  assert.equal(snap.solo, true);
  assert.equal(snap.status, 'playing');
  const b = await client(srv.url);
  const rc = await b.emitAck('create', { pid: pidNovo('coop'), imageId: cfgJson.images[0].file, pieces: 6, name: 'Caio' });
  assert.ok(rc.ok);
  assert.equal(rc.snapshot.solo, false, 'o cooperativo não é Solo');
  assert.equal(rc.snapshot.status, 'waiting', 'o cooperativo espera o amigo, como sempre');
  a.close(); b.close();
});

test('Solo: ninguém entra pelo código; só o dono volta (reconexão)', async () => {
  const { a, pid, code } = await criaSolo();
  const intruso = await client(srv.url);
  const r = await intruso.emitAck('join', { pid: pidNovo('intruso'), code, name: 'Intruso' });
  assert.deepEqual([r.ok, r.error], [false, 'notfound'], 'um desconhecido não pode ocupar a vaga 2 de uma sala Solo');
  const dono = await client(srv.url);                         // o dono cai e volta com o MESMO pid
  const rd = await dono.emitAck('join', { pid, code, name: 'Ana' });
  assert.ok(rd.ok, 'o dono volta');
  assert.equal(rd.snapshot.solo, true);
  assert.ok(!rd.snapshot.players[1] || !rd.snapshot.players[1].joined, 'a vaga 2 continua vazia');
  a.close(); intruso.close(); dono.close();
});

test('Solo: palpites de entrada contam como erro e a resposta é IGUAL à de um código inexistente (sem revelar a sala)', async () => {
  async function sequencia(codigoAlvo, preparar) {
    const s = await startServer();
    try {
      if (preparar) await preparar(s);
      const c = await client(s.url), respostas = [];
      const codigos = [codigoAlvo(s)].concat(['AAAAA1', 'AAAAA2', 'AAAAA3', 'AAAAA4', 'AAAAA5', 'AAAAA6', 'AAAAA7']);
      for (const code of codigos) { const r = await c.emitAck('join', { pid: pidNovo('p'), code, name: 'X' }); respostas.push(r.ok ? 'ok' : r.error); }
      c.close(); return respostas;
    } finally { await s.stop(); }
  }
  let codigoSolo = null;
  const comSolo = await sequencia(() => codigoSolo, async (s) => {
    const cfg = await (await fetch(s.url + '/api/config')).json(), a = await client(s.url);
    const r = await a.emitAck('create', { pid: pidNovo('dono'), imageId: cfg.images[0].file, pieces: 6, name: 'Dono', solo: true });
    codigoSolo = r.snapshot.code;
  });
  const semSala = await sequencia(() => 'ZZZZZ9');
  assert.deepEqual(comSolo, semSala, 'sala Solo e código inexistente precisam responder igual, inclusive quando o endereço é bloqueado');
  assert.ok(comSolo.includes('locked'), 'depois de vários palpites errados o endereço é bloqueado');
});

test('Solo: não há bate-papo (o servidor recusa)', async () => {
  const { a } = await criaSolo();
  const r = await a.emitAck('chat', { p: 'oi' });
  assert.deepEqual([r.ok, r.error], [false, 'solo']);
  a.close();
});

test('Solo: encaixe, progresso de conclusão e vitória (sem 2º jogador)', async () => {
  const { a, snap } = await criaSolo(6);
  const progresso = [];
  a.on('locked', (d) => progresso.push(d.locked));
  const venceu = a.once_('won', null, 15000);
  for (const p of snap.pieces) await encaixa(a, snap, p);
  const w = await venceu;
  assert.deepEqual(progresso, [1, 2, 3, 4, 5, 6], 'o progresso sobe peça a peça até 6/6');
  assert.deepEqual(w.counts, [6, 0]);
  assert.equal(typeof w.elapsedMs, 'number');
  let pegou = false; a.on('grabbed', () => { pegou = true; });
  a.emit('grab', { id: 0 });
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(pegou, false, 'depois de concluir não dá para mexer nas peças');
  a.close();
});

test('Solo: a regra de encaixe é a mesma do cooperativo (só trava com rot 0 e a distância ≤ SNAP)', async () => {
  const { a, snap } = await criaSolo(12);
  const cfg = snap.cfg, p = snap.pieces[0], t = alvo(cfg, p);
  assert.ok(snap.pieces.every((q) => q.rot === 0), 'Solo: todas corretas');
  a.emit('grab', { id: p.id });
  await a.once_('grabbed', (d) => d.id === p.id);
  a.emit('move', { id: p.id, x: cfg.FIELD_W / 2, y: cfg.FIELD_H - cfg.TRAY });
  await new Promise((r) => setTimeout(r, 80));
  await new Promise((r) => setTimeout(r, 120));
  let travouCedo = false; a.on('locked', () => { travouCedo = true; });
  const dir = t.x > cfg.FIELD_W / 2 ? -1 : 1;
  const solta = a.once_('released', (d) => d.id === p.id);
  a.emit('drop', { id: p.id, x: t.x + dir * (cfg.SNAP + 3), y: t.y });
  await solta;
  assert.equal(travouCedo, false, 'travou além do SNAP');
  a.emit('grab', { id: p.id });
  await a.once_('grabbed', (d) => d.id === p.id);
  const trava = a.once_('locked', (d) => d.id === p.id);
  a.emit('drop', { id: p.id, x: t.x + dir * (cfg.SNAP - 1), y: t.y });
  const L = await trava;
  assert.deepEqual([L.x, L.y], [t.x, t.y]);
  a.close();
});

test('Solo: recomeçar é imediato (não pede ninguém) e a sala continua Solo', async () => {
  const { a, snap } = await criaSolo(6);
  await encaixa(a, snap, snap.pieces[0]);
  const novo = a.once_('state', null, 5000);
  const r = await a.emitAck('restart', {});
  assert.deepEqual([r.ok, r.immediate], [true, true]);
  const st = await novo;
  assert.equal(st.solo, true);
  assert.ok(st.pieces.every((p) => !p.locked), 'recomeçou do zero');
  a.close();
});

test('Solo: as dicas (💡) continuam funcionando', async () => {
  const { a } = await criaSolo();
  const r = await a.emitAck('hint', {});
  assert.equal(r.ok, true);
  a.close();
});
