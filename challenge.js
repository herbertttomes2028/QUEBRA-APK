'use strict';
/*
 * SALA DESAFIO — dois jogadores montam a MESMA imagem ao mesmo tempo, cada um no SEU tabuleiro.
 * Vence quem encaixar a última peça primeiro. O servidor é a autoridade: ele decide a largada,
 * o tempo, o progresso e o vencedor (o celular só mostra e envia gestos).
 *
 * Modos:
 *   comum  — a bandeja de sempre; os dois recebem as peças nas MESMAS posições e giros.
 *   quebra — "Quebrando Cabeças": grade maior, sem bandeja; uma caixa de presentes libera uma
 *            peça por toque (até 3 por rodada). A rodada só recomeça quando todas as peças
 *            pedidas nela forem encaixadas.
 *
 * Este módulo é independente do modo cooperativo (server.js): salas, eventos (prefixo "ch:") e
 * tabuleiros próprios. Só reaproveita as ferramentas do servidor (layout, peças, push, nomes...).
 */

const COUNTDOWN_MS = Number(process.env.CH_COUNTDOWN_MS) || 3000;   // contagem regressiva antes da largada
const GRACE_MS = Number(process.env.CH_GRACE_MS) || 45000;           // tempo para quem caiu voltar antes de perder por desistência
const BOX_MAX = 3;                                                   // peças que a caixa libera por rodada
const AUTO_FIRST_MS = Number(process.env.CH_AUTO_FIRST_MS) || 240;   // depois de encaixar a 3ª peça, a caixa espera um instante e cospe a 1ª
const AUTO_STEP_MS = Number(process.env.CH_AUTO_STEP_MS) || 190;    // intervalo entre as peças cuspidas
const SAME_ORDER = true;   // true: os dois recebem as surpresas na mesma ordem (vence a habilidade, não a sorte)

