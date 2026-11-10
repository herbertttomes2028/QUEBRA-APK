'use strict';
// Regressões das duas alterações, sem precisar de banco ou rede real.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const game = read('public/game.js');
const server = read('server.js');
const duel = read('challenge.js');
const html = read('public/index.html');
const css = read('public/style.css');

function method(src, name) {
  const start = src.indexOf('  function ' + name + '(');
  assert.ok(start >= 0, `${name} encontrado`);
  const end = src.indexOf('\n  function ', start + 5);
  assert.ok(end > start, `${name} delimitado`);
  return src.slice(start, end);
}
function evaluateMethods(names, ctx) {
  for (const name of names) vm.runInNewContext(method(game, name), ctx, { filename: 'game.js:' + name });
}

test('peças normais nascem orientadas; a Sala Desafio também (o servidor da disputa zera o giro)', () => {
  const source = server.slice(server.indexOf('function buildPieces('), server.indexOf('\nfunction createRoom(', server.indexOf('function buildPieces(')));
  assert.ok(source.startsWith('function buildPieces('));
  const ctx = {
    shuffle: x => x, rnd: (_, b) => b, clamp: (x, a, b) => Math.max(a, Math.min(b, x)),
    Math, Number
  };
  vm.runInNewContext(source, ctx);
  const cfg = { COLS: 2, ROWS: 3, FIELD_W: 1000, FIELD_H: 1900,
    PER_ROW: 4, TRAY_ROWS: 2, TRAY_TOP: 1300, TRAY: 240, ROW_GAP: 10 };
  const coop = ctx.buildPieces(cfg, true);
  const challenge = ctx.buildPieces(cfg);
  assert.equal(coop.length, 6);
  assert.ok(coop.every(p => p.rot === 0 && p.locked === false));
  assert.ok(challenge.every(p => p.rot === 3), 'a função compartilhada não mudou; a Sala Desafio zera o giro depois (challenge.js)');
  assert.match(server, /pieces: buildPieces\(cfg, true\)/);
  assert.match(server, /room\.pieces = buildPieces\(room\.cfg, true\)/);
  assert.match(duel, /buildPieces\(cfg\)\.map\(\(p\) => \(\{ id: p\.id, col: p\.col, row: p\.row, x: p\.x, y: p\.y, rot: 0, out: true \}\)\)/, 'modo comum da Sala Desafio: tudo orientado');
  assert.match(duel, /rot: 0, out: false/, 'Quebrando Cabeças: peças orientadas');
});

