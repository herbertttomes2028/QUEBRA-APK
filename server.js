'use strict';

/*
 * Quebra-Cabeça a Dois — servidor
 * Express serve a pasta /public e o Socket.IO sincroniza as duas pessoas.
 * O servidor é a "fonte da verdade": ele decide quem segura cada peça,
 * quando uma peça encaixa e quando o jogo termina.
 */

const crypto = require('crypto');
const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000; // o Render define a PORT automaticamente
const PUBLIC_DIR = path.join(__dirname, 'public');
const IMG_DIR = path.join(PUBLIC_DIR, 'imagens');

/* ---------- Configuração do tabuleiro (unidades lógicas) ---------- */
const FIELD_W = 1000;   // largura da área de jogo
const BOARD_Y = 30;     // margem de cima do tabuleiro
const MAX_ROT = 3;      // giros permitidos por peça antes de "passar a vez"
const HINTS = 10;       // vezes que cada jogador pode ver a imagem esmaecida no tabuleiro
const MAX_NAME = 12;
const SPOTS = 5;            // vezes que cada jogador pode pedir "onde esta peça encaixa" (📍) por partida
const REMATCH_MS = Number(process.env.REMATCH_MS) || 30000;   // tempo que o amigo tem para aceitar um pedido de recomeçar

// Avatares permitidos (o servidor só aceita estes; qualquer outra coisa vira "sem avatar" e o jogo usa a inicial do nome)
const AVATARS = ['🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐙', '🦋', '⭐', '🚀', '🌈', '🍀'];

// Avisos com o aplicativo fechado (Web Push). As chaves são geradas na hora em que o servidor liga;
// para fixá-las, crie no Render as variáveis VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY. Para desligar: PUSH_ENABLED=false.
// Sem a biblioteca "web-push" instalada, o jogo funciona normalmente, só sem os avisos.
let webpush = null;
let PUSH_PUBLIC = null;
if (String(process.env.PUSH_ENABLED || '').toLowerCase() !== 'false') {
  try {
    webpush = require('web-push');
    let pub = process.env.VAPID_PUBLIC_KEY;
    let priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey;
      priv = k.privateKey;
    }
    const subject = process.env.VAPID_SUBJECT || process.env.RENDER_EXTERNAL_URL || 'mailto:contato@example.com';
    webpush.setVapidDetails(subject, pub, priv);
    PUSH_PUBLIC = pub;
  } catch (e) {
    webpush = null;
    PUSH_PUBLIC = null;
    console.warn('Avisos com o app fechado desligados: ' + e.message);
  }
}
// o servidor só envia avisos para estes serviços de notificação dos navegadores (evita que alguém use o jogo para
// fazer o servidor acessar endereços quaisquer)
const PUSH_HOSTS = /(^|\.)(googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com|push\.samsungosp\.com)$/i;
function validPushSub(sub) {
  if (!sub || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000 || !sub.keys) return false;
  if (typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') return false;
  if (sub.keys.p256dh.length > 200 || sub.keys.auth.length > 100) return false;
  try {
    const u = new URL(sub.endpoint);
    return u.protocol === 'https:' && PUSH_HOSTS.test(u.hostname);
  } catch (e) {
    return false;
  }
}

// Conversa entre os dois jogadores. Para desligar (ex.: uso com crianças), crie no Render a variável
// de ambiente CHAT_ENABLED com o valor false. As mensagens ficam só na memória da sala (últimas 50) e
// somem quando a sala é apagada; o servidor não as grava em disco nem as escreve no registro (log).
const CHAT_ENABLED = String(process.env.CHAT_ENABLED || '').toLowerCase() !== 'false';
const CHAT_MAX_LEN = 200;   // letras por mensagem
const CHAT_KEEP = 50;       // mensagens guardadas por sala

// Quantidades de peças disponíveis (cols × rows). As peças são sempre quadradas;
// a imagem é recortada no centro para caber na proporção da grade.
//  bw = largura do tabuleiro (quanto maior, maiores as peças montadas)
//  t  = tamanho das peças enquanto esperam na bandeja (elas crescem ao serem pegas)
const PRESETS = [
  { pieces: 6,  cols: 2, rows: 3, bw: 840, t: 240, label: 'Bem fácil' },
  { pieces: 12, cols: 3, rows: 4, bw: 960, t: 160, label: 'Fácil' },
  { pieces: 20, cols: 4, rows: 5, bw: 960, t: 135, label: 'Médio' },
  { pieces: 30, cols: 5, rows: 6, bw: 950, t: 120, label: 'Difícil' },
  { pieces: 48, cols: 6, rows: 8, bw: 780, t: 110, label: 'Desafio' }
];
const DEFAULT_PIECES = 12;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem O/0/I/1 para não confundir
// Sem limite de imagens: todas as da pasta public/imagens aparecem. (Opcional: defina MAX_IMAGES no Render para limitar.)
const MAX_IMAGES = Number(process.env.MAX_IMAGES) > 0 ? Math.floor(Number(process.env.MAX_IMAGES)) : Infinity;

function validPieces(n, fallback) {
  n = Number(n);
  return PRESETS.some((p) => p.pieces === n) ? n : fallback;
}

// calcula o desenho do campo para a quantidade de peças escolhida.
// Todas as posições das peças (x, y) são o CENTRO da peça, em unidades lógicas.
function layoutFor(pieces) {
  const pr = PRESETS.find((p) => p.pieces === pieces) || PRESETS.find((p) => p.pieces === DEFAULT_PIECES);
  const tile = pr.bw / pr.cols;                         // peça no tamanho cheio (no tabuleiro)
  const boardH = pr.rows * tile;
  const t = pr.t;                                       // peça pequena (na bandeja)
  const perRow = Math.max(1, Math.floor(FIELD_W / (t * 1.04)));
  const trayRows = Math.ceil(pr.pieces / perRow);
  const rowGap = 10;
  const trayTop = BOARD_Y + boardH + 40;
  return {
    PIECES: pr.pieces,
    COLS: pr.cols,
    ROWS: pr.rows,
    TILE: tile,
    TRAY: t,
    FIELD_W,
    FIELD_H: Math.round(trayTop + trayRows * t + (trayRows - 1) * rowGap + 25),
    BOARD_W: pr.bw,
    BOARD_H: boardH,
    BOARD_X: Math.round((FIELD_W - pr.bw) / 2),
    BOARD_Y,
    TRAY_LINE: BOARD_Y + boardH + 20,                   // abaixo desta linha a peça solta fica pequena
    SNAP: Math.round(tile * 0.33),                      // distância (entre centros) para a peça encaixar
    MAX_ROT,
    HINTS,
    TRAY_TOP: trayTop,
    PER_ROW: perRow,
    TRAY_ROWS: trayRows,
    ROW_GAP: rowGap
  };
}

/* ---------- Limites das imagens enviadas pelos jogadores ---------- */
const UPLOAD_MAX = 1536 * 1024;          // bytes por imagem (o celular manda ~100–400 KB)
const UPLOAD_MIN = 1500;
const UPLOAD_DIM = 2048;                 // lado máximo em pixels
const UPLOAD_KEEP = 80;                  // imagens guardadas ao mesmo tempo
const UPLOAD_RATE = Number(process.env.UPLOAD_RATE) || 15;   // envios por pessoa a cada 10 minutos
const UPLOAD_TOTAL = 96 * 1024 * 1024;   // memória máxima usada por todas
const UPLOAD_TTL = 8 * 3600 * 1000;      // as imagens somem sozinhas (a sala mais velha também)
const uploads = new Map();               // código -> { buf, w, h, t, last }
const uploadHits = new Map();            // ip -> horários dos últimos envios


/* ---------- Servidor HTTP ---------- */
const app = express();
app.disable('x-powered-by');

app.get('/health', (req, res) => res.type('text').send('ok'));

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ images: listImages(), presets: PRESETS, defaultPieces: DEFAULT_PIECES, hints: HINTS, spots: SPOTS, maxName: MAX_NAME, chat: CHAT_ENABLED, avatars: AVATARS, push: PUSH_PUBLIC ? { key: PUSH_PUBLIC } : null, duel: challenge.config, upload: { maxBytes: UPLOAD_MAX, maxDim: UPLOAD_DIM }, accounts: { enabled: !!accounts, google: accounts ? accounts.config.google : null } });
});

