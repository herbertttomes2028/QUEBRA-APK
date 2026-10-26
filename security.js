'use strict';
/*
 * Proteções gerais: cabeçalhos de segurança, relatório de CSP e limite de tentativas de adivinhar o código da sala.
 */
const crypto = require('crypto');

/* ---------- IP real do visitante (atrás do Render: o último endereço do X-Forwarded-For) ---------- */
function ipOfSocket(socket) {
  const h = socket.handshake || {};
  const xff = String((h.headers && h.headers['x-forwarded-for']) || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (h.address || 'desconhecido');
}

/* ---------- cabeçalhos de segurança ---------- */
/*
 * CSP_MODE (variável do Render):  report (padrão) = só relata o que bloquearia;  enforce = bloqueia de verdade;  off = desliga.
 * Em qualquer modo, ninguém consegue embutir o jogo dentro de outro site (frame-ancestors 'none' + X-Frame-Options: DENY).
 */
const CSP_MODE = ['report', 'enforce', 'off'].includes(String(process.env.CSP_MODE || '').toLowerCase()) ? String(process.env.CSP_MODE).toLowerCase() : 'report';
const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()';

function cspPolicy(host, withAncestors) {
  const h = /^[a-z0-9.\-]+(:\d+)?$/i.test(host || '') ? host : '';
  return [
    "default-src 'self'",
    "script-src 'self' https://accounts.google.com/gsi/client",
    "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'" + (h ? ' ws://' + h + ' wss://' + h : '') + ' https://accounts.google.com/gsi/',
    'frame-src https://accounts.google.com/gsi/',
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].concat(withAncestors ? ["frame-ancestors 'none'"] : [], ['report-uri /api/csp-report']).join('; ');
}

function securityHeaders(req, res, next) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': PERMISSIONS,
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin-allow-popups'        // mantém o login do Google (janelinha) funcionando
  };
  if (CSP_MODE === 'enforce') h['Content-Security-Policy'] = cspPolicy(req.get('host'), true);
  else {
    h['Content-Security-Policy'] = "frame-ancestors 'none'";        // esta parte é sempre obrigatória
    if (CSP_MODE === 'report') h['Content-Security-Policy-Report-Only'] = cspPolicy(req.get('host'), false);
  }
  res.set(h);
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');      // 180 dias; só em conexões seguras
  next();
}

// relatório de violações da CSP: guarda uma contagem e as últimas ocorrências (aparecem em /diagnostico)
const cspStats = { total: 0, porRegra: {}, ultimas: [] };
function cspReportHandler(express) {
  const hits = new Map();
  return [
    express.json({ type: ['application/json', 'application/csp-report', 'application/reports+json'], limit: '8kb' }),
    (req, res) => {
      const now = Date.now(), a = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
      if (a.length < 30) {
        a.push(now);
        const r = (req.body && (req.body['csp-report'] || (Array.isArray(req.body) ? (req.body[0] || {}).body : req.body))) || {};
        const rule = String(r['violated-directive'] || r.effectiveDirective || '?').slice(0, 60), what = String(r['blocked-uri'] || r.blockedURL || '?').slice(0, 120);
        cspStats.total++; cspStats.porRegra[rule] = (cspStats.porRegra[rule] || 0) + 1;
        cspStats.ultimas.push({ regra: rule, bloqueado: what, pagina: String(r['document-uri'] || r.documentURL || '').slice(0, 80), quando: new Date().toISOString() });
        if (cspStats.ultimas.length > 10) cspStats.ultimas.shift();
        console.log('[csp] bloquearia:', rule, '|', what);
      }
      hits.set(req.ip, a);
      res.status(204).end();
    }
  ];
}

/* ---------- limite de tentativas de adivinhar o código da sala ---------- */
// Padrão: 6 erros em 15 minutos bloqueiam o endereço (IP) por 15 min; reincidente: 1 h, 6 h, 24 h. Teto: 30 erros por dia.
function createJoinGuard(env) {
  const MAX = Number(env.JOIN_MAX_FAILS) || 6;
  const WINDOW = Number(env.JOIN_WINDOW_MS) || 15 * 60 * 1000;
  const DAILY = Number(env.JOIN_DAILY_MAX) || 30;
  const LOCKS = [15 * 60 * 1000, 60 * 60 * 1000, 6 * 3600 * 1000, 24 * 3600 * 1000].map((v) => (env.JOIN_LOCK_SCALE ? v * Number(env.JOIN_LOCK_SCALE) : v));
  const DAY = 24 * 3600 * 1000;
  const map = new Map();
  const get = (ip) => { let e = map.get(ip); if (!e) { e = { fails: [], day: [], strikes: 0, strikeAt: 0, lockUntil: 0, lastKey: '', lastAt: 0 }; map.set(ip, e); } return e; };
  setInterval(() => { const now = Date.now(); for (const [k, e] of map) if (e.lockUntil < now && !e.day.some((t) => now - t < DAY)) map.delete(k); }, 10 * 60 * 1000).unref();

  return {
    // { locked, retryMs }
    check(ip) { const e = map.get(ip); const now = Date.now(); return e && e.lockUntil > now ? { locked: true, retryMs: e.lockUntil - now } : { locked: false, retryMs: 0 }; },
    // registra um palpite errado (o mesmo código repetido em poucos segundos conta uma vez só)
    fail(ip, code) {
      const e = get(ip), now = Date.now(), key = String(code);
      if (e.lastKey === key && now - e.lastAt < 4000) return this.check(ip);
      e.lastKey = key; e.lastAt = now;
      e.fails = e.fails.filter((t) => now - t < WINDOW); e.fails.push(now);
      e.day = e.day.filter((t) => now - t < DAY); e.day.push(now);
      if (now - e.strikeAt > DAY) e.strikes = 0;
      let lock = 0;
      if (e.day.length >= DAILY) lock = DAY;
      else if (e.fails.length >= MAX) lock = LOCKS[Math.min(e.strikes, LOCKS.length - 1)];
      if (lock) { e.lockUntil = now + lock; e.strikes++; e.strikeAt = now; e.fails = []; if (e.day.length >= DAILY) e.day = []; console.log('[seguranca] endereço bloqueado por tentativas de adivinhar o código da sala (' + Math.round(lock / 60000) + ' min)'); }
      return this.check(ip);
    },
    limits: { MAX, WINDOW, DAILY }
  };
}

module.exports = { ipOfSocket, securityHeaders, cspReportHandler, createJoinGuard, cspPolicy, cspStats, CSP_MODE };
