"use strict";
// Galeria de categorias em formato de quebra-cabeça (opção B): contrato, acessibilidade estática e ausência de sombra.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const js = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');
const home = js.slice(js.indexOf('function renderLibraryHome()'), js.indexOf('function renderLibraryCategory('));
const bloco = css.slice(css.indexOf('/* ---------- Galeria de categorias'), css.indexOf('\n.library-legacy {'));   // até a regra própria do botão "Imagens clássicas"
const blocoSemComentarios = bloco.replace(/\/\*[\s\S]*?\*\//g, '');

function lum(h) { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const contraste = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('cada cor de categoria dá texto branco com contraste >= 4,5:1 (WCAG AA, texto pequeno)', () => {
  const cores = [...js.matchAll(/'(#[0-9a-f]{6})'/gi)].map((m) => m[1]).filter((c, i, a) => a.indexOf(c) === i);
  const paleta = /var LIBRARY_COLORS = \{([^}]*)\}/.exec(js)[1].match(/#[0-9a-f]{6}/gi).concat(/var LIBRARY_FALLBACK = \[([^\]]*)\]/.exec(js)[1].match(/#[0-9a-f]{6}/gi));
  assert.ok(paleta.length >= 10 && cores.length >= paleta.length - 5);
  for (const c of new Set(paleta)) assert.ok(contraste('#ffffff', c) >= 4.5, `${c}: ${contraste('#ffffff', c).toFixed(2)}:1`);
  assert.ok(contraste('#1b2559', '#ffcf33') >= 7, 'seta ▶ azul-marinho sobre o amarelo do app');
});

test('cada categoria é uma peça recortada com a MESMA geometria das peças do jogo, em grade de 2 colunas', () => {
  assert.match(home, /var cols = 2, total = state\.libraryCatalog\.length, cells = total \+ \(total % 2\)/);
  assert.match(js, /p\.setAttribute\('d', puzzlePath\(i % cols, Math\.floor\(i \/ cols\), cols, rows\)\)/);
  assert.match(js, /p\.setAttribute\('transform', 'scale\(0\.0080645\)'\)/, '1/124: o desenho das peças vive numa caixa de 124 unidades');
  assert.match(js, /setAttribute\('clipPathUnits', 'objectBoundingBox'\)/);
  assert.match(home, /libraryClip\(action, idx\)/, 'o botão também é recortado: o toque cai na peça certa, até nos encaixes');
  assert.match(home, /if \(cells > total\) \{/, 'número ímpar: a última peça fica vazia, como convite');
});

test('contrato preservado: regras de liberação, gemas, rótulos, classes de estado e data-category só no botão', () => {
  assert.match(home, /var open = c\.order === 1 \|\| \(libraryProgress\.loaded && libraryAvailable\(c\)\)/);
  for (const cls of ["' available' : ' locked'", "' completed'", "' premium'", "' celebrating'"]) assert.ok(home.includes(cls), cls);
  assert.match(home, /'DESBLOQUEAR · ' \+ c\.price \+ ' GEMAS'/);
  assert.match(home, /'BLOQUEADA'/);
  assert.match(home, /action\.disabled = !open && \(!libraryProgress\.loaded \|\| !premium\)/);
  assert.equal((home.match(/dataset\.category/g) || []).length, 1, 'data-category só no botão (a compra procura o botão para desabilitá-lo)');
  assert.match(home, /libraryImage\(c\.images\[0\]\.file, c\.name\)/);
  assert.match(js, /var cbtn = e\.target\.closest\('\[data-category\]'\);/);
  assert.doesNotMatch(home, /payMatch|xp_events|INSERT INTO|fetch\(/, 'a galeria só desenha: nenhuma regra nova');
});

test('acessibilidade: botão com rótulo completo, decoração escondida, foco visível e movimento respeitado', () => {
  assert.match(home, /action\.setAttribute\('aria-label', open \? 'Abrir ' \+ c\.name \+ ', ' \+ n \+ ' de ' \+ c\.images\.length \+ ' imagens concluídas'/);
  assert.match(home, /'Categoria bloqueada: ' \+ c\.name \+ '\. ' \+ hintFor\(c\)/);
  assert.ok((home.match(/setAttribute\('aria-hidden', 'true'\)/g) || []).length >= 3, 'selos e pista ▶ são decorativos');
  assert.match(bloco, /\.library-action:focus-visible ~ \.library-outline \.library-ring \{ stroke: #fff; stroke-width: 9px; \}/);
  assert.match(bloco, /\.library-action:focus-visible ~ \.library-outline \.library-line \{ stroke: #1b2559;/);
  assert.match(css, /html:not\(\[data-motion="reduce"\]\) \.library-category\.celebrating \.library-line \{ animation: library-gold-line/);
  assert.match(bloco, /\.library-action \{[^}]*inset|\.library-face, \.library-action, \.library-outline \{ position: absolute; inset: -12\.1%/);
});

test('sem sombra e sem filtro na galeria nova (o drop-shadow por peça foi o maior custo de desenho medido)', () => {
  assert.ok(blocoSemComentarios.length > 2500, 'o bloco foi lido por inteiro: ' + blocoSemComentarios.length);
  assert.doesNotMatch(blocoSemComentarios, /box-shadow|drop-shadow|filter\s*:|backdrop-filter|text-shadow/);
  assert.doesNotMatch(css.slice(css.indexOf('@keyframes library-gold-line'), css.indexOf('@keyframes library-gold-line') + 140), /shadow/);
});
