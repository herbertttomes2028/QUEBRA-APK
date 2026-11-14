'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('amigos e estatísticas não usam mais animação de entrada com opacidade zero', () => {
  const css = read('public/style.css');
  assert.match(css, /\.me-stat \{[^}]*background: var\(--card\);/);
  assert.match(css, /\.fr-row \{[^}]*display: flex;/);
  const statRule = css.match(/\.me-stat \{([^}]*)\}/)[1];
  const friendRule = css.match(/\.fr-row \{([^}]*)\}/)[1];
  assert.doesNotMatch(statRule, /animation/);
  assert.doesNotMatch(friendRule, /animation/);
  assert.match(css, /\.me-stat\.c1/);
  assert.match(css, /\.fr-row\.on \.fr-dot/);
});

test('estatísticas da conta atualizadas sem apagar os cartões', () => {
  const js = read('public/conta.js');
  assert.match(js, /function paintStats\(box, rows\)/);
  assert.match(js, /if \(card\.firstChild\.textContent !== value\) card\.firstChild\.textContent = value;/);
  assert.match(js, /if \(card\.lastChild\.textContent !== x\[0\]\) card\.lastChild\.textContent = x\[0\];/);
  assert.match(js, /paintStats\(\$\('#me-stats'\)/);
  assert.doesNotMatch(js, /\$\('#me-stats'\);[\s\S]{0,40}innerHTML = ''/);
});

test('sem lista de amigos: o cliente não pede nem desenha amigos, convites ou presença', () => {
  const js = read('public/conta.js');
  assert.doesNotMatch(js, /\/friends|renderFriends|loadFriends|acc\.friends|'presence'|'unfriend'|'inv-up'/);
  assert.match(js, /if \(acc\.token && !meFresh\(\)\) loadMe\(\);/);       // o /me só se mudou ou passou do prazo
});

test('novo cache da interface sem alterar rotas do jogo nem dados', () => {
  assert.match(read('public/sw.js'), /const CACHE = 'quebra-cabeca-v21'/);
  const source = read('public/conta.js');
  assert.doesNotMatch(source, /api\('GET', '\/friends'\)/, 'não há mais pedido de amigos');
  assert.match(source, /api\('GET', '\/me\?lite=1'\)/);
  assert.match(source, /api\('GET', '\/achievements'\)/);
  assert.doesNotMatch(source, /api\('GET', '\/me'\)/, 'o /me completo (pesado) não é mais pedido pelo aplicativo novo');
  assert.doesNotMatch(source, /\/api\/acc\/.*(?:delete|reset)/i);
});
