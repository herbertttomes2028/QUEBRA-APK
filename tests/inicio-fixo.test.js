'use strict';
// Correção de 16/11/2026 (pedido do proprietário): com letra A+ e A++ a tela inicial rolava para cima e para baixo; ela deve ficar FIXA,
// como na letra normal. E o gorro do Natal deve se mexer junto com o símbolo do jogo (os blocos do logotipo voam e se encaixam).
// Varredura no navegador (fora do repositório, fixa.js): 432 combinações (320–430 × 568–915, A/A+/A++, visitante e perfil, Natal sim/não):
// 0 rolando, 0 sobreposições do perfil, o último bloco sempre acima da barra de abas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const game = read('public/game.js'), telas = read('public/telas.css'), natal = read('public/tema-natal.css');

test('tela inicial fixa: o conteúdo que passa da altura é encolhido por inteiro (sem rolar), recalculado só quando o tamanho muda', () => {
  const b = game.slice(game.indexOf('(function homeFit() {'), game.indexOf('(function homeKeyboard() {')); assert.ok(b.length > 200);
  assert.match(b, /new ResizeObserver\(fit\); ro\.observe\(home\); ro\.observe\(inner\);/);
  assert.match(b, /s = h <= avail \? 1 : Math\.max\(0\.5, \(avail - pad - 2\) \/ \(h - pad\)\)/, 'a faixa do alto (perfil) não entra na conta da escala');
  assert.match(b, /code\.addEventListener\('focus', function \(\) \{ typing = true; fit\(\); \}\);/, 'digitando o código, volta a rolar (o campo fica visível acima do teclado)');
  assert.doesNotMatch(b, /requestAnimationFrame|setInterval/, 'nada roda a cada quadro');
  assert.match(telas, /#screen-home\.home-fit \{ overflow: hidden; \}/);
  assert.match(telas, /#screen-home\.home-fit \.home-inner \{ margin-top: 0; transform-origin: 50% 0; transform: translateY\(calc\(var\(--fit-pad, 0px\) \* \(1 - var\(--fit, 1\)\)\)\) scale\(var\(--fit, 1\)\); \}/, 'só transform: não mexe no layout nem nos toques; a faixa do perfil mantém o tamanho');
});

test('o gorro do Natal mora no bloco azul do logotipo e se mexe junto com ele', () => {
  assert.match(natal, /html\[data-natal\] #screen-home \.lg\.a::before \{ content: ""; position: absolute;/);
  assert.doesNotMatch(natal, /\.logo::before/, 'não fica mais parado no logotipo');
});
