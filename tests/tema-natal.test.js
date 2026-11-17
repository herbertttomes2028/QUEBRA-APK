'use strict';
// Rodada tema-natal (16/11/2026): o tema de Natal é uma camada SÓ VISUAL e temporária, com UMA chave (MODO em public/tema-natal.js).
// Trava: a regra das datas, que desligado nada muda, que nenhum enfeite recebe toque ou toca na partida, que a neve some com menos movimento,
// que as animações são leves (transform/opacity) e que a roupa de Papai Noel é grátis.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('public/tema-natal.js'), css = read('public/tema-natal.css'), html = read('public/index.html'), sw = read('public/sw.js');
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function carrega(search, agora) {
  const attrs = {}, R = Date, D = function (...a) { return a.length ? new R(...a) : new R(agora); }; D.now = () => new R(agora).getTime();
  const ctx = { window: { location: { search } }, document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; } }, readyState: 'loading', addEventListener() {} }, URLSearchParams, Date: agora ? D : Date };
  // a regra das datas é testada com a chave em 'auto', qualquer que seja o valor escolhido no arquivo (o proprietário liga e desliga sem mexer nos testes)
  vm.runInNewContext(js.replace(/var MODO = '[a-z]+';/, "var MODO = 'auto';"), ctx); return { N: ctx.window.QCNatal, attrs };
}

test('a chave única: MODO (auto, ligado ou desligado); em auto liga de 1º/12 a 6/01 pela data do aparelho; ?natal=1 e ?natal=0 só para conferir', () => {
  assert.match(js, /\n  var MODO = '(auto|ligado|desligado)';\n/, 'a chave tem um dos 3 valores');
  assert.equal((js.match(/var MODO = /g) || []).length, 1, 'uma chave só');
  const { N } = carrega('', '2026-11-16T12:00:00');
  const ep = (y, m, d) => N.epoca(new Date(y, m - 1, d, 12));
  assert.deepEqual([ep(2026, 11, 30), ep(2026, 12, 1), ep(2026, 12, 25), ep(2026, 12, 31), ep(2027, 1, 1), ep(2027, 1, 6), ep(2027, 1, 7), ep(2027, 6, 15)], [false, true, true, true, true, true, false, false]);
  const nov = new Date(2026, 10, 16), dez = new Date(2026, 11, 10);
  assert.equal(N.ligado('auto', nov, null), false); assert.equal(N.ligado('auto', dez, null), true);
  assert.equal(N.ligado('ligado', nov, null), true); assert.equal(N.ligado('desligado', dez, null), false);
  assert.equal(N.ligado('desligado', nov, '1'), true, '?natal=1 liga para conferir'); assert.equal(N.ligado('ligado', dez, '0'), false, '?natal=0 desliga');
  assert.equal(N.ligado('auto', dez, 'qualquer'), true, 'valor estranho no endereço é ignorado');
});