// Verificação do aplicativo Android (APK).
// O Android só abre o aplicativo em tela cheia (sem a barra do Chrome) se encontrar, neste endereço,
// um arquivo com o nome do pacote e a impressão digital da assinatura: /.well-known/assetlinks.json
// O servidor procura o conteúdo, nesta ordem:
//   1) variável de ambiente ASSETLINKS_JSON (Render > Environment), sem precisar mexer no GitHub;
//   2) public/assetlinks.json   3) public/.well-known/assetlinks.json
//   4) assetlinks.json na raiz  5) .well-known/assetlinks.json na raiz
// Vale o primeiro que tiver conteúdo (um arquivo "[]" vazio é ignorado).
const ASSETLINKS_FILES = [
  path.join(PUBLIC_DIR, 'assetlinks.json'),
  path.join(PUBLIC_DIR, '.well-known', 'assetlinks.json'),
  path.join(__dirname, 'assetlinks.json'),
  path.join(__dirname, '.well-known', 'assetlinks.json')
];

function loadAssetLinks() {
  const env = process.env.ASSETLINKS_JSON;
  if (env && env.trim()) {
    try {
      const j = JSON.parse(env.trim().replace(/^\uFEFF/, ''));
      if (Array.isArray(j) && j.length) return { fonte: 'variável de ambiente ASSETLINKS_JSON', dados: j };
    } catch (e) {
      console.warn('ASSETLINKS_JSON não é um JSON válido; ignorando.');
    }
  }
  for (const f of ASSETLINKS_FILES) {
    try {
      const j = JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, ''));
      if (Array.isArray(j) && j.length) return { fonte: 'arquivo ' + path.relative(__dirname, f), dados: j };
    } catch (e) { /* tenta o próximo */ }
  }
  return { fonte: 'nenhuma (nada publicado ainda)', dados: [] };
}

app.get('/.well-known/assetlinks.json', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json(loadAssetLinks().dados);
});

// Página de conferência: mostra o que o servidor está publicando para o Android
app.get('/diagnostico', (req, res) => {
  const al = loadAssetLinks();
  const pacotes = [];
  for (const st of al.dados) {
    const t = st && st.target;
    if (t && t.namespace === 'android_app') pacotes.push({ pacote: t.package_name, impressoes_digitais: t.sha256_cert_fingerprints || [] });
  }
  res.set('Cache-Control', 'no-cache');
  res.json({
    servidor: 'ok',
    verificacao_do_aplicativo: {
      publicado_em: '/.well-known/assetlinks.json',
      encontrado_em: al.fonte,
      pacotes
    },
    imagens: listImages().length,
    contas: {
      ativas: !!accounts,
      banco_configurado: !!DATABASE_URL,
      login_google: !!(accounts && accounts.config.google),
      dica: accounts ? 'Contas funcionando.' : (DATABASE_URL ? 'DATABASE_URL existe, mas o banco não respondeu: veja os registros (logs) do Render.' : 'Contas desligadas: crie um banco PostgreSQL e coloque o endereço na variável DATABASE_URL (veja o guia).')
    }
  });
});

app.set('trust proxy', 1);              // atrás do Render: pega o IP real (para limitar os envios de imagem)

