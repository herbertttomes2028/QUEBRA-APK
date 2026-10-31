'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const js = read('public/game.js');
const css = read('public/style.css');
const html = read('public/index.html');

test('cinco coleções em cartões verticais, capas principais enquadradas e título sem numeração', () => {
  assert.match(css, /\.library-category \{[^}]*flex-direction: column;/);
  assert.match(css, /\.library-cover \{[^}]*border: 3px solid/);
  assert.match(css, /\.library-cover \.library-photo \{[^}]*object-fit: contain/);
  assert.doesNotMatch(css, /\.library-category\.locked \.library-cover::after/);
  assert.match(js, /libraryImage\(c\.images\[0\]\.file, c\.name\)/);
  assert.match(js, /library-name', c\.name\.toLocaleUpperCase\('pt-BR'\)/);
  assert.match(js, /ESCOLHA UMA CATEGORIA/);
  assert.match(js, /Explore imagens e complete suas coleções/);
});

test('progresso usa 5 marcas acessíveis, sem alterar a regra de desbloqueio', () => {
  assert.match(js, /var dots = libraryEl\('div', 'library-dots'\)/);
  assert.match(js, /c\.images\.forEach\(function \(im\) \{/);
  assert.match(js, /libraryDone\(im\.file\) \? ' is-done'/);
  assert.match(js, /progress\.setAttribute\('aria-label', n \+ ' de ' \+ c\.images\.length/);
  assert.match(css, /\.library-dot\.is-done \{[^}]*#ffcf33/);
  assert.match(js, /if \(c\.order === 1\) return true;/);
  assert.match(js, /if \(c\.price\) return libraryProgress\.purchases\.indexOf\(c\.id\) >= 0;/);
  assert.match(js, /prev\.images\.every\(function \(x\) \{ return libraryDone\(x\.file\); \}\)/);
  assert.match(js, /buyLibraryCategory\(c\)/);
  const lib = require('../library');
  assert.deepEqual(lib.CATEGORIES.map(c => c.price), [0,0,0,25,40]);
});

test('ações amarelas, bloqueios informativos, preço de compra sem mudar saldo', () => {
  assert.match(js, /'DESBLOQUEAR · ' \+ c\.price \+ ' GEMAS'/);
  assert.match(js, /'BLOQUEADA'/);
  assert.match(css, /\.library-category\.available \.library-action \{ background: var\(--sun\);/);
  assert.match(css, /\.library-category\.locked \.library-action:not\(:disabled\) \{ background: var\(--sun\);/);
  assert.match(js, /libraryProgress\.gems < c\.price/);
  assert.match(js, /\/api\/acc\/library\/unlock/);
  assert.doesNotMatch(js.slice(js.indexOf('function renderLibraryHome()'), js.indexOf('function renderLibraryCategory(')), /payMatch|xp_events|INSERT INTO/);
});

test('galeria de cinco imagens em duas colunas e um único Voltar amarelo', () => {
  assert.match(html, /id="library-detail" class="library-detail"/);
  assert.match(html, /id="btn-pick-back" class="btn btn-primary"/);
  assert.doesNotMatch(html, /id="library-back"/);
  assert.match(js, /grid\.classList\.toggle\('library-gallery', libraryView === 'category'\)/);
  assert.match(css, /#screen-pick \.pick-grid\.library-gallery \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /#screen-pick\.library-inside-category #pick-title, #screen-pick\.library-inside-category #pick-lead \{ display: none; \}/);
  assert.match(css, /\.library-heading \{[^}]*text-align: center/);
  assert.match(css, /#screen-pick #btn-pick-back \{[^}]*background: var\(--sun\);/);
  assert.match(css, /\.pick-sheet #btn-pick-go \{[^}]*margin: 0 auto; align-self: center;/);
  assert.match(js, /if \(libraryView !== 'home'\) \{ closePickSheet\(\); renderLibraryHome\(\); return; \}/);
  assert.match(js, /libraryView === 'legacy' \? state\.custom\.concat/);
  assert.match(js, /'★ Concluída'/);
});

test('sem movimentos contínuos, imagens e jogo protegidos, cache v21', () => {
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(css, /html:not\(\[data-motion="reduce"\]\) \.library-celebration-banner/);
  assert.doesNotMatch(css.slice(css.indexOf('/* Galeria de coleções'), css.indexOf('/* Categoria concluída:')), /animation:/);
  assert.match(js, /img\.src = i\.categoryId \? i\.url : \(i\.thumb \|\| i\.url\)/);
  assert.match(js, /var LIBRARY_MEDIA_VERSION = 'capas-20261031'/);
  assert.match(read('public/sw.js'), /const CACHE = 'quebra-cabeca-v21'/);
  assert.match(js, /function localLibraryComplete\(file\)/);
  assert.match(js, /function showGoSplash\(/);
});
