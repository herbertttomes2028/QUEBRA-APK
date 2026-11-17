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
  assert.match(b, /s = Math\.max\(0\.5, Math\.floor\(\(avail - pad - 2\) \/ \(h - pad\) \* 200\) \/ 200\)/, 'a faixa do alto (perfil) não entra na conta da escala');
  assert.match(b, /code\.addEventListener\('focus', function \(\) \{ typing = true; fit\(\); \}\);/, 'digitando o código, volta a rolar (o campo fica visível acima do teclado)');
  assert.doesNotMatch(b, /requestAnimationFrame|setInterval/, 'nada roda a cada quadro');
  assert.match(game, /home\.style\.overflowY = typing \? '' : 'hidden';/, 'a tela inicial não rola (o estilo vai na tela, não a classe)');
  assert.match(telas, /#screen-home \.home-inner\.home-fit \{ margin-top: 0; transform-origin: 50% 0; transform: translateY\(calc\(var\(--fit-pad, 0px\) \* \(1 - var\(--fit, 1\)\)\)\) scale\(var\(--fit, 1\)\); \}/, 'só transform: não mexe no layout nem nos toques; a faixa do perfil mantém o tamanho');
});

test('o gorro do Natal mora no bloco azul do logotipo e se mexe junto com ele', () => {
  assert.match(natal, /html\[data-natal\] #screen-home \.lg\.a::before \{ content: ""; position: absolute;/);
  assert.doesNotMatch(natal, /\.logo::before/, 'não fica mais parado no logotipo');
});

test('o pet não "treme" ao voltar para o início: o encaixe nunca mexe na classe da tela inicial (que o mascote observa) e não fica liga-desliga', () => {
  const b = game.slice(game.indexOf('(function homeFit() {'), game.indexOf('(function homeKeyboard() {'));
  assert.doesNotMatch(b, /home\.classList/, 'a classe da tela inicial é do mascote: o encaixe não toca nela');
  assert.match(b, /inner\.classList\.add\('home-fit'\)/);
  assert.match(b, /if \(typing \|\| over <= \(on \? -8 : 2\)\) s = 1;/, 'folga: só encaixa se passar 2 px e só desencaixa se sobrarem 8 px');
  assert.match(b, /else if \(over <= 0\) s = curS;/, 'dentro da folga, mantém');
  assert.match(b, /if \(m\.s === curS && \(m\.s === 1 \|\| m\.pad === curPad\)\) return;/, 'nada é escrito se a escala não mudou');
  assert.match(b, /waitT = setTimeout\(function \(\) \{ var n = measure\(\);[^}]*n\.s < curS \|\| n\.s > curS \+ 0\.02/, 'mudanças seguidas viram uma só (200 ms)');
  const mascot = fs.readFileSync(path.join(__dirname, '..', 'public/mascot.js'), 'utf8');
  assert.match(mascot, /new MutationObserver\(function \(\) \{ sync\(\); \}\)\.observe\(home, \{ attributes: true, attributeFilter: \['class'\] \}\)/, 'é por isso: o mascote se ressincroniza a cada mudança na classe da tela inicial');
});
