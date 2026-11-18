'use strict';
// PostgreSQL real somente no banco temporário qc_test do GitHub Actions.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const library = require('../library');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';

test('PostgreSQL isolado: conclusão idempotente, acesso gratuito e saldos preservados', {skip:!enabled}, async()=>{
  const url = new URL(connection);
  if (!['127.0.0.1','localhost'].includes(url.hostname) || url.pathname!=='/qc_test')
    throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const {Pool}=require('pg');const pool=new Pool({connectionString:connection,ssl:false,max:5});
  const db={q:(s,p)=>pool.query(s,p),pool};const api=library.makeService(db);
  let uid, uid2;
  const uniq=crypto.randomBytes(8).toString('hex');
  const all=(c)=>library.ALL.filter(i=>i.categoryId===c).map(i=>i.file);
  async function record(file){
    const c=await pool.connect();
    try { await c.query('BEGIN');const r=await api.recordTx((s,p)=>c.query(s,p),uid,file);await c.query('COMMIT');return r; }
    catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;}finally{c.release();}
  }
  try {
    const migrations=(await pool.query('SELECT name FROM schema_migrations ORDER BY name')).rows.map(x=>x.name);
    assert.ok(migrations.includes('006_biblioteca.sql'),'migração 006 aplicada');
    uid=(await pool.query("INSERT INTO users(google_sub,name,friend_code,gems) VALUES($1,'Teste biblioteca',$2,80) RETURNING id",['library-'+uniq,uniq.toUpperCase().slice(0,8)])).rows[0].id;
    assert.equal((await api.status(uid)).gems,80);
    assert.equal(await api.canPlay(uid,all('fauna')[0]),true);
    // Nenhuma imagem exige concluir uma coleção anterior, possuir conta ou gastar gemas.
    for (const id of library.CATEGORIES.map(c => c.id)) {
      assert.equal(await api.canPlay(uid, all(id)[0]), true, id + ' para usuário sem progresso');
      assert.equal(await api.canPlay(null, all(id)[0]), true, id + ' para visitante');
      assert.equal((await api.status(uid)).unlocked[id], true, id + ' aparece liberada na API');
    }
    assert.equal(await record(all('fauna')[0]),true);
    assert.equal(await record(all('fauna')[0]),false,'mesma imagem é registrada uma vez');
    for(const f of all('fauna').slice(1)) await record(f);
    for(const f of all('biomas')) await record(f);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM library_clears WHERE user_id=$1',[uid])).rows[0].n,10);
    assert.equal((await api.status(uid)).gems,80,'progresso não consome as gemas');
    const paralelo = await Promise.all([api.buy(uid,'fantasia'),api.buy(uid,'fantasia'),api.buy(uid,'fantasia')]);
    assert.ok(paralelo.every(x => !x.ok && x.error === 'invalid'), 'compra antiga desativada, sem cobrar');
    assert.deepEqual([await api.buy(uid,'cultura'), await api.buy(uid,'fauna')], [
      {ok:false,error:'invalid'}, {ok:false,error:'invalid'}]);
    assert.equal((await api.status(uid)).gems,80,'nenhuma cobrança');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM library_unlocks WHERE user_id=$1',[uid])).rows[0].n,0,'nenhuma compra registrada');
    uid2=(await pool.query("INSERT INTO users(google_sub,name,friend_code,gems) VALUES($1,'Teste saldo insuficiente',$2,10) RETURNING id", ['library-poor-'+uniq,'P'+uniq.toUpperCase().slice(0,7)])).rows[0].id;
    assert.equal(await api.canPlay(uid2,all('cultura')[0]),true,'saldo pequeno não bloqueia');
    assert.equal((await api.buy(uid2,'cultura')).error,'invalid','categoria grátis não cobra');
    assert.equal((await api.status(uid2)).gems,10,'saldo intacto');
    assert.equal((await api.status(uid2)).purchases.length,0);
  } finally { if(uid2) await pool.query('DELETE FROM users WHERE id=$1',[uid2]);if(uid) await pool.query('DELETE FROM users WHERE id=$1',[uid]);await pool.end(); }
});
