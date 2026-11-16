'use strict';
// Rodada loja-suave (16/11/2026): a loja travava ao abrir (medido com a CPU a 1/6, com o tema de Natal ligado).
// Causas encontradas e travadas aqui: a neve do Natal animando ATRÁS da janela; a loja remontada no toque de abrir (dados novos chegando
// com a loja fechada, catálogo do visitante relido a cada abertura); a resposta do servidor redesenhando a lista no meio da subida;
// e a subida da janela começando junto com o quadro pesado.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('public/loja.js'), css = read('public/loja.css');

test('nada se mexe atrás da loja aberta: a neve do Natal para, marcada SÓ no elemento da neve (nunca uma classe no <html>)', () => {
  assert.match(js, /new MutationObserver\(function \(\) \{ var nv = document\.querySelector\('\.natal-neve'\); if \(nv\) nv\.classList\.toggle\('loja-pausa', !m\.hidden\); \}\)\.observe\(m, \{ attributes: true, attributeFilter: \['hidden'\] \}\)/);
  assert.match(css, /\.natal-neve\.loja-pausa \{ display: none; \}/);
  assert.doesNotMatch(js, /documentElement\.classList\.(add|toggle|remove)\('loja/, 'classe no <html> recalcula o estilo da página toda');
});

test('abrir é só mostrar: a loja é montada escondida (com o catálogo do servidor) e remontada no tempo ocioso quando os dados mudam', () => {
  assert.match(js, /loadCatalog\(\)\.then\(function \(\) \{ if \(ui\.open\) return; render\(\); ui\.pvs\.forEach\(function \(w\) \{ w\._build\(\); \}\); \}\);/, 'prewarm espera o catálogo');
  assert.match(js, /function renderIfOpen\(\) \{ if \(ui\.open\) \{ if \(sig\(\) !== ui\.sig\) render\(\); \} else if \(sig\(\) !== ui\.sig\) warmLater\(\); \}/, 'loja fechada: não zera a assinatura (isso remontava tudo no toque)');
  assert.match(js, /function warmLater\(\) \{[\s\S]{0,120}requestIdleCallback/);
  assert.match(js, /S\.catAt && Date\.now\(\) - S\.catAt < 600000/, 'visitante: catálogo relido no máximo a cada 10 min');
  assert.match(js, /ui\.refT = setTimeout\(function \(\) \{ if \(ui\.open\) refresh\(\); \}, 450\);/, 'a consulta ao servidor espera a janela terminar de subir');
  assert.match(js, /else if \(ui\.tab === 'minhas'\) setScale\(\$\('#shop-body'\)\);/, 'sem leitura de largura à toa na abertura');
});

test('a janela sobe depois do primeiro quadro pesado, como camada própria; parada com menos movimento', () => {
  assert.match(css, /#modal-shop \.shop-sheet \{ animation: sheet-in \.24s ease-out \.07s both; will-change: transform; \}/);
  assert.match(css, /html\[data-motion="reduce"\] #modal-shop \.shop-sheet \{ animation: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ #modal-shop \.shop-sheet \{ animation: none; \} \}/);
});
