'use strict';
// Rodada privacidade-sala (auditoria de 14/11/2026, achados SEC-01 e SEC-05). A política promete: dentro da sala a outra pessoa vê só
// "Jogador 1/2", nunca apelido, ID, nível, gemas, pet ou roupas. Estas travas de código complementam o teste dinâmico (seguranca-perfil, 7b).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('servidor: o nível mostrado nas salas vem só de roomLevel, que é sempre 0', () => {
  const s = read('server.js');
  assert.match(s, /function roomLevel\(\) \{ return 0; \}/);
  assert.ok(!/accHooks\.levelOf\(/.test(s), 'nenhuma sala consulta o nível real do perfil');
  assert.match(s, /level: roomLevel\(socket\.data\.uid\)/);
  assert.match(s, /levelOf: roomLevel,/, 'a Sala Desafio recebe o mesmo roomLevel');
  assert.match(s, /const lv = roomLevel\(uid\);/);
});

test('contas: a lista de bloqueados não lê nem devolve ID, apelido, nível ou avatar de quem foi bloqueado', () => {
  const a = read('accounts.js');
  const rota = a.slice(a.indexOf("r.get('/blocks'"), a.indexOf("r.post('/blocks'"));
  assert.ok(rota.length > 50, 'rota GET /blocks encontrada');
  assert.ok(!/friend_code|u\.name|u\.avatar|JOIN users|levelFromXp/.test(rota), 'GET /blocks não lê dados do perfil bloqueado');
  assert.match(rota, /name: 'Jogador bloqueado', avatar: '', level: 0/);
  assert.match(a, /const BLOCK_REF_KEY = crypto\.randomBytes\(32\)/, 'referência opaca com chave aleatória do processo');
  assert.ok(!/const publicUser\b/.test(a), 'o formato antigo (com ID e nível) não existe mais');
});

test('tela: a lista de bloqueados mostra só "Jogador bloqueado" e desbloqueia pela referência', () => {
  const c = read('public/conta.js');
  const fn = c.slice(c.indexOf('function loadBlocked()'), c.indexOf("$('#sec-blocked-open')"));
  assert.ok(fn.length > 50, 'loadBlocked encontrada');
  assert.ok(!/u\.name|u\.level|u\.avatar/.test(fn), 'a tela não usa nome, nível nem avatar vindos do servidor');
  assert.match(fn, /row\(\{ name: 'Jogador bloqueado', avatar: '', level: 0 \}/);
  assert.match(fn, /\{ ref: u\.ref \|\| u\.code \}/);
});
