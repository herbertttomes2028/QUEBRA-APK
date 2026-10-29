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
const { codeEmail } = require('./mailer');

const SESSION_MS = 60 * 24 * 3600 * 1000;       // login vale 60 dias
const INVITE_MS = Number(process.env.INVITE_MS) || 3 * 60 * 1000;                 // convite vale 3 minutos
const INVITE_SWEEP_MS = Number(process.env.INVITE_SWEEP_MS) || 20000;
const RATE_MULT = Number(process.env.ACC_RATE_MULT) || 1;     // só para testes: afrouxa os limites por endereço (IP)
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';   // sem 0/O/1/I/L, que se confundem
const SAVE_DEBOUNCE_MS = Number(process.env.SAVE_DEBOUNCE_MS) || 2000;
const GOOGLE_ISS = ['accounts.google.com', 'https://accounts.google.com'];

/* ---------- utilidades ---------- */
const b64u = (s) => Buffer.from(String(s), 'base64url').toString('utf8');
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
const COMMON_PASSWORDS = new Set(['12345678', '123456789', '1234567890', 'password', 'password1', 'senha123', 'senha1234', 'qwertyui', 'qwerty123', 'abcd1234', '11111111', '00000000', 'iloveyou', 'brasil123', '12341234', '123123123', 'minhasenha', 'quebracabeca']);
function weakPassword(pw, email, name) {
  const l = String(pw).toLowerCase();
  return COMMON_PASSWORDS.has(l) || /^(.)\1+$/.test(pw) || (email && l === String(email).split('@')[0]) || (name && l === String(name).toLowerCase());
}
function maskEmail(e) { const [u, d] = String(e || '').split('@'); return u ? u.slice(0, 1) + '***@' + d : ''; }
function normEmail(e) {
  e = String(e || '').trim().toLowerCase();
  return e.length <= 254 && /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e) ? e : null;
}

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

