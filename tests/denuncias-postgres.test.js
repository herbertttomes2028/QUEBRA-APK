"use strict";
// PostgreSQL real somente no banco temporário qc_test, num SCHEMA TEMPORÁRIO isolado.
// Cadastro só com "tenho 13 anos ou mais" + denúncias de jogadores (rotas HTTP e o evento da sala): validação, limites, deduplicação, bloqueio junto,
// a pessoa denunciada nunca é avisada, e tudo some em cascata quando uma conta é excluída.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';

test('PostgreSQL: cadastro 13+ e denúncias (HTTP e sala), com limites, sigilo e exclusão em cascata', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg');
  const { createAccounts } = require('../accounts');
  const schema = 't_den_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: connection, ssl: false, max: 4, options: `-c search_path=${schema}` });
  const db = { q: (s, p) => pool.query(s, p), pool };
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  try {
    const dir = path.join(__dirname, '..', 'migrations');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    const q = (s, p) => pool.query(s, p);
    const mkUser = async (name, code) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded) VALUES ($1,$2,$3,0,true) RETURNING id', [name.toLowerCase() + '@t.test', name, code])).rows[0].id;
    const mkSession = async (uid) => { const t = 'tok-' + crypto.randomBytes(8).toString('hex'); await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,now() + interval '1 day')", [sha(t), uid]); return t; };
    const A = await mkUser('Ana', 'AAAAAAA2'), B = await mkUser('Beto', 'BBBBBBB2'), C = await mkUser('Cris', 'CCCCCCC2'), D = await mkUser('Davi', 'DDDDDDD2');
    const tA = await mkSession(A), tC = await mkSession(C), tD = await mkSession(D);

    /* ---- as rotas, com um "express" de mentira, e o socket de mentira ---- */
    const routes = {}; const router = { get(p, ...hh) { routes['GET ' + p] = hh; return router; }, post(p, ...hh) { routes['POST ' + p] = hh; return router; }, use() { return router; } };
    const emitidos = []; const io = Object.assign(new EventEmitter(), { sockets: { sockets: new Map() }, to: (sala) => ({ emit: (ev, d) => emitidos.push([sala, ev, d && d.t]) }) });
    let peer = null;
    createAccounts({ app: { use() {} }, express: { Router: () => router, json: () => (_, __, next) => next() }, io, db, cleanName: (n) => String(n || '').slice(0, 12), cleanAvatar: (a) => a, roomInfo: () => null, roomOfSocket: () => null,
      imageLabel: () => 'Capivara', getUpload: () => null, putUpload: () => null, onAuth: () => {}, mailer: null, peerOf: () => peer, elapsedOf: () => 0 });
    const post = (route, token, body, ip) => new Promise((resolve) => {
      const req = { get: (h) => (h.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : ''), query: {}, body: body || {}, method: 'POST', path: route, ip: ip || '127.0.0.1' };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() {}, json(x) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(x)) }); } };
      const hh = routes['POST ' + route]; let i = 0; const next = () => hh[++i](req, res, next); hh[0](req, res, next);
    });
    const sockets = {};
    const conecta = (uid, token) => { const h = {}; const s = { id: 's-' + uid, data: { uid, sessionHash: sha(token) }, handshake: { auth: {} }, on(ev, fn) { h[ev] = fn; }, join() {}, leave() {}, emit() {}, rooms: new Set() }; io.emit('connection', s); sockets[uid] = h; return (ev, payload) => new Promise((ok) => h[ev](payload, ok)); };
    const rep = async (token, b) => post('/reports', token, b);
    const linhas = async (w, p) => (await q('SELECT * FROM reports ' + (w || ''), p || [])).rows;

    /* ================= 1) cadastro: só com a confirmação de 13+ ================= */
    let ipN = 0; const reg = (b) => post('/register', null, b, '10.0.0.' + (++ipN));       // cada tentativa de outro IP (o limite de cadastros por IP já existe)
    const senha = 'Quebra!Cabeca#2026';
    const base = { email: 'novo1@t.test', password: senha, name: 'Nina', consent: true };
    assert.equal((await reg(Object.assign({}, base, { consent: false, age13: true }))).body.error, 'consent', 'sem a caixa de privacidade: recusa');
    let r = await reg(base); assert.deepEqual([r.status, r.body.error], [400, 'age13'], 'sem confirmar 13+: recusa');
    r = await reg(Object.assign({}, base, { age13: false })); assert.equal(r.body.error, 'age13', 'age13 falso: recusa');
    for (const falso of ['true', 1, 'sim', {}, null]) assert.equal((await reg(Object.assign({}, base, { age13: falso }))).body.error, 'age13', 'só o booleano true vale: ' + JSON.stringify(falso));
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE email = 'novo1@t.test'")).rows[0].n, 0, 'nenhuma conta foi criada sem a confirmação');
    r = await reg(Object.assign({}, base, { age13: true })); assert.equal(r.body.ok, true, 'com as duas caixas: cria a conta ' + JSON.stringify(r.body).slice(0, 160)); assert.ok(r.body.token);
    assert.equal((await q("SELECT count(*)::int AS n FROM users WHERE email = 'novo1@t.test'")).rows[0].n, 1);

    /* ================= 2) denúncia por HTTP ================= */
    r = await rep(tA, { code: 'BBBBBBB2', reason: 'apelido', note: ' ofensivo\n\t' + 'x'.repeat(300) + '\u0000', context: 'amigos' });
    assert.deepEqual([r.status, r.body.ok, r.body.blocked], [200, true, false]);
    let L = await linhas(); assert.equal(L.length, 1); const d = L[0];
    assert.deepEqual([d.reporter, d.reported, d.reason, d.context, d.status, d.reported_name], [A, B, 'apelido', 'amigos', 'novo', 'Beto'], 'guarda quem, de quem, motivo, onde, estado e o apelido DA HORA');
    assert.ok(d.note.length === 200 && !/[\u0000-\u001f]/.test(d.note) && d.note.startsWith('ofensivo xxx'), 'a nota perde caracteres de controle e é cortada em 200: ' + d.note.length);
    r = await rep(tA, { code: 'BBBBBBB2', reason: 'comportamento', context: 'qualquer-coisa' }); assert.equal(r.body.ok, true);
    assert.equal((await linhas("WHERE reason = 'comportamento'"))[0].context, 'perfil', 'contexto desconhecido vira "perfil"');
    assert.deepEqual([(await rep(tA, { code: 'BBBBBBB2', reason: 'xingamento' })).body.error, (await rep(tA, { code: 'BBBBBBB2' })).body.error, (await rep(tA, { code: 'BBBBBBB2', reason: ['apelido'] })).body.error], ['reason', 'reason', 'reason'], 'motivo inválido, ausente ou fora da lista');
    r = await rep(tA, { code: 'AAAAAAA2', reason: 'apelido' }); assert.deepEqual([r.status, r.body.error], [400, 'self'], 'não dá para denunciar a si mesmo');
    r = await rep(tA, { code: 'ZZZZZZZ9', reason: 'apelido' }); assert.deepEqual([r.status, r.body.error], [404, 'notfound']);
    r = await rep(null, { code: 'BBBBBBB2', reason: 'apelido' }); assert.equal(r.status, 401, 'sem login: não');
    r = await rep('token-falso', { code: 'BBBBBBB2', reason: 'apelido' }); assert.equal(r.status, 401);
    const antes = (await linhas()).length;
    r = await rep(tA, { code: 'BBBBBBB2', reason: 'apelido', note: 'de novo' }); assert.equal(r.body.ok, true, 'a mesma denúncia repetida responde ok…');
    assert.equal((await linhas()).length, antes, '…mas conta uma vez só em 24 h');
    await q("UPDATE reports SET created_at = now() - interval '25 hours' WHERE reason = 'apelido'");
    await rep(tA, { code: 'BBBBBBB2', reason: 'apelido' }); assert.equal((await linhas("WHERE reason = 'apelido'")).length, 2, 'passadas 24 h, vale de novo');
    assert.deepEqual(emitidos.filter((e) => String(e[0]).includes(B)), [], 'a pessoa denunciada NUNCA é avisada (nenhum evento para ela)');

    /* ================= 3) denunciar e bloquear num toque só ================= */
    r = await rep(tD, { code: 'BBBBBBB2', reason: 'outro', alsoBlock: 'true' }); assert.equal(r.body.blocked, false, 'só o booleano true bloqueia');
    assert.equal((await q('SELECT count(*)::int AS n FROM blocks WHERE blocker = $1', [D])).rows[0].n, 0);
    await q("UPDATE reports SET created_at = now() - interval '25 hours' WHERE reporter = $1", [D]);
    r = await rep(tD, { code: 'BBBBBBB2', reason: 'outro', alsoBlock: true }); assert.equal(r.body.blocked, true);
    assert.equal((await q('SELECT count(*)::int AS n FROM blocks WHERE blocker = $1 AND blocked = $2', [D, B])).rows[0].n, 1, 'bloqueou junto');

    /* ================= 4) limite: 15 por hora por pessoa (HTTP e sala dividem o mesmo limite) ================= */
    let ultimo; for (let i = 0; i < 15; i++) ultimo = await rep(tC, { code: 'BBBBBBB2', reason: ['apelido', 'comportamento', 'outro'][i % 3] });
    assert.equal(ultimo.body.ok, true, 'a 15ª passa'); r = await rep(tC, { code: 'BBBBBBB2', reason: 'apelido' }); assert.deepEqual([r.status, r.body.error], [429, 'rate'], 'a 16ª é barrada');
    const falaC = conecta(C, tC); peer = { uid: B, name: 'Beto' };
    assert.equal((await falaC('acc:reportPeer', { reason: 'apelido' })).error, 'rate', 'e a sala usa o MESMO limite');

    /* ================= 5) denúncia dentro da sala (socket) ================= */
    const falaA = conecta(A, tA);
    peer = null; assert.equal((await falaA('acc:reportPeer', { reason: 'apelido' })).error, 'no_peer', 'sem ninguém na sala');
    peer = { uid: null, name: 'Visitante' }; assert.equal((await falaA('acc:reportPeer', { reason: 'apelido' })).error, 'guest', 'visitante não tem conta: não dá para denunciar');
    peer = { uid: B, name: 'Beto' };
    assert.equal((await falaA('acc:reportPeer', { reason: 'xingamento' })).error, 'reason'); assert.equal((await falaA('acc:reportPeer', undefined)).error, 'reason', 'sem dados: recusa sem quebrar');
    await q('DELETE FROM reports WHERE reporter = $1', [A]);
    const ok = await falaA('acc:reportPeer', { reason: 'comportamento', note: 'trapaceou', alsoBlock: true });
    assert.deepEqual([ok.ok, ok.name, ok.blocked], [true, 'Beto', true]);
    const sala = (await linhas('WHERE reporter = $1', [A]))[0]; assert.deepEqual([sala.context, sala.reason, sala.reported], ['sala', 'comportamento', B], 'contexto "sala"');
    assert.equal((await q('SELECT count(*)::int AS n FROM blocks WHERE blocker = $1 AND blocked = $2', [A, B])).rows[0].n, 1);
    await q('DELETE FROM sessions WHERE user_id = $1', [A]); assert.equal((await falaA('acc:reportPeer', { reason: 'apelido' })).error, 'auth', 'sessão encerrada: o socket não denuncia mais');

    /* ================= 6) restrições do próprio banco (a última defesa) ================= */
    for (const [sql, p, msg] of [
      ["INSERT INTO reports (reporter, reported, reason, context) VALUES ($1,$1,'apelido','perfil')", [A], 'a mesma pessoa'],
      ["INSERT INTO reports (reporter, reported, reason, context) VALUES ($1,$2,'xingamento','perfil')", [A, B], 'motivo fora da lista'],
      ["INSERT INTO reports (reporter, reported, reason, context) VALUES ($1,$2,'apelido','lugar-nenhum')", [A, B], 'contexto fora da lista'],
      ["INSERT INTO reports (reporter, reported, reason, context, note) VALUES ($1,$2,'apelido','perfil',repeat('x', 201))", [A, B], 'nota maior que 200'],
      ["INSERT INTO reports (reporter, reported, reason, context, status) VALUES ($1,$2,'apelido','perfil','sumiu')", [A, B], 'estado fora da lista']
    ]) await assert.rejects(q(sql, p), (e) => /violates|check|constraint/i.test(e.message), 'o banco recusa: ' + msg);

    /* ================= 7) excluir uma conta apaga as denúncias dela e contra ela ================= */
    const n0 = (await linhas()).length; assert.ok(n0 > 5);
    await q('DELETE FROM users WHERE id = $1', [C]); assert.equal((await linhas('WHERE reporter = $1', [C])).length, 0, 'denúncias feitas por quem saiu somem');
    await q('DELETE FROM users WHERE id = $1', [B]); assert.equal((await linhas('WHERE reported = $1', [B])).length, 0, 'denúncias contra quem saiu somem');
    assert.equal((await linhas()).length, 0, 'não sobra nenhuma ligada a contas que existiam');
  } finally {
    await pool.end().catch(() => {});
    await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }
});
