'use strict';
// Rodada inicio-sem-travar (17/11/2026), dois pedidos do proprietário:
//  1) Sala Desafio (sobretudo Quebrando Cabeças com 64, 88 e 96 peças): a partida travava ao começar e não começava igual nos dois celulares.
//     Causa: o tabuleiro inteiro era montado no celular NO INSTANTE da largada (ficava parado no "1"; o mais lento largava depois).
//     Agora o servidor manda o tabuleiro junto com a contagem e o celular monta por trás dela; na largada só tira a contagem da frente.
//  2) "Já tem um código?": depois de sair da partida, o código antigo continuava escrito (na Sala Desafio) e o convite não sumia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, startServer, client, wait } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const game = read('public/game.js'), duel = read('challenge.js');
const corpo = (src, ini, fim) => { const a = src.indexOf(ini); assert.ok(a >= 0, 'não achei ' + ini); const b = src.indexOf(fim, a + ini.length); return src.slice(a, b < 0 ? undefined : b); };
const semRelogio = (snap) => { const s = Object.assign({}, snap); delete s.elapsedMs; return JSON.stringify(s); };

let srv, cfgJson;
test.before(async () => { srv = await startServer({ CH_COUNTDOWN_MS: '1200', ROOM_CREATES_PER_10MIN: '100' }); cfgJson = await (await fetch(srv.url + '/api/config')).json(); });
test.after(async () => { await srv.stop(); });

async function sala(mode, pieces) {
  const a = await client(srv.url), b = await client(srv.url);
  const c1 = await a.emitAck('ch:create', { pid: 'pid-a-' + Math.random(), imageId: cfgJson.images[0].file, pieces, mode, name: 'Ana' });
  assert.ok(c1.ok, JSON.stringify(c1));
  const c2 = await b.emitAck('ch:join', { pid: 'pid-b-' + Math.random(), code: c1.lobby.code, name: 'Beto' });
  assert.ok(c2.ok, JSON.stringify(c2));
  assert.ok((await a.emitAck('ch:imgready', {})).ok);
  assert.ok((await b.emitAck('ch:imgready', {})).ok);
  return { a, b, code: c1.lobby.code };
}
const prontos = async (a, b) => { assert.ok((await a.emitAck('ch:ready', { ready: true })).ok); assert.ok((await b.emitAck('ch:ready', { ready: true })).ok); };

/* ======================= 1) servidor: o tabuleiro vai junto com a contagem ======================= */
for (const [mode, pieces] of [['quebra', 96], ['quebra', 64], ['comum', 96], ['quebra', 12]]) {
  test('servidor (' + mode + ', ' + pieces + ' peças): cada celular recebe o SEU tabuleiro na contagem, e a largada traz exatamente o mesmo', async () => {
    const { a, b } = await sala(mode, pieces);
    try {
      const ca = a.once_('ch:countdown', null, 4000), cb = b.once_('ch:countdown', null, 4000);
      const sa = a.once_('ch:start', null, 6000), sb = b.once_('ch:start', null, 6000);
      await prontos(a, b);
      const [kA, kB] = await Promise.all([ca, cb]);
      for (const k of [kA, kB]) {
        assert.equal(k.ms, 1200); assert.equal(k.match, 1);
        assert.ok(k.snapshot && Array.isArray(k.snapshot.pieces), 'a contagem traz o tabuleiro');
        assert.equal(k.snapshot.pieces.length, pieces);
        assert.equal(k.snapshot.mode, mode);
      }
      const [iA, iB] = await Promise.all([sa, sb]);
      assert.equal(semRelogio(iA.snapshot), semRelogio(kA.snapshot), 'a largada é o MESMO tabuleiro que o celular já montou (A)');
      assert.equal(semRelogio(iB.snapshot), semRelogio(kB.snapshot), 'a largada é o MESMO tabuleiro que o celular já montou (B)');
      if (mode === 'quebra') assert.equal(kA.snapshot.pieces.filter((p) => p.out).length, 0, 'Quebrando Cabeças: na contagem todas as peças ainda estão na caixa');
    } finally { a.close(); b.close(); }
  });
}

