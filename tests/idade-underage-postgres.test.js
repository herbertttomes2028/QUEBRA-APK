"use strict";
// PostgreSQL real somente no banco temporário qc_test, num SCHEMA TEMPORÁRIO isolado.
// POST /underage: quem informa ter menos de 16 anos tem a conta apagada em cascata (sem senha), só a PRÓPRIA; sem sessão não apaga ninguém; o /delete segue pedindo confirmação.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';

test('PostgreSQL: /underage apaga a conta da sessão (e só ela), avisa os amigos e encerra a sessão', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg');
  const { createAccounts } = require('../accounts');
  const schema = 't_age_' + crypto.randomBytes(5).toString('hex');
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
    const A = await mkUser('Ana', 'AAAAAAA3'), B = await mkUser('Beto', 'BBBBBBB3'), C = await mkUser('Cris', 'CCCCCCC3');
    const [x, y] = A < B ? [A, B] : [B, A]; await q("INSERT INTO friendships (user_a, user_b, requested_by, status, accepted_at) VALUES ($1,$2,$3,'accepted', now())", [x, y, A]);
    const tA = await mkSession(A), tB = await mkSession(B), tC = await mkSession(C);
    const routes = {}; const router = { get(p, ...hh) { routes['GET ' + p] = hh; return router; }, post(p, ...hh) { routes['POST ' + p] = hh; return router; }, use() { return router; } };
    const emitidos = []; const io = Object.assign(new EventEmitter(), { sockets: { sockets: new Map() }, to: (sala) => ({ emit: (ev, d) => emitidos.push([sala, ev, d && d.t]) }) });
    createAccounts({ app: { use() {} }, express: { Router: () => router, json: () => (_, __, next) => next() }, io, db, cleanName: (n) => String(n || '').slice(0, 12), cleanAvatar: (a) => a, roomInfo: () => null,
      imageLabel: () => 'Capivara', getUpload: () => null, putUpload: () => null, onAuth: () => {}, mailer: null, peerOf: () => null, elapsedOf: () => 0 });
    const post = (route, token, body) => new Promise((resolve) => {
      const req = { get: (h) => (h.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : ''), query: {}, body: body || {}, method: 'POST', path: route, ip: '127.0.0.1' };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() {}, json(o) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(o)) }); } };
      const hh = routes['POST ' + route]; let i = 0; const next = () => hh[++i](req, res, next); hh[0](req, res, next);
    });
    const existe = async (id) => (await q('SELECT 1 FROM users WHERE id = $1', [id])).rowCount === 1;

    let r = await post('/underage', null, {}); assert.deepEqual([r.status, r.body.error], [401, 'auth'], 'sem sessão não apaga ninguém');
    r = await post('/underage', 'token-que-nao-existe', {}); assert.deepEqual([r.status, r.body.error], [401, 'auth']);
    assert.ok(await existe(A) && await existe(B) && await existe(C));
    r = await post('/underage', tA, {}); assert.deepEqual([r.status, r.body.ok], [200, true], 'a própria conta, sem senha nem confirmação');
    assert.equal(await existe(A), false, 'a conta foi apagada'); assert.ok(await existe(B) && await existe(C), 'só a PRÓPRIA conta');
    assert.equal((await q('SELECT 1 FROM friendships')).rowCount, 0, 'a amizade saiu em cascata'); assert.equal((await q('SELECT 1 FROM sessions WHERE user_id = $1', [A])).rowCount, 0, 'e a sessão');
    assert.ok(emitidos.some((e) => e[0] === 'u:' + A && e[1] === 'acc:ev' && e[2] === 'deleted'), 'avisa os aparelhos da conta'); 
    r = await post('/underage', tA, {}); assert.equal(r.status, 401, 'o mesmo crachá não vale mais');
    assert.ok(await existe(B), 'o amigo continua com a conta');
    // o /delete segue exigindo a confirmação (a regra antiga não mudou)
    r = await post('/delete', tB, {}); assert.deepEqual([r.status, r.body.error], [400, 'confirm']); assert.ok(await existe(B), 'sem confirmar nada é apagado');
    r = await post('/delete', tC, { confirm: 'EXCLUIR' }); assert.equal(r.body.ok, true); assert.equal(await existe(C), false);
  } finally { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); }
});