app.post('/api/upload', express.raw({ type: () => true, limit: UPLOAD_MAX }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  const ip = req.ip || 'x', now = Date.now();
  const hits = (uploadHits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (hits.length >= UPLOAD_RATE) return res.status(429).json({ ok: false, error: 'rate' });
  hits.push(now);
  uploadHits.set(ip, hits);
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || buf.length < UPLOAD_MIN) return res.status(400).json({ ok: false, error: 'empty' });
  if (!/^image\/jpeg\b/i.test(req.get('content-type') || '')) return res.status(415).json({ ok: false, error: 'type' });
  const size = jpegSize(buf);
  if (!size) return res.status(415).json({ ok: false, error: 'type' });
  if (size.w < 64 || size.h < 64 || size.w > UPLOAD_DIM || size.h > UPLOAD_DIM) return res.status(422).json({ ok: false, error: 'dims' });
  if (!pruneUploads(buf.length)) return res.status(503).json({ ok: false, error: 'busy' });
  const token = crypto.randomBytes(16).toString('hex');
  uploads.set(token, { buf, w: size.w, h: size.h, t: now, last: now });
  res.json({ ok: true, id: 'custom:' + token, url: 'api/up/' + token, w: size.w, h: size.h, bytes: buf.length });
});
app.use('/api/upload', (err, req, res, next) => {            // arquivo grande demais etc.
  if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'big' });
  res.status(400).json({ ok: false, error: 'bad' });
});

app.get('/api/up/:token', (req, res) => {
  const u = /^[a-f0-9]{32}$/.test(req.params.token) ? uploads.get(req.params.token) : null;
  if (!u) return res.status(404).type('text').send('nao encontrada');
  u.last = Date.now();
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff', 'Content-Length': String(u.buf.length) });
  res.send(u.buf);
});

app.use(
  express.static(PUBLIC_DIR, {
    maxAge: '1d',
    setHeaders(res, filePath) {
      if (/\.(html|js|css|webmanifest)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    }
  })
);

const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 15000,
  maxHttpBufferSize: 1e5
});

/* ---------- Imagens ---------- */
const SMALL_WORDS = new Set(['e', 'de', 'do', 'da', 'dos', 'das', 'a', 'o', 'com']);
function prettyName(file) {
  const base = file.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/([A-Za-zÀ-ÿ])(\d)/g, '$1 $2').trim();
  if (!base) return file;
  return base
    .split(/\s+/)
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function cleanChat(t) {
  const clean = String(t == null ? '' : t)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')  // controles e marcas invisíveis
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(clean).slice(0, CHAT_MAX_LEN).join('');   // conta letras/emojis inteiros
}

function cleanAvatar(a) {
  return AVATARS.includes(a) ? a : '';
}

function cleanName(n) {
  return String(n == null ? '' : n)
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
}

// Arquivo opcional public/imagens/nomes.json: { "arquivo.jpg": "Nome bonito, com acento", ... }
// Os nomes dão o rótulo na escolha da imagem e a ordem das imagens listadas; as que não estão nele vêm antes, em ordem alfabética.
function readImageNames() {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(IMG_DIR, 'nomes.json'), 'utf8'));
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch (e) {
    return {};
  }
}

function listImages() {
  try {
    const names = readImageNames();
    const order = Object.keys(names);
    return fs
      .readdirSync(IMG_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        if (ia < 0 && ib < 0) return a.localeCompare(b, 'pt', { numeric: true });
        if (ia < 0) return -1;
        if (ib < 0) return 1;
        return ia - ib;
      })
      .slice(0, MAX_IMAGES)
      .map((f) => {
        const nice = typeof names[f] === 'string' ? names[f].replace(/\s+/g, ' ').trim().slice(0, 30) : '';
        // miniatura pronta (300×400) em imagens/mini/: a galeria abre bem mais leve. Sem ela, o celular gera a miniatura.
        const mini = fs.existsSync(path.join(IMG_DIR, 'mini', f)) ? 'imagens/mini/' + encodeURIComponent(f) : null;
        return { file: f, url: 'imagens/' + encodeURIComponent(f), thumb: mini, label: nice || prettyName(f) };
      });
  } catch (e) {
    return [];
  }
}

/* ---------- Imagens enviadas pelos jogadores ("Minha imagem") ----------
 * O celular envia a imagem já enquadrada e reduzida (JPEG). O servidor confere, guarda na memória e a entrega aos DOIS
 * jogadores pelo mesmo endereço (/api/up/<código>), sem depender de nenhum caminho do celular de quem enviou.
 * Segurança: só JPEG válido, tamanho e dimensões limitados, limite de envios por pessoa e no total, código aleatório. */
function jpegSize(buf) {                 // confere o JPEG e devolve { w, h } (ou null se não for um JPEG inteiro)
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8 || buf[2] !== 0xff) return null;
  let i = 2, size = null;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) return size;         // fim da imagem
    if (m >= 0xd0 && m <= 0xd7 || m === 0x01) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (len < 2) return null;
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
      if (i + 8 >= buf.length) return null;
      size = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    if (m === 0xda) {                    // início dos dados da imagem: procura o fim (FFD9)
      const end = buf.lastIndexOf(Buffer.from([0xff, 0xd9]));
      return end > i && size ? size : null;
    }
    i += 2 + len;
  }
  return null;
}

function uploadInUse(token) {
  const id = 'custom:' + token;
  for (const r of rooms.values()) if (r.imageId === id) return true;
  return !!(challenge && challenge.usesImage(id));
}

function uploadMemory() {
  let n = 0;
  for (const u of uploads.values()) n += u.buf.length;
  return n;
}