test('servidor: ninguém mexe nas peças durante a contagem (pegar, mover e soltar são ignorados)', async () => {
  const { a, b } = await sala('comum', 96);
  try {
    const ca = a.once_('ch:countdown', null, 4000);
    const sa = a.once_('ch:start', null, 6000);
    await prontos(a, b);
    const k = await ca;
    const p = k.snapshot.pieces.find((x) => x.out);
    let agarrou = false; a.on('grabbed', () => { agarrou = true; });
    a.emit('ch:grab', { id: p.id }); a.emit('ch:move', { id: p.id, x: p.x + 50, y: p.y + 50 }); a.emit('ch:drop', { id: p.id, x: p.x + 50, y: p.y + 50 });
    const ini = await sa;
    assert.equal(agarrou, false, 'nada é agarrado antes da largada');
    const q = ini.snapshot.pieces.find((x) => x.id === p.id);
    assert.deepEqual([q.x, q.y, q.heldBy], [p.x, p.y, null], 'a peça continua onde estava');
  } finally { a.close(); b.close(); }
});

test('servidor: contagem cancelada → a próxima contagem traz tabuleiros novos (match certo) e a largada continua batendo', async () => {
  const { a, b } = await sala('quebra', 96);
  try {
    const c1 = a.once_('ch:countdown', null, 4000), cancel = a.once_('ch:cancel', null, 4000);
    await prontos(a, b);
    await c1;
    assert.ok((await b.emitAck('ch:ready', { ready: false })) !== undefined);
    const why = await cancel; assert.equal(why.reason, 'unready');
    await wait(100);
    const c2 = a.once_('ch:countdown', null, 4000), s = a.once_('ch:start', null, 6000);
    assert.ok((await b.emitAck('ch:ready', { ready: true })).ok);
    const k2 = await c2, ini = await s;
    assert.equal(k2.match, 1, 'ainda é a 1ª partida');
    assert.equal(semRelogio(ini.snapshot), semRelogio(k2.snapshot), 'a largada traz o tabuleiro da contagem que valeu');
  } finally { a.close(); b.close(); }
});

test('servidor: revanche → a nova contagem também traz o tabuleiro (2ª partida) e a largada bate', async () => {
  const { a, b } = await sala('comum', 6);
  try {
    const sa = a.once_('ch:start', null, 6000);
    await prontos(a, b);
    const ini = (await sa).snapshot, cfg = ini.cfg;
    const fim = a.once_('ch:end', null, 6000);
    for (const p of ini.pieces) {                                     // A monta tudo e vence
      const x = cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y = cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2;
      a.emit('ch:grab', { id: p.id }); await a.once_('grabbed', (d) => d.id === p.id);
      const trava = a.once_('locked', (d) => d.id === p.id); a.emit('ch:drop', { id: p.id, x, y }); await trava;
    }
    await fim;
    const c2 = b.once_('ch:countdown', null, 4000), s2 = b.once_('ch:start', null, 6000);
    assert.ok((await a.emitAck('ch:rematch', { want: true })).ok);
    assert.ok((await b.emitAck('ch:rematch', { want: true })).ok);
    const k2 = await c2, i2 = await s2;
    assert.equal(k2.match, 2);
    assert.ok(k2.snapshot && k2.snapshot.pieces.length === 6 && k2.snapshot.locked === 0, 'tabuleiro novo, sem nada encaixado');
    assert.equal(semRelogio(i2.snapshot), semRelogio(k2.snapshot));
  } finally { a.close(); b.close(); }
});

test('servidor: o código da montagem antecipada (contagem monta, largada não monta de novo, cancelar descarta)', () => {
  const sc = corpo(duel, 'function startCountdown(room) {', 'function cancelCountdown(');
  assert.match(sc, /buildBoards\(room\);\s*\n\s*room\.prepared = true;/);
  assert.match(sc, /for \(let i = 0; i < 2; i\+\+\) emitTo\(room, i, 'ch:countdown', \{ ms: COUNTDOWN_MS, match: room\.match \+ 1, snapshot: boardSnapshot\(room, i\) \}\);/, 'cada um recebe só o PRÓPRIO tabuleiro');
  assert.match(corpo(duel, 'function cancelCountdown(', 'function beginMatch('), /room\.prepared = false;/);
  const bm = corpo(duel, 'function beginMatch(', 'function spitFirstRound(');
  assert.match(bm, /if \(!room\.prepared\) buildBoards\(room\);/);
  assert.ok(bm.indexOf("'ch:start'") < bm.indexOf('spitFirstRound(room)'), 'a caixa continua cuspindo só DEPOIS da largada');
});

