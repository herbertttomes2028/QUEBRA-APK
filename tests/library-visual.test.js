'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('títulos da biblioteca em maiúsculas e sem numeração; Abrir amarelo', () => {
  const js = read('public/game.js');
  const css = read('public/style.css');
  assert.match(js, /library-name', c\.name\.toLocaleUpperCase\('pt-BR'\)/);
  assert.match(js, /library-heading'\)\.textContent = c\.name\.toLocaleUpperCase\('pt-BR'\)/);
  assert.doesNotMatch(js, /library-name', c\.order \+ '\. '/);
  assert.match(css, /\.library-category\.available \.library-action \{ background: var\(--sun\); color: var\(--on-sun\);/);
});

test('moldura das miniaturas de categoria e botão JOGAR centralizado', () => {
  const css = read('public/style.css');
  assert.match(css, /\.library-cover \{[^}]*border: 3px solid/);
  assert.match(css, /\.library-cover \{[^}]*box-shadow:/);
  assert.match(css, /\.pick-sheet #btn-pick-go \{[^}]*margin: 0 auto; align-self: center;/);
  assert.match(css, /\.pick-sheet #btn-pick-go \{[^}]*max-width: 330px;/);
});

test('animação dourada ocorre só após a última conclusão, sem pagar gemas ou XP', () => {
  const js = read('public/game.js');
  const css = read('public/style.css');
  assert.match(js, /category\.images\.filter\(function \(x\) \{ return libraryDone\(x\.file\); \}\)\.length === category\.images\.length - 1/);
  assert.match(js, /libraryProgress\.loaded && state\.libraryCatalog\.find/);
  assert.match(js, /libraryCelebrationPending = null; \/\/ nunca repete/);
  assert.match(js, /CATEGORIA CONCLUÍDA!/);
  assert.match(css, /@keyframes library-gold-arrive/);
  assert.match(css, /@keyframes library-gold-glow/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /html:not\(\[data-motion="reduce"\]\) \.library-celebration-banner/);
});

test('cache novo e catálogo/identificadores anteriores preservados', () => {
  assert.match(read('public/sw.js'), /const CACHE = 'quebra-cabeca-v20'/);
  const lib = require('../library');
  assert.equal(lib.ALL.length, 25);
  assert.deepEqual(lib.CATEGORIES.map(c=>c.id),['fauna','biomas','espaco','cultura','fantasia']);
  assert.deepEqual(lib.CATEGORIES.map(c=>c.price),[0,0,0,25,40]);
});


test('capas, imagens da galeria, prévia e quebra-cabeça usam o mesmo arquivo principal e revisam o cache', () => {
  const js = read('public/game.js');
  assert.match(js, /var LIBRARY_MEDIA_VERSION = 'capas-20261031'/);
  assert.match(js, /url: libraryMediaUrl\(i\.url\), thumb: libraryMediaUrl\(i\.thumb\)/);
  assert.match(js, /img\.src = i\.categoryId \? i\.url : \(i\.thumb \|\| i\.url\)/);
  assert.match(js, /if \(item\.categoryId\) return Promise\.resolve\(item\.url\)/);
  assert.match(js, /loadImage\(item\.url\)\.then/);
  assert.match(js, /imageItem\(file\)/);
});

test('biblioteca com Fredoka, título centralizado e só um Voltar amarelo', () => {
  const html = read('public/index.html');
  const css = read('public/style.css');
  const js = read('public/game.js');
  assert.match(html, /id="btn-pick-back" class="btn btn-primary"/);
  assert.doesNotMatch(html, /id="library-back"/);
  assert.doesNotMatch(js, /\$\('#library-back'\)/);
  assert.match(css, /#screen-pick \.pick-inner \{ font-family: "Fredoka", var\(--font\); \}/);
  assert.match(css, /#screen-pick #btn-pick-back \{[^}]*background: var\(--sun\);/);
  assert.match(css, /\.library-heading \{[^}]*text-align: center;/);
  assert.match(js, /if \(libraryView !== 'home'\) \{ closePickSheet\(\); renderLibraryHome\(\); return; \}/);
});
