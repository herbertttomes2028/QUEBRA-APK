'use strict';
// Rodada loja-bonita (16/11/2026): a loja foi reorganizada e embelezada SEM itens, moedas ou regras novas.
// Este teste trava o que a rodada prometeu: uma fileira de seções com ícone, o mesmo cartão em todas, 4 estados claros no botão,
// preço uma vez só, textos sem bronca e com português certo, saldo em destaque, toque ≥ 44 px, animações leves e desligáveis.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('public/loja.js'), css = read('public/loja.css'), html = read('public/index.html'), shop = require('../shop');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('nada de novo no que se vende (só a roupa grátis de Papai Noel, rodada tema-natal): os mesmos 26 itens, os mesmos preços e as mesmas categorias (só os textos das descrições ficaram curtos)', () => {
  const ITENS = { classica: 0, nuvem: 150, estrela: 250, gelatina: 350, galaxia: 500, 'skin-menta': 0, 'skin-por-do-sol': 0, 'skin-uva': 0, 'skin-algodao-doce': 0, 'skin-luar': 0, 'skin-limao': 100, 'skin-caramelo': 100, 'skin-lavanda': 180, 'skin-cereja': 320, 'skin-ouro': 500, 'roupa-capa-heroi': 0, 'roupa-cachecol': 0, 'roupa-mago': 0, 'roupa-bailarina': 0, 'roupa-macacao': 0, 'roupa-papai-noel': 0, 'roupa-bandana': 150, 'roupa-fones': 250, 'roupa-cartola': 350, 'roupa-asas-anjo': 450, 'roupa-coroa': 600 };
  assert.deepEqual(Object.fromEntries(shop.ITEMS.map((i) => [i.id, i.price])), ITENS);
  assert.deepEqual(shop.catalog().categories.map((c) => c.id), ['bandejas', 'skins', 'roupas']);
  for (const i of shop.ITEMS) { assert.ok(i.desc.length >= 10 && i.desc.length <= 40, 'descrição curta (cabe em 2 linhas do cartão): ' + i.id + ' = ' + i.desc.length); assert.match(i.desc, /^[A-ZÁÉÍÓÚÂÊÔÃÕ][^\n]*[.!]$/, 'frase com maiúscula e ponto: ' + i.id); }
  assert.doesNotMatch(js, /gems\s*[-+]=|S\.gems\s*=\s*S\.gems\s*-/, 'o cliente nunca calcula o saldo: ele vem do servidor');
});

