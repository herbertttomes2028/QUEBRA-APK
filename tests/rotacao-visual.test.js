'use strict';
// Verificações independentes de banco: rotação sem bloqueio e geometria visual sem interferir no SNAP.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(ROOT, name), 'utf8');

test('rotação ilimitada em Solo, Cooperativo e Sala Desafio', () => {
  const server = read('server.js');
  const challenge = read('challenge.js');
  const game = read('public/game.js');
  assert.ok(/const MAX_ROT = 1000000000;/.test(server), 'compatibilidade da configuração antiga');
  assert.ok(!/if\s*\(p\.rotUsed\s*>=\s*MAX_ROT\)/.test(server + challenge));
  assert.ok(!/if\s*\(p\.rotUsed\s*>=\s*state\.cfg\.MAX_ROT\)/.test(game));
  assert.ok(/socket\.on\('rotate'/.test(server));
  assert.ok(/socket\.on\('ch:rotate'/.test(challenge));
  assert.ok(/p\.rot = \(p\.rot \+ 1\) % 4/.test(server));
  assert.ok(/p\.rot = \(p\.rot \+ 1\) % 4/.test(challenge));
  assert.ok(/setAngle\(p, \(p\.rot \+ 1\) % 4\)/.test(game));
});

test('distância magnética e condição de orientação preservadas nos dois modos', () => {
  for (const src of [read('server.js'), read('challenge.js')]) {
    assert.match(src, /SNAP: Math\.round\(tile \* 0\.33\)/);
    assert.match(src, /if \(p\.rot !== 0\) return false;/);
    assert.match(src, /if \(Math\.hypot\(p\.x - tx, p\.y - ty\) > cfg\.SNAP\) return false;/);
  }
});

test('peças com encaixes visuais, indicador dentro e guia com cor original', () => {
  const game = read('public/game.js');
  const css = read('public/style.css');
  assert.ok(game.includes('function puzzlePath('));
  assert.ok(game.includes('function pieceArt('));
  assert.ok(game.includes('function boardGuides('));
  assert.ok(game.includes('board.appendChild(boardGuides(cfg))'));
  assert.ok(css.includes('--grid: rgba(27, 37, 89, .22)'));
  assert.ok(css.includes('.puzzle-board-guides path'));
  assert.ok(css.includes('.puzzle-orientation'));
});

test('efeito sonoro do encaixe não foi substituído', () => {
  const game = read('public/game.js');
  assert.match(game, /snap: function \(c\) \{ tone\(c, 523, 0, \.09, 'triangle', \.13\); tone\(c, 784, \.07, \.15, 'triangle', \.13\); \}/);
});
