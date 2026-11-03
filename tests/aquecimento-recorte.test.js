'use strict';
// Abertura da partida sem travada: o recorte/recodificação da imagem é aquecido durante a ESCOLHA, não no giro da imagem.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const game = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');

test('o aquecimento espera 800 ms sem novas escolhas, roda em tempo ocioso e usa o mesmo cache da partida', () => {
  const m = /function warmPick\(\) \{([\s\S]*?)\n  \}\n/.exec(game);
  assert.ok(m, 'warmPick não encontrada');
  const f = m[1];
  assert.match(f, /clearTimeout\(warmPickTimer\)/, 'cada nova escolha reinicia a espera');
  assert.match(f, /\}, 800\);/, 'espera de 800 ms sem novas escolhas');
  assert.match(f, /requestIdleCallback\(run, \{ timeout: 1500 \}\)/, 'só em tempo ocioso (com limite de 1,5 s)');
  assert.match(f, /prepareImage\(item, pr\.cols, pr\.rows\)\.then\(trimPreparedImages\)/, 'mesma função e mesma chave (imagem + grade) que a partida usa; respeita o limite de 4 imagens preparadas');
  assert.match(f, /state\.pickChoice !== file \|\| state\.pickPieces !== pieces/, 'descarta se a escolha mudou enquanto esperava');
  assert.match(f, /classList\.contains\('active'\)/, 'não aquece fora da tela de escolha');
  // a partida usa exatamente a mesma função e a mesma grade
  assert.match(game, /return prepareImage\(imageItem\(snap\.imageId\), snap\.cfg\.COLS, snap\.cfg\.ROWS\);/);
});

test('o aquecimento é disparado ao escolher a imagem e ao trocar o tamanho, e cancelado ao tocar em Jogar', () => {
  assert.equal((game.match(/\n\s+warmPick\(\);/g) || []).length, 2, 'duas chamadas: escolha da imagem e do tamanho');
  assert.match(game, /updateSizeNote\(\);\n    warmPick\(\);\n    \$\('#pick-sheet'\)\.hidden = false;/);
  assert.match(game, /state\.pickPieces = Number\(btn\.dataset\.pieces\);[\s\S]*?updateSizeNote\(\);\n    warmPick\(\);\n  \}\);/);
  assert.match(game, /if \(!state\.pickChoice\) return;\n    clearTimeout\(warmPickTimer\);/);
});

test('a abertura continua usando a miniatura e não recortou nada no próprio giro (o recorte vem do cache)', () => {
  const m = /function showGoSplash\(file\) \{([\s\S]*?)\n  \}\n  function hideGoSplash/.exec(game);
  assert.ok(m);
  assert.ok(!/cropToBlob|toBlob|prepareImage/.test(m[1]), 'showGoSplash não faz trabalho de imagem pesado');
});