function pruneUploads(needBytes) {       // abre espaço apagando as mais antigas que nenhuma sala usa
  const old = [...uploads.entries()].sort((a, b) => a[1].last - b[1].last);
  for (const [tk, u] of old) {
    if (uploads.size < UPLOAD_KEEP && uploadMemory() + needBytes <= UPLOAD_TOTAL) break;
    if (!uploadInUse(tk)) uploads.delete(tk);
  }
  return uploads.size < UPLOAD_KEEP && uploadMemory() + needBytes <= UPLOAD_TOTAL;
}

function validImage(file) {
  if (typeof file === 'string' && /^custom:[a-f0-9]{32}$/.test(file) && uploads.has(file.slice(7))) {
    uploads.get(file.slice(7)).last = Date.now();
    return file;
  }
  const list = listImages();
  if (!list.length) return null;
  const found = list.find((i) => i.file === file);
  return (found || list[0]).file;
}

/* ---------- Salas ---------- */
const rooms = new Map();

function newCode() {
  for (let t = 0; t < 100; t++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c) && !(challenge && challenge.has(c))) return c;     // o código é único entre salas comuns e Salas Desafio
  }
  return null;
}

function rnd(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(v, min, max) {
  v = Number(v);
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}

function buildPieces(cfg) {
  const total = cfg.COLS * cfg.ROWS;
  // posições da bandeja (embaixo do tabuleiro), espalhadas na largura toda
  const slots = [];
  const colW = cfg.FIELD_W / cfg.PER_ROW;
  for (let r = 0; r < cfg.TRAY_ROWS; r++) {
    for (let c = 0; c < cfg.PER_ROW; c++) {
      slots.push({
        x: Math.round((c + 0.5) * colW),
        y: Math.round(cfg.TRAY_TOP + r * (cfg.TRAY + cfg.ROW_GAP) + cfg.TRAY / 2)
      });
    }
  }
  shuffle(slots);
  const jit = Math.max(3, Math.round(cfg.TRAY * 0.05));
  const half = Math.ceil(cfg.TRAY / 2);   // limites inteiros (evita meio ponto)
  const pieces = [];
  for (let id = 0; id < total; id++) {
    const sl = slots[id];
    pieces.push({
      id,
      col: id % cfg.COLS,
      row: Math.floor(id / cfg.COLS),
      x: clamp(sl.x + rnd(-jit, jit), half, cfg.FIELD_W - half),
      y: clamp(sl.y + rnd(-jit, jit), half, cfg.FIELD_H - half),
      rot: rnd(0, 3),   // 0 = certa; cada giro é 90° no sentido horário
      rotUsed: 0,
      heldBy: null,     // índice do jogador que está segurando
      locked: false,
      lockedBy: null,
      z: 10 + id
    });
  }
  return pieces;
}

function createRoom(code, imageId, pieces) {
  const now = Date.now();
  const cfg = layoutFor(pieces);
  return {
    code,
    imageId,
    cfg,
    hints: [HINTS, HINTS],
    spots: [SPOTS, SPOTS],
    rematch: null,
    chat: [],
    chatSeq: 0,
    imgReady: [false, false],   // cada celular avisa quando a imagem está carregada e preparada
    status: 'waiting', // waiting | playing | won
    createdAt: now,
    lastActive: now,
    roundStart: now,
    startedAt: null,
    finishedAt: null,
    z: 100,
    pieces: buildPieces(cfg),
    players: [null, null] // { pid, socketId, connected, name }
  };
}

function connectedCount(room) {
  return room.players.filter((p) => p && p.connected).length;
}

function elapsed(room) {
  if (!room.startedAt) return 0;
  return (room.finishedAt || Date.now()) - room.startedAt;
}

function counts(room) {
  const c = [0, 0];
  for (const p of room.pieces) if (p.locked && (p.lockedBy === 0 || p.lockedBy === 1)) c[p.lockedBy]++;
  return c;
}

function lockedTotal(room) {
  return room.pieces.reduce((n, p) => n + (p.locked ? 1 : 0), 0);
}

function playersInfo(room) {
  return room.players.map((p, idx) => ({ idx, joined: !!p, connected: !!(p && p.connected), name: p ? p.name : '', avatar: p ? p.avatar || '' : '' }));
}

function meta(room) {
  return {
    status: room.status,
    players: playersInfo(room),
    elapsedMs: elapsed(room),
    counts: counts(room),
    locked: lockedTotal(room),
    total: room.pieces.length,
    hints: room.hints,
    spots: room.spots,
    loading: isCustomImage(room) && room.status === 'waiting' && connectedCount(room) === 2 && !(room.imgReady[0] && room.imgReady[1])
  };
}

function snapshot(room) {
  return Object.assign(
    {
      code: room.code,
      imageId: room.imageId,
      cfg: room.cfg,
      chat: room.chat,
      chatOn: CHAT_ENABLED,
      pieces: room.pieces.map((p) => ({
        id: p.id,
        col: p.col,
        row: p.row,
        x: Math.round(p.x),
        y: Math.round(p.y),
        rot: p.rot,
        rotUsed: p.rotUsed,
        heldBy: p.heldBy,
        locked: p.locked,
        lockedBy: p.lockedBy,
        z: p.z
      }))
    },
    meta(room)
  );
}

function broadcastMeta(room) {
  io.to(room.code).emit('meta', meta(room));
}

function isCustomImage(room) { return typeof room.imageId === 'string' && room.imageId.indexOf('custom:') === 0; }

function startIfReady(room) {
  const imagesOk = !isCustomImage(room) || (room.imgReady[0] && room.imgReady[1]);     // imagem própria: espera os dois
  if (room.status === 'waiting' && connectedCount(room) === 2 && imagesOk) {
    room.status = 'playing';
    if (!room.startedAt) room.startedAt = Date.now() - (room.carriedMs || 0);     // partida retomada: continua de onde o tempo parou
  }
}

function releaseHeldBy(room, idx, exceptId) {
  for (const p of room.pieces) {
    if (p.heldBy === idx && p.id !== exceptId) {
      p.heldBy = null;
      if (p.rotUsed >= MAX_ROT) p.rotUsed = 0; // "passou a vez": giros renovados
      io.to(room.code).emit('released', { id: p.id, by: idx, x: Math.round(p.x), y: Math.round(p.y), rotUsed: p.rotUsed });
    }
  }
}

// tenta encaixar a peça; devolve true se travou
function tryLock(room, p, idx) {
  const cfg = room.cfg;
  const tx = cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2;
  const ty = cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2;
  if (p.rot !== 0) return false;
  if (Math.hypot(p.x - tx, p.y - ty) > cfg.SNAP) return false;

  p.x = tx;
  p.y = ty;
  p.locked = true;
  p.lockedBy = idx;
  p.heldBy = null;
  p.z = 1;
  io.to(room.code).emit('locked', { id: p.id, x: tx, y: ty, by: idx, counts: counts(room), locked: lockedTotal(room) });
  if (accounts) accounts.noteCoop(room);                    // progresso salvo (com um pequeno atraso, sem pesar)

  if (lockedTotal(room) === room.pieces.length) {
    room.status = 'won';
    if (!room.startedAt) room.startedAt = room.roundStart;
    room.finishedAt = Date.now();
    io.to(room.code).emit('won', { elapsedMs: elapsed(room), counts: counts(room) });
    broadcastMeta(room);
    if (accounts) accounts.finishCoop(room).catch(() => {});  // vira histórico e apaga o progresso salvo
  }
  return true;
}

function ctx(socket) {
  const code = socket.data.code;
  if (!code) return null;
  const room = rooms.get(code);
  if (!room) return null;
  const idx = socket.data.idx;
  const pl = room.players[idx];
  if (!pl || pl.socketId !== socket.id) return null;
  room.lastActive = Date.now();
  return { room, idx };
}

function pieceFrom(room, id) {
  id = Number(id);
  if (!Number.isInteger(id) || id < 0 || id >= room.pieces.length) return null;
  return room.pieces[id];
}

function room_player(c) {
  return c.room.players[c.idx];
}

function reply(cb, data) {
  if (typeof cb === 'function') cb(data);
}

function cleanPid(pid) {
  return typeof pid === 'string' && pid.length >= 6 && pid.length <= 64 ? pid : null;
}

// coloca o socket dentro da sala (novo jogador, reconexão ou vaga de quem saiu)
function attach(room, socket, pid, name, avatar) {
  let idx = room.players.findIndex((p) => p && p.pid === pid);
  if (idx === -1) {
    idx = room.players.findIndex((p) => !p);
    if (idx === -1) idx = room.players.findIndex((p) => p && !p.connected); // assume a vaga de quem caiu
    if (idx === -1) return { error: 'full' };
    if (room.players[idx]) releaseHeldBy(room, idx, -1);
  }
  const old = room.players[idx];
  if (old && old.connected && old.socketId && old.socketId !== socket.id) {
    const oldSocket = io.sockets.sockets.get(old.socketId);
    if (oldSocket) {
      oldSocket.data.code = null;
      oldSocket.leave(room.code);
    }
  }
  const same = !!(old && old.pid === pid);
  const prevName = same ? old.name : '';
  const prevAvatar = same ? old.avatar : '';
  room.players[idx] = {
    pid,
    socketId: socket.id,
    connected: true,
    name: cleanName(name) || prevName || 'Jogador ' + (idx + 1),
    avatar: cleanAvatar(avatar) || prevAvatar || '',
    uid: socket.data.uid || null,           // conta do jogador (null = visitante)
    push: same ? old.push || null : null,
    lastPush: 0
  };
  socket.data.code = room.code;
  socket.data.idx = idx;
  socket.join(room.code);
  room.lastActive = Date.now();
  room.imgReady[idx] = false;           // quem entra (ou volta) precisa avisar de novo que a imagem está pronta
  startIfReady(room);
  return { idx, isNew: !same };
}

function emitToPlayer(room, idx, ev, data) {
  const p = room.players[idx];
  if (p && p.connected && p.socketId) io.to(p.socketId).emit(ev, data);
}

function clearRematch(room) {
  if (room.rematch) {
    clearTimeout(room.rematch.timer);
    room.rematch = null;
  }
}

function expireRematch(room) {
  if (!room.rematch) return;
  room.rematch = null;
  io.to(room.code).emit('rematch', { state: 'expired' });
}

// recomeça a partida (mesma sala e mesmos jogadores; a conversa continua)
function performRestart(room, params) {
  clearRematch(room);
  room.imageId = params.imageId;
  room.cfg = layoutFor(params.pieces);
  room.pieces = buildPieces(room.cfg);
  room.hints = [HINTS, HINTS];
  room.spots = [SPOTS, SPOTS];
  room.z = 100;
  room.finishedAt = null;
  room.roundStart = Date.now();
  room.startedAt = null;
  room.carriedMs = 0;
  room.status = 'waiting';
  room.imgReady = [false, false];
  if (accounts) for (const p of room.players) if (p && p.uid) accounts.deleteSave(p.uid).catch(() => {});   // recomeçou: o progresso antigo não vale mais
  startIfReady(room);
  io.to(room.code).emit('state', snapshot(room));
}

// aviso para quem está com o aplicativo fechado (só se a pessoa ativou os avisos)
function sendPush(room, idx, payload) {
  const pl = room.players[idx];
  if (!webpush || !pl || !pl.push || pl.connected) return;
  const now = Date.now();
  if (payload.tag === 'chat' && now - (pl.lastPush || 0) < 8000) return;   // não enche o celular de avisos
  pl.lastPush = now;
  webpush
    .sendNotification(pl.push, JSON.stringify(payload), { TTL: 600, urgency: 'high' })
    .catch((err) => {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) pl.push = null;   // aviso desfeito no aparelho
    });
}

