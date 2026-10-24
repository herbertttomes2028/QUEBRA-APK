'use strict';

/*
 * Quebra-Cabeça a Dois — servidor
 * Express serve a pasta /public e o Socket.IO sincroniza as duas pessoas.
 * O servidor é a "fonte da verdade": ele decide quem segura cada peça,
 * quando uma peça encaixa e quando o jogo termina.
 */

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
const MAX_IMAGES = 12;

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

/* ---------- Servidor HTTP ---------- */
const app = express();
app.disable('x-powered-by');

app.get('/health', (req, res) => res.type('text').send('ok'));

app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.json({ images: listImages(), presets: PRESETS, defaultPieces: DEFAULT_PIECES, hints: HINTS, spots: SPOTS, maxName: MAX_NAME, chat: CHAT_ENABLED, avatars: AVATARS, push: PUSH_PUBLIC ? { key: PUSH_PUBLIC } : null });
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
    imagens: listImages().length
  });
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

function listImages() {
  try {
    return fs
      .readdirSync(IMG_DIR)
      .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
      .sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }))
      .slice(0, MAX_IMAGES)
      .map((f) => ({ file: f, url: 'imagens/' + encodeURIComponent(f), label: prettyName(f) }));
  } catch (e) {
    return [];
  }
}

function validImage(file) {
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
    if (!rooms.has(c)) return c;
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
    spots: room.spots
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

function startIfReady(room) {
  if (room.status === 'waiting' && connectedCount(room) === 2) {
    room.status = 'playing';
    if (!room.startedAt) room.startedAt = Date.now();
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

  if (lockedTotal(room) === room.pieces.length) {
    room.status = 'won';
    if (!room.startedAt) room.startedAt = room.roundStart;
    room.finishedAt = Date.now();
    io.to(room.code).emit('won', { elapsedMs: elapsed(room), counts: counts(room) });
    broadcastMeta(room);
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
    push: same ? old.push || null : null,
    lastPush: 0
  };
  socket.data.code = room.code;
  socket.data.idx = idx;
  socket.join(room.code);
  room.lastActive = Date.now();
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
  room.status = 'waiting';
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
    broadcastMeta(room);
  }
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

server.listen(PORT, '0.0.0.0', () => {
  console.log('Quebra-cabeça a dois rodando na porta ' + PORT);
});