test('servidor do Solo/Cooperativo não permite que cliente antigo mude a rotação', () => {
  const start = server.indexOf("socket.on('rotate', (data) => {");
  const end = server.indexOf("socket.on('drop', (data) => {", start);
  assert.ok(start > 0 && end > start);
  const handler = server.slice(start, end);
  assert.match(handler, /p\.rot = 0;/);
  assert.doesNotMatch(handler, /p\.rot = \(p\.rot \+ 1\) % 4/);
  assert.doesNotMatch(handler, /tryLock\(/, 'pacotes velhos não encaixam peça sem arrastar e soltar');
  assert.match(duel, /socket\.on\('ch:rotate', \(\) => \{\}\);/, 'a disputa aceita o evento antigo e o ignora');
  assert.doesNotMatch(duel, /p\.rot = \(p\.rot \+ 1\) % 4/);
});

test('pacote Socket.IO rotate legado devolve rot=0, sem girar ou encaixar', () => {
  const start = server.indexOf("socket.on('rotate', (data) => {");
  const end = server.indexOf("socket.on('drop', (data) => {", start);
  const handler = server.slice(start, end);
  assert.ok(start > 0 && end > start);
  const piece = { id: 2, rot: 0, rotUsed: 0, heldBy: 0, locked: false };
  const messages = [];
  const handlers = {};
  const socket = { on: (name, cb) => { handlers[name] = cb; } };
  const ctx = {
    socket, ctx: () => ({ room: { code: 'ABC123' }, idx: 0 }),
    pieceFrom: () => piece,
    io: { to: code => ({ emit: (name, payload) => messages.push({ code, name, payload }) }) },
  };
  vm.runInNewContext(handler, ctx);
  assert.equal(typeof handlers.rotate, 'function');
  handlers.rotate({ id: 2 });
  assert.equal(piece.rot, 0);
  assert.equal(messages.length, 1);
  assert.equal(messages[0].name, 'rotated');
  assert.equal(messages[0].payload.rot, 0);
  assert.equal(messages.some(m => m.name === 'locked'), false);
});

test('em nenhum modo o cliente gira: tocar de novo na peça escolhida apenas a solta (Solo, Cooperativo e Sala Desafio)', () => {
  const events = [];
  const p = { id: 0, locked: false, rot: 0, rotUsed: 0, dirty: false };
  const state = { selectedId: 0, pieces: [p], duel: null, drag: null };
  const ctx = {
    state, setAngle: (piece, rot) => { piece.rot = rot; },
    gameEmit: (name, payload) => events.push({ name, payload }),
    vibrate: () => {}, resetIdle: () => {}, updateUi: () => {}, refreshLamp: () => {},
    dropSelected: () => events.push({ name: 'drop' }),
  };
  evaluateMethods(['endPointer'], ctx);
  assert.equal(typeof ctx.rotateSelected, 'undefined', 'a função de girar não existe mais');
  for (const duel of [null, { mode: 'comum' }, { mode: 'quebra' }]) {
    events.length = 0; state.duel = duel;
    state.drag = { pointerId: 1, id: 0, wasSelected: true, moved: false };
    ctx.endPointer({ pointerId: 1 }, false);
    assert.deepEqual(events.map((e) => e.name), ['drop'], 'segundo toque apenas solta (modo ' + (duel ? duel.mode : 'solo/coop') + ')');
    assert.equal(p.rot, 0, 'a peça nunca muda de orientação');
  }
});

test('sem etiqueta de giro e sem o ▲ de "lado de cima" em nenhum modo', () => {
  const p = { mine: true, theirs: false, heldBy: 0,
    tag: { textContent: '', classList: { toggle() {} } } };
  const state = { duel: null };
  const ctx = { state, displayName: () => 'Amigo' };
  evaluateMethods(['paintLabel'], ctx);
  for (const duel of [null, { mode: 'comum' }, { mode: 'quebra' }]) { state.duel = duel; p.tag.textContent = 'x'; ctx.paintLabel(p); assert.equal(p.tag.textContent, '', 'a peça escolhida não leva etiqueta de giro'); }
  assert.match(css, /\.piece\.mine \.tag:empty \{ display: none; \}/);
  assert.doesNotMatch(game, /classList\.toggle\('rotation-enabled'/, 'o ▲ não é mais ligado na Sala Desafio');
  assert.match(game, /classList\.remove\('rotation-enabled'\)/);
  assert.match(css, /#screen-game:not\(\.rotation-enabled\) \.puzzle-orientation \{ display: none; \}/);
});

test('lâmpada e marcador ficam sempre em botões diferentes e contadores próprios', () => {
  assert.match(html, /class="hud-hints"[^>]*>[\s\S]*?id="btn-hint"[\s\S]*?id="btn-spot"/);
  assert.match(html, /id="hint-badge"[^>]*>10</);
  assert.match(html, /id="spot-badge"[^>]*>5</);
  assert.match(game, /\$\('#btn-hint'\)\.addEventListener\('click', useHint\)/);
  assert.match(game, /\$\('#btn-spot'\)\.addEventListener\('click', useSpot\)/);
  assert.doesNotMatch(game, /function useLamp\(/);
  const state = { selectedId: null, pieces: [{ locked: false }], hints: 10, spots: 5,
    hintActive: false, spotActive: false };
  const controls = Object.fromEntries(['#btn-hint','#btn-spot','#hint-badge','#spot-badge'].map(key =>
    [key, { disabled: false, textContent: '', attrs: {}, setAttribute(n,v) { this.attrs[n]=v; } }]));
  const ctx = { state, $: key => controls[key] };
  evaluateMethods(['refreshLamp'], ctx);
  ctx.refreshLamp();
  assert.equal(controls['#btn-hint'].disabled, false);
  assert.equal(controls['#btn-spot'].disabled, true, 'antes de selecionar, marcador visível mas indisponível');
  assert.equal(controls['#hint-badge'].textContent, 10);
  assert.equal(controls['#spot-badge'].textContent, 5);
  state.selectedId = 0; state.spots = 3; state.hintActive = true;
  ctx.refreshLamp();
  assert.equal(controls['#btn-hint'].disabled, true, 'lâmpada acesa temporariamente bloqueada');
  assert.equal(controls['#btn-spot'].disabled, false, 'marcador independente da lâmpada');
  assert.equal(controls['#hint-badge'].textContent, 10);
  assert.equal(controls['#spot-badge'].textContent, 3);
  state.spotActive = true; state.hintActive = false;
  ctx.refreshLamp();
  assert.equal(controls['#btn-hint'].disabled, false, 'lâmpada independente do marcador ativo');
  assert.equal(controls['#btn-spot'].disabled, true);
});

test('ativação visual das duas ajudas não interfere na outra', () => {
  const gameSpot = game.slice(game.indexOf('  function clearSpot()'), game.indexOf('  function useSpot()'));
  const gameHint = game.slice(game.indexOf('  function showHint()'), game.indexOf('  function closeHint()'));
  assert.match(gameSpot, /\$\('#btn-spot'\)\.classList\.add\('lit'\)/);
  assert.match(gameSpot, /\$\('#btn-spot'\)\.classList\.remove\('lit'\)/);
  assert.doesNotMatch(gameSpot, /\$\('#btn-hint'\)\.classList/);
  assert.match(gameHint, /\$\('#btn-hint'\)\.classList\.add\('lit'\)/);
  assert.match(css, /\.hud-hints\s*\{\s*display: flex;/);
  assert.match(css, /#screen-game\.done \.hud-hints\s*\{\s*display: none;/);
});

test('tutorial sem o passo de girar em nenhum modo, e ainda explica as duas ajudas', () => {
  const state = { duel: null };
  const ctx = { state, tut: { i: 0 } };
  evaluateMethods(['tutSteps', 'nextTutStep'], ctx);
  for (const duel of [null, { mode: 'comum' }, { mode: 'quebra' }]) {
    state.duel = duel;
    assert.deepEqual(Array.from(ctx.tutSteps()), [0, 2, 3], 'arrastar, zoom e ajudas');
    ctx.tut.i = 0; assert.equal(ctx.nextTutStep(1), 2, 'do primeiro passo vai direto ao zoom');
  }
  assert.match(game, /b\.hidden = Number\(b\.getAttribute\('data-i'\)\) === 1/);
  assert.doesNotMatch(game, /toque nela de novo para girar/);
  assert.ok(!html.includes('data-scene="1"') && !html.includes('data-i="1"'), 'a cena e a bolinha do passo de girar saíram do HTML');
  assert.match(game, /Os dois botões ficam lado a lado/);
});

test('animação de encaixe, SNAP, Socket.IO e zoom por pinça continuam intactos', () => {
  assert.match(server, /if \(p\.rot !== 0\) return false;/);
  assert.match(duel, /if \(p\.rot !== 0\) return false;/);
  assert.match(game, /function startPinch\(/);
  assert.match(game, /function setZoom\(/);
  assert.match(game, /function useSpot\(/);
  assert.match(game, /function useHint\(/);
  assert.match(game, /gameEmit\('drop'/);
  assert.match(game, /gameEmit\('spot'/);
  assert.match(game, /gameEmit\('hint'/);
});
