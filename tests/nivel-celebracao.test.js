'use strict';
// Segurança da nova comemoração: nenhum pagamento adicional, nenhuma tela de resultado interrompida.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const game = read('public/game.js'), account = read('public/conta.js'), html = read('public/index.html'), css = read('public/style.css');

test('sem timer antigo de 1,9 s: aviso permanece pendente enquanto houver partida ou resultado', () => {
  assert.doesNotMatch(game, /setTimeout\(function \(\) \{ showLevelUp\(/);
  assert.match(game, /levelAccountCode && currentScreen\(\) === 'home' && !state\.inGame && !state\.duel/);
  assert.match(game, /!document\.querySelector\('\.modal:not\(\[hidden\]\)'\)/);
  assert.match(game, /if \(name === 'home'\) \{ maybeApplyUpdate\(\); scheduleLevelCelebration\(\); \}/);
  assert.match(game, /function dismissLevelCelebration\(\)/);
  assert.match(game, /if \(!\$\('#lvup'\)\.hidden\) \{ dismissLevelCelebration\(\); return true; \}/);
});

test('pendência só da conta autenticada, recuperável após reload, sem alterar XP', () => {
  assert.match(game, /return 'levelPending\.' \+ levelAccountCode;/);
  assert.match(game, /store\.set\(levelPendingKey\(\), \{ from: from, to: to \}\)/);
  assert.match(game, /if \(levelAccountValue < pending\.to\) return;/);
  assert.match(account, /QC\.setLevelAccount\(me\.code, me\.xp && me\.xp\.level\)/);
  assert.match(account, /QC\.setLevelAccount\(null, 0\)/);
  assert.doesNotMatch(game, /(?:fetch|socket\.emit)\([^\n]*gemas/);
  assert.match(game, /state\.xpLast = ev;/);
  assert.match(account, /QC\.onXp\(ev\)/);
});

test('medalha e botão acessíveis, movimento reduzido, sem perturbar geometria das peças', () => {
  assert.match(html, /id="lvup"[^>]*role="dialog"[^>]*aria-modal="true"/);
  for (const id of ['lvup-title', 'lvup-n', 'lvup-from', 'lvup-desc', 'lvup-continue']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(css, /\.lvup-medal\s*\{/);
  assert.match(css, /\.lvup-continue:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /html\[data-motion="reduce"\] \.lvup/);
  assert.match(game, /playSound\('win'\)/);
  for (const file of ['server.js', 'challenge.js']) assert.match(read(file), /SNAP: Math\.round\(tile \* 0\.33\)/);
});
