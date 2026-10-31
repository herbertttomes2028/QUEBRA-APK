'use strict';
// Regressão independente: regra da grade para todos os tamanhos (base PR #35).
// Não envolve aparelho físico, Render ou Socket.IO real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const root = path.join(__dirname, '..');
const game = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'public/sw.js'), 'utf8');
const PRESETS = {
  6: [2, 3, 840, 240], 12: [3, 4, 960, 160], 20: [4, 5, 960, 135],
  30: [5, 6, 950, 120], 48: [6, 8, 780, 110]
};

function body(name) {
  const needle = '  function ' + name + '(';
  const start = game.indexOf(needle);
  assert.ok(start >= 0, 'função presente: ' + name);
  const end = game.indexOf('\n  function ', start + needle.length);
  assert.ok(end >= 0, 'fim da função: ' + name);
  return game.slice(start, end);
}

function build(pieces = 6) {
  const [cols, rows, bw, tray] = PRESETS[pieces];
  const tile = bw / cols;
  const cfg = {
    PIECES: pieces, COLS: cols, ROWS: rows, TILE: tile, TRAY: tray,
    BOARD_X: (1000 - bw) / 2, BOARD_Y: 30, BOARD_W: bw, BOARD_H: rows * tile,
    TRAY_LINE: 30 + rows * tile + 20, FIELD_W: 1000, FIELD_H: 3000
  };
  const p = {
    id: 0, x: 500, y: cfg.TRAY_LINE + 130, tx: 500, ty: cfg.TRAY_LINE + 130,
    heldBy: null, locked: false, zoomAbs: null, vs: cfg.TRAY / cfg.TILE,
    z: 10, dirty: false, lastMove: 0,
    el: { dataset: { id: '0' }, style: {}, setPointerCapture() {} }
  };
  const state = {
    cfg, idx: 0, ptrs: {}, drag: null, pinch: null, selectedId: null,
    pieces: [p], zMax: 10, idleTimer: null, scale: 1, inGame: false,
    status: 'playing', view: null
  };
  const sent = [], painted = [];
  const ctx = {
    state, ZOOM_MAX: 6,
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    $: key => key === '#field' ? { getBoundingClientRect: () => ({ left: 0, top: 0 }) }
      : key === '#stage' ? { clientWidth: 960 } : null,
    performance: { now: () => 1000 },
    Math, Number, Object, clearTimeout: () => {},
    classify: () => {}, updateUi: () => {}, refreshLamp: () => {}, wakeFrame: () => painted.push('wake'),
    gameEmit: (name, payload) => sent.push([name, payload]),
    socket: { volatile: { emit: (name, payload) => sent.push([name, payload]) } },
    document: { hidden: false }, lastTimerPaint: 1000, paintTimer: () => {},
    currentScreen: () => 'game', frameTimer: 0, setTimeout: () => 10,
    paintTag: () => {},
  };
  for (const name of [
    'fullyInsideBoard', 'baseScale', 'targetScale', 'pointerCount', 'onPointerDown',
    'startPinch', 'setZoom', 'onPointerMove', 'frame'
  ]) vm.runInNewContext(body(name), ctx, { filename: 'game.js:' + name });
  function pointer(x, y, pointerId = 1, pointerType = 'touch') {
    return {
      clientX: x, clientY: y, pointerId, pointerType, button: 0,
      preventDefault() {}, target: { closest: () => p.el }
    };
  }
  function inside() {
    p.x = cfg.BOARD_X + cfg.TILE / 2;
    p.y = cfg.BOARD_Y + cfg.TILE / 2;
    p.tx = p.x; p.ty = p.y;
  }
  return { cfg, p, state, ctx, pointer, sent, painted, inside };
}

