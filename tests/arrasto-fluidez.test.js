'use strict';
// Regressões da resposta ao toque: executa as funções REAIS de public/game.js
// usando DOM e rede simulados. Não é medição de FPS em celular físico.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const game = fs.readFileSync(path.join(__dirname, '..', 'public', 'game.js'), 'utf8');

function method(name) {
  const start = game.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, 'função existente: ' + name);
  const end = game.indexOf('\n  function ', start + 10);
  assert.ok(end > start, 'limite da função: ' + name);
  return game.slice(start, end);
}
function fixture(pieces = 12, duel = false) {
  const order = [], events = [];
  let now = 1000;
  const cfg = { PIECES: pieces, TILE: 320, TRAY: 160, TRAY_LINE: 1500, FIELD_W: 1200, FIELD_H: 2300 };
  const el = { dataset: { id: '0' }, setPointerCapture() { order.push('capture'); } };
  const p = { id: 0, x: 500, y: 1800, tx: 500, ty: 1800,
    heldBy: null, locked: false, vs: .5, zoomAbs: null, z: 1, el };
  const state = { cfg, idx: 0, status: 'playing', duel: duel ? { mode: 'comum' } : null,
    ptrs: {}, pinch: null, drag: null, selectedId: null, zMax: 1, pieces: [p],
    scale: 1, idleTimer: null };
  const ctx = { state, Math, Number, Object,
    HELD_SCALE: 1.04,
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    $: key => key === '#field' ? { getBoundingClientRect() {
      order.push('measure'); return { left: 0, top: 0 };
    } } : null,
    classify: () => order.push('classify'),
    refreshLamp: () => order.push('refreshLamp'),
    updateUi: () => { throw new Error('Não atualizar HUD inteiro só por selecionar/soltar'); },
    clearTimeout() {},
    gameEmit: (name, data) => events.push({ name, data }),
    wakeFrame: () => order.push('raf'),
    resetIdle: () => order.push('resetIdle'),
    socket: { volatile: { emit: (name, data) => events.push({ name, data }) } },
    performance: { now: () => now }
  };
  for (const name of ['pointerCount', 'onPointerDown', 'onPointerMove', 'dropSelected', 'endPointer']) {
    vm.runInNewContext(method(name), ctx, { filename: 'public/game.js:' + name });
  }
  function pointer(x, y, type = 'touch') {
    return { clientX: x, clientY: y, pointerId: 1, pointerType: type,
      preventDefault() {}, target: { closest: () => el } };
  }
  return { order, events, p, state, ctx, pointer, setTime: t => { now = t; } };
}

test('seleção mede campo antes de alterar classes; HUD não é redesenhado', () => {
  const f = fixture();
  f.ctx.onPointerDown(f.pointer(540, 1800));
  assert.ok(f.order.indexOf('measure') !== -1);
  assert.ok(f.order.indexOf('classify') > f.order.indexOf('measure'));
  assert.equal(f.state.selectedId, 0);
  assert.ok(f.order.includes('refreshLamp'));
  assert.deepEqual(f.events.map(e => e.name), ['grab']);
});

test('soltar uma peça mantém drop com coordenadas e refresca apenas as ajudas', () => {
  const f = fixture();
  f.ctx.onPointerDown(f.pointer(540, 1800));
  f.ctx.dropSelected();
  assert.equal(f.state.selectedId, null);
  assert.equal(f.p.heldBy, null);
  const drop = f.events.find(e => e.name === 'drop');
  assert.ok(drop);
  assert.equal(drop.data.id, 0);
  assert.equal(drop.data.x, 500);
  assert.equal(drop.data.y, 1800);
  assert.ok(f.order.filter(x => x === 'refreshLamp').length >= 2);
});