function leaveCurrent(socket) {
  const code = socket.data.code;
  if (!code) return;
  const room = rooms.get(code);
  socket.data.code = null;
  socket.leave(code);
  if (!room) return;
  const idx = socket.data.idx;
  const pl = room.players[idx];
  if (pl && pl.socketId === socket.id) {
    pl.connected = false;
    pl.socketId = null;
    releaseHeldBy(room, idx, -1);
    if (room.rematch) {                       // quem sai cancela o pedido de recomeçar
      clearRematch(room);
      emitToPlayer(room, 1 - idx, 'rematch', { state: 'expired' });
    }
    room.lastActive = Date.now();
    if (accounts) accounts.noteCoop(room, true);
    broadcastMeta(room);
  }
}

const accHooks = { duelFinish: null };

/* ---------- Sala Desafio (módulo separado: salas, tabuleiros e eventos "ch:" próprios) ---------- */
const challenge = require('./challenge')({
  io, PRESETS, DEFAULT_PIECES, FIELD_W, BOARD_Y, MAX_ROT, HINTS, SPOTS, CHAT_ENABLED, CHAT_KEEP,
  validImage, validPieces, cleanName, cleanAvatar, cleanPid, cleanChat, newCode, layoutFor, buildPieces,
  sendPush, validPushSub, webpush, clamp, rnd, shuffle,
  onFinish: (room, result) => (accHooks.duelFinish ? accHooks.duelFinish(room, result) : null)      // histórico das disputas (só com contas ativas)
});

