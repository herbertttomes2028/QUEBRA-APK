"use strict";
// PostgreSQL real somente no banco temporário qc_test, num SCHEMA TEMPORÁRIO isolado (não toca nas tabelas reais nem nos outros testes).
// Percorre o caminho VERDADEIRO: createAccounts -> finishCoop -> addMatch -> payMatch -> awardAchievements, e as rotas /me e /friends/profile.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';

test('PostgreSQL: conquistas — estatísticas, pagamento em passadas, permanência, perfil e privacidade do amigo', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg');
  const ach = require('../achievements'), library = require('../library'), xpm = require('../xp'), gemm = require('../gems');
  const { createAccounts } = require('../accounts');
  const schema = 't_ach_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: connection, ssl: false, max: 4, options: `-c search_path=${schema}` });
  const db = { q: (s, p) => pool.query(s, p), pool };
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  let accounts = null;
  try {
    const dir = path.join(__dirname, '..', 'migrations');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    const q = (s, p) => pool.query(s, p);
    const mkUser = async (name, code, xp) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded) VALUES ($1, $2, $3, $4, true) RETURNING id', [name + '@t.test', name, code, xp || 0])).rows[0].id;
    const mkSession = async (uid) => { const t = 'tok-' + crypto.randomBytes(8).toString('hex'); await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + interval '1 day')", [sha(t), uid]); return t; };
    const files = (cat) => library.ALL.filter((i) => i.categoryId === cat).map((i) => i.file);

    /* ================= 1) estatísticas: dados conhecidos, resultado conhecido ================= */
    const A = await mkUser('Ana', 'AAAAAAA2', 400), B = await mkUser('Beto', 'BBBBBBB2', 0);
    const rows = [
      ['solo', 6, 'done', true, 30000, '2026-10-01 10:00'], ['solo', 6, 'done', true, 18000, '2026-10-02 10:00'], ['solo', 6, 'done', true, 3000, '2026-10-02 11:00'],   // 3 s: "partida fantasma", abaixo do tempo mínimo
      ['solo', 6, 'done', true, 700000, '2026-10-03 10:00'], ['coop', 12, 'done', true, 60000, '2026-10-03 11:00'], ['coop', 20, 'done', true, 100000, '2026-10-03 12:00'],
      ['coop', 48, 'done', true, 400000, '2026-10-05 09:00'],
      ['comum', 12, 'win', true, 50000, '2026-10-05 10:00'], ['comum', 12, 'win', true, 40000, '2026-10-05 10:10'], ['quebra', 12, 'loss', false, null, '2026-10-05 10:20'],
      ['comum', 12, 'win', true, 45000, '2026-10-05 10:30'], ['quebra', 12, 'win', true, 47000, '2026-10-05 10:40'], ['comum', 12, 'win', true, 44000, '2026-10-05 10:50']];
    for (const r of rows) await q("INSERT INTO matches (user_id, mode, image_label, pieces, result, completed, custom, duration_ms, created_at) VALUES ($1,$2,'Capivara',$3,$4,$5,false,$6, ($7 || '-03')::timestamptz)", [A, r[0], r[1], r[2], r[3], r[4], r[5]]);
    const ev = (ref, meta) => q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1, $2, 'match', 20, $3)", [A, ref, JSON.stringify(meta)]);
    await ev('m1', { parts: { friend: 5 }, partner: B }); await ev('m2', { parts: { friend: 5 }, partner: 'outro-uuid' }); await ev('m3', { parts: { friend: 0 }, partner: 'guest' }); await ev('m4', { parts: { friend: 5 }, partner: B });
    await q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1, 'ach:primeira', 'ach', 25, '{}')", [A]);
    await q("INSERT INTO puzzle_clears (user_id, puzzle_key, clears) VALUES ($1, 'k1', 7), ($1, 'k2', 2)", [A]);
    for (const f of files('fauna').concat(files('biomas').slice(0, 1), files('espaco').slice(0, 1))) await q("INSERT INTO library_clears (user_id, image_id, completed_at) VALUES ($1, $2, '2026-10-06 12:00-03')", [A, f]);
    await q("INSERT INTO library_unlocks (user_id, category_id, gems_spent) VALUES ($1, 'cultura', 25)", [A]);
    for (const s of ['accepted', 'accepted', 'pending']) await q("INSERT INTO invites (from_user, to_user, kind, room_code, pieces, status, expires_at) VALUES ($1, $2, 'coop', 'ABCD', 6, $3, now() + interval '1 hour')", [A, B, s]);

    const st = await ach.gatherStats((s, p) => pool.query(s, p), A, library);
    const esperado = { soloGames: 4, duels: 6, coopDone: 3, c6: 4, c12: 6, c20: 1, c30: 0, c48: 1, f6: 18000, f12: 40000, f20: 100000, f30: null, f48: 400000, slow6: 700000, piecesTotal: 164,
      days: 4, dayMax: 7, streak: 3, winStreak: 3, friendMatches: 3, partners: 2, invitesOk: 2, replayMax: 7, libImages: 7, libCats: 3, libCatsFull: 1, purchases: 1, catsInDay: 3, level: 4 };
    for (const [k, v] of Object.entries(esperado)) assert.equal(st[k], v, 'estatística ' + k);
    assert.deepEqual({ ...st.cat }, { fauna: 5, biomas: 1, espaco: 1 });
    assert.deepEqual([...st.earned], ['primeira']);
    assert.equal(st.f6, 18000, 'o tempo fantasma de 3 s (abaixo do mínimo de 8 s) NÃO conta para velocidade');

    /* ================= 2) o caminho real: fim de partida paga as conquistas em duas passadas ================= */
    const events = [];
    const io = new (require('node:events').EventEmitter)(); io.sockets = { sockets: new Map() }; io.to = (room) => ({ emit: (name, data) => events.push({ room, name, data }) });
    const routes = {}; const router = { get(p, ...h) { routes['GET ' + p] = h; return router; }, post(p, ...h) { routes['POST ' + p] = h; return router; }, use() { return router; } };
    const app = { use() {} }; const express = { Router: () => router, json: () => (_, __, next) => next() };
    accounts = createAccounts({ app, express, io, db, cleanName: (n) => n, cleanAvatar: (a) => a, roomInfo: () => null, roomOfSocket: () => null, imageLabel: () => 'Capivara',
      getUpload: () => null, putUpload: () => null, onAuth: () => {}, mailer: null, peerOf: () => null, elapsedOf: (room) => room.elapsed });
    const call = (route, token, query) => new Promise((resolve) => {
      const req = { get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer ' + token : ''), query: query || {}, body: {}, method: 'GET', path: route };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() {}, json(x) { resolve({ status: this.statusCode, body: x }); } };
      const h = routes['GET ' + route]; h[0](req, res, () => h[1](req, res));
    });

    const P = await mkUser('Paula', 'PPPPPPP2', 140);
    const room = { solo: true, players: [{ uid: P }], imageId: files('fauna')[0], pieces: new Array(6).fill(0), code: 'ZZZZ', startedAt: 1700000000000, elapsed: 30000 };
    await accounts.finishCoop(room);
    const pagas = (await q("SELECT ref, amount FROM xp_events WHERE user_id = $1 AND kind = 'ach' ORDER BY ref", [P])).rows;
    assert.deepEqual(pagas.map((r) => r.ref), ['ach:cat_fauna_1', 'ach:concluido_1', 'ach:img_1', 'ach:nivel_3', 'ach:primeira', 'ach:v6_45'],
      'passada 1: primeira partida, missão cumprida, primeiro quadro, 1ª imagem de Fauna, tempo de 6 peças; passada 2: nível 3 (só existe depois do XP da passada 1)');
    assert.equal(pagas.reduce((s, r) => s + r.amount, 0), 25 + 5 + 5 + 5 + 5 + 5, 'primeira vale 25 (valor antigo mantido) e as novas valem o XP do nível');
    const u = (await q('SELECT xp, gems FROM users WHERE id = $1', [P])).rows[0];
    assert.equal(u.xp, 140 + 20 + 50, 'XP = antes + partida (20) + conquistas (50)');
    assert.equal(u.gems, gemm.forCompletion(6) + gemm.forLevel(3), 'gemas = conclusão de 6 peças + bônus de chegar ao nível 3 (que veio do XP das conquistas)');
    const aviso = events.filter((e) => e.room === 'u:' + P && e.name === 'acc:ev').map((e) => e.data).find((e) => e.t === 'xp');
    assert.ok(aviso, 'o celular recebe UM aviso');
    assert.equal(aviso.ach.length, 6); assert.equal(aviso.gained, 70); assert.equal(aviso.level, 3); assert.equal(aviso.prevLevel, 2); assert.equal(aviso.leveledUp, true); assert.equal(aviso.gemsLevel, 10);
    assert.ok(aviso.ach.every((a) => a.id && a.icon && a.title && a.tier && a.xp > 0));

    await accounts.finishCoop(room);                                                   // a MESMA partida de novo (reconexão): nada é pago duas vezes
    assert.equal((await q("SELECT count(*)::int AS n FROM xp_events WHERE user_id = $1 AND kind = 'ach'", [P])).rows[0].n, 6);
    assert.equal((await q('SELECT xp FROM users WHERE id = $1', [P])).rows[0].xp, 210, 'repetir a partida não paga XP de novo');

    /* ================= 3) conquista ganha é PERMANENTE; perfil traz tudo o que o dono precisa ================= */
    const tokP = await mkSession(P);
    const me1 = (await call('/me', tokP)).body.me;
    assert.equal(me1.achievements.filter((a) => a.done).length, 6);
    assert.equal(me1.achSummary.done, 6); assert.equal(me1.achMeta.groups.length, 9); assert.ok(me1.achSummary.total >= 90, 'sem as conquistas de amizade o catálogo tem um pouco menos de 100 visíveis');
    const fauna1 = me1.collections.find((c) => c.id === 'fauna');
    assert.equal(fauna1.done, 1); assert.equal(fauna1.total, 5); assert.equal(fauna1.open, true); assert.equal(fauna1.ach.done, 1);
    const seg = me1.achievements.find((a) => a.id === 'seg_devagar');
    assert.deepEqual([seg.title, seg.icon, seg.done, seg.goal], ['???', '❔', false, null], 'segredo não ganho aparece mascarado');
    assert.equal(me1.collections.find((c) => c.id === 'espaco').open, false);
    await q('DELETE FROM library_clears WHERE user_id = $1', [P]);                    // o progresso some (ex.: catálogo mudou)...
    const me2 = (await call('/me', tokP)).body.me;
    assert.equal(me2.achievements.find((a) => a.id === 'cat_fauna_1').done, true, '...mas a conquista continua ganha');
    assert.equal(me2.achievements.find((a) => a.id === 'img_1').done, true);
    assert.equal(me2.collections.find((c) => c.id === 'fauna').done, 0, 'a coleção mostra o estado de agora');

    /* ================= 5) veterano: tudo o que já cumpria é pago de uma vez, em várias passadas, sem duplicar ================= */
    const V = await mkUser('Vera', 'VVVVVVV2', 3000);
    await q("INSERT INTO matches (user_id, mode, image_label, pieces, result, completed, custom, duration_ms, created_at) SELECT $1, 'solo', 'Capivara', 6, 'done', true, false, 25000, timestamptz '2026-09-01 10:00-03' + ((g - 1) / 5) * interval '1 day' + (g % 5) * interval '1 minute' FROM generate_series(1, 40) g", [V]);
    await accounts.finishCoop({ solo: true, players: [{ uid: V }], imageId: files('fauna')[1], pieces: new Array(6).fill(0), code: 'VVVV', startedAt: 1700000000001, elapsed: 30000 });
    const vAch = (await q("SELECT ref, amount FROM xp_events WHERE user_id = $1 AND kind = 'ach'", [V])).rows, ids = vAch.map((r) => r.ref.slice(4));
    assert.equal(new Set(ids).size, ids.length, 'nenhuma conquista paga duas vezes');
    for (const id of ['primeira', 'dez', 'montador', 'concluido_15', 'jogos_30', 'concluido_40', 't6_25', 'solo_10', 'dias_7', 'seq_7', 'nivel_8', 'cacador_10']) assert.ok(ids.includes(id), 'veterano deveria receber ' + id);
    assert.ok(!ids.includes('solo_50') && !ids.includes('v6_20') && !ids.includes('mestre'), 'o que ele NÃO cumpre não é pago');
    const vXp = (await q('SELECT xp, gems FROM users WHERE id = $1', [V])).rows[0];
    const matchXp = (await q("SELECT coalesce(sum(amount), 0)::int AS s FROM xp_events WHERE user_id = $1 AND kind = 'match'", [V])).rows[0].s;
    assert.equal(vXp.xp, 3000 + matchXp + vAch.reduce((s, r) => s + r.amount, 0), 'o XP total é exatamente o que as linhas de pagamento dizem');
    const subidas = gemm.crossedLevels(xpm.levelFromXp(3000), xpm.levelFromXp(vXp.xp)).reduce((s, b) => s + b.gems, 0);
    assert.equal(vXp.gems, gemm.forCompletion(6) + subidas, 'as gemas dos níveis que o XP das conquistas fez subir foram creditadas uma vez cada');
  } finally {
    if (accounts && accounts.close) accounts.close();
    await pool.end().catch(() => {});
    await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }
});