module.exports = function createChallenge(d) {
  const {
    io, PRESETS, DEFAULT_PIECES, FIELD_W, BOARD_Y, MAX_ROT, HINTS, SPOTS, CHAT_ENABLED, CHAT_KEEP,
    validImage, validPieces, cleanName, cleanAvatar, cleanPid, cleanChat, newCode, layoutFor, buildPieces,
    sendPush, validPushSub, webpush, clamp, rnd, shuffle, isCodeTaken, onFinish,
    phraseOk, joinLocked, joinMiss, blockedWithRoom, codeLen
  } = d;

  const rooms = new Map();

  /* ---------- layout do modo "Quebrando Cabeças" ---------- */
  // grade quase na largura toda e uma faixa baixa (3 vagas de peças + a caixa de presentes) embaixo
  function layoutQuebra(pieces) {
    const pr = PRESETS.find((p) => p.pieces === pieces) || PRESETS.find((p) => p.pieces === DEFAULT_PIECES);
    const BW = 980;
    const tile = BW / pr.cols;
    const boardH = pr.rows * tile;
    const t = Math.round(Math.min(200, tile));            // peça "na mão" (nunca maior que a peça montada)
    const stripTop = BOARD_Y + boardH + 40;
    const stripH = Math.max(t + 40, 255);                // altura da faixa: cabe a caixa de presentes grande
    const cy = Math.round(stripTop + stripH / 2);
    const boxW = 215;
    const from = boxW + 15;
    const slots = [0, 1, 2].map((k) => ({ x: Math.round(from + (k + 0.5) * ((FIELD_W - from) / 3)), y: cy }));
    return {
      PIECES: pr.pieces, COLS: pr.cols, ROWS: pr.rows, TILE: tile, TRAY: t,
      FIELD_W, FIELD_H: Math.round(stripTop + stripH),
      BOARD_W: BW, BOARD_H: boardH, BOARD_X: Math.round((FIELD_W - BW) / 2), BOARD_Y,
      TRAY_LINE: BOARD_Y + boardH + 20,
      SNAP: Math.round(tile * 0.33),
      MAX_ROT, HINTS,
      TRAY_TOP: stripTop, PER_ROW: 3, TRAY_ROWS: 1, ROW_GAP: 10,
      GIFT: { x: Math.round(boxW / 2 + 8), y: cy, w: boxW, slots, max: BOX_MAX }
    };
  }

  function createRoom(code, mode, imageId, pieces) {
    const now = Date.now();
    return {
      code, kind: 'challenge', mode, imageId,
      cfg: mode === 'quebra' ? layoutQuebra(pieces) : layoutFor(pieces),
      status: 'lobby',                    // lobby | countdown | playing | finished
      players: [null, null],
      boards: [null, null],
      chat: [], chatSeq: 0,
      match: 0,
      goAt: null, startedAt: null, finishedAt: null, winner: null, result: null,
      rematch: [false, false],
      countdownTimer: null,
      grace: [null, null],                // temporizadores de desistência
      graceUntil: [0, 0],
      createdAt: now, lastActive: now
    };
  }

  /* ---------- tabuleiros ---------- */
  function buildBoards(room) {
    const cfg = room.cfg, total = cfg.COLS * cfg.ROWS;
    let template;
    if (room.mode === 'quebra') {
      template = Array.from({ length: total }, (_, id) => ({
        id, col: id % cfg.COLS, row: Math.floor(id / cfg.COLS), x: cfg.GIFT.x, y: cfg.GIFT.y, rot: rnd(0, 3), out: false
      }));
    } else {
      template = buildPieces(cfg).map((p) => ({ id: p.id, col: p.col, row: p.row, x: p.x, y: p.y, rot: p.rot, out: true }));
    }
    const baseOrder = shuffle(Array.from({ length: total }, (_, i) => i));
    room.boards = [0, 1].map(() => ({
      pieces: template.map((t) => Object.assign({ rotUsed: 0, heldBy: null, locked: false, lockedBy: null, z: 10 + t.id, slot: null }, t)),
      order: SAME_ORDER ? baseOrder.slice() : shuffle(baseOrder.slice()),
      next: 0, round: [],
      hints: HINTS, spots: SPOTS, z: 100, locked: 0, finishedAt: null, lastMove: 0, lastGift: 0
    }));
  }

  function totalOf(room) { return room.cfg.COLS * room.cfg.ROWS; }
  function elapsed(room) {
    if (!room.startedAt) return 0;
    return (room.finishedAt || Date.now()) - room.startedAt;
  }
  function boxInfo(room, idx) {
    const b = room.boards[idx];
    if (room.mode !== 'quebra' || !b) return null;
    return { n: b.round.length, max: BOX_MAX, blocked: b.round.length >= BOX_MAX, left: b.order.length - b.next };
  }
  function progress(room, idx) {
    const b = room.boards[idx], total = totalOf(room), locked = b ? b.locked : 0;
    return { idx, locked, total, pct: total ? Math.round((100 * locked) / total) : 0 };
  }

  function boardSnapshot(room, idx) {
    const b = room.boards[idx];
    return {
      code: room.code, imageId: room.imageId, cfg: room.cfg, mode: room.mode,
      chat: room.chat, chatOn: CHAT_ENABLED,
      pieces: b.pieces.map((p) => ({
        id: p.id, col: p.col, row: p.row, x: Math.round(p.x), y: Math.round(p.y), rot: p.rot, rotUsed: p.rotUsed,
        heldBy: p.heldBy, locked: p.locked, lockedBy: p.lockedBy, z: p.z, out: p.out
      })),
      box: boxInfo(room, idx),
      total: totalOf(room), locked: b.locked,
      hints: b.hints, spots: b.spots,
      elapsedMs: elapsed(room),
      progress: [progress(room, 0), progress(room, 1)]
    };
  }

  /* ---------- sala: informações para a recepção (lobby) ---------- */
  function lobbyInfo(room) {
    const now = Date.now();
    return {
      code: room.code, mode: room.mode, imageId: room.imageId, pieces: totalOf(room),
      status: room.status, match: room.match, graceMs: GRACE_MS,
      players: room.players.map((p, idx) => ({
        idx, joined: !!p, connected: !!(p && p.connected),
        name: p ? p.name : '', avatar: p ? p.avatar || '' : '', ready: !!(p && p.ready), imgReady: !!(p && p.imgReady),
        graceLeft: p && !p.connected && room.graceUntil[idx] > now ? room.graceUntil[idx] - now : 0
      })),
      rematch: room.rematch.slice()
    };
  }
  function emitLobby(room) { io.to(room.code).emit('ch:lobby', lobbyInfo(room)); }
  function emitTo(room, idx, ev, data) {
    const p = room.players[idx];
    if (p && p.connected && p.socketId) io.to(p.socketId).emit(ev, data);
  }
  function bothConnected(room) { return room.players.every((p) => p && p.connected); }
  function connectedCount(room) { return room.players.filter((p) => p && p.connected).length; }

  /* ---------- entrar / sair da sala ---------- */
  function attach(room, socket, pid, name, avatar) {
    let idx = room.players.findIndex((p) => p && p.pid === pid);
    if (idx === -1) {
      idx = room.players.findIndex((p) => !p);
      // na recepção, a vaga de quem caiu pode ser ocupada; durante a disputa ela fica reservada
      if (idx === -1 && room.status === 'lobby') idx = room.players.findIndex((p) => p && !p.connected);
      if (idx === -1) return { error: 'full' };
    }
    const old = room.players[idx];
    if (old && old.connected && old.socketId && old.socketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(old.socketId);
      if (oldSocket) { oldSocket.data.ch = null; oldSocket.leave(room.code); }
    }
    const same = !!(old && old.pid === pid);
    room.players[idx] = {
      pid, socketId: socket.id, connected: true,
      name: cleanName(name) || (same ? old.name : '') || 'Jogador ' + (idx + 1),
      avatar: cleanAvatar(avatar) || (same ? old.avatar : '') || '',
      ready: same ? !!old.ready : false,
      imgReady: false,                    // o celular avisa quando a imagem já está carregada e preparada
      uid: socket.data.uid || null,       // conta do jogador (null = visitante)
      push: same ? old.push || null : null, lastPush: 0
    };
    socket.data.ch = { code: room.code, idx };
    socket.join(room.code);
    room.lastActive = Date.now();
    return { idx, isNew: !same, wasAway: same && !(old && old.connected) };
  }

  function clearGrace(room, idx) {
    if (room.grace[idx]) { clearTimeout(room.grace[idx]); room.grace[idx] = null; }
    room.graceUntil[idx] = 0;
  }
  function clearAllTimers(room) {
    clearTimeout(room.countdownTimer); room.countdownTimer = null;
    clearGrace(room, 0); clearGrace(room, 1);
  }

  // quem caiu no meio da disputa tem GRACE_MS para voltar; senão o outro vence por desistência
  function ensureGrace(room) {
    if (room.status !== 'playing') return;
    for (let i = 0; i < 2; i++) {
      const p = room.players[i], other = room.players[1 - i];
      if (p && !p.connected && other && other.connected && !room.grace[i]) {
        room.graceUntil[i] = Date.now() + GRACE_MS;
        room.grace[i] = setTimeout(() => {
          room.grace[i] = null;
          const pl = room.players[i], ot = room.players[1 - i];
          if (room.status !== 'playing' || !pl || pl.connected) return;
          if (!ot || !ot.connected) { room.graceUntil[i] = 0; return; }    // os dois fora: ninguém perde por isso
          finish(room, 1 - i, 'forfeit');
        }, GRACE_MS);
      }
    }
  }

  function leaveSocket(socket, explicit) {
    const ch = socket.data.ch;
    if (!ch) return;
    socket.data.ch = null;
    const room = rooms.get(ch.code);
    socket.leave(ch.code);
    if (!room) return;
    const idx = ch.idx, pl = room.players[idx];
    if (!pl || pl.socketId !== socket.id) return;
    room.lastActive = Date.now();
    const b = room.boards[idx];
    if (b) for (const p of b.pieces) if (p.heldBy === idx) p.heldBy = null;
    if (explicit) {
      // saiu de propósito
      if (room.status === 'playing') {
        pl.connected = false; pl.socketId = null;
        finish(room, 1 - idx, 'left');
        return;
      }
      if (room.status === 'countdown') cancelCountdown(room, 'left');
      room.players[idx] = null;
      room.rematch = [false, false];
      if (!room.players[0] && !room.players[1]) { clearAllTimers(room); rooms.delete(room.code); return; }
      if (room.status === 'finished') { room.status = 'lobby'; }
      room.players.forEach((p) => { if (p) p.ready = false; });
      emitLobby(room);
      return;
    }
    // caiu a conexão
    pl.connected = false; pl.socketId = null; pl.ready = false;
    if (room.status === 'countdown') cancelCountdown(room, 'dropped');
    if (room.status === 'finished') room.rematch = [false, false];
    ensureGrace(room);          // primeiro marca o prazo, depois avisa (assim o aviso já leva o tempo que falta)
    emitLobby(room);
  }

  /* ---------- contagem, largada e fim ---------- */
  function startCountdown(room) {
    if (room.status !== 'lobby' || !bothConnected(room)) return;
    room.status = 'countdown';
    room.goAt = Date.now() + COUNTDOWN_MS;
    clearTimeout(room.countdownTimer);
    room.countdownTimer = setTimeout(() => beginMatch(room), COUNTDOWN_MS);
    io.to(room.code).emit('ch:countdown', { ms: COUNTDOWN_MS, match: room.match + 1 });
    emitLobby(room);
  }

  function cancelCountdown(room, reason) {
    clearTimeout(room.countdownTimer); room.countdownTimer = null;
    if (room.status !== 'countdown') return;
    room.status = 'lobby';
    io.to(room.code).emit('ch:cancel', { reason });
    emitLobby(room);
  }

  function beginMatch(room) {
    room.countdownTimer = null;
    if (room.status !== 'countdown') return;
    if (!bothConnected(room)) { cancelCountdown(room, 'dropped'); return; }
    if (!room.players.every((p) => p.imgReady)) { room.players.forEach((p) => { p.ready = false; }); cancelCountdown(room, 'img'); return; }
    room.match++;
    buildBoards(room);
    room.status = 'playing';
    room.startedAt = Date.now();
    room.finishedAt = null; room.winner = null; room.result = null;
    room.rematch = [false, false];
    room.players.forEach((p) => { if (p) p.ready = false; });
    for (let i = 0; i < 2; i++) emitTo(room, i, 'ch:start', { snapshot: boardSnapshot(room, i), lobby: lobbyInfo(room) });
  }

  function finish(room, winner, reason) {
    if (room.status !== 'playing') return;
    room.status = 'finished';
    room.finishedAt = Date.now();
    room.winner = winner;
    clearGrace(room, 0); clearGrace(room, 1);
    const total = totalOf(room);
    room.result = {
      winner, reason, match: room.match, mode: room.mode, imageId: room.imageId, total,
      elapsedMs: elapsed(room),
      players: [0, 1].map((i) => {
        const pr = progress(room, i), p = room.players[i], b = room.boards[i];
        return {
          idx: i, name: p ? p.name : '', avatar: p ? p.avatar || '' : '',
          locked: pr.locked, total, pct: pr.pct,
          finishedMs: b && b.finishedAt ? b.finishedAt - room.startedAt : null
        };
      })
    };
    for (const b of room.boards) if (b) for (const p of b.pieces) p.heldBy = null;
    io.to(room.code).emit('ch:end', room.result);
    emitLobby(room);
    if (onFinish) { try { Promise.resolve(onFinish(room, room.result)).catch(() => {}); } catch (e) { /* o histórico nunca derruba a partida */ } }
  }

  /* ---------- peças (cada jogador mexe só no próprio tabuleiro) ---------- */
  function ctx(socket) {
    const ch = socket.data.ch;
    if (!ch) return null;
    const room = rooms.get(ch.code);
    if (!room) return null;
    const pl = room.players[ch.idx];
    if (!pl || pl.socketId !== socket.id) return null;
    room.lastActive = Date.now();
    return { room, idx: ch.idx, board: room.boards[ch.idx] };
  }
  function pieceOf(board, id) {
    id = Number(id);
    if (!board || !Number.isInteger(id) || id < 0 || id >= board.pieces.length) return null;
    return board.pieces[id];
  }
  function releaseOthers(board, idx, exceptId) {
    for (const p of board.pieces) {
      if (p.heldBy === idx && p.id !== exceptId) { p.heldBy = null; if (p.rotUsed >= MAX_ROT) p.rotUsed = 0; }
    }
  }

  // tenta encaixar; devolve true se travou (e trata progresso, rodada da caixa e fim da disputa)
  function tryLock(room, idx, board, p, socket) {
    const cfg = room.cfg;
    const tx = cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2;
    const ty = cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2;
    if (p.rot !== 0) return false;
    if (Math.hypot(p.x - tx, p.y - ty) > cfg.SNAP) return false;
    p.x = tx; p.y = ty; p.locked = true; p.lockedBy = idx; p.heldBy = null; p.z = 1;
    board.locked++;
    const counts = [0, 0]; counts[idx] = board.locked;
    socket.emit('locked', { id: p.id, x: tx, y: ty, by: idx, counts, locked: board.locked });

    let autoSpit = false;
    if (room.mode === 'quebra' && board.round.length && board.round.every((id) => board.pieces[id].locked)) {
      const full = board.round.length >= BOX_MAX;       // uma rodada COMPLETA (3 peças) foi encaixada
      board.round = [];                                  // todas as peças pedidas foram encaixadas: nova rodada
      if (full && board.next < board.order.length && room.status === 'playing') {
        // a caixa "cospe" sozinha as próximas peças (até 3), uma depois da outra, sem precisar tocar
        for (let k = 0; k < BOX_MAX && board.next < board.order.length; k++) {
          const g = releaseNext(room, idx, board);
          socket.emit('ch:gift', Object.assign(g, { auto: true, k, delay: AUTO_FIRST_MS + k * AUTO_STEP_MS }));
          autoSpit = true;
        }
      }
    }
    if (room.mode === 'quebra' && !autoSpit) socket.emit('ch:box', boxInfo(room, idx));

    const pr = progress(room, idx);
    emitTo(room, 1 - idx, 'ch:progress', pr);
    socket.emit('ch:progress', pr);

    if (board.locked === pr.total) {
      board.finishedAt = Date.now();
      finish(room, idx, 'complete');
    }
    return true;
  }

  // tira a próxima peça da caixa e a coloca numa vaga livre da faixa de baixo
  function releaseNext(room, idx, board) {
    const id = board.order[board.next++];
    const p = board.pieces[id];
    const used = new Set(board.round.map((rid) => board.pieces[rid]).filter((q) => !q.locked).map((q) => q.slot));
    let slot = 0;
    while (used.has(slot) && slot < BOX_MAX - 1) slot++;
    p.slot = slot;
    p.out = true;
    p.x = room.cfg.GIFT.slots[slot].x;
    p.y = room.cfg.GIFT.slots[slot].y;
    p.z = ++board.z;
    board.round.push(id);
    return { id, x: p.x, y: p.y, rot: p.rot, z: p.z, from: { x: room.cfg.GIFT.x, y: room.cfg.GIFT.y }, box: boxInfo(room, idx) };
  }

  function register(socket) {
    socket.on('ch:create', (data, cb) => {
      data = data || {};
      const pid = cleanPid(data.pid);
      if (!pid) return reply(cb, { ok: false, error: 'invalid' });
      const imageId = validImage(data.imageId);
      if (!imageId) return reply(cb, { ok: false, error: 'noimages' });
      const code = newCode();
      if (!code) return reply(cb, { ok: false, error: 'busy' });
      leaveSocket(socket, true);
      const mode = data.mode === 'quebra' ? 'quebra' : 'comum';
      const room = createRoom(code, mode, imageId, validPieces(data.pieces, DEFAULT_PIECES));
      rooms.set(code, room);
      const res = attach(room, socket, pid, data.name, data.avatar);
      reply(cb, { ok: true, idx: res.idx, lobby: lobbyInfo(room), chat: room.chat, chatOn: CHAT_ENABLED });
      emitLobby(room);
    });

    socket.on('ch:join', (data, cb) => {
      data = data || {};
      const pid = cleanPid(data.pid);
      const code = String(data.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, codeLen || 6);
      if (!pid) return reply(cb, { ok: false, error: 'invalid' });
      const lk = joinLocked(socket);
      if (lk.locked) return reply(cb, { ok: false, error: 'locked', retryMs: lk.retryMs });
      const room = rooms.get(code);
      if (!room) { const m = joinMiss(socket, code); return reply(cb, m.locked ? { ok: false, error: 'locked', retryMs: m.retryMs } : { ok: false, error: 'notfound' }); }
      if (blockedWithRoom(socket, room.players)) return reply(cb, { ok: false, error: 'notfound' });
      if (socket.data.ch && socket.data.ch.code !== code) leaveSocket(socket, true);
      const res = attach(room, socket, pid, data.name, data.avatar);
      if (res.error) return reply(cb, { ok: false, error: res.error });
      const out = { ok: true, idx: res.idx, lobby: lobbyInfo(room), chat: room.chat, chatOn: CHAT_ENABLED, status: room.status };
      if (room.status === 'playing' && room.boards[res.idx]) out.snapshot = boardSnapshot(room, res.idx);
      if (room.status === 'finished') out.result = room.result;
      reply(cb, out);
      if (res.wasAway && room.status === 'playing') {
        clearGrace(room, res.idx);
        emitTo(room, 1 - res.idx, 'ch:presence', { idx: res.idx, connected: true });
        ensureGrace(room);                              // se o outro também estava fora, agora é ele quem tem prazo
      }
      emitLobby(room);
      if (res.isNew) {
        sendPush(room, 1 - res.idx, { title: 'Sala Desafio', body: room.players[res.idx].name + ' entrou na sala. Bora competir?', tag: 'join', url: '/?sala=' + room.code });
      }
    });

    socket.on('ch:leave', () => leaveSocket(socket, true));

    // o celular avisa que a imagem da sala já está carregada e preparada
    socket.on('ch:imgready', (data, cb) => {
      const c = ctx(socket);
      if (!c) return reply(cb, { ok: false });
      c.room.players[c.idx].imgReady = true;
      reply(cb, { ok: true });
      emitLobby(c.room);
    });

    socket.on('ch:ready', (data, cb) => {
      const c = ctx(socket);
      if (!c) return reply(cb, { ok: false });
      const { room, idx } = c;
      if (room.status !== 'lobby' && room.status !== 'countdown') return reply(cb, { ok: false, error: 'state' });
      const want = !!(data && data.ready);
      if (want && !room.players[idx].imgReady) return reply(cb, { ok: false, error: 'img' });      // a imagem ainda não está pronta neste celular
      room.players[idx].ready = want;
      reply(cb, { ok: true });
      if (!want && room.status === 'countdown') { cancelCountdown(room, 'unready'); return; }
      emitLobby(room);
      if (want && room.status === 'lobby' && bothConnected(room) && room.players.every((p) => p.ready && p.imgReady)) startCountdown(room);
    });

    socket.on('ch:grab', (data) => {
      const c = ctx(socket);
      if (!c || !data || c.room.status !== 'playing') return;
      const p = pieceOf(c.board, data.id);
      if (!p || !p.out) return;
      if (p.locked) { socket.emit('deny', { id: p.id, reason: 'locked', by: null }); return; }
      releaseOthers(c.board, c.idx, p.id);
      p.heldBy = c.idx;
      p.z = ++c.board.z;
      socket.emit('grabbed', { id: p.id, by: c.idx, z: p.z });
    });

    socket.on('ch:move', (data) => {
      const c = ctx(socket);
      if (!c || !data || c.room.status !== 'playing') return;
      const now = Date.now();
      if (now - c.board.lastMove < 25) return;
      c.board.lastMove = now;
      const p = pieceOf(c.board, data.id);
      if (!p || p.heldBy !== c.idx) return;
      const hh = Math.ceil(c.room.cfg.TRAY / 2);
      p.x = clamp(data.x, hh, c.room.cfg.FIELD_W - hh);
      p.y = clamp(data.y, hh, c.room.cfg.FIELD_H - hh);
    });

    socket.on('ch:rotate', (data) => {
      const c = ctx(socket);
      if (!c || !data || c.room.status !== 'playing') return;
      const p = pieceOf(c.board, data.id);
      if (!p || p.heldBy !== c.idx || p.locked) return;
      if (p.rotUsed >= MAX_ROT) { socket.emit('rotated', { id: p.id, rot: p.rot, rotUsed: p.rotUsed }); return; }
      p.rot = (p.rot + 1) % 4;
      p.rotUsed++;
      socket.emit('rotated', { id: p.id, rot: p.rot, rotUsed: p.rotUsed });
      tryLock(c.room, c.idx, c.board, p, socket);
    });

    socket.on('ch:drop', (data) => {
      const c = ctx(socket);
      if (!c || !data || c.room.status !== 'playing') return;
      const p = pieceOf(c.board, data.id);
      if (!p || p.heldBy !== c.idx || p.locked) return;
      const hh = Math.ceil(c.room.cfg.TRAY / 2);
      p.x = clamp(data.x, hh, c.room.cfg.FIELD_W - hh);
      p.y = clamp(data.y, hh, c.room.cfg.FIELD_H - hh);
      if (tryLock(c.room, c.idx, c.board, p, socket)) return;
      p.heldBy = null;
      if (p.rotUsed >= MAX_ROT) p.rotUsed = 0;
      socket.emit('released', { id: p.id, by: c.idx, x: Math.round(p.x), y: Math.round(p.y), rotUsed: p.rotUsed });
    });

    // 🎁 a caixa libera UMA peça surpresa por toque; até BOX_MAX por rodada
    socket.on('ch:gift', (data, cb) => {
      const c = ctx(socket);
      if (!c) return reply(cb, { ok: false, error: 'room' });
      const { room, idx, board } = c;
      if (room.mode !== 'quebra') return reply(cb, { ok: false, error: 'mode' });
      if (room.status !== 'playing') return reply(cb, { ok: false, error: 'state' });
      if (board.round.length >= BOX_MAX) return reply(cb, Object.assign({ ok: false, error: 'blocked' }, boxInfo(room, idx)));
      if (board.next >= board.order.length) return reply(cb, Object.assign({ ok: false, error: 'empty' }, boxInfo(room, idx)));
      const g = releaseNext(room, idx, board);
      reply(cb, Object.assign({ ok: true }, g.box));
      socket.emit('ch:gift', g);
    });

    socket.on('ch:hint', (data, cb) => {
      const c = ctx(socket);
      if (!c || c.room.status !== 'playing') return reply(cb, { ok: false, left: 0 });
      if (c.board.hints <= 0) return reply(cb, { ok: false, left: 0 });
      c.board.hints--;
      reply(cb, { ok: true, left: c.board.hints });
    });

    socket.on('ch:spot', (data, cb) => {
      const c = ctx(socket);
      if (!c || c.room.status !== 'playing') return reply(cb, { ok: false, left: 0 });
      const p = pieceOf(c.board, data && data.id);
      if (!p || p.locked || !p.out) return reply(cb, { ok: false, error: 'invalid', left: c.board.spots });
      if (c.board.spots <= 0) return reply(cb, { ok: false, left: 0 });
      c.board.spots--;
      reply(cb, { ok: true, left: c.board.spots, col: p.col, row: p.row });
    });

    // frases prontas (o celular manda só o código da frase; o servidor confere e escreve o texto)
    socket.on('ch:chat', async (data, cb) => {
      if (!CHAT_ENABLED) return reply(cb, { ok: false, error: 'off' });
      const phrase = d.phrases.byId(data && data.p);
      if (!phrase) return reply(cb, { ok: false, error: 'invalid' });
      if (!(await phraseOk(socket, phrase.id))) return reply(cb, { ok: false, error: 'locked' });
      const c = ctx(socket);
      if (!c) return reply(cb, { ok: false, error: 'room' });
      const now = Date.now();
      const times = (socket.data.chatTimes || []).filter((t) => now - t < 10000);
      if (times.length >= 12 || (times.length && now - times[times.length - 1] < 400)) { socket.data.chatTimes = times; return reply(cb, { ok: false, error: 'rate' }); }
      times.push(now); socket.data.chatTimes = times;
      const { room, idx } = c;
      const msg = { id: ++room.chatSeq, idx, name: room.players[idx].name, text: phrase.text, p: phrase.id, t: now };
      room.chat.push(msg);
      if (room.chat.length > CHAT_KEEP) room.chat.shift();
      io.to(room.code).emit('chat', msg);
      sendPush(room, 1 - idx, { title: msg.name, body: phrase.text, tag: 'chat', url: '/?sala=' + room.code });
      reply(cb, { ok: true });
    });

    // revanche: precisa dos dois; quando ambos pedem, começa a contagem de uma nova disputa
    socket.on('ch:rematch', (data, cb) => {
      const c = ctx(socket);
      if (!c) return reply(cb, { ok: false });
      const { room, idx } = c;
      if (room.status !== 'finished') return reply(cb, { ok: false, error: 'state' });
      if (!bothConnected(room)) return reply(cb, { ok: false, error: 'away' });
      room.rematch[idx] = !!(data && data.want);
      reply(cb, { ok: true });
      emitLobby(room);
      io.to(room.code).emit('ch:rematch', { votes: room.rematch.slice() });
      if (room.rematch[0] && room.rematch[1]) {
        room.status = 'lobby';
        room.rematch = [false, false];
        room.players.forEach((p) => { if (p) p.ready = true; });
        startCountdown(room);
      }
    });

    socket.on('ch:push:subscribe', (data, cb) => {
      const c = ctx(socket);
      if (!c || !webpush) return reply(cb, { ok: false });
      const sub = data && data.sub;
      if (!validPushSub(sub)) return reply(cb, { ok: false, error: 'invalid' });
      c.room.players[c.idx].push = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      reply(cb, { ok: true });
    });
    socket.on('ch:push:unsubscribe', (data, cb) => {
      const c = ctx(socket);
      if (!c) return reply(cb, { ok: false });
      c.room.players[c.idx].push = null;
      reply(cb, { ok: true });
    });

    socket.on('disconnect', () => leaveSocket(socket, false));
  }

  function reply(cb, data) { if (typeof cb === 'function') cb(data); }

  io.on('connection', register);

  // limpeza de salas paradas
  setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      const idleMin = (now - room.lastActive) / 60000;
      const ageH = (now - room.createdAt) / 3600000;
      if ((connectedCount(room) === 0 && idleMin > 15) || ageH > 8) { clearAllTimers(room); rooms.delete(code); }
    }
  }, 60000).unref();

  return {
    has: (code) => rooms.has(code),
    // resumo da sala para os convites entre amigos
    info: (code) => {
      const r = rooms.get(code);
      if (!r) return null;
      return { code, kind: r.mode, free: r.status === 'lobby' && r.players.some((p) => !p || !p.connected), hostConnected: connectedCount(r) > 0, imageId: r.imageId, pieces: totalOf(r) };
    },
    // a outra pessoa da Sala Desafio em que este celular está
    peerOf: (socket) => {
      const ch = socket.data.ch;
      const r = ch && rooms.get(ch.code);
      const o = r && r.players[1 - ch.idx];
      return o ? { uid: o.uid || null, name: o.name } : null;
    },
    bindUser: (socket, uid) => {
      const ch = socket.data.ch;
      const r = ch && rooms.get(ch.code);
      const pl = r && r.players[ch.idx];
      if (pl && pl.socketId === socket.id) pl.uid = uid || null;
    },
    usesImage: (id) => { for (const r of rooms.values()) if (r.imageId === id) return true; return false; },
    size: () => rooms.size,
    config: { countdownMs: COUNTDOWN_MS, graceMs: GRACE_MS, boxMax: BOX_MAX }
  };
};
