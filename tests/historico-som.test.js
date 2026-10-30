'use strict';
// Regressões específicas: histórico visível de 6 partidas e mesmo som nos botões.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const accounts = read('accounts.js');
const game = read('public/game.js');
const conta = read('public/conta.js');

test('Minhas partidas: API retorna somente as 6 mais recentes, em ordem estável', () => {
  assert.match(accounts, /r\.get\('\/matches'[\s\S]*?FROM matches WHERE user_id = \$1 ORDER BY created_at DESC, id DESC LIMIT 6/);
  assert.doesNotMatch(accounts, /r\.get\('\/matches'[\s\S]*?LIMIT 30/);
  assert.match(conta, /api\('GET', '\/matches'\)/);
  assert.match(conta, /j\.matches\.forEach\(function \(m, i\)/); // visual original permanece
});

test('A limitação não apaga histórico, nem mexe no cálculo de estatísticas ou XP', () => {
  const snippet = accounts.match(/r\.get\('\/matches'[\s\S]*?\n  \}\)\);/);
  assert.ok(snippet, 'rota /matches existente');
  assert.doesNotMatch(snippet[0], /\bDELETE\b|\bTRUNCATE\b|\bUPDATE\b/i);
  assert.match(accounts, /SELECT count\(\*\) FILTER/); // estatísticas continuam usando histórico completo
  assert.match(accounts, /function payMatch\(/); // entrada única de XP preservada
});

test('Todo botão recebe exatamente um som de clique no evento click, inclusive teclas e botões dinâmicos', () => {
  const begin = game.indexOf("document.addEventListener('click', function (e) {", game.indexOf('var lastBtn = null'));
  const end = game.indexOf('}, true);', begin) + '}, true);'.length;
  assert.ok(begin > 0 && end > begin, 'ouvinte de cliques localizado');
  let clickHandler, clicks = [];
  const ctx = {
    document: { addEventListener: (event, callback, capture) => {
      assert.equal(event, 'click'); assert.equal(capture, true); clickHandler = callback;
    } },
    playSound: (name) => clicks.push(name)
  };
  vm.runInNewContext('var lastBtn = null;\n' + game.slice(begin, end), ctx);
  assert.equal(typeof clickHandler, 'function');
  const btn = (disabled = false, ariaDisabled = null) => ({
    disabled, getAttribute: (a) => a === 'aria-disabled' ? ariaDisabled : null
  });
  const fire = (b) => clickHandler({target: {closest: (selector) => {
    assert.equal(selector, 'button'); return b;
  }}});
  const a = btn(), b = btn();
  fire(a); fire(b); // o mesmo som para todos os botões
  assert.deepEqual(clicks, ['blip', 'blip']);
  assert.equal(ctx.lastBtn, b, 'mantém o retorno de foco às janelas');
  fire(null); fire(btn(true)); fire(btn(false, 'true'));
  assert.deepEqual(clicks, ['blip', 'blip'], 'ignora cliques fora de botões e botões desabilitados');
});

test('Não duplica som de clique: chamadas locais removidas e áudio respeita ajuste de som', () => {
  assert.doesNotMatch(conta, /QC\.playSound\('blip'\)/);
  assert.equal((game.match(/playSound\('blip'\)/g) || []).length, 2, 'um no clique global, outro ao religar som');
  assert.match(game, /function getAudio\(\)\s*\{\s*if \(!state\.settings\.sound\) return null;/);
  assert.match(game, /snap: function \(c\)/, 'som de encaixe existente continua');
  assert.match(game, /blip: function \(c\)/, 'som Amigos existente continua');
  assert.match(game, /if \(key === 'sound' && state\.settings\.sound\) playSound\('blip'\)/);
});
