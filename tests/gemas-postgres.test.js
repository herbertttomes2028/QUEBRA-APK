'use strict';
// Integração REAL com PostgreSQL 16 isolado. Disponível no GitHub Actions (sem instalação no PC).
// Não tem permissão de trabalhar com bancos remotos: a proteção abaixo impede rodar no Neon.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const gemm = require('../gems');
const xp = require('../xp');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';
const allow = () => {
  const u = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname) || u.pathname !== '/qc_test')
    throw new Error('PROTEÇÃO: os testes de gemas só podem acessar qc_test em localhost, nunca Neon/produção.');
};

test('PostgreSQL: migração, créditos atômicos, idempotência, rollback e concorrência', { skip: !enabled }, async () => {
  allow();
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: connection, ssl: false, max: 3 });
  let uid;
  async function transact(ref, pieces, eligible, beforeXp, afterXp, rollback = false) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT xp FROM users WHERE id = $1 FOR UPDATE', [uid]);
      const r = await gemm.creditTx((s, p) => client.query(s, p), uid, ref, pieces, eligible, beforeXp, afterXp);
      if (rollback) await client.query('ROLLBACK'); else await client.query('COMMIT');
      return r;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally { client.release(); }
  }
  const balance = async () => Number((await pool.query('SELECT gems FROM users WHERE id = $1', [uid])).rows[0].gems);
  try {
    const migrations = (await pool.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(x => x.name);
    assert.deepEqual(migrations, ['001_contas.sql','002_seguranca.sql','003_xp.sql','004_modo_solo.sql','005_gemas.sql','006_biblioteca.sql']);
    const unique = crypto.randomBytes(8).toString('hex');
    uid = (await pool.query("INSERT INTO users (google_sub, name, friend_code) VALUES ($1, 'Teste Gemas', $2) RETURNING id", ['test-gems-' + unique, unique.slice(0,8).toUpperCase()])).rows[0].id;
    assert.equal(await balance(), 0);
    assert.deepEqual(await transact('c:teste:1',12,true,0,xp.CUM[2]), {match:2,level:10,balance:12});
    assert.equal(await balance(), 12);
    assert.deepEqual(await transact('c:teste:1',12,true,0,xp.CUM[2]), {match:0,level:0,balance:12});
    assert.deepEqual(await transact('d:incompleto',48,false,xp.CUM[2],xp.CUM[2]), {match:0,level:0,balance:12});
    assert.equal(await balance(), 12);
    await transact('c:cancelado',30,true,xp.CUM[2],xp.CUM[3],true);
    assert.equal(await balance(), 12, 'ROLLBACK reverte saldo e lançamento');
    assert.equal((await pool.query("SELECT count(*)::int AS n FROM gem_events WHERE user_id=$1 AND ref='match:c:cancelado'", [uid])).rows[0].n, 0);
    assert.deepEqual(await transact('c:cancelado',30,true,xp.CUM[2],xp.CUM[3]), {match:5,level:10,balance:27});
    const [a,b] = await Promise.all([
      transact('d:paralelo',48,true,xp.CUM[3],xp.CUM[3]),
      transact('d:paralelo',48,true,xp.CUM[3],xp.CUM[3])
    ]);
    assert.equal(a.match + b.match, 8, 'duas transações simultâneas só pagam uma vez');
    assert.equal(await balance(), 35);
    assert.equal((await pool.query('SELECT sum(amount)::int AS n FROM gem_events WHERE user_id=$1',[uid])).rows[0].n,35);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM gem_events WHERE user_id=$1',[uid])).rows[0].n,5);
  } finally {
    if (uid) await pool.query('DELETE FROM users WHERE id=$1',[uid]);
    await pool.end();
  }
});
