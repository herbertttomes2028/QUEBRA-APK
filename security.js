'use strict';
/*
 * Proteções gerais: cabeçalhos de segurança, relatório de CSP e limite de tentativas de adivinhar o código da sala.
 */
const crypto = require('crypto');

/* ---------- IP real do visitante ----------
 * SEC-10 (17/11/2026; refeito em 17/11/2026 com o diagnóstico do Render). O pedido chega ao jogo passando por proxies, e cada um ACRESCENTA ao
 * fim do X-Forwarded-For o endereço de quem falou com ele. No Render o caminho é: celular -> Cloudflare -> proxies do Render -> jogo. O
 * /diagnostico do Render mostrou 3 endereços com o ÚLTIMO fora do Cloudflare (o Render acrescenta um salto dele) e o CF-Connecting-IP presente.
 * Regra (na ordem; tudo o que estiver À ESQUERDA do endereço escolhido pode ter sido escrito pelo próprio celular e nunca é usado):
 *   1) endereços INTERNOS no fim da lista (10.x, 172.16-31.x, 192.168.x, 100.64-127.x, link-local, IPv6 privado) são saltos do próprio Render:
 *      ninguém na internet consegue aparecer com um desses, então pular é seguro em qualquer formato de rede;
 *   2) se o salto que entregou o pedido ao Render é do Cloudflare (faixas oficiais embutidas), ou se há UM salto público logo depois de um
 *      endereço do Cloudflare (o Render hoje acrescenta um), vale o CF-Connecting-IP (o Cloudflare sempre o reescreve) ou, na falta dele, o
 *      endereço que o Cloudflare acrescentou (logo à esquerda dele). IPv6 conta pelo bloco /64 (trocar de endereço no bloco não escapa);
 *   3) sem Cloudflare reconhecido: o primeiro endereço não interno a partir do fim (antes era sempre o último).
 * Faixas oficiais do Cloudflare: https://www.cloudflare.com/ips/ (última mudança: 28/09/2023). */