/* ---------- Contas, amigos, convites e progresso salvo (só ligam se DATABASE_URL estiver configurada) ---------- */
const DATABASE_URL = process.env.DATABASE_URL || '';
let accounts = null;                                     // continua nulo sem banco: o jogo funciona como sempre (visitante)

function imageLabel(id) {
  if (typeof id === 'string' && id.indexOf('custom:') === 0) return 'Minha imagem';
  const it = listImages().find((i) => i.file === id);
  return it ? it.label : String(id || '');
}
// resumo de uma sala (comum ou desafio) para o sistema de convites
function roomInfo(code) {
  const r = rooms.get(code);
  if (r) return { code, kind: 'coop', free: r.status !== 'won' && connectedCount(r) < 2 && r.players.some((p) => !p || !p.connected), hostConnected: connectedCount(r) > 0, imageId: r.imageId, pieces: r.pieces.length };
  return challenge.info(code);
}
function roomOfSocket(socket) {
  if (socket.data.code && rooms.get(socket.data.code)) return roomInfo(socket.data.code);
  return socket.data.ch ? challenge.info(socket.data.ch.code) : null;
}
// quando alguém entra/sai da conta com a sala aberta, a sala passa a saber quem é (para salvar e registrar a partida)
function bindUserToRooms(socket, uid) {
  const room = socket.data.code && rooms.get(socket.data.code);
  if (room) { const pl = room.players[socket.data.idx]; if (pl && pl.socketId === socket.id) pl.uid = uid || null; }
  challenge.bindUser(socket, uid);
}
// registra uma imagem própria vinda de um progresso salvo (devolve o código ou null)
function restoreUpload(buf) {
  if (!Buffer.isBuffer(buf)) return null;
  const size = jpegSize(buf);
  if (!size || !pruneUploads(buf.length)) return null;
  const token = crypto.randomBytes(16).toString('hex');
  uploads.set(token, { buf, w: size.w, h: size.h, t: Date.now(), last: Date.now() });
  return token;
}

