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

test('formas das peças e grade SVG byte a byte preservadas', () => {
  const hashes = {
    pieceEdges: '54975e8c496e83fa8cbcb9966524a08fea40c4c8aa467f0c7b41533ad13ea630',
    puzzlePath: 'c7f9820d6b27c581bf504099e6616efa3c43ce60a413f10fd3620b41f9de7f39',
    pieceArt: '2852d8624604d4bc3b97697662ae3d7b9802f74c9459f130cc53f1f84082514e',
    boardGuides: '4c8659d7a2b5db156a22ecec53a0fcf2bfe052d8a51568b16ea5acb5c2717c62'
  };
  for (const [name, digest] of Object.entries(hashes)) assert.equal(sha(functionText(name)), digest, name);
  assert.match(css, /\.puzzle-piece-svg \{[^}]*filter: drop-shadow\(/);
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

test('resultado Solo/Cooperativo e Desafio mantém confetes e animações', () => {
  assert.equal((game.match(/for \(var i = 0; i < 44; i\+\+\)/g) || []).length, 2);
  assert.equal((game.match(/document\.createDocumentFragment\(\)/g) || []).length, 2);
  assert.match(css, /animation: win-reveal \.9s ease-out both/);
  assert.match(css, /@keyframes fall/);
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
