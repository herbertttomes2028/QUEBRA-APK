'use strict';
// Regressões isoladas dos gestos do game.js: rodar sem servidor/conta/Android.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');

function body(name) {
  const needle = '  function ' + name + '(';
  const start = game.indexOf(needle);
  assert.ok(start >= 0, 'função presente: ' + name);
  const end = game.indexOf('\n  function ', start + needle.length);
  assert.ok(end >= 0, 'fim da função: ' + name);
  return game.slice(start, end);
}

function build(pieces = 6) {
  const cfg = {
    PIECES: pieces, TILE: pieces === 6 ? 420 : 320, TRAY: pieces === 6 ? 240 : 160,
    TRAY_LINE: 1500, FIELD_W: 1000, FIELD_H: 2300
  };
  const p = {
    id: 0, x: 500, y: 1800, tx: 500, ty: 1800, heldBy: null,
    locked: false, zoomAbs: null, vs: cfg.TRAY / cfg.TILE, z: 10,
    el: { dataset: { id: '0' }, setPointerCapture() {} }
  };
  const state = {
    cfg, idx: 0, ptrs: {}, drag: null, pinch: null, selectedId: null,
    pieces: [p], zMax: 10, idleTimer: null, scale: 1
  };
  const sent = [], painted = [];
  const ctx = {
    state, HELD_SCALE: 1.04, ZOOM_MAX: 6,
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    $: key => key === '#field' ? { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
      : key === '#stage' ? { clientWidth: 960 } : null,
    performance: { now: () => 1000 },
    Math, Number, Object,
    classify: () => {}, updateUi: () => {}, refreshLamp: () => {}, wakeFrame: () => painted.push('frame'),
    gameEmit: (name, payload) => sent.push([name, payload]),
    clearTimeout: () => {},
    socket: { volatile: { emit: (name, payload) => sent.push([name, payload]) } },
    stateSent: sent,
  };
  for (const name of ['baseScale', 'targetScale', 'pointerCount', 'onPointerDown', 'startPinch', 'setZoom', 'onPointerMove']) {
    vm.runInNewContext(body(name), ctx, { filename: 'game.js:' + name });
  }
  function pointer(x, y, pointerId = 1, pointerType = 'touch') {
    return {
      clientX: x, clientY: y, pointerId, pointerType,
      preventDefault() {},
      target: { closest: () => p.el }
    };
  }
  return { cfg, p, state, ctx, pointer, sent, painted };
}

test('6 peças: selecionar e segurar na bandeja não faz zoom automático', () => {
  const { ctx, p, cfg, state, pointer } = build();
  assert.equal(ctx.baseScale(p), cfg.TRAY / cfg.TILE);
  ctx.onPointerDown(pointer(540, 1800));
  assert.equal(state.selectedId, 0);
  assert.equal(ctx.baseScale(p), cfg.TRAY / cfg.TILE);
  state.drag.moved = true;
  assert.equal(ctx.baseScale(p), cfg.TRAY / cfg.TILE, 'não cresce enquanto ainda está na bandeja');
  p.y = cfg.TRAY_LINE - 1;
  assert.equal(ctx.baseScale(p), 1, 'no tabuleiro cresce só até o tamanho natural');
});

test('6 peças: a pinça continua ampliando a peça selecionada', () => {
  const { ctx, p, cfg, state, pointer } = build();
  ctx.onPointerDown(pointer(500, 1800));
  state.ptrs[2] = { x: 600, y: 1800 };
  ctx.startPinch();
  assert.equal(state.drag, null, 'arrasto vira pinça');
  assert.ok(state.pinch, 'pinça iniciada');
  ctx.onPointerMove(pointer(700, 1800, 2));
  assert.ok(p.zoomAbs > cfg.TRAY / cfg.TILE, 'dois dedos aumentaram o zoom de verdade');
  ctx.setZoom(p, 1.5);
  assert.equal(p.zoomAbs, 1.5);
  assert.equal(ctx.targetScale(p), 1.5, 'o zoom manual prevalece sobre a escala natural');
  p.y = cfg.TRAY_LINE - 1;
  assert.equal(ctx.targetScale(p), 1.5, 'pinça funciona também no tabuleiro');
});

test('6 peças: peça já no tabuleiro não amplia automaticamente ao segurar', () => {
  const { ctx, cfg, p, state, pointer } = build();
  p.y = cfg.TRAY_LINE - 200;
  p.vs = 1;
  ctx.onPointerDown(pointer(540, p.y));
  assert.equal(ctx.baseScale(p), 1);
  state.drag.moved = true;
  assert.equal(ctx.baseScale(p), 1);
  assert.equal(ctx.targetScale(p), 1);
});

test('6 peças: iniciar arrasto no celular requer 5px e acompanha o dedo sem salto', () => {
  const { ctx, p, state, pointer, sent } = build();
  ctx.onPointerDown(pointer(540, 1800));
  assert.equal(state.drag.offX, 40, 'sem deslocamento ampliado ao pegar na bandeja');
  ctx.onPointerMove(pointer(544, 1800));
  assert.equal(state.drag.moved, false, 'toque mínimo ainda seleciona');
  assert.equal(p.x, 500);
  ctx.onPointerMove(pointer(546, 1800));
  assert.equal(state.drag.moved, true, 'arrasto reconhecido antes dos 8px antigos');
  assert.equal(p.x, 506, 'posição acompanha exatamente os 6px do dedo');
  assert.equal(p.tx, 506);
  assert.ok(sent.some(([name]) => name === 'move'), 'evento de movimentação preservado');
});

test('12, 20, 30 e 48 peças: ampliação preservada e limiar de 5px no Solo/Coop', () => {
  for (const pieces of [12, 20, 30, 48]) {
    const { ctx, cfg, p, state, pointer } = build(pieces);
    ctx.onPointerDown(pointer(540, 1800));
    assert.equal(ctx.baseScale(p), (cfg.TRAY / cfg.TILE) * 1.12);
    ctx.onPointerMove(pointer(544, 1800));
    assert.equal(state.drag.moved, false, 'movimento abaixo de 5px ainda é seleção em ' + pieces);
    ctx.onPointerMove(pointer(546, 1800));
    assert.equal(state.drag.moved, true);
    assert.equal(ctx.baseScale(p), 1.04, 'zoom ao arrastar preservado em ' + pieces);
  }
});

test('Sala Desafio continua com limiar de 8px em 12/20/30/48 peças', () => {
  for (const pieces of [12, 20, 30, 48]) {
    const { ctx, state, pointer } = build(pieces);
    state.duel = { mode: 'comum' }; state.status = 'playing';
    ctx.onPointerDown(pointer(540, 1800));
    ctx.onPointerMove(pointer(546, 1800));
    assert.equal(state.drag.moved, false, 'giro continua distinguível do arrasto em ' + pieces);
    ctx.onPointerMove(pointer(549, 1800));
    assert.equal(state.drag.moved, true);
  }
});

test('6 peças: o desenho não reanima só por uma seleção em repouso', () => {
  const { ctx, state, p, painted } = build();
  p.heldBy = 0;
  p.tx = p.x;
  p.ty = p.y;
  p.dirty = false;
  p.el.style = {};
  vm.runInNewContext(body('frame'), {
    ...ctx,
    state,
    lastTimerPaint: 999,
    paintTimer: () => {},
    currentScreen: () => 'game',
    wakeFrame: () => painted.push('next'),
    frameTimer: 0,
    document: { hidden: false },
    Math, clamp: ctx.clamp,
  });
  assert.equal(p.vs, 240 / 420);
  assert.equal(p.el.style.transform, undefined, 'nenhuma escrita de transform desnecessária');
  assert.equal(painted.includes('next'), false, 'sem quadros extra só pelo zoom automático');
});

test('PWA: nova versão do cache atualiza o game.js instalado no celular', () => {
  assert.match(sw, /const CACHE = 'quebra-cabeca-v21'/);
  assert.match(sw, /'\/game\.js'/);
  assert.match(sw, /self\.addEventListener\('activate'/);
});
