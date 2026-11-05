"use strict";
// PostgreSQL real somente no banco temporário qc_test, num SCHEMA TEMPORÁRIO isolado.
// Prova que o /me LEVE e as conquistas em UMA consulta dão EXATAMENTE o que as várias consultas de antes davam, e conta as idas ao banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';
const TZ = "'America/Fortaleza'";

test('PostgreSQL: /me leve, /achievements e gatherStats em uma consulta == resultados antigos, com poucas idas ao banco', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg');
  const ach = require('../achievements'), library = require('../library'), xpm = require('../xp');
  const { createAccounts } = require('../accounts');

  // ===== ORÁCULO: o gatherStats ANTIGO (9 consultas), copiado sem alterações de lógica =====
  async function gatherStatsAntigo(q, uid, lib) {
    lib = ach.index(lib);
    const minParams = ach.SIZES.map(xpm.minMs);
    const sizeSql = ach.SIZES.map((p) => `count(*) FILTER (WHERE completed AND pieces = ${p})::int AS c${p}`).join(', ') + ', ' +
      ach.SIZES.map((p, i) => `min(duration_ms) FILTER (WHERE completed AND pieces = ${p} AND duration_ms >= $${i + 2})::bigint AS f${p}`).join(', ');
    const [m, days, duels, fx, pc, lc, lu, inv, ux] = await Promise.all([
      q(`SELECT count(*) FILTER (WHERE mode = 'solo')::int AS solo, count(*) FILTER (WHERE mode IN ('comum', 'quebra'))::int AS duels,
                count(*) FILTER (WHERE mode = 'coop' AND completed)::int AS "coopDone", ${sizeSql},
                coalesce(max(duration_ms) FILTER (WHERE completed AND pieces = 6), 0)::bigint AS slow6,
                coalesce(sum(pieces) FILTER (WHERE completed), 0)::int AS "piecesTotal"
           FROM matches WHERE user_id = $1`, [uid].concat(minParams)),
      q(`SELECT (created_at AT TIME ZONE ${TZ})::date::text AS d, count(*)::int AS n FROM matches WHERE user_id = $1 GROUP BY 1 ORDER BY 1`, [uid]),
      q(`SELECT result FROM matches WHERE user_id = $1 AND mode IN ('comum', 'quebra') AND result IN ('win', 'loss') ORDER BY created_at, id`, [uid]),
      q(`SELECT count(*) FILTER (WHERE kind = 'match' AND coalesce((meta->'parts'->>'friend')::int, 0) > 0)::int AS fm,
                count(DISTINCT meta->>'partner') FILTER (WHERE kind = 'match' AND meta->>'partner' IS NOT NULL AND meta->>'partner' <> 'guest')::int AS partners,
                coalesce(array_agg(substr(ref, 5)) FILTER (WHERE kind = 'ach'), '{}') AS earned
           FROM xp_events WHERE user_id = $1`, [uid]),
      q('SELECT coalesce(max(clears), 0)::int AS m FROM puzzle_clears WHERE user_id = $1', [uid]),
      q(`SELECT image_id, (completed_at AT TIME ZONE ${TZ})::date::text AS d FROM library_clears WHERE user_id = $1`, [uid]),
      q('SELECT category_id FROM library_unlocks WHERE user_id = $1', [uid]),
      q("SELECT count(*)::int AS n FROM invites WHERE from_user = $1 AND status = 'accepted'", [uid]),
      q('SELECT xp FROM users WHERE id = $1', [uid])
    ]);
    const r = m.rows[0], ev = fx.rows[0];
    const cat = {}, perDay = new Map(), imgs = new Set();
    for (const row of lc.rows) {
      const it = lib.byFile.get(row.image_id); if (!it) continue;                  // imagem que saiu do catálogo não conta
      imgs.add(it.file); cat[it.categoryId] = (cat[it.categoryId] || 0) + 1;
      if (!perDay.has(row.d)) perDay.set(row.d, new Set()); perDay.get(row.d).add(it.categoryId);
    }
    const dayRows = days.rows;
    const st = {
      soloGames: r.solo, duels: r.duels, coopDone: r.coopDone, slow6: Number(r.slow6),
      piecesTotal: r.piecesTotal, days: dayRows.length, dayMax: dayRows.reduce((a, x) => Math.max(a, x.n), 0), streak: ach.streakOf(dayRows.map((x) => x.d)),
      winStreak: ach.winStreakOf(duels.rows.map((x) => x.result)), friendMatches: ev.fm, partners: ev.partners, invitesOk: inv.rows[0].n,
      replayMax: pc.rows[0].m, libImages: imgs.size, cat, libCats: Object.keys(cat).length,
      libCatsFull: lib.CATEGORIES.filter((c) => { const t = (lib.byCat.get(c.id) || []).length; return t > 0 && (cat[c.id] || 0) >= t; }).length,
      purchases: lu.rows.length, catsInDay: [...perDay.values()].reduce((a, s) => Math.max(a, s.size), 0),
      level: xpm.levelFromXp((ux.rows[0] || { xp: 0 }).xp),
      earned: new Set(ev.earned || []),
      clearsSet: imgs, purchasesSet: new Set(lu.rows.map((x) => x.category_id))
    };
    for (const p of ach.SIZES) { st['c' + p] = r['c' + p]; st['f' + p] = r['f' + p] == null ? null : Number(r['f' + p]); }
    return st;
  }
  const statsAntigo = async (q, uid) => {
    const s = (await q(`SELECT count(*)::int AS games, count(*) FILTER (WHERE result = 'win')::int AS wins, count(*) FILTER (WHERE result = 'loss')::int AS losses,
        count(*) FILTER (WHERE completed)::int AS completed, coalesce(max(pieces) FILTER (WHERE completed), 0)::int AS "maxPieces",
        min(duration_ms) FILTER (WHERE completed AND pieces >= 20)::bigint AS fastest20, count(*) FILTER (WHERE custom)::int AS "customGames",
        coalesce(sum(duration_ms), 0)::bigint AS "totalMs" FROM matches WHERE user_id = $1`, [uid])).rows[0];
    const f = (await q("SELECT count(*)::int AS n FROM friendships WHERE status = 'accepted' AND (user_a = $1 OR user_b = $1)", [uid])).rows[0];
    return { games: s.games, wins: s.wins, losses: s.losses, completed: s.completed, maxPieces: s.maxPieces, fastest20: s.fastest20 == null ? null : Number(s.fastest20), customGames: s.customGames, totalMs: Number(s.totalMs), friends: f.n };
  };
  const norm = (st) => JSON.parse(JSON.stringify(st, (k, v) => (v instanceof Set ? [...v].sort() : v)));

  const schema = 't_via_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: connection, ssl: false, max: 4, options: `-c search_path=${schema}` });
  const contagem = { n: 0 };
  const db = { q: (s, p) => { contagem.n++; return pool.query(s, p); }, pool };
  const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  try {
    const dir = path.join(__dirname, '..', 'migrations');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    const q = (s, p) => pool.query(s, p);
    const mkUser = async (name, code, xp, seeded) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name + '@t.test', name, code, xp, seeded !== false])).rows[0].id;
    const mkSession = async (uid) => { const t = 'tok-' + crypto.randomBytes(8).toString('hex'); await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,now() + interval '1 day')", [sha(t), uid]); return t; };
    const files = (cat) => library.ALL.filter((i) => i.categoryId === cat).map((i) => i.file);

    const A = await mkUser('Ana', 'AAAAAAA2', 400), B = await mkUser('Beto', 'BBBBBBB2', 0), C = await mkUser('Cris', 'CCCCCCC2', 90), D = await mkUser('Davi', 'DDDDDDD2', 0, false);
    const rows = [['solo', 6, 'done', true, 30000, '2026-10-01 10:00-03'], ['solo', 6, 'done', true, 18000, '2026-10-02 23:30-03'], ['solo', 6, 'done', true, 3000, '2026-10-03 00:10+00'], ['solo', 12, 'done', true, 61000, '2026-10-03 11:00-03'],
      ['coop', 12, 'done', true, 60000, '2026-10-03 11:30-03'], ['coop', 20, 'done', true, 100000, '2026-10-04 12:00-03'], ['coop', 30, 'done', true, 210000, '2026-10-04 13:00-03'], ['coop', 48, 'done', true, 400000, '2026-10-05 09:00-03'],
      ['comum', 12, 'win', true, 50000, '2026-10-05 10:00-03'], ['comum', 12, 'win', true, 40000, '2026-10-05 10:10-03'], ['quebra', 12, 'loss', false, null, '2026-10-05 10:20-03'], ['comum', 12, 'win', true, 45000, '2026-10-05 10:30-03'], ['quebra', 20, 'win', true, 99000, '2026-10-06 01:40+00']];
    for (const r of rows) await q("INSERT INTO matches (user_id, mode, image_label, pieces, result, completed, custom, duration_ms, created_at) VALUES ($1,$2,'Capivara',$3,$4,$5,$7,$6, $8::timestamptz)", [A, r[0], r[1], r[2], r[3], r[4], r[2] === 'loss', r[5]]);
    const ev = (ref, meta) => q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1, $2, 'match', 20, $3)", [A, ref, JSON.stringify(meta)]);
    await ev('m1', { parts: { friend: 5 }, partner: B }); await ev('m2', { parts: { friend: 5 }, partner: 'outro-uuid' }); await ev('m3', { parts: { friend: 0 }, partner: 'guest' });
    for (const id of ['primeira', 'img_1', 'cat_fauna_1']) await q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1, $2, 'ach', 25, '{}')", [A, 'ach:' + id]);
    await q("INSERT INTO puzzle_clears (user_id, puzzle_key, clears) VALUES ($1, 'k1', 7), ($1, 'k2', 2)", [A]);
    let h = 0; for (const f of files('fauna').slice(0, 5).concat(files('biomas').slice(0, 2), files('espaco').slice(0, 1))) await q("INSERT INTO library_clears (user_id, image_id, completed_at) VALUES ($1, $2, $3::timestamptz)", [A, f, '2026-10-0' + (1 + (h++ % 3)) + ' ' + (h % 2 ? '01:30+00' : '15:00-03')]);
    await q("INSERT INTO library_unlocks (user_id, category_id, gems_spent) VALUES ($1, 'cultura', 25)", [A]);
    for (const s of ['accepted', 'accepted', 'declined']) await q("INSERT INTO invites (from_user, to_user, kind, room_code, pieces, status, expires_at) VALUES ($1, $2, 'coop', 'ABCD', 6, $3, now() + interval '1 hour')", [A, B, s]);
    await q("INSERT INTO invites (from_user, to_user, kind, room_code, pieces, status, expires_at) VALUES ($1, $2, 'coop', 'WXYZ', 6, 'pending', now() + interval '1 hour')", [B, A]);   // pendente PARA a Ana
    const [ua, ub] = A < B ? [A, B] : [B, A];
    await q("INSERT INTO friendships (user_a, user_b, requested_by, status) VALUES ($1, $2, $3, 'accepted')", [ua, ub, A]);
    const [uc, ucc] = A < C ? [A, C] : [C, A];
    await q("INSERT INTO friendships (user_a, user_b, requested_by, status) VALUES ($1, $2, $3, 'pending')", [uc, ucc, C]);                                     // pedido de amizade PARA a Ana
    await q("INSERT INTO saves (user_id, image_id, image_label, pieces, locked, elapsed_ms, partner_name) VALUES ($1, $2, 'Capivara', 20, '[1,2,3]'::jsonb, 54321, 'Beto')", [A, files('fauna')[0]]);
    await q("INSERT INTO matches (user_id, mode, image_label, pieces, result, completed, custom, duration_ms, created_at) VALUES ($1,'solo','Capivara',12,'done',true,false,70000, now() - interval '2 days'), ($1,'solo','Capivara',20,'done',true,false,90000, now() - interval '1 day')", [D]);   // D: histórico para o XP ser convertido

    /* ================= 1) gatherStats e statsOf: IGUAIS aos antigos ================= */
    for (const [nome, uid] of [['Ana (rica)', A], ['Beto (quase vazio)', B], ['Cris (sem partidas)', C], ['Davi (só histórico)', D]]) {
      const novo = await ach.gatherStats((s, p) => pool.query(s, p), uid, library), antigo = await gatherStatsAntigo((s, p) => pool.query(s, p), uid, library);
      assert.deepEqual(norm(novo), norm(antigo), 'gatherStats de ' + nome + ' tem de ser idêntico ao antigo');
    }
    // Em Fortaleza (UTC-3), 00:10+00 de 03/10 é 21:10 de 02/10 e 01:40+00 de 06/10 é 22:40 de 05/10: são 5 dias. Em UTC seriam 6, então isto detecta o fuso errado.
  assert.equal((await ach.gatherStats((s, p) => pool.query(s, p), A, library)).days, 5, 'o fuso de Fortaleza continua valendo');

    /* ================= 2) as rotas ================= */
    const routes = {}; const router = { get(p, ...hh) { routes['GET ' + p] = hh; return router; }, post(p, ...hh) { routes['POST ' + p] = hh; return router; }, use() { return router; } };
    const app = { use() {} }; const express = { Router: () => router, json: () => (_, __, next) => next() };
    createAccounts({ app, express, io: Object.assign(new (require('node:events').EventEmitter)(), { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) }), db, cleanName: (n) => n, cleanAvatar: (a) => a, roomInfo: () => null, roomOfSocket: () => null,
      imageLabel: () => 'Capivara', getUpload: () => null, putUpload: () => null, onAuth: () => {}, mailer: null, peerOf: () => null, elapsedOf: () => 0 });
    const call = (route, token, query) => new Promise((resolve) => {
      const req = { get: (hd) => (hd.toLowerCase() === 'authorization' ? 'Bearer ' + token : ''), query: query || {}, body: {}, method: 'GET', path: route };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() {}, json(x) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(x)) }); } };
      const hh = routes['GET ' + route]; hh[0](req, res, () => hh[1](req, res));
    });
    const tok = await mkSession(A);
    contagem.n = 0; const lite = (await call('/me', tok, { lite: '1' })).body.me; const nLite = contagem.n;
    contagem.n = 0; const cheio = (await call('/me', tok, {})).body.me; const nCheio = contagem.n;
    contagem.n = 0; const conq = (await call('/achievements', tok)).body; const nConq = contagem.n;
    contagem.n = 0; const salvo = (await call('/save', tok)).body.save; contagem.n = 0;

    // idas ao banco: antes o /me fazia 8 em 4 etapas (e 17 com as conquistas)
    assert.equal(nLite, 2, '/me?lite=1: só a autenticação + UMA consulta do núcleo');
    assert.equal(nConq, 3, '/achievements: autenticação + estatísticas + UMA consulta das conquistas (as duas últimas em paralelo)');
    assert.ok(nCheio <= 4, '/me completo (compatível com o aplicativo antigo): ' + nCheio + ' idas');
    // conteúdo
    const ACH = ['achievements', 'achSummary', 'collections', 'achMeta'];
    assert.deepEqual(Object.keys(lite).filter((k) => ACH.includes(k)), [], 'o /me leve NÃO leva conquistas, coleções nem metadados');
    assert.ok(JSON.stringify(lite).length < 3000, 'o /me leve é pequeno: ' + JSON.stringify(lite).length + ' bytes');
    const semConq = Object.fromEntries(Object.entries(cheio).filter(([k]) => !ACH.includes(k)));
    assert.deepEqual(lite, semConq, 'o /me leve é EXATAMENTE o /me completo sem as 4 chaves de conquistas');
    assert.deepEqual(Object.fromEntries(ACH.map((k) => [k, conq[k]])), Object.fromEntries(ACH.map((k) => [k, cheio[k]])), '/achievements entrega exatamente o que o /me completo entregava');
    assert.deepEqual(lite.stats, await statsAntigo(q, A), 'estatísticas básicas idênticas às de antes');
    assert.deepEqual(lite.save, salvo, 'a partida salva do /me é idêntica à da rota /save (inclusive a data)');
    assert.deepEqual(lite.pending, { requests: 1, invites: 1 }, 'pedidos de amizade e convites pendentes');
    assert.equal(lite.gems, 0); assert.equal(lite.xp.total, 400);

    /* ================= 3) quem ainda não teve o histórico convertido em XP: converte na 1ª vez, igual nos dois formatos ================= */
    const tokD = await mkSession(D);
    const dLite = (await call('/me', tokD, { lite: '1' })).body.me, dFull = (await call('/me', tokD, {})).body.me;
    assert.ok(dLite.xp.total > 0, 'o histórico de Davi virou XP já no /me leve (' + dLite.xp.total + ')');
    assert.deepEqual(dFull.xp, dLite.xp, 'o /me completo, logo depois, vê o mesmo XP');
    assert.equal((await q('SELECT xp_seeded FROM users WHERE id = $1', [D])).rows[0].xp_seeded, true);

    /* ================= 4) sem login: nada vaza ================= */
    assert.equal((await call('/achievements', 'token-invalido')).status, 401);
    assert.equal((await call('/me', 'token-invalido', { lite: '1' })).status, 401);
  } finally {
    await pool.end().catch(() => {});
    await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {});
    await admin.end().catch(() => {});
  }
});