/* ---------- Google: confere o token de login no servidor ---------- */
let jwksCache = { at: 0, keys: [] };
async function googleKeys() {
  if (Date.now() - jwksCache.at < 6 * 3600 * 1000 && jwksCache.keys.length) return jwksCache.keys;
  const r = await fetch(process.env.GOOGLE_CERTS_URL || 'https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('não consegui buscar as chaves do Google');
  jwksCache = { at: Date.now(), keys: (await r.json()).keys || [] };
  return jwksCache.keys;
}
async function verifyGoogleIdToken(token, clientId, getKeys) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('formato');
  const header = JSON.parse(b64u(parts[0]));
  const payload = JSON.parse(b64u(parts[1]));
  if (header.alg !== 'RS256') throw new Error('algoritmo');
  const jwk = ((await (getKeys || googleKeys)()) || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('chave desconhecida');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('assinatura');
  if (!GOOGLE_ISS.includes(payload.iss)) throw new Error('emissor');
  if (!clientId || payload.aud !== clientId) throw new Error('destinatário');
  if (!payload.exp || payload.exp * 1000 < Date.now() - 60000) throw new Error('expirado');
  if (!payload.sub) throw new Error('sem identificador');
  return { sub: String(payload.sub), email: payload.email_verified ? normEmail(payload.email) : null, name: String(payload.given_name || payload.name || '') };
}

/* ---------- conquistas (calculadas a partir das estatísticas) ---------- */
const ACHIEVEMENTS = [
  { id: 'primeira', icon: '🌟', title: 'Primeira partida', desc: 'Jogue sua primeira partida', test: (s) => s.games >= 1 },
  { id: 'dez', icon: '🔟', title: 'Dez partidas', desc: 'Jogue 10 partidas', test: (s) => s.games >= 10 },
  { id: 'vitoria', icon: '🏆', title: 'Primeira vitória', desc: 'Vença uma Sala Desafio', test: (s) => s.wins >= 1 },
  { id: 'campeao', icon: '👑', title: 'Campeão', desc: 'Vença 10 desafios', test: (s) => s.wins >= 10 },
  { id: 'montador', icon: '🧩', title: 'Montador', desc: 'Conclua 5 quebra-cabeças', test: (s) => s.completed >= 5 },
  { id: 'mestre', icon: '🧠', title: 'Mestre dos 48', desc: 'Conclua um quebra-cabeça de 48 peças', test: (s) => s.maxPieces >= 48 },
  { id: 'veloz', icon: '⚡', title: 'Veloz', desc: 'Conclua 20+ peças em menos de 5 minutos', test: (s) => s.fastest20 != null && s.fastest20 < 5 * 60 * 1000 },
  { id: 'imagem', icon: '📸', title: 'Minha imagem', desc: 'Jogue com uma imagem sua', test: (s) => s.customGames >= 1 },
  { id: 'amigo', icon: '🤝', title: 'Primeiro amigo', desc: 'Adicione um amigo', test: (s) => s.friends >= 1 },
  { id: 'turma', icon: '🎉', title: 'Turma', desc: 'Tenha 5 amigos', test: (s) => s.friends >= 5 }
];

function createAccounts(d) {
  const { app, express, io, db, cleanName, cleanAvatar, roomInfo, roomOfSocket, imageLabel, getUpload, putUpload, onAuth, mailer, peerOf } = d;
  const googleClientId = d.googleClientId || null;
  const getKeys = d.googleKeys || googleKeys;

  /* ----- limites de tentativas (na memória) ----- */
  const hits = new Map();
  function allow(key, max, ms, perIp) {
    if (perIp) max *= RATE_MULT;                  // limites por endereço (IP) podem ser afrouxados nos testes
    const now = Date.now();
    const a = (hits.get(key) || []).filter((t) => now - t < ms);
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
  const publicUser = (u) => ({ code: fmtCode(u.friend_code), name: u.name, avatar: u.avatar, level: u.xp == null ? 0 : xpm.levelFromXp(u.xp) });

  async function createUser({ email, passHash, googleSub, name, avatar, bests, emailVerified }) {
    for (let tries = 0; tries < 6; tries++) {
      try {
        return await one(
          'INSERT INTO users (email, pass_hash, google_sub, name, avatar, friend_code, bests, email_verified, email_verified_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::boolean, CASE WHEN $8::boolean THEN now() END) RETURNING *',
          [email, passHash, googleSub, name, avatar, newFriendCode(), JSON.stringify(bests || {}), !!emailVerified]
        );
      } catch (e) {
        if (e.code === '23505' && /friend_code/.test(e.constraint || e.detail || '')) continue;   // código repetido: sorteia outro
        throw e;
      }
    }
    throw new Error('não consegui gerar um código de amigo');
  }

  async function newSession(uid) {
    const token = crypto.randomBytes(32).toString('base64url');
    await db.q('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,$3)', [sha256(token), uid, new Date(Date.now() + SESSION_MS)]);
    return token;
  }
  async function userByToken(token) {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    return one('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()', [sha256(token)]);
  }

  async function statsOf(uid) {
    const s = await one(
      `SELECT count(*)::int AS games,
              count(*) FILTER (WHERE result = 'win')::int AS wins,
              count(*) FILTER (WHERE result = 'loss')::int AS losses,
              count(*) FILTER (WHERE completed)::int AS completed,
              coalesce(max(pieces) FILTER (WHERE completed), 0)::int AS "maxPieces",
              min(duration_ms) FILTER (WHERE completed AND pieces >= 20)::bigint AS fastest20,
              count(*) FILTER (WHERE custom)::int AS "customGames",
              coalesce(sum(duration_ms), 0)::bigint AS "totalMs"
         FROM matches WHERE user_id = $1`, [uid]);
    const f = await one("SELECT count(*)::int AS n FROM friendships WHERE status = 'accepted' AND (user_a = $1 OR user_b = $1)", [uid]);
    return { games: s.games, wins: s.wins, losses: s.losses, completed: s.completed, maxPieces: s.maxPieces, fastest20: s.fastest20 == null ? null : Number(s.fastest20), customGames: s.customGames, totalMs: Number(s.totalMs), friends: f.n };
  }
  const achievementsOf = (st) => ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, title: a.title, desc: a.desc, done: !!a.test(st) }));

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

  async function meOf(u) {
    const xpTot = await xpTotal(u.id);                                   // converte o histórico antigo na primeira vez
    const stats = await statsOf(u.id);
    const [save, pend, inv] = await Promise.all([
      saveSummary(u.id),
      one("SELECT count(*)::int AS n FROM friendships WHERE status = 'pending' AND requested_by <> $1 AND (user_a = $1 OR user_b = $1)", [u.id]),
      one("SELECT count(*)::int AS n FROM invites WHERE to_user = $1 AND status = 'pending' AND expires_at > now()", [u.id])
    ]);
    return {
      code: fmtCode(u.friend_code), name: u.name, avatar: u.avatar, email: u.email || '', hasPassword: !!u.pass_hash, google: !!u.google_sub,
      createdAt: u.created_at, stats, achievements: achievementsOf(stats), save,
      xp: xpm.progress(xpTot), emailVerified: !!u.email_verified, mail: !!mailer, phrases: [...phrases.unlockedFor(stats)],
      pending: { requests: pend.n, invites: inv.n }
    };
  }

  /* ----- amigos ----- */
  async function friendsOf(uid) {
    const rows = (await db.q(
      `SELECT f.status, f.requested_by, f.created_at, u.id AS other, u.friend_code, u.name, u.avatar, u.xp, u.xp_seeded
         FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
        WHERE f.user_a = $1 OR f.user_b = $1 ORDER BY f.created_at DESC`, [uid])).rows;
    const out = { friends: [], incoming: [], outgoing: [] };
    await seedMany(rows);                                  // quem ainda não teve o histórico convertido em XP é convertido agora
    for (const r of rows) {
      const p = publicUser(r);
      if (r.status === 'accepted') out.friends.push(Object.assign(p, { online: isOnline(r.other) }));
      else if (r.requested_by === uid) out.outgoing.push(p);
      else out.incoming.push(Object.assign(p, { at: r.created_at }));
    }
    out.friends.sort((a, b) => (b.online - a.online) || a.name.localeCompare(b.name, 'pt'));
    const invRows = (await db.q(
      `SELECT i.id, i.kind, i.image_label, i.pieces, i.room_code, i.expires_at, u.id AS other, u.friend_code, u.name, u.avatar, u.xp, u.xp_seeded
         FROM invites i JOIN users u ON u.id = i.from_user
        WHERE i.to_user = $1 AND i.status = 'pending' AND i.expires_at > now() ORDER BY i.created_at DESC`, [uid])).rows;
    await seedMany(invRows);
    out.invites = invRows
      .map((i) => ({ id: i.id, kind: i.kind, imageLabel: i.image_label, pieces: i.pieces, expiresAt: i.expires_at, from: publicUser(i) }));
    return out;
  }
  const pairKey = (a, b) => (a < b ? [a, b] : [b, a]);
  async function friendRow(a, b) { const [x, y] = pairKey(a, b); return one('SELECT * FROM friendships WHERE user_a = $1 AND user_b = $2', [x, y]); }
  async function userByCode(code) { return code ? one('SELECT * FROM users WHERE friend_code = $1', [code]) : null; }

  async function tellFriendsPresence(uid, on) {
    try {
      const me = await one('SELECT friend_code FROM users WHERE id = $1', [uid]);
      const fs = (await db.q("SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS other FROM friendships WHERE status = 'accepted' AND (user_a = $1 OR user_b = $1)", [uid])).rows;
      for (const f of fs) if (isOnline(f.other)) notify(f.other, { t: 'presence', code: fmtCode(me.friend_code), online: on });
    } catch (e) { /* presença é só um enfeite: não derruba nada */ }
  }

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

  r.get('/status', (req, res) => res.json({ ok: true, enabled: true, google: googleClientId, mail: !!mailer }));

  function sanitizeBests(b) {
    const out = {};
    if (b && typeof b === 'object' && !Array.isArray(b)) {
      for (const [k, v] of Object.entries(b).slice(0, 100)) if (/^[\w.\-|]{1,80}$/.test(k) && Number.isFinite(v) && v > 0 && v < 1e8) out[k] = Math.round(v);
    }
    return out;
  }

  /* ----- códigos por e-mail (confirmar e-mail e trocar senha) ----- */
  const CODE_TTL_MS = 15 * 60 * 1000, CODE_COOLDOWN_MS = process.env.CODE_COOLDOWN_MS !== undefined ? Number(process.env.CODE_COOLDOWN_MS) : 60 * 1000, CODE_MAX_TRIES = 5;
  const codeHash = (uid, purpose, code) => sha256(uid + ':' + purpose + ':' + code);
  async function sendCode(u, purpose) {
    const last = await one('SELECT created_at FROM email_codes WHERE user_id = $1 AND purpose = $2', [u.id, purpose]);
    if (last && Date.now() - new Date(last.created_at).getTime() < CODE_COOLDOWN_MS) { const e = new Error('cooldown'); e.code = 'cooldown'; throw e; }
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await db.q('DELETE FROM email_codes WHERE user_id = $1 AND purpose = $2', [u.id, purpose]);
    await db.q('INSERT INTO email_codes (user_id, purpose, code_hash, expires_at) VALUES ($1,$2,$3,$4)', [u.id, purpose, codeHash(u.id, purpose, code), new Date(Date.now() + CODE_TTL_MS)]);
    try { await mailer.send(Object.assign({ to: u.email }, codeEmail(purpose, code, u.name))); }
    catch (e) {
      await db.q('DELETE FROM email_codes WHERE user_id = $1 AND purpose = $2', [u.id, purpose]);
      console.error('[contas] e-mail não enviado:', e.message);
      const err = new Error('mail'); err.code = 'mail'; throw err;
    }
  }
  async function checkCode(uid, purpose, code) {                 // 'ok' | 'bad_code' | 'expired' | 'too_many'
    const row = await one('SELECT * FROM email_codes WHERE user_id = $1 AND purpose = $2', [uid, purpose]);
    if (!row) return 'bad_code';
    if (new Date(row.expires_at).getTime() < Date.now()) { await db.q('DELETE FROM email_codes WHERE id = $1', [row.id]); return 'expired'; }
    if (row.attempts >= CODE_MAX_TRIES) return 'too_many';            // o código fica "queimado" até vencer ou o jogador pedir outro
    const good = Buffer.from(row.code_hash, 'hex'), mine = Buffer.from(codeHash(uid, purpose, code), 'hex');
    if (good.length !== mine.length || !crypto.timingSafeEqual(good, mine)) { await db.q('UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]); return 'bad_code'; }
    await db.q('DELETE FROM email_codes WHERE id = $1', [row.id]);
    return 'ok';
  }

  r.post('/register', guard(async (req, res) => {
    const b = req.body || {};
    if (!allow('reg:' + req.ip, 8, 10 * 60 * 1000, true)) return bad(res, 429, 'rate');
    const email = normEmail(b.email), pw = String(b.password || '');
    if (!email) return bad(res, 400, 'email');
    if (pw.length < 8 || pw.length > 128) return bad(res, 400, 'password');
    if (b.consent !== true) return bad(res, 400, 'consent');
    const name = cleanName(b.name) || 'Jogador', avatar = cleanAvatar(b.avatar) || '';
    if (weakPassword(pw, email, name)) return bad(res, 400, 'password_weak');
    const old = await one('SELECT * FROM users WHERE email = $1', [email]);
    if (old) {
      // Conta que NUNCA foi confirmada e está parada (sem amigos, partidas, progresso nem bloqueios) não tem dono comprovado: o endereço é liberado.
      // Se ela tem QUALQUER atividade, ela NÃO é apagada (alguém poderia digitar o e-mail dos outros só para destruir a conta):
      // o dono verdadeiro recupera pelo "Esqueci minha senha", que prova a posse do e-mail com o código.
      let livre = false;
      if (mailer && !old.email_verified && !old.legacy && !old.google_sub) {
        const act = await one(`SELECT (SELECT count(*) FROM friendships WHERE user_a = $1 OR user_b = $1) + (SELECT count(*) FROM matches WHERE user_id = $1)
                                    + (SELECT count(*) FROM saves WHERE user_id = $1) + (SELECT count(*) FROM blocks WHERE blocker = $1 OR blocked = $1) AS n`, [old.id]);
        livre = Number(act.n) === 0;
      }
      if (livre) await db.q('DELETE FROM users WHERE id = $1', [old.id]);
      else return bad(res, 409, 'email_taken');
    }
    const u = await createUser({ email, passHash: await hashPassword(pw), googleSub: null, name, avatar, bests: sanitizeBests(b.bests), emailVerified: false });
    if (mailer) {                                                  // a conta só vale depois de digitar o código enviado ao e-mail
      try { await sendCode(u, 'verify'); } catch (e) { await db.q('DELETE FROM users WHERE id = $1', [u.id]); return bad(res, 502, 'mail'); }
      return res.json({ ok: true, needsVerify: true, email: maskEmail(email) });
    }
    res.json({ ok: true, token: await newSession(u.id), me: await meOf(u) });
  }));

  r.post('/login', guard(async (req, res) => {
    const b = req.body || {};
    const email = normEmail(b.email), pw = String(b.password || '');
    if (!allow('login:' + req.ip, 20, 10 * 60 * 1000, true) || (email && !allow('login:' + email, 8, 10 * 60 * 1000))) return bad(res, 429, 'rate');
    const u = email ? await one('SELECT * FROM users WHERE email = $1', [email]) : null;
    const ok = await checkPassword(pw.slice(0, 128), u && u.pass_hash ? u.pass_hash : FAKE_HASH);
    if (!u || !u.pass_hash || !ok) return bad(res, 401, 'bad_login');
    if (mailer && !u.email_verified) {                             // senha certa, mas o e-mail ainda não foi confirmado
      let sent = false, why = null;
      try { await sendCode(u, 'verify'); sent = true; } catch (e) { why = e.code === 'cooldown' ? 'cooldown' : 'mail'; }   // cooldown = já mandamos há pouco; mail = o envio FALHOU
      return res.status(403).json({ ok: false, error: 'unverified', email: maskEmail(u.email), sent, why });
    }
    await db.q('UPDATE users SET last_seen = now() WHERE id = $1', [u.id]);
    res.json({ ok: true, token: await newSession(u.id), me: await meOf(u) });
  }));

  r.post('/verify', guard(async (req, res) => {
    const b = req.body || {};
    const email = normEmail(b.email), code = String(b.code || '').replace(/\D/g, '').slice(0, 6);
    if (!allow('ver:' + req.ip, 30, 10 * 60 * 1000, true) || (email && !allow('ver:' + email, 10, 10 * 60 * 1000))) return bad(res, 429, 'rate');
    if (!email || code.length !== 6) return bad(res, 400, 'bad_code');
    const u = await one('SELECT * FROM users WHERE email = $1', [email]);
    if (!u || u.email_verified) return bad(res, 400, 'bad_code');
    const st = await checkCode(u.id, 'verify', code);
    if (st !== 'ok') return bad(res, 400, st);
    await db.q('UPDATE users SET email_verified = true, email_verified_at = now(), last_seen = now() WHERE id = $1', [u.id]);
    u.email_verified = true;
    res.json({ ok: true, token: await newSession(u.id), me: await meOf(u) });
  }));

  r.post('/verify/resend', guard(async (req, res) => {
    if (!mailer) return bad(res, 503, 'mail_off');
    const email = normEmail((req.body || {}).email);
    if (!allow('resend:' + req.ip, 20, 3600 * 1000, true) || (email && !allow('resend:' + email, 6, 3600 * 1000))) return bad(res, 429, 'rate');
    const u = email ? await one('SELECT * FROM users WHERE email = $1', [email]) : null;
    if (u && !u.email_verified) { try { await sendCode(u, 'verify'); } catch (e) { if (e.code === 'mail') return bad(res, 502, 'mail'); } }
    res.json({ ok: true });                                        // sempre "ok": não revela quais e-mails têm conta
  }));

  r.post('/password/forgot', guard(async (req, res) => {
    if (!mailer) return bad(res, 503, 'mail_off');
    const email = normEmail((req.body || {}).email);
    if (!allow('forgot:' + req.ip, 15, 3600 * 1000, true) || (email && !allow('forgot:' + email, 5, 3600 * 1000))) return bad(res, 429, 'rate');
    const u = email ? await one('SELECT * FROM users WHERE email = $1', [email]) : null;
    if (u) { try { await sendCode(u, 'reset'); } catch (e) { if (e.code === 'mail') return bad(res, 502, 'mail'); } }
    res.json({ ok: true });
  }));

  r.post('/password/reset', guard(async (req, res) => {
    const b = req.body || {};
    const email = normEmail(b.email), code = String(b.code || '').replace(/\D/g, '').slice(0, 6), pw = String(b.password || '');
    if (!allow('reset:' + req.ip, 30, 10 * 60 * 1000, true) || (email && !allow('reset:' + email, 10, 10 * 60 * 1000))) return bad(res, 429, 'rate');
    if (!email || code.length !== 6) return bad(res, 400, 'bad_code');
    if (pw.length < 8 || pw.length > 128) return bad(res, 400, 'password');
    const u = await one('SELECT * FROM users WHERE email = $1', [email]);
    if (!u) return bad(res, 400, 'bad_code');
    if (weakPassword(pw, email, u.name)) return bad(res, 400, 'password_weak');
    const st = await checkCode(u.id, 'reset', code);
    if (st !== 'ok') return bad(res, 400, st);
    await db.q('UPDATE users SET pass_hash = $1, email_verified = true, email_verified_at = coalesce(email_verified_at, now()) WHERE id = $2', [await hashPassword(pw), u.id]);
    await db.q('DELETE FROM sessions WHERE user_id = $1', [u.id]);   // quem estava dentro (inclusive um invasor) é desconectado
    res.json({ ok: true });
  }));

  r.post('/password/change', needUser, guard(async (req, res) => {
    const b = req.body || {};
    const cur = String(b.current || ''), pw = String(b.password || '');
    if (!req.user.pass_hash) return bad(res, 400, 'no_password');
    if (!allow('pwchg:' + req.user.id, 6, 10 * 60 * 1000)) return bad(res, 429, 'rate');
    if (!(await checkPassword(cur.slice(0, 128), req.user.pass_hash))) return bad(res, 401, 'bad_login');
    if (pw.length < 8 || pw.length > 128) return bad(res, 400, 'password');
    if (weakPassword(pw, req.user.email, req.user.name)) return bad(res, 400, 'password_weak');
    if (pw === cur) return bad(res, 400, 'same');
    await db.q('UPDATE users SET pass_hash = $1 WHERE id = $2', [await hashPassword(pw), req.user.id]);
    await db.q('DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2', [req.user.id, sha256(req.token)]);   // sai dos outros aparelhos
    res.json({ ok: true });
  }));

  r.post('/google', guard(async (req, res) => {
    if (!googleClientId) return bad(res, 404, 'google_off');
    const b = req.body || {};
    if (!allow('goog:' + req.ip, 20, 10 * 60 * 1000, true)) return bad(res, 429, 'rate');
    let g;
    try { g = await verifyGoogleIdToken(b.credential, googleClientId, getKeys); } catch (e) { return bad(res, 401, 'google_token'); }
    let u = await one('SELECT * FROM users WHERE google_sub = $1', [g.sub]);
    if (!u && g.email) {                                              // e-mail já cadastrado: vincula (o Google garante que o e-mail é dele)
      u = await one('SELECT * FROM users WHERE email = $1', [g.email]);
      if (u) {
        // Se a conta por senha nunca teve o e-mail confirmado, quem a criou pode não ser o dono: a senha antiga deixa de valer
        const was = !!u.email_verified;
        await db.q('UPDATE users SET google_sub = $1, email_verified = true, email_verified_at = coalesce(email_verified_at, now()), pass_hash = CASE WHEN $3::boolean THEN pass_hash ELSE NULL END WHERE id = $2', [g.sub, u.id, was]);
        if (!was) await db.q('DELETE FROM sessions WHERE user_id = $1', [u.id]);
        u.email_verified = true;
      }
    }
    if (!u) {
      if (b.consent !== true) return bad(res, 400, 'consent');
      u = await createUser({ email: g.email, passHash: null, googleSub: g.sub, name: cleanName(b.name) || cleanName(g.name) || 'Jogador', avatar: cleanAvatar(b.avatar) || '', bests: sanitizeBests(b.bests), emailVerified: true });
    }
    res.json({ ok: true, token: await newSession(u.id), me: await meOf(u) });
  }));

  r.post('/logout', needUser, guard(async (req, res) => {
    await db.q('DELETE FROM sessions WHERE token_hash = $1', [sha256(req.token)]);
    res.json({ ok: true });
  }));
  r.post('/logout-all', needUser, guard(async (req, res) => {
    await db.q('DELETE FROM sessions WHERE user_id = $1', [req.user.id]);
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
    const [x, y] = pairKey(me, other);
    await db.q('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [x, y]);
    await db.q("UPDATE invites SET status = 'expired', responded_at = now() WHERE status = 'pending' AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))", [me, other]);
    phraseCache.delete(me); phraseCache.delete(other);
    notify(other, { t: 'unfriend' });
    notify(me, { t: 'blocks' });
    return true;
  }
  r.get('/blocks', needUser, guard(async (req, res) => {
    const rows = (await db.q('SELECT u.friend_code, u.name, u.avatar FROM blocks b JOIN users u ON u.id = b.blocked WHERE b.blocker = $1 ORDER BY b.created_at DESC', [req.user.id])).rows;
    res.json({ ok: true, blocked: rows.map(publicUser) });
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
    const t = await userByCode(normCode((req.body || {}).code));
    if (!t) return bad(res, 404, 'notfound');
    await db.q('DELETE FROM blocks WHERE blocker = $1 AND blocked = $2', [req.user.id, t.id]);
    blockSet.delete(req.user.id + ':' + t.id);
    notify(req.user.id, { t: 'blocks' });
    res.json({ ok: true });
  }));

  r.get('/me', needUser, guard(async (req, res) => res.json({ ok: true, me: await meOf(req.user) })));

  r.post('/profile', needUser, guard(async (req, res) => {
    const b = req.body || {};
    const name = cleanName(b.name);
    if (!name) return bad(res, 400, 'name');
    const avatar = b.avatar === '' ? '' : (b.avatar === undefined ? req.user.avatar : (cleanAvatar(b.avatar) || req.user.avatar));   // avatar inválido: mantém o atual
    await db.q('UPDATE users SET name = $1, avatar = $2 WHERE id = $3', [name, avatar, req.user.id]);
    res.json({ ok: true, me: await meOf(Object.assign({}, req.user, { name, avatar })) });
  }));

  r.post('/import', needUser, guard(async (req, res) => {      // traz os melhores tempos do modo visitante
    const bests = sanitizeBests((req.body || {}).bests);
    const cur = req.user.bests || {};
    for (const [k, v] of Object.entries(bests)) if (!cur[k] || v < cur[k]) cur[k] = v;
    await db.q('UPDATE users SET bests = $1 WHERE id = $2', [JSON.stringify(cur), req.user.id]);
    res.json({ ok: true, bests: cur });
  }));

  r.post('/delete', needUser, guard(async (req, res) => {       // apaga a conta e TUDO que está ligado a ela
    const b = req.body || {};
    if (b.confirm !== 'EXCLUIR') return bad(res, 400, 'confirm');
    if (req.user.pass_hash && !(await checkPassword(String(b.password || '').slice(0, 128), req.user.pass_hash))) return bad(res, 401, 'bad_login');
    const fr = (await db.q("SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS other FROM friendships WHERE user_a = $1 OR user_b = $1", [req.user.id])).rows;
    await db.q('DELETE FROM users WHERE id = $1', [req.user.id]);          // sessões, amizades, convites, saves, bloqueios e histórico saem em cascata
    for (const k of [...blockSet]) if (k.indexOf(req.user.id) >= 0) blockSet.delete(k);
    for (const f of fr) notify(f.other, { t: 'unfriend' });
    io.to('u:' + req.user.id).emit('acc:ev', { t: 'deleted' });
    res.json({ ok: true });
  }));

  r.get('/friends', needUser, guard(async (req, res) => res.json(Object.assign({ ok: true }, await friendsOf(req.user.id)))));

  r.post('/friends/search', needUser, guard(async (req, res) => {
    if (!allow('search:' + req.user.id, 20, 10 * 60 * 1000)) return bad(res, 429, 'rate');
    const code = normCode((req.body || {}).code);
    if (!code) return bad(res, 400, 'code');
    const u = await userByCode(code);
    if (!u) return bad(res, 404, 'notfound');
    if (u.id !== req.user.id && blockSet.has(u.id + ':' + req.user.id)) return bad(res, 404, 'notfound');   // quem foi bloqueado não encontra quem bloqueou
    let relation = 'none';
    if (u.id === req.user.id) relation = 'self';
    else if (blockSet.has(req.user.id + ':' + u.id)) relation = 'blocked';
    else {
      const f = await friendRow(req.user.id, u.id);
      if (f) relation = f.status === 'accepted' ? 'friend' : (f.requested_by === req.user.id ? 'pending_out' : 'pending_in');
    }
    res.json({ ok: true, user: publicUser(u), relation });
  }));

  r.post('/friends/request', needUser, guard(async (req, res) => {
    if (!allow('freq:' + req.user.id, 20, 3600 * 1000)) return bad(res, 429, 'rate');
    const code = normCode((req.body || {}).code);
    if (!code) return bad(res, 400, 'code');
    const t = await userByCode(code);
    if (!t) return bad(res, 404, 'notfound');
    if (t.id === req.user.id) return bad(res, 400, 'self');
    if (blockedBetween(req.user.id, t.id)) return bad(res, 404, 'notfound');
    const old = await friendRow(req.user.id, t.id);
    if (old) {
      if (old.status === 'accepted') return bad(res, 409, 'already_friends');
      if (old.requested_by === req.user.id) return bad(res, 409, 'already_sent');
      // ele já tinha pedido: os dois querem ser amigos, então aceita direto
      const [a, b] = pairKey(req.user.id, t.id);
      await db.q("UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE user_a = $1 AND user_b = $2", [a, b]);
      notify(t.id, { t: 'friend', from: publicUser(req.user) });
      payAfterFriend(req.user.id); payAfterFriend(t.id);
      return res.json({ ok: true, state: 'accepted', user: publicUser(t) });
    }
    const n = await one("SELECT count(*)::int AS n FROM friendships WHERE status = 'pending' AND requested_by = $1", [req.user.id]);
    if (n.n >= 30) return bad(res, 429, 'too_many');
    const [a, b] = pairKey(req.user.id, t.id);
    try { await db.q("INSERT INTO friendships (user_a, user_b, requested_by, status) VALUES ($1,$2,$3,'pending')", [a, b, req.user.id]); }
    catch (e) { if (e.code === '23505') return bad(res, 409, 'already_sent'); throw e; }
    notify(t.id, { t: 'req', from: publicUser(req.user) });
    res.json({ ok: true, state: 'pending', user: publicUser(t) });
  }));

  r.post('/friends/respond', needUser, guard(async (req, res) => {
    const b = req.body || {};
    const t = await userByCode(normCode(b.code));
    if (!t) return bad(res, 404, 'notfound');
    const f = await friendRow(req.user.id, t.id);
    if (!f || f.status !== 'pending' || f.requested_by === req.user.id) return bad(res, 404, 'notfound');
    const [x, y] = pairKey(req.user.id, t.id);
    if (b.accept === true) {
      await db.q("UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE user_a = $1 AND user_b = $2", [x, y]);
      notify(t.id, { t: 'friend', from: publicUser(req.user) });
      payAfterFriend(req.user.id); payAfterFriend(t.id);
    } else {
      await db.q('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [x, y]);
    }
    res.json({ ok: true });
  }));

  r.post('/friends/remove', needUser, guard(async (req, res) => {
    const t = await userByCode(normCode((req.body || {}).code));
    if (!t) return bad(res, 404, 'notfound');
    const [x, y] = pairKey(req.user.id, t.id);
    await db.q('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [x, y]);
    await db.q("UPDATE invites SET status = 'expired' WHERE status = 'pending' AND ((from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1))", [req.user.id, t.id]);
    notify(t.id, { t: 'unfriend' });
    res.json({ ok: true });
  }));

  /* PERFIL DO AMIGO. Só quem é amigo (com amizade aceita) e sem bloqueio entre os dois pode ver.
   * "código inexistente", "não é seu amigo", "pedido pendente" e "bloqueado" têm a MESMA resposta (ninguém descobre quem existe).
   * Nunca devolve e-mail, id, partida salva, nem os nomes dos adversários de ninguém. */
  r.get('/friends/profile', needUser, guard(async (req, res) => {
    if (!allow('fprof:' + req.user.id, 60, 60 * 1000)) return bad(res, 429, 'rate');
    const t = await userByCode(normCode(String(req.query.code || '')));
    const fr = t && t.id !== req.user.id ? await friendRow(req.user.id, t.id) : null;
    if (!t || !fr || fr.status !== 'accepted' || blockedBetween(req.user.id, t.id)) return bad(res, 403, 'forbidden');
    const st = await statsOf(t.id);
    // Só o que a tela mostra. Não sai daqui: derrotas, lista ou número de amigos, melhores tempos, partidas, e-mail, nem nome de adversário.
    res.json({
      ok: true,
      profile: {
        code: fmtCode(t.friend_code), name: t.name, avatar: t.avatar, level: xpm.levelFromXp(await xpTotal(t.id)), online: isOnline(t.id), since: t.created_at,
        stats: { games: st.games, completed: st.completed, challenges: st.wins + st.losses, wins: st.wins },
        achievements: achievementsOf(st)
      }
    });
  }));

  r.get('/matches', needUser, guard(async (req, res) => {
    const rows = (await db.q('SELECT mode, image_label, pieces, result, completed, duration_ms, opponent, created_at FROM matches WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [req.user.id])).rows;
    res.json({ ok: true, matches: rows.map((m) => ({ mode: m.mode, imageLabel: m.image_label, pieces: m.pieces, result: m.result, completed: m.completed, durationMs: m.duration_ms == null ? null : Number(m.duration_ms), opponent: m.opponent, at: m.created_at })) });
  }));

  r.get('/save', needUser, guard(async (req, res) => res.json({ ok: true, save: await saveSummary(req.user.id) })));
  r.post('/save/discard', needUser, guard(async (req, res) => { await db.q('DELETE FROM saves WHERE user_id = $1', [req.user.id]); res.json({ ok: true }); }));

  app.use('/api/acc', express.json({ limit: '30kb' }), r);
  app.use('/api/acc', (err, req, res, next) => bad(res, 400, 'bad_request'));   // corpo inválido etc.

  /* ===================== salvamento do progresso ===================== */
  const timers = new Map();                       // uid -> { t, data }
  async function writeSave(uid, s) {
    let custom = null;
    if (/^custom:/.test(s.imageId)) { const up = getUpload(s.imageId.slice(7)); if (up) custom = up.buf; else return; }   // sem a imagem não dá para retomar
    await db.q(
      `INSERT INTO saves (user_id, image_id, image_label, pieces, locked, elapsed_ms, partner_name, custom_image, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
       ON CONFLICT (user_id) DO UPDATE SET image_id = EXCLUDED.image_id, image_label = EXCLUDED.image_label, pieces = EXCLUDED.pieces,
         locked = EXCLUDED.locked, elapsed_ms = EXCLUDED.elapsed_ms, partner_name = EXCLUDED.partner_name, custom_image = EXCLUDED.custom_image, updated_at = now()`,
      [uid, /^custom:/.test(s.imageId) ? 'custom' : s.imageId, s.imageLabel, s.pieces, JSON.stringify(s.locked), Math.round(s.elapsedMs), s.partner, custom]);
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
    const s = await one('SELECT * FROM saves WHERE user_id = $1', [uid]);
    if (!s) return null;
    return { imageId: s.image_id, pieces: s.pieces, locked: s.locked, elapsedMs: Number(s.elapsed_ms), partner: s.partner_name, customImage: s.custom_image };
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
      if (rw.total <= 0) return { gained: 0, parts: rw.parts, before: u.xp, after: u.xp, rep: xpm.repFactor(clears), puzzle: o.label, pieces: o.pieces };
      await q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1,$2,'match',$3,$4)", [uid, o.ref, rw.total, JSON.stringify({ parts: rw.parts, puzzle: key, pieces: o.pieces, partner: pk, clears, label: o.label })]);
      if (rw.earnedCompletion) await q('INSERT INTO puzzle_clears (user_id, puzzle_key, clears, last_at) VALUES ($1,$2,1,now()) ON CONFLICT (user_id, puzzle_key) DO UPDATE SET clears = puzzle_clears.clears + 1, last_at = now()', [uid, key]);
      const r = await q('UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING xp', [rw.total, uid]);
      return { gained: rw.total, parts: rw.parts, before: u.xp, after: r.rows[0].xp, rep: xpm.repFactor(clears), puzzle: o.label, pieces: o.pieces };
    });
  }
  // Paga as conquistas que acabaram de ser ganhas (uma única vez cada).
  async function awardAchievements(uid) {
    const st = await statsOf(uid);
    const done = ACHIEVEMENTS.filter((a) => a.test(st) && xpm.ACH_XP[a.id]);
    if (!done.length) return null;
    return tx(async (q) => {
      const u = (await q('SELECT xp FROM users WHERE id = $1 FOR UPDATE', [uid])).rows[0];
      if (!u) return null;
      const got = []; let add = 0;
      for (const a of done) {
        const r = await q("INSERT INTO xp_events (user_id, ref, kind, amount, meta) VALUES ($1,$2,'ach',$3,$4) ON CONFLICT (user_id, ref) DO NOTHING RETURNING id", [uid, 'ach:' + a.id, xpm.ACH_XP[a.id], JSON.stringify({ id: a.id, title: a.title })]);
        if (r.rowCount) { got.push({ id: a.id, icon: a.icon, title: a.title, xp: xpm.ACH_XP[a.id] }); add += xpm.ACH_XP[a.id]; }
      }
      if (!add) return null;
      const r = await q('UPDATE users SET xp = xp + $1 WHERE id = $2 RETURNING xp', [add, uid]);
      return { got, add, before: u.xp, after: r.rows[0].xp };
    });
  }
  // junta partida + conquistas em UM aviso para o celular (e atualiza o nível guardado)
  function xpEvent(m, ach) {
    if (!m && !ach) return null;                                // nada novo (partida já paga e nenhuma conquista nova)
    const before = m ? m.before : ach.before, after = ach ? ach.after : m.after;
    const gained = (m ? m.gained : 0) + (ach ? ach.add : 0);
    if (!gained) return null;
    const pr = xpm.progress(after), lvBefore = xpm.levelFromXp(before);
    return { t: 'xp', gained, parts: m ? m.parts : {}, ach: ach ? ach.got : [], puzzle: m ? m.puzzle : '', pieces: m ? m.pieces : 0, rep: m ? m.rep : 1,
             total: pr.total, level: pr.level, prevLevel: lvBefore, leveledUp: pr.level > lvBefore, into: pr.into, need: pr.need, pct: pr.pct, max: pr.max };
  }
  async function payAfterFriend(uid) {
    try {
      await ensureSeeded(uid);                                  // o histórico antigo (e as conquistas que já existiam) entra antes, sem aviso
      const ach = await awardAchievements(uid);
      const ev = ach ? xpEvent(null, ach) : null;
      if (ach) levelMap.set(uid, xpm.levelFromXp(ach.after));
      if (ev) notify(uid, ev);
    } catch (e) { console.error('[contas] xp (amizade):', e.message); }
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
  async function areFriends(x, y) { try { const f = await friendRow(x, y); return !!(f && f.status === 'accepted'); } catch (e) { return false; } }
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
        ref: 'c:' + room.code + ':' + room.startedAt, label: imageLabel(room.imageId), pieces: room.pieces.length, custom: /^custom:/.test(room.imageId),
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
        ref: 'd:' + room.code + ':' + result.match + ':' + room.startedAt, label: imageLabel(result.imageId), pieces: result.total, custom: /^custom:/.test(result.imageId),
        completed, won, humans: !!op && !same, partnerUid, friend: partnerUid ? await areFriends(p.uid, partnerUid) : false,
        elapsedMs: me.finishedMs != null ? me.finishedMs : null, gameMs: result.elapsedMs
      });
    }
  }

  /* ===================== convites ===================== */
  async function expireInvites() {
    const rows = (await db.q("UPDATE invites SET status = 'expired', responded_at = now() WHERE status = 'pending' AND expires_at <= now() RETURNING id, from_user, to_user")).rows;
    for (const x of rows) { notify(x.from_user, { t: 'inv-up', id: x.id, status: 'expired' }); notify(x.to_user, { t: 'inv-up', id: x.id, status: 'expired' }); }
  }
  const sweeper = setInterval(() => expireInvites().catch(() => {}), INVITE_SWEEP_MS);
  sweeper.unref();

  async function sendInvite(socket, data) {
    const uid = socket.data.uid;
    if (!uid) return { ok: false, error: 'auth' };
    if (!allow('inv:' + uid, 12, 60 * 1000)) return { ok: false, error: 'rate' };
    const t = await userByCode(normCode((data || {}).to));
    if (!t) return { ok: false, error: 'notfound' };
    const f = await friendRow(uid, t.id);
    if (!f || f.status !== 'accepted') return { ok: false, error: 'not_friends' };
    const room = roomOfSocket(socket);
    if (!room) return { ok: false, error: 'no_room' };
    if (!room.free) return { ok: false, error: 'room_full' };
    const old = await one("SELECT id, room_code, expires_at FROM invites WHERE from_user = $1 AND to_user = $2 AND status = 'pending' AND expires_at > now()", [uid, t.id]);
    if (old && old.room_code === room.code) return { ok: true, id: old.id, expiresAt: old.expires_at, again: true };   // já enviado para esta sala: não duplica
    if (old) { await db.q("UPDATE invites SET status = 'expired', responded_at = now() WHERE id = $1", [old.id]); notify(t.id, { t: 'inv-up', id: old.id, status: 'expired' }); }
    const inv = await one('INSERT INTO invites (from_user, to_user, kind, room_code, image_label, pieces, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, expires_at',
      [uid, t.id, room.kind, room.code, imageLabel(room.imageId), room.pieces, new Date(Date.now() + INVITE_MS)]);
    const me = await one('SELECT friend_code, name, avatar, xp FROM users WHERE id = $1', [uid]);
    notify(t.id, { t: 'inv', invite: { id: inv.id, kind: room.kind, imageLabel: imageLabel(room.imageId), pieces: room.pieces, expiresAt: inv.expires_at, from: publicUser(me) } });
    return { ok: true, id: inv.id, expiresAt: inv.expires_at };
  }

  async function respondInvite(socket, data) {
    const uid = socket.data.uid;
    if (!uid) return { ok: false, error: 'auth' };
    const id = String((data || {}).id || '');
    if (!/^[0-9a-f-]{36}$/.test(id)) return { ok: false, error: 'notfound' };
    const inv = await one('SELECT * FROM invites WHERE id = $1 AND to_user = $2', [id, uid]);
    if (!inv) return { ok: false, error: 'notfound' };
    if (inv.status === 'accepted' && data.accept === true) return { ok: true, room: inv.room_code, kind: inv.kind, already: true };   // toque duplo: devolve o mesmo resultado
    if (inv.status !== 'pending') return { ok: false, error: inv.status === 'declined' ? 'declined' : 'expired' };
    if (new Date(inv.expires_at).getTime() <= Date.now()) {
      await db.q("UPDATE invites SET status = 'expired', responded_at = now() WHERE id = $1 AND status = 'pending'", [id]);
      notify(inv.from_user, { t: 'inv-up', id, status: 'expired' });
      return { ok: false, error: 'expired' };
    }
    const me = await one('SELECT friend_code, name, avatar, xp FROM users WHERE id = $1', [uid]);
    if (data.accept !== true) {
      await db.q("UPDATE invites SET status = 'declined', responded_at = now() WHERE id = $1 AND status = 'pending'", [id]);
      notify(inv.from_user, { t: 'inv-up', id, status: 'declined', by: publicUser(me) });
      return { ok: true, declined: true };
    }
    const info = roomInfo(inv.room_code);
    if (!info || !info.free || !info.hostConnected) {                       // a sala acabou, encheu ou o anfitrião saiu
      await db.q("UPDATE invites SET status = 'expired', responded_at = now() WHERE id = $1 AND status = 'pending'", [id]);
      notify(inv.from_user, { t: 'inv-up', id, status: 'expired' });
      return { ok: false, error: 'gone' };
    }
    const upd = await one("UPDATE invites SET status = 'accepted', responded_at = now() WHERE id = $1 AND status = 'pending' RETURNING id", [id]);
    if (!upd) return { ok: false, error: 'expired' };
    notify(inv.from_user, { t: 'inv-up', id, status: 'accepted', by: publicUser(me) });
    return { ok: true, room: inv.room_code, kind: inv.kind };
  }

  /* ===================== Socket.IO ===================== */
  io.on('connection', (socket) => {
    const ack = (cb, v) => { if (typeof cb === 'function') cb(v); };
    const wrap = (fn) => (data, cb) => Promise.resolve(fn(data)).then((v) => ack(cb, v), (e) => { console.error('[contas] socket:', e.message); ack(cb, { ok: false, error: 'server' }); });

    function unbind() {
      const uid = socket.data.uid;
      if (!uid) return;
      socket.data.uid = null;
      socket.leave('u:' + uid);
      const set = online.get(uid);
      if (set) { set.delete(socket.id); if (!set.size) { online.delete(uid); tellFriendsPresence(uid, false); } }
    }

    socket.on('acc:auth', wrap(async (data) => {
      const u = await userByToken((data || {}).token);
      if (!u) return { ok: false, error: 'auth' };
      if (socket.data.uid && socket.data.uid !== u.id) unbind();
      socket.data.uid = u.id;
      await ensureSeeded(u.id).catch(() => {});                          // (deixa o nível pronto para mostrar nas salas)
      socket.join('u:' + u.id);
      let set = online.get(u.id);
      if (!set) { set = new Set(); online.set(u.id, set); }
      const first = !set.size;
      set.add(socket.id);
      if (first) tellFriendsPresence(u.id, true);
      db.q('UPDATE users SET last_seen = now() WHERE id = $1', [u.id]).catch(() => {});
      if (onAuth) onAuth(socket, u.id);
      return { ok: true };
    }));

    socket.on('acc:logout', wrap(async () => { unbind(); if (onAuth) onAuth(socket, null); return { ok: true }; }));
    socket.on('inv:send', wrap((data) => sendInvite(socket, data)));
    socket.on('inv:respond', wrap((data) => respondInvite(socket, data || {})));
    // dentro de uma sala: bloqueia a outra pessoa (precisa ter conta) e o aparelho sai da sala
    socket.on('acc:blockPeer', wrap(async () => {
      const uid = socket.data.uid;
      if (!uid) return { ok: false, error: 'auth' };
      const peer = peerOf ? peerOf(socket) : null;
      if (!peer) return { ok: false, error: 'no_peer' };
      if (!peer.uid) return { ok: false, error: 'guest' };
      await blockUser(uid, peer.uid);
      return { ok: true, name: peer.name };
    }));
    socket.on('disconnect', () => unbind());
  });

  return {
    enabled: true,
    config: { google: googleClientId },
    noteCoop, flush, loadSave, deleteSave, finishCoop, finishDuel, levelOf, isOnline, expireInvites, allowedPhrases, blockedBetween, blockUser,
    verifyGoogleIdToken: (t) => verifyGoogleIdToken(t, googleClientId, getKeys),
    close: () => { clearInterval(sweeper); }
  };
}

module.exports = { createAccounts, verifyGoogleIdToken, hashPassword, checkPassword, normCode, fmtCode, weakPassword, maskEmail, ACHIEVEMENTS };
