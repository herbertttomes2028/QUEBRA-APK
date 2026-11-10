"use strict";
// Quebrando Cabeças: a caixa mágica cospe as peças SOZINHA (largada e rodadas seguintes); ninguém toca nela.
// Sala Desafio: sem giro. Aqui: o cliente de verdade (funções do game.js executadas num ambiente simulado) e as regras do servidor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const game = read('public/game.js'), duel = read('challenge.js'), css = read('public/style.css');

function metodo(nome) {
  const ini = game.indexOf('  function ' + nome + '(');
  assert.ok(ini >= 0, nome + ' existe');
  const fim = game.indexOf('\n  function ', ini + 5);
  const fim2 = game.indexOf('\n  socket.on(', ini + 5);
  return game.slice(ini, Math.min(...[fim, fim2].filter((n) => n > ini)));
}
function carrega(nomes, ctx) { for (const n of nomes) vm.runInNewContext(metodo(n), ctx, { filename: 'game.js:' + n }); return ctx; }

// ambiente simulado do cliente: uma peça por id, relógio de mentira (timeouts guardados para disparar na mão)
function ambiente(phase) {
  const fila = []; const eventos = [];
  const pecas = [0, 1, 2, 3, 4, 5].map((id) => ({ id, out: false, locked: false, el: { style: { display: 'none' } }, tile: { style: {} }, x: 0, y: 0 }));
  const state = { duel: { phase, box: null, giftQ: [] }, pieces: pecas, zMax: 10 };
  const ctx = {
    state, setTimeout: (fn, ms) => { fila.push({ fn, ms }); return fila.length; }, toast: (m) => eventos.push('toast:' + m), playSound: (n) => eventos.push('som:' + n),
    updateGift: () => eventos.push('updateGift'), updateUi: () => {}, reducedMotion: () => true, setAngle: (p, r) => { p.rot = r; }, classify: () => {}, spinPiece: () => {},
    popEl: () => eventos.push('pop'), $: () => ({}), vibrate: () => {}, announce: () => {}, performance: { now: () => 0 }, console
  };
  return { ctx, fila, eventos, state, pecas };
}
const gift = (id, k, extra) => Object.assign({ id, x: 100 + id, y: 900, rot: 0, z: 50 + id, from: { x: 10, y: 20 }, box: { n: k + 1, max: 3, blocked: k === 2, left: 3 }, auto: true, k, delay: 700 + k * 190 }, extra || {});

test('cliente: peça cuspida ANTES do tabuleiro estar pronto não se perde (fica na fila) e é animada quando ele aparece', () => {
  const { ctx, fila, state, pecas, eventos } = ambiente('lobby');
  carrega(['applyGift', 'scheduleGift', 'flushGifts'], ctx);
  // a largada chegou, mas o tabuleiro ainda está sendo montado (fase != "game"): nada aparece, nada se perde
  ctx.applyGift(gift(0, 0, { start: true })); ctx.applyGift(gift(1, 1, { start: true })); ctx.applyGift(gift(2, 2, { start: true }));
  assert.equal(state.duel.giftQ.length, 3, 'as 3 peças esperam na fila');
  assert.ok(pecas.slice(0, 3).every((p) => p.out === false && p.el.style.display === 'none'), 'ainda não aparecem');
  // o tabuleiro ficou pronto: a fila é esvaziada e cada peça é agendada com o atraso do servidor
  state.duel.phase = 'game'; ctx.flushGifts();
  assert.equal(state.duel.giftQ.length, 0, 'fila vazia');
  assert.deepEqual(fila.map((f) => f.ms), [700, 890, 1080], 'uma depois da outra, a partir do momento em que o tabuleiro existe');
  assert.ok(eventos.some((e) => /^toast:.*cospe as peças sozinha/.test(e)), 'aviso da largada: a caixa cospe sozinha');
  assert.ok(!eventos.includes('som:chime'), 'na largada não toca o chime (já toca o TANNN)');
  fila.forEach((f) => f.fn());
  assert.ok(pecas.slice(0, 3).every((p) => p.out === true && p.el.style.display === '' && p.rot === 0), 'as 3 aparecem, orientadas');
  assert.deepEqual(state.duel.box, { n: 3, max: 3, blocked: true, left: 3 });
  assert.ok(pecas.slice(3).every((p) => p.out === false), 'as outras seguem dentro da caixa');
});

test('cliente: com o tabuleiro pronto, a peça aparece direto; peça de id desconhecido é ignorada sem erro; rodadas seguintes tocam o chime', () => {
  const { ctx, fila, state, pecas, eventos } = ambiente('game');
  carrega(['applyGift', 'scheduleGift', 'flushGifts'], ctx);
  ctx.applyGift(gift(3, 0)); assert.equal(pecas[3].out, true, 'fase "game": aplica na hora'); assert.equal(state.duel.giftQ.length, 0);
  ctx.applyGift(gift(99, 0)); assert.equal(state.duel.giftQ.length, 0, 'id inexistente não vai para a fila');
  ctx.scheduleGift(gift(4, 0)); assert.ok(eventos.includes('som:chime') && eventos.some((e) => /soltou as próximas peças/.test(e)), 'rodada seguinte: aviso e chime');
  assert.equal(fila.at(-1).ms, 700);
  ctx.flushGifts(); assert.equal(fila.length, 1, 'flushGifts sem fila não agenda nada');
});