const net = require('net');
const CLOUDFLARE_V4 = ['173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22', '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22'];
const CLOUDFLARE_V6 = ['2400:cb00::/32', '2606:4700::/32', '2803:f800::/32', '2405:b500::/32', '2405:8100::/32', '2a06:98c0::/29', '2c0f:f248::/32'];
// endereços que NÃO existem na internet pública: só aparecem dentro de uma rede (aqui, a do Render)
const INTERNAL_V4 = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '0.0.0.0/8'];
const INTERNAL_V6 = ['fc00::/7', 'fe80::/10', '::1/128', '::/128'];
function makeList(v4, v6) {
  const l = new net.BlockList();
  for (const c of v4) { const [a, b] = c.split('/'); l.addSubnet(a, Number(b), 'ipv4'); }
  for (const c of v6) { const [a, b] = c.split('/'); l.addSubnet(a, Number(b), 'ipv6'); }
  return l;
}
const cloudflareList = makeList(CLOUDFLARE_V4, CLOUDFLARE_V6), internalList = makeList(INTERNAL_V4, INTERNAL_V6);
function inList(list, ip) {
  const s = String(ip || '').trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, ''), v = net.isIP(s);
  if (!v) return false;
  try { return list.check(s, v === 4 ? 'ipv4' : 'ipv6'); } catch (e) { return false; }
}
const isCloudflare = (ip) => inList(cloudflareList, ip);
const isInternal = (ip) => inList(internalList, ip);
// IPv6: cada celular costuma receber um bloco /64 inteiro (bilhões de endereços). Trocar de endereço dentro do bloco não pode escapar dos
// limites, então o endereço IPv6 que vem do Cloudflare conta pelo bloco /64 (IPv4, inclusive o escrito como ::ffff:a.b.c.d, continua inteiro).
function limitKey(ip) {
  const s = String(ip || '').trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (mapped) return mapped[1];
  if (net.isIP(s) !== 6) return s;
  const [head, tail] = s.split('::'), h = head ? head.split(':') : [], t = tail === undefined ? null : (tail ? tail.split(':') : []);
  const parts = t === null ? h : h.concat(new Array(Math.max(0, 8 - h.length - t.length)).fill('0'), t);
  return parts.slice(0, 4).map((x) => (parseInt(x, 16) || 0).toString(16)).join(':') + '::/64';
}
const xffList = (h) => String((h && h['x-forwarded-for']) || '').split(',').map((s) => s.trim()).filter(Boolean);
// analisa a corrente: { chave, regra, cf } — a chave é o endereço usado nos limites (nunca sai do servidor); cf = posição do Cloudflare
function analyze(headers, remote) {
  const h = headers || {}, L = xffList(h);
  if (!L.length) return { chave: String(remote || '') || 'desconhecido', regra: 'conexão direta (sem proxy)' };
  let i = L.length - 1;
  while (i > 0 && isInternal(L[i])) i--;                                            // 1) saltos internos do Render
  let cfAt = -1;
  if (isCloudflare(L[i])) cfAt = i;                                                  // 2a) o Cloudflare entregou ao Render
  else if (i >= 2 && i === L.length - 1 && isCloudflare(L[i - 1])) cfAt = i - 1;     // 2b) um salto público do Render depois do Cloudflare (que sempre acrescenta o celular antes dele)
  if (cfAt >= 0) {
    const cf = typeof h['cf-connecting-ip'] === 'string' ? h['cf-connecting-ip'].trim() : '';
    const via = i === L.length - 1 ? (cfAt === i ? 'Cloudflare no fim' : 'Cloudflare + 1 salto público do Render') : 'Cloudflare + saltos internos do Render';
    if (net.isIP(cf)) return { chave: limitKey(cf), regra: via + ' (CF-Connecting-IP)', cf: cfAt };
    if (cfAt >= 1 && net.isIP(L[cfAt - 1])) return { chave: limitKey(L[cfAt - 1]), regra: via + ' (endereço acrescentado pelo Cloudflare)', cf: cfAt };
    return { chave: L[cfAt], regra: via + ' (corrente incompleta: endereço do Cloudflare)', cf: cfAt };
  }
  return { chave: L[i], regra: i === L.length - 1 ? 'sem Cloudflare: último endereço' : 'sem Cloudflare: primeiro endereço externo antes dos saltos internos' };
}
function clientIp(headers, remote) { return analyze(headers, remote).chave; }
// forma da corrente (para o /diagnostico do proprietário): NUNCA devolve endereços, só o TIPO de cada posição e a regra usada
function ipShape(headers) {
  const h = headers || {}, L = xffList(h), a = analyze(h, '');
  const cf = typeof h['cf-connecting-ip'] === 'string' ? h['cf-connecting-ip'].trim() : '';
  return {
    enderecos_no_x_forwarded_for: L.length,
    tipos_do_primeiro_ao_ultimo: L.map((x) => (isCloudflare(x) ? 'cloudflare' : isInternal(x) ? 'interno' : net.isIP(x) ? 'externo' : 'inválido')),
    ultimo_e_cloudflare: L.length > 0 && isCloudflare(L[L.length - 1]),
    tem_cf_connecting_ip: net.isIP(cf) > 0,
    cf_connecting_ip_igual_a_posicao: net.isIP(cf) ? L.findIndex((x) => x === cf) + 1 : 0,       // 1 = primeiro da lista; 0 = não aparece
    regra_usada: a.regra
  };
}
function ipOfSocket(socket) {
  const h = socket.handshake || {};
  return clientIp(h.headers, h.address);
}

/* ---------- cabeçalhos de segurança ---------- */
/*
 * CSP_MODE (variável do Render):  report (padrão) = só relata o que bloquearia;  enforce = bloqueia de verdade;  off = desliga.
 * Em qualquer modo, ninguém consegue embutir o jogo dentro de outro site (frame-ancestors 'none' + X-Frame-Options: DENY).
 */
const CSP_MODE = ['report', 'enforce', 'off'].includes(String(process.env.CSP_MODE || '').toLowerCase()) ? String(process.env.CSP_MODE).toLowerCase() : 'report';
const PERMISSIONS = 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), hid=(), midi=(), display-capture=(), accelerometer=(), gyroscope=(), magnetometer=(), interest-cohort=()';

const MEDIA = require('./media').fromEnv(process.env);       // origem externa das imagens da biblioteca (já validada; null = só arquivos locais)
const ADS = require('./ads').fromEnv(process.env);           // anúncios: só com ADS_MODO=teste/real as origens do Google entram (padrão: desligado, nada muda)
const adsSrc = (k) => (ADS.rede ? ' ' + require('./ads').CSP_EXTRA[k].join(' ') : '');
// com anúncios ligados, bloqueia também os interesses do navegador (Topics) e os grupos de remarketing: nada de anúncio por perfil
const PERMISSIONS_ADS = ADS.rede ? ', browsing-topics=(), join-ad-interest-group=()' : '';