test('uma fileira de seções com ícone e cor (Bandejas, Skins, Roupas, Meus itens), fora da área que rola', () => {
  assert.match(html, /<div id="shop-nav" class="shop-nav" role="tablist" aria-label="Seções da loja"><\/div>\s*<div id="shop-body" class="shop-body" role="tabpanel"/);
  assert.deepEqual([...js.matchAll(/\{ id: '(\w+)', ico: '([^']+)', name: '([^']+)', intro: '([^']+)' \}/g)].map((m) => m[1]), ['bandejas', 'skins', 'roupas', 'meus']);
  for (const m of js.matchAll(/intro: '([^']+)'/g)) assert.ok(m[1].length <= 48, 'introdução de uma linha: ' + m[1]);
  assert.match(js, /b\.setAttribute\('role', 'tab'\); b\.setAttribute\('aria-selected', on \? 'true' : 'false'\); b\.setAttribute\('aria-controls', 'shop-body'\)/);
  assert.match(js, /function goSec\(id\) \{ if \(id === 'meus'\) ui\.tab = 'minhas'; else \{ ui\.tab = 'loja'; ui\.cat = id; \} ui\.top = true; render\(\); \}/, 'trocar de seção volta a lista ao topo');
  assert.match(js, /function openShop\(tab, cat\)/, 'a janela "Meu pet" continua abrindo a loja na seção certa');
  assert.match(css, /\.shop-nav \{ display: grid; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  for (const s of ['skins', 'roupas', 'meus']) assert.match(css, new RegExp('\\.shop-sec\\.s-' + s + ' \\{ --c: #[0-9a-f]{6}; --ci: #[0-9a-f]{6};'), 'cor própria: ' + s);
  assert.match(css, /html\[data-text="xlarge"\] \.shop-nav \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/, 'letra grande em tela estreita: 2 × 2, nada cortado');
  assert.doesNotMatch(html, /class="shop-tab|Minhas Bandejas/, 'as abas antigas saíram');
});

test('o mesmo cartão em todas as seções: vitrine com etiquetas, nome, descrição e UM botão com 4 estados', () => {
  assert.match(js, /function stateOf\(it, usable, using\) \{ return using \? 'on' : usable \? 'own' : !S\.logged \? 'guest' : missing\(it\) > 0 \? 'lock' : 'buy'; \}/);
  assert.match(js, /btn\('Comprar', 'btn-primary shop-go'/); assert.match(js, /btn\('🔒 Faltam ' \+ m, 'btn-secondary shop-lock'/); assert.match(js, /btn\('Equipar', 'btn-primary shop-use'/);
  assert.match(js, /chip\('tag-on', '✓ Equipado'\) : st === 'own' \? chip\('tag-own', it\.price \? 'Já é seu' : 'Grátis'\) : chip\('tag-price', '💎 ' \+ it\.price\)/, 'o preço aparece UMA vez, na etiqueta da foto');
  assert.doesNotMatch(js, /Adquirid|'Sua ✓'|'Em uso'|shop-miss|shop-badge/, 'nomes de estado antigos e a linha vermelha de "Faltam" saíram');
  assert.equal((js.match(/function card\(it\)[\s\S]*?\n  \}/)[0].match(/action\(/g) || []).length, 1, 'um botão por cartão de bandeja');
  assert.equal((js.match(/function petCard\(it\)[\s\S]*?\n  \}/)[0].match(/action\(/g) || []).length, 1, 'um botão por cartão do pet');
  assert.match(css, /\.shop-list \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 12px; \}/, 'mesma grade nas três seções');
  assert.match(css, /\.shop-card \.shop-acts \{ margin-top: auto;/, 'o botão fica no rodapé: os cartões da mesma linha se alinham');
  assert.match(css, /\.shop-vit \{[^}]*aspect-ratio: 4 \/ 3;/, 'a vitrine tem o mesmo tamanho em todos os cartões');
  assert.match(css, /\.shop-card \{[^}]*border-radius: 22px;[^}]*box-shadow: 0 0 0 2px var\(--line\), 0 6px 14px/, 'cantos arredondados e sombra suave');
  assert.match(css, /\.shop-card \.shop-acts \.btn \{[^}]*white-space: normal;/, 'texto do botão quebra a linha em vez de ser cortado (A++ e telas de 320 px)');
});

test('textos: português certo (sempre "a skin", "a roupa", "a Bandeja"), sem bronca e com verbo de ação', () => {
  assert.match(js, /function nomeCom\(it\) \{ return \(it\.cat === 'skins' \? 'a skin ' : it\.cat === 'roupas' \? 'a roupa ' : 'a '\) \+ it\.name; \}/);
  assert.match(js, /'Faltam ' \+ m \+ ' gema' \+ \(m === 1 \? '' : 's'\) \+ ' para ' \+ nomeCom\(it\) \+ '\. Cada quebra-cabeça montado rende mais!/);
  assert.match(js, /QC\.toast\('🎉 ' \+ cap\(nomeCom\(it\)\) \+ ' é sua! '/, 'sucesso: "A skin Cereja é sua!" (antes: "Caramelo desbloqueada")');
  assert.doesNotMatch(js, /desbloquead[ao]!|it\.name\.toLowerCase\(\)/, 'nada de "Fones de ouvido desbloqueada" nem "bandeja galáxia"');
  assert.match(js, /'Não deu para comprar agora\. Nada foi cobrado\.'/); assert.match(js, /'Sem internet agora\. Nada foi cobrado; tente de novo\.'/);
  assert.doesNotMatch(css, /#b3261e|#ff9a93/, 'sem vermelho de erro nos cartões');
  assert.doesNotMatch(js, /'[^'\n]*(BANDEJAS|SKINS|ROUPAS)[^'\n]*'/, 'sem caixa alta gritando nos textos');
});

test('comprar: confirma com nome, preço e saldo; o item comprado já fica em uso (o mesmo pedido de "Equipar") e o cartão brilha', () => {
  assert.match(js, /QC\.confirm\(\{ title: 'Comprar ' \+ it\.name \+ '\?', text: 'Esta ' \+ what \+ ' custa ' \+ it\.price \+ ' gemas e fica sua para sempre\. Você tem ' \+ S\.gems \+ ' e vão sobrar ' \+ \(S\.gems - it\.price\) \+ '\.'/);
  assert.match(js, /if \(it\.cat\) petPick\(it\.cat === 'skins' \? 'skin' : 'outfit', it\.look\); else equip\(it\.id, true\);/);
  assert.match(js, /queue = queue\.then\(refresh, refresh\);/, 'confere com o servidor DEPOIS de equipar');
  assert.match(js, /if \(missing\(it\) > 0\) \{ lockedTap\(it\); return; \}/, 'sem gemas suficientes nem abre a confirmação');
  assert.match(css, /\.shop-card\.just \{ animation: shopPop/); assert.match(css, /\.shop-card\.just::after \{[^}]*animation: shopShine/);
  assert.match(css, /html\[data-motion="reduce"\] \.shop-card\.just, html\[data-motion="reduce"\] \.shop-wallet \{ animation: none !important; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.shop-card\.just, \.shop-wallet \{ animation: none !important; \}/);
  assert.doesNotMatch(semComentarios(js), /offsetWidth|offsetHeight|getBoundingClientRect\(\)\./, 'o brilho reinicia sem forçar layout');
});

test('saldo em destaque no topo; visitante vê "Sem conta" (nunca um número inventado)', () => {
  assert.match(html, /<div id="shop-wallet" class="shop-wallet" role="status" aria-live="polite"><span class="shop-wallet-gem" aria-hidden="true">💎<\/span><b id="shop-gems" class="shop-gems"><\/b><small id="shop-gems-lbl">gemas<\/small><\/div>/);
  assert.match(js, /g\.textContent = S\.logged \? \(known \? String\(S\.gems\) : '…'\) : ''; g\.hidden = !S\.logged;/);
  assert.match(js, /lb\.textContent = S\.logged \? \(S\.gems === 1 \? 'gema' : 'gemas'\) : 'Sem conta';/);
  assert.match(css, /\.shop-wallet \{[^}]*min-height: 44px;/);
  assert.match(css, /grid-template-areas: "t x" "w w";/, 'letra grande: o saldo desce para uma linha própria, o título nunca some');
});

test('toque ≥ 44 px e nada cortado: seções, vitrines, botões, cores e a chave das animações', () => {
  const minH = (sel) => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{[^}]*min-height: (\\d+px|var\\(--btn-[gmp]\\))')); assert.ok(m, sel); return ({ 'var(--btn-g)': 64, 'var(--btn-m)': 52, 'var(--btn-p)': 44 })[m[1]] || parseInt(m[1], 10); };   // aceita a régua do padrão visual
  assert.ok(minH('.shop-sec') >= 44); assert.ok(minH('.shop-card .shop-acts .btn') >= 44); assert.ok(minH('.mine-item') >= 44); assert.ok(minH('.shop-x') >= 44);
  assert.match(css, /\.mine-editor \.switch \{ width: 60px; height: 44px;/, 'a chave das animações tinha 32 px de altura');
  assert.match(css, /\.swatches \{ display: grid; grid-template-columns: repeat\(auto-fill, minmax\(48px, 1fr\)\);/, 'a paleta vazava em telas de 320 px');
  assert.match(css, /@keyframes walletA[\s\S]*@keyframes walletB/, 'o pulinho do saldo usa A/B (reinicia sem forçar layout)');
});

test('Meus itens: o pet primeiro (com estado vazio amigável) e as bandejas com a cor grátis', () => {
  assert.match(js, /sub\(body, '🐾 Do seu pet'\);[\s\S]*sub\(body, '🧺 Suas bandejas'\);/);
  assert.match(js, /el\('div', 'shop-empty'\)/); assert.match(js, /'Seu pet ainda está com o visual de fábrica\. Que tal escolher uma skin\? Várias são grátis!'/);
  assert.match(js, /btn\('🎨 Ver skins', 'btn-primary', function \(\) \{ goSec\('skins'\); \}\)/);
  assert.match(js, /\['🎨 Mudar a cor', function \(\) \{ ui\.mine = it\.id; goSec\('meus'\); \}/, 'bandeja equipada: o botão leva direto à cor');
});
