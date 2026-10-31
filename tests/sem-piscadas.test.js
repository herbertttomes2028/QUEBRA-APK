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

test('estatísticas da conta e de amigo atualizadas sem apagar os cartões', () => {
  const js = read('public/conta.js');
  assert.match(js, /function paintStats\(box, rows\)/);
  assert.match(js, /if \(card\.firstChild\.textContent !== value\) card\.firstChild\.textContent = value;/);
  assert.match(js, /if \(card\.lastChild\.textContent !== x\[0\]\) card\.lastChild\.textContent = x\[0\];/);
  assert.match(js, /paintStats\(\$\('#me-stats'\)/);
  assert.match(js, /paintStats\(\$\('#fp-stats'\)/);
  assert.doesNotMatch(js, /\$\('#me-stats'\);[\s\S]{0,40}innerHTML = ''/);
  assert.doesNotMatch(js, /\$\('#fp-stats'\);[\s\S]{0,40}innerHTML = ''/);
});

test('amigos não refazem DOM quando resposta é idêntica e seguem reagindo a mudanças', () => {
  const js = read('public/conta.js');
  assert.match(js, /var changed = !acc\.friends \|\| JSON\.stringify\(acc\.friends\) !== JSON\.stringify\(j\);/);
  assert.match(js, /if \(changed && \$\('#screen-me'\)\.classList\.contains\('active'\) && acc\.view === 'friends'\) renderFriends\(\);/);
  assert.match(js, /if \(t === 'friends'\) renderFriends\(\);/);
  assert.match(js, /if \(acc\.token\) \{ loadMe\(\); loadFriends\(\); \}/);
  assert.match(js, /ev\.t === 'unfriend' \|\| ev\.t === 'presence'/);
});

test('novo cache da interface sem alterar rotas do jogo nem dados', () => {
  assert.match(read('public/sw.js'), /const CACHE = 'quebra-cabeca-v20'/);
  const source = read('public/conta.js');
  assert.match(source, /api\('GET', '\/friends'\)/);
  assert.match(source, /api\('GET', '\/me'\)/);
  assert.doesNotMatch(source, /\/api\/acc\/.*(?:delete|reset)/i);
});