function cspPolicy(host, withAncestors) {
  const h = /^[a-z0-9.\-]+(:\d+)?$/i.test(host || '') ? host : '';
  return [
    "default-src 'self'",
    "script-src 'self'" + adsSrc('script'),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:" + (MEDIA ? ' ' + MEDIA.origin : '') + adsSrc('img'),
    "media-src 'self' blob: data:",
    "font-src 'self' data:",
    "connect-src 'self'" + (h ? ' ws://' + h + ' wss://' + h : '') + adsSrc('connect'),
    (ADS.rede ? "frame-src" + adsSrc('frame') : "frame-src 'none'"),
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].concat(withAncestors ? ["frame-ancestors 'none'"] : [], ['report-uri /api/csp-report']).join('; ');
}

// Trusted Types (SÓ RELATÓRIO, nunca bloqueia): o navegador avisa quando algum código tenta gravar texto como HTML/script
// (innerHTML, new Worker('texto'), eval...). Serve para provar que o cliente não depende disso antes de, um dia, obrigar.
// Vai num cabeçalho Report-Only separado, então vale também com CSP_MODE=enforce e não afeta o que a CSP bloqueia.
const TRUSTED_TYPES_REPORT = "require-trusted-types-for 'script'; report-uri /api/csp-report";

function securityHeaders(req, res, next) {
  const h = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': PERMISSIONS + PERMISSIONS_ADS,
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin'
  };
  if (CSP_MODE === 'enforce') { h['Content-Security-Policy'] = cspPolicy(req.get('host'), true); h['Content-Security-Policy-Report-Only'] = TRUSTED_TYPES_REPORT; }
  else {
    h['Content-Security-Policy'] = "frame-ancestors 'none'";        // esta parte é sempre obrigatória
    if (CSP_MODE === 'report') h['Content-Security-Policy-Report-Only'] = cspPolicy(req.get('host'), false) + ', ' + TRUSTED_TYPES_REPORT;
  }
  res.set(h);
  if (req.secure) res.set('Strict-Transport-Security', 'max-age=15552000');      // 180 dias; só em conexões seguras
  next();
}

// relatório de violações da CSP: guarda uma contagem e as últimas ocorrências (aparecem em /diagnostico)
const cspStats = { total: 0, porRegra: Object.create(null), ultimas: [] };
function safeCspLocation(raw) {
  try { const u = new URL(String(raw || '')); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.origin + u.pathname.slice(0, 70) : '[redacted]'; }
  catch (_) { return '[redacted]'; }
}
function cspReportHandler(express) {
  const hits = new Map();
  const sweep = setInterval(() => { const now = Date.now(); for (const [ip, times] of hits) if (!times.some(t => now - t < 60000)) hits.delete(ip); }, 60000);
  sweep.unref();
  return [
    express.json({ type: ['application/json', 'application/csp-report', 'application/reports+json'], limit: '8kb' }),
    (req, res) => {
      const now = Date.now();
      if (!hits.has(req.ip) && hits.size >= 5000) return res.status(204).end();
      const a = (hits.get(req.ip) || []).filter((t) => now - t < 60000);
      if (a.length < 30) {
        a.push(now);
        const r = (req.body && (req.body['csp-report'] || (Array.isArray(req.body) ? (req.body[0] || {}).body : req.body))) || {};
        const rule = String(r['violated-directive'] || r.effectiveDirective || '?').slice(0, 60);
        const what = safeCspLocation(r['blocked-uri'] || r.blockedURL);
        cspStats.total++;
        if (Object.hasOwn(cspStats.porRegra, rule) || Object.keys(cspStats.porRegra).length < 80)
          cspStats.porRegra[rule] = (cspStats.porRegra[rule] || 0) + 1;
        cspStats.ultimas.push({ regra: rule, bloqueado: what, pagina: safeCspLocation(r['document-uri'] || r.documentURL), quando: new Date().toISOString() });
        if (cspStats.ultimas.length > 10) cspStats.ultimas.shift();
        console.log('[csp] bloquearia:', rule, '|', what);
      }
      if (hits.size < 5000 || hits.has(req.ip)) hits.set(req.ip, a);
      res.status(204).end();
    }
  ];
}

