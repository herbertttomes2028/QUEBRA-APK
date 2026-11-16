'use strict';
// Rodada "ima-e-jogar" (15/11/2026, pedido do proprietário): "Jogar" vai direto para as coleções (Sozinho) e jogar com outra pessoa fica todo
// em "Jogar com amigos" (Cooperativo, Desafio Comum e Quebrando Cabeças). O bate-papo de frases foi retirado do jogo: nada pode convidar a ligá-lo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const game = read('public/game.js');

function fn(name) {
  const a = game.indexOf('  function ' + name + '('), b = game.indexOf('\n  }\n', a) + 4;
  assert.ok(a > 0, name + ' encontrada');
  return game.slice(a, b);
}

test('textos da escolha da imagem e do botão mudam com o modo de "Jogar com amigos"', () => {
  const ctx = { state: { pickMode: 'duel', duelMode: 'coop' }, window: {} };
  vm.runInNewContext(fn('goButtonText') + fn('pickLeadText'), ctx);
  assert.equal(ctx.goButtonText(), 'Criar sala'); assert.match(ctx.pickLeadText(), /montam a mesma imagem juntos/);
  ctx.state.duelMode = 'comum'; assert.equal(ctx.goButtonText(), 'Criar desafio'); assert.match(ctx.pickLeadText(), /Vence quem terminar primeiro/);
  ctx.state.duelMode = 'quebra'; assert.equal(ctx.goButtonText(), 'Criar desafio');
  ctx.state.pickMode = 'solo'; assert.equal(ctx.goButtonText(), 'Jogar'); assert.equal(ctx.pickLeadText(), 'Toque numa imagem para escolher.');
  ctx.state.pickMode = 'change'; assert.equal(ctx.goButtonText(), 'Recomeçar com essa escolha');
});

test('escolher o modo atualiza o texto e o botão; qualquer valor estranho vira Cooperativo', () => {
  assert.match(game, /state\.duelMode = b\.dataset\.mode === 'quebra' \? 'quebra' : b\.dataset\.mode === 'comum' \? 'comum' : 'coop';\n\s+syncDuelModes\(\);\n\s+\$\('#pick-lead'\)\.textContent = pickLeadText\(\);\n\s+\$\('#btn-pick-go'\)\.textContent = goButtonText\(\);/);
  assert.match(game, /\$\('#pick-title'\)\.textContent = mode === 'create' \|\| mode === 'solo' \? 'Escolha a imagem' : mode === 'duel' \? 'Jogar com amigos' :/);
  assert.match(game, /function modeLabel\(m\) \{ return m === 'quebra' \? '🎁 Quebrando Cabeças' : '🧩 Desafio Comum'; \}/);
});

test('o convite (?sala=) e o resto do app não dependem mais do botão "Com um amigo" nem da janela antiga', () => {
  assert.ok(!/#btn-create|#btn-solo|#modal-play/.test(game), 'nenhuma referência ao que foi retirado (quebraria com erro)');
  assert.ok(!/modal-play|btn-solo|btn-create/.test(read('public/style.css') + read('public/mascot.js')));
});

test('bate-papo retirado: o tutorial não fala de conversa e a documentação diz para não ligar', () => {
  assert.ok(!/💬 abre a conversa/.test(game), 'tutorial sem a conversa');
  const readme = read('README.md');
  assert.match(readme, /## Conversa \(frases prontas\): RETIRADA/);
  assert.match(readme, /\*\*retirado do jogo\*\* \(decisão do proprietário\)/);
  assert.ok(!/A conversa só funciona com a variável `CHAT_ENABLED` = `true`/.test(readme), 'nada de instrução para ligar');
  assert.ok(!/CHAT_ENABLED/.test(read('render.yaml')), 'o render.yaml não oferece a variável');
  assert.match(read('server.js'), /RETIRADA DO JOGO por decisão do proprietário: fica desligada/);
  assert.match(read('server.js'), /const CHAT_ENABLED = envOn\(process\.env\.CHAT_ENABLED\);/, 'continua desligado sem a variável');
});
