'use strict';
/*
 * CONTAS DO QUEBRA-CABEÇA A DOIS
 * Login (e-mail+senha e Google), perfil, estatísticas, amigos, convites, "Continuar jogando" e histórico.
 *
 * Regras de segurança e privacidade:
 *  - O navegador NUNCA fala com o banco: tudo passa por aqui, e cada rota só mexe nos dados de quem está logado.
 *  - Senha: guardada com scrypt (sal aleatório). Sessão: token aleatório; no banco fica só o hash dele.
 *  - Busca de amigos: só pelo código exato. Nenhuma resposta traz e-mail; amigos veem só nome, avatar e se estão online.
 *  - Limites de tentativas (login, cadastro, buscas, pedidos de amizade, convites) para barrar abuso.
 *  - Coletamos o mínimo: e-mail (só para entrar), nome e avatar de jogo, partidas e estatísticas. Sem chat público.
 */
const crypto = require('crypto');
const phrases = require('./phrases');
const xpm = require('./xp');
const gemm = require('./gems');
const library = require('./library');
const shop = require('./shop');
const ach = require('./achievements');
const { reportEmail, reportTarget, FRIEND_CODE_RE } = require('./mailer');
const names = require('./names');

const SESSION_MS = 60 * 24 * 3600 * 1000;       // login vale 60 dias
const RATE_MULT = Number(process.env.ACC_RATE_MULT) || 1;     // só para testes: afrouxa os limites por endereço (IP)
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // sem 0/O/1/I/L, que se confundem
const SAVE_DEBOUNCE_MS = Number(process.env.SAVE_DEBOUNCE_MS) || 2000;

/* ---------- utilidades ---------- */
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const fmtCode = (c) => (c ? c.slice(0, 4) + '-' + c.slice(4) : '');
function normCode(s) {
  const c = String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 8 && [...c].every((ch) => CODE_ALPHABET.includes(ch)) ? c : null;
}
function newFriendCode() {
  const b = crypto.randomBytes(8);
  let c = '';
  for (let i = 0; i < 8; i++) c += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return c;
}
function maskEmail(e) { const [u, d] = String(e || '').split('@'); return u ? u.slice(0, 1) + '***@' + d : ''; }

/* ---------- senha (scrypt) ---------- */
function scryptAsync(pw, salt) {
  return new Promise((res, rej) => crypto.scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (e, k) => (e ? rej(e) : res(k))));
}
async function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(pw, salt);
  return 'scrypt$' + salt.toString('base64url') + '$' + key.toString('base64url');
}
async function checkPassword(pw, stored) {
  const p = String(stored || '').split('$');
  if (p.length !== 3 || p[0] !== 'scrypt') return false;
  const key = await scryptAsync(pw, Buffer.from(p[1], 'base64url'));
  const good = Buffer.from(p[2], 'base64url');
  return key.length === good.length && crypto.timingSafeEqual(key, good);
}
const FAKE_HASH = 'scrypt$' + Buffer.alloc(16, 7).toString('base64url') + '$' + Buffer.alloc(64, 9).toString('base64url');   // iguala o tempo quando o e-mail não existe

/* ---------- código-chave do perfil gerado (sem e-mail e sem senha) ---------- */
const KEY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';      // 31 símbolos, sem I, L, O, 0 e 1 (não se confundem ao copiar) // gitleaks:allow (alfabeto, não é segredo)
const KEY_LEN = 20;                                          // 20 x log2(31) = cerca de 99 bits de aleatoriedade
function newSecret() { let t = ''; for (let i = 0; i < KEY_LEN; i++) t += KEY_CHARS[crypto.randomInt(0, KEY_CHARS.length)]; return t; }
const fmtSecret = (t) => t.match(/.{5}/g).join('-');
function normSecret(v) {
  const c = String(v == null ? '' : v).slice(0, 64).toUpperCase().replace(/[\s-]/g, '');
  return c.length === KEY_LEN && [...c].every((ch) => KEY_CHARS.includes(ch)) ? c : null;
}

/* ---------- conquistas: catálogo, regras e estatísticas vivem em achievements.js (módulo puro); o PAGAMENTO fica aqui, na transação do XP ---------- */
const ACHIEVEMENTS = ach.STATIC;

