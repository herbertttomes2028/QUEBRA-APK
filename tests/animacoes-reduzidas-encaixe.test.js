'use strict';
// Regressão do caminho de encaixe quando Ajustes > Movimento está em reduzir.
// Testa as funções reais do game.js isoladamente, sem alterar Socket.IO/SNAP.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/style.css'), 'utf8');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const challenge = fs.readFileSync(path.join(root, 'challenge.js'), 'utf8');

function fn(name, ctx) {
  const start = game.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, name + ' deve existir');
  const end = game.indexOf('\n  function ', start + 10);
  assert.ok(end > start, name + ' deve terminar');
  vm.runInNewContext(game.slice(start, end), ctx, { filename: 'game.js/' + name });
}
function mockElement() {
  let reads = 0;
  const classes = new Set();
  const el = {
    style: {}, hidden: true, textContent: '',
    classList: {
      add: x => classes.add(x), remove: x => classes.delete(x),
      contains: x => classes.has(x)
    },
    get offsetWidth() { reads++; return 42; }
  };
  return { el, classes, reads: () => reads };
}

test('marco de encaixe no modo reduzido nao mede layout nem perde aviso/som', () => {
  const m = mockElement(), sounds = [], announcements = [];
  const ctx = {
    state: { msTimer: 4 }, $: () => m.el, reducedMotion: () => true,
    clearTimeout() {}, setTimeout() { return 7; },
    playSound: x => sounds.push(x), announce: x => announcements.push(x)
  };
  fn('showMilestone', ctx); ctx.showMilestone('Metade!');
  assert.equal(m.reads(), 0, 'modo sem animacao nao pode forcar reflow');
  assert.equal(m.el.style.animation, 'none');
  assert.equal(m.el.style.opacity, '1');
  assert.equal(m.el.hidden, false);
  assert.deepEqual(sounds, ['chime']);
  assert.deepEqual(announcements, ['Metade!']);
});

test('marco com animacoes continua reiniciando seu efeito normalmente', () => {
  const m = mockElement();
  const ctx = {
    state: {}, $: () => m.el, reducedMotion: () => false,
    clearTimeout() {}, setTimeout() { return 7; }, playSound() {}, announce() {}
  };
  fn('showMilestone', ctx); ctx.showMilestone('Um quarto!');
  assert.equal(m.reads(), 1, 'reflow preservado apenas quando a animacao existe');
  assert.equal(m.el.style.animation, '');
});

test('feedback generico sem animacoes nao faz leitura sincrona de layout', () => {
  const m = mockElement();
  let cleanup = null;
  const ctx = { reducedMotion: () => true, setTimeout: f => { cleanup = f; } };
  fn('popEl', ctx);
  ctx.popEl(m.el, 'tap');
  assert.equal(m.reads(), 0);
  assert.equal(m.classes.has('tap'), true);
  cleanup();
  assert.equal(m.classes.has('tap'), false, 'estado visual limpo como antes');
});

test('feedback generico animado ainda pode reiniciar a animacao', () => {
  const m = mockElement();
  const ctx = { reducedMotion: () => false, setTimeout() {} };
  fn('popEl', ctx); ctx.popEl(m.el, 'tap');
  assert.equal(m.reads(), 1);
});

test('recusa de peca alheia nao forca reflow no modo reduzido', () => {
  const m = mockElement();
  let cleanup;
  const ctx = { reducedMotion: () => true, setTimeout: f => { cleanup = f; } };
  fn('shake', ctx); ctx.shake({ el: m.el });
  assert.equal(m.reads(), 0);
  cleanup();
  assert.equal(m.classes.has('shake'), false);
});

test('recusa animada continua reiniciando efeito normalmente', () => {
  const m = mockElement();
  const ctx = { reducedMotion: () => false, setTimeout() {} };
  fn('shake', ctx); ctx.shake({ el: m.el });
  assert.equal(m.reads(), 1);
});

function runFrame(reduced) {
  const element = mockElement().el;
  const piece = {
    id: 0, x: 250, y: 400, tx: 250, ty: 400,
    vs: 0.55, scaleAnimTime: 1000, boardExpanded: true,
    locked: true, zoomAbs: null, dirty: true, el: element, tag: null, fly: null
  };
  const calls = [];
  const ctx = {
    state: { pieces: [piece], cfg: { TILE: 200 }, drag: null, view: null, inGame: false },
    targetScale: () => 1, reducedMotion: () => reduced,
    wakeFrame: () => calls.push('wake'), paintTimer() {}, paintTag() {},
    lastTimerPaint: 995, currentScreen: () => 'game',
    document: { hidden: false }, Math, frameTimer: 0,
    clamp: (v, a, b) => Math.max(a, Math.min(b, v))
  };
  fn('frame', ctx); ctx.frame(1016);
  return { piece, calls };
}

test('encaixe com animacoes desligadas finaliza tamanho/posicao no mesmo quadro', () => {
  const { piece, calls } = runFrame(true);
  assert.equal(piece.vs, 1);
  assert.equal(piece.scaleAnimTime, null);
  assert.equal(piece.dirty, false);
  assert.match(piece.el.style.transform, /translate3d\(150px,300px,0\) scale\(1\)/);
  assert.deepEqual(calls, [], 'peca encaixada nao cria quadros extras de tamanho');
});

test('encaixe com animacoes ligadas preserva suavizacao anterior', () => {
  const { piece, calls } = runFrame(false);
  assert.ok(piece.vs > .55 && piece.vs < 1);
  assert.deepEqual(calls, ['wake']);
});

test('modo reduzido desliga efetivamente o pop do SVG encaixado', () => {
  assert.match(css, /html\[data-motion="reduce"\] \.piece\.locked \.tile \{ animation: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.piece\.locked \.tile \{ animation: none; \}/);
  assert.match(css, /\.piece\.locked \{ pointer-events: none; cursor: default; \}/);
  assert.match(css, /\.piece\.locked \.tile\s*\{[\s\S]*?animation: pop \.35s ease-out/);
});

test('contratos de encaixe, giros, pinça e recompensa intactos', () => {
  assert.match(server, /function tryLock\(room, p, idx\)/);
  assert.match(challenge, /function tryLock\(room, idx, board, p, socket\)/);
  assert.match(game, /socket\.on\('locked', function \(d\)/);
  assert.match(game, /p\.locked = true;/);
  assert.match(game, /function startPinch\(/);
  assert.match(game, /function setZoom\(/);
  assert.match(game, /socket\.volatile\.emit\(state\.duel \? 'ch:move' : 'move'/);
  assert.match(fs.readFileSync(path.join(root, 'accounts.js'), 'utf8'), /async function payMatch\(/);
});