test('cliente: ninguém toca na caixa. Ela não é botão, não tem balão "Toque!", não pede peça ao servidor e não "chama atenção"', () => {
  assert.doesNotMatch(game, /onGiftTap/); assert.doesNotMatch(game, /gameEmit\('gift'/); assert.doesNotMatch(game, /Toque!/);
  const bh = metodo('buildHand');
  assert.match(bh, /document\.createElement\('div'\)/); assert.match(bh, /setAttribute\('role', 'img'\)/); assert.doesNotMatch(bh, /createElement\('button'\)|\.type = 'button'|addEventListener\('click'/);
  assert.match(bh, /addEventListener\('pointerdown', function \(e\) \{ e\.stopPropagation\(\); \}\)/, 'o toque perto da caixa continua não soltando a peça escolhida');
  assert.doesNotMatch(bh, /setInterval/, 'sem o "balançar de vez em quando"');
  assert.doesNotMatch(css, /\.g-hint/); assert.match(css, /\.gift \{[^}]*cursor: default;/);
  assert.doesNotMatch(metodo('updateGift'), /toque para liberar/); assert.match(metodo('updateGift'), /ela cospe as peças sozinha/);
});

test('cliente: o evento de peça cuspida e a largada usam a fila; quem volta de uma queda recebe as peças no lugar (sem repetir a animação)', () => {
  assert.match(game, /socket\.on\('ch:gift', function \(g\) \{\s+var d = state\.duel;\s+if \(!d \|\| !g \|\| typeof g\.id !== 'number'\) return;\s+if \(d\.phase !== 'game'\) \{ \(d\.giftQ = d\.giftQ \|\| \[\]\)\.push\(g\); return; \}[^\n]*\n\s+scheduleGift\(g\);/);
  assert.match(game, /if \(resume\) d\.giftQ = \[\];/);
  assert.match(game, /if \(!resume\) flushGifts\(\);/);
  assert.match(game, /giftTimer: null, box: null, giftQ: \[\], /);
  assert.match(metodo('applyGift'), /if \(d\.phase !== 'game'\) \{ \(d\.giftQ = d\.giftQ \|\| \[\]\)\.push\(g\); return; \}/);
});

test('servidor: a largada do Quebrando Cabeças cospe a 1ª rodada sozinha (só nesse modo), com as marcas que o cliente espera', () => {
  const m = duel.slice(duel.indexOf('function spitFirstRound('), duel.indexOf('function finish('));
  assert.match(m, /for \(let i = 0; i < 2; i\+\+\)/, 'nos dois tabuleiros');
  assert.match(m, /k < BOX_MAX && board\.next < board\.order\.length/, 'até 3, sem passar das peças que existem');
  assert.match(m, /releaseNext\(room, i, board\)/); assert.match(m, /emitTo\(room, i, 'ch:gift', Object\.assign\(g, \{ auto: true, start: true, k, delay: START_FIRST_MS \+ k \* AUTO_STEP_MS \}\)\)/);
  assert.match(duel, /if \(room\.mode === 'quebra'\) spitFirstRound\(room\);/, 'só no Quebrando Cabeças');
  assert.match(duel, /const START_FIRST_MS = Number\(process\.env\.CH_START_FIRST_MS\) \|\| 700;/);
  const bm = duel.slice(duel.indexOf('function beginMatch('), duel.indexOf('function spitFirstRound('));
  assert.ok(bm.indexOf("'ch:start'") < bm.indexOf('spitFirstRound(room)'), 'o tabuleiro da largada é enviado ANTES de a caixa cuspir');
});

test('servidor: o pedido de peça por toque é recusado ("auto"); toda rodada completa cospe as próximas 3, sem depender de "rodada cheia"', () => {
  const h = duel.slice(duel.indexOf("socket.on('ch:gift'"), duel.indexOf("socket.on('ch:hint'"));
  assert.match(h, /error: 'auto'/); assert.doesNotMatch(h, /releaseNext\(/, 'o toque nunca solta peça');
  const t = duel.slice(duel.indexOf('function tryLock('), duel.indexOf('function releaseNext('));
  assert.doesNotMatch(t, /const full =/, 'a rodada não precisa mais ser "cheia"');
  assert.match(t, /if \(board\.next < board\.order\.length && room\.status === 'playing'\)/);
  assert.match(t, /for \(let k = 0; k < BOX_MAX && board\.next < board\.order\.length; k\+\+\)/);
  assert.match(t, /if \(p\.rot !== 0\) return false;/, 'a regra de encaixe não mudou');
});
