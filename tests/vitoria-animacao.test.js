'use strict';
// O mesmo trecho do jogo é executado em VM: cobre agendamento, toque,
// movimento reduzido, reconexão do Desafio e cancelamento sem banco de dados.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const game = read('public/game.js'), html = read('public/index.html'), css = read('public/style.css');
const begin = game.indexOf('  var victoryMotion = {');
const end = game.indexOf('\n  /* ---------------------------------------------------------\n   * Vitória\n', begin);
assert.ok(begin > 0 && end > begin, 'localizar implementação original da animação');
const snippet = game.slice(begin, end);

function fixture({reduce = false, screen = 'game', duel = false, sourceSize = 200} = {}) {
  const events = {}, calls = [], animations = [];
  const source = {left: 40, top: 100, width: sourceSize, height: sourceSize * 1.33};
  const target = {left: 110, top: 145, width: 130, height: 174};
  const nodes = {};
  function el(rect) {
    return {
      hidden: true, classList: {add: () => {}, remove: () => {}},
      style: {setProperty: () => {}}, getBoundingClientRect: () => rect || target,
      addEventListener(name, f) { events[name] = f; }
    };
  }
  nodes['#board'] = el(source);
  nodes['#modal-win'] = el();
  nodes['#modal-duel'] = el();
  nodes['#win-art'] = el(target);
  nodes['#duel-art'] = el(target);
  nodes['#victory-flight'] = el();
  nodes['#victory-flight-photo'] = el();
  nodes['#victory-flight-photo'].animate = (frames, config) => {
    const anim = {
      frames, config, cancelled: false,
      finished: new Promise(() => {}),
      cancel() { this.cancelled = true; }
    };
    animations.push(anim);
    return anim;
  };
  const state = {inGame: true, duel, imageUrl: 'blob:fixture'};
  let timerNum = 0;
  const ctx = {
    $: sel => { assert.ok(nodes[sel], sel); return nodes[sel]; },
    state, document: {addEventListener(name, fn) { events['doc:' + name] = fn; }, hidden: false},
    window: {innerWidth: 360, innerHeight: 740, addEventListener(name, fn) { events['win:' + name] = fn; }},
    reducedMotion: () => reduce, currentScreen: () => screen,
    openModal: (sel, focus) => { calls.push(['modal', sel, focus]); nodes[sel].hidden = false; },
    refreshXp: () => calls.push(['xp']),
    clearTimeout: () => {}, setTimeout: () => ++timerNum
  };
  vm.runInNewContext(snippet, ctx);
  return {ctx, nodes, events, calls, animations, state};
}

test('imagem única inicia na grade, aproxima-se e chega ao resultado; toque dispensa uma vez', () => {
  const f = fixture();
  f.ctx.showVictoryResult('#modal-win', '#win-again', true, () => f.calls.push(['som']));
  assert.equal(f.animations.length, 1);
  assert.equal(f.animations[0].frames.length, 5);
  assert.equal(f.animations[0].config.duration, 2260);
  assert.equal(f.nodes['#victory-flight'].hidden, false);
  assert.equal(f.nodes['#modal-win'].hidden, true);
  assert.equal(f.nodes['#victory-flight-photo'].style.backgroundImage, 'url("blob:fixture")');
  f.events.pointerdown({preventDefault() {}});
  assert.equal(f.nodes['#victory-flight'].hidden, true);
  assert.equal(f.animations[0].cancelled, true);
  assert.deepEqual(f.calls.map(x => x[0]), ['modal', 'xp', 'som']);
  f.events.pointerdown({preventDefault() {}});
  assert.equal(f.calls.length, 3, 'sem segundo pagamento ou resultado duplicado');
});

test('movimento reduzido entrega resultado imediatamente, sem criar animação', () => {
  const f = fixture({reduce: true});
  f.ctx.showVictoryResult('#modal-win', '#win-again', true);
  assert.equal(f.animations.length, 0);
  assert.deepEqual(f.calls.map(x => x[0]), ['modal', 'xp']);
});

test('Desafio: derrota e retorno ao lobby exibem o resultado, sem animar fotografia', () => {
  const f = fixture({screen: 'lobby', duel: true});
  f.ctx.showVictoryResult('#modal-duel', '#duel-rematch', false);
  assert.equal(f.animations.length, 0);
  assert.deepEqual(f.calls[0], ['modal', '#modal-duel', '#duel-rematch']);
});

test('ao sair da partida, voo é cancelado e não abre janela antiga', () => {
  const f = fixture();
  f.ctx.showVictoryResult('#modal-win', '#win-again', true);
  assert.equal(f.animations.length, 1);
  f.ctx.cancelVictoryFlight();
  assert.equal(f.nodes['#victory-flight'].hidden, true);
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.calls.length, 0);
});

test('fallback sem tabuleiro visível não prende o resultado', () => {
  const f = fixture({sourceSize: 0});
  f.ctx.showVictoryResult('#modal-win', '#win-again', true);
  assert.equal(f.animations.length, 0);
  assert.deepEqual(f.calls.map(x => x[0]), ['modal', 'xp']);
});

test('HTML/CSS preservam imagem, medalha, XP, gemas e comandos com movimento leve', () => {
  assert.match(html, /id="victory-flight"[^>]*aria-hidden="true"/);
  assert.match(html, /id="victory-flight-photo"/);
  assert.match(html, /class="victory-medal"/);
  assert.match(html, /id="duel-art"[^>]*hidden/);
  assert.match(css, /\.victory-flight-photo\s*\{/);
  assert.match(css, /@keyframes victory-glint/);
  assert.match(css, /@keyframes victory-last-glow/);
  assert.match(game, /function flashLastSnap\(\)/);
  assert.match(game, /socket\.on\('won', function \(d\) \{\s*flashLastSnap\(\)/);
  assert.match(css, /html\[data-motion="reduce"\] \.victory-flight/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(game, /function refreshXp\(/);
  assert.match(game, /if \(ev\.gemsMatch > 0\)/);
  assert.match(html, /id="win-save"/);
  assert.match(html, /id="win-share"/);
  assert.match(html, /id="duel-rematch"/);
  assert.doesNotMatch(snippet, /socket\.emit|\bpayMatch\b|\bfetch\(/);
});