for (const pieces of [6, 12, 20, 30, 48]) {
  test(pieces + ' peças: não ampliar automaticamente ao tocar, segurar ou arrastar na bandeja', () => {
    const { ctx, p, cfg, state, pointer } = build(pieces);
    const original = cfg.TRAY / cfg.TILE;
    assert.equal(ctx.baseScale(p), original);
    ctx.onPointerDown(pointer(p.x + 20, p.y));
    assert.equal(state.selectedId, 0);
    assert.equal(ctx.targetScale(p), original, 'toque/segurar não faz zoom');
    state.drag.moved = true;
    assert.equal(ctx.targetScale(p), original, 'movimentar na bandeja não faz zoom');
    p.heldBy = 1;  // amigo arrastando também não causa zoom prematuro
    assert.equal(ctx.targetScale(p), original);
  });

  test(pieces + ' peças: só ativa o zoom quando cabe inteira e não oscila nas bordas', () => {
    const { ctx, p, cfg, inside } = build(pieces);
    const small = cfg.TRAY / cfg.TILE;
    p.x = cfg.BOARD_X + cfg.TILE / 2 - 0.1;
    p.y = cfg.BOARD_Y + cfg.TILE / 2;
    assert.equal(ctx.baseScale(p), small, 'antes da entrada inteira permanece pequena');
    inside();
    assert.equal(ctx.fullyInsideBoard(p), true, 'o canto exato cabe dentro');
    assert.equal(ctx.baseScale(p), 1);
    assert.equal(p.boardExpanded, true, 'travou escala natural após primeira entrada');
    const bordas = [
      [cfg.BOARD_X + cfg.TILE / 2 - 0.1, cfg.BOARD_Y + cfg.TILE / 2],
      [cfg.BOARD_X + cfg.BOARD_W - cfg.TILE / 2 + 0.1, cfg.BOARD_Y + cfg.TILE / 2],
      [cfg.BOARD_X + cfg.TILE / 2, cfg.BOARD_Y + cfg.BOARD_H - cfg.TILE / 2 + 0.1],
      [cfg.BOARD_X + cfg.TILE / 2, cfg.BOARD_Y + cfg.TILE / 2 - 0.1],
    ];
    for (const [x, y] of bordas) {
      p.x = x; p.y = y;
      assert.equal(ctx.fullyInsideBoard(p), false);
      assert.equal(ctx.baseScale(p), 1, 'zoom retido apesar de ultrapassar borda');
    }
    p.locked = true;
    p.x = 0; p.y = 0;
    assert.equal(ctx.baseScale(p), 1, 'peça encaixada continua no tamanho final');
  });

  test(pieces + ' peças: só volta ao tamanho pequeno quando SOLTA na bandeja', () => {
    const { ctx, p, cfg, inside } = build(pieces);
    inside();
    p.heldBy = 0;
    assert.equal(ctx.baseScale(p), 1);
    p.y = cfg.TRAY_LINE + cfg.TRAY / 2 + 5;
    assert.equal(ctx.baseScale(p), 1, 'segurando: mantém zoom mesmo de volta à bandeja');
    p.heldBy = null;
    assert.equal(ctx.baseScale(p), cfg.TRAY / cfg.TILE, 'ao soltar na bandeja volta a diminuir');
    assert.equal(p.boardExpanded, false, 'libera o zoom automático só no retorno intencional');
    inside();
    assert.equal(ctx.baseScale(p), 1, 'pode crescer novamente ao entrar de novo');
  });

  test(pieces + ' peças: pinça manual continua ampliando na bandeja e na grade', () => {
    const { ctx, p, cfg, state, pointer, inside } = build(pieces);
    ctx.onPointerDown(pointer(p.x, p.y));
    state.ptrs[2] = { x: p.x + 60, y: p.y };
    ctx.startPinch();
    assert.equal(state.drag, null, 'pinça substitui arrasto');
    assert.ok(state.pinch, 'pinça ativa');
    ctx.onPointerMove(pointer(p.x + 120, p.y, 2));
    assert.ok(p.zoomAbs > cfg.TRAY / cfg.TILE, 'a pinça amplia por escolha do jogador');
    const zoom = p.zoomAbs;
    assert.equal(ctx.targetScale(p), zoom);
    inside();
    ctx.setZoom(p, 1.6);
    assert.equal(ctx.targetScale(p), 1.6, 'zoom manual continua na grade');
  });

  test(pieces + ' peças: toque arrasta após 5px e acompanha o dedo sem salto', () => {
    const { ctx, p, state, pointer, sent } = build(pieces);
    const x = p.x, y = p.y;
    ctx.onPointerDown(pointer(x + 20, y));
    assert.equal(state.drag.offX, 20, 'deslocamento dedo-centro natural');
    ctx.onPointerMove(pointer(x + 24, y));
    assert.equal(state.drag.moved, false);
    assert.equal(p.x, x);
    ctx.onPointerMove(pointer(x + 26, y));
    assert.equal(state.drag.moved, true);
    assert.equal(p.x, x + 6);
    assert.equal(p.tx, x + 6);
    assert.ok(sent.some(([event]) => event === 'move'), 'evento original de movimento preservado');
  });
}