/* ======================= 2) celular: monta por trás da contagem; na largada só revela ======================= */
test('celular: a contagem dispara a montagem antecipada; a largada reaproveita só se for o MESMO tabuleiro e já estiver pronto', () => {
  assert.match(game, /socket\.on\('ch:countdown', function \(c\) \{ showCountdown\(c\.ms\); if \(c && c\.snapshot\) prebuildDuel\(c\.snapshot\); \}\);/);
  const sd = corpo(game, 'function startDuelBoard(snap, resume) {', 'function mountDuelBoard(');
  assert.match(sd, /prep\.done && prep\.sig === duelSig\(snap\) && state\.imageUrl === url/, 'reaproveita só o tabuleiro igual e já montado');
  assert.match(sd, /setTimeout\(r, 2500\)/, 'espera a montagem no máximo 2,5 s; depois monta como antes');
  assert.match(sd, /else mountDuelBoard\(snap, url, resume, true\);/, 'sem montagem antecipada: exatamente o caminho de antes');
  assert.match(sd, /hideCountdown\(true\)/); assert.match(sd, /flushGifts\(\)/);
  const mt = corpo(game, 'function mountDuelBoard(', 'function paintStrip(');
  assert.match(mt, /else state\.status = 'countdown';/, 'antes da largada o status não é "playing" (ninguém mexe nas peças)');
  assert.match(mt, /if \(largada\) state\.inGame = true;/);
  assert.match(game, /if \(state\.duel && state\.status !== 'playing'\) return;/, 'o toque nas peças continua bloqueado antes da largada');
  const pa = corpo(game, 'function prebuildArts(', 'function startDuelBoard(');
  assert.match(pa, /performance\.now\(\) - t0 < 10/, 'as peças são desenhadas em pedaços de ~10 ms');
  assert.match(pa, /setTimeout\(fatia, 0\)/);
  assert.match(game, /tile\.appendChild\(prebuiltArt\(d, cfg\) \|\| pieceArt\(d\.col, d\.row, cfg, d\.id\)\);/);
  assert.match(corpo(game, 'function prebuiltArt(', '\n  }'), /a\.col !== d\.col \|\| a\.row !== d\.row/, 'peça adiantada só vale para a MESMA casa');
  assert.match(corpo(game, "socket.on('ch:cancel'", '});'), /d\.prep = null;/, 'contagem cancelada descarta a montagem antecipada');
});

/* ======================= 3) "Já tem um código?" fica livre depois de entrar (e, portanto, ao sair) ======================= */
test('"Já tem um código?": ao ENTRAR numa sala (cooperativa ou Desafio) o código sai do campo e o convite some; código errado fica para corrigir', () => {
  const cj = corpo(game, 'function clearJoinBox() {', '\n  }');
  for (const s of ["ic.value = '';", "ic.parentNode.classList.remove('ready');", "$('#home-invite').hidden = true;", "$('#cta-row').hidden = false;", "$('#btn-join').classList.add('btn-secondary');"]) assert.ok(cj.includes(s), s);
  assert.match(corpo(game, 'function enterRoom(res) {', '\n  }'), /^function enterRoom\(res\) \{\n\s+clearJoinBox\(\);/);
  assert.match(corpo(game, 'function enterDuel(res) {', 'prepareDuelImage();'), /^function enterDuel\(res\) \{\n\s+clearJoinBox\(\);/);
  const dj = corpo(game, 'function doJoin(code) {', '/* "Já tem um código?"');
  assert.ok(!dj.includes('clearJoinBox'), 'quando a sala não abre, o código continua no campo');
});
