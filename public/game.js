/*
 * Quebra-Cabeça a Dois — cliente (navegador)
 * - Peças são elementos HTML movidos com transform (rápido no celular).
 * - O servidor decide tudo (quem segura, encaixe, vitória); aqui só mostramos
 *   e enviamos as ações. Movimentos são enviados no máximo a cada 50 ms.
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var PLAYER_COLORS = ['#2a5ee8', '#d1245f'];   // azul e rosa um pouco mais fortes: texto branco legível (≥ 4,5:1)
  var HINT_MS = 4000;      // quanto tempo a imagem fica visível atrás das peças
  var HELD_SCALE = 1.04;   // peça na mão fica um pouquinho maior
  var ZOOM_MAX = 6;        // limite do zoom por pinça (também limitado pela largura da tela)

  /* ---------------------------------------------------------
   * Estado
   * --------------------------------------------------------- */
  var state = {
    pid: makePid(),
    name: '',
    cfg: null,
    images: [],
    presets: [],
    defaultPieces: 12,
    hints: 10,
    hintTimer: null,
    hintActive: false,
    ptrs: {},          // dedos/ponteiros que estão tocando na tela
    pinch: null,       // gesto de pinça em andamento
    tipShown: false,
    chat: [],          // últimas mensagens da conversa
    chatOn: true,
    codeLen: 6,          // tamanho do código da sala (o servidor informa)
    phrases: [],         // catálogo de frases prontas
    unlocked: null,      // frases liberadas (null = só as básicas)
    chatOpen: false,
    unread: 0,
    popTimer: null,
    names: ['', ''],
    idx: null,
    code: null,
    imageId: null,
    imageUrl: null,
    status: 'waiting',
    players: [],
    counts: [0, 0],
    locked: 0,
    total: 12,
    pieces: [],
    selectedId: null,
    drag: null,
    scale: 1,
    zMax: 100,
    timerBase: null,
    finalMs: 0,
    inGame: false,
    friendOnline: false,
    pickMode: 'create',
    pickChoice: null,
    pickPieces: 12,
    idleTimer: null
  };

  var imagesReady = null;
  var imgCache = {};
  var wakeLock = null;

  /* ---------------------------------------------------------
   * Preferências guardadas só neste aparelho (nome, avatar, ajustes, melhores tempos)
   * --------------------------------------------------------- */
  var store = (function () {
    var mem = {}, ok = false;
    try { localStorage.setItem('qc.t', '1'); localStorage.removeItem('qc.t'); ok = true; } catch (e) { ok = false; }
    return {
      get: function (k, d) { try { var v = ok ? localStorage.getItem('qc.' + k) : mem[k]; return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
      set: function (k, v) { try { var s = JSON.stringify(v); if (ok) localStorage.setItem('qc.' + k, s); else mem[k] = s; } catch (e) { /* sem espaço: ignora */ } }
    };
  })();

  var DEFAULT_SETTINGS = { text: 'normal', theme: 'auto', motion: 'auto', sound: true, vibrate: true, push: false };
  state.settings = (function () {
    var saved = store.get('settings', {}) || {}, o = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { o[k] = saved[k] !== undefined ? saved[k] : DEFAULT_SETTINGS[k]; });
    return o;
  })();
  state.avatar = store.get('avatar', '') || '';
  state.bests = store.get('best', {}) || {};
  state.avatars = ['🐱', '🐶', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐙', '🦋', '⭐', '🚀', '🌈', '🍀'];
  state.spots = 5;
  state.spotActive = false;
  state.spotTimer = null;
  state.spotPiece = null;
  state.milestones = {};
  state.pushKey = null;
  state.winBlob = null;
  state.duel = null;           // Sala Desafio (null = jogo cooperativo de sempre)
  state.custom = [];           // imagens do próprio celular enviadas nesta sessão ("Minha imagem")
  state.upload = { maxBytes: 1572864, maxDim: 2048 };
  state.duelMode = 'comum';

  // sem internet a biblioteca de tempo real não carrega: avisa em vez de quebrar
  if (typeof io === 'undefined') {
    var ld = document.querySelector('#loading');
    if (ld) {
      ld.hidden = false;
      var sp = ld.querySelector('.spinner'); if (sp) sp.hidden = true;
      var tx = ld.querySelector('#loading-text');
      if (tx) tx.innerHTML = 'Sem conexão com o servidor.<br>Verifique a internet e abra o jogo de novo.';
    }
    return;
  }

  var socket = io({ transports: ['websocket', 'polling'], reconnectionDelay: 500, reconnectionDelayMax: 3000 });

  /* ---------------------------------------------------------
   * Utilidades
   * --------------------------------------------------------- */
  function makePid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) { /* segue */ }
    return 'p' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function myName() { return state.idx !== null && state.names[state.idx] ? state.names[state.idx] : 'Você'; }
  function friendName() {
    var n = state.idx !== null ? state.names[1 - state.idx] : '';
    return n || 'Seu amigo';
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function fmtTime(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    s = s % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, ms || 2200);
  }

  function vibrate(ms) { try { if (state.settings.vibrate && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* ignora */ } }

  // dispara de novo uma animação curta de classe (salto do avatar, "pop" dos botões)
  // envia um evento do jogo: no cooperativo vai como sempre; na Sala Desafio vai com o prefixo "ch:"
  function gameEmit(ev, data, cb) {
    var name = state.duel ? 'ch:' + ev : ev;
    if (cb) socket.emit(name, data, cb); else socket.emit(name, data);
  }

  function popEl(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 650);
  }

  function showScreen(name) {
    ['home', 'pick', 'game', 'lobby', 'me'].forEach(function (n) {
      $('#screen-' + n).classList.toggle('active', n === name);
    });
    if (name === 'game') layout();
    if (window.QC && window.QC.onScreen) window.QC.onScreen(name);
  }

  function setLoading(on, text) {
    $('#loading').hidden = !on;
    if (text) $('#loading-text').textContent = text;
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.hidden = !msg;
  }

  function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        navigator.wakeLock.request('screen').then(function (l) {
          wakeLock = l;
          l.addEventListener('release', function () { wakeLock = null; });
        }, function () { /* sem permissão: tudo bem */ });
      }
    } catch (e) { /* ignora */ }
  }

  /* ---------------------------------------------------------
   * Imagens: redimensiona/recorta para 3:4 (720×960) uma única vez
   * --------------------------------------------------------- */
  function loadImage(url) {
    return new Promise(function (res, rej) {
      var im = new Image();
      im.onload = function () { res(im); };
      im.onerror = function () { rej(new Error('Falha ao carregar ' + url)); };
      im.src = url;
    });
  }

  // recorta o centro da imagem na proporção da grade (cols:rows) e reduz o tamanho
  function prepareImage(item, cols, rows) {
    var key = item.file + '|' + cols + 'x' + rows;
    if (imgCache[key]) return imgCache[key];
    imgCache[key] = loadImage(item.localUrl || item.url).then(function (img) {
      var W = 720;
      var H = Math.round(W * rows / cols);
      return cropToBlob(img, W, H, item.url);
    }).catch(function () { return item.url; });
    return imgCache[key];
  }

  // miniaturas leves (3:4) para a tela de escolha: usa a miniatura pronta do servidor (imagens/mini/) quando existe;
  // sem ela, gera a partir da imagem, como sempre foi feito
  function prepareThumb(item) {
    if (item.thumb) return Promise.resolve(item.thumb);
    var key = item.file + '|thumb';
    if (imgCache[key]) return imgCache[key];
    imgCache[key] = loadImage(item.localUrl || item.url).then(function (img) {
      return cropToBlob(img, 300, 400, item.url);
    }).catch(function () { return item.url; });
    return imgCache[key];
  }

  function cropToBlob(img, W, H, fallbackUrl) {
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');
    var sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
    var ar = W / H;
    if (sw / sh > ar) { var nw = sh * ar; sx = (sw - nw) / 2; sw = nw; }
    else { var nh = sw / ar; sy = (sh - nh) / 2; sh = nh; }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
    return new Promise(function (res) {
      cv.toBlob(function (blob) { res(blob ? URL.createObjectURL(blob) : fallbackUrl); }, 'image/jpeg', 0.9);
    });
  }

  function fetchConfig() {
    imagesReady = fetch('api/config', { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        state.images = Array.isArray(c.images) ? c.images : [];
        state.presets = Array.isArray(c.presets) ? c.presets : [];
        state.defaultPieces = c.defaultPieces || 12;
        state.pickPieces = state.defaultPieces;
        if (c.upload && c.upload.maxBytes) state.upload = c.upload;
        state.hints = c.hints || 10;
        state.chatOn = c.chat !== false;
        state.codeLen = c.codeLen || 6;
        state.phrases = Array.isArray(c.phrases) ? c.phrases : [];
        var ic = $('#input-code'); ic.maxLength = state.codeLen; ic.placeholder = 'ABCDEFGH'.slice(0, state.codeLen);
        if (Array.isArray(c.avatars) && c.avatars.length) state.avatars = c.avatars;
        state.spots = c.spots || 5;
        state.pushKey = c.push && c.push.key ? c.push.key : null;
        state.accounts = c.accounts && c.accounts.enabled ? c.accounts : null;     // contas só aparecem se o servidor tiver banco de dados
      })
      .catch(function () { state.images = []; });
    return imagesReady;
  }

  /* ---------------------------------------------------------
   * Tela de escolha de imagem
   * --------------------------------------------------------- */
  function openPick(mode) {
    state.pickMode = mode;
    $('#pick-title').textContent = mode === 'create' ? 'Escolha a imagem' : mode === 'duel' ? 'Sala Desafio' : 'Trocar imagem ou peças';
    $('#pick-lead').textContent = mode === 'duel' ? 'Os dois montam a mesma imagem, cada um no seu celular. Vence quem terminar primeiro!' : 'Toque numa imagem para escolher. Seu amigo vai montar a mesma.';
    $('#duel-modes').hidden = mode !== 'duel';
    $('#btn-pick-go').textContent = goButtonText();
    showError($('#pick-error'), '');
    closePickSheet();
    imagesReady.then(function () {
      var saved = Number(store.get('pieces', 0));
      var okSaved = state.presets.some(function (p) { return p.pieces === saved; });
      state.pickPieces = mode === 'change' && state.cfg ? state.cfg.PIECES : (okSaved ? saved : state.defaultPieces);
      if (!state.images.length) showError($('#pick-error'), 'Nenhuma imagem encontrada na pasta public/imagens. Você ainda pode adicionar a sua!');
      renderPickGrid();
      renderSizes();
    });
    showScreen('pick');
  }

  function goButtonText() {
    if (window.QC && window.QC.goLabel) return window.QC.goLabel;       // convite a um amigo: "Criar e convidar Fulano"
    return state.pickMode === 'create' ? 'Criar partida' : state.pickMode === 'duel' ? 'Criar Sala Desafio' : 'Recomeçar com essa escolha';
  }

  var PLUS_SVG = '<svg class="add-plus" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><defs><linearGradient id="plusg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f6bff"/><stop offset=".5" stop-color="#ff4f8b"/><stop offset="1" stop-color="#ffcf33"/></linearGradient></defs><circle cx="32" cy="32" r="29" fill="#fff" stroke="url(#plusg)" stroke-width="5"/><path d="M32 17v30M17 32h30" stroke="url(#plusg)" stroke-width="8" stroke-linecap="round"/></svg>';

  function renderPickGrid() {
    var grid = $('#pick-grid');
    grid.innerHTML = '';
    // 1º cartão: adicionar uma imagem do próprio celular (mesmas medidas dos outros cartões)
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'add-card';
    add.setAttribute('aria-label', 'Adicionar minha imagem. Abre a galeria do seu celular.');
    add.innerHTML = '<span class="add-box">' + PLUS_SVG + '<span class="add-text">Adicionar<br>minha imagem</span></span><span class="add-sub">Foto ou desenho</span>';
    grid.appendChild(add);
    state.custom.concat(state.images).forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick-card' + (item.fresh ? ' new' : '');
      item.fresh = false;
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', item.file === state.pickChoice ? 'true' : 'false');
      b.dataset.file = item.file;
      var thumb = document.createElement('span');
      thumb.className = 'thumb';
      var label = document.createElement('span');
      label.textContent = item.label;
      b.appendChild(thumb);
      b.appendChild(label);
      grid.appendChild(b);
      prepareThumb(item).then(function (url) { thumb.style.backgroundImage = 'url("' + url + '")'; });
    });
  }

  // um toque na imagem: ela é escolhida na hora e o painel de baixo mostra a prévia e as quantidades de peças
  function selectImage(file, card) {
    var item = imageItem(file);
    state.pickChoice = file;
    Array.prototype.forEach.call(document.querySelectorAll('.pick-card'), function (c) {
      c.setAttribute('aria-selected', c.dataset.file === file ? 'true' : 'false');
    });
    $('#ps-name').textContent = item.label;
    var th = $('#ps-thumb');
    prepareThumb(item).then(function (url) { th.style.backgroundImage = 'url("' + url + '")'; });
    if (!$('#pick-sheet').hidden) popEl(th, 'swap');
    $('#btn-pick-go').textContent = goButtonText();
    $('#btn-pick-go').disabled = false;
    updateSizeNote();
    $('#pick-sheet').hidden = false;
    document.body.classList.add('sheet-open');
    if (card) {
      popEl(card, 'pop');
      setTimeout(function () { try { card.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { /* ignora */ } }, 60);
    }
    vibrate(8);
    playSound('blip');
    announce(item.label + ' escolhida. Agora escolha a quantidade de peças.');
  }

  function closePickSheet() {
    state.pickChoice = null;
    document.body.classList.remove('sheet-open');
    $('#pick-sheet').hidden = true;
    $('#btn-pick-go').disabled = true;
    Array.prototype.forEach.call(document.querySelectorAll('.pick-card'), function (c) { c.setAttribute('aria-selected', 'false'); });
  }

  function renderSizes() {
    var grid = $('#size-grid');
    grid.innerHTML = '';
    state.presets.forEach(function (p) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'size-btn';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', p.pieces === state.pickPieces ? 'true' : 'false');
      b.dataset.pieces = p.pieces;
      b.innerHTML = '<b>' + p.pieces + '</b><span>' + p.label + '</span>';
      grid.appendChild(b);
    });
    updateSizeNote();
  }

  function updateSizeNote() {
    var p = state.presets.filter(function (x) { return x.pieces === state.pickPieces; })[0];
    if (!p) return;
    var note = p.pieces + ' peças (' + p.cols + ' × ' + p.rows + ').';
    if (p.pieces >= 48) note += ' As peças ficam pequenas no celular: melhor para telas grandes.';
    else if (p.pieces <= 6) note += ' Peças grandes, ótimas para começar.';
    var bt = state.bests[state.pickChoice + '|' + state.pickPieces];
    if (typeof bt === 'number') note += ' 🏆 Seu melhor tempo: ' + fmtTime(bt) + '.';
    $('#size-note').textContent = note;
  }

  /* ---------------------------------------------------------
   * Entrar / criar partida
   * --------------------------------------------------------- */
  function errorText(code, res) {
    if (code === 'locked') {
      var min = Math.max(1, Math.ceil(((res && res.retryMs) || 60000) / 60000));
      return 'Muitos códigos errados. Por segurança, espere ' + (min >= 60 ? Math.ceil(min / 60) + ' h' : min + ' min') + ' para tentar de novo.';
    }
    if (code === 'notfound') return 'Não encontramos essa sala. Confira o código com seu amigo.';
    if (code === 'full') return 'Essa sala já tem duas pessoas jogando.';
    if (code === 'noimages') return 'O jogo está sem imagens. Adicione arquivos na pasta public/imagens.';
    return 'Não foi possível conectar. Tente de novo.';
  }

  function readName() {
    state.name = $('#input-name').value.replace(/\s+/g, ' ').trim().slice(0, 12);
    store.set('name', state.name);
    return state.name;
  }

  /* ---------------------------------------------------------
   * Abertura da partida: a imagem escolhida gira no centro e aparece "VAMOS LÁ!"
   * --------------------------------------------------------- */
  var go = { on: false, t0: 0, min: 1900, subTimer: null, cancelTimer: null, endTimer: null };
  function goRemaining() { return go.on ? Math.max(0, go.min - (Date.now() - go.t0)) : 0; }
  function showGoSplash(file) {
    var item = imageItem(file);
    var el = $('#go-splash');
    clearTimeout(go.subTimer); clearTimeout(go.cancelTimer); clearTimeout(go.endTimer);
    $('#go-img').style.backgroundImage = item ? 'url("' + item.url + '")' : 'none';
    $('#go-sub').textContent = '';
    $('#go-cancel').hidden = true;
    el.classList.remove('out', 'run');
    el.hidden = false;
    void el.offsetWidth;
    el.classList.add('run');
    go.on = true; go.t0 = Date.now(); go.min = reducedMotion() ? 1100 : 1900;
    go.subTimer = setTimeout(function () { if (go.on) $('#go-sub').textContent = 'Criando a sala…'; }, 2800);
    go.cancelTimer = setTimeout(function () { if (go.on) $('#go-cancel').hidden = false; }, 9000);
    announce('Vamos lá!');
  }
  function hideGoSplash(instant) {
    var el = $('#go-splash');
    clearTimeout(go.subTimer); clearTimeout(go.cancelTimer); clearTimeout(go.endTimer);
    go.on = false;
    if (el.hidden) return;
    if (instant || reducedMotion()) { el.hidden = true; el.classList.remove('run', 'out'); return; }
    el.classList.add('out');
    setTimeout(function () { if (!go.on) { el.hidden = true; el.classList.remove('run', 'out'); } }, 330);
  }
  // a partida apareceu (sala criada/entrada, ou nova partida): toca o "TANNN" e, se houver abertura, a retira
  function onGameShown() {
    if (go.on) {
      clearTimeout(go.endTimer);
      go.endTimer = setTimeout(function () {
        hideGoSplash(false);
        setTimeout(function () { playSound('tann'); }, 40);
        announce('A partida começou!');
      }, goRemaining());
    } else {
      setTimeout(function () { playSound('tann'); }, 40);
    }
  }

  function doCreate(imageId, pieces) {
    setLoading(true, 'Criando a sala…');
    leaveDuelQuiet();
    socket.emit('create', { pid: state.pid, imageId: imageId, pieces: pieces, name: readName(), avatar: state.avatar }, function (res) {
      if (!res || !res.ok) {
        setLoading(false);
        hideGoSplash(true);
        showError($('#pick-error'), errorText(res && res.error));
        return;
      }
      enterRoom(res);
    });
  }

  function doJoin(code) {
    setLoading(true, 'Entrando na sala…');
    leaveDuelQuiet();
    socket.emit('join', { pid: state.pid, code: code, name: readName(), avatar: state.avatar }, function (res) {
      if (res && res.ok) { enterRoom(res); return; }
      if (res && res.error === 'notfound') {                     // pode ser uma Sala Desafio
        state.pid = duelPidFor(code);                            // quem caiu volta com a mesma identidade
        socket.emit('ch:join', { pid: state.pid, code: code, name: readName(), avatar: state.avatar }, function (r2) {
          if (r2 && r2.ok) { enterDuel(r2); return; }
          setLoading(false);
          showScreen('home');
          showError($('#home-error'), errorText(r2 && r2.error, r2));
        });
        return;
      }
      setLoading(false);
      showScreen('home');
      showError($('#home-error'), errorText(res && res.error, res));
    });
  }

  function enterRoom(res) {
    state.idx = res.idx;
    if (window.QC && window.QC.afterEnter) window.QC.afterEnter('coop');
    startGame(res.snapshot);
  }

  function startGame(snap) {
    setLoading(true, 'Preparando as peças…');
    return imagesReady.then(function () {
      return prepareImage(imageItem(snap.imageId), snap.cfg.COLS, snap.cfg.ROWS);
    }).then(function (url) {
      state.cfg = snap.cfg;
      state.code = snap.code;
      state.imageId = snap.imageId;
      state.imageUrl = url;
      state.total = snap.total;
      state.selectedId = null;
      state.drag = null;
      clearTimeout(state.idleTimer);
      buildField(snap);
      applyMeta(snap);
      setChatAvailability(snap.chatOn !== false);
      setChatHistory(snap.chat || []);
      $('#room-code').textContent = snap.code;
      ['#modal-win', '#modal-menu', '#modal-settings', '#modal-rematch'].forEach(closeModal);
      hideRematchWait();
      $('#field').classList.remove('won');
      $('#confetti').innerHTML = '';
      closeHint();
      clearSpot();
      markMilestones();
      try { history.replaceState(null, '', '?sala=' + snap.code); } catch (e) { /* ignora */ }
      state.inGame = true;
      $('#duel-strip').hidden = true; $('#duel-banner').hidden = true;
      $('#menu-change').hidden = false; $('#menu-restart').hidden = false;
      showScreen('game');
      if (!state.tipShown) {
        state.tipShown = true;
        if (!store.get('tutorial', 0)) setTimeout(openTutorial, 800 + goRemaining());    // primeira vez neste aparelho (depois da abertura)
      }
      ensurePush();
      layout();
      updateUi();
      setLoading(false);
      keepAwake();
      onGameShown();
      if (/^custom:/.test(snap.imageId)) socket.emit('imgready');          // imagem própria: avisa que já está carregada e preparada aqui
    });
  }

  /* ---------------------------------------------------------
   * Campo de jogo
   * --------------------------------------------------------- */
  // tamanho visual da peça: pequena enquanto espera na bandeja, cheia quando está na mão,
  // no tabuleiro ou solta fora da bandeja
  function baseScale(p) {
    var cfg = state.cfg;
    var small = cfg.TRAY / cfg.TILE;
    if (p.locked) return 1;
    var inTray = p.y > cfg.TRAY_LINE;
    if (p.heldBy !== null && p.heldBy !== undefined) {
      // peça só tocada (escolhida para girar) na bandeja continua pequena, para não cobrir as vizinhas;
      // ao ser arrastada, ou fora da bandeja, ela cresce
      var moving = p.heldBy === state.idx
        ? !!(state.drag && state.drag.id === p.id && state.drag.moved)
        : performance.now() - (p.lastMove || 0) < 500;
      return (!inTray || moving) ? HELD_SCALE : small * 1.12;
    }
    return inTray ? small : 1;
  }

  // zoom por pinça: só vale para a peça escolhida por mim e só na minha tela
  function targetScale(p) {
    var b = baseScale(p);
    return p.zoomAbs && !p.locked ? Math.max(p.zoomAbs, b) : b;
  }

  // a etiqueta (nome do amigo, ou giros que restam na minha peça) mantém o mesmo tamanho na tela
  function paintTag(p) {
    if (p.tag && (p.theirs || p.mine)) p.tag.style.transform = 'translateX(-50%) scale(' + (1 / p.vs).toFixed(3) + ')';
  }

  function paintLabel(p) {
    if (!p.tag) return;
    if (p.theirs) p.tag.textContent = displayName(p.heldBy) || 'Amigo';
    else if (p.mine) p.tag.textContent = '↻ ' + Math.max(0, state.cfg.MAX_ROT - p.rotUsed);
    p.tag.classList.toggle('mine-tag', !!p.mine);
  }

  function buildField(snap) {
    var cfg = state.cfg;
    var T = cfg.TILE;
    var field = $('#field');
    field.innerHTML = '';
    field.style.width = cfg.FIELD_W + 'px';
    field.style.height = cfg.FIELD_H + 'px';
    field.style.setProperty('--tile', T + 'px');

    var board = document.createElement('div');
    board.id = 'board';
    board.style.left = cfg.BOARD_X + 'px';
    board.style.top = cfg.BOARD_Y + 'px';
    board.style.width = cfg.BOARD_W + 'px';
    board.style.height = cfg.BOARD_H + 'px';
    board.style.backgroundSize = T + 'px ' + T + 'px';
    // imagem completa, bem clara, atrás das peças (só aparece quando o jogador usa a lâmpada)
    var ghost = document.createElement('div');
    ghost.id = 'ghost';
    ghost.style.backgroundImage = 'url("' + state.imageUrl + '")';
    ghost.style.backgroundSize = cfg.BOARD_W + 'px ' + cfg.BOARD_H + 'px';
    board.appendChild(ghost);
    field.appendChild(board);

    state.pieces = snap.pieces.map(function (d) {
      var el = document.createElement('div');
      el.className = 'piece';
      el.setAttribute('role', 'img');
      el.dataset.id = d.id;
      el.style.width = T + 'px';
      el.style.height = T + 'px';
      var tile = document.createElement('div');
      tile.className = 'tile';
      tile.style.backgroundImage = 'url("' + state.imageUrl + '")';
      tile.style.backgroundSize = cfg.BOARD_W + 'px ' + cfg.BOARD_H + 'px';
      tile.style.backgroundPosition = '-' + d.col * T + 'px -' + d.row * T + 'px';
      el.appendChild(tile);
      var tag = document.createElement('span');
      tag.className = 'tag';
      el.appendChild(tag);
      field.appendChild(el);
      var p = {
        id: d.id, col: d.col, row: d.row, el: el, tile: tile, tag: tag,
        x: d.x, y: d.y, tx: d.x, ty: d.y,          // x e y = CENTRO da peça
        rot: d.rot, ang: d.rot * 90, rotUsed: d.rotUsed,
        heldBy: d.heldBy, locked: d.locked, lockedBy: d.lockedBy, z: d.z,
        held: false, mine: false, theirs: false, zoomAbs: null, lastMove: 0, vs: 1, dirty: true, out: d.out !== false, fly: null
      };
      if (!p.out) el.style.display = 'none';          // ainda está dentro da caixa de presentes
      p.vs = targetScale(p);
      if (p.z > state.zMax) state.zMax = p.z;
      tile.style.transform = 'rotate(' + p.ang + 'deg)';
      classify(p);
      return p;
    });
    if (snap.mode === 'quebra' && cfg.GIFT) buildHand(cfg);
  }

  function classify(p) {
    var mine = p.heldBy === state.idx && !p.locked;
    var theirs = p.heldBy !== null && p.heldBy !== undefined && p.heldBy !== state.idx && !p.locked;
    p.el.classList.toggle('mine', mine);
    p.el.classList.toggle('theirs', theirs);
    p.el.classList.toggle('locked', !!p.locked);
    if (mine || theirs) p.el.style.setProperty('--hc', PLAYER_COLORS[p.heldBy] || '#1b2559');
    p.el.style.zIndex = p.locked ? 1 : p.z;
    p.held = mine || theirs;
    p.mine = mine;
    p.theirs = theirs;
    if (!mine) p.zoomAbs = null;          // o zoom acaba quando a peça é solta
    paintLabel(p);
    paintTag(p);
    labelPiece(p);
    p.dirty = true;
  }

  function labelPiece(p) {
    var where = p.locked ? 'encaixada no lugar certo' : (p.y > state.cfg.TRAY_LINE ? 'na bandeja' : 'solta no tabuleiro');
    var total = state.cfg ? state.cfg.COLS * state.cfg.ROWS : state.pieces.length;
    p.el.setAttribute('aria-label', 'Peça ' + (p.id + 1) + ' de ' + total + ', ' + where + (!p.locked && p.rot ? ', girada ' + p.rot * 90 + ' graus' : ''));
  }

  function setAngle(p, rot) {
    var diff = (((rot * 90 - p.ang) % 360) + 360) % 360;
    p.ang += diff;
    p.rot = rot;
    p.tile.style.transform = 'rotate(' + p.ang + 'deg)';
  }

  function layout() {
    if (!state.cfg) return;
    var stage = $('#stage');
    var w = stage.clientWidth - 8;
    var h = stage.clientHeight;
    if (w <= 0 || h <= 0) return;
    var s = Math.min(w / state.cfg.FIELD_W, h / state.cfg.FIELD_H);
    state.scale = s;
    var wrap = $('#fieldWrap');
    wrap.style.width = Math.floor(state.cfg.FIELD_W * s) + 'px';
    wrap.style.height = Math.floor(state.cfg.FIELD_H * s) + 'px';
    $('#field').style.transform = 'scale(' + s + ')';
    var fr = $('#field').getBoundingClientRect(), sr = stage.getBoundingClientRect();
    state.view = { minX: (sr.left - fr.left) / s, maxX: (sr.right - fr.left) / s, minY: (sr.top - fr.top) / s, maxY: (sr.bottom - fr.top) / s };
  }

  /* Laço de animação: só mexe nas peças que mudaram */
  var lastTimerPaint = 0;
  function frame(now) {
    var ps = state.pieces;
    var half = state.cfg ? state.cfg.TILE / 2 : 0;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      var changed = p.dirty;
      var dragging = state.drag && state.drag.id === p.id && state.drag.moved;
      if (p.fly) {                                           // saindo da caixa: voa em arco até a vaga
        var u = (now - p.fly.t0) / p.fly.dur;
        if (u >= 1) { p.x = p.tx = p.fly.tx; p.y = p.ty = p.fly.ty; p.fly = null; }
        else {
          var ee = 1 - Math.pow(1 - Math.max(0, u), 3);
          p.x = p.fly.fx + (p.fly.tx - p.fly.fx) * ee;
          p.y = p.fly.fy + (p.fly.ty - p.fly.fy) * ee - Math.sin(Math.PI * Math.max(0, u)) * 150;
        }
        changed = true;
      } else if (!p.locked && !dragging) {
        var dx = p.tx - p.x, dy = p.ty - p.y;
        if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) { p.x += dx * 0.35; p.y += dy * 0.35; changed = true; }
        else if (dx !== 0 || dy !== 0) { p.x = p.tx; p.y = p.ty; changed = true; }
      } else if (p.locked && (p.x !== p.tx || p.y !== p.ty)) {
        p.x = p.tx; p.y = p.ty; changed = true;
      }
      var ts = targetScale(p);
      if (p.vs !== ts) {
        var dv = ts - p.vs;
        p.vs = Math.abs(dv) > 0.004 ? p.vs + dv * 0.3 : ts;
        changed = true;
      }
      var px = p.x, py = p.y;
      var v = state.view;
      if (p.zoomAbs && !p.locked && v && v.maxX > v.minX && v.maxY > v.minY) {
        var hs = half * p.vs, top = 34 / state.scale, m = 8 / state.scale;   // 34px livres em cima para a etiqueta "↻ n"; 8px de folga nos outros lados
        px = (v.maxX - v.minX) < 2 * hs + 2 * m ? (v.minX + v.maxX) / 2 : clamp(px, v.minX + hs + m, v.maxX - hs - m);
        py = (v.maxY - v.minY) < 2 * hs + top + m ? (v.minY + v.maxY + top - m) / 2 : clamp(py, v.minY + hs + top, v.maxY - hs - m);
        changed = true;
      }
      p.dx = px; p.dy = py;                                  // onde a peça aparece de fato
      if (changed) {
        p.el.style.transform = 'translate3d(' + (px - half) + 'px,' + (py - half) + 'px,0) scale(' + p.vs + ')';
        paintTag(p);
        p.dirty = false;
      }
    }
    if (now - lastTimerPaint > 250) { lastTimerPaint = now; paintTimer(); }
    requestAnimationFrame(frame);
  }

  function curElapsed() {
    if (state.status === 'won') return state.finalMs;
    if (state.status === 'playing' && state.timerBase !== null) return Date.now() - state.timerBase;
    return 0;
  }
  function paintTimer() {
    if (!state.inGame) return;
    $('#hud-time').textContent = fmtTime(curElapsed());
  }

  /* ---------------------------------------------------------
   * Toque / mouse nas peças
   * --------------------------------------------------------- */
  function resetIdle() {
    clearTimeout(state.idleTimer);
    if (state.duel) return;                       // na Sala Desafio as peças são só suas: não precisa soltar para ninguém
    if (state.selectedId === null) return;
    state.idleTimer = setTimeout(function () {
      if (state.selectedId !== null && !state.drag) { dropSelected(); toast('Peça solta para seu amigo poder usar'); }
    }, 20000);
  }

  function dropSelected() {
    if (state.selectedId === null) return;
    var p = state.pieces[state.selectedId];
    state.selectedId = null;
    clearTimeout(state.idleTimer);
    if (p && !p.locked) {
      p.heldBy = null;
      classify(p);
      gameEmit('drop', { id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
    }
    updateUi();
  }

  function shake(p) {
    p.el.classList.remove('shake');
    void p.el.offsetWidth;
    p.el.classList.add('shake');
    setTimeout(function () { p.el.classList.remove('shake'); }, 320);
  }

  /* ---------------------------------------------------------
   * Gestos nas peças
   *  - arrastar: segurar a peça com o dedo e arrastar
   *  - girar: tocar na peça já escolhida (ou tocar duas vezes seguidas)
   *  - zoom: com a peça escolhida, movimento de pinça com dois dedos (roda do mouse no computador)
   *  - soltar: tocar num espaço vazio, ou arrastar e soltar
   * --------------------------------------------------------- */
  function pointerCount() { return Object.keys(state.ptrs).length; }

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (state.duel && state.status !== 'playing') return;           // antes da largada e depois do fim ninguém mexe nas peças
    state.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };

    if (pointerCount() >= 2) {               // segundo dedo: pinça (só com uma peça escolhida)
      if (state.selectedId !== null && !state.pinch) startPinch();
      return;
    }
    if (state.drag) return;

    var el = e.target.closest ? e.target.closest('.piece') : null;
    var p = el ? state.pieces[Number(el.dataset.id)] : null;

    if (!p) { // toque no vazio: solta a peça escolhida
      if (state.selectedId !== null) dropSelected();
      return;
    }
    if (p.locked) return;
    if (p.fly) { p.fly = null; p.tx = p.x; p.ty = p.y; }
    if (p.heldBy !== null && p.heldBy !== undefined && p.heldBy !== state.idx) {
      toast(friendName() + ' está com essa peça');
      shake(p);
      return;
    }
    e.preventDefault();

    var wasSelected = state.selectedId === p.id;
    if (!wasSelected) {
      if (state.selectedId !== null) {
        var old = state.pieces[state.selectedId];
        old.heldBy = null;
        classify(old);
      }
      state.selectedId = p.id;
      p.heldBy = state.idx;
      p.z = ++state.zMax;
      classify(p);
      gameEmit('grab', { id: p.id });
    }

    var rect = $('#field').getBoundingClientRect();
    var lx = (e.clientX - rect.left) / state.scale;
    var ly = (e.clientY - rect.top) / state.scale;
    // a peça cresce ao ser pega: mantém o dedo no mesmo ponto da imagem
    var zoomed = !!p.zoomAbs && wasSelected;
    var cx0 = zoomed && p.dx != null ? p.dx : p.x, cy0 = zoomed && p.dy != null ? p.dy : p.y;
    var k = zoomed ? 1 : HELD_SCALE / Math.max(0.2, p.vs);
    var lim = state.cfg.TILE / 2 * (zoomed ? p.vs : HELD_SCALE);
    state.drag = {
      id: p.id, pointerId: e.pointerId, sx: e.clientX, sy: e.clientY,
      offX: clamp((lx - cx0) * k, -lim, lim), offY: clamp((ly - cy0) * k, -lim, lim),
      rect: rect, moved: false, last: 0, wasSelected: wasSelected
    };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    clearTimeout(state.idleTimer);
    updateUi();
  }

  function startPinch() {
    var ids = Object.keys(state.ptrs);
    var a = state.ptrs[ids[0]], b = state.ptrs[ids[1]];
    var p = state.pieces[state.selectedId];
    if (!p || p.locked || !a || !b) return;
    state.drag = null;                        // o arrasto vira pinça (a peça continua escolhida)
    state.pinch = { ids: [ids[0], ids[1]], d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), z0: p.vs, id: p.id };
    clearTimeout(state.idleTimer);
  }

  function setZoom(p, v) {
    var base = baseScale(p);
    var stageW = $('#stage').clientWidth || 360;
    var maxAbs = Math.min(ZOOM_MAX, (0.92 * stageW) / (state.cfg.TILE * state.scale));   // no máx. ~92% da largura da tela
    v = clamp(v, base, Math.max(base, maxAbs));
    p.zoomAbs = v > base * 1.04 ? v : null;
    p.dirty = true;
  }

  function onPointerMove(e) {
    var tp = state.ptrs[e.pointerId];
    if (tp) { tp.x = e.clientX; tp.y = e.clientY; }

    if (state.pinch) {
      var pc = state.pinch;
      var a = state.ptrs[pc.ids[0]], b = state.ptrs[pc.ids[1]];
      var pz = state.pieces[pc.id];
      if (a && b && pz && !pz.locked) setZoom(pz, pc.z0 * Math.hypot(a.x - b.x, a.y - b.y) / pc.d0);
      return;
    }

    var d = state.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
      d.moved = true;
    }
    var p = state.pieces[d.id];
    var half = Math.ceil(state.cfg.TRAY / 2);
    var lx = (e.clientX - d.rect.left) / state.scale;
    var ly = (e.clientY - d.rect.top) / state.scale;
    p.x = clamp(lx - d.offX, half, state.cfg.FIELD_W - half);
    p.y = clamp(ly - d.offY, half, state.cfg.FIELD_H - half);
    p.tx = p.x; p.ty = p.y;
    p.dirty = true;
    var now = performance.now();
    if (now - d.last >= 50) {
      d.last = now;
      socket.volatile.emit(state.duel ? 'ch:move' : 'move', { id: p.id, x: Math.round(p.x), y: Math.round(p.y) });
    }
  }

  function onPointerUp(e, cancelled) {
    delete state.ptrs[e.pointerId];
    if (state.pinch && state.pinch.ids.indexOf(String(e.pointerId)) !== -1) {
      state.pinch = null;                     // fim da pinça: o dedo que sobrou não move nem gira a peça
      resetIdle();
      return;
    }
    endPointer(e, cancelled);
  }

  function endPointer(e, cancelled) {
    var d = state.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    state.drag = null;
    var p = state.pieces[d.id];
    if (d.moved) {
      dropSelected();                         // arrastou e soltou: tenta encaixar
    } else if (d.wasSelected && !cancelled) {
      rotateSelected();                       // tocou de novo na peça escolhida: gira
    } else {
      resetIdle();                            // tocou numa peça nova: fica escolhida
    }
    if (p && !p.locked) p.dirty = true;
    updateUi();
  }

  // roda do mouse (computador): zoom na peça escolhida
  function onWheel(e) {
    if (!state.inGame || state.selectedId === null) return;
    var p = state.pieces[state.selectedId];
    if (!p || p.locked) return;
    e.preventDefault();
    setZoom(p, (p.zoomAbs || baseScale(p)) * (e.deltaY < 0 ? 1.15 : 1 / 1.15));
    resetIdle();
  }

  /* ---------------------------------------------------------
   * Girar
   * --------------------------------------------------------- */
  function rotateSelected() {
    if (state.selectedId === null) return;
    var p = state.pieces[state.selectedId];
    if (!p || p.locked) return;
    if (p.rotUsed >= state.cfg.MAX_ROT) {
      toast('Sem giros. Toque num espaço vazio para soltar a peça e renovar.', 2800);
      shake(p);
      return;
    }
    p.rotUsed++;
    setAngle(p, (p.rot + 1) % 4);
    gameEmit('rotate', { id: p.id });
    vibrate(10);
    resetIdle();
    updateUi();
  }

  /* ---------------------------------------------------------
   * 💡 Lâmpada: mostra a imagem esmaecida no tabuleiro (atrás das peças) por 4 segundos.
   * Cada jogador pode usar 10 vezes por partida (o servidor conta).
   * --------------------------------------------------------- */
  function useHint() {
    if (state.hintActive) return;
    if (state.hints <= 0) { toast('Suas dicas acabaram'); return; }
    gameEmit('hint', null, function (res) {
      if (!res || !res.ok) { state.hints = 0; updateUi(); toast('Suas dicas acabaram'); return; }
      state.hints = res.left;
      showHint();
      if (state.hints === 0) toast('Essa foi a sua última dica');
      updateUi();
    });
  }

  function showHint() {
    var g = $('#ghost');
    if (!g) return;
    g.classList.add('on');
    state.hintActive = true;
    $('#btn-hint').classList.add('lit');
    clearTimeout(state.hintTimer);
    state.hintTimer = setTimeout(closeHint, HINT_MS);
  }

  function closeHint() {
    clearTimeout(state.hintTimer);
    state.hintActive = false;
    var g = $('#ghost');
    if (g) g.classList.remove('on');
    $('#btn-hint').classList.remove('lit');
    if (state.inGame) updateUi();
  }

  /* ---------------------------------------------------------
   * 💬 Conversa (painel que abre por cima do jogo; não ocupa espaço do tabuleiro)
   * --------------------------------------------------------- */
  var EMOJI_ONLY = null;
  try { EMOJI_ONLY = new RegExp('^(?:\\p{Extended_Pictographic}|\\u200d|\\ufe0f|\\s){1,8}$', 'u'); } catch (e) { /* navegador antigo: sem destaque */ }

  function setChatAvailability(on) {
    state.chatOn = !!on;
    $('#btn-chat').hidden = !state.chatOn;
    if (!state.chatOn) closeChat();
  }

  function chatEl(m) {
    var li = document.createElement('li');
    var mine = m.idx === state.idx;
    li.className = 'chat-msg ' + (mine ? 'me' : 'friend');
    li.style.setProperty('--c', PLAYER_COLORS[m.idx] || '#1b2559');
    if (EMOJI_ONLY && EMOJI_ONLY.test(m.text)) li.classList.add('big');
    if (!mine) {
      var who = document.createElement('span');
      who.className = 'who';
      who.textContent = (state.players && state.players[m.idx] && state.players[m.idx].avatar ? state.players[m.idx].avatar + ' ' : '') + (m.name || 'Amigo');
      li.appendChild(who);
    }
    var tx = document.createElement('span');
    tx.className = 'txt';
    tx.textContent = m.text;                 // sempre como texto: nada vira HTML nem link
    li.appendChild(tx);
    return li;
  }

  function scrollChat() {
    var l = $('#chat-list');
    l.scrollTop = l.scrollHeight;
  }

  function setChatHistory(arr) {
    state.chat = (arr || []).slice(-50);
    var l = $('#chat-list');
    l.innerHTML = '';
    state.chat.forEach(function (m) { l.appendChild(chatEl(m)); });
    scrollChat();
  }

  function updateChatBadge() {
    var b = $('#chat-badge');
    b.hidden = state.unread <= 0;
    b.textContent = state.unread > 9 ? '9+' : String(state.unread);
  }

  function showChatPop(m) {
    var p = $('#chat-pop');
    p.innerHTML = '';
    var n = document.createElement('b');
    n.textContent = (m.name || 'Amigo') + ':';
    p.appendChild(n);
    p.appendChild(document.createTextNode(m.text));
    p.hidden = false;
    clearTimeout(state.popTimer);
    state.popTimer = setTimeout(function () { p.hidden = true; }, 4000);
  }

  function onChatMessage(m) {
    if (!m || typeof m.text !== 'string') return;
    var last = state.chat.length ? state.chat[state.chat.length - 1].id : 0;
    if (m.id <= last) return;                // já mostrada (ex.: histórico recebido ao reconectar)
    state.chat.push(m);
    if (state.chat.length > 50) { state.chat.shift(); if ($('#chat-list').firstChild) $('#chat-list').removeChild($('#chat-list').firstChild); }
    $('#chat-list').appendChild(chatEl(m));
    if (m.idx !== state.idx) { playSound('msg'); announce((m.name || 'Amigo') + ' escreveu: ' + m.text); }
    if (state.chatOpen) { scrollChat(); return; }
    if (m.idx !== state.idx) {               // chegou do amigo com a conversa fechada
      state.unread++;
      updateChatBadge();
      showChatPop(m);
      vibrate(15);
    }
  }

  function openChat() {
    if (!state.chatOn) return;
    state.chatOpen = true;
    state.unread = 0;
    updateChatBadge();
    $('#chat-pop').hidden = true;
    $('#chat-panel').hidden = false;
    updateKeyboardOffset();
    scrollChat();
    renderPhrases();
  }

  function closeChat() {
    state.chatOpen = false;
    $('#chat-panel').hidden = true;
  }

  // manda uma FRASE PRONTA (só o código dela; o servidor confere se está liberada e escreve o texto)
  function sendChat(id) {
    if (!id || !state.chatOn) return;
    gameEmit('chat', { p: id }, function (res) {
      if (res && res.ok) return;
      if (res && res.error === 'rate') toast('Calma! Espere um instante para enviar de novo.');
      else if (res && res.error === 'locked') toast('Essa frase ainda está bloqueada. Jogue mais para liberar!');
      else if (res && res.error === 'off') toast('A conversa está desligada neste jogo.');
      else toast('Não foi possível enviar. Tente de novo.');
    });
  }
  function phraseOpen(p) {
    if (p.group !== 'liberar') return true;
    return !!(state.unlocked && state.unlocked[p.id]);
  }
  function renderPhrases() {
    var box = $('#chat-phrases');
    if (!box) return;
    box.innerHTML = '';
    var list = state.phrases.filter(function (p) { return p.group !== 'reacao'; });
    list.sort(function (a, b) { return (phraseOpen(b) ? 1 : 0) - (phraseOpen(a) ? 1 : 0); });
    list.forEach(function (p) {
      var open = phraseOpen(p), b = document.createElement('button');
      b.type = 'button'; b.className = 'ph' + (open ? '' : ' lock'); b.dataset.p = p.id;
      b.textContent = open ? p.text : '🔒 ' + p.need;
      if (!open) b.setAttribute('aria-label', 'Frase bloqueada. Para liberar: ' + p.need);
      box.appendChild(b);
    });
  }

  // o teclado do celular cobre a parte de baixo da tela: o painel sobe junto com ele
  function updateKeyboardOffset() {
    var vv = window.visualViewport;
    var kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
    document.documentElement.style.setProperty('--kb', kb + 'px');
  }

  socket.on('chat', onChatMessage);

  /* ---------------------------------------------------------
   * Interface: HUD, dica e botão de girar
   * --------------------------------------------------------- */
  function updateUi() {
    var sel = state.selectedId !== null ? state.pieces[state.selectedId] : null;
    if (sel) paintLabel(sel);                // "↻ n" = giros que ainda restam
    refreshLamp();
    updateHud();
  }

  function updateHud() {
    $('#hud-count').textContent = state.locked + '/' + state.total;
    $('#hud-bar').style.width = (state.total ? (100 * state.locked) / state.total : 0) + '%';
    var pg = $('#hud-progress');
    pg.setAttribute('aria-valuemax', String(state.total));
    pg.setAttribute('aria-valuenow', String(state.locked));
    if (state.idx !== null) {
      paintAvatar($('#av-me'), state.idx, true);
      paintAvatar($('#av-friend'), 1 - state.idx, false);
    }
    // faixa com o código: só aparece enquanto o amigo não está na sala
    var fp = state.idx !== null && state.players ? state.players[1 - state.idx] : null;
    $('#banner-wait').hidden = !(state.inGame && !state.duel && !state.friendOnline && state.status !== 'won');
    if (state.duel) paintStrip();
    $('#wait-msg').textContent = fp && fp.joined ? 'amigo saiu' : 'aguardando…';
  }

  function applyMeta(m) {
    var friend = m.players && state.idx !== null ? m.players[1 - state.idx] : null;
    var online = !!(friend && friend.connected);
    state.players = m.players || [];
    state.names = [(state.players[0] && state.players[0].name) || '', (state.players[1] && state.players[1].name) || ''];
    if (m.hints && state.idx !== null) state.hints = m.hints[state.idx];
    if (m.spots && state.idx !== null) state.spots = m.spots[state.idx];
    if (state.inGame && online !== state.friendOnline) {
      toast(online ? friendName() + ' entrou!' : friendName() + ' saiu da sala');
      announce(online ? friendName() + ' entrou na sala.' : friendName() + ' saiu da sala.');
    }
    state.friendOnline = online;
    state.pieces.forEach(function (p) { if (p.heldBy !== null && p.heldBy !== undefined) classify(p); });
    state.status = m.status;
    if (!state.duel) {                                           // imagem própria: a partida só começa quando os dois celulares a prepararam
      var wait = $('#duel-banner');
      if (m.loading) { wait.className = 'banner warn duel-banner info'; wait.textContent = 'Preparando a imagem nos dois celulares…'; wait.hidden = false; }
      else if (wait.classList.contains('info')) { wait.hidden = true; }
    }
    state.counts = m.counts || [0, 0];
    state.locked = m.locked || 0;
    if (m.status === 'playing') state.timerBase = Date.now() - m.elapsedMs;
    else if (m.status === 'won') state.finalMs = m.elapsedMs;
    else state.timerBase = null;
    updateHud();
    paintTimer();
  }

  /* ---------------------------------------------------------
   * Vitória
   * --------------------------------------------------------- */
  function showWin(data) {
    state.finalMs = data.elapsedMs;
    $('#win-time').textContent = fmtTime(data.elapsedMs);
    $('#win-me').textContent = data.counts[state.idx] || 0;
    $('#win-friend').textContent = data.counts[1 - state.idx] || 0;
    $('#win-me-name').textContent = myName();
    $('#win-friend-name').textContent = friendName();
    paintAvatar($('#win-me-av'), state.idx, true, false);
    paintAvatar($('#win-friend-av'), 1 - state.idx, false, false);
    var art = $('#win-art');
    art.style.backgroundImage = 'url("' + state.imageUrl + '")';
    art.style.setProperty('--ar', state.cfg.COLS / state.cfg.ROWS);
    var best = recordTime(data.elapsedMs);
    var b = $('#win-best');
    b.textContent = best.text;
    b.className = 'win-best' + (best.record ? ' record' : '');
    b.hidden = !best.text;
    $('#field').classList.add('won');            // some as linhas entre as peças
    state.winBlob = null;
    var box = $('#confetti');
    box.innerHTML = '';
    if (!reducedMotion()) {
      var colors = ['#ffcf33', '#2f6bff', '#ff4f8b', '#1fc8a0', '#ffffff'];
      for (var i = 0; i < 44; i++) {
        var c = document.createElement('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDuration = 2.4 + Math.random() * 2.2 + 's';
        c.style.animationDelay = Math.random() * 0.8 + 's';
        box.appendChild(c);
      }
    }
    openModal('#modal-win', '#win-again');
    vibrate([40, 60, 40]);
    playSound('win');
    announce('Vocês conseguiram! Tempo: ' + fmtTime(data.elapsedMs) + '. ' + best.text);
  }


  /* ---------------------------------------------------------
   * Ajustes: texto maior, modo escuro, movimento reduzido, sons, vibração, avisos
   * --------------------------------------------------------- */
  function prefersDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function reducedMotion() {
    return state.settings.motion === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function applySettings() {
    var h = document.documentElement, s = state.settings;
    h.setAttribute('data-text', s.text);
    var dark = s.theme === 'dark' || (s.theme === 'auto' && prefersDark());
    h.setAttribute('data-theme', dark ? 'dark' : 'light');
    h.setAttribute('data-motion', s.motion === 'reduce' ? 'reduce' : 'auto');
    var mt = document.querySelector('meta[name="theme-color"]');
    if (mt) mt.setAttribute('content', dark ? '#111733' : '#eaeeff');
    Array.prototype.forEach.call(document.querySelectorAll('#modal-settings [data-setting]'), function (el) {
      var k = el.getAttribute('data-setting');
      if (el.classList.contains('seg')) {
        Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
          b.setAttribute('aria-checked', b.getAttribute('data-v') === String(s[k]) ? 'true' : 'false');
        });
      } else {
        el.setAttribute('aria-checked', s[k] ? 'true' : 'false');
      }
    });
    var on = !!s.sound;
    $('#menu-sound').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('#menu-sound-icon').textContent = on ? '🔊' : '🔇';
    $('#menu-sound-text').textContent = on ? 'Som: ligado' : 'Som: desligado';
    updatePushNote();
  }

  function saveSettings() { store.set('settings', state.settings); applySettings(); }

  function toggleSetting(key) {
    if (key === 'push') { if (state.settings.push) disablePush(); else enablePush(); return; }
    state.settings[key] = !state.settings[key];
    saveSettings();
    if (key === 'sound' && state.settings.sound) playSound('snap');
    if (key === 'vibrate' && state.settings.vibrate) vibrate(40);
  }

  /* Janelas: abrem com o foco no botão certo e devolvem o foco ao fechar (leitores de tela e teclado) */
  var lastBtn = null;   // último botão tocado: é para ele que o foco volta quando a janela fecha
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) lastBtn = b; }, true);
  function openModal(sel, focusSel) {
    var m = $(sel);
    if (!m) return;
    if (m.hidden) {
      var usable = lastBtn && document.contains(lastBtn) && !(lastBtn.closest && lastBtn.closest('[hidden]'));
      m._ret = usable ? lastBtn : document.activeElement;
    }
    m.hidden = false;
    var f = focusSel ? m.querySelector(focusSel) : m.querySelector('button');
    try { if (f) f.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
  }
  function closeModal(sel) {
    var m = $(sel);
    if (!m || m.hidden) return;
    m.hidden = true;
    var r = m._ret;
    m._ret = null;
    try { if (r && r.focus && document.contains(r)) r.focus({ preventScroll: true }); } catch (e) { /* ignora */ }
  }

  // anúncio para leitores de tela
  function announce(text) {
    var el = $('#sr-live');
    if (!el) return;
    el.textContent = '';
    setTimeout(function () { el.textContent = text; }, 60);
  }

  /* ---------------------------------------------------------
   * Sons (gerados pelo navegador, sem arquivos)
   * --------------------------------------------------------- */
  var audio = { ctx: null, last: {} };
  function getAudio() {
    if (!state.settings.sound) return null;
    try {
      if (!audio.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audio.ctx = new AC();
      }
      if (audio.ctx.state === 'suspended' && audio.ctx.resume) audio.ctx.resume();
      return audio.ctx;
    } catch (e) { return null; }
  }
  function tone(ctx, freq, start, dur, type, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    var t0 = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }
  /*TANN-START*/
  // "TANNN": batida grave + impacto + acorde de metais (dó maior) com eco curto — começo da partida
  function soundTann(c) {
    var t = c.currentTime;
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
    comp.connect(c.destination);
    var master = c.createGain(); master.gain.value = 0.85; master.connect(comp);
    // eco curto, para dar "salão"
    var dly = c.createDelay(0.5); dly.delayTime.value = 0.13;
    var fb = c.createGain(); fb.gain.value = 0.3;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
    var wet = c.createGain(); wet.gain.value = 0.3;
    master.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(wet); wet.connect(comp);
    // 1) batida grave (gongo/bumbo): seno que desce de 110 Hz para 48 Hz
    var o = c.createOscillator(), og = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.5);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.7, t + 0.01); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    o.connect(og); og.connect(master); o.start(t); o.stop(t + 2.0);
    // 2) impacto de ruído filtrado (o "TAN" seco do começo)
    var len = Math.floor(c.sampleRate * 0.4), buf = audio.noise;
    if (!buf || buf.length !== len) {            // o "chiado" é montado uma vez só
      buf = c.createBuffer(1, len, c.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      audio.noise = buf;
    }
    var ns = c.createBufferSource(); ns.buffer = buf;
    var nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.setValueAtTime(5200, t); nf.frequency.exponentialRampToValueAtTime(380, t + 0.3);
    var ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.5, t + 0.006); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    ns.connect(nf); nf.connect(ng); ng.connect(master); ns.start(t);
    // 3) acorde de metais: serras levemente desafinadas, com o filtro abrindo e fechando (o "NNN")
    [130.81, 196.0, 261.63, 329.63, 392.0, 523.25].forEach(function (f) {
      [-7, 7].forEach(function (cents) {
        var s = c.createOscillator(), sg = c.createGain(), sf = c.createBiquadFilter();
        s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = cents;
        sf.type = 'lowpass'; sf.Q.value = 1;
        sf.frequency.setValueAtTime(500, t); sf.frequency.exponentialRampToValueAtTime(2600, t + 0.07); sf.frequency.exponentialRampToValueAtTime(800, t + 1.6);
        sg.gain.setValueAtTime(0.0001, t); sg.gain.exponentialRampToValueAtTime(0.05, t + 0.025);
        sg.gain.setValueAtTime(0.05, t + 0.35); sg.gain.exponentialRampToValueAtTime(0.03, t + 0.95);
        sg.gain.exponentialRampToValueAtTime(0.009, t + 1.45); sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.95);
        s.connect(sf); sf.connect(sg); sg.connect(master); s.start(t); s.stop(t + 2.0);
      });
    });
    // 4) brilho no final do acorde
    [1046.5, 1568].forEach(function (f, k) { tone(c, f, 0.02 + k * 0.03, 1.4, 'triangle', 0.035); });
  }
  /*TANN-END*/
  var SOUNDS = {
    tann: soundTann,
    gift: function (c) { tone(c, 330, 0, .07, 'triangle', .12); tone(c, 494, .05, .08, 'triangle', .12); tone(c, 740, .1, .16, 'sine', .12); },
    tick: function (c) { tone(c, 520, 0, .14, 'sine', .15); },
    tick2: function (c) { tone(c, 760, 0, .18, 'sine', .17); },
    snap: function (c) { tone(c, 523, 0, .09, 'triangle', .13); tone(c, 784, .07, .15, 'triangle', .13); },
    win: function (c) { [523, 659, 784, 1047].forEach(function (f, i) { tone(c, f, i * .13, .28, 'triangle', .15); }); tone(c, 1319, .55, .5, 'sine', .12); },
    msg: function (c) { tone(c, 880, 0, .1, 'sine', .09); tone(c, 1175, .09, .16, 'sine', .09); },
    chime: function (c) { tone(c, 659, 0, .12, 'triangle', .11); tone(c, 988, .1, .22, 'triangle', .11); },
    ping: function (c) { tone(c, 740, 0, .1, 'sine', .1); tone(c, 740, .2, .1, 'sine', .1); },
    blip: function (c) { tone(c, 1046, 0, .08, 'sine', .07); }
  };
  function playSound(name) {
    var now = Date.now();
    if (audio.last[name] && now - audio.last[name] < 90) return;
    audio.last[name] = now;
    var c = getAudio();
    if (!c || !SOUNDS[name]) return;
    try { SOUNDS[name](c); } catch (e) { /* ignora */ }
  }
  // navegadores só liberam o som depois de um toque: prepara no primeiro toque
  document.addEventListener('pointerdown', function () {
    if (!state.settings.sound || audio.ctx || audio.pending) return;
    audio.pending = true;                      // cria o contexto de som logo depois do toque, para não engasgar a resposta do 1º toque
    var go = function () { audio.pending = false; getAudio(); };
    if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 350 }); else setTimeout(go, 120);
  }, { passive: true });

  /* ---------------------------------------------------------
   * Avatares: círculo na cor do jogador, com a inicial do nome ou o emoji escolhido
   * --------------------------------------------------------- */
  function initialOf(name) {
    var a = Array.from(String(name || '').trim());
    return a.length ? a[0].toUpperCase() : '';
  }
  function displayName(idx) {
    var pl = state.players && state.players[idx];
    var n = state.names[idx] || '';
    return (pl && pl.avatar ? pl.avatar + ' ' : '') + n;
  }
  function paintAvatar(el, idx, isMe, withStatus) {
    if (!el) return;
    var pl = (state.players && state.players[idx]) || {};
    var name = state.names[idx] || (isMe ? 'Você' : '');
    var joined = isMe || !!pl.joined;
    var online = isMe ? true : !!pl.connected;
    var face = pl.avatar || initialOf(name) || '?';
    el.style.setProperty('--c', PLAYER_COLORS[idx]);
    el.classList.toggle('emoji', !!pl.avatar);
    el.classList.toggle('p1', idx === 1);
    var f = el.querySelector('.av-face');
    if (f) f.textContent = face;
    if (withStatus !== false) {
      el.classList.toggle('off', !online);
      el.setAttribute('aria-label', isMe ? name + ' (você)' : (joined ? name + (online ? '' : ' (fora da sala)') : 'Amigo: aguardando'));
    }
  }

  function renderAvatarPicker() {
    var grid = $('#avatar-grid');
    grid.innerHTML = '';
    function add(face, val, label, cls) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', state.avatar === val ? 'true' : 'false');
      b.setAttribute('aria-label', label);
      b.dataset.v = val;
      if (cls) b.className = cls;
      b.textContent = face;
      grid.appendChild(b);
      return b;
    }
    var letter = add(initialOf($('#input-name').value) || 'A', '', 'Usar a inicial do meu nome', 'letter');
    letter.id = 'avatar-letter';
    state.avatars.forEach(function (e) { add(e, e, 'Avatar ' + e); });
  }

  /* ---------------------------------------------------------
   * Tutorial animado (abre sozinho na primeira vez; também em Menu > Como jogar)
   * --------------------------------------------------------- */
  var TUT = [
    { h: 'Arrastar', t: 'Segure a peça com o dedo e arraste até o lugar dela no tabuleiro. Ela cresce enquanto você a move.' },
    { h: 'Girar', t: 'Toque na peça para escolhê-la e toque nela de novo para girar. O ▲ é o lado de cima e ↻ mostra quantos giros restam.' },
    { h: 'Zoom', t: 'Com a peça escolhida, afaste dois dedos para ampliar e junte para reduzir. Toque num espaço vazio para soltá-la.' },
    { h: 'Ajudas', t: '💡 mostra a imagem por 4 segundos. Com uma peça escolhida, vira 📍 e mostra o lugar dela. 💬 abre a conversa e 🔔 avisa quando o amigo chamar.' }
  ];
  var tut = { i: 0, timer: null };

  function showTut(i) {
    tut.i = Math.max(0, Math.min(TUT.length - 1, i));
    Array.prototype.forEach.call(document.querySelectorAll('.tut-scene'), function (s) { s.classList.toggle('on', Number(s.getAttribute('data-scene')) === tut.i); });
    $('#tut-head').textContent = TUT[tut.i].h;
    $('#tut-text').textContent = TUT[tut.i].t;
    Array.prototype.forEach.call(document.querySelectorAll('#tut-dots button'), function (b) {
      if (Number(b.getAttribute('data-i')) === tut.i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    });
    var last = tut.i === TUT.length - 1;
    $('#tut-next').textContent = last ? 'Entendi' : 'Próximo';
    $('#tut-skip').hidden = last;
    $('#tut-prev').disabled = tut.i === 0;
    $('#tut-push').hidden = !(last && pushSupported() && !state.settings.push && !(typeof Notification !== 'undefined' && Notification.permission === 'denied'));
  }
  function startTutTimer() {
    clearInterval(tut.timer);
    tut.timer = setInterval(function () { if (tut.i < TUT.length - 1) showTut(tut.i + 1); else clearInterval(tut.timer); }, 5200);
  }
  function openTutorial() {
    showTut(0);
    openModal('#modal-help', '#tut-next');
    startTutTimer();
  }
  function closeTutorial() {
    clearInterval(tut.timer);
    closeModal('#modal-help');
    store.set('tutorial', 1);
  }

  /* ---------------------------------------------------------
   * Marcos de progresso: 25%, 50% e 75%
   * --------------------------------------------------------- */
  var MILESTONES = [{ pct: 75, text: 'Falta pouco! 💪' }, { pct: 50, text: 'Metade! 🔥' }, { pct: 25, text: 'Um quarto! 🎯' }];
  function markMilestones() {
    var pct = state.total ? (100 * state.locked) / state.total : 0;
    state.milestones = {};
    MILESTONES.forEach(function (m) { if (pct >= m.pct) state.milestones[m.pct] = true; });
  }
  function checkMilestones() {
    if (!state.total || state.locked >= state.total) return;
    var pct = (100 * state.locked) / state.total, hit = null;
    MILESTONES.forEach(function (m) {
      if (pct >= m.pct && !state.milestones[m.pct]) { state.milestones[m.pct] = true; if (!hit) hit = m; }
    });
    if (hit) showMilestone(hit.text);
  }
  function showMilestone(text) {
    var el = $('#milestone');
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    if (reducedMotion()) { el.style.opacity = '1'; el.style.transform = 'translateX(-50%)'; }
    else { el.style.opacity = ''; el.style.transform = ''; el.style.animation = ''; }
    clearTimeout(state.msTimer);
    state.msTimer = setTimeout(function () { el.hidden = true; }, 2300);
    playSound('chime');
    announce(text);
  }

  /* ---------------------------------------------------------
   * 📍 Dica de lugar: pisca a casa certa da peça escolhida (só um destaque; não mexe na peça)
   * --------------------------------------------------------- */
  function clearSpot() {
    clearTimeout(state.spotTimer);
    var old = document.querySelector('#field .spot');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    state.spotActive = false;
    state.spotPiece = null;
    $('#btn-hint').classList.remove('lit');
  }
  function showSpot(col, row, pieceId) {
    clearSpot();
    var cfg = state.cfg, el = document.createElement('div');
    el.className = 'spot';
    el.style.left = cfg.BOARD_X + col * cfg.TILE + 'px';
    el.style.top = cfg.BOARD_Y + row * cfg.TILE + 'px';
    el.style.width = cfg.TILE + 'px';
    el.style.height = cfg.TILE + 'px';
    $('#field').appendChild(el);
    state.spotActive = true;
    state.spotPiece = pieceId;
    $('#btn-hint').classList.add('lit');
    state.spotTimer = setTimeout(function () { clearSpot(); updateUi(); }, 3600);
    playSound('blip');
    announce('Mostrando onde a peça encaixa: coluna ' + (col + 1) + ', linha ' + (row + 1) + '.');
  }
  function useSpot() {
    var p = state.selectedId !== null ? state.pieces[state.selectedId] : null;
    if (!p || p.locked || state.spotActive) return;
    if (state.spots <= 0) { toast('Acabaram as dicas de lugar'); return; }
    gameEmit('spot', { id: p.id }, function (res) {
      if (!res || !res.ok) {
        if (res && res.left === 0) state.spots = 0;
        updateUi();
        toast(res && res.error === 'invalid' ? 'Essa peça já está no lugar.' : 'Acabaram as dicas de lugar');
        return;
      }
      state.spots = res.left;
      showSpot(res.col, res.row, p.id);
      resetIdle();
      if (state.spots === 0) toast('Essa foi a sua última dica de lugar');
      updateUi();
    });
  }
  // o mesmo botão: sem peça escolhida mostra a imagem (💡); com peça escolhida mostra o lugar dela (📍)
  function useLamp() { if (state.selectedId !== null && state.pieces[state.selectedId] && !state.pieces[state.selectedId].locked) useSpot(); else useHint(); }
  function refreshLamp() {
    var btn = $('#btn-hint'), sel = state.selectedId !== null ? state.pieces[state.selectedId] : null;
    var spotMode = !!(sel && !sel.locked);
    btn.querySelector('.bulb').textContent = spotMode ? '📍' : '💡';
    $('#hint-badge').textContent = spotMode ? state.spots : state.hints;
    btn.disabled = spotMode ? (state.spots <= 0 || state.spotActive) : (state.hints <= 0 || state.hintActive);
    btn.setAttribute('aria-label', spotMode
      ? 'Mostrar onde a peça escolhida encaixa. Restam ' + state.spots
      : 'Lâmpada: mostrar a imagem no tabuleiro por 4 segundos. Restam ' + state.hints);
  }

  /* ---------------------------------------------------------
   * Recomeçar com a confirmação do amigo
   * --------------------------------------------------------- */
  function hideRematchWait() { $('#rematch-wait').hidden = true; }
  function hideRematchRequest() { closeModal('#modal-rematch'); }
  function requestRestart(imageId, pieces) {
    if (!state.friendOnline && state.status !== 'won' && state.locked > 0) {
      if (!window.confirm('Recomeçar? O progresso será perdido.')) return;
    }
    socket.emit('restart', { imageId: imageId, pieces: pieces }, function (res) {
      if (res && res.ok && res.pending) {
        $('#rw-text').textContent = 'Esperando ' + friendName() + '…';
        $('#rematch-wait').hidden = false;
      } else if (res && res.error === 'pending') {
        toast(friendName() + ' já pediu para recomeçar. Responda ao pedido.');
      } else if (!res || !res.ok) {
        toast('Não foi possível pedir agora. Tente de novo.');
      }
    });
  }
  function showRematchRequest(d) {
    var img = state.images.filter(function (i) { return i.file === d.imageId; })[0];
    $('#rm-title').textContent = (d.byName || 'Seu amigo') + ' quer recomeçar';
    $('#rm-text').textContent = 'Nova partida: ' + (img ? img.label : d.imageId) + ' · ' + d.pieces + ' peças';
    var bar = $('#rm-bar');
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = 'rm-run ' + (d.ms || 30000) + 'ms linear forwards';
    openModal('#modal-rematch', '#rm-accept');
    playSound('ping');
    vibrate([30, 40, 30]);
    announce((d.byName || 'Seu amigo') + ' quer recomeçar a partida. Aceitar?');
  }

  /* ---------------------------------------------------------
   * Avisos com o aplicativo fechado (Web Push)
   * --------------------------------------------------------- */
  function pushSupported() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
  function urlB64ToU8(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function sameBytes(a, b) {
    if (!a || !b || a.byteLength !== b.byteLength) return false;
    var x = new Uint8Array(a), y = new Uint8Array(b);
    for (var i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  }
  function updatePushNote() {
    var sw = document.querySelector('.switch[data-setting="push"]'), note = $('#push-note');
    if (!sw || !note) return;
    var denied = typeof Notification !== 'undefined' && Notification.permission === 'denied';
    var supported = pushSupported() && !!state.pushKey;
    sw.disabled = !supported;
    if (!pushSupported()) note.textContent = 'Este aparelho ou navegador não aceita avisos. No iPhone, adicione o jogo à tela de início primeiro.';
    else if (!state.pushKey) note.textContent = 'Os avisos não estão disponíveis neste servidor.';
    else if (denied) note.textContent = 'Os avisos estão bloqueados nas configurações do celular. Libere as notificações do aplicativo para usar.';
    else if (state.settings.push) note.textContent = 'Ligado: você recebe um aviso quando o amigo entrar ou escrever, mesmo com o aplicativo fechado.';
    else note.textContent = 'Receba um aviso quando o amigo entrar ou escrever, mesmo com o aplicativo fechado.';
  }
  function ensurePush() {
    if (!pushSupported() || !state.settings.push || !state.pushKey || Notification.permission !== 'granted') return Promise.resolve();
    var key = urlB64ToU8(state.pushKey);
    return navigator.serviceWorker.ready.then(function (reg) {
      return reg.pushManager.getSubscription().then(function (sub) {
        if (sub && sub.options && !sameBytes(sub.options.applicationServerKey, key.buffer)) {
          return sub.unsubscribe().then(function () { return null; }, function () { return null; });   // chave do servidor mudou
        }
        return sub;
      }).then(function (sub) {
        return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      });
    }).then(function (sub) {
      if (state.inGame) gameEmit('push:subscribe', { sub: sub.toJSON() });
    }).catch(function () { /* sem permissão ou sem suporte: segue sem avisos */ });
  }
  function enablePush() {
    if (!pushSupported()) { toast('Este aparelho não aceita avisos.'); return Promise.resolve(false); }
    if (!state.pushKey) { toast('Os avisos não estão disponíveis neste servidor.'); return Promise.resolve(false); }
    var ask = Notification.permission === 'default' ? Notification.requestPermission() : Promise.resolve(Notification.permission);
    return Promise.resolve(ask).then(function (perm) {
      if (perm !== 'granted') {
        state.settings.push = false;
        saveSettings();
        toast('Permissão negada. Libere as notificações do aplicativo nas configurações do celular.', 3600);
        return false;
      }
      state.settings.push = true;
      saveSettings();
      toast('Avisos ligados! 🔔');
      return ensurePush().then(function () { return true; });
    });
  }
  function disablePush() {
    state.settings.push = false;
    saveSettings();
    if (state.inGame) gameEmit('push:unsubscribe');
    if (pushSupported()) {
      navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); })
        .then(function (sub) { if (sub) return sub.unsubscribe(); }).catch(function () { /* ignora */ });
    }
    toast('Avisos desligados.');
  }

  /* ---------------------------------------------------------
   * Vitória: imagem pronta, melhor tempo, salvar e compartilhar
   * --------------------------------------------------------- */
  function bestKey() { return state.imageId + '|' + state.cfg.PIECES; }
  function recordTime(ms) {
    var key = bestKey(), prev = state.bests[key], out = { record: false, text: '' };
    if (typeof prev !== 'number') out.text = 'Primeiro tempo registrado para esta imagem com ' + state.cfg.PIECES + ' peças.';
    else if (ms < prev) { out.record = true; out.text = '🏆 Novo recorde! Antes: ' + fmtTime(prev); }
    else out.text = 'Seu melhor: ' + fmtTime(prev);
    if (typeof prev !== 'number' || ms < prev) { state.bests[key] = ms; store.set('best', state.bests); }
    return out;
  }

  function fitText(cx, text, maxW) {
    if (cx.measureText(text).width <= maxW) return text;
    var a = Array.from(text);
    while (a.length > 1 && cx.measureText(a.join('') + '…').width > maxW) a.pop();
    return a.join('') + '…';
  }
  function buildWinCard() {
    if (state.winBlob) return Promise.resolve(state.winBlob);
    return loadImage(state.imageUrl).then(function (img) {
      var W = img.naturalWidth || 720, H = img.naturalHeight || 960, F = Math.round(W * 0.2), u = W / 720;
      var cv = document.createElement('canvas');
      cv.width = W; cv.height = H + F;
      var cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, W, H);
      cx.fillStyle = '#1b2559';
      cx.fillRect(0, H, W, F);
      cx.textBaseline = 'middle';
      cx.textAlign = 'left';
      var fam = 'system-ui, "Segoe UI", Roboto, sans-serif';
      cx.fillStyle = '#ffcf33';
      cx.font = '800 ' + Math.round(30 * u) + 'px ' + fam;
      cx.fillText('🧩 Quebra-Cabeça a Dois', 28 * u, H + F * 0.27);
      cx.fillStyle = '#ffffff';
      cx.font = '700 ' + Math.round(25 * u) + 'px ' + fam;
      cx.fillText(fitText(cx, 'Montado por ' + displayName(0) + ' e ' + displayName(1), W - 56 * u), 28 * u, H + F * 0.55);
      cx.fillStyle = '#c9d1f5';
      cx.fillText(state.cfg.PIECES + ' peças · ' + fmtTime(state.finalMs), 28 * u, H + F * 0.8);
      return new Promise(function (res) { cv.toBlob(function (b) { state.winBlob = b; res(b); }, 'image/jpeg', 0.92); });
    });
  }
  function winFileName() { return 'quebra-cabeca-' + new Date().toISOString().slice(0, 10) + '.jpg'; }
  function saveWinImage() {
    buildWinCard().then(function (blob) {
      if (!blob) { toast('Não foi possível criar a imagem.'); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = winFileName();
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) { /* ignora */ } }, 15000);
      toast('Imagem salva. Veja em Downloads ou na Galeria.', 3200);
    }).catch(function () { toast('Não foi possível salvar a imagem.'); });
  }
  function shareWinImage() {
    buildWinCard().then(function (blob) {
      if (!blob) throw new Error('sem imagem');
      var file = null;
      try { file = new File([blob], winFileName(), { type: 'image/jpeg' }); } catch (e) { file = null; }
      var text = 'Montamos juntos o quebra-cabeça em ' + fmtTime(state.finalMs) + '! 🧩';
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'Quebra-Cabeça a Dois', text: text });
      }
      saveWinImage();
      toast('Este aparelho não compartilha direto. A imagem foi salva para você enviar.', 3600);
    }).catch(function (e) { if (e && e.name === 'AbortError') return; toast('Não foi possível compartilhar agora.'); });
  }

  /* ---------------------------------------------------------
   * Eventos vindos do servidor
   * --------------------------------------------------------- */
  socket.on('grabbed', function (d) {
    var p = state.pieces[d.id];
    if (!p || p.locked) return;
    p.z = d.z;
    if (d.z > state.zMax) state.zMax = d.z;
    if (d.by !== state.idx) { p.heldBy = d.by; if (state.selectedId === p.id) { state.selectedId = null; state.drag = null; } }
    classify(p);
    updateUi();
  });

  socket.on('moved', function (d) {
    var p = state.pieces[d.id];
    if (!p || p.locked || p.heldBy === state.idx) return;
    p.tx = d.x; p.ty = d.y;
    p.lastMove = performance.now();
  });

  socket.on('rotated', function (d) {
    var p = state.pieces[d.id];
    if (!p) return;
    p.rotUsed = d.rotUsed;
    setAngle(p, d.rot);
    updateUi();
  });

  socket.on('released', function (d) {
    var p = state.pieces[d.id];
    if (!p || p.locked) return;
    p.heldBy = null;
    p.rotUsed = d.rotUsed;
    if (d.by !== state.idx) { p.tx = d.x; p.ty = d.y; }
    if (state.selectedId === p.id && d.by === state.idx && !state.drag) state.selectedId = null;
    classify(p);
    updateUi();
  });

  socket.on('deny', function (d) {
    var p = state.pieces[d.id];
    if (!p) return;
    if (state.selectedId === p.id) state.selectedId = null;
    if (state.drag && state.drag.id === p.id) state.drag = null;
    p.heldBy = d.reason === 'locked' ? null : (d.by === undefined ? null : d.by);
    classify(p);
    if (d.reason !== 'locked') { toast(friendName() + ' pegou essa peça primeiro'); shake(p); }
    updateUi();
  });

  socket.on('locked', function (d) {
    var p = state.pieces[d.id];
    if (!p) return;
    p.locked = true;
    p.lockedBy = d.by;
    p.heldBy = null;
    p.x = d.x; p.y = d.y; p.tx = d.x; p.ty = d.y;
    setAngle(p, 0);
    if (state.selectedId === p.id) { state.selectedId = null; clearTimeout(state.idleTimer); }
    if (state.drag && state.drag.id === p.id) state.drag = null;
    classify(p);
    state.counts = d.counts;
    state.locked = d.locked;
    if (d.by === state.idx) vibrate(25);
    if (state.spotPiece === p.id) { clearSpot(); }
    updateUi();
    if (state.locked < state.total) { playSound('snap'); announce('Peça encaixada. ' + state.locked + ' de ' + state.total + '.'); }
    checkMilestones();
  });

  socket.on('meta', function (m) { applyMeta(m); updateUi(); });

  socket.on('state', function (snap) { startGame(snap); });

  socket.on('rematch', function (d) {
    if (!d) return;
    if (d.state === 'request') { showRematchRequest(d); return; }
    var hadWait = !$('#rematch-wait').hidden, hadAsk = !$('#modal-rematch').hidden;
    hideRematchWait();
    hideRematchRequest();
    if (d.state === 'declined') toast((d.byName || friendName()) + ' não quis recomeçar agora.');
    else if (d.state === 'cancelled' && hadAsk) toast('O pedido para recomeçar foi cancelado.');
    else if (d.state === 'expired' && (hadWait || hadAsk)) toast('O pedido para recomeçar venceu.');
  });

  socket.on('won', function (d) {
    setTimeout(function () { showWin(d); }, 650);
  });

  socket.on('connect', function () {
    $('#banner-conn').hidden = true;
    if (state.duel) { rejoinDuel(); return; }
    if (state.code && state.inGame) {
      socket.emit('join', { pid: state.pid, code: state.code, name: state.name, avatar: state.avatar }, function (res) {
        if (res && res.ok) {
          state.idx = res.idx;
          resync(res.snapshot);
          if (/^custom:/.test(state.imageId || '')) socket.emit('imgready');
        } else {
          toast('A sala não existe mais.');
          goHome();
        }
      });
    }
  });

  socket.on('disconnect', function () {
    if (state.inGame) $('#banner-conn').hidden = false;
    state.drag = null;
  });

  socket.on('connect_error', function () {
    if (state.inGame) $('#banner-conn').hidden = false;
  });

  // depois de reconectar, atualiza sem recriar as peças (se for a mesma imagem)
  function resync(snap) {
    if (snap.imageId !== state.imageId || snap.pieces.length !== state.pieces.length || snap.cfg.TILE !== state.cfg.TILE) { startGame(snap); return; }
    state.selectedId = null;
    snap.pieces.forEach(function (d) {
      var p = state.pieces[d.id];
      p.x = p.tx = d.x; p.y = p.ty = d.y;
      p.rotUsed = d.rotUsed;
      p.heldBy = d.heldBy;
      p.locked = d.locked;
      p.lockedBy = d.lockedBy;
      p.z = d.z;
      if (p.z > state.zMax) state.zMax = p.z;
      setAngle(p, d.rot);
      classify(p);
      if (p.heldBy === state.idx && !p.locked) state.selectedId = p.id;
    });
    applyMeta(snap);
    markMilestones();
    setChatHistory(snap.chat || []);
    updateUi();
    ensurePush();
  }

  function goHome() {
    closeChat();
    state.chat = [];
    state.unread = 0;
    state.inGame = false;
    state.code = null;
    state.pieces = [];
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* ignora */ }
    $('#banner-conn').hidden = true;
    ['#modal-win', '#modal-menu', '#modal-settings', '#modal-help', '#modal-rematch'].forEach(closeModal);
    hideRematchWait();
    clearSpot();
    showScreen('home');
  }

  /* ---------------------------------------------------------
   * MINHA IMAGEM: o jogador escolhe uma foto ou desenho do próprio celular.
   * O aparelho abre o arquivo, a pessoa escolhe o enquadramento (3:4, o formato das peças), o celular reduz e reenvia como JPEG
   * (isso também apaga dados como a localização da foto) e o servidor entrega a imagem aos DOIS jogadores.
   * --------------------------------------------------------- */
  var MAX_FILE = 40 * 1024 * 1024, MIN_SIDE = 200, WORK_MAX = 2400;
  var crop = null;

  function pickError(msg) { showError($('#pick-error'), msg); toast(msg, 3600); }

  function chooseFile() {
    var inp = $('#file-input');
    inp.value = '';
    inp.click();
  }

  function handlePickedFile(file) {
    showError($('#pick-error'), '');
    var name = file.name || '', type = file.type || '';
    if (/svg/i.test(type) || /\.svg$/i.test(name)) { pickError('Imagens SVG não funcionam aqui. Escolha uma foto (JPG, PNG ou WebP).'); return; }
    if (!/^image\//i.test(type) && !/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(name)) { pickError('Esse arquivo não é uma imagem. Escolha uma foto ou um desenho.'); return; }
    if (!file.size) { pickError('Não consegui ler esse arquivo. Tente outro.'); return; }
    if (file.size > MAX_FILE) { pickError('Essa imagem é pesada demais (mais de 40 MB). Escolha uma menor.'); return; }
    setLoading(true, 'Abrindo sua imagem…');
    decodeToCanvas(file).then(function (d) {
      setLoading(false);
      if (Math.min(d.ow, d.oh) < MIN_SIDE) { pickError('Essa imagem é muito pequena (' + d.ow + '×' + d.oh + '). Use uma com pelo menos ' + MIN_SIDE + ' pixels de lado.'); return; }
      openCrop(d);
    }).catch(function () {
      setLoading(false);
      pickError(/\.(heic|heif)$/i.test(name) || /hei[cf]/i.test(type)
        ? 'Não consegui abrir essa foto (formato HEIC). Escolha uma em JPG, PNG ou WebP.'
        : 'Não consegui abrir essa imagem. Ela pode estar danificada. Tente outra.');
    });
  }

  // abre o arquivo e já o reduz (fotos de celular têm milhões de pixels); mantém a proporção original
  function decodeToCanvas(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        var ow = im.naturalWidth, oh = im.naturalHeight;
        if (!ow || !oh) { URL.revokeObjectURL(url); rej(new Error('vazia')); return; }
        var k = Math.min(1, WORK_MAX / Math.max(ow, oh)), w = Math.max(1, Math.round(ow * k)), h = Math.max(1, Math.round(oh * k));
        var cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        var ctx = cv.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(im, 0, 0, w, h);
        URL.revokeObjectURL(url);
        res({ src: cv, w: w, h: h, ow: ow, oh: oh });
      };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('decode')); };
      im.src = url;
    });
  }

  /* ----- enquadramento: arrastar, pinça, zoom ----- */
  var CW = 300, CH = 400;
  function scaleFromV(v) { return crop.contain * Math.pow(crop.max / crop.contain, v / 100); }
  function vFromScale(s) { return crop.max > crop.contain ? 100 * Math.log(s / crop.contain) / Math.log(crop.max / crop.contain) : 0; }
  function clampCrop() {
    crop.scale = clamp(crop.scale, crop.contain, crop.max);
    var mx = Math.max(0, (crop.w * crop.scale - CW) / 2), my = Math.max(0, (crop.h * crop.scale - CH) / 2);
    crop.ox = clamp(crop.ox, -mx, mx);
    crop.oy = clamp(crop.oy, -my, my);
  }
  // desenha o enquadramento (usado na prévia 300×400 e, em tamanho maior, no arquivo final)
  function paintCrop(ctx, W, H) {
    var k = W / CW, dw = crop.w * crop.scale * k, dh = crop.h * crop.scale * k;
    if (dw < W - 0.5 || dh < H - 0.5) {                      // imagem inteira: as sobras ficam com a própria imagem desfocada
      var sc = Math.max(W / crop.w, H / crop.h) * 1.15;
      ctx.save();
      try { ctx.filter = 'blur(' + Math.round(16 * k) + 'px)'; } catch (e) { /* sem desfoque */ }
      ctx.drawImage(crop.src, (W - crop.w * sc) / 2, (H - crop.h * sc) / 2, crop.w * sc, crop.h * sc);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.clearRect(0, 0, W, H);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(crop.src, W / 2 - dw / 2 + crop.ox * k, H / 2 - dh / 2 + crop.oy * k, dw, dh);
  }
  function redrawCrop() {
    clampCrop();
    paintCrop($('#crop-canvas').getContext('2d'), CW, CH);
    $('#crop-zoom').value = String(Math.round(vFromScale(crop.scale)));
  }

  function openCrop(d) {
    var cover = Math.max(CW / d.w, CH / d.h);
    crop = { src: d.src, w: d.w, h: d.h, cover: cover, contain: Math.min(CW / d.w, CH / d.h), max: cover * 3, scale: cover, ox: 0, oy: 0, ptrs: {}, pinch: null, busy: false };
    crop.max = Math.max(crop.max, crop.contain * 1.01);
    var warn = $('#crop-warn');
    warn.className = 'crop-warn';
    if (Math.max(d.ow, d.oh) < 700) { warn.textContent = 'Imagem pequena (' + d.ow + '×' + d.oh + '): as peças podem ficar sem nitidez.'; warn.hidden = false; }
    else { warn.textContent = ''; warn.hidden = true; }
    $('#crop-busy').hidden = true;
    var cv = $('#crop-canvas');
    cv.width = CW; cv.height = CH;
    redrawCrop();
    openModal('#modal-crop', '#crop-use');
  }

  function closeCrop() {
    closeModal('#modal-crop');
    if (crop) { crop.src = null; }
    crop = null;
  }

  (function wireCrop() {
    var cv = $('#crop-canvas');
    function toCanvas(dx, dy) { var r = cv.getBoundingClientRect(); return { x: dx * CW / r.width, y: dy * CH / r.height }; }
    cv.addEventListener('pointerdown', function (e) {
      if (!crop || crop.busy) return;
      crop.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      var ids = Object.keys(crop.ptrs);
      if (ids.length === 2) {
        var a = crop.ptrs[ids[0]], b = crop.ptrs[ids[1]];
        crop.pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), s0: crop.scale };
      }
    });
    cv.addEventListener('pointermove', function (e) {
      if (!crop || crop.busy) return;
      var p = crop.ptrs[e.pointerId];
      if (!p) return;
      var ids = Object.keys(crop.ptrs);
      if (ids.length >= 2 && crop.pinch) {
        crop.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
        var a = crop.ptrs[ids[0]], b = crop.ptrs[ids[1]];
        crop.scale = crop.pinch.s0 * Math.hypot(a.x - b.x, a.y - b.y) / crop.pinch.d0;
      } else {
        var d = toCanvas(e.clientX - p.x, e.clientY - p.y);
        crop.ox += d.x; crop.oy += d.y;
        crop.ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
      }
      redrawCrop();
    });
    function up(e) { if (crop) { delete crop.ptrs[e.pointerId]; crop.pinch = null; } }
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('wheel', function (e) {
      if (!crop || crop.busy) return;
      e.preventDefault();
      crop.scale *= e.deltaY < 0 ? 1.08 : 0.92;
      redrawCrop();
    }, { passive: false });
    $('#crop-zoom').addEventListener('input', function () { if (!crop || crop.busy) return; crop.scale = scaleFromV(Number(this.value)); redrawCrop(); });
    $('#crop-fill').addEventListener('click', function () { if (!crop || crop.busy) return; crop.scale = crop.cover; crop.ox = 0; crop.oy = 0; redrawCrop(); });
    $('#crop-fit').addEventListener('click', function () { if (!crop || crop.busy) return; crop.scale = crop.contain; crop.ox = 0; crop.oy = 0; redrawCrop(); });
    $('#crop-other').addEventListener('click', function () { if (crop && crop.busy) return; closeCrop(); chooseFile(); });
    $('#crop-use').addEventListener('click', useCrop);
    $('#modal-crop').addEventListener('click', function (e) { if (e.target === this && crop && !crop.busy) closeCrop(); });
  })();

  function cropFail(msg) {
    if (crop) crop.busy = false;
    $('#crop-busy').hidden = true;
    var w = $('#crop-warn');
    w.textContent = msg;
    w.className = 'crop-warn err';
    w.hidden = false;
  }

  function useCrop() {
    if (!crop || crop.busy) return;
    crop.busy = true;
    $('#crop-busy-text').textContent = 'Preparando sua imagem…';
    $('#crop-busy').hidden = false;
    var out = document.createElement('canvas');
    out.width = 900; out.height = 1200;
    paintCrop(out.getContext('2d'), 900, 1200);
    var tries = [0.88, 0.74, 0.6];
    (function encode(i) {
      out.toBlob(function (blob) {
        if (!blob) { cropFail('Não consegui preparar a imagem. Tente de novo.'); return; }
        if (blob.size > state.upload.maxBytes && i + 1 < tries.length) { encode(i + 1); return; }
        if (blob.size > state.upload.maxBytes) { cropFail('A imagem ficou pesada demais. Tente aproximar ou escolher outra.'); return; }
        sendImage(blob, out);
      }, 'image/jpeg', tries[i]);
    })(0);
  }

  function sendImage(blob, out) {
    $('#crop-busy-text').textContent = 'Enviando sua imagem…';
    fetch('api/upload', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; });
    }).then(function (r) {
      if (r.status === 200 && r.j && r.j.ok) { imageSent(r.j, blob, out); return; }
      var why = r.j && r.j.error;
      cropFail(why === 'rate' ? 'Você enviou muitas imagens agora há pouco. Espere alguns minutinhos e tente de novo.'
        : why === 'busy' ? 'O servidor está cheio de imagens agora. Tente de novo em instantes.'
        : why === 'big' || why === 'dims' ? 'A imagem ficou grande demais. Escolha outra ou aproxime mais.'
        : 'O servidor não aceitou essa imagem. Tente outra.');
    }).catch(function () {
      cropFail('Sem conexão com o servidor. Verifique a internet e toque em "Usar esta imagem" de novo.');
    });
  }

  function imageSent(res, blob, out) {
    var th = document.createElement('canvas');
    th.width = 300; th.height = 400;
    th.getContext('2d').drawImage(out, 0, 0, 300, 400);
    th.toBlob(function (tb) {
      var item = { file: res.id, url: res.url, localUrl: URL.createObjectURL(blob), thumb: tb ? URL.createObjectURL(tb) : URL.createObjectURL(blob), label: 'Minha imagem', custom: true, fresh: true };
      imgCache[item.file + '|thumb'] = Promise.resolve(item.thumb);
      state.custom.unshift(item);
      while (state.custom.length > 6) {
        var old = state.custom.pop();
        try { URL.revokeObjectURL(old.localUrl); URL.revokeObjectURL(old.thumb); } catch (e) { /* ignora */ }
      }
      closeCrop();
      renderPickGrid();
      var card = document.querySelector('.pick-card[data-file="' + item.file + '"]');
      selectImage(item.file, card);
      toast('Imagem adicionada! 🎉', 2200);
      playSound('chime');
    }, 'image/jpeg', 0.85);
  }

  $('#file-input').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (f) handlePickedFile(f);
  });

  /* ---------------------------------------------------------
   * SALA DESAFIO: dois jogadores montam a mesma imagem, cada um no seu tabuleiro.
   * Reaproveita o campo de jogo, as peças, a conversa e os avatares; o servidor decide largada, tempo e vencedor.
   * --------------------------------------------------------- */
  var DUEL_KEY = 'duel';
  function duelStored() {
    var d = store.get(DUEL_KEY, null);
    return d && d.code && d.pid && Date.now() - (d.t || 0) < 3 * 3600 * 1000 ? d : null;
  }
  function duelPidFor(code) { var d = duelStored(); return d && d.code === code ? d.pid : state.pid; }
  function saveDuelLocal() { if (state.duel) store.set(DUEL_KEY, { code: state.duel.code, pid: state.pid, t: Date.now() }); }
  function clearDuelLocal() { store.set(DUEL_KEY, null); }
  function modeLabel(m) { return m === 'quebra' ? '🎁 Quebrando Cabeças' : '🧩 Modo Comum'; }
  function imageItem(file) {
    var mine = state.custom.filter(function (i) { return i.file === file; })[0];
    if (mine) return mine;
    var base = state.images.filter(function (i) { return i.file === file; })[0];
    if (base) return base;
    if (/^custom:[a-f0-9]{32}$/.test(file || '')) return { file: file, url: 'api/up/' + file.slice(7), label: 'Imagem personalizada', custom: true };   // imagem enviada por quem criou a sala
    return { file: file, url: 'imagens/' + encodeURIComponent(file), label: file };
  }
  function pctOf(n, total) { return total ? Math.round((100 * n) / total) : 0; }

  // sai de uma Sala Desafio sem voltar para a tela inicial (ex.: antes de criar/entrar em outra sala)
  function leaveDuelQuiet() {
    if (!state.duel) return;
    try { socket.emit('ch:leave'); } catch (e) { /* ignora */ }
    teardownDuel();
  }
  function teardownDuel() {
    if (state.duel) { clearInterval(state.duel.graceTimer); clearInterval(state.duel.giftTimer); }
    hideCountdown(false);
    state.duel = null;
    clearDuelLocal();
    $('#duel-strip').hidden = true;
    $('#duel-banner').hidden = true;
    $('#menu-change').hidden = false;
    $('#menu-restart').hidden = false;
    closeModal('#modal-duel');
  }
  function leaveDuel() {
    leaveDuelQuiet();
    goHome();
  }

  function createDuel() {
    setLoading(true, 'Criando a Sala Desafio…');
    leaveDuelQuiet();
    socket.emit('ch:create', { pid: state.pid, imageId: state.pickChoice, pieces: state.pickPieces, mode: state.duelMode, name: readName(), avatar: state.avatar }, function (res) {
      if (!res || !res.ok) { setLoading(false); showError($('#pick-error'), errorText(res && res.error)); return; }
      enterDuel(res);
    });
  }

  function enterDuel(res) {
    var l = res.lobby;
    state.idx = res.idx;
    if (window.QC && window.QC.afterEnter) window.QC.afterEnter('duel');
    state.duel = {
      code: l.code, mode: l.mode, imageId: l.imageId, total: l.pieces, lobby: l, phase: 'lobby',
      prog: [{ idx: 0, locked: 0, total: l.pieces, pct: 0 }, { idx: 1, locked: 0, total: l.pieces, pct: 0 }],
      lead: 'tie', alerted: false, oppOnline: true, graceTimer: null, giftTimer: null, box: null, giftSeen: false, result: null, imgReady: false
    };
    state.code = l.code;
    state.imageId = l.imageId;
    setChatAvailability(res.chatOn !== false);
    setChatHistory(res.chat || []);
    saveDuelLocal();
    try { history.replaceState(null, '', '?sala=' + l.code); } catch (e) { /* ignora */ }
    setLoading(false);
    applyLobby(l);
    prepareDuelImage();
    if (res.snapshot) { startDuelBoard(res.snapshot, true); }
    else if (res.status === 'finished' && res.result) { showScreen('lobby'); showDuelResult(res.result); }
    else showScreen('lobby');
  }

  function maybeResumeDuel() {
    var s = duelStored();
    if (!s) return false;
    state.pid = s.pid;
    socket.emit('ch:join', { pid: s.pid, code: s.code, name: state.name, avatar: state.avatar }, function (res) {
      if (!res || !res.ok) { clearDuelLocal(); return; }
      if (res.status === 'finished') {                        // a disputa já acabou: recomeça do zero, sem mostrar o resultado antigo
        socket.emit('ch:leave');
        clearDuelLocal();
        return;
      }
      enterDuel(res);
    });
    return true;
  }

  function rejoinDuel() {
    var d = state.duel;
    socket.emit('ch:join', { pid: state.pid, code: d.code, name: state.name, avatar: state.avatar }, function (res) {
      if (!state.duel) return;
      if (!res || !res.ok) { toast('A sala não existe mais.'); teardownDuel(); goHome(); return; }
      state.idx = res.idx;
      if (state.duel.imgReady) socket.emit('ch:imgready'); else prepareDuelImage();
      applyLobby(res.lobby);
      if (res.status === 'playing' && res.snapshot) startDuelBoard(res.snapshot, true);
      else if (res.status === 'finished' && res.result) { if (state.duel.phase !== 'end') showDuelResult(res.result); }
      else if (state.duel.phase !== 'lobby' && state.duel.phase !== 'countdown') { state.duel.phase = 'lobby'; closeModal('#modal-duel'); showScreen('lobby'); }
    });
  }

  // baixa e prepara a imagem da sala; só então o celular avisa o servidor e libera o botão "pronto"
  function prepareDuelImage() {
    var d = state.duel;
    if (!d) return;
    var code = d.code;
    imagesReady.then(function () {
      var pr = state.presets.filter(function (p) { return p.pieces === d.lobby.pieces; })[0] || { cols: 3, rows: 4 };
      return prepareImage(imageItem(d.imageId), pr.cols, pr.rows);
    }).then(function () {
      if (!state.duel || state.duel.code !== code) return;
      state.duel.imgReady = true;
      socket.emit('ch:imgready');
      applyLobby(state.duel.lobby);
    });
  }

  /* ----- recepção ----- */
  function applyLobby(l) {
    var d = state.duel;
    if (!d) return;
    var prev = d.lobby;
    d.lobby = l;
    d.mode = l.mode;
    state.players = l.players;
    // guarda o último nome conhecido de cada um (se o adversário sair, as mensagens ainda usam o nome dele)
    state.names = l.players.map(function (p, i) { return p.joined && p.name ? p.name : (state.names[i] || ''); });
    var me = l.players[state.idx], opp = l.players[1 - state.idx];
    state.friendOnline = !!(opp && opp.connected);

    $('#lobby-mode').textContent = modeLabel(l.mode);
    $('#lobby-code').textContent = l.code;
    var item = imageItem(l.imageId);
    $('#lobby-img-name').textContent = item.label || '';
    $('#lobby-info').textContent = l.pieces + ' peças · ' + (l.mode === 'quebra' ? 'caixa de presentes' : 'bandeja');
    $('#lobby-thumb').style.backgroundImage = 'url("' + item.url + '")';
    [0, 1].forEach(function (i) {
      var p = l.players[i], el = $('#lp' + i);
      el.classList.toggle('online', !!(p.joined && p.connected));
      el.classList.toggle('away', !!(p.joined && !p.connected));
      el.classList.toggle('is-ready', !!p.ready);
      el.querySelector('.lp-name').textContent = p.joined ? p.name : '—';
      el.querySelector('.lp-status').textContent = !p.joined ? 'aguardando…' : (i === state.idx ? 'você · ' : '') + (!p.connected ? 'desconectado' : (p.imgReady ? 'conectado' : 'preparando a imagem…'));
      el.querySelector('.lp-ready').hidden = !p.ready;
      paintAvatar($('#lp' + i + '-av'), i, i === state.idx, true);
      if (prev && prev.players[i] && !prev.players[i].joined && p.joined && i !== state.idx) { popEl(el, 'pop'); playSound('chime'); }
    });
    var both = !!(me && me.connected && opp && opp.joined && opp.connected);
    var btn = $('#lobby-ready');
    btn.disabled = !both || !d.imgReady || l.status !== 'lobby';
    btn.classList.toggle('on', !!(me && me.ready));
    btn.textContent = !both ? 'Aguardando adversário…' : (!d.imgReady ? 'Preparando a imagem…' : (me.ready ? '✅ Pronto! (toque para cancelar)' : 'Estou pronto!'));
    var msg;
    if (!opp || !opp.joined) msg = 'Chame seu adversário: ele entra com o código ' + l.code + '.';
    else if (!opp.connected) msg = opp.name + ' saiu da sala. Esperando voltar…';
    else if (!d.imgReady) msg = 'Preparando a imagem neste celular…';
    else if (!opp.imgReady) msg = 'Esperando a imagem ficar pronta no celular de ' + opp.name + '…';
    else if (l.status === 'countdown') msg = 'Começando!';
    else if (me.ready && opp.ready) msg = 'Começando!';
    else if (me.ready) msg = 'Tudo certo! Esperando ' + opp.name + ' ficar pronto…';
    else if (opp.ready) msg = opp.name + ' já está pronto! Falta você. 😉';
    else msg = 'Quando os dois estiverem prontos, a contagem começa.';
    $('#lobby-msg').textContent = msg;
    updateDuelPresence();
    updateDuelRematch();
    if (d.phase === 'game' || d.phase === 'end') updateHud();           // repinta o avatar do adversário (cinza se desconectou)
  }

  /* ----- contagem regressiva ----- */
  var cd = { timers: [], on: false };
  function setCd(txt, go) {
    var n = $('#cd-num');
    n.textContent = txt;
    n.classList.toggle('go', !!go);
    n.classList.remove('pop');
    void n.offsetWidth;
    n.classList.add('pop');
  }
  function showCountdown(ms) {
    var d = state.duel;
    if (!d) return;
    cd.timers.forEach(clearTimeout);
    cd.timers = [];
    d.phase = 'countdown';
    closeModal('#modal-duel');
    closeModal('#modal-menu');
    closeChat();
    $('#cd-img').style.backgroundImage = 'url("' + imageItem(d.imageId).url + '")';
    $('#cd-vs').textContent = (state.names[state.idx] || 'Você') + '  ×  ' + friendName();
    $('#countdown').style.pointerEvents = '';
    $('#countdown').hidden = false;
    cd.on = true;
    var steps = Math.max(1, Math.round(ms / 1000)), per = ms / steps;
    for (var i = 0; i < steps; i++) {
      (function (n, delay) {
        cd.timers.push(setTimeout(function () { setCd(String(n)); playSound(n === 1 ? 'tick2' : 'tick'); }, delay));
      })(steps - i, i * per);
    }
    announce('A disputa começa em ' + steps + ' segundos.');
  }
  function hideCountdown(flash) {
    cd.timers.forEach(clearTimeout);
    cd.timers = [];
    if (!cd.on) return;
    cd.on = false;
    if (flash) {
      $('#countdown').style.pointerEvents = 'none';          // o "JÁ!" aparece por cima do tabuleiro, mas os toques passam por ele (a caixinha já responde)
      setCd('JÁ!', true);
      cd.timers.push(setTimeout(function () { if (!cd.on) $('#countdown').hidden = true; }, reducedMotion() ? 300 : 650));
    } else {
      $('#countdown').hidden = true;
    }
  }

  /* ----- a disputa ----- */
  function startDuelBoard(snap, resume) {
    if (resume) setLoading(true, 'Voltando para a disputa…');
    return imagesReady.then(function () {
      return prepareImage(imageItem(snap.imageId), snap.cfg.COLS, snap.cfg.ROWS);
    }).then(function (url) {
      var d = state.duel;
      if (!d) { setLoading(false); return; }
      d.phase = 'game';
      d.mode = snap.mode;
      d.box = snap.box;
      d.prog = snap.progress;
      d.lead = 'tie';
      d.alerted = false;
      state.cfg = snap.cfg;
      state.code = snap.code;
      state.imageId = snap.imageId;
      state.imageUrl = url;
      state.total = snap.total;
      state.locked = snap.locked;
      state.hints = snap.hints;
      state.spots = snap.spots;
      state.counts = [0, 0];
      state.selectedId = null;
      state.drag = null;
      state.status = 'playing';
      state.timerBase = Date.now() - snap.elapsedMs;
      clearTimeout(state.idleTimer);
      buildField(snap);
      setChatAvailability(snap.chatOn !== false);
      setChatHistory(snap.chat || []);
      ['#modal-win', '#modal-menu', '#modal-settings', '#modal-rematch', '#modal-duel'].forEach(closeModal);
      hideRematchWait();
      $('#field').classList.remove('won');
      $('#confetti').innerHTML = '';
      closeHint();
      clearSpot();
      markMilestones();
      state.inGame = true;
      $('#duel-strip').hidden = false;
      $('#banner-wait').hidden = true;
      $('#menu-change').hidden = true;
      $('#menu-restart').hidden = true;
      showScreen('game');
      layout();
      updateUi();
      updateGift();
      updateDuelPresence();
      ensurePush();
      keepAwake();
      setLoading(false);
      if (!resume) { hideCountdown(true); setTimeout(function () { playSound('tann'); }, 40); announce('Valendo! Monte a imagem o mais rápido que puder.'); }
      else hideCountdown(false);
    });
  }

  // faixa da corrida: mostra o seu progresso e o do adversário (só a porcentagem; nunca o tabuleiro dele)
  function paintStrip() {
    var d = state.duel;
    if (!d) return;
    var meP = pctOf(state.locked, state.total), opP = d.prog[1 - state.idx] ? d.prog[1 - state.idx].pct : 0;
    $('#ds-fill-me').style.width = meP + '%';
    $('#ds-fill-opp').style.width = opP + '%';
    $('#ds-pct-me').textContent = meP + '%';
    $('#ds-pct-opp').textContent = opP + '%';
    $('#ds-fill-me').parentNode.parentNode.setAttribute('aria-valuenow', String(meP));
    $('#ds-fill-opp').parentNode.parentNode.setAttribute('aria-valuenow', String(opP));
    paintAvatar($('#ds-av-me'), state.idx, true, false);
    paintAvatar($('#ds-av-opp'), 1 - state.idx, false, false);
    if (d.phase !== 'game') return;
    var lead = opP > meP ? 'opp' : (meP > opP ? 'me' : 'tie');
    if (lead !== d.lead) {
      if ((lead === 'opp' && d.lead === 'me') || (lead === 'me' && d.lead === 'opp')) {
        if (lead === 'opp') { toast('📣 ' + friendName() + ' passou você!', 1800); }
        else { toast('🚀 Você passou ' + friendName() + '!', 1800); playSound('chime'); }
      }
      d.lead = lead;
    }
    var opp = d.prog[1 - state.idx];
    if (opp && !d.alerted && opp.total && opp.total - opp.locked <= 2 && opp.locked > state.locked) {
      d.alerted = true;
      toast('⚠️ ' + friendName() + ' está quase terminando!', 2400);
      playSound('ping');
    }
  }

  // presença do adversário durante a disputa: aviso e prazo para voltar
  function updateDuelPresence() {
    var d = state.duel;
    if (!d) return;
    var banner = $('#duel-banner');
    var opp = d.lobby.players[1 - state.idx];
    var away = !!(opp && opp.joined && !opp.connected);
    clearInterval(d.graceTimer);
    if (d.phase === 'game' && away && state.status === 'playing') {
      var end = Date.now() + (opp.graceLeft || 0);
      var paint = function () {
        var s = Math.max(0, Math.ceil((end - Date.now()) / 1000));
        banner.className = 'banner warn duel-banner';
        banner.textContent = opp.graceLeft ? opp.name + ' desconectou. Se não voltar em ' + s + ' s, você vence.' : opp.name + ' está desconectado.';
      };
      paint();
      banner.hidden = false;
      d.graceTimer = setInterval(paint, 500);
    } else {
      banner.hidden = true;
    }
    if (d.phase === 'game' && d.oppOnline !== !away) {
      if (away) { toast(opp.name + ' desconectou!'); playSound('ping'); }
      else toast(friendName() + ' voltou! 🙌');
    }
    d.oppOnline = !away;
  }

  /* ----- caixa de presentes (modo Quebrando Cabeças) ----- */
  var GIFT_SVG = '<svg viewBox="0 0 120 138" aria-hidden="true" focusable="false">' +
    '<ellipse cx="60" cy="128" rx="42" ry="6" fill="rgba(0,0,0,.18)"/>' +
    '<g class="g-body">' +
      '<rect x="14" y="56" width="92" height="66" rx="14" fill="#ff4f8b" stroke="#3b2a6b" stroke-width="4"/>' +
      '<rect x="20" y="62" width="12" height="50" rx="6" fill="#ff8cb4" opacity=".6"/>' +
      '<rect x="52" y="56" width="16" height="66" fill="#ffcf33" stroke="#3b2a6b" stroke-width="3"/>' +
      '<g class="e-open"><circle cx="38" cy="86" r="9" fill="#fff" stroke="#3b2a6b" stroke-width="2.5"/><circle cx="82" cy="86" r="9" fill="#fff" stroke="#3b2a6b" stroke-width="2.5"/>' +
        '<circle cx="40" cy="87" r="4.6" fill="#3b2a6b"/><circle cx="84" cy="87" r="4.6" fill="#3b2a6b"/><circle cx="41.6" cy="85" r="1.6" fill="#fff"/><circle cx="85.6" cy="85" r="1.6" fill="#fff"/></g>' +
      '<g class="e-closed"><path d="M29 85 Q38 94 47 85" fill="none" stroke="#3b2a6b" stroke-width="3.5" stroke-linecap="round"/><path d="M73 85 Q82 94 91 85" fill="none" stroke="#3b2a6b" stroke-width="3.5" stroke-linecap="round"/></g>' +
      '<g class="m-smile"><path d="M47 102 Q60 115 73 102" fill="none" stroke="#3b2a6b" stroke-width="4" stroke-linecap="round"/></g>' +
      '<g class="m-o"><ellipse cx="60" cy="107" rx="9" ry="10" fill="#7a1f4a" stroke="#3b2a6b" stroke-width="3"/></g>' +
      '<g class="m-flat"><path d="M50 107 H70" stroke="#3b2a6b" stroke-width="4" stroke-linecap="round"/></g>' +
      '<ellipse cx="27" cy="101" rx="6" ry="4" fill="#fff" opacity=".45"/><ellipse cx="93" cy="101" rx="6" ry="4" fill="#fff" opacity=".45"/>' +
    '</g>' +
    '<g class="g-lid">' +
      '<rect x="8" y="34" width="104" height="26" rx="10" fill="#ff6fa0" stroke="#3b2a6b" stroke-width="4"/>' +
      '<rect x="52" y="34" width="16" height="26" fill="#ffcf33" stroke="#3b2a6b" stroke-width="3"/>' +
      '<ellipse cx="44" cy="26" rx="16" ry="11" transform="rotate(-18 44 26)" fill="#ffcf33" stroke="#3b2a6b" stroke-width="3.5"/>' +
      '<ellipse cx="76" cy="26" rx="16" ry="11" transform="rotate(18 76 26)" fill="#ffcf33" stroke="#3b2a6b" stroke-width="3.5"/>' +
      '<circle cx="60" cy="30" r="7.5" fill="#ffe27a" stroke="#3b2a6b" stroke-width="3"/>' +
    '</g>' +
    '<text class="g-lock" x="86" y="54" font-size="28">🔒</text>' +
    '<circle class="gd gd1" cx="42" cy="134" r="4.5"/><circle class="gd gd2" cx="60" cy="134" r="4.5"/><circle class="gd gd3" cx="78" cy="134" r="4.5"/>' +
    '</svg>';

  function buildHand(cfg) {
    var field = $('#field'), g0 = cfg.GIFT;
    var strip = document.createElement('div');
    strip.className = 'hand-strip';
    strip.style.cssText = 'left:6px;top:' + (cfg.TRAY_TOP - 16) + 'px;width:' + (cfg.FIELD_W - 12) + 'px;height:' + (cfg.FIELD_H - cfg.TRAY_TOP + 8) + 'px';
    field.appendChild(strip);
    g0.slots.forEach(function (s) {
      var sl = document.createElement('div');
      sl.className = 'hand-slot';
      sl.style.cssText = 'left:' + (s.x - cfg.TRAY / 2) + 'px;top:' + (s.y - cfg.TRAY / 2) + 'px;width:' + cfg.TRAY + 'px;height:' + cfg.TRAY + 'px';
      field.appendChild(sl);
    });
    var gift = document.createElement('button');
    gift.id = 'gift';
    gift.type = 'button';
    gift.className = 'gift';
    var gh = Math.round(g0.w * 1.09);
    gift.style.cssText = 'left:' + Math.round(g0.x - g0.w / 2) + 'px;top:' + Math.round(g0.y - gh / 2) + 'px;width:' + g0.w + 'px;height:' + gh + 'px';
    gift.innerHTML = GIFT_SVG;
    if (!state.duel.giftSeen) {
      var hint = document.createElement('span');
      hint.className = 'g-hint';
      hint.textContent = 'Toque!';
      gift.appendChild(hint);
    }
    gift.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    gift.addEventListener('click', onGiftTap);
    field.appendChild(gift);
    clearInterval(state.duel.giftTimer);
    state.duel.giftTimer = setInterval(function () {      // de vez em quando a caixa chama a atenção (só se estiver livre)
      var d = state.duel, b = d && d.box;
      if (!d || d.phase !== 'game' || !b || b.blocked || b.left <= 0 || state.drag || reducedMotion()) return;
      var pending = state.pieces.some(function (p) { return p.out && !p.locked; });
      if (!pending) popEl($('#gift'), 'wiggle');
    }, 5000);
  }

  function updateGift() {
    var g = $('#gift'), d = state.duel;
    if (!g || !d || !d.box) return;
    var b = d.box;
    g.classList.toggle('blocked', !!b.blocked);
    g.classList.toggle('empty', b.left <= 0 && !b.blocked);
    for (var i = 1; i <= 3; i++) g.querySelector('.gd' + i).classList.toggle('on', i <= b.n);
    g.setAttribute('aria-label', b.blocked ? 'Caixa de presentes bloqueada. Encaixe as peças que já saíram.' :
      (b.left <= 0 ? 'Caixa de presentes vazia.' : 'Caixa de presentes: toque para liberar uma peça. Peças pedidas nesta rodada: ' + b.n + ' de ' + b.max + '. Faltam ' + b.left + ' surpresas.'));
  }

  function onGiftTap() {
    var d = state.duel, g = $('#gift');
    if (!d || !g || d.phase !== 'game' || state.status !== 'playing') return;
    d.giftSeen = true;
    var hint = g.querySelector('.g-hint');
    if (hint) hint.remove();
    if (d.autoUntil && Date.now() < d.autoUntil) return;       // a caixa está cuspindo as próximas peças sozinha
    var b = d.box || {};
    if (b.blocked) { popEl(g, 'nope'); toast('Encaixe as peças que já saíram para abrir a caixa de novo!'); vibrate(20); return; }
    if (b.left <= 0) { popEl(g, 'nope'); toast('A caixa está vazia!'); return; }
    popEl(g, 'tap');
    gameEmit('gift', null, function (res) {
      if (!state.duel || !res) return;
      if (res.ok) { state.duel.box = { n: res.n, max: res.max, blocked: res.blocked, left: res.left }; updateGift(); return; }
      if (res.error === 'blocked' || res.error === 'empty') { state.duel.box = { n: res.n, max: res.max, blocked: res.blocked, left: res.left }; updateGift(); popEl(g, 'nope'); }
    });
  }

  // gira a peça (ela cai na posição certa de giro depois de algumas voltas)
  function spinPiece(p, rot) {
    p.rot = rot;
    p.ang = rot * 90 - 720;
    p.tile.style.transition = 'none';
    p.tile.style.transform = 'rotate(' + p.ang + 'deg)';
    void p.tile.offsetWidth;
    p.tile.style.transition = 'transform .46s cubic-bezier(.2,.8,.25,1)';
    p.ang = rot * 90;
    p.tile.style.transform = 'rotate(' + p.ang + 'deg)';
    setTimeout(function () { p.tile.style.transition = ''; }, 540);
  }

  function applyGift(g) {
    var d = state.duel, p = d && d.phase === 'game' && state.pieces[g.id];
    if (!p) return;
    d.box = g.box;
    updateGift();
    p.out = true;
    p.el.style.display = '';
    p.z = g.z;
    if (p.z > state.zMax) state.zMax = p.z;
    p.tx = g.x; p.ty = g.y;
    if (reducedMotion()) { p.x = g.x; p.y = g.y; setAngle(p, g.rot); }
    else {
      p.x = g.from.x; p.y = g.from.y;
      p.vs = 0.15;
      p.fly = { t0: performance.now(), dur: 460, fx: g.from.x, fy: g.from.y, tx: g.x, ty: g.y };
      spinPiece(p, g.rot);
    }
    classify(p);
    var gift = $('#gift');
    if (gift) popEl(gift, 'spit');
    playSound('gift');
    vibrate(12);
    announce('Uma peça saiu da caixa.');
    updateUi();
  }

  // peça que sai da caixa: ao toque (na hora) ou sozinha, quando a rodada de 3 é completada (uma depois da outra)
  socket.on('ch:gift', function (g) {
    var d = state.duel;
    if (!d || !state.pieces[g.id]) return;
    if (g.auto) {
      d.autoUntil = Date.now() + (g.delay || 0) + 900;          // enquanto a caixa cospe, toques extras são ignorados
      if (g.k === 0) { toast('🎁 A caixa soltou as próximas peças!', 2000); playSound('chime'); }
      setTimeout(function () { applyGift(g); }, g.delay || 0);
      return;
    }
    applyGift(g);
  });

  socket.on('ch:box', function (b) {
    var d = state.duel;
    if (!d || !b) return;
    var was = d.box;
    d.box = b;
    updateGift();
    if (was && was.n > 0 && b.n === 0 && b.left > 0) {            // rodada completa: a caixa comemora
      var g = $('#gift');
      if (g) popEl(g, 'wiggle');
      toast('🎁 Caixa liberada! Peça mais!', 1800);
      playSound('chime');
    }
  });

  /* ----- resultado e revanche ----- */
  function showDuelResult(r) {
    var d = state.duel;
    if (!d) return;
    d.phase = 'end';
    d.result = r;
    hideCountdown(false);
    clearInterval(d.graceTimer);
    $('#duel-banner').hidden = true;
    state.status = 'won';
    state.finalMs = r.elapsedMs;
    state.drag = null;
    state.selectedId = null;
    var won = r.winner === state.idx, opp = friendName();
    $('#duel-trophy').textContent = won ? '🏆' : '🥈';
    $('#duel-title').textContent = won ? 'Você venceu! 🎉' : opp + ' venceu!';
    var sub;
    if (r.reason === 'complete') sub = won ? 'Você terminou primeiro!' : 'Quase! ' + opp + ' foi mais rápido. Que tal uma revanche?';
    else sub = won ? opp + ' saiu da disputa. Vitória por desistência.' : 'Você ficou fora da disputa por muito tempo. ' + opp + ' venceu por desistência.';
    $('#duel-sub').textContent = sub;
    $('#duel-time').textContent = r.reason === 'complete' ? fmtTime(r.elapsedMs) : '—';
    [0, 1].forEach(function (i) {
      var p = r.players[i], row = $('#dr' + i);
      row.querySelector('.dr-name').textContent = (p.name || (i === state.idx ? 'Você' : 'Adversário')) + (i === state.idx ? ' (você)' : '');
      row.querySelector('.dr-pct').textContent = p.pct + '%';
      row.querySelector('.dr-pcs').textContent = p.locked + '/' + p.total;
      row.classList.toggle('winner', r.winner === i);
      row.querySelector('.dr-crown').hidden = r.winner !== i;
      paintAvatar($('#dr' + i + '-av'), i, i === state.idx, false);
      var bar = row.querySelector('.dr-bar i');
      bar.style.width = '0%';
      setTimeout(function () { bar.style.width = p.pct + '%'; }, 60);
    });
    var box = $('#duel-confetti');
    box.innerHTML = '';
    if (won && !reducedMotion()) {
      var colors = ['#ffcf33', '#2f6bff', '#ff4f8b', '#1fc8a0', '#ffffff'];
      for (var i = 0; i < 44; i++) {
        var c = document.createElement('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = colors[i % colors.length];
        c.style.animationDuration = 2.4 + Math.random() * 2.2 + 's';
        c.style.animationDelay = Math.random() * 0.8 + 's';
        box.appendChild(c);
      }
    }
    updateDuelRematch();
    updateUi();
    setTimeout(function () {
      if (!state.duel || state.duel.phase !== 'end') return;
      openModal('#modal-duel', '#duel-rematch');
      playSound(won ? 'win' : 'chime');
      vibrate(won ? [40, 60, 40] : 30);
      announce(won ? 'Você venceu a disputa!' : opp + ' venceu a disputa.');
    }, won ? 650 : 350);
  }

  function updateDuelRematch() {
    var d = state.duel;
    if (!d || d.phase !== 'end') return;
    var votes = d.lobby.rematch || [false, false], me = !!votes[state.idx], op = !!votes[1 - state.idx];
    var opp = d.lobby.players[1 - state.idx], name = friendName();
    var btn = $('#duel-rematch'), msg = $('#duel-rematch-msg');
    if (!opp || !opp.joined) { btn.disabled = true; btn.textContent = '🔄 Revanche'; msg.textContent = name + ' saiu da sala.'; return; }
    if (!opp.connected) { btn.disabled = true; btn.textContent = '🔄 Revanche'; msg.textContent = 'Esperando ' + name + ' voltar…'; return; }
    btn.disabled = false;
    if (me) { btn.textContent = '⏳ Esperando ' + name + '… (toque para cancelar)'; msg.textContent = ''; }
    else if (op) { btn.textContent = '🔥 Aceitar revanche!'; msg.textContent = name + ' quer revanche!'; }
    else { btn.textContent = '🔄 Revanche'; msg.textContent = ''; }
  }

  socket.on('ch:lobby', function (l) { applyLobby(l); });
  socket.on('ch:countdown', function (c) { showCountdown(c.ms); });
  socket.on('ch:cancel', function (c) {
    var d = state.duel;
    if (!d) return;
    hideCountdown(false);
    var why = { img: 'A imagem não ficou pronta nos dois celulares. Toquem em "pronto" de novo.', dropped: friendName() + ' desconectou. A contagem foi cancelada.', unready: 'Alguém desmarcou "pronto". A contagem foi cancelada.', left: friendName() + ' saiu da sala.' }[c && c.reason];
    if (why) toast(why, 2600);
    d.phase = 'lobby';
    closeModal('#modal-duel');
    showScreen('lobby');
  });
  socket.on('ch:start', function (m) {
    if (!state.duel) return;
    state.duel.lobby = m.lobby || state.duel.lobby;
    startDuelBoard(m.snapshot, false);
  });
  socket.on('ch:progress', function (p) {
    var d = state.duel;
    if (!d || !p) return;
    d.prog[p.idx] = p;
    if (p.idx !== state.idx) paintStrip();
  });
  socket.on('ch:end', function (r) { showDuelResult(r); });
  socket.on('ch:rematch', function (m) {
    var d = state.duel;
    if (!d || !m) return;
    var was = d.lobby.rematch || [false, false];
    d.lobby.rematch = m.votes;
    if (m.votes[1 - state.idx] && !was[1 - state.idx] && d.phase === 'end') playSound('ping');
    updateDuelRematch();
  });

  $('#btn-duel').addEventListener('click', function () {
    popEl(this, 'go');
    readName();
    syncDuelModes();
    openPick('duel');
  });
  function syncDuelModes() {
    Array.prototype.forEach.call($('#duel-modes').children, function (b) { b.setAttribute('aria-checked', b.dataset.mode === state.duelMode ? 'true' : 'false'); });
  }
  $('#duel-modes').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    state.duelMode = b.dataset.mode === 'quebra' ? 'quebra' : 'comum';
    syncDuelModes();
    playSound('blip');
  });
  $('#lobby-ready').addEventListener('click', function () {
    var d = state.duel;
    if (!d) return;
    var me = d.lobby.players[state.idx];
    socket.emit('ch:ready', { ready: !(me && me.ready) });
  });
  $('#lobby-leave').addEventListener('click', leaveDuel);
  $('#lobby-copy').addEventListener('click', function () {
    var code = state.duel ? state.duel.code : '';
    try { navigator.clipboard.writeText(code).then(function () { toast('Código ' + code + ' copiado!'); }, function () { toast('Código: ' + code); }); }
    catch (e) { toast('Código: ' + code); }
  });
  $('#duel-rematch').addEventListener('click', function () {
    var d = state.duel;
    if (!d) return;
    socket.emit('ch:rematch', { want: !(d.lobby.rematch && d.lobby.rematch[state.idx]) });
  });
  $('#duel-leave').addEventListener('click', leaveDuel);

  /* ---------------------------------------------------------
   * Botões e teclado
   * --------------------------------------------------------- */
  $('#btn-create').addEventListener('click', function () { popEl(this, 'go'); readName(); openPick('create'); });

  $('#btn-join').addEventListener('click', function () {
    var code = $('#input-code').value.trim().toUpperCase();
    if (code.length < state.codeLen) { showError($('#home-error'), 'Digite os ' + state.codeLen + ' caracteres do código.'); return; }
    showError($('#home-error'), '');
    doJoin(code);
  });
  $('#input-code').addEventListener('input', function (e) {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    showError($('#home-error'), '');
    var row = e.target.parentNode, ready = e.target.value.length === state.codeLen;
    if (ready && !row.classList.contains('ready')) popEl($('#btn-join'), 'go');
    row.classList.toggle('ready', ready);
  });
  $('#input-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#btn-join').click(); });
  $('#input-name').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { if ($('#input-code').value.length === state.codeLen) $('#btn-join').click(); else $('#input-name').blur(); }
  });

  $('#pick-grid').addEventListener('click', function (e) {
    if (e.target.closest('.add-card')) { chooseFile(); return; }
    var card = e.target.closest('.pick-card');
    if (!card) return;
    selectImage(card.dataset.file, card);
  });

  $('#size-grid').addEventListener('click', function (e) {
    var btn = e.target.closest('.size-btn');
    if (!btn) return;
    state.pickPieces = Number(btn.dataset.pieces);
    store.set('pieces', state.pickPieces);
    Array.prototype.forEach.call(document.querySelectorAll('.size-btn'), function (b) {
      b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
    });
    updateSizeNote();
    playSound('blip');
  });

  $('#ps-close').addEventListener('click', closePickSheet);

  $('#btn-pick-back').addEventListener('click', function () {
    closePickSheet();
    showScreen(state.pickMode === 'change' && state.inGame ? 'game' : 'home');
  });

  $('#btn-pick-go').addEventListener('click', function () {
    if (!state.pickChoice) return;
    if (state.pickMode === 'duel') {
      createDuel();
    } else if (state.pickMode === 'create') {
      showGoSplash(state.pickChoice);
      doCreate(state.pickChoice, state.pickPieces);
    } else {
      requestRestart(state.pickChoice, state.pickPieces);
      showScreen('game');
    }
  });

  $('#go-cancel').addEventListener('click', function () { setLoading(false); hideGoSplash(true); });

  $('#btn-hint').addEventListener('click', useLamp);

  $('#btn-chat').addEventListener('click', function () { if (state.chatOpen) closeChat(); else openChat(); });
  $('#chat-close').addEventListener('click', closeChat);
  $('#chat-pop').addEventListener('click', openChat);
  $('#chat-quick').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (b && b.dataset.p) sendChat(b.dataset.p);
  });
  $('#chat-phrases').addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('button') : null;
    if (!b) return;
    if (b.classList.contains('lock')) { toast(window.QC && window.QC.canBlock ? 'Para liberar: ' + (b.textContent.replace('🔒 ', '')) + '.' : 'Entre na sua conta e jogue para liberar mais frases!', 3200); return; }
    sendChat(b.dataset.p);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport.addEventListener('scroll', updateKeyboardOffset);
  }

  $('#btn-menu').addEventListener('click', function () { $('#menu-block').hidden = !(window.QC && window.QC.canBlock); openModal('#modal-menu', '#menu-close'); });
  // "Bloquear jogador": só para quem tem conta (a outra pessoa também precisa ter conta para poder ser bloqueada)
  $('#menu-block').addEventListener('click', function () {
    if (!window.confirm('Bloquear esta pessoa? Vocês não poderão mais jogar juntos nem ser amigos, e você sai da partida.')) return;
    socket.emit('acc:blockPeer', {}, function (res) {
      if (res && res.ok) {
        toast((res.name || 'A pessoa') + ' foi bloqueada.', 3200);
        if (state.duel) leaveDuel(); else { socket.disconnect(); window.location.href = location.pathname; }
      } else if (res && res.error === 'guest') toast('Essa pessoa não tem conta, então não dá para bloquear. Você pode sair da partida pelo menu.', 5200);
      else if (res && res.error === 'no_peer') toast('Não há ninguém na sala para bloquear.', 3200);
      else toast('Não foi possível bloquear agora. Tente de novo.', 3200);
    });
  });
  $('#menu-close').addEventListener('click', function () { closeModal('#modal-menu'); });
  $('#modal-menu').addEventListener('click', function (e) { if (e.target === this) closeModal('#modal-menu'); });
  $('#menu-help').addEventListener('click', function () { closeModal('#modal-menu'); openTutorial(); });
  $('#menu-settings').addEventListener('click', function () { closeModal('#modal-menu'); applySettings(); openModal('#modal-settings', '#set-close'); });
  $('#menu-sound').addEventListener('click', function () { toggleSetting('sound'); });
  $('#menu-change').addEventListener('click', function () { closeModal('#modal-menu'); openPick('change'); });
  $('#menu-restart').addEventListener('click', function () {
    closeModal('#modal-menu');
    requestRestart(state.imageId, state.cfg.PIECES);
  });
  $('#menu-leave').addEventListener('click', function () {
    if (state.duel) {
      if (window.confirm(state.duel.phase === 'game' ? 'Sair da disputa? Seu adversário vence.' : 'Sair da sala?')) leaveDuel();
      return;
    }
    if (window.confirm('Sair da partida?')) {
      socket.disconnect();
      window.location.href = location.pathname;
    }
  });

  $('#win-again').addEventListener('click', function () { requestRestart(state.imageId, state.cfg.PIECES); });
  $('#win-change').addEventListener('click', function () { closeModal('#modal-win'); openPick('change'); });
  $('#win-save').addEventListener('click', saveWinImage);
  $('#win-share').addEventListener('click', shareWinImage);

  // pedido de recomeçar (revanche)
  $('#rm-accept').addEventListener('click', function () { socket.emit('rematch:answer', { accept: true }); hideRematchRequest(); });
  $('#rm-decline').addEventListener('click', function () { socket.emit('rematch:answer', { accept: false }); hideRematchRequest(); });
  $('#rw-cancel').addEventListener('click', function () { socket.emit('rematch:cancel'); hideRematchWait(); });

  // tutorial
  $('#link-help').addEventListener('click', openTutorial);
  $('#tut-next').addEventListener('click', function () { clearInterval(tut.timer); if (tut.i >= TUT.length - 1) closeTutorial(); else showTut(tut.i + 1); });
  $('#tut-prev').addEventListener('click', function () { clearInterval(tut.timer); showTut(tut.i - 1); });
  $('#tut-skip').addEventListener('click', closeTutorial);
  $('#tut-dots').addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) { clearInterval(tut.timer); showTut(Number(b.getAttribute('data-i'))); } });
  $('#tut-push').addEventListener('click', function () { enablePush().then(function (ok) { if (ok) showTut(tut.i); }); });
  $('#modal-help').addEventListener('click', function (e) { if (e.target === this) closeTutorial(); });

  // ajustes
  $('#link-settings').addEventListener('click', function () { applySettings(); openModal('#modal-settings', '#set-close'); });
  $('#set-close').addEventListener('click', function () { closeModal('#modal-settings'); });
  $('#modal-settings').addEventListener('click', function (e) {
    if (e.target === this) { closeModal('#modal-settings'); return; }
    var seg = e.target.closest && e.target.closest('.seg button');
    if (seg) { state.settings[seg.parentNode.getAttribute('data-setting')] = seg.getAttribute('data-v'); saveSettings(); layout(); return; }
    var sw = e.target.closest && e.target.closest('.switch');
    if (sw && !sw.disabled) toggleSetting(sw.getAttribute('data-setting'));
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onMq = function () { if (state.settings.theme === 'auto') applySettings(); };
    if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq);
  }

  // avatares no cabeçalho: tocar mostra o nome
  $('#av-me').addEventListener('click', function () { toast(this.getAttribute('aria-label')); });
  $('#av-friend').addEventListener('click', function () { toast(this.getAttribute('aria-label')); });

  // avatar da tela inicial
  $('#avatar-grid').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    var changed = (b.dataset.v || '') !== state.avatar;
    state.avatar = b.dataset.v || '';
    store.set('avatar', state.avatar);
    Array.prototype.forEach.call($('#avatar-grid').children, function (x) { x.setAttribute('aria-checked', x === b ? 'true' : 'false'); });
    popEl(b, 'pop');
    if (changed) vibrate(8);
  });

  // toque no logotipo: os quatro blocos se encaixam de novo (só quando o movimento está liberado)
  $('#logo').addEventListener('click', function () {
    if (reducedMotion()) return;
    Array.prototype.forEach.call(this.children, function (el) { el.style.animation = 'none'; });
    void this.offsetWidth;
    Array.prototype.forEach.call(this.children, function (el) { el.style.animation = ''; });
  });

  // teclado aberto na tela inicial: dá espaço para rolar e deixa o campo (e o cartão dele) na parte que sobra acima do teclado
  (function homeKeyboard() {
    var home = $('#screen-home'), vv = window.visualViewport;
    function sync() {
      var kb = vv ? Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)) : 0;
      home.style.setProperty('--kb', kb > 80 ? kb + 'px' : '0px');
    }
    function reveal(el) {
      var box = el.closest('.join-card, .id-card') || el;
      var r = box.getBoundingClientRect(), r2 = el.getBoundingClientRect();
      var top = vv ? vv.offsetTop : 0, bottom = top + (vv ? vv.height : window.innerHeight), m = 16;
      var dy = 0;
      if (r.bottom + m > bottom) dy = r.bottom + m - bottom;          // o cartão inteiro, se couber
      if (r2.top - dy < top + m) dy = r2.top - (top + m);               // senão, ao menos o campo
      if (Math.abs(dy) > 1) { try { home.scrollBy({ top: dy, behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch (e) { home.scrollTop += dy; } }
    }
    if (vv) { vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync); }
    ['#input-name', '#input-code'].forEach(function (sel) {
      var el = $(sel);
      el.addEventListener('focus', function () { setTimeout(function () { sync(); reveal(el); }, 320); });
      el.addEventListener('blur', function () { setTimeout(sync, 150); });
    });
  })();
  $('#input-name').addEventListener('input', function () { var l = $('#avatar-letter'); if (l) l.textContent = initialOf(this.value) || 'A'; });

  var stageEl = $('#stage');
  stageEl.addEventListener('pointerdown', onPointerDown);
  stageEl.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', function (e) { onPointerUp(e, false); });
  document.addEventListener('pointercancel', function (e) { onPointerUp(e, true); });
  stageEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  stageEl.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (!$('#modal-settings').hidden) { closeModal('#modal-settings'); return; }
      if (!$('#modal-help').hidden) { closeTutorial(); return; }
      if (!$('#modal-menu').hidden) { closeModal('#modal-menu'); return; }
    }
    if (!state.inGame || e.target.tagName === 'INPUT') return;
    if (e.key === 'r' || e.key === 'R') rotateSelected();
    if (e.key === 'Escape') dropSelected();
  });

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') {
      state.ptrs = {}; state.pinch = null; state.drag = null;     // evita dedos "fantasmas" ao voltar para o jogo
      if (state.selectedId !== null) dropSelected();
    }
    else if (state.inGame) keepAwake();
  });

  if (window.ResizeObserver) new ResizeObserver(layout).observe($('#stage'));
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', function () { setTimeout(layout, 250); });

  /* ---------------------------------------------------------
   * Início
   * --------------------------------------------------------- */
  // nome e avatar lembrados neste aparelho
  state.name = store.get('name', '') || '';
  $('#input-name').value = state.name;
  applySettings();
  renderAvatarPicker();

  fetchConfig().then(function () {
    renderAvatarPicker();
    updatePushNote();
    var param = '';
    try { param = (new URLSearchParams(location.search).get('sala') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, state.codeLen); } catch (e) { /* ignora */ }
    if (!param && maybeResumeDuel()) return;                    // uma Sala Desafio ficou aberta neste aparelho
    if (param.length === state.codeLen) {
      $('#input-code').value = param;
      if (state.name) { doJoin(param); return; }          // já conhecemos você: entra direto (ex.: ao tocar no aviso)
      var inv = $('#home-invite');
      inv.innerHTML = 'Você foi convidado para a sala <strong></strong>.<br>Digite seu nome e toque em <b>Entrar</b>.';
      inv.querySelector('strong').textContent = param;
      inv.hidden = false;
      $('#btn-create').hidden = true;
      $('#cta-row').hidden = true;
      $('#btn-join').classList.remove('btn-secondary');
      $('#btn-join').classList.add('btn-primary');
      try { $('#input-name').focus(); } catch (e) { /* ignora */ }
    }
  });

  // ponte para a área de contas (conta.js): só expõe o que ela precisa, sem duplicar nada
  window.QC = {
    state: state, socket: socket, store: store, ready: imagesReady,
    $: $, toast: toast, vibrate: vibrate, playSound: playSound, announce: announce,
    openModal: openModal, closeModal: closeModal, showScreen: showScreen, setLoading: setLoading,
    openPick: function (mode, duelMode) {
      if (duelMode) { state.duelMode = duelMode; Array.prototype.forEach.call($('#duel-modes').children, function (b) { b.setAttribute('aria-checked', b.dataset.mode === duelMode ? 'true' : 'false'); }); }
      openPick(mode);
      if (duelMode) $('#duel-modes').hidden = true;                // o modo já foi escolhido no convite
    },
    join: doJoin, enterRoom: enterRoom,
    goLabel: null,
    applyProfile: function (name, avatar) {
      state.name = String(name || '').slice(0, 12);
      $('#input-name').value = state.name;
      store.set('name', state.name);
      state.avatar = avatar || '';
      store.set('avatar', state.avatar);
      renderAvatarPicker();
    },
    afterEnter: null, onScreen: null, canBlock: false,
    setUnlocked: function (ids) { state.unlocked = null; if (ids) { state.unlocked = {}; ids.forEach(function (id) { state.unlocked[id] = true; }); } if (state.chatOpen) renderPhrases(); }
  };

  requestAnimationFrame(frame);

  // permite instalar o jogo como aplicativo (tela inicial / APK)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { /* ignora */ }); });
  }
})();
