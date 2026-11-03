"use strict";
// Escolher a imagem dentro da categoria: UMA elevação suave. Antes eram dois pulos somados (curva com mola + animação pick-pop).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
const js = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');

test('o cartão da imagem não tem curva com mola nem animação de pop: só a elevação do estado selecionado', () => {
  const regra = /\n\.pick-card \{ font-family: "Fredoka", var\(--font\); font-weight: 600; transition: ([^}]*)\}/.exec(css);
  assert.ok(regra, 'regra .pick-card com transition não encontrada');
  assert.doesNotMatch(regra[1], /1\.56|1\.4|1\.2/, 'sem curva que ultrapassa o ponto final (mola)');
  assert.match(regra[1], /transform \.2s cubic-bezier\(\.2, \.8, \.2, 1\)/, 'elevação suave de 0,2 s, sem overshoot (y2 <= 1)');
  assert.ok(!/@keyframes pick-pop/.test(css) && !/\.pick-card\.pop/.test(css), 'a animação pick-pop saiu');
  assert.match(css, /\.pick-card\[aria-selected="true"\] \{ transform: translateY\(-3px\) scale\(1\.03\);/, 'o estado selecionado continua elevado');
  assert.match(css, /\.pick-card:active \{ transform: translateY\(-3px\) scale\(1\.03\); \}/, 'o toque já começa a elevar (sem afundar e subir)');
  assert.doesNotMatch(css, /\.pick-card:active \{ transform: scale\(\.97\)/);
});

test('selectImage não dispara mais o pop no cartão (a elevação vem só do aria-selected)', () => {
  const m = /function selectImage\(file, card\) \{([\s\S]*?)\n  \}\n/.exec(js);
  assert.ok(m, 'selectImage não encontrada');
  assert.ok(!/popEl\(card/.test(m[1]), "popEl(card, 'pop') saiu");
  assert.match(m[1], /setAttribute\('aria-selected', c\.dataset\.file === file \? 'true' : 'false'\)/);
  assert.match(m[1], /popEl\(th, 'swap'\)/, 'a miniatura do painel de baixo mantém o seu efeito próprio (não é o cartão)');
});
