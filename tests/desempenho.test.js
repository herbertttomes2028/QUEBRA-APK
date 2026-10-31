'use strict';
// Regressões da otimização: nenhuma regra do jogo, geometria SVG ou efeito foi alterado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const game = read('public/game.js'), css = read('public/style.css');
function functionText(name) {
  const start = game.indexOf('  function ' + name + '(');
  assert.ok(start > -1, name + ' presente');
  const end = game.indexOf('\n  function ', start + 5);
  assert.ok(end > start, name + ' delimitado');
  return game.slice(start, end);
}
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

test('geometria de encaixes, setas e grade SVG preservadas; sombra otimizada', () => {
  const hashes = {
    pieceEdges: '54975e8c496e83fa8cbcb9966524a08fea40c4c8aa467f0c7b41533ad13ea630',
    puzzlePath: 'c7f9820d6b27c581bf504099e6616efa3c43ce60a413f10fd3620b41f9de7f39',
    pieceArt: '140dfa5d13fde80554e94344bd68b1bb573c513959b3efaaad17f57a5b7cb272',
    boardGuides: '4c8659d7a2b5db156a22ecec53a0fcf2bfe052d8a51568b16ea5acb5c2717c62'
  };
  for (const [name, digest] of Object.entries(hashes)) assert.equal(sha(functionText(name)), digest, name);
  assert.doesNotMatch(css.match(/\.puzzle-piece-svg \{[^}]*\}/)[0], /filter:/);
  assert.match(css, /\.puzzle-piece-shadow \{[^}]*filter: drop-shadow\(/);
  assert.match(css, /\.puzzle-board-guides path \{[^}]*stroke: var\(--grid\)/);
  assert.match(css, /\.puzzle-orientation \{ fill: #fff; stroke: var\(--ink\)/);
});

test('camada gráfica dinâmica apenas em peça selecionada, sem modificar formatos', () => {
  const pieceCss = css.match(/\.piece \{[^}]+\}/);
  assert.ok(pieceCss);
  assert.doesNotMatch(pieceCss[0], /will-change:\s*transform/);
  assert.match(css, /\.piece\.mine, \.piece\.theirs \{ will-change: transform; \}/);
});

test('quadros de animação desaceleram em repouso e voltam na interação', () => {
  assert.doesNotMatch(game, /requestAnimationFrame\(frame\)/);
  assert.match(game, /if \(animating\) wakeFrame\(\)/);
  assert.match(game, /frameTimer = setTimeout\(function \(\) \{ frameTimer = 0; wakeFrame\(\); \}, 250\)/);
  assert.match(game, /if \(document\.hidden\) return;/);
  assert.match(game, /p\.dirty = true;\s*wakeFrame\(\)/);
  assert.match(game, /socket\.on\('moved'[\s\S]*?p\.lastMove = performance\.now\(\);\s*wakeFrame\(\)/);
});

test('imagem recortada ativa é protegida de exclusão do cache, limitado a 4', () => {
  assert.match(game, /while \(preparedKeys\.length > 4\)/);
  assert.match(game, /key !== currentPreparedKey/);
  assert.match(game, /url !== state\.imageUrl/);
  assert.match(game, /ownedImageUrls\.delete\(url\);\s*URL\.revokeObjectURL\(url\)/);
  assert.match(game, /var W = 720;/);
  assert.match(game, /'image\/jpeg', 0\.9/);
});

test('conclusão Solo, Cooperativo e Desafio remove confetes e desfoque pesados, mantém o som', () => {
  assert.doesNotMatch(game, /for \(var i = 0; i < 44; i\+\+\)/);
  assert.doesNotMatch(css, /animation: win-reveal|@keyframes fall|filter: blur\(/);
  assert.match(game, /showVictoryResult\('#modal-win', '#win-again', true/);
  assert.match(game, /showVictoryResult\('#modal-duel', '#duel-rematch', ownComplete/);
  assert.match(game, /playSound\('win'\)/);
  assert.match(game, /playSound\(won \? 'win' : 'chime'\)/);
});

test('o servidor mantém magnetismo e canais de comunicação', () => {
  for (const file of ['server.js', 'challenge.js']) {
    const s = read(file);
    assert.match(s, /SNAP: Math\.round\(tile \* 0\.33\)/);
    assert.match(s, /if \(p\.rot !== 0\) return false;/);
    assert.match(s, /if \(Math\.hypot\(p\.x - tx, p\.y - ty\) > cfg\.SNAP\) return false;/);
  }
});

test('filtro da sombra não envolve mais a imagem SVG giratória', () => {
  const art = functionText('pieceArt');
  const shadow = art.indexOf("class: 'puzzle-piece-shadow'");
  const photo = art.indexOf("var im = shapeNode('image'");
  const contour = art.indexOf("class: 'puzzle-piece-outline'");
  assert.ok(shadow > 0 && shadow < photo && photo < contour,
    'sombra isolada atrás da imagem, sem modificar o recorte, contorno e seta');
  assert.match(art, /var path = puzzlePath\(col, row, cfg\.COLS, cfg\.ROWS\)/);
  assert.match(art, /'clip-path': 'url\(#' \+ clipId \+ '\)'/);
  assert.match(css, /\.piece\.mine \.tile\.puzzle-shaped-tile, \.piece\.theirs \.tile\.puzzle-shaped-tile \{ will-change: transform; \}/);
  assert.match(css, /\.puzzle-piece-shadow \{ fill: #fff; filter: drop-shadow\(0 calc\(var\(--tile\) \* \.04\)/);
});

test('abertura mantém giro e texto, mas usa miniatura leve quando disponível', () => {
  assert.match(game, /\(item\.thumb \|\| item\.url\)/);
  assert.match(game, /preview = item && \(item\.thumb \|\| item\.url\)/);
  assert.match(game, /go\.frame = requestAnimationFrame/);
  assert.doesNotMatch(game.slice(game.indexOf('  function showGoSplash('), game.indexOf('  function hideGoSplash(')), /void\s+el\.offsetWidth/, 'a abertura nao pode medir layout sincronamente');
  assert.match(css, /rotateY\(-360deg\) scale\(\.97\)/);
  assert.match(css, /rotateY\(0deg\) scale\(1\)/);
  assert.doesNotMatch(css, /rotate\(-360deg\)/, 'a imagem não pode girar no plano da tela');
  assert.match(css, /\.go-card\s*\{[^}]*backface-visibility: visible;/,
    'a carta não deve desaparecer durante meia-volta no eixo vertical');
  assert.match(css, /go-spin 2\.4s/);
  assert.match(css, /go-text-in 1\.3s[^;]*\.75s both/);
  assert.match(css, /translate3d\(0, 18px, 0\) rotate\(-3deg\) scale\(\.96\)/);
  assert.doesNotMatch(css, /rotateY\(-900deg\)|go-pulse.*infinite|go-slam \.5s|scale\(2\.6\)/);
  assert.match(game, /go\.min = reducedMotion\(\) \? 1100 : 2650/);
  assert.match(css, /html:not\(\[data-motion=\"reduce\"\]\) \.go-splash\.run:not\(\.out\) \.go-card \{ will-change: transform; \}/);
  assert.match(game, /playSound\('tann'\)/);
});