/* ---------- palpites de código de sala ----------
 * Duas contagens (17/11/2026, depois do diagnóstico do Render): antes era UMA por endereço, e como o Render entregava o mesmo endereço para
 * todo mundo, 6 códigos errados de qualquer pessoa travavam o jogo inteiro. Numa escola também: a turma toda sai pelo mesmo endereço.
 *   - por APARELHO (o perfil, se estiver logado; senão, a conexão): os limites de sempre (6 em 15 min, 30 por dia, travas de 15 min a 24 h).
 *     Quem erra muito trava só o próprio aparelho, sem gastar a cota da turma;
 *   - por ENDEREÇO (a rede: casa, escola, operadora): bem mais alto (40 em 15 min, 200 por dia), com travas mais curtas (10 min a 6 h).
 *     É o que segura quem reabre o aplicativo para escapar da trava do aparelho: mesmo assim, ~200 palpites por dia num espaço de ~1 bilhão
 *     de códigos (6 caracteres) não acham sala nenhuma.
 * O mapa de aparelhos, se encher, descarta os mais antigos (o limite por endereço continua valendo); o de endereços, se encher, descarta só
 * quem errou uma vez e nunca foi travado; se ainda assim estiver cheio, trava os NOVOS em vez de zerar a contagem de alguém (como antes). */
function createJoinGuard(env) {
  const int = (v, def, min, max) => { const n = Number(v); return Number.isInteger(n) && n >= min && n <= max ? n : def; };
  const scale = Number(env.JOIN_LOCK_SCALE) > 0 ? Number(env.JOIN_LOCK_SCALE) : 1;
  const MIN = 60 * 1000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const WINDOW = int(env.JOIN_WINDOW_MS, 15 * MIN, 60 * 1000, DAY);
  const levels = {
    dev: { max: int(env.JOIN_MAX_FAILS, 6, 2, 50), daily: int(env.JOIN_DAILY_MAX, 30, 5, 500), locks: [15 * MIN, HOUR, 6 * HOUR, DAY], cap: 20000, evict: true },
    ip: { max: int(env.JOIN_IP_MAX_FAILS, 40, 6, 400), daily: int(env.JOIN_IP_DAILY_MAX, 200, 30, 5000), locks: [10 * MIN, 30 * MIN, 2 * HOUR, 6 * HOUR], cap: 8000, evict: false }
  };
  for (const l of Object.values(levels)) { l.locks = l.locks.map((v) => v * scale); l.map = new Map(); }
  const fresh = () => ({ fails: [], day: [], strikes: 0, strikeAt: 0, lockUntil: 0, lastKey: '', lastAt: 0 });
  function get(l, key) {
    let e = l.map.get(key);
    if (e) return e;
    if (l.map.size >= l.cap) {
      const now = Date.now();
      if (!l.evict) {
        // endereços: só sai quem errou UMA vez (um erro de digitação) e nunca foi travado; quem está perto da trava nunca tem a contagem zerada.
        // Com o IP real, cada rede tem a sua entrada: sem isto, alguns milhares de erros de digitação num dia travariam quem chega depois.
        let seen = 0;                                                    // olha só os 500 mais antigos: custo fixo mesmo com o mapa cheio
        for (const [k, x] of l.map) { if (l.map.size < l.cap || ++seen > 500) break; if (x.lockUntil < now && !x.strikes && x.fails.filter((t) => now - t < WINDOW).length <= 1) l.map.delete(k); }
        if (l.map.size >= l.cap) return null;                            // cheio de quem está tentando de verdade: o novo fica travado (como antes)
      } else {
        for (const [k, x] of l.map) { if (l.map.size < l.cap) break; if (x.lockUntil < now) l.map.delete(k); }
        while (l.map.size >= l.cap) l.map.delete(l.map.keys().next().value);
      }
    }
    e = fresh(); l.map.set(key, e);
    return e;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const l of Object.values(levels)) for (const [k, e] of l.map) if (e.lockUntil < now && !e.day.some((t) => now - t < DAY)) l.map.delete(k);
  }, 10 * MIN);
  sweep.unref();
  const lockOf = (l, key, now) => { const e = key ? l.map.get(key) : null; return e && e.lockUntil > now ? e.lockUntil - now : 0; };
  function check(ip, dev) {
    const now = Date.now(), ms = Math.max(lockOf(levels.ip, ip, now), lockOf(levels.dev, dev, now));
    return ms ? { locked: true, retryMs: ms } : { locked: false, retryMs: 0 };
  }
  function count(l, key, code, now, label) {
    const e = get(l, key);
    if (!e) return false;                                              // mapa de endereços cheio: o novo fica travado
    if (e.lastKey === code && now - e.lastAt < 4000) return true;      // o mesmo código repetido em poucos segundos conta uma vez só
    e.lastKey = code; e.lastAt = now;
    e.fails = e.fails.filter((t) => now - t < WINDOW); e.fails.push(now);
    e.day = e.day.filter((t) => now - t < DAY); e.day.push(now);
    if (now - e.strikeAt > DAY) e.strikes = 0;
    let lock = 0;
    if (e.day.length >= l.daily) lock = l === levels.ip ? l.locks[l.locks.length - 1] : DAY * scale;
    else if (e.fails.length >= l.max) lock = l.locks[Math.min(e.strikes, l.locks.length - 1)];
    if (lock) {
      e.lockUntil = now + lock; e.strikes++; e.strikeAt = now; e.fails = []; if (e.day.length >= l.daily) e.day = [];
      if (l === levels.ip) console.log('[seguranca] ' + label + ' bloqueado por tentativas de adivinhar o código da sala (' + Math.round(lock / 60000) + ' min)');
    }
    return true;
  }
  return {
    // { locked, retryMs } — dev é opcional (sem ele, só o endereço conta, como antes)
    check,
    // registra um palpite errado
    fail(ip, code, dev) {
      const now = Date.now(), key = String(code);
      if (!count(levels.ip, ip, key, now, 'endereço')) return { locked: true, retryMs: 10 * MIN };
      if (dev) count(levels.dev, String(dev), key, now, 'aparelho');
      return check(ip, dev);
    },
    limits: { MAX: levels.dev.max, WINDOW, DAILY: levels.dev.daily, IP_MAX: levels.ip.max, IP_DAILY: levels.ip.daily },
    size: () => ({ enderecos: levels.ip.map.size, aparelhos: levels.dev.map.size })
  };
}