test('Solo/Coop: arrasto reage em 5px nos tamanhos 6,12,20,30,48, mantém posição local', () => {
  for (const size of [6, 12, 20, 30, 48]) {
    const f = fixture(size);
    f.ctx.onPointerDown(f.pointer(540, 1800));
    f.ctx.onPointerMove(f.pointer(544, 1800));
    assert.equal(f.state.drag.moved, false, `4px ainda seleciona ${size}`);
    f.ctx.onPointerMove(f.pointer(546, 1800));
    assert.equal(f.state.drag.moved, true, `6px inicia arrasto ${size}`);
    assert.equal(f.p.tx, f.p.x, `posições sincronizadas ${size}`);
    assert.ok(f.order.includes('raf'), `quadros solicitados na interação ${size}`);
  }
});

test('Sala Desafio mantém 8px em 12/20/30/48 e 5px nas 6 peças', () => {
  for (const size of [6, 12, 20, 30, 48]) {
    const f = fixture(size, true);
    f.ctx.onPointerDown(f.pointer(540, 1800));
    f.ctx.onPointerMove(f.pointer(546, 1800));
    assert.equal(f.state.drag.moved, size === 6, `limiar do Desafio ${size}`);
    if (size !== 6) {
      f.ctx.onPointerMove(f.pointer(549, 1800));
      assert.equal(f.state.drag.moved, true);
    }
  }
});

test('arrasto atualiza posição a cada toque, mas limita emissão de rede a 50ms', () => {
  const f = fixture();
  f.ctx.onPointerDown(f.pointer(540, 1800));
  f.setTime(1000);
  f.ctx.onPointerMove(f.pointer(546, 1800));
  const x1 = f.p.x;
  f.setTime(1020);
  f.ctx.onPointerMove(f.pointer(559, 1800));
  assert.ok(f.p.x > x1, 'o desenho local avança mesmo sem envio à rede');
  assert.equal(f.events.filter(e => e.name === 'move').length, 1);
  f.setTime(1060);
  f.ctx.onPointerMove(f.pointer(565, 1800));
  assert.equal(f.events.filter(e => e.name === 'move').length, 2);
  assert.equal(f.events.filter(e => e.name === 'grab').length, 1);
});

test('quadro não se repete indefinidamente com dedo parado, mas desenha movimento novo', () => {
  const redraws = [], scheduled = [];
  const p = { id: 0, x: 500, y: 1800, tx: 500, ty: 1800, locked: false,
    vs: 1, zoomAbs: null, dirty: false, fly: null,
    el: { style: {} }, tag: null };
  const state = { cfg: { TILE: 320 }, pieces: [p], view: null,
    drag: { id: 0, moved: true }, inGame: true, status: 'playing', scale: 1 };
  const ctx = { state, Math, document: { hidden: false },
    lastTimerPaint: 1000, paintTimer: () => {},
    frameTimer: 0,
    targetScale: () => 1,
    paintTag: () => {},
    currentScreen: () => 'game',
    wakeFrame: () => redraws.push('raf'),
    setTimeout: (_, ms) => { scheduled.push(ms); return 1; },
    clamp: (x, a, b) => Math.max(a, Math.min(b, x)) };
  vm.runInNewContext(method('frame'), ctx, { filename: 'public/game.js:frame' });
  ctx.frame(1000);
  assert.equal(redraws.length, 0, 'sem RAF contínuo quando dedo para');
  assert.ok(scheduled.includes(250), 'relógio mantém atualização em repouso');
  p.x = p.tx = 518;
  p.dirty = true;
  ctx.frame(1016);
  assert.match(p.el.style.transform, /translate3d\(/, 'próximo movimento desenhado');
  assert.equal(redraws.length, 0, 'sem loop contínuo desnecessário');
});

test('nenhum novo evento do jogo, mudança de SNAP, pinça ou giros', () => {
  assert.match(game, /function startPinch\(/);
  assert.match(game, /function setZoom\(/);
  assert.match(game, /gameEmit\('drop', \{ id: p\.id, x: Math\.round\(p\.x\), y: Math\.round\(p\.y\) \}\)/);
  assert.match(game, /if \(state\.duel\) rotateSelected\(\)/);
  assert.match(game, /socket\.volatile\.emit\(state\.duel \? 'ch:move' : 'move'/);
});