test('desligado não muda nada: sem atributo no <html>; ligado só põe data-natal (todo o CSS depende dele)', () => {
  let r = carrega('', '2026-11-16T12:00:00'); assert.equal(r.N.ativo, false); assert.deepEqual(r.attrs, {});
  r = carrega('', '2026-12-24T12:00:00'); assert.equal(r.N.ativo, true); assert.deepEqual(r.attrs, { 'data-natal': '', 'data-natal-tela': 'home' });
  r = carrega('?natal=1', '2026-11-16T12:00:00'); assert.equal(r.N.ativo, true);
  const regras = semComentarios(css).replace(/@keyframes[^{]+\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '').replace(/@media[^{]+\{/g, '').match(/[^{}]+(?=\{)/g).map((s) => s.trim()).filter(Boolean);
  assert.ok(regras.length >= 15, 'regras: ' + regras.length);
  for (const r2 of regras) for (const sel of r2.split(/,(?![^(]*\))/)) assert.match(sel.trim(), /^html\[data-natal\]/, 'toda regra depende da chave: ' + sel.trim());
  for (const m of html.matchAll(/<[^>]+data-natal-msg[^>]*>/g)) assert.match(m[0], /\shidden>/, 'a saudação nasce escondida: ' + m[0]);
});

test('nunca toca na partida: nada de peças, tabuleiro, encaixe ou tela de montagem; luzinhas escondidas na partida; enfeites sem toque', () => {
  const c = semComentarios(css);
  assert.doesNotMatch(c, /#board|#field|\.piece|\.tile|\.tray-|#screen-game|\.locked|\.puzzle/, 'o CSS do Natal não estiliza nada da partida');
  assert.match(c, /html\[data-natal\]\[data-natal-tela="game"\] \.natal-luzes \{ display: none; \}/);
  for (const sel of ['.natal-luzes', '.natal-neve', '#screen-home .lg.a::before', '#btn-play::before']) assert.match(c, new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^{]*\\{[^}]*pointer-events: none;'), 'sem toque: ' + sel);
  assert.doesNotMatch(c, /pointer-events: (auto|all)/);
  assert.doesNotMatch(semComentarios(js), /innerHTML|insertAdjacentHTML|fetch\(|XMLHttpRequest|localStorage|sessionStorage|socket|emit\(|QC\.state|gems|price|\beval\(|new Function/, 'o tema não lê nem grava nada do jogo');
  assert.match(js, /setAttribute\('aria-hidden', 'true'\)/, 'enfeites escondidos dos leitores de tela');
});

test('leve: só transform/opacity, neve com fim (cai ~32 s ao abrir a inicial), luzinhas paradas, sem neve com menos movimento', () => {
  const blocos = css.match(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})+\s*\}/g) || []; assert.ok(blocos.length >= 1);
  for (const b of blocos) for (const m of b.matchAll(/\{([^{}]*)\}/g)) for (const d of m[1].split(';').map((x) => x.trim()).filter(Boolean)) assert.match(d, /^(transform|opacity)\s*:/, 'só transform/opacity: ' + d);
  assert.equal((semComentarios(css).match(/animation:/g) || []).length, 1, 'uma única animação no tema todo (a neve)');
  assert.match(css, /animation: natalNeve 16s linear 2 both;/, 'a neve para sozinha depois de 2 voltas');
  assert.match(css, /html\[data-natal\]\[data-motion="reduce"\] \.natal-neve \{ display: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*html\[data-natal\] \.natal-neve \{ display: none; \}/);
  assert.equal((js.match(/createElement\('i'\)/g) || []).length, 1, 'uma camada de neve');
  assert.doesNotMatch(css, /url\((?!"data:image\/svg\+xml)/, 'imagens só em SVG embutido (nada externo, nada pesado)');
  assert.ok(Buffer.byteLength(css) < 12000 && Buffer.byteLength(js) < 5000, 'arquivos pequenos');
  assert.doesNotMatch(semComentarios(js), /requestAnimationFrame|setInterval|setTimeout/, 'nenhum laço em JavaScript');
});

test('montagem: o tema carrega cedo (sem piscar), fica no app instalado e não muda a ordem dos estilos finais', () => {
  assert.match(html, /<script src="boot\.js"><\/script>\n  <script src="tema-natal\.js"><\/script>/);
  const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(links.slice(-3), ['fundos.css', 'telas.css', 'suave.css']); assert.ok(links.indexOf('tema-natal.css') > links.indexOf('loja.css'));
  assert.match(sw, /'\/tema-natal\.js', '\/tema-natal\.css'/); assert.match(sw, /const CACHE = 'quebra-cabeca-v21';/);
});

test('saudações: curtas, em português, sem campo de texto (não existe bate-papo); na tela inicial, na sala do Desafio, na vitória e na loja (a faixa da espera do cooperativo ficou de fora: mudaria a altura do tabuleiro)', () => {
  const msgs = [...html.matchAll(/<(p|span)[^>]*data-natal-msg[^>]*>([^<]+)</g)].map((m) => m[2]);
  assert.deepEqual(msgs, ['🎄 Feliz Natal! Bora montar juntos?', '🎄 Boas festas! Quem monta mais rápido?', '🎁 Que presente de partida!', '🎅 Boas festas! A roupa de Papai Noel é grátis em Roupas.']);
  for (const m of msgs) assert.ok(m.length <= 60, m);
  assert.doesNotMatch(html.match(/<[^>]+data-natal-msg[^>]*>/g).join(''), /<(input|textarea|button|a)\b/);
  const espera = html.slice(html.indexOf('<div id="banner-wait"'), html.indexOf('</div>', html.indexOf('<div id="banner-wait"'))); assert.doesNotMatch(espera, /natal/, 'nada de Natal dentro da tela da partida');
});

test('roupa de Papai Noel: grátis para todos (loja e mascote), com foto, e o rosto do pet livre', () => {
  const shop = require('../shop'), L = require('../public/mascot-looks.js');
  const it = shop.ITEMS.find((i) => i.id === 'roupa-papai-noel'); assert.ok(it); assert.equal(it.price, 0); assert.equal(it.category, 'roupas'); assert.equal(it.look, 'papai-noel');
  const o = L.byId(L.OUTFITS, 'papai-noel'); assert.equal(o.free, true); assert.equal(o.emoji, '🎅');
  assert.ok(fs.existsSync(path.join(root, 'public/pet/roupa-papai-noel.webp')));
  assert.equal(shop.ITEMS.filter((i) => i.price > 0).length, 14, 'nenhum item pago novo e nenhum preço mudou');
});