function createAccounts(d) {
  const { app, express, io, db, cleanName, cleanAvatar, roomInfo, roomOfSocket, imageLabel, onAuth, mailer, peerOf } = d;
  const libraryService = library.makeService(db);
  const shopService = shop.makeService(db);

  /* ----- limites de tentativas (na memória) ----- */
  const hits = new Map();
  function allow(key, max, ms, perIp) {
    if (perIp) max *= RATE_MULT;                  // limites por endereço (IP) podem ser afrouxados nos testes
    const now = Date.now();
    const a = (hits.get(key) || []).filter((t) => now - t < ms);
    if (!hits.has(key) && hits.size >= 6000) return false;
    if (a.length >= max) { hits.set(key, a); return false; }
    a.push(now); hits.set(key, a);
    return true;
  }
  setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some((t) => now - t < 3600 * 1000)) hits.delete(k); }, 10 * 60 * 1000).unref();

  /* ----- quem está online ----- */
  const online = new Map();                       // uid -> Set(socket.id)
  const isOnline = (uid) => !!(online.get(uid) && online.get(uid).size);
  const notify = (uid, ev) => io.to('u:' + uid).emit('acc:ev', ev);

  /* ----- consultas ----- */
  const one = async (text, params) => (await db.q(text, params)).rows[0] || null;

  async function createUser({ name, avatar, bests, secretHash, kind }) {
    for (let tries = 0; tries < 6; tries++) {
      try {
        return await one(
          'INSERT INTO users (name, avatar, friend_code, bests, secret_hash, secret_rotated_at, kind) VALUES ($1,$2,$3,$4,$5, now(), $6) RETURNING *',
          [name, avatar, newFriendCode(), JSON.stringify(bests || {}), secretHash, kind || 'gerado']
        );
      } catch (e) {
        if (e.code === '23505' && /friend_code/.test(e.constraint || e.detail || '')) continue;   // ID repetido: sorteia outro
        throw e;
      }
    }
    throw new Error('não consegui gerar o ID do perfil');
  }

  async function newSession(uid) {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [sha256(token), uid, new Date(Date.now() + SESSION_MS)]);
    return token;
  }
  // Invalidated HTTP sessions cannot keep accessing privileged socket events.
  function revokeSocketSessions(uid, keepHash = null) {
    const ids = online.get(uid);
    if (!ids) return;
    for (const sid of [...ids]) {
      const sock = io.sockets.sockets.get(sid);
      if (sock && sock.data.sessionHash !== keepHash) {
        sock.data.uid = null;
        sock.data.sessionHash = null;
        sock.leave('u:' + uid);
        ids.delete(sid);
        if (onAuth) onAuth(sock, null);
      }
    }
    if (!ids.size) { online.delete(uid); }
  }
  async function socketSessionValid(socket) {
    const uid = socket.data.uid, hash = socket.data.sessionHash;
    if (!uid || !hash) return false;
    const row = await one('SELECT 1 FROM sessions WHERE user_id = $1 AND token_hash = $2 AND expires_at > now()', [uid, hash]);
    return !!row;
  }
  async function userByToken(token) {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    return one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha256(token)]);
  }

  // Colunas das estatísticas básicas: usadas por statsOf e também pelo núcleo do /me (uma ida só ao banco).
  const STATS_COLS = `count(*)::int AS games,
              count(*) FILTER (WHERE result = 'win')::int AS wins,
              count(*) FILTER (WHERE result = 'loss')::int AS losses,
              count(*) FILTER (WHERE completed)::int AS completed,
              coalesce(max(pieces) FILTER (WHERE completed), 0)::int AS "maxPieces",
              min(duration_ms) FILTER (WHERE completed AND pieces >= 20)::bigint AS fastest20,
              count(*) FILTER (WHERE custom)::int AS "customGames",
              coalesce(sum(duration_ms), 0)::bigint AS "totalMs"`;
  function mapStats(s, friends) {
    return { games: s.games, wins: s.wins, losses: s.losses, completed: s.completed, maxPieces: s.maxPieces, fastest20: s.fastest20 == null ? null : Number(s.fastest20), customGames: s.customGames, totalMs: Number(s.totalMs), friends };
  }
  async function statsOf(uid) {
    const r = await one(`SELECT ${STATS_COLS}, 0 AS friends FROM matches WHERE user_id = $1`, [uid]);
    return mapStats(r, r.friends);
  }
  // Estatísticas para as conquistas = básicas (statsOf) + extras (SQL em achievements.js) + as que dependem das duas.
  async function achStatsOf(uid, base) {
    const [b, extra] = await Promise.all([base || statsOf(uid), ach.gatherStats((sql, p) => db.q(sql, p), uid, library)]);   // em paralelo: uma ida só ao banco
    return ach.complete(b, extra, ach.list(library));
  }
  // Linhas completas (para o dono) e o que fica visível para cada tipo de leitor.
  async function achRowsOf(uid, base) {
    const st = await achStatsOf(uid, base);
    return { st, rows: ach.evaluate(ach.list(library), st, st.earned) };
  }

  async function saveSummary(uid) {
    const s = await one('SELECT image_label, pieces, jsonb_array_length(locked) AS n, elapsed_ms, partner_name, updated_at FROM saves WHERE user_id = $1', [uid]);
    return s ? { imageLabel: s.image_label, pieces: s.pieces, locked: s.n, elapsedMs: Number(s.elapsed_ms), partner: s.partner_name, updatedAt: s.updated_at } : null;
  }

  // frases liberadas (guardadas por alguns segundos para o bate-papo não consultar o banco a cada toque)
  const phraseCache = new Map();
  async function allowedPhrases(uid) {
    const c = phraseCache.get(uid);
    if (c && Date.now() - c.at < 15000) return c.set;
    const set = phrases.unlockedFor(await statsOf(uid));
    phraseCache.set(uid, { at: Date.now(), set });
    return set;
  }

  // NÚCLEO do /me numa ÚNICA consulta: estatísticas, amigos, pendências, partida salva, XP e gemas (antes eram 8 idas ao banco em 4 etapas).
  async function coreOf(uid) {
    return one(`SELECT
        (SELECT row_to_json(t) FROM (SELECT ${STATS_COLS} FROM matches WHERE user_id = $1) t) AS s,
        0 AS friends,
        (SELECT row_to_json(v) FROM (SELECT image_label, pieces, jsonb_array_length(locked) AS n, elapsed_ms, partner_name, updated_at FROM saves WHERE user_id = $1) v) AS save,
        (SELECT row_to_json(x) FROM (SELECT xp, xp_seeded, gems FROM users WHERE id = $1) x) AS u`, [uid]);
  }
  // /me LEVE: tudo o que a tela inicial e o perfil precisam, SEM as conquistas e coleções (essas vêm de /achievements, só quando alguém abre a aba).
  async function meLite(u) {
    const c = await coreOf(u.id), x = c.u || { xp: 0, xp_seeded: true, gems: 0 };
    const xpTot = x.xp_seeded ? x.xp : await ensureSeeded(u.id);              // converte o histórico antigo na primeira vez
    const stats = mapStats(c.s, c.friends);
    const sv = c.save;
    return {
      code: fmtCode(u.friend_code), name: u.name, avatar: u.avatar, kind: u.kind || 'legado',
      createdAt: u.created_at, stats,
      save: sv ? { imageLabel: sv.image_label, pieces: sv.pieces, locked: sv.n, elapsedMs: Number(sv.elapsed_ms), partner: sv.partner_name, updatedAt: new Date(sv.updated_at) } : null,
      xp: xpm.progress(xpTot), gems: Number(x.gems || 0), phrases: [...phrases.unlockedFor(stats)]
    };
  }
  // Conquistas e coleções do dono (a parte pesada, separada do /me).
  async function achievementsOf(uid, base) {
    const { st: ast, rows: achRows } = await achRowsOf(uid, base);
    return {
      achievements: ach.meView(achRows), achSummary: ach.summary(achRows),
      collections: ach.collectionsOf(library, ast.clearsSet, ast.purchasesSet, library.unlocksFrom([...ast.clearsSet], [...ast.purchasesSet]), achRows),
      achMeta: { groups: ach.GROUPS, tiers: ach.TIERS }
    };
  }
  // /me COMPLETO (login, cadastro, /profile e aparelhos com o aplicativo antigo em cache): o leve + as conquistas, como antes.
  async function meOf(u) {
    const lite = await meLite(u);
    return Object.assign(lite, await achievementsOf(u.id, lite.stats));
  }

  async function userByCode(code) { return code ? one('SELECT * FROM users WHERE friend_code = $1', [code]) : null; }

  /* ===================== rotas HTTP ===================== */
  const r = express.Router();
  const bad = (res, status, error) => res.status(status).json({ ok: false, error });
  const guard = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => { console.error('[contas]', req.method, req.path, e.message); bad(res, 500, 'server'); });
  async function needUser(req, res, next) {
    try {
      const h = req.get('authorization') || '';
      const u = await userByToken(h.startsWith('Bearer ') ? h.slice(7) : '');
      if (!u) return bad(res, 401, 'auth');
      req.user = u; req.token = h.slice(7);
      next();
    } catch (e) { console.error('[contas] auth', e.message); bad(res, 500, 'server'); }
  }
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  r.get('/status', (req, res) => res.json({ ok: true, enabled: true, key: true }));

  function sanitizeBests(b) {
    const out = {};
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      for (const [k, v] of Object.entries(b).slice(0, 100)) if (/^[\w.\-|]{1,80}$/.test(k) && Number.isFinite(v) && v > 0 && v < 1e8) out[k] = Math.round(v);
    }
    return out;
  }

  r.post('/logout', needUser, guard(async (req, res) => {
    await db.q('DELETE FROM sessions WHERE token_hash = $1', [sha256(req.token)]);
    // Other tokens remain valid; this token is no longer allowed on any socket.
    for (const sid of [...(online.get(req.user.id) || [])]) {
      const sock = io.sockets.sockets.get(sid);
      if (sock && sock.data.sessionHash === sha256(req.token)) {
        sock.data.uid = null; sock.data.sessionHash = null; sock.leave('u:' + req.user.id);
        online.get(req.user.id).delete(sid);
        if (onAuth) onAuth(sock, null);
      }
    }
    if (online.has(req.user.id) && !online.get(req.user.id).size) { online.delete(req.user.id); }
    res.json({ ok: true });
  }));
  r.post('/logout-all', needUser, guard(async (req, res) => {
    await db.q('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
    revokeSocketSessions(req.user.id);
    res.json({ ok: true });
  }));

  /* ----- perfil gerado pelo jogo: criar, entrar com o código-chave, trocar o código, sortear outro nome, apagar ----- */
  // Falhas por ID e por endereço são contadas à parte: assim quem só digita certo não é bloqueado por tentativas dos outros... até o limite.
  function tooMany(key, max, ms) { const now = Date.now(); return (hits.get(key) || []).filter((t) => now - t < ms).length >= max; }
  function noteFail(key, ms) {
    const now = Date.now(), a = (hits.get(key) || []).filter((t) => now - t < ms); a.push(now);
    if (hits.has(key) || hits.size < 6000) hits.set(key, a);
  }
  const LOGIN_FAIL_MS = 15 * 60 * 1000;
  // confere ID + código-chave sem revelar qual dos dois falhou (mesma resposta e mesmo tempo de conta)
  async function userByKey(id, secretRaw, ip) {
    if (typeof id !== 'string' || typeof secretRaw !== 'string') { noteFail('kfail:ip:' + ip, LOGIN_FAIL_MS); return { bad: true }; }     // só texto (uma lista ["ABCD","2XYZ"] seria juntada pelo normalizador)
    const code = normCode(id), secret = normSecret(secretRaw);
    if (tooMany('kfail:ip:' + ip, 20 * RATE_MULT, LOGIN_FAIL_MS) || (code && tooMany('kfail:id:' + code, 8, LOGIN_FAIL_MS))) return { limited: true };
    const u = code ? await one('SELECT * FROM users WHERE friend_code = $1', [code]) : null;
    const ok = await checkPassword(secret || 'A'.repeat(KEY_LEN), u && u.secret_hash ? u.secret_hash : FAKE_HASH);
    if (!u || !u.secret_hash || !secret || !ok) { noteFail('kfail:ip:' + ip, LOGIN_FAIL_MS); if (code) noteFail('kfail:id:' + code, LOGIN_FAIL_MS); return { bad: true }; }
    return { user: u };
  }
  r.post('/profile/new', guard(async (req, res) => {
    const b = req.body || {};
    if (!allow('pnew:' + req.ip, 6, 3600 * 1000, true) || !allow('pnew:all', 1500, 3600 * 1000)) return bad(res, 429, 'rate');
    if (b.consent !== true) return bad(res, 400, 'consent');                   // leu a política de privacidade (menor de 18: responsável autorizou)
    if (b.age16 !== true) return bad(res, 400, 'age16');                       // o jogo não é indicado para menores de 16 anos (a tela de idade do aparelho já confirmou)
    const secret = newSecret();
    const u = await createUser({ name: names.pick(), avatar: cleanAvatar(b.avatar) || '', bests: sanitizeBests(b.bests), secretHash: await hashPassword(secret), kind: 'gerado' });
    res.json({ ok: true, token: await newSession(u.id), id: fmtCode(u.friend_code), secret: fmtSecret(secret), me: await meOf(u) });   // o código-chave só aparece AGORA
  }));
  r.post('/profile/login', guard(async (req, res) => {
    const b = req.body || {};
    if (!allow('plogin:' + req.ip, 40, 10 * 60 * 1000, true)) return bad(res, 429, 'rate');
    const k = await userByKey(b.id, b.secret, req.ip);
    if (k.limited) return bad(res, 429, 'rate');
    if (!k.user) return bad(res, 401, 'bad_login');
    await db.q('UPDATE users SET last_seen = now() WHERE id = $1', [k.user.id]);
    res.json({ ok: true, token: await newSession(k.user.id), me: await meOf(k.user) });
  }));
  // Gera um código-chave NOVO: o anterior deixa de valer e os outros aparelhos saem do perfil (se o código vazou, o intruso é expulso).
  r.post('/profile/new-secret', needUser, guard(async (req, res) => {
    if (!allow('psec:' + req.user.id, 5, 3600 * 1000)) return bad(res, 429, 'rate');
    const secret = newSecret(), keep = sha256(req.token);
    await db.q('UPDATE users SET secret_hash = $1, secret_rotated_at = now() WHERE id = $2', [await hashPassword(secret), req.user.id]);
    await db.q('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, keep]);
    revokeSocketSessions(req.user.id, keep);
    res.json({ ok: true, secret: fmtSecret(secret) });
  }));
  r.post('/profile/nickname', needUser, guard(async (req, res) => {          // sorteia outro nome (ninguém digita nome)
    if (!allow('pnick:' + req.user.id, 20, 3600 * 1000)) return bad(res, 429, 'rate');
    const name = names.pick();
    await db.q('UPDATE users SET name = $1 WHERE id = $2', [name, req.user.id]);
    res.json({ ok: true, me: await meLite(Object.assign({}, req.user, { name })) });
  }));
  // Exclusão SEM sessão (página pública /excluir-conta.html): ID do perfil + código-chave.
  r.post('/profile/erase', guard(async (req, res) => {
    const b = req.body || {};
    if (b.confirm !== 'EXCLUIR') return bad(res, 400, 'confirm');
    if (!allow('perase:' + req.ip, 20, 10 * 60 * 1000, true)) return bad(res, 429, 'rate');
    const k = await userByKey(b.id, b.secret, req.ip);
    if (k.limited) return bad(res, 429, 'rate');
    if (!k.user) return bad(res, 401, 'bad_login');
    await eraseAccount(k.user);
    res.json({ ok: true });
  }));

  /* ----- jogadores bloqueados ----- */
  const blockSet = new Set();                                      // "quem bloqueou:quem foi bloqueado" (na memória, para consultas instantâneas)
  const blockedBetween = (a, b) => !!a && !!b && (blockSet.has(a + ':' + b) || blockSet.has(b + ':' + a));
  async function loadBlocks() { const rows = (await db.q('SELECT blocker, blocked FROM blocks')).rows; rows.forEach((x) => blockSet.add(x.blocker + ':' + x.blocked)); }
  loadBlocks().catch((e) => console.error('[contas] bloqueios:', e.message));
  async function blockUser(me, other) {
    if (!other || me === other) return false;
    await db.q('INSERT INTO blocks (blocker, blocked) VALUES ($1,$2) ON CONFLICT DO NOTHING', [me, other]);
    blockSet.add(me + ':' + other);
    phraseCache.delete(me); phraseCache.delete(other);
    notify(me, { t: 'blocks' });
    return true;
  }
  // A lista de bloqueados NUNCA mostra quem é a pessoa (nem ID, nem apelido, nem nível, nem avatar): quase sempre ela foi bloqueada
  // de dentro de uma sala, onde só aparecia como "Jogador 1/2" (é o que a política de privacidade promete). Cada linha leva só a data
  // e uma referência OPACA para desbloquear: HMAC com uma chave que nasce com o processo (não dá para deduzir o ID a partir dela e
  // ela muda quando o servidor reinicia; a tela sempre relê a lista antes de desbloquear).
  const BLOCK_REF_KEY = crypto.randomBytes(32);
  const blockRef = (blocker, blocked) => 'b' + crypto.createHmac('sha256', BLOCK_REF_KEY).update(blocker + ':' + blocked).digest('hex').slice(0, 32);
  const BLOCK_REF_RE = /^b[0-9a-f]{32}$/;
  r.get('/blocks', needUser, guard(async (req, res) => {
    const rows = (await db.q('SELECT blocked, created_at FROM blocks WHERE blocker = $1 ORDER BY created_at DESC', [req.user.id])).rows;
    // code = a MESMA referência opaca: o aplicativo antigo, guardado no celular, desbloqueia mandando "code" (nunca é o ID da pessoa)
    res.json({ ok: true, blocked: rows.map((x) => { const ref = blockRef(req.user.id, x.blocked); return { ref, code: ref, name: 'Jogador bloqueado', avatar: '', level: 0, at: new Date(x.created_at).toISOString() }; }) });
  }));
  r.post('/blocks', needUser, guard(async (req, res) => {
    if (!allow('block:' + req.user.id, 30, 3600 * 1000)) return bad(res, 429, 'rate');
    const t = await userByCode(normCode((req.body || {}).code));
    if (!t) return bad(res, 404, 'notfound');
    if (t.id === req.user.id) return bad(res, 400, 'self');
    await blockUser(req.user.id, t.id);
    res.json({ ok: true });
  }));
  r.post('/blocks/remove', needUser, guard(async (req, res) => {
    const b = req.body || {}, raw = typeof b.ref === 'string' ? b.ref : (typeof b.code === 'string' ? b.code : '');
    let otherId = null;
    if (BLOCK_REF_RE.test(raw)) {                                   // referência opaca da lista: procura só entre os bloqueios DESTE jogador
      const rows = (await db.q('SELECT blocked FROM blocks WHERE blocker = $1', [req.user.id])).rows;
      const hit = rows.find((x) => blockRef(req.user.id, x.blocked) === raw);
      otherId = hit ? hit.blocked : null;
    } else {                                                        // compatibilidade: desbloquear pelo ID do perfil (quem bloqueou pelo ID já o conhece)
      const t = await userByCode(normCode(raw));
      otherId = t ? t.id : null;
    }
    if (!otherId) return bad(res, 404, 'notfound');
    await db.q('DELETE FROM blocks WHERE blocker = $1 AND blocked = $2', [req.user.id, otherId]);
    blockSet.delete(req.user.id + ':' + otherId);
    notify(req.user.id, { t: 'blocks' });
    res.json({ ok: true });
  }));

  /* ----- denúncias: quem joga pode denunciar apelido, avatar ou comportamento. Só quem cuida do jogo lê (SQL Editor); a pessoa denunciada nunca é avisada. ----- */
  const REPORT_REASONS = new Set(['apelido', 'comportamento', 'outro']), REPORT_CONTEXTS = new Set(['perfil', 'amigos', 'sala']);
  // Aviso por e-mail a quem cuida do jogo, a cada denúncia NOVA (a repetida em 24 h não conta). Nunca atrasa nem derruba a denúncia: ela já está salva.
  // Teto por hora (REPORT_MAIL_MAX_PER_HOUR, padrão 20; 0 desliga) contra enchente de e-mails; o excedente é contado e avisado no próximo e-mail.
  const reportMail = reportTarget(process.env, mailer);
  const REPORT_MAIL_MAX = process.env.REPORT_MAIL_MAX_PER_HOUR === undefined ? 20 : Math.max(0, Math.floor(Number(process.env.REPORT_MAIL_MAX_PER_HOUR)) || 0);
  const reportWin = { start: 0, n: 0, skipped: 0 };
  async function mailReport(rep) {
    if (!mailer || !reportMail.to || !REPORT_MAIL_MAX) return;
    const now = Date.now();
    if (now - reportWin.start > 3600 * 1000) { reportWin.start = now; reportWin.n = 0; }
    if (reportWin.n >= REPORT_MAIL_MAX) { reportWin.skipped++; return; }
    reportWin.n++;
    const skipped = reportWin.skipped; reportWin.skipped = 0;
    try { await mailer.send(Object.assign({ to: reportMail.to }, reportEmail(Object.assign({}, rep, { skipped })))); }
    catch (e) { reportWin.skipped += skipped; console.error('[contas] aviso da denúncia #' + rep.id + ' não foi enviado: ' + String((e && e.message) || e).slice(0, 120)); }   // o texto do erro já vem sem chave, e-mails e IPs
  }
  const cleanNote = (v) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  async function fileReport(reporter, target, b, context) {
    const reason = typeof b.reason === 'string' ? b.reason : ''; if (!REPORT_REASONS.has(reason)) return { error: 'reason' };      // só texto (uma lista como ["apelido"] não vale)
    // a mesma pessoa denunciando a mesma outra pelo mesmo motivo de novo em 24 h conta uma vez só
    const ctx = REPORT_CONTEXTS.has(context) ? context : 'perfil', note = cleanNote(b.note), nm = String(target.name || '').slice(0, 40);
    const ins = await db.q(`INSERT INTO reports (reporter, reported, reason, context, note, reported_name)
                SELECT $1, $2, $3, $4, $5, $6
                WHERE NOT EXISTS (SELECT 1 FROM reports WHERE reporter = $1 AND reported = $2 AND reason = $3 AND created_at > now() - interval '24 hours')
                RETURNING id, created_at`, [reporter, target.id, reason, ctx, note, nm]);
    if (ins.rows[0] && FRIEND_CODE_RE.test(String(target.friend_code || ''))) {            // só denúncia NOVA vira e-mail; sem esperar (não atrasa a resposta)
      mailReport({ id: ins.rows[0].id, reason, context: ctx, name: nm, code: target.friend_code, note, at: ins.rows[0].created_at }).catch(() => {});
    } else if (ins.rows[0]) console.error('[contas] denúncia #' + ins.rows[0].id + ' sem código de amigo válido: o aviso por e-mail foi pulado');
    let blocked = false;
    if (b.alsoBlock === true) { await blockUser(reporter, target.id); blocked = true; }          // "denunciar e bloquear" num toque só
    return { ok: true, blocked };
  }
  r.post('/reports', needUser, guard(async (req, res) => {         // denunciar pelo ID do perfil (a denúncia DENTRO da sala é por socket: acc:reportPeer)
    if (!allow('report:' + req.user.id, 15, 3600 * 1000)) return bad(res, 429, 'rate');
    const b = req.body || {};
    const t = await userByCode(normCode(b.code));
    if (!t) return res.json({ ok: true, blocked: false });          // mesma resposta de sempre: a denúncia não revela quais IDs existem
    if (t.id === req.user.id) return bad(res, 400, 'self');
    const out = await fileReport(req.user.id, t, b, b.context === 'amigos' ? 'amigos' : 'perfil');
    if (out.error) return bad(res, 400, out.error);
    res.json({ ok: true, blocked: out.blocked });
  }));

  // ?lite=1 (aplicativo novo): sem conquistas, numa consulta só. Sem o parâmetro: igual a antes (aplicativo antigo em cache).
  r.get('/me', needUser, guard(async (req, res) => res.json({ ok: true, me: req.query.lite === '1' ? await meLite(req.user) : await meOf(req.user) })));
  // Conquistas e coleções: pedidas só quando a pessoa abre a aba (ou o perfil), não a cada volta à tela inicial.
  r.get('/achievements', needUser, guard(async (req, res) => res.json(Object.assign({ ok: true }, await achievementsOf(req.user.id)))));

  r.post('/profile', needUser, guard(async (req, res) => {       // só o avatar: o NOME é sorteado pelo jogo (veja /profile/nickname)
    const b = req.body || {};
    const avatar = b.avatar === '' ? '' : (b.avatar === undefined ? req.user.avatar : (cleanAvatar(b.avatar) || req.user.avatar));
    await db.q('UPDATE users SET avatar = $1 WHERE id = $2', [avatar, req.user.id]);
    res.json({ ok: true, me: await meOf(Object.assign({}, req.user, { avatar })) });
  }));

  r.post('/import', needUser, guard(async (req, res) => {      // traz os melhores tempos do modo visitante
    const bests = sanitizeBests((req.body || {}).bests);
    const cur = req.user.bests || {};
    for (const [k, v] of Object.entries(bests)) if (!cur[k] || v < cur[k]) cur[k] = v;
    await db.q('UPDATE users SET bests = $1 WHERE id = $2', [JSON.stringify(cur), req.user.id]);
    res.json({ ok: true, bests: cur });
  }));

  // apaga a conta e TUDO que está ligado a ela (usado por /delete e por /underage)
  async function eraseAccount(user) {
    await db.q('DELETE FROM users WHERE id = $1', [user.id]);          // sessões, saves, bloqueios, denúncias e histórico saem em cascata
    for (const k of [...blockSet]) if (k.indexOf(user.id) >= 0) blockSet.delete(k);
    io.to('u:' + user.id).emit('acc:ev', { t: 'deleted' });
    revokeSocketSessions(user.id);
  }
  r.post('/delete', needUser, guard(async (req, res) => {       // apaga o perfil e TUDO que está ligado a ele; exige o código-chave
    const b = req.body || {};
    if (b.confirm !== 'EXCLUIR') return bad(res, 400, 'confirm');
    if (!allow('del:' + req.user.id, 5, 10 * 60 * 1000)) return bad(res, 429, 'rate');
    const secret = normSecret(b.secret);
    if (req.user.secret_hash && !(secret && await checkPassword(secret, req.user.secret_hash))) return bad(res, 401, 'bad_login');
    await eraseAccount(req.user);
    res.json({ ok: true });
  }));

  // O jogo não é indicado para menores de 16 anos: quem informa isso na tela de idade do app e ainda tem uma conta neste aparelho tem a conta APAGADA.
  // Sem pedir senha de propósito: a pessoa já está com a sessão aberta e acabou de declarar que não pode usar o jogo (e só apaga a PRÓPRIA conta).
  r.post('/underage', needUser, guard(async (req, res) => {
    if (!allow('under:' + req.user.id, 5, 10 * 60 * 1000)) return bad(res, 429, 'rate');
    await eraseAccount(req.user);
    res.json({ ok: true });
  }));

  r.get('/matches', needUser, guard(async (req, res) => {
    const rows = (await db.q('SELECT mode, image_label, pieces, result, completed, duration_ms, opponent, created_at FROM matches WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 6', [req.user.id])).rows;
    res.json({ ok: true, matches: rows.map((m) => ({ mode: m.mode, imageLabel: m.image_label, pieces: m.pieces, result: m.result, completed: m.completed, durationMs: m.duration_ms == null ? null : Number(m.duration_ms), opponent: m.opponent, at: m.created_at })) });
  }));

  /* Biblioteca pessoal: progresso e desbloqueios somente do titular da sessão. */
  r.get('/library', needUser, guard(async (req, res) => res.json({ ok: true, library: await libraryService.status(req.user.id) })));
  r.post('/library/unlock', needUser, guard(async (req, res) => {
    if (!allow('library:buy:' + req.user.id, 15, 60 * 1000)) return bad(res, 429, 'rate');
    const result = await libraryService.buy(req.user.id, (req.body || {}).categoryId);
    if (!result.ok) return bad(res, result.error === 'gems' ? 409 : 400, result.error);
    res.json(result);
  }));

  /* Loja (bandejas): compra com as gemas já existentes, atômica e só no servidor. O catálogo/preços vêm de shop.js (e do /api/config para visitantes). */
  const shopGate = (req, res, max) => allow('shop:' + req.user.id, max, 60 * 1000) ? true : (bad(res, 429, 'rate'), false);
  r.get('/shop', needUser, guard(async (req, res) => {
    if (!shopGate(req, res, 60)) return;
    const st = await shopService.status(req.user.id); if (!st) return bad(res, 401, 'auth');
    res.json(Object.assign({ ok: true }, shop.catalog(), st));
  }));
  r.post('/shop/buy', needUser, guard(async (req, res) => {
    if (!shopGate(req, res, 15)) return;
    const out = await shopService.buy(req.user.id, (req.body || {}).itemId);
    if (!out.ok) return res.status(out.error === 'gems' ? 409 : out.error === 'auth' ? 401 : 400).json(out);       // devolve saldo, preço e quantas gemas FALTAM
    res.json(out);
  }));
  r.post('/shop/equip', needUser, guard(async (req, res) => {
    if (!shopGate(req, res, 30)) return;
    const out = await shopService.equip(req.user.id, (req.body || {}).itemId, (req.body || {}).category);
    if (!out.ok) return bad(res, out.error === 'locked' ? 403 : out.error === 'auth' ? 401 : 400, out.error);
    res.json(out);
  }));
  r.post('/shop/prefs', needUser, guard(async (req, res) => {
    if (!shopGate(req, res, 60)) return;
    const b = req.body || {}, p = {};
    if (Object.prototype.hasOwnProperty.call(b, 'color')) { p.itemId = b.itemId; p.color = b.color; }
    if (Object.prototype.hasOwnProperty.call(b, 'anim')) p.anim = b.anim;
    const out = await shopService.setPrefs(req.user.id, p);
    if (!out.ok) return bad(res, out.error === 'locked' ? 403 : out.error === 'auth' ? 401 : 400, out.error);
    res.json(out);
  }));

  r.get('/save', needUser, guard(async (req, res) => res.json({ ok: true, save: await saveSummary(req.user.id) })));
  r.post('/save/discard', needUser, guard(async (req, res) => { await db.q('DELETE FROM saves WHERE user_id = $1', [req.user.id]); res.json({ ok: true }); }));

  app.use('/api/acc', express.json({ limit: '30kb' }), r);
  app.use('/api/acc', (err, req, res, next) => bad(res, 400, 'bad_request'));   // corpo inválido etc.

  /* ===================== salvamento do progresso ===================== */
  const timers = new Map();                       // uid -> { t, data }
  async function writeSave(uid, s) {
    if (/^custom:/.test(s.imageId)) return;           // imagens enviadas por jogadores não existem mais (LGPD): nunca se grava foto
    await db.q(
      `INSERT INTO saves (user_id, image_id, image_label, pieces, locked, elapsed_ms, partner_name, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, now())
       ON CONFLICT (user_id) DO UPDATE SET image_id = EXCLUDED.image_id, image_label = EXCLUDED.image_label, pieces = EXCLUDED.pieces,
         locked = EXCLUDED.locked, elapsed_ms = EXCLUDED.elapsed_ms, partner_name = EXCLUDED.partner_name, updated_at = now()`,
      [uid, s.imageId, s.imageLabel, s.pieces, JSON.stringify(s.locked), Math.round(s.elapsedMs), s.partner]);
  }
  function flush(uid) {
    const e = timers.get(uid);
    if (!e) return Promise.resolve();
    clearTimeout(e.t); timers.delete(uid);
    return writeSave(uid, e.data).catch((err) => console.error('[contas] salvar:', err.message));
  }
  // chamado pelo servidor quando algo muda numa sala cooperativa: guarda o ESTADO ATUAL de cada jogador com conta (com atraso, sem pesar)
  function noteCoop(room, immediate) {
    if (room.solo) return;                       // o Solo nunca grava no "Continuar jogando" do cooperativo (tabela saves: uma linha por jogador)
    for (let i = 0; i < 2; i++) {
      const p = room.players[i];
      if (!p || !p.uid) continue;
      const locked = room.pieces.filter((x) => x.locked).map((x) => x.id);
      if (!locked.length || room.status === 'won') continue;
      const other = room.players[1 - i];
      const data = { imageId: room.imageId, imageLabel: imageLabel(room.imageId), pieces: room.pieces.length, locked, elapsedMs: d.elapsedOf(room), partner: other ? other.name : '' };
      const old = timers.get(p.uid);
      if (old) clearTimeout(old.t);
      const t = immediate ? null : setTimeout(() => flush(p.uid), SAVE_DEBOUNCE_MS);
      if (t && t.unref) t.unref();
      timers.set(p.uid, { t, data });
      if (immediate) flush(p.uid);
    }
  }
  async function loadSave(uid) {
    const s = await one('SELECT image_id, pieces, locked, elapsed_ms, partner_name FROM saves WHERE user_id = $1', [uid]);      // nunca lê custom_image
    if (!s) return null;
    return { imageId: s.image_id, pieces: s.pieces, locked: s.locked, elapsedMs: Number(s.elapsed_ms), partner: s.partner_name };
  }
  const deleteSave = async (uid) => { const e = timers.get(uid); if (e) { clearTimeout(e.t); timers.delete(uid); } await db.q('DELETE FROM saves WHERE user_id = $1', [uid]); };

  /* ===================== XP E NÍVEIS =====================
   * Tudo que vale XP é calculado AQUI no servidor (o celular só mostra). Cada pagamento acontece dentro de uma transação que trava a
   * linha do jogador e grava uma "ref" única: reconectar, recarregar a página ou chamar duas vezes NUNCA paga duas vezes.
   * As fórmulas e tabelas ficam em xp.js. */
  const levelMap = new Map();                                    // uid -> nível (as salas mostram o nível sem consultar o banco)
  const levelOf = (uid) => levelMap.get(uid) || 0;
  async function tx(fn) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const r = await fn((text, params) => client.query(text, params));
      await client.query('COMMIT');
      return r;
    } catch (e) { try { await client.query('ROLLBACK'); } catch (e2) { /* ignora */ } throw e; }
    finally { client.release(); }
  }
  const DAY_START = "(date_trunc('day', now() AT TIME ZONE 'America/Fortaleza') AT TIME ZONE 'America/Fortaleza')";   // "hoje" no horário de Fortaleza

  // Converte o HISTÓRICO ANTIGO em XP, uma única vez por jogador (conclusões, com a mesma redução por repetição; conquistas vêm à parte).
  async function ensureSeeded(uid) {
    const r = await seedTx(uid);
    if (r.fresh) {                                                // as conquistas que o jogador JÁ tinha também valem XP, sem aviso de "nova conquista"
      try { const ach = await awardAchievements(uid); if (ach) { r.xp = ach.after; levelMap.set(uid, xpm.levelFromXp(ach.after)); } } catch (e) { /* segue */ }
    }
    return r.xp;
  }
  async function seedTx(uid) {
    return tx(async (q) => {
      const u = (await q('SELECT xp, xp_seeded FROM users WHERE id = $1 FOR UPDATE', [uid])).rows[0];
      if (!u) return { xp: 0, fresh: false };
      if (u.xp_seeded) { levelMap.set(uid, xpm.levelFromXp(u.xp)); return { xp: u.xp, fresh: false }; }
      const rows = (await q('SELECT image_label, pieces, completed, custom, duration_ms FROM matches WHERE user_id = $1 ORDER BY created_at, id', [uid])).rows;
      const clears = new Map(); let total = 0, n = 0;
      for (const m of rows) {
        if (!m.completed) continue;
        if (m.duration_ms != null && Number(m.duration_ms) < xpm.minMs(m.pieces)) continue;       // mesmo tempo mínimo das partidas novas
        const key = xpm.puzzleKey(m.image_label, m.pieces, m.custom), c = clears.get(key) || 0;
        total += Math.max(1, Math.round(xpm.baseXp(m.pieces) * xpm.repFactor(c) * (m.custom ? xpm.CUSTOM_MULT : 1)));
        clears.set(key, c + 1); n++;
      }
      for (const [k, c] of clears) await q('INSERT INTO puzzle_clears (user_id, puzzle_key, clears) VALUES ($1,$2,$3) ON CONFLICT (user_id, puzzle_key) DO UPDATE SET clears = puzzle_clears.clears + EXCLUDED.clears', [uid, k, c]);
      if (total > 0) await q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1,'seed','seed',$2,$3) ON CONFLICT (user_id, ref) DO NOTHING", [uid, total, JSON.stringify({ matches: rows.length, completions: n })]);
      const r = await q('UPDATE users SET xp = xp + $1, xp_seeded = true WHERE id = $2 RETURNING xp', [total, uid]);
      levelMap.set(uid, xpm.levelFromXp(r.rows[0].xp));
      return { xp: r.rows[0].xp, fresh: true };
    });
  }
  // para listas: converte quem ainda não foi convertido e atualiza o campo xp das linhas
  async function seedMany(rows) {
    for (const r of rows) {
      if (r.xp_seeded === false && r.other) { try { r.xp = await ensureSeeded(r.other); } catch (e) { /* segue com o que tem */ } }
      if (r.other && r.xp != null) levelMap.set(r.other, xpm.levelFromXp(r.xp));
    }
    return rows;
  }
  async function xpTotal(uid) { const r = await one('SELECT xp, xp_seeded FROM users WHERE id = $1', [uid]); if (!r) return 0; return r.xp_seeded ? r.xp : ensureSeeded(uid); }

  // Paga UMA partida para UM jogador. Devolve null se já foi paga antes (ref repetida).
  async function awardMatch(uid, o) {
    return tx(async (q) => {
      const u = (await q('SELECT xp FROM users WHERE id = $1 FOR UPDATE', [uid])).rows[0];
      if (!u) return null;
      if ((await q('SELECT 1 FROM xp_events WHERE user_id = $1 AND ref = $2', [uid, o.ref])).rowCount) return null;
      const key = xpm.puzzleKey(o.label, o.pieces, o.custom);
      const clears = ((await q('SELECT clears FROM puzzle_clears WHERE user_id = $1 AND puzzle_key = $2', [uid, key])).rows[0] || {}).clears || 0;
      const pk = o.partnerUid || 'guest';
      const t = (await q(
        `SELECT count(*) FILTER (WHERE (meta->'parts'->>'participation')::int > 0)::int AS part,
                count(*) FILTER (WHERE meta->>'partner' = $2 AND (meta->'parts'->>'friend')::int > 0)::int AS pf,
                count(*) FILTER (WHERE meta->>'partner' = $2 AND (meta->'parts'->>'win')::int > 0)::int AS pw
           FROM xp_events WHERE user_id = $1 AND kind = 'match' AND created_at >= ${DAY_START}`, [uid, pk])).rows[0];
      const rw = xpm.matchReward({ pieces: o.pieces, completed: o.completed, won: o.won, custom: o.custom, elapsedMs: o.elapsedMs, gameMs: o.gameMs, clears, humans: o.humans, friend: o.friend, partCount: t.part, pairFriend: t.pf, pairWin: t.pw });
      if (rw.total <= 0) return { gained: 0, parts: rw.parts, before: u.xp, after: u.xp, gems: { match: 0, level: 0 }, rep: xpm.repFactor(clears), puzzle: o.label, pieces: o.pieces };
      await q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1,$2,'match',$3,$4)", [uid, o.ref, rw.total, JSON.stringify({ parts: rw.parts, puzzle: key, pieces: o.pieces, partner: pk, clears, label: o.label })]);
      if (rw.earnedCompletion) await q('INSERT INTO puzzle_clears (user_id, puzzle_key, clears, last_at) VALUES ($1,$2,1,now()) ON CONFLICT (user_id, puzzle_key) DO UPDATE SET clears = puzzle_clears.clears + 1, last_at = now()', [uid, key]);
      if (rw.earnedCompletion && o.imageId) await libraryService.recordTx(q, uid, o.imageId); // transação idempotente de XP; não paga uma segunda vez
      const r = await q('UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING xp', [rw.total, uid]);
      const gems = await gemm.creditTx(q, uid, o.ref, o.pieces, rw.earnedCompletion, u.xp, r.rows[0].xp);
      return { gained: rw.total, parts: rw.parts, before: u.xp, after: r.rows[0].xp, gems, rep: xpm.repFactor(clears), puzzle: o.label, pieces: o.pieces };
    });
  }
  // Paga as conquistas que acabaram de ser ganhas (uma única vez cada, pela ref 'ach:<id>'). Várias passadas: o XP de uma conquista
  // pode subir o nível (e as de nível, ou as de "quantas conquistas", só aparecem na passada seguinte). Limite de 6 passadas.
  async function awardAchievements(uid) {
    let total = null;
    for (let pass = 0; pass < 6; pass++) {
      const r = await awardPass(uid);
      if (!r) break;
      total = total ? { got: total.got.concat(r.got), add: total.add + r.add, before: total.before, after: r.after,
        gems: { match: 0, level: ((total.gems && total.gems.level) || 0) + ((r.gems && r.gems.level) || 0), balance: r.gems ? r.gems.balance : (total.gems && total.gems.balance) } } : r;
    }
    return total;
  }
  async function awardPass(uid) {
    const st = await achStatsOf(uid);
    const done = ach.list(library).filter((a) => !st.earned.has(a.id) && ach.isDone(a, st) && a.xp > 0);
    if (!done.length) return null;
    return tx(async (q) => {
      const u = (await q('SELECT xp FROM users WHERE id = $1 FOR UPDATE', [uid])).rows[0];
      if (!u) return null;
      const got = []; let add = 0;
      for (const a of done) {
        const r = await q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1,$2,'ach',$3,$4) ON CONFLICT (user_id, ref) DO NOTHING RETURNING id", [uid, 'ach:' + a.id, a.xp, JSON.stringify({ id: a.id, title: a.title })]);
        if (r.rowCount) { got.push({ id: a.id, icon: a.icon, title: a.title, tier: a.tier, xp: a.xp }); add += a.xp; }
      }
      if (!add) return null;
      const r = await q('UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING xp', [add, uid]);
      const gems = await gemm.creditTx(q, uid, '', 0, false, u.xp, r.rows[0].xp);
      return { got, add, before: u.xp, after: r.rows[0].xp, gems };
    });
  }

  // junta partida + conquistas em UM aviso para o celular (e atualiza o nível guardado)
  function xpEvent(m, ach) {
    if (!m && !ach) return null;                                // nada novo (partida já paga e nenhuma conquista nova)
    const before = m ? m.before : ach.before, after = ach ? ach.after : m.after;
    const gained = (m ? m.gained : 0) + (ach ? ach.add : 0);
    if (!gained) return null;
    const gemsMatch = (m && m.gems ? m.gems.match : 0) || 0;
    const gemsLevel = ((m && m.gems ? m.gems.level : 0) || 0) + ((ach && ach.gems ? ach.gems.level : 0) || 0);
    const gemsBalance = ach && ach.gems ? ach.gems.balance : (m && m.gems ? m.gems.balance : null);
    const pr = xpm.progress(after), lvBefore = xpm.levelFromXp(before);
    return { t: 'xp', gained, parts: m ? m.parts : {}, ach: ach ? ach.got : [], puzzle: m ? m.puzzle : '', pieces: m ? m.pieces : 0, rep: m ? m.rep : 1,
             total: pr.total, level: pr.level, prevLevel: lvBefore, leveledUp: pr.level > lvBefore, into: pr.into, need: pr.need, pct: pr.pct, max: pr.max,
             gemsMatch, gemsLevel, gemsBalance };
  }
  async function payMatch(uid, o) {
    try {
      await ensureSeeded(uid);
      const m = await awardMatch(uid, o);
      const ach = await awardAchievements(uid);
      const ev = xpEvent(m, ach);
      const fin = ach ? ach.after : (m ? m.after : null);
      if (fin != null) levelMap.set(uid, xpm.levelFromXp(fin));
      if (ev) notify(uid, ev);
    } catch (e) { console.error('[contas] xp:', e.message); }
  }

  /* ===================== histórico ===================== */
  async function addMatch(uid, m) {
    try {
      await db.q('INSERT INTO matches (user_id, mode, image_label, pieces, result, completed, custom, duration_ms, opponent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [uid, m.mode, m.imageLabel, m.pieces, m.result, !!m.completed, !!m.custom, m.durationMs == null ? null : Math.round(m.durationMs), m.opponent || '']);
      phraseCache.delete(uid);                          // novas frases podem ter sido liberadas
    } catch (e) { console.error('[contas] histórico:', e.message); }
  }
  async function areFriends() { return false; }       // não existe mais amizade no jogo: o bônus de amigo nunca é pago
  async function finishCoop(room) {
    const solo = room.solo === true;            // Solo: grava mode 'solo' e NÃO apaga o progresso salvo do cooperativo
    const gameMs = d.elapsedOf(room);
    for (let i = 0; i < 2; i++) {
      const p = room.players[i];
      if (!p || !p.uid) continue;
      const other = room.players[1 - i];
      const same = !!(other && other.uid && other.uid === p.uid);               // a mesma conta nos dois lados não conta como "outra pessoa"
      const partnerUid = other && other.uid && !same ? other.uid : null;
      await ensureSeeded(p.uid).catch(() => {});                                 // o histórico antigo entra ANTES desta partida
      if (!solo) await deleteSave(p.uid).catch(() => {});
      await addMatch(p.uid, { mode: solo ? 'solo' : 'coop', imageLabel: imageLabel(room.imageId), pieces: room.pieces.length, result: 'done', completed: true, custom: /^custom:/.test(room.imageId), durationMs: gameMs, opponent: other ? other.name : '' });
      await payMatch(p.uid, {
        ref: 'c:' + room.code + ':' + room.startedAt, imageId: room.imageId, label: imageLabel(room.imageId), pieces: room.pieces.length, custom: /^custom:/.test(room.imageId),
        completed: true, won: false, humans: !!other && !same, partnerUid, friend: partnerUid ? await areFriends(p.uid, partnerUid) : false, elapsedMs: gameMs, gameMs
      });
    }
  }
  async function finishDuel(room, result) {
    for (let i = 0; i < 2; i++) {
      const p = room.players[i];
      if (!p || !p.uid) continue;
      const me = result.players[i], other = result.players[1 - i], op = room.players[1 - i];
      const won = result.winner === i, completed = me.locked >= result.total;
      const same = !!(op && op.uid && op.uid === p.uid);
      const partnerUid = op && op.uid && !same ? op.uid : null;
      await ensureSeeded(p.uid).catch(() => {});
      await addMatch(p.uid, {
        mode: result.mode, imageLabel: imageLabel(result.imageId), pieces: result.total, result: won ? 'win' : 'loss',
        completed, custom: /^custom:/.test(result.imageId),
        durationMs: me.finishedMs != null ? me.finishedMs : null, opponent: other.name
      });
      await payMatch(p.uid, {
        ref: 'd:' + room.code + ':' + result.match + ':' + room.startedAt, imageId: result.imageId, label: imageLabel(result.imageId), pieces: result.total, custom: /^custom:/.test(result.imageId),
        completed, won, humans: !!op && !same, partnerUid, friend: partnerUid ? await areFriends(p.uid, partnerUid) : false,
        elapsedMs: me.finishedMs != null ? me.finishedMs : null, gameMs: result.elapsedMs
      });
    }
  }

  /* ===================== Socket.IO ===================== */
  io.on('connection', (socket) => {
    const ack = (cb, v) => { if (typeof cb === 'function') cb(v); };
    let authGeneration = 0;
    const wrap = (fn) => (data, cb) => Promise.resolve(fn(data)).then((v) => ack(cb, v), (e) => { console.error('[contas] socket:', e.message); ack(cb, { ok: false, error: 'server' }); });

    function unbind() {
      authGeneration++;
      const uid = socket.data.uid;
      socket.data.sessionHash = null;
      if (!uid) return;
      socket.data.uid = null;
      socket.leave('u:' + uid);
      const set = online.get(uid);
      if (set) { set.delete(socket.id); if (!set.size) { online.delete(uid); } }
    }

    socket.on('acc:auth', wrap(async (data) => {
      const sequence = ++authGeneration;
      const token = data && typeof data.token === 'string' ? data.token : '';
      const u = await userByToken(token);
      // Uma autenticação mais nova substitui a anterior sem invalidar a sessão legítima.
      // Antes, "auth" nessa corrida fazia o celular apagar o token ao terminar uma partida.
      if (sequence !== authGeneration || socket.connected === false) return { ok: false, error: 'superseded' };
      if (!u) return { ok: false, error: 'auth' };
      await ensureSeeded(u.id).catch(() => {});
      if (sequence !== authGeneration || socket.connected === false) return { ok: false, error: 'superseded' };
      if (!await userByToken(token)) return { ok: false, error: 'auth' }; // revogação verdadeira continua bloqueada
      const tokenHash = sha256(token);
      if (socket.data.uid === u.id && socket.data.sessionHash === tokenHash) return { ok: true }; // reautenticação idempotente
      if (socket.data.uid) unbind();
      socket.data.uid = u.id;
      socket.data.sessionHash = tokenHash;
      socket.join('u:' + u.id);
      let set = online.get(u.id);
      if (!set) { set = new Set(); online.set(u.id, set); }
      set.add(socket.id);
      db.q('UPDATE users SET last_seen = now() WHERE id = $1', [u.id]).catch(() => {});
      if (onAuth) onAuth(socket, u.id);
      return { ok: true };
    }));

    socket.on('acc:logout', wrap(async () => { unbind(); if (onAuth) onAuth(socket, null); return { ok: true }; }));
    // dentro de uma sala: bloqueia a outra pessoa (precisa ter conta) e o aparelho sai da sala
    socket.on('acc:blockPeer', wrap(async () => {
      const uid = socket.data.uid;
      if (!uid || !await socketSessionValid(socket)) return { ok: false, error: 'auth' };
      const peer = peerOf ? peerOf(socket) : null;
      if (!peer) return { ok: false, error: 'no_peer' };
      if (!peer.uid) return { ok: false, error: 'guest' };
      await blockUser(uid, peer.uid);
      return { ok: true, name: peer.name };
    }));
    // dentro de uma sala: denuncia a outra pessoa (precisa ter conta); com alsoBlock também a bloqueia
    socket.on('acc:reportPeer', wrap(async (b) => {
      const uid = socket.data.uid;
      if (!uid || !await socketSessionValid(socket)) return { ok: false, error: 'auth' };
      if (!allow('report:' + uid, 15, 3600 * 1000)) return { ok: false, error: 'rate' };
      const peer = peerOf ? peerOf(socket) : null;
      if (!peer) return { ok: false, error: 'no_peer' };
      if (!peer.uid) return { ok: false, error: 'guest' };
      const t = await one('SELECT id, name, friend_code FROM users WHERE id = $1', [peer.uid]);
      if (!t) return { ok: false, error: 'notfound' };
      const out = await fileReport(uid, t, b || {}, 'sala');
      return out.error ? { ok: false, error: out.error } : { ok: true, name: peer.name, blocked: out.blocked };
    }));
    socket.on('disconnect', () => unbind());
  });

  return {
    enabled: true,
    config: {},
    reportMailInfo: () => ({ ligado: !!(mailer && reportMail.to && REPORT_MAIL_MAX), destino: reportMail.to ? maskEmail(reportMail.to) : null, origem: reportMail.origem || null, problema: reportMail.problema || (REPORT_MAIL_MAX ? null : 'REPORT_MAIL_MAX_PER_HOUR=0 (desligado)'), maximo_por_hora: REPORT_MAIL_MAX }),
    noteCoop, flush, loadSave, deleteSave, finishCoop, finishDuel, libraryCanPlay: libraryService.canPlay, levelOf, isOnline, allowedPhrases, blockedBetween, blockUser,
    close: () => {}
  };
}

module.exports = { createAccounts, hashPassword, checkPassword, normCode, fmtCode, normSecret, newSecret, fmtSecret, maskEmail, ACHIEVEMENTS };