test('mouse preserva tolerância de 8px para diferenciar seleção de arrasto', () => {
  const { ctx, p, state, pointer } = build(12);
  const x = p.x, y = p.y;
  ctx.onPointerDown(pointer(x, y, 1, 'mouse'));
  ctx.onPointerMove(pointer(x + 7, y, 1, 'mouse'));
  assert.equal(state.drag.moved, false);
  ctx.onPointerMove(pointer(x + 8, y, 1, 'mouse'));
  assert.equal(state.drag.moved, true);
});

test('transição da bandeja para a grade aumenta suavemente, nunca num salto', () => {
  const { ctx, p, cfg, inside, painted } = build(6);
  const small = cfg.TRAY / cfg.TILE;
  p.dirty = false;
  inside();
  ctx.frame(1000);
  assert.ok(p.vs > small && p.vs < 1, 'primeiro quadro é intermediário');
  assert.ok(p.el.style.transform.includes('scale('), 'transform atualizada');
  assert.ok(painted.includes('wake'), 'solicita quadros enquanto cresce');
  for (let i = 1; i < 45; i++) ctx.frame(1000 + 16 * i);
  assert.ok(Math.abs(p.vs - 1) < 0.001, 'converge ao tamanho de encaixe');
  const prev = p.vs;
  p.y -= cfg.TILE / 2 + 1;
  p.tx = p.x; p.ty = p.y;
  ctx.frame(1800);
  assert.equal(p.vs, prev, 'não diminui por ultrapassar a borda após ter crescido');
  assert.equal(p.boardExpanded, true);
  p.y = cfg.TRAY_LINE + cfg.TRAY / 2 + 5;
  p.tx = p.x; p.ty = p.y;
  p.heldBy = null;
  ctx.frame(1816);
  assert.ok(p.vs < prev && p.vs > small, 'só diminui suavemente ao voltar e soltar na bandeja');
});

test('a expansão é suave em 30/60/120 Hz e não move a peça para longe do dedo', () => {
  const sizes = [33.333, 16.667, 8.333];
  const values = [];
  for (const interval of sizes) {
    const { ctx, p, cfg, inside } = build(12);
    inside();
    let last = 1000;
    ctx.frame(last);
    const first = p.vs;
    assert.ok(first > cfg.TRAY / cfg.TILE && first < 1, 'primeiro quadro de escala é gradual');
    assert.equal(p.x, p.tx, 'coordenada do dedo não sofre interpolação');
    for (let i = 1; last + interval <= 1240; i++) {
      last = 1000 + i * interval;
      if (last > 1240) break;
      ctx.frame(last);
    }
    values.push(p.vs);
  }
  assert.ok(values.every(v => v > .96 && v <= 1), 'crescimento perceptível, sem salto');
  assert.ok(Math.max(...values) - Math.min(...values) < .025, 'resultado semelhante em ritmos de tela distintos');
});