/* ---------- /diagnostico protegido por token ----------
 * DIAG_TOKEN (variável do Render, 24 a 200 caracteres) libera a versão COMPLETA do diagnóstico. Sem ela, ou com token errado, só aparece o essencial.
 * O token vai no cabeçalho "Authorization: Bearer ..." ou, para abrir no navegador, em ?token=. Comparação em tempo constante (resumos SHA-256);
 * tentativas ERRADAS limitadas por endereço (10 em 10 minutos): passado o limite nem o token certo entra, para não dar para adivinhar. */
const DIAG_MIN = 24, DIAG_MAX = 200, DIAG_MAX_WRONG = 10, DIAG_WINDOW_MS = 10 * 60 * 1000;
function createDiagGate(env, nowFn) {
  const now = nowFn || Date.now;
  const raw = String((env && env.DIAG_TOKEN) || '').trim();
  const token = raw.length >= DIAG_MIN && raw.length <= DIAG_MAX ? raw : '';
  const digest = (v) => crypto.createHash('sha256').update(String(v)).digest();
  const want = token ? digest(token) : null;
  const wrong = new Map();
  const sweep = setInterval(() => { const t = now(); for (const [ip, a] of wrong) if (!a.some((x) => t - x < DIAG_WINDOW_MS)) wrong.delete(ip); }, 60000);
  sweep.unref();
  function presented(req) {
    const m = /^Bearer\s+(\S+)\s*$/i.exec(String(req.get('authorization') || ''));
    if (m) return m[1];
    const q = req.query && req.query.token;
    return typeof q === 'string' ? q : '';
  }
  return {
    enabled: !!token,
    tooShort: raw.length > 0 && !token,
    check(req) {                       // 'ok' | 'desligado' | 'negado' | 'limitado'
      if (!want) return 'desligado';
      const ip = req.ip || 'desconhecido', t = now(), list = (wrong.get(ip) || []).filter((x) => t - x < DIAG_WINDOW_MS);
      if (list.length >= DIAG_MAX_WRONG) { wrong.set(ip, list); return 'limitado'; }
      const p = presented(req);
      if (!p) return 'negado';         // não tentou nenhum token: não conta como erro
      if (crypto.timingSafeEqual(digest(p), want)) return 'ok';
      if (wrong.size < 5000 || wrong.has(ip)) { list.push(t); wrong.set(ip, list); }
      return 'negado';
    }
  };
}

module.exports = { TRUSTED_TYPES_REPORT, ipOfSocket, clientIp, limitKey, isCloudflare, isInternal, ipShape, analyzeIp: analyze, INTERNAL_V4, INTERNAL_V6, CLOUDFLARE_V4, CLOUDFLARE_V6, securityHeaders, cspReportHandler, createJoinGuard, cspPolicy, cspStats, CSP_MODE, createDiagGate };
