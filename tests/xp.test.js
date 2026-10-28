'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const xp = require('../xp');

test('curva de níveis confere com o XP.md', () => {
  assert.equal(xp.needFor(1), 50);
  assert.equal(xp.needFor(2), 125);
  assert.equal(xp.needFor(10), 1000);
  assert.equal(xp.CUM[2], 50);
  assert.equal(xp.CUM[10], 3850);
  assert.equal(xp.CUM[20], 20155);
  assert.equal(xp.CUM[50], 171730);
  assert.equal(xp.CUM[99], 835880);
  assert.equal(xp.MAX_LEVEL, 100);
});

test('levelFromXp e progress: limites, valores inválidos e nível máximo', () => {
  assert.equal(xp.levelFromXp(0), 1);
  assert.equal(xp.levelFromXp(49), 1);
  assert.equal(xp.levelFromXp(50), 2);
  assert.equal(xp.levelFromXp(3849), 9);
  assert.equal(xp.levelFromXp(3850), 10);
  assert.equal(xp.levelFromXp(-5), 1);
  assert.equal(xp.levelFromXp('abc'), 1);
  assert.equal(xp.levelFromXp(1e12), 100);
  const p = xp.progress(60);
  assert.deepEqual([p.level, p.into, p.need, p.pct, p.max], [2, 10, 125, 8, false]);
  assert.equal(xp.progress(1e12).max, true);
  for (let L = 1; L < 99; L++) assert.ok(xp.CUM[L + 1] > xp.CUM[L], 'CUM crescente em ' + L);
});

test('XP por conclusão segue as faixas de peças', () => {
  const casos = { 6: 20, 12: 45, 20: 80, 30: 130, 48: 220, 60: 300 };
  for (const [pecas, base] of Object.entries(casos)) assert.equal(xp.baseXp(Number(pecas)), base, pecas + ' peças');
  const minimos = { 6: 8000, 12: 15000, 20: 25000, 30: 40000, 48: 60000, 60: 90000 };
  for (const [pecas, ms] of Object.entries(minimos)) assert.equal(xp.minMs(Number(pecas)), ms, 'mínimo ' + pecas);
});

test('repetição reduz mas nunca zera', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 50].map(xp.repFactor), [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.25, 0.25, 0.25]);
  assert.equal(xp.repFactor(-3), 1);
  const r = xp.matchReward({ pieces: 6, completed: true, clears: 50, elapsedMs: 20000 });
  assert.ok(r.parts.completion >= 1);
});

test('puzzleKey: imagens próprias do mesmo tamanho contam como um só', () => {
  assert.equal(xp.puzzleKey('Foto A', 12, true), xp.puzzleKey('Outra', 12, true));
  assert.notEqual(xp.puzzleKey('Foto A', 12, true), xp.puzzleKey('Foto A', 20, true));
  assert.equal(xp.puzzleKey('  Stitch   e Angel ', 12, false), xp.puzzleKey('stitch e angel', 12, false));
  assert.notEqual(xp.puzzleKey('Stitch', 12, false), xp.puzzleKey('Stitch', 20, false));
});

test('matchReward: exemplos da tabela do XP.md', () => {
  const m = (o) => xp.matchReward(Object.assign({ pieces: 12, completed: true, elapsedMs: 60000 }, o));
  assert.equal(m({}).total, 45);
  assert.equal(m({ clears: 1 }).total, 36);
  assert.equal(m({ clears: 2 }).total, 29);
  assert.equal(m({ clears: 3 }).total, 23);   // 45*0,5 = 22,5 -> 23
  assert.equal(m({ clears: 6 }).total, 11);
  assert.equal(m({ custom: true }).total, 27);
  assert.equal(xp.matchReward({ pieces: 48, completed: true, elapsedMs: 90000, clears: 0 }).total, 220);
});

test('matchReward: tempo mínimo, incompleto e participação', () => {
  const rapido = xp.matchReward({ pieces: 12, completed: true, elapsedMs: 14999 });
  assert.equal(rapido.earnedCompletion, false);
  assert.equal(rapido.total, 0);
  assert.equal(xp.matchReward({ pieces: 12, completed: false, elapsedMs: 60000 }).total, 0);
  const so = xp.matchReward({ pieces: 12, completed: false, humans: true, gameMs: 60000, partCount: 0 });
  assert.deepEqual(so.parts, { completion: 0, friend: 0, win: 0, participation: 10 });
  assert.equal(xp.matchReward({ pieces: 12, completed: false, humans: true, gameMs: 60000, partCount: 10 }).total, 0);
  assert.equal(xp.matchReward({ pieces: 12, completed: false, humans: true, gameMs: 1000, partCount: 0 }).total, 0);
});

test('matchReward: bônus de amigo e de vitória respeitam os limites do dia', () => {
  const base = { pieces: 12, completed: true, elapsedMs: 60000, humans: true, gameMs: 60000, partCount: 0 };
  assert.equal(xp.matchReward(Object.assign({}, base, { friend: true })).parts.friend, 11);   // 25% de 45
  assert.equal(xp.matchReward(Object.assign({}, base, { friend: true, pairFriend: 3 })).parts.friend, 11);
  assert.equal(xp.matchReward(Object.assign({}, base, { friend: true, pairFriend: 4 })).parts.friend, 0);
  assert.equal(xp.matchReward(Object.assign({}, base, { won: true })).parts.win, 14);          // 30% de 45
  assert.equal(xp.matchReward(Object.assign({}, base, { won: true, pairWin: 3 })).parts.win, 0);
  assert.equal(xp.matchReward(Object.assign({}, base, { won: true, humans: false })).parts.win, 0);
  assert.equal(xp.matchReward(Object.assign({}, base, { won: true, completed: false })).parts.win, 0);   // vencer sem concluir não paga
});

test('conquistas: 10 valores, todos positivos', () => {
  const ks = Object.keys(xp.ACH_XP);
  assert.equal(ks.length, 10);
  for (const k of ks) assert.ok(xp.ACH_XP[k] > 0, k);
});