test('oscilações pequenas nas bordas não reiniciam a animação de aumento', () => {
  const { ctx, p, cfg, inside } = build(20);
  inside();
  ctx.frame(1000);
  let previous = p.vs;
  for (let i = 1; i < 25; i++) {
    p.x = cfg.BOARD_X + cfg.TILE / 2 + (i % 2 ? -.6 : +.6);
    p.tx = p.x;
    p.y = cfg.BOARD_Y + cfg.TILE / 2;
    p.ty = p.y;
    ctx.frame(1000 + i * 16);
    assert.ok(p.vs >= previous, 'escala não pode diminuir durante passagem pela borda');
    previous = p.vs;
  }
  assert.ok(previous > .98);
});

test('dedo parado não força desenho a 60 quadros após estabilizar', () => {
  const { ctx, state, p, painted } = build(20);
  p.heldBy = 0;
  p.dirty = false;
  state.drag = { id: 0, moved: true };
  ctx.frame(1000);
  assert.equal(p.vs, state.cfg.TRAY / state.cfg.TILE);
  assert.equal(p.el.style.transform, undefined, 'nenhuma escrita gráfica desnecessária');
  assert.equal(painted.length, 0, 'sem quadros contínuos só por segurar sem mover');
});



test('Sala Desafio mantém giro e seu limite de 8px sem zoom ao tocar', () => {
  for (const pieces of [12, 20, 30, 48]) {
    const { ctx, state, cfg, p, pointer } = build(pieces);
    state.duel = { mode: 'comum' };
    ctx.onPointerDown(pointer(p.x + 20, p.y));
    assert.equal(ctx.targetScale(p), cfg.TRAY / cfg.TILE);
    ctx.onPointerMove(pointer(p.x + 26, p.y));
    assert.equal(state.drag.moved, false, 'segundo toque ainda pode girar');
    ctx.onPointerMove(pointer(p.x + 29, p.y));
    assert.equal(state.drag.moved, true, '8px habilitam arrasto no Desafio');
  }
});

test('geometria é pura: baseScale não lê layout nem toca DOM, desenha apenas via frame', () => {
  const { ctx, p, cfg } = build(48);
  ctx.$ = () => { throw new Error('proibido ler layout durante o arrasto'); };
  const initial = ctx.baseScale(p);
  assert.equal(initial, cfg.TRAY / cfg.TILE);
  p.x = cfg.BOARD_X + cfg.TILE / 2;
  p.y = cfg.BOARD_Y + cfg.TILE / 2;
  assert.equal(ctx.baseScale(p), 1);
});

test('orientação correta no Solo/Coop e giros no Desafio não mudaram', () => {
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const challenge = fs.readFileSync(path.join(root, 'challenge.js'), 'utf8');
  assert.match(server, /rot: readyToFit \? 0 : rnd\(0, 3\)/);
  assert.match(server, /pieces: buildPieces\(cfg, true\)/);
  assert.match(server, /room\.pieces = buildPieces\(room\.cfg, true\)/);
  assert.match(challenge, /buildPieces\(cfg\)\.map/);
  assert.match(challenge, /rot: rnd\(0, 3\), out: false/);
  assert.match(game, /if \(state\.duel\) rotateSelected\(\)/);
  assert.match(game, /function setZoom\(/);
  assert.match(game, /Ela só cresce quando entra completamente na grade/);
  assert.match(game, /socket\.volatile\.emit\(state\.duel \? 'ch:move' : 'move'/);
});

test('cache PWA v21 verifica atualizações sem remover dados locais do jogador', () => {
  assert.match(sw, /const CACHE = 'quebra-cabeca-v21'/);
  assert.match(sw, /'\/game\.js'/);
  assert.match(sw, /self\.addEventListener\('activate'/);
  assert.doesNotMatch(sw, /localStorage\.clear|indexedDB\.deleteDatabase/);
});