/* ---------- Eventos do Socket.IO ---------- */
io.on('connection', (socket) => {
  socket.data.lastMove = 0;

  socket.on('create', (data, cb) => {
    data = data || {};
    const pid = cleanPid(data.pid);
    if (!pid) return reply(cb, { ok: false, error: 'invalid' });
    const imageId = validImage(data.imageId);
    if (!imageId) return reply(cb, { ok: false, error: 'noimages' });
    const code = newCode();
    if (!code) return reply(cb, { ok: false, error: 'busy' });

    leaveCurrent(socket);
    const room = createRoom(code, imageId, validPieces(data.pieces, DEFAULT_PIECES));
    rooms.set(code, room);
    const res = attach(room, socket, pid, data.name, data.avatar);
    reply(cb, { ok: true, idx: res.idx, snapshot: snapshot(room) });
    broadcastMeta(room);
  });

  // "Continuar jogando": recria a sala com as peças já encaixadas e o tempo que a partida tinha
  socket.on('acc:continue', async (data, cb) => {
    try {
      data = data || {};
      const uid = socket.data.uid;
      if (!accounts || !uid) return reply(cb, { ok: false, error: 'auth' });
      const pid = cleanPid(data.pid);
      if (!pid) return reply(cb, { ok: false, error: 'invalid' });
      const save = await accounts.loadSave(uid);
      if (!save) return reply(cb, { ok: false, error: 'nosave' });
      let imageId = save.imageId;
      if (imageId === 'custom') {
        const token = restoreUpload(save.customImage);
        if (!token) return reply(cb, { ok: false, error: 'imagegone' });
        imageId = 'custom:' + token;
      } else if (validImage(imageId) !== imageId) {
        return reply(cb, { ok: false, error: 'imagegone' });          // a imagem da galeria não existe mais
      }
      const code = newCode();
      if (!code) return reply(cb, { ok: false, error: 'busy' });
      leaveCurrent(socket);
      const room = createRoom(code, imageId, validPieces(save.pieces, DEFAULT_PIECES));
      room.carriedMs = save.elapsedMs || 0;
      const ids = new Set((Array.isArray(save.locked) ? save.locked : []).map(Number));
      for (const p of room.pieces) {
        if (!ids.has(p.id)) continue;
        p.x = room.cfg.BOARD_X + p.col * room.cfg.TILE + room.cfg.TILE / 2;
        p.y = room.cfg.BOARD_Y + p.row * room.cfg.TILE + room.cfg.TILE / 2;
        p.rot = 0; p.locked = true; p.lockedBy = 0; p.z = 1;
      }
      rooms.set(code, room);
      const res = attach(room, socket, pid, data.name, data.avatar);
      reply(cb, { ok: true, idx: res.idx, snapshot: snapshot(room) });
      broadcastMeta(room);
    } catch (e) { console.error('[contas] continuar:', e.message); reply(cb, { ok: false, error: 'server' }); }
  });

  socket.on('join', (data, cb) => {
    data = data || {};
    const pid = cleanPid(data.pid);
    const code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (!pid) return reply(cb, { ok: false, error: 'invalid' });
    const room = rooms.get(code);
    if (!room) return reply(cb, { ok: false, error: 'notfound' });

    if (socket.data.code && socket.data.code !== code) leaveCurrent(socket);
    const res = attach(room, socket, pid, data.name, data.avatar);
    if (res.error) return reply(cb, { ok: false, error: res.error });
    reply(cb, { ok: true, idx: res.idx, snapshot: snapshot(room) });
    broadcastMeta(room);
    if (res.isNew) {                          // avisa quem criou a sala (se estiver com o app fechado)
      sendPush(room, 1 - res.idx, { title: 'Quebra-Cabeça a Dois', body: room.players[res.idx].name + ' entrou na sala. Bora jogar?', tag: 'join', url: '/?sala=' + room.code });
    }
  });

  socket.on('grab', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const { room, idx } = c;
    const p = pieceFrom(room, data.id);
    if (!p || room.status === 'won') return;
    if (p.locked || (p.heldBy !== null && p.heldBy !== idx)) {
      socket.emit('deny', { id: p.id, reason: p.locked ? 'locked' : 'held', by: p.heldBy });
      return;
    }
    releaseHeldBy(room, idx, p.id); // só uma peça por vez
    p.heldBy = idx;
    p.z = ++room.z;
    io.to(room.code).emit('grabbed', { id: p.id, by: idx, z: p.z });
  });

  socket.on('move', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const now = Date.now();
    if (now - socket.data.lastMove < 25) return; // limite de ~40 msgs/s
    socket.data.lastMove = now;
    const p = pieceFrom(c.room, data.id);
    if (!p || p.heldBy !== c.idx) return;
    const hh = Math.ceil(c.room.cfg.TRAY / 2);
    p.x = clamp(data.x, hh, c.room.cfg.FIELD_W - hh);
    p.y = clamp(data.y, hh, c.room.cfg.FIELD_H - hh);
    socket.to(c.room.code).volatile.emit('moved', { id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
  });

  socket.on('rotate', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const { room, idx } = c;
    const p = pieceFrom(room, data.id);
    if (!p || p.heldBy !== idx || p.locked) return;
    if (p.rotUsed >= MAX_ROT) {
      socket.emit('rotated', { id: p.id, rot: p.rot, rotUsed: p.rotUsed }); // só para sincronizar
      return;
    }
    p.rot = (p.rot + 1) % 4;
    p.rotUsed++;
    io.to(room.code).emit('rotated', { id: p.id, rot: p.rot, rotUsed: p.rotUsed });
    tryLock(room, p, idx); // se girou até ficar certa em cima do lugar, encaixa
  });

  // soltar a peça (arrastou e largou, ou tocou de novo para dispensar)
  socket.on('drop', (data) => {
    const c = ctx(socket);
    if (!c || !data) return;
    const { room, idx } = c;
    const p = pieceFrom(room, data.id);
    if (!p || p.heldBy !== idx || p.locked) return;
    const hh = Math.ceil(room.cfg.TRAY / 2);
    p.x = clamp(data.x, hh, room.cfg.FIELD_W - hh);
    p.y = clamp(data.y, hh, room.cfg.FIELD_H - hh);
    if (tryLock(room, p, idx)) return;
    p.heldBy = null;
    if (p.rotUsed >= MAX_ROT) p.rotUsed = 0;
    io.to(room.code).emit('released', { id: p.id, by: idx, x: Math.round(p.x), y: Math.round(p.y), rotUsed: p.rotUsed });
  });

  // Recomeçar / trocar imagem ou peças: se o amigo está na sala, ele precisa aceitar (30 s).
  // Sozinho na sala, recomeça na hora.
  socket.on('restart', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    const { room, idx } = c;
    const other = 1 - idx;
    const op = room.players[other];
    const params = {
      imageId: validImage(data && data.imageId) || room.imageId,
      pieces: validPieces(data && data.pieces, room.cfg.PIECES)
    };
    if (!op || !op.connected) {
      performRestart(room, params);
      return reply(cb, { ok: true, immediate: true });
    }
    if (room.rematch && room.rematch.by !== idx) return reply(cb, { ok: false, error: 'pending' });
    clearRematch(room);
    room.rematch = { by: idx, params, timer: setTimeout(() => expireRematch(room), REMATCH_MS) };
    emitToPlayer(room, other, 'rematch', {
      state: 'request',
      by: idx,
      byName: room.players[idx].name,
      imageId: params.imageId,
      pieces: params.pieces,
      ms: REMATCH_MS
    });
    reply(cb, { ok: true, pending: true });
  });

  socket.on('rematch:answer', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    const { room, idx } = c;
    const r = room.rematch;
    if (!r || r.by === idx) return reply(cb, { ok: false, error: 'none' });
    if (data && data.accept) {
      performRestart(room, r.params);
      return reply(cb, { ok: true });
    }
    const by = r.by;
    clearRematch(room);
    emitToPlayer(room, by, 'rematch', { state: 'declined', byName: room.players[idx].name });
    reply(cb, { ok: true });
  });

  socket.on('rematch:cancel', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    const { room, idx } = c;
    if (!room.rematch || room.rematch.by !== idx) return reply(cb, { ok: false, error: 'none' });
    clearRematch(room);
    emitToPlayer(room, 1 - idx, 'rematch', { state: 'cancelled' });
    reply(cb, { ok: true });
  });

  // 💬 conversa: o servidor limpa o texto, limita a velocidade e repassa aos dois da sala
  socket.on('chat', (data, cb) => {
    if (!CHAT_ENABLED) return reply(cb, { ok: false, error: 'off' });
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false, error: 'room' });
    const text = cleanChat(data && data.text);
    if (!text) return reply(cb, { ok: false, error: 'empty' });
    const now = Date.now();
    const times = (socket.data.chatTimes || []).filter((t) => now - t < 10000);
    if (times.length >= 20 || (times.length && now - times[times.length - 1] < 250)) {
      socket.data.chatTimes = times;
      return reply(cb, { ok: false, error: 'rate' });
    }
    times.push(now);
    socket.data.chatTimes = times;
    const { room, idx } = c;
    const msg = { id: ++room.chatSeq, idx, name: room.players[idx].name, text, t: now };
    room.chat.push(msg);
    if (room.chat.length > CHAT_KEEP) room.chat.shift();
    io.to(room.code).emit('chat', msg);
    sendPush(room, 1 - idx, { title: msg.name, body: Array.from(text).slice(0, 90).join(''), tag: 'chat', url: '/?sala=' + room.code });
    reply(cb, { ok: true });
  });

  // o celular avisa que a imagem desta sala já está carregada e preparada
  socket.on('imgready', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    c.room.imgReady[c.idx] = true;
    startIfReady(c.room);
    broadcastMeta(c.room);
    reply(cb, { ok: true });
  });

  socket.on('hint', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false, left: 0 });
    const { room, idx } = c;
    if (room.hints[idx] <= 0) return reply(cb, { ok: false, left: 0 });
    room.hints[idx]--;
    reply(cb, { ok: true, left: room.hints[idx] });
    socket.emit('meta', meta(room));
  });

  // 📍 mostra onde a peça escolhida encaixa: cada jogador tem SPOTS usos por partida (o servidor conta)
  socket.on('spot', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false, left: 0 });
    const { room, idx } = c;
    const p = pieceFrom(room, data && data.id);
    if (!p || p.locked || room.status === 'won') return reply(cb, { ok: false, error: 'invalid', left: room.spots[idx] });
    if (room.spots[idx] <= 0) return reply(cb, { ok: false, left: 0 });
    room.spots[idx]--;
    reply(cb, { ok: true, left: room.spots[idx], col: p.col, row: p.row });
    socket.emit('meta', meta(room));
  });

  // avisos com o app fechado: o aparelho entrega aqui o "endereço" do aviso dele (só para os serviços conhecidos)
  socket.on('push:subscribe', (data, cb) => {
    const c = ctx(socket);
    if (!c || !webpush) return reply(cb, { ok: false });
    const sub = data && data.sub;
    if (!validPushSub(sub)) return reply(cb, { ok: false, error: 'invalid' });
    room_player(c).push = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
    reply(cb, { ok: true });
  });

  socket.on('push:unsubscribe', (data, cb) => {
    const c = ctx(socket);
    if (!c) return reply(cb, { ok: false });
    room_player(c).push = null;
    reply(cb, { ok: true });
  });

  socket.on('disconnect', () => leaveCurrent(socket));
});

