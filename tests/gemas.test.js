'use strict';
/* Testes sem PostgreSQL: regras puras + simulação das consultas do crédito.
 * A compatibilidade SQL real precisa ser verificada separadamente em PostgreSQL isolado. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const gemm = require('../gems');
const xpm = require('../xp');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const acc = read('accounts.js');

test('tabela de gemas por quebra-cabeça (somente cinco tamanhos conhecidos)', () => {
  for (const [pieces, amount] of [[6,1],[12,2],[20,3],[30,5],[48,8]]) assert.equal(gemm.forCompletion(pieces), amount);
  for (const pieces of [0,8,15,24,36,54,999,-1,NaN]) assert.equal(gemm.forCompletion(pieces),0);
});
test('bônus por subir de nível e todos os limites de faixa', () => {
  for(const [level, value] of [[1,0],[2,10],[9,10],[10,15],[19,15],[20,20],[29,20],[30,30],[49,30],[50,50],[100,50],[101,0]]) assert.equal(gemm.forLevel(level), value);
  assert.deepEqual(gemm.crossedLevels(1,3), [{level:2,gems:10},{level:3,gems:10}]);
  assert.deepEqual(gemm.crossedLevels(9,11), [{level:10,gems:15},{level:11,gems:15}]);
  assert.deepEqual(gemm.crossedLevels(10,10),[]);
});
test('migrações anteriores preservadas; 005 é aditiva e tem ledger único', () => {
  const lock=JSON.parse(read('tests/migrations.sha256.json'));
  for(const [f,hash] of Object.entries(lock)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'migrations',f))).digest('hex'),hash);
  const sql=read('migrations/005_gemas.sql');
  assert.match(sql,/ALTER TABLE users ADD COLUMN IF NOT EXISTS gems integer NOT NULL DEFAULT 0/);
  assert.match(sql,/UNIQUE \(user_id, ref\)/);
  assert.match(sql,/ON DELETE CASCADE/);
  assert.match(sql,/CHECK \(amount > 0\)/);
  assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b/i);
});
test('o servidor é dono das gemas, no mesmo commit do XP, nunca pelo cliente', () => {
  assert.match(acc,/await gemm\.creditTx\(q, uid, o\.ref, o\.pieces, rw\.earnedCompletion, u\.xp, r\.rows\[0\]\.xp\)/);
  assert.match(acc,/async function awardMatch\(uid, o\)/);
  assert.match(acc,/SELECT xp FROM users WHERE id = \$1 FOR UPDATE/);
  assert.match(read('gems.js'),/ON CONFLICT \(user_id, ref\) DO NOTHING RETURNING amount/);
  assert.match(read('gems.js'),/UPDATE users SET gems = gems \+ \$1 WHERE id = \$2 RETURNING gems/);
  assert.match(acc,/const solo = room\.solo === true/);
  assert.match(acc,/await payMatch\(p\.uid, \{/);
  assert.doesNotMatch(read('public/game.js')+read('public/conta.js'),/fetch\([^\n]*\bgems\b|socket\.emit\([^\n]*\bgems\b/i);
  assert.match(acc,/gems: Number\(\(await one\('SELECT gems FROM users WHERE id = \$1'/);
});
// Exercita a função de crédito efetiva de accounts.js com um interpretador pequeno de consultas.
// Não representa um banco PostgreSQL: é teste lógico de entradas, bônus e proteção idempotente.
function gemCreditFunction() {
  return gemm.creditTx;
}
function fakeQueries() {
  const state={balance:0,events:new Map(),checks:[]};
  async function q(sql,params) {
    state.checks.push({sql,params});
    if(sql.includes('INSERT INTO gem_events')) {
      const [,ref,kind,amount]=params;
      if(state.events.has(ref)) return {rows:[],rowCount:0};
      state.events.set(ref,{kind,amount});
      return {rows:[{amount}],rowCount:1};
    }
    if(sql.includes('UPDATE users SET gems = gems +')) {state.balance+=params[0];return {rows:[{gems:state.balance}],rowCount:1};}
    if(sql.includes('SELECT gems FROM users')) return {rows:[{gems:state.balance}],rowCount:1};
    throw new Error('consulta inesperada '+sql);
  }
  return {state,q};
}
test('crédito simulado: uma partida de 20 peças paga 3 gemas UMA vez', async () => {
  const credit=gemCreditFunction(); const {q,state}=fakeQueries();
  const a=await credit(q,'user-1','c:SALA:123',20,true,0,20);
  const b=await credit(q,'user-1','c:SALA:123',20,true,0,20);
  assert.deepEqual(a,{match:3,level:0,balance:3});
  assert.deepEqual(b,{match:0,level:0,balance:3});
  assert.equal(state.events.size,1);
});
test('crédito simulado: subir 2 níveis na conclusão e alcançar nível por conquista sem duplicidade', async () => {
  const credit=gemCreditFunction(); const {q,state}=fakeQueries();
  const to=xpm.CUM[3];
  const first=await credit(q,'user-1','d:AB:1',48,true,0,to);
  assert.deepEqual(first,{match:8,level:20,balance:28});
  const again=await credit(q,'user-1','d:AB:1',48,true,0,to);
  assert.deepEqual(again,{match:0,level:0,balance:28});
  const ach=await credit(q,'user-1','',0,false,to,xpm.CUM[4]);
  assert.deepEqual(ach,{match:0,level:10,balance:38});
  const achAgain=await credit(q,'user-1','',0,false,to,xpm.CUM[4]);
  assert.equal(achAgain.level,0);
  assert.equal(state.balance,38);
  assert.deepEqual([...state.events.keys()].sort(),['level:2','level:3','level:4','match:d:AB:1']);
});
test('crédito simulado: não paga gemas por derrota incompleta, participação ou tempo insuficiente', async () => {
  const credit=gemCreditFunction(); const {q,state}=fakeQueries();
  for(const ref of ['perdeu','participou','rapido']) {
    const r=await credit(q,'user-1',ref,30,false,0,0);
    assert.deepEqual(r,{match:0,level:0,balance:0});
  }
  assert.equal(state.events.size,0);
});
test('interface: mostra saldo privado, gemas no resultado e bônus apenas na medalha', () => {
  const game=read('public/game.js'), conta=read('public/conta.js'), html=read('public/index.html');
  for(const id of ['me-chip-gems','me-gems','me-gems-amount','lvup-gems','lvup-gems-count']) assert.ok(html.includes('id="'+id+'"'),id);
  assert.match(conta,/acc\.me\.gems = Math\.max\(Number\(acc\.me\.gems \|\| 0\), ev\.gemsBalance\)/);
  assert.match(game,/if \(ev\.gemsMatch > 0\)/);
  assert.match(game,/gems: \(\(old && old\.gems\) \|\| 0\) \+ \(Number\(ev\.gemsLevel\) \|\| 0\)/);
  assert.match(game,/levelAccountCode && currentScreen\(\) === 'home'/);
});
