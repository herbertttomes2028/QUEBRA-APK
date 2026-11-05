"use strict";
// A aba Conquistas tem ~120 cartões. Tocar nela não pode travar um celular simples (medido: 634 ms -> ~190 ms com CPU 4x mais lenta).
// Estas três proteções são o que mantém isso; os testes impedem que alguém as desfaça sem perceber.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const conta = read('public/conta.js'), css = read('public/style.css');
const renderAch = conta.slice(conta.indexOf('  function renderAch() {'), conta.indexOf('  // Uma área para cada categoria'));

test('CSS: cada cartão só gasta layout e pintura quando está perto da tela (content-visibility) e reserva a altura', () => {
  assert.match(css, /\.ach-card, \.col-card \{ content-visibility: auto; contain-intrinsic-size: auto 118px; \}/);
  assert.match(css, /\.col-card \{ contain-intrinsic-size: auto 420px; \}/);
  assert.doesNotMatch(css, /content-visibility: hidden/, '"hidden" esconderia o cartão para o leitor de tela');
});

test('desenho em lotes: a 1ª tela sai na hora (poucos cartões) e o resto entra nos quadros seguintes', () => {
  const first = Number(conta.match(/var ACH_FIRST_BATCH = (\d+), ACH_BATCH = (\d+);/)[1]), batch = Number(conta.match(/var ACH_FIRST_BATCH = (\d+), ACH_BATCH = (\d+);/)[2]);
  assert.ok(first >= 1 && first <= 8, 'o 1º lote cabe na primeira tela: ' + first);
  assert.ok(batch >= 4 && batch <= 12, 'cada lote seguinte é pequeno (um quadro leve): ' + batch);
  assert.match(renderAch, /lote\(ACH_FIRST_BATCH\);/);
  assert.match(renderAch, /requestAnimationFrame\(function \(\) \{ if \(token !== acc\.achToken\) return; lote\(ACH_BATCH\); resto\(\); \}\)/);
  assert.match(renderAch, /document\.createDocumentFragment\(\)/, 'cada lote entra no documento de uma vez');
  assert.doesNotMatch(renderAch, /out\.appendChild\(achCard/, 'nenhum cartão é colocado direto na tela, fora dos lotes');
});

test('desenho em lotes: trocar de filtro no meio cancela o desenho antigo (sem cartões misturados)', () => {
  assert.match(renderAch, /var token = acc\.achToken = \(acc\.achToken \|\| 0\) \+ 1, next = 0;/);
  assert.match(renderAch, /acc\.achSig = sig; out\.innerHTML = '';/);
  assert.equal((renderAch.match(/out\.innerHTML/g) || []).length, 1, 'a lista só é limpa num lugar, junto da troca do token');
});

test('memória: se nada mudou desde o último desenho, não refaz os cartões, mas o que mudou (progresso, filtro, grupo, novas) refaz', () => {
  const m = renderAch.match(/var sig = \[([^\]]*)\]\.join\('\|'\);/); assert.ok(m, 'assinatura');
  for (const parte of ['s.done', 's.xpDone', 'a.now', 'filter', 'group', 'fresh.join']) assert.ok(m[0].includes(parte) || renderAch.includes(parte), 'a assinatura precisa cobrir: ' + parte);
  assert.match(renderAch, /if \(out\.childElementCount && acc\.achSig === sig\) \{ achMarkSeen\(list\); updateAchBadge\(\); return; \}/, 'mesmo sem refazer, as "novas" continuam sendo marcadas como vistas');
  assert.ok(renderAch.indexOf('acc.achSig === sig') < renderAch.indexOf("out.innerHTML = ''"), 'a verificação vem ANTES de limpar a lista');
});

test('a ordem dos cartões não mudou: as novas no topo, depois cada grupo com título, texto e cartões', () => {
  const ordem = ['✨ Novas conquistas!', "el('h4', 'ach-sec')", "el('p', 'ach-blurb', g.blurb)", "'ach-empty'"].map((t) => renderAch.indexOf(t));
  assert.ok(ordem.every((n) => n > 0) && ordem.slice().sort((a, b) => a - b).join() === ordem.join(), 'ordem de montagem: ' + ordem);
  assert.match(renderAch, /list\.filter\(function \(a\) \{ return isFresh\[a\.id\]; \}\)\.forEach\(function \(a\) \{ plan\.push\(function \(\) \{ return achCard\(a, true, false\); \}\); shown\+\+; \}\);/);
});