/* ---------- Limpeza de salas antigas ---------- */
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const idleMin = (now - room.lastActive) / 60000;
    const ageH = (now - room.createdAt) / 3600000;
    if ((connectedCount(room) === 0 && idleMin > 15) || ageH > 8) {
      clearRematch(room);
      rooms.delete(code);
    }
  }
}, 60000).unref();

setInterval(() => {
  const now = Date.now();
  for (const [tk, u] of uploads) if (now - u.last > UPLOAD_TTL && !uploadInUse(tk)) uploads.delete(tk);
  for (const [ip, h] of uploadHits) if (!h.some((t) => now - t < 10 * 60 * 1000)) uploadHits.delete(ip);
}, 10 * 60 * 1000).unref();

async function start() {
  if (DATABASE_URL) {
    try {
      const { createDb } = require('./db');
      const { createAccounts } = require('./accounts');
      const db = createDb(DATABASE_URL);
      if (!db) throw new Error('driver do banco ausente');
      const applied = await db.migrate();                                   // cria/atualiza as tabelas sozinho
      if (applied.length) console.log('[contas] migrações aplicadas:', applied.join(', '));
      accounts = createAccounts({
        app, express, io, db, cleanName, cleanAvatar, roomInfo, roomOfSocket, imageLabel, elapsedOf: elapsed,
        googleClientId: process.env.GOOGLE_CLIENT_ID || null,
        getUpload: (t) => uploads.get(t) || null,
        onAuth: bindUserToRooms
      });
      accHooks.duelFinish = (room, result) => accounts.finishDuel(room, result);
      console.log('[contas] sistema de contas ATIVO' + (process.env.GOOGLE_CLIENT_ID ? ' (com login Google)' : ''));
    } catch (e) {
      console.error('[contas] NÃO foi possível ativar as contas (o jogo segue como visitante):', e.message);
      accounts = null;
    }
  }
  server.listen(PORT, '0.0.0.0', () => {
    console.log('Quebra-cabeça a dois rodando na porta ' + PORT);
  });
}
start();
