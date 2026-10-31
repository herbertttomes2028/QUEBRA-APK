'use strict';
// Fluxos reais isolados do game.js: evita introduzir travamentos por layout
// ou repetir decodificacao da imagem grande na abertura.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const game = read('public/game.js'), css = read('public/style.css');
const start = game.indexOf('  var go = {'), end = game.indexOf('  function doCreate(', start);
assert.ok(start > 0 && end > start);
const splashSource = game.slice(start, end);

test('giro usa miniatura da mesma imagem e inicia sem reflow síncrono', () => {
  const tags = [], callbacks = [], canceled = [];
  let nextFrame = 0;
  const classes = new Set();
  const splash = {hidden:true, classList:{
    add: x => classes.add(x),
    remove: (...xs) => xs.forEach(x => classes.delete(x))
  }};
  const img = {style:{backgroundImage:''}};
  const elems = {
    '#go-splash': splash, '#go-img': img,
    '#go-sub': {textContent:''}, '#go-cancel': {hidden:true}
  };
  const ctx = {
    $: sel => { assert.ok(elems[sel], sel); return elems[sel]; },
    imageItem: () => ({categoryId:'fauna',
      thumb:'biblioteca/mini/lib-fauna-01.webp', url:'biblioteca/lib-fauna-01.webp'}),
    LIBRARY_MEDIA_VERSION:'capas-20261031',
    clearTimeout:()=>{}, setTimeout:()=>123,
    requestAnimationFrame: cb => {callbacks.push(cb);return ++nextFrame;},
    cancelAnimationFrame: id => canceled.push(id),
    reducedMotion:()=>false, announce: text=>tags.push(text)
  };
  Object.defineProperty(splash, 'offsetWidth', {get() {throw Error('layout forçado');}});
  vm.runInNewContext(splashSource, ctx);
  ctx.showGoSplash('lib-fauna-01.webp');
  assert.match(img.style.backgroundImage, /biblioteca\/mini\/lib-fauna-01\.webp\?v=capas-20261031/);
  assert.equal(splash.hidden,false);
  assert.equal(classes.has('run'),false, 'animação só inicia no quadro de desenho');
  assert.equal(callbacks.length,1);
  callbacks.shift()();
  assert.equal(classes.has('run'),true);
  assert.equal(tags[0],'Vamos lá!');
  ctx.hideGoSplash(true);
  assert.equal(splash.hidden,true);
  assert.equal(classes.has('run'),false);
  ctx.showGoSplash('lib-fauna-01.webp');
  ctx.hideGoSplash(true);
  assert.ok(canceled.includes(2),'quadro futuro é cancelado ao sair');
});

test('resultado adia limpeza dos SVGs até a janela aparecer, sem mudar prêmios', () => {
  const begin = game.indexOf('  function showVictoryResult(');
  const reveal = game.slice(begin, game.indexOf('  function showWin(',begin));
  const win = game.slice(game.indexOf('  function showWin('), game.indexOf('  /* ---------------------------------------------------------\n   * Ajustes:',game.indexOf('  function showWin(')));
  assert.match(reveal, /openModal\(modalSel, focusSel\);[\s\S]*?if \(modalSel === '#modal-win'\) \$\('#field'\)\.classList\.add\('won'\)/);
  assert.doesNotMatch(win, /\$\('#field'\)\.classList\.add\('won'\)/);
  assert.match(reveal, /refreshXp\(\)/);
  assert.match(win, /showVictoryResult\('#modal-win', '#win-again', true/);
  assert.match(win, /playSound\('win'\)/);
  assert.match(game, /showVictoryResult\('#modal-duel', '#duel-rematch', ownComplete/);
});

test('estilos preservam giro em pé, pulinho dourado e contorno sem filtro caro', () => {
  assert.match(css, /rotateY\(-360deg\) scale\(\.97\)/);
  assert.match(css, /go-spin 2\.4s/);
  assert.match(css, /0 9px 18px rgba\(0, 0, 0, \.36\)/);
  assert.match(css, /\.victory-flight-photo\s*\{[\s\S]*?contain: layout;/);
  assert.match(css, /\.victory-flight-photo::before/);
  assert.match(css, /@keyframes victory-glint/);
  assert.match(read('public/sw.js'), /const CACHE = 'quebra-cabeca-v18'/);
});
