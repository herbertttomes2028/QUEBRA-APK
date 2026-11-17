'use strict';
// Rodada tempos-historico (17/11/2026), pedidos do proprietário:
//  1) Escolha da imagem: o melhor tempo DA IMAGEM, NA QUANTIDADE escolhida, em destaque logo abaixo do nome; saem o tamanho da grade
//     ("6 peças (2 × 3)") e os textos das regras ("Ímã mais forte...", "Peças grandes...", "melhor para telas grandes").
//  2) Minhas partidas: 10 (eram 6); tocar numa abre o card da imagem com o melhor tempo e as recompensas (XP e gemas).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const game = read('public/game.js'), conta = read('public/conta.js'), html = read('public/index.html'), css = read('public/style.css'), acc = read('accounts.js');
const corpo = (src, ini, fim) => { const a = src.indexOf(ini); assert.ok(a >= 0, 'não achei ' + ini); const b = src.indexOf(fim, a + ini.length); return src.slice(a, b < 0 ? undefined : b); };
const { matchRewards } = require('../accounts');

/* ======================= 1) escolha da imagem ======================= */
test('escolha: o painel mostra SÓ o melhor tempo da quantidade escolhida, em destaque e acima das quantidades', () => {
  const f = corpo(game, 'function updateSizeNote() {', '\n  }\n');
  for (const s of ['Ímã mais forte', 'lâmpada sem limite', 'Peças grandes', 'telas grandes', "' × '", 'p.cols', 'p.rows']) assert.ok(!f.includes(s), 'saiu: ' + s);
  assert.match(f, /bestFor\(state\.pickChoice, p\.pieces\)/, 'o tempo é o da imagem escolhida na quantidade escolhida');
  assert.match(f, /'Seu melhor tempo'/); assert.match(f, /'Ainda sem tempo'/); assert.match(f, /'com ' \+ p\.pieces \+ ' peças'/);
  assert.ok(!/innerHTML/.test(f), 'só textContent');
  const sheet = corpo(html, 'id="pick-sheet"', '</div>\n    </section>');
  assert.ok(sheet.indexOf('id="size-note"') > sheet.indexOf('class="ps-head"') && sheet.indexOf('id="size-note"') < sheet.indexOf('id="size-grid"'), 'o tempo fica logo abaixo do nome, antes das quantidades');
  assert.match(css, /\.pick-sheet \.size-note\.tem \{ background: var\(--sun\); color: var\(--on-sun\);/, 'destaque amarelo do jogo quando há tempo');
  assert.match(css, /\.psb-time \{ flex: none; font: 700 1\.65rem\/1 "Fredoka"/);
  // a ordem de antes continua (testes de aquecimento do recorte): updateSizeNote e logo depois warmPick
  assert.match(game, /updateSizeNote\(\);\n    warmPick\(\);\n    \$\('#pick-sheet'\)\.hidden = false;/);
});

test('escolha: o "melhor" é o menor entre o do aparelho e o das partidas concluídas do perfil (o mesmo número no card do histórico)', () => {
  const vm = require('node:vm');
  const src = corpo(game, '  var serverBests = {};', '  function imageByLabel(');
  const ctx = { state: { bests: { 'a.jpg|6': 45000, 'a.jpg|12': 'x', 'b.jpg|6': 30000 } }, imageItem: (f) => ({ file: f, label: { 'a.jpg': 'Onça', 'b.jpg': 'Arara' }[f] || f }), isFinite };
  vm.runInNewContext(src + '\nthis.bestFor = bestFor; this.set = function (m) { serverBests = m; };', ctx);
  assert.equal(ctx.bestFor('a.jpg', 6), 45000, 'só o do aparelho');
  ctx.set({ 'Onça|6': 41000, 'Onça|12': 88000, 'Arara|6': 99000 });
  assert.equal(ctx.bestFor('a.jpg', 6), 41000, 'o do perfil é menor');
  assert.equal(ctx.bestFor('a.jpg', 12), 88000, 'só o do perfil (o do aparelho é inválido)');
  assert.equal(ctx.bestFor('b.jpg', 6), 30000, 'o do aparelho é menor');
  assert.equal(ctx.bestFor('a.jpg', 96), null, 'sem tempo');
  assert.match(game, /fmtTime: fmtTime, bestFor: bestFor, imageByLabel: imageByLabel,/);
  assert.match(conta, /if \(name === 'pick'\) loadBests\(\);/, 'os tempos do perfil chegam quando a tela de escolha abre');
  assert.match(conta, /if \(QC\.setServerBests\) QC\.setServerBests\(\{\}\);/, 'sair do perfil limpa os tempos do perfil');
});

/* ======================= 2) histórico: 10 partidas e o card da imagem ======================= */
test('histórico: 10 partidas; cada linha é um botão com a miniatura da imagem; tocar abre o card', () => {
  assert.match(acc, /const HISTORY_MAX = 10;/);
  const lh = corpo(conta, 'function loadHistory() {', '  // o card da imagem');
  assert.match(lh, /el\('button', 'fr-row hi-row'\)/);
  assert.match(lh, /r\.addEventListener\('click', function \(\) \{ openHistCard\(m\); \}\);/);
  assert.ok(!/innerHTML/.test(lh), 'só textContent');
  for (const id of ['modal-hist', 'hc-art', 'hc-title', 'hc-tags', 'hc-best', 'hc-best-time', 'hc-best-now', 'hc-others', 'hc-rw-now-xp', 'hc-rw-now-gems', 'hc-rw-all-xp', 'hc-rw-all-gems', 'hc-rw-plays'])
    assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /<div id="modal-hist" class="modal" hidden role="dialog" aria-modal="true" aria-labelledby="hc-title">/);
  assert.match(html, /<button class="sheet-x" type="button" data-back aria-label="Fechar">✕<\/button>\n        <div id="hc-art"/, 'fecha pelo X e pelo voltar do Android');
  const card = corpo(conta, 'function openHistCard(m) {', '  /* ---------- melhores tempos do perfil');
  assert.ok(!/innerHTML/.test(card), 'só textContent');
  assert.match(card, /QC\.bestFor\(item\.file, n\)/, 'o mesmo melhor tempo da tela de escolha');
  assert.match(card, /QC\.openModal\('#modal-hist', '\.sheet-x'\);/);
  // régua do jogo: janela com canto --r-janela, caixas --r-caixa + --caixa-sombra, destaque amarelo, título t2
  assert.match(css, /\.sheet\.hist-card \{ border-radius: var\(--r-janela\);/);
  assert.match(css, /\.hc-box \{[^}]*border-radius: var\(--r-caixa\); background: var\(--caixa-fundo\); box-shadow: var\(--caixa-sombra\);/);
  assert.match(css, /\.hc-best\.tem \{ background: var\(--sun\); color: var\(--on-sun\);/);
});

test('histórico: cada partida fica com o XP da SUA concessão (mesma imagem e peças, gravada logo depois; uma concessão por partida)', () => {
  const t = (s) => new Date(Date.UTC(2026, 10, 17, 12, 0, 0) + Math.round(s * 1000)).toISOString();
  const ms = [
    { imageLabel: 'Onça', pieces: 6, at: t(30) },            // mais nova
    { imageLabel: 'Onça', pieces: 6, at: t(20) },            // mesma imagem e peças, 10 s antes: sem concessão (ex.: tempo abaixo do mínimo)
    { imageLabel: 'Arara', pieces: 12, at: t(10) },
    { imageLabel: 'Onça', pieces: 12, at: t(0) }
  ];
  const ev = [
    { label: 'Onça', pieces: '12', amount: 70, gems: 4, created_at: t(0.2) },
    { label: 'Arara', pieces: '12', amount: 90, gems: 15, created_at: t(10.1) },
    { label: 'Onça', pieces: '6', amount: 60, gems: 3, created_at: t(30.1) },
    { label: 'Onça', pieces: '6', amount: 999, gems: 999, created_at: t(50) }      // depois da janela de 5 s: de outra partida (não listada)
  ];
  const r = matchRewards(ms, ev);
  assert.deepEqual(r.map((m) => [m.xp, m.gems]), [[60, 3], [0, 0], [90, 15], [70, 4]]);
  assert.equal(r[0].imageLabel, 'Onça', 'os campos da partida continuam');
  assert.deepEqual(matchRewards([{ imageLabel: 'X', pieces: 6, at: t(0) }], [{ label: 'X', pieces: '12', amount: 5, gems: 1, created_at: t(0.1) }]).map((m) => m.xp), [0], 'peças diferentes: não é dela');
  // partidas da mesma imagem em sequência rápida: cada uma fica com a concessão logo depois dela
  const ms2 = [3, 2, 1, 0].map((k) => ({ imageLabel: 'X', pieces: 6, at: t(k * 0.2) }));
  const ev2 = [0, 1, 2, 3].map((k) => ({ label: 'X', pieces: '6', amount: 10 + k, gems: k, created_at: t(k * 0.2 + 0.05) }));
  assert.deepEqual(matchRewards(ms2, ev2).map((m) => m.xp), [13, 12, 11, 10]);
});

/* ======================= 3) banco de verdade (local): o caminho real de gravação e as rotas ======================= */
test('PostgreSQL: fim de partida real → /matches (10, com XP e gemas de cada uma e totais da imagem) e /bests; só do dono', { skip: process.env.GEMAS_TEST_DB !== '1' }, async () => {
  const connection = process.env.DATABASE_URL || '';
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg');
  const library = require('../library'), gemm = require('../gems');
  const { createAccounts } = require('../accounts');
  const schema = 't_hist_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: connection, ssl: false, max: 4, options: `-c search_path=${schema}` });
  const db = { q: (s, p) => pool.query(s, p), pool };
  const q = (s, p) => pool.query(s, p);
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  try {
    const dir = path.join(__dirname, '..', 'migrations');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await q(fs.readFileSync(path.join(dir, f), 'utf8'));
    const mkUser = async (name, code) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded) VALUES ($1, $2, $3, 0, true) RETURNING id', [name + '@t.test', name, code])).rows[0].id;
    const mkSession = async (uid) => { const t = 'tok-' + crypto.randomBytes(8).toString('hex'); await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [sha(t), uid]); return t; };
    const fauna = library.ALL.filter((i) => i.categoryId === 'fauna'), labelOf = (f) => (library.ALL.find((i) => i.file === f) || {}).label || f;
    const io = new (require('node:events').EventEmitter)(); io.sockets = { sockets: new Map() }; io.to = () => ({ emit() {} });
    const routes = {}; const router = { get(p, ...h) { routes['GET ' + p] = h; return router; }, post(p, ...h) { routes['POST ' + p] = h; return router; }, use() { return router; } };
    const app = { use() {} }; const express = { Router: () => router, json: () => (_, __, next) => next() };
    const accounts = createAccounts({ app, express, io, db, cleanName: (n) => n, cleanAvatar: (a) => a, roomInfo: () => null, roomOfSocket: () => null, imageLabel: labelOf,
      getUpload: () => null, putUpload: () => null, onAuth: () => {}, mailer: null, peerOf: () => null, elapsedOf: (room) => room.elapsed });
    const call = (route, token) => new Promise((resolve) => {
      const req = { get: (h) => (h.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : ''), query: {}, body: {}, method: 'GET', path: route };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() {}, json(x) { resolve({ status: this.statusCode, body: x }); } };
      const h = routes['GET ' + route]; h[0](req, res, () => h[1](req, res));
    });
    const P = await mkUser('Paula', 'PPPPPPP2'), O = await mkUser('Otto', 'OOOOOOO3');
    const tP = await mkSession(P), tO = await mkSession(O);
    // 11 partidas de verdade (Sozinho, caminho real: grava a partida e paga XP/gemas), mais novas por último; e 1 de outra pessoa
    const plan = [[0, 6, 30000], [0, 12, 70000], [1, 6, 20000], [0, 6, 25000], [2, 20, 120000], [0, 96, 1300000], [1, 12, 50000], [0, 6, 28000], [2, 6, 22000], [0, 30, 300000], [0, 6, 26000]];
    for (let i = 0; i < plan.length; i++) {
      const [k, n, el] = plan[i];
      await accounts.finishCoop({ solo: true, players: [{ uid: P }], imageId: fauna[k].file, pieces: new Array(n).fill(0), code: 'H' + i, startedAt: 1700000000000 + i, elapsed: el });
    }
    await accounts.finishCoop({ solo: true, players: [{ uid: O }], imageId: fauna[0].file, pieces: new Array(6).fill(0), code: 'OTTO', startedAt: 1700000009999, elapsed: 9000 });
    // "partida fantasma" antiga de Paula (6 peças em 3 s, abaixo do mínimo de 8 s): não pode virar melhor tempo
    await q("INSERT INTO matches (user_id, mode, image_label, pieces, result, completed, duration_ms, created_at) VALUES ($1, 'solo', $2, 6, 'done', true, 3000, now() - interval '30 days')", [P, labelOf(fauna[0].file)]);
    const r = await call('/matches', tP);
    assert.equal(r.status, 200); assert.equal(r.body.ok, true);
    const ms = r.body.matches;
    assert.equal(ms.length, 10, 'as 10 mais recentes (eram 6)');
    assert.deepEqual(ms.map((m) => m.pieces), plan.slice(1).reverse().map((p) => p[1]), 'mais nova primeiro');
    // cada partida com o XP e as gemas que o banco registrou para ELA
    const xpRows = (await q("SELECT amount, ref FROM xp_events WHERE user_id = $1 AND kind = 'match' ORDER BY created_at DESC, id DESC", [P])).rows;
    assert.equal(xpRows.length, 11, 'todas pagaram XP (tempos acima do mínimo)');
    for (let i = 0; i < 10; i++) {
      const g = (await q("SELECT COALESCE(sum(amount), 0)::int AS g FROM gem_events WHERE user_id = $1 AND (ref = $2 OR (kind = 'level' AND created_at = (SELECT created_at FROM xp_events WHERE user_id = $1 AND ref = $3)))", [P, 'match:' + xpRows[i].ref, xpRows[i].ref])).rows[0].g;
      assert.deepEqual([ms[i].xp, ms[i].gems], [xpRows[i].amount, g], 'partida ' + i + ': XP e gemas dela');
    }
    assert.ok(ms[0].gems >= gemm.forCompletion(6), 'gemas da conclusão (e o bônus de nível, se houve) contam');
    // totais por imagem (todas as partidas com ela, inclusive a 11ª, que não aparece na lista) e melhores tempos por quantidade
    const L0 = labelOf(fauna[0].file), im = r.body.images[L0];
    const tot = (await q("SELECT sum(amount)::int AS xp FROM xp_events WHERE user_id = $1 AND kind = 'match' AND meta->>'label' = $2", [P, L0])).rows[0].xp;
    assert.equal(im.xp, tot, 'XP total com esta imagem');
    assert.equal(im.plays, plan.filter((p) => p[0] === 0).length + 1, 'partidas com esta imagem (todas, não só as 10; inclui a antiga)');
    assert.deepEqual(im.best, { 6: 25000, 12: 70000, 30: 300000, 96: 1300000 }, 'melhor tempo por quantidade (os 3 s da partida fantasma não contam)');
    assert.ok(im.gems >= ms.filter((m) => m.imageLabel === L0).reduce((s, m) => s + m.gems, 0), 'gemas totais incluem as das partidas listadas');
    // /bests: todas as imagens e quantidades
    const b = await call('/bests', tP);
    assert.equal(b.body.bests[L0 + '|6'], 25000); assert.equal(b.body.bests[labelOf(fauna[1].file) + '|6'], 20000); assert.equal(b.body.bests[labelOf(fauna[2].file) + '|20'], 120000);
    // só do dono: a partida de Otto (6 peças em 9 s) não entra para Paula, e vice-versa; sem sessão, nada
    assert.notEqual(b.body.bests[L0 + '|6'], 9000);
    const bo = await call('/bests', tO);
    assert.deepEqual(bo.body.bests, { [L0 + '|6']: 9000 });
    assert.equal((await call('/matches', tO)).body.matches.length, 1);
    for (const rt of ['/matches', '/bests']) assert.equal((await call(rt, null)).status, 401, rt + ' exige sessão');
  } finally {
    await pool.end().catch(() => {});
    await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }
});
