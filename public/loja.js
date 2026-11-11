/* Bandejas personalizáveis e loja (gemas). Só a BANDEJA de peças é decorada: a grade de encaixe não é tocada.
 * A bandeja é uma camada decorativa ATRÁS das peças (pointer-events: none): nunca interfere em arrastar, soltar, encaixar ou nos gestos.
 * Tudo que é compra/gema/posse é decidido no servidor (shop.js); aqui só se mostra e se pede. Sem moeda nova, sem dinheiro real. */
(function () {
  'use strict';
  var QC = window.QC;
  if (!QC) return;
  var $ = QC.$, store = QC.store;

  /* ============================== catálogo (reserva) ==============================
   * O catálogo de verdade vem do servidor (/api/config e /api/acc/shop). Esta cópia só cobre estar sem internet; um teste confere que bate com shop.js. */
  var FALLBACK = [
    { id: 'classica', name: 'Bandeja Clássica', price: 0,   desc: 'Retangular, discreta e moderna. Já é sua!' },
    { id: 'nuvem',    name: 'Bandeja Nuvem',    price: 150, desc: 'Bordas fofas de nuvem que flutuam devagarinho.' },
    { id: 'estrela',  name: 'Bandeja Estrela',  price: 250, desc: 'Contorno de estrela com brilhos nas bordas.' },
    { id: 'gelatina', name: 'Bandeja Gelatina', price: 350, desc: 'Ondulada e elástica: balança quando você mexe.' },
    { id: 'galaxia',  name: 'Bandeja Galáxia',  price: 500, desc: 'Bordas futuristas, partículas e luz suave.' }
  ];
  var MODELS = ['classica', 'nuvem', 'estrela', 'gelatina', 'galaxia'];
  var DEFAULT_COLOR = { classica: '#dbe2ff', nuvem: '#bfe4ff', estrela: '#ffe08a', gelatina: '#ff9fc8', galaxia: '#2d2a6e' };
  var PALETTE = ['#dbe2ff', '#bfe4ff', '#c8f2e0', '#ffe08a', '#ffc9a3', '#ff9fc8', '#e0c3ff', '#a9b8ff', '#7fd1b9', '#f2a65a', '#4a5bd6', '#2d2a6e'];
  var HEX = /^#[0-9a-f]{6}$/;

  /* ============================== cor segura (contraste) ============================== */
  function hexToRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbToHex(r, g, b) { return '#' + [r, g, b].map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? '0' : '') + v.toString(16); }).join(''); }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
    if (d) { s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; }
    return [h, s, l];
  }
  function hslToHex(h, s, l) {
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }
    if (!s) return rgbToHex(l * 255, l * 255, l * 255);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return rgbToHex(f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255);
  }
  function lum(hex) {
    var c = hexToRgb(hex).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return (hi + 0.05) / (lo + 0.05); }
  /* Qualquer cor escolhida vira uma cor SEGURA: nem quase branca nem quase preta (as peças e a interface continuam visíveis), com uma borda mais escura
   * (separa a bandeja do fundo e as peças dela) e um brilho mais claro. A escolha original da pessoa é guardada como está (dá para restaurar). */
  function safeTray(hex) {
    hex = HEX.test(String(hex)) ? String(hex).toLowerCase() : '#dbe2ff';
    var rgb = hexToRgb(hex), hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]), L = Math.max(0.2, Math.min(0.93, hsl[2])), changed = Math.abs(L - hsl[2]) > 0.001;
    var fill = changed ? hslToHex(hsl[0], hsl[1], L) : hex;
    while (lum(fill) < 0.03 && L < 0.6) { L += 0.02; fill = hslToHex(hsl[0], hsl[1], L); changed = true; }       // azul/roxo muito escuros somem no tema escuro: clareia um pouco
    while (lum(fill) > 0.82 && L > 0.2) { L -= 0.02; fill = hslToHex(hsl[0], hsl[1], L); changed = true; }      // cores muito luminosas (amarelo puro, ciano) somem sob peça branca: escurece até dar contraste
    var eL = Math.max(0.06, L - 0.24), edge = hslToHex(hsl[0], Math.min(1, hsl[1] + 0.05), eL);
    while (contrast(fill, edge) < 1.35 && eL > 0.03) { eL -= 0.03; edge = hslToHex(hsl[0], Math.min(1, hsl[1] + 0.05), Math.max(0, eL)); }       // a borda SEMPRE se destaca do corpo
    return {
      fill: fill, changed: changed,
      edge: edge,
      glow: hslToHex(hsl[0], hsl[1], Math.min(0.97, L + 0.2)),
      mat: L > 0.55 ? 'rgba(27,37,89,.07)' : 'rgba(255,255,255,.10)',
      ink: contrast(fill, '#ffffff') >= contrast(fill, '#1b2559') ? '#ffffff' : '#1b2559'
    };
  }

  /* ============================== desenho da bandeja ============================== */
  var NS = 'http://www.w3.org/2000/svg', uid = 0;
  function el(tag, cls, css) { var e = document.createElement(tag); if (cls) e.className = cls; if (css) e.style.cssText = css; return e; }
  function sv(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function n(v) { return Math.round(v * 10) / 10; }

  function rrect(x, y, w, h, r) {
    return 'M' + n(x + r) + ',' + n(y) + ' H' + n(x + w - r) + ' A' + r + ' ' + r + ' 0 0 1 ' + n(x + w) + ',' + n(y + r) + ' V' + n(y + h - r) +
      ' A' + r + ' ' + r + ' 0 0 1 ' + n(x + w - r) + ',' + n(y + h) + ' H' + n(x + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + n(x) + ',' + n(y + h - r) +
      ' V' + n(y + r) + ' A' + r + ' ' + r + ' 0 0 1 ' + n(x + r) + ',' + n(y) + ' Z';
  }
  /* Contornos: cada um ocupa só a faixa livre em volta das peças (em cima T, embaixo B); o espaço das peças fica livre. W×H em unidades do campo. */
  var SHAPES = {
    classica: function (W, H, T, B) { return rrect(3, T - 10, W - 6, B - T + 20, 30); },
    nuvem: function (W, H, T, B) {
      var R = 30, cnt = Math.max(4, Math.round((W - 2 * R) / 200)), seg = (W - 2 * R) / cnt, Ab = Math.max(8, Math.min(30, H - B - 3)), up = [20, 14, 18, 12], dn = [Ab, Math.round(Ab * 0.68), Math.round(Ab * 0.9), Math.round(Ab * 0.55)], d = 'M' + R + ',' + T, i;
      for (i = 0; i < cnt; i++) d += ' A' + n(seg / 2) + ' ' + up[i % 4] + ' 0 0 1 ' + n(R + seg * (i + 1)) + ',' + T;
      d += ' A' + R + ' ' + R + ' 0 0 1 ' + W + ',' + (T + R) + ' V' + (B - R) + ' A' + R + ' ' + R + ' 0 0 1 ' + (W - R) + ',' + B;
      for (i = 0; i < cnt; i++) d += ' A' + n(seg / 2) + ' ' + dn[i % 4] + ' 0 0 1 ' + n(W - R - seg * (i + 1)) + ',' + B;
      return d + ' A' + R + ' ' + R + ' 0 0 1 0,' + (B - R) + ' V' + (T + R) + ' A' + R + ' ' + R + ' 0 0 1 ' + R + ',' + T + ' Z';
    },
    estrela: function (W, H, T, B) {
      var R = 26, A = 18, Ab = Math.max(10, Math.min(30, H - B - 3)), cnt = Math.round((W - 2 * R) / 64), st = (W - 2 * R) / cnt, d = 'M' + R + ',' + T, i, x;
      for (i = 0; i < cnt; i++) { x = R + st * i; d += ' L' + n(x + st / 2) + ',' + (T - A) + ' L' + n(x + st) + ',' + T; }
      d += ' A' + R + ' ' + R + ' 0 0 1 ' + W + ',' + (T + R) + ' V' + (B - R) + ' A' + R + ' ' + R + ' 0 0 1 ' + (W - R) + ',' + B;
      for (i = 0; i < cnt; i++) { x = W - R - st * i; d += ' L' + n(x - st / 2) + ',' + (B + Ab) + ' L' + n(x - st) + ',' + B; }
      return d + ' A' + R + ' ' + R + ' 0 0 1 0,' + (B - R) + ' V' + (T + R) + ' A' + R + ' ' + R + ' 0 0 1 ' + R + ',' + T + ' Z';
    },
    gelatina: function (W, H, T, B) {
      var R = 40, cnt = Math.max(5, Math.round((W - 2 * R) / 110)), st = (W - 2 * R) / cnt, A = 26, Ab = Math.max(20, Math.min(46, (H - B - 3) * 1.9)), d = 'M' + R + ',' + T, i, sg;
      for (i = 0; i < cnt; i++) { sg = i % 2 ? 1 : -1; d += ' Q' + n(R + st * i + st / 2) + ',' + (T + sg * A) + ' ' + n(R + st * (i + 1)) + ',' + T; }
      d += ' Q' + W + ',' + T + ' ' + W + ',' + (T + R);
      d += ' Q' + (W - 12) + ',' + n((T + B) / 2) + ' ' + W + ',' + (B - R) + ' Q' + W + ',' + B + ' ' + (W - R) + ',' + B;
      for (i = 0; i < cnt; i++) { sg = i % 2 ? -1 : 1; d += ' Q' + n(W - R - st * i - st / 2) + ',' + (B + sg * Ab) + ' ' + n(W - R - st * (i + 1)) + ',' + B; }
      d += ' Q0,' + B + ' 0,' + (B - R) + ' Q12,' + n((T + B) / 2) + ' 0,' + (T + R) + ' Q0,' + T + ' ' + R + ',' + T + ' Z';
      return d;
    },
    galaxia: function (W, H, T, B) {      // cantos "escavados" (arcos para dentro) e bordas curvas: visual futurista
      var c = 46;
      return 'M' + c + ',' + T + ' H' + (W - c) + ' A' + c + ' ' + c + ' 0 0 0 ' + W + ',' + (T + c) + ' V' + (B - c) + ' A' + c + ' ' + c + ' 0 0 0 ' + (W - c) + ',' + B +
        ' H' + c + ' A' + c + ' ' + c + ' 0 0 0 0,' + (B - c) + ' V' + (T + c) + ' A' + c + ' ' + c + ' 0 0 0 ' + c + ',' + T + ' Z';
    }
  };

  /* Onde fica a faixa da bandeja dentro do campo (a mesma conta para todos os modos). */
  function geom(cfg) {
    var EXTRA = 42;                                         // a bandeja desce um pouco além do campo (espaço vazio da tela): só decoração, nunca recebe toque
    var top = cfg.TRAY_LINE - 4, H = cfg.FIELD_H - 6 - top + EXTRA, W = cfg.FIELD_W - 16, T = 24, B = H - 26;
    if (!cfg.GIFT && cfg.TRAY_ROWS && cfg.TRAY && cfg.TRAY_TOP) {     // bandeja normal: um "lábio" colorido aparece sob a última fileira de peças
      var last = cfg.TRAY_TOP + cfg.TRAY_ROWS * cfg.TRAY + (cfg.TRAY_ROWS - 1) * (cfg.ROW_GAP || 0) - top + 4 + 30;
      B = Math.min(B, Math.max(T + 120, last));
    }
    return { x: 8, y: top, W: W, H: H, T: T, B: B };
  }

  function decor(model, g, pal) {
    var box = el('div', 'tray-decor'), r = rng(model.length * 7919 + Math.round(g.W)), i, e, s;
    function put(cls, x, y, w, h, css) { var d = el('span', cls, 'left:' + n(x) + 'px;top:' + n(y) + 'px;width:' + n(w) + 'px;height:' + n(h) + 'px;' + (css || '')); box.appendChild(d); return d; }
    if (model === 'nuvem') {
      for (i = 0; i < 5; i++) { s = 80 + r() * 60; e = put('tray-puff', 40 + r() * (g.W - 200), g.T + 20 + r() * Math.max(10, g.B - g.T - 90), s, s * 0.5, '--d:' + n(5 + r() * 4) + 's;animation-delay:-' + n(r() * 6) + 's'); }
    } else if (model === 'estrela') {
      for (i = 0; i < 14; i++) { s = 14 + r() * 18; e = put('tray-spark', 20 + r() * (g.W - 60), (i % 2 ? g.T - 14 : g.B - 8) + (r() * 16 - 8), s, s, '--d:' + n(1.6 + r() * 2) + 's;animation-delay:-' + n(r() * 3) + 's'); }
      for (i = 0; i < 6; i++) { s = 18 + r() * 14; put('tray-spark in', 40 + r() * (g.W - 100), g.T + 30 + r() * Math.max(10, g.B - g.T - 80), s, s, '--d:' + n(2 + r() * 2) + 's;animation-delay:-' + n(r() * 3) + 's'); }
    } else if (model === 'gelatina') {
      put('tray-gloss', 30, g.T - 6, g.W * 0.38, 26, ''); put('tray-gloss s2', g.W * 0.46, g.T - 4, g.W * 0.1, 16, ''); put('tray-gloss s3', g.W - 60, g.T + 18, 18, 18, '');
    } else if (model === 'galaxia') {
      put('tray-neb a', -40, g.T - 40, g.W * 0.7, g.B - g.T + 80, ''); put('tray-neb b', g.W * 0.4, g.T - 30, g.W * 0.7, g.B - g.T + 60, '');
      for (i = 0; i < 28; i++) { s = 2 + r() * 4; put('tray-star', 10 + r() * (g.W - 20), g.T - 12 + r() * (g.B - g.T + 24), s, s, '--d:' + n(1.5 + r() * 3) + 's;animation-delay:-' + n(r() * 4) + 's'); }
      for (i = 0; i < 4; i++) { s = 26 + r() * 26; put('tray-orb', 30 + r() * (g.W - 100), g.T + r() * Math.max(10, g.B - g.T - 40), s, s, '--d:' + n(9 + r() * 6) + 's;animation-delay:-' + n(r() * 8) + 's'); }
    }
    return box;
  }

  /* Monta a bandeja. Devolve a camada pronta (para o campo do jogo ou para a pré-visualização). */
  function buildSkin(model, hex, g) {
    if (!SHAPES[model]) model = 'classica';
    var pal = safeTray(hex), id = 'tg' + (++uid), skin = el('div', 'tray-skin tray-' + model, 'left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.W + 'px;height:' + g.H + 'px');
    skin.style.setProperty('--tf', pal.fill); skin.style.setProperty('--te', pal.edge); skin.style.setProperty('--tg', pal.glow); skin.style.setProperty('--tm', pal.mat);
    var wob = el('div', 'tray-wob'), svg = sv('svg', { viewBox: '0 0 ' + g.W + ' ' + g.H, width: g.W, height: g.H, 'class': 'tray-svg', 'aria-hidden': 'true', focusable: 'false' }), d = SHAPES[model](g.W, g.H, g.T, g.B);
    var defs = sv('defs'), lg = sv('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' });
    lg.appendChild(sv('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.32' })); lg.appendChild(sv('stop', { offset: '0.6', 'stop-color': '#ffffff', 'stop-opacity': '0' }));
    defs.appendChild(lg); svg.appendChild(defs);
    svg.appendChild(sv('path', { 'class': 'tray-shadow', d: d, transform: 'translate(0,7)' }));
    svg.appendChild(sv('path', { 'class': 'tray-body', d: d }));
    svg.appendChild(sv('path', { 'class': 'tray-mat', d: d }));
    svg.appendChild(sv('path', { 'class': 'tray-sheen', d: d, fill: 'url(#' + id + ')' }));
    svg.appendChild(sv('path', { 'class': 'tray-rim', d: d }));
    wob.appendChild(svg); skin.appendChild(wob);
    var dec = decor(model, g, pal);
    if (model !== 'estrela') { dec.style.clipPath = "path('" + d + "')"; dec.style.webkitClipPath = dec.style.clipPath; }     // decoração só dentro do contorno (os brilhos da Estrela passam das pontas de propósito)
    skin.appendChild(dec);
    skin.appendChild(el('div', 'tray-fx'));
    skin._d = d;
    return skin;
  }

  /* ============================== estado, preferências e servidor ============================== */
  var S = { items: FALLBACK.slice(), owned: ['classica'], equipped: 'classica', colors: {}, gems: null, logged: false, uid: null, history: [], loaded: false, anim: null };
  var queue = Promise.resolve();
  function itemById(id) { for (var i = 0; i < S.items.length; i++) if (S.items[i].id === id) return S.items[i]; return null; }
  function owns(id) { return S.owned.indexOf(id) >= 0; }
  function colorOf(id) { return HEX.test(S.colors[id] || '') ? S.colors[id] : DEFAULT_COLOR[id] || DEFAULT_COLOR.classica; }
  function animOn() { return document.documentElement.getAttribute('data-tray-anim') !== 'off'; }
  function current() { var id = owns(S.equipped) && SHAPES[S.equipped] ? S.equipped : 'classica'; return { model: id, hex: colorOf(id) }; }

  function saveLocal() {
    var p = { equipped: S.equipped, colors: S.colors };
    if (S.logged) { p.u = S.uid; store.set('shopc', p); } else store.set('shopg', p);
  }
  function loadLocal() {
    var p = S.logged ? store.get('shopc', null) : store.get('shopg', null);
    if (!p || (S.logged && p.u !== S.uid)) { S.equipped = 'classica'; S.colors = {}; return; }
    S.equipped = MODELS.indexOf(p.equipped) >= 0 ? p.equipped : 'classica';
    S.colors = {}; MODELS.forEach(function (m) { if (p.colors && HEX.test(p.colors[m] || '')) S.colors[m] = p.colors[m]; });
    if (!S.logged) S.owned = ['classica'];
  }
  function takeServer(j) {
    if (!j || !j.ok) return false;
    if (j.categories && j.categories[0]) S.items = j.categories[0].items.slice();
    if (typeof j.gems === 'number') S.gems = j.gems;
    S.owned = (j.owned || ['classica']).filter(function (x) { return MODELS.indexOf(x) >= 0; });
    S.equipped = j.equipped && MODELS.indexOf(j.equipped) >= 0 ? j.equipped : 'classica';
    S.colors = {}; MODELS.forEach(function (m) { if (j.colors && HEX.test(j.colors[m] || '')) S.colors[m] = j.colors[m]; });
    S.history = j.history || [];
    if (typeof j.anim === 'boolean') { S.anim = j.anim; applyAnim(j.anim); }
    S.loaded = true; saveLocal(); return true;
  }
  function applyAnim(on) {                       // a conta manda: mesma preferência em todos os aparelhos
    var cur = animOn();
    if (cur === on) return;
    var s = store.get('settings', {}) || {}; s.trayAnim = on; store.set('settings', s);
    if (QC.state && QC.state.settings) QC.state.settings.trayAnim = on;
    document.documentElement.setAttribute('data-tray-anim', on ? 'on' : 'off');
    var sw = document.querySelector('.switch[data-setting="trayAnim"]'); if (sw) sw.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  function api(method, path, body) { return QC.api ? QC.api(method, path, body, true) : Promise.resolve({ ok: false, error: 'offline' }); }
  function refresh() {
    if (!S.logged) return Promise.resolve();
    return api('GET', '/shop').then(function (j) { if (takeServer(j)) { QC.tray.refresh(); renderIfOpen(); paintGems(); } });
  }
  function loadCatalog() {                       // visitante: o catálogo (nomes e preços) vem do /api/config
    if (S.loaded || S.logged) return Promise.resolve();
    return fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
      if (c && c.shop && c.shop.categories && c.shop.categories[0]) { S.items = c.shop.categories[0].items.slice(); renderIfOpen(); }
    }).catch(function () { /* sem internet: fica o catálogo reserva */ });
  }
  // preferências gravadas em ordem (uma depois da outra), sem travar a tela
  function savePrefs(body) {
    saveLocal();
    if (!S.logged) return;
    queue = queue.then(function () { return api('POST', '/shop/prefs', body); }).then(function (j) {
      if (!j || !j.ok) { if (j && j.error === 'offline') QC.toast('Sem internet: a escolha ficou só neste aparelho por enquanto.', 3200); }
    });
  }

  QC.onAccount = function (me) {
    if (me) { S.logged = true; S.uid = me.code; S.gems = typeof me.gems === 'number' ? me.gems : S.gems; loadLocal(); QC.tray.refresh(); refresh(); }
    else { S.logged = false; S.uid = null; S.owned = ['classica']; S.history = []; S.loaded = false; loadLocal(); QC.tray.refresh(); renderIfOpen(); }
  };
  // a chip de gemas muda quando se joga ou se compra em outro lugar
  var prevBalance = QC.libraryBalanceChanged;
  QC.libraryBalanceChanged = function (gems) { if (S.logged && Number.isSafeInteger(gems)) { S.gems = gems; paintGems(); } if (prevBalance) prevBalance(gems); };

  /* ============================== integração com o jogo ============================== */
  var cur = null, fxT = 0;
  QC.tray = {
    build: function (field, cfg) {
      var c = current(), g = geom(cfg), skin = buildSkin(c.model, c.hex, g);
      var old = field.querySelector('.tray-skin'); if (old) old.parentNode.removeChild(old);
      var board = field.querySelector('#board');
      if (board && board.nextSibling) field.insertBefore(skin, board.nextSibling); else field.appendChild(skin);   // logo depois do tabuleiro: as peças ficam POR CIMA
      field.classList.add('has-tray'); field.classList.remove('tray-classica', 'tray-nuvem', 'tray-estrela', 'tray-gelatina', 'tray-galaxia'); field.classList.add('tray-' + c.model);
      cur = { field: field, cfg: cfg, skin: skin, model: c.model };
      if (c.model === 'classica') { field.classList.add('tray-enter'); setTimeout(function () { field.classList.remove('tray-enter'); }, 900); }
    },
    refresh: function () {                        // trocou de modelo ou de cor (ex.: pela loja aberta durante a partida)
      if (!cur || !cur.field || !cur.field.isConnected) return;
      var c = current(), skin = buildSkin(c.model, c.hex, geom(cur.cfg));
      skin.style.animation = 'none';             // troca instantânea, sem repetir a entrada
      cur.skin.parentNode.replaceChild(skin, cur.skin); cur.skin = skin; cur.model = c.model;
      cur.field.classList.remove('tray-classica', 'tray-nuvem', 'tray-estrela', 'tray-gelatina', 'tray-galaxia'); cur.field.classList.add('tray-' + c.model);
    },
    fx: function (kind, x, y) {                   // efeito ao escolher/retirar uma peça (só visual, nunca mexe nas peças)
      if (!cur || !cur.skin || !animOn()) return;
      var s = cur.skin, cfg = cur.cfg, g = geom(cfg), px = Math.max(0, Math.min(100, ((x - g.x) / g.W) * 100)), py = Math.max(0, Math.min(100, ((y - g.y) / g.H) * 100));
      s.style.setProperty('--fx-x', n(px) + '%'); s.style.setProperty('--fx-y', n(py) + '%');
      s.classList.remove('fx-select', 'fx-pick'); void s.offsetWidth; s.classList.add('fx-' + kind);
      clearTimeout(fxT); fxT = setTimeout(function () { s.classList.remove('fx-select', 'fx-pick'); }, 750);
    },
    drag: function (on) { if (cur && cur.field) cur.field.classList.toggle('dragging', !!on); },   // pausa as animações durante o arrasto (fluidez)
    safeTray: safeTray, buildSkin: buildSkin, shapes: SHAPES, geom: geom, palette: PALETTE, defaults: DEFAULT_COLOR, fallback: FALLBACK, current: current
  };

  /* ============================== a loja (interface) ============================== */
  var ui = { tab: 'loja', mine: null, open: false, previewer: null };
  function paintGems() { var g = $('#shop-gems'); if (g) g.textContent = S.logged ? '💎 ' + (S.gems == null ? '…' : S.gems) : '💎 —'; }
  function renderIfOpen() { if (ui.open) render(); }
  function btn(txt, cls, fn, label) { var b = el('button', 'btn ' + (cls || 'btn-secondary')); b.type = 'button'; b.textContent = txt; if (label) b.setAttribute('aria-label', label); if (fn) b.addEventListener('click', fn); return b; }

  // pré-visualização: a MESMA bandeja do jogo, em escala, com algumas peças de exemplo (e espaços vazios para as decorações aparecerem)
  function samples(g, count) {
    var box = el('div', 'tray-samples'), cols = 6, t = 140, gap = (g.W - cols * t) / (cols + 1), r = rng(11), i, d, hue;
    for (i = 0; i < count; i++) {
      if (i === 3 || i === 8) continue;
      hue = Math.round(r() * 360);
      d = el('div', 'tray-sample', 'left:' + n(g.x + gap + (i % cols) * (t + gap)) + 'px;top:' + n(g.y + g.T + 14 + Math.floor(i / cols) * (t + 14)) + 'px;width:' + t + 'px;height:' + t + 'px;background:linear-gradient(135deg,hsl(' + hue + ',75%,78%),hsl(' + hue + ',70%,60%))');
      box.appendChild(d);
    }
    return box;
  }
  function previewBox(model, hex) {
    var wrap = el('div', 'tray-preview'), stage = el('div', 'tray-stage'), g = { x: 8, y: 0, W: 984, H: 392, T: 28, B: 352 };
    stage.appendChild(buildSkin(model, hex, g)); stage.appendChild(samples(g, 12)); wrap.appendChild(stage);
    wrap._scale = function () { var w = wrap.clientWidth || 300; stage.style.transform = 'scale(' + (w / 1000) + ')'; wrap.style.height = Math.round(392 * (w / 1000)) + 'px'; };
    wrap._stage = stage; wrap._model = model;
    setTimeout(wrap._scale, 0); setTimeout(wrap._scale, 120);
    return wrap;
  }
  function recolor(wrap, hex) {               // prévia em tempo real (sem salvar)
    var skin = wrap._stage.querySelector('.tray-skin'), pal = safeTray(hex);
    skin.style.setProperty('--tf', pal.fill); skin.style.setProperty('--te', pal.edge); skin.style.setProperty('--tg', pal.glow); skin.style.setProperty('--tm', pal.mat);
  }

  function missing(it) { return Math.max(0, it.price - (S.gems || 0)); }
  function card(it) {
    var c = el('article', 'shop-card' + (S.equipped === it.id ? ' on' : '')), own = owns(it.id), using = own && S.equipped === it.id;
    c.setAttribute('data-item', it.id);
    var pv = previewBox(it.id, colorOf(it.id)); c.appendChild(pv);
    var head = el('div', 'shop-card-head'), h = el('h3', 'shop-name'); h.textContent = it.name; head.appendChild(h);
    var badge = el('span', 'shop-badge' + (using ? ' use' : own ? ' own' : ' price'));
    badge.textContent = using ? 'Em uso' : own ? (it.price ? 'Adquirida ✓' : 'Sua ✓') : '💎 ' + it.price; head.appendChild(badge); c.appendChild(head);
    var p = el('p', 'shop-desc'); p.textContent = it.desc; c.appendChild(p);
    if (!own && S.logged) { var m = missing(it); if (m > 0) { var f = el('p', 'shop-miss'); f.textContent = 'Faltam ' + m + ' gema' + (m === 1 ? '' : 's') + ' para comprar.'; f.setAttribute('role', 'status'); c.appendChild(f); } }
    var acts = el('div', 'shop-acts');
    acts.appendChild(btn('👁 Visualizar', 'btn-ghost', function () { openPreview(it.id); }, 'Visualizar ' + it.name));
    if (!own) acts.appendChild(btn(S.logged ? 'Comprar 💎 ' + it.price : 'Entrar para comprar', 'btn-primary', function () { buy(it); }, (S.logged ? 'Comprar ' : 'Entrar para comprar ') + it.name + ' por ' + it.price + ' gemas'));
    else if (using) { var u = btn('Em uso', 'btn-secondary', null); u.disabled = true; acts.appendChild(u); }
    else acts.appendChild(btn('Equipar', 'btn-primary', function () { equip(it.id); }, 'Equipar ' + it.name));
    c.appendChild(acts);
    return c;
  }

  function renderLoja(body) {
    var cats = el('div', 'shop-cats'); cats.setAttribute('role', 'tablist'); cats.setAttribute('aria-label', 'Categorias da loja');
    var chip = el('button', 'shop-cat on'); chip.type = 'button'; chip.setAttribute('role', 'tab'); chip.setAttribute('aria-selected', 'true'); chip.textContent = '🧺 BANDEJAS'; cats.appendChild(chip);   // outras categorias entram aqui no futuro
    body.appendChild(cats);
    if (!S.logged) { var n1 = el('p', 'shop-note'); n1.textContent = 'Dá para ver tudo e mudar a cor da Clássica. Para comprar com gemas, entre na sua conta.'; body.appendChild(n1); }
    var list = el('div', 'shop-list'); S.items.forEach(function (it) { list.appendChild(card(it)); }); body.appendChild(list);
    setTimeout(function () { Array.prototype.forEach.call(list.querySelectorAll('.tray-preview'), function (w) { if (w._scale) w._scale(); }); }, 30);
  }

  function renderMine(body) {
    var owned = S.items.filter(function (it) { return owns(it.id); });
    if (!ui.mine || !owns(ui.mine)) ui.mine = S.equipped;
    var list = el('div', 'mine-list'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', 'Bandejas que você tem');
    owned.forEach(function (it) {
      var b = el('button', 'mine-item' + (ui.mine === it.id ? ' sel' : '')); b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', ui.mine === it.id ? 'true' : 'false');
      var dot = el('i', 'mine-dot'); dot.style.background = safeTray(colorOf(it.id)).fill; b.appendChild(dot);
      var tx = el('span', 'mine-name'); tx.textContent = it.name.replace('Bandeja ', ''); b.appendChild(tx);
      if (S.equipped === it.id) { var u = el('span', 'shop-badge use'); u.textContent = 'Em uso'; b.appendChild(u); }
      b.addEventListener('click', function () { ui.mine = it.id; render(); });
      list.appendChild(b);
    });
    body.appendChild(list);
    var id = ui.mine, it = itemById(id) || FALLBACK[0], ed = el('section', 'mine-editor'), pv = previewBox(id, colorOf(id)); ed.appendChild(pv);
    var tt = el('h3', 'shop-name'); tt.textContent = it.name; ed.appendChild(tt);
    var lb = el('p', 'shop-desc'); lb.textContent = 'Escolha uma cor (é de graça!). Você vê a prévia na hora e ela fica salva sozinha.'; ed.appendChild(lb);
    var pal = el('div', 'swatches'); pal.setAttribute('role', 'group'); pal.setAttribute('aria-label', 'Paleta de cores');
    PALETTE.forEach(function (c) {
      var b = el('button', 'swatch' + (colorOf(id) === c ? ' sel' : '')); b.type = 'button'; b.style.background = c; b.setAttribute('aria-label', 'Cor ' + c); b.setAttribute('aria-pressed', colorOf(id) === c ? 'true' : 'false');
      b.addEventListener('click', function () { setColor(id, c); });
      pal.appendChild(b);
    });
    ed.appendChild(pal);
    var row = el('label', 'pick-row'), sp = el('span'); sp.textContent = 'Cor personalizada'; row.appendChild(sp);
    var inp = el('input'); inp.type = 'color'; inp.value = colorOf(id); inp.id = 'mine-color'; inp.setAttribute('aria-label', 'Escolher uma cor personalizada');
    inp.addEventListener('input', function () { recolor(pv, inp.value.toLowerCase()); hint.hidden = !safeTray(inp.value.toLowerCase()).changed; });     // prévia ao vivo
    inp.addEventListener('change', function () { setColor(id, inp.value.toLowerCase()); });                                                            // salva sozinha
    row.appendChild(inp); ed.appendChild(row);
    var hint = el('p', 'shop-hint'); hint.textContent = 'Ajustamos um pouquinho o brilho para as peças continuarem bem visíveis.'; hint.hidden = !safeTray(colorOf(id)).changed; ed.appendChild(hint);
    var acts = el('div', 'shop-acts');
    var has = !!S.colors[id]; var rs = btn('↺ Restaurar cor original', 'btn-ghost', function () { setColor(id, null); }); rs.disabled = !has; acts.appendChild(rs);
    if (S.equipped === id) { var u = btn('Em uso', 'btn-secondary', null); u.disabled = true; acts.appendChild(u); } else acts.appendChild(btn('Equipar', 'btn-primary', function () { equip(id); }, 'Equipar ' + it.name));
    ed.appendChild(acts);
    var arow = el('div', 'set-row'), al = el('span', 'set-label'); al.id = 'lbl-trayanim2'; al.textContent = 'Animações das bandejas'; arow.appendChild(al);
    var sw = el('button', 'switch'); sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-labelledby', 'lbl-trayanim2'); sw.setAttribute('aria-checked', animOn() ? 'true' : 'false'); sw.appendChild(el('i'));
    sw.addEventListener('click', function () { var on = !animOn(); setAnim(on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); });
    arow.appendChild(sw); ed.appendChild(arow);
    var nt = el('p', 'set-note'); nt.textContent = 'Com o movimento reduzido no aparelho, as animações ficam paradas.'; ed.appendChild(nt);
    body.appendChild(ed);
    setTimeout(function () { if (pv._scale) pv._scale(); }, 30);
  }

  function render() {
    var body = $('#shop-body'); if (!body) return;
    var scroll = body.scrollTop; body.textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('#modal-shop .shop-tab'), function (t) { var on = t.getAttribute('data-tab') === ui.tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (ui.tab === 'minhas') renderMine(body); else renderLoja(body);
    paintGems(); body.scrollTop = scroll;
  }

  /* ---------- ações ---------- */
  function setColor(id, hex) {
    if (hex !== null && !HEX.test(hex)) return;
    if (hex === null) delete S.colors[id]; else S.colors[id] = hex;
    savePrefs({ itemId: id, color: hex });
    if (S.equipped === id) QC.tray.refresh();
    render();
  }
  function equip(id) {
    if (!owns(id)) return;
    S.equipped = id; saveLocal(); QC.tray.refresh(); render();
    if (S.logged) { queue = queue.then(function () { return api('POST', '/shop/equip', { itemId: id }); }).then(function (j) { if (j && !j.ok && j.error !== 'offline') { refresh(); QC.toast('Não deu para equipar agora.', 2600); } }); }
    QC.toast('✓ ' + ((itemById(id) || {}).name || 'Bandeja') + ' em uso!', 2200);
  }
  function setAnim(on) {
    applyAnim(on); S.anim = on;
    if (S.logged) { queue = queue.then(function () { return api('POST', '/shop/prefs', { anim: on }); }); }
  }
  function buy(it) {
    if (!S.logged) { closeShop(); var me = $('#btn-me'); if (me) me.click(); QC.toast('Entre na sua conta para comprar com gemas.', 3200); return; }
    var m = missing(it);
    if (m > 0) { QC.toast('Faltam ' + m + ' gema' + (m === 1 ? '' : 's') + ' para a ' + it.name.toLowerCase() + '. Jogue para ganhar mais!', 3600); return; }
    QC.confirm({ title: 'Comprar ' + it.name + '?', text: 'Usar ' + it.price + ' gemas para ter esta bandeja para sempre. Seu saldo: ' + S.gems + ' gemas (ficam ' + (S.gems - it.price) + ').', ok: 'Comprar 💎 ' + it.price, cancel: 'Agora não' }).then(function (yes) {
      if (!yes) return;
      api('POST', '/shop/buy', { itemId: it.id }).then(function (j) {
        if (j && j.ok) {
          S.gems = j.gems; if (j.owned) S.owned = j.owned.filter(function (x) { return MODELS.indexOf(x) >= 0; });
          if (QC.libraryBalanceChanged) QC.libraryBalanceChanged(j.gems);
          paintGems(); render(); refresh();
          QC.toast(j.already ? 'Você já tem esta bandeja.' : '🎉 ' + it.name + ' desbloqueada! Toque em Equipar para usar.', 3800); QC.playSound && QC.playSound('chime');
        } else if (j && j.error === 'gems') { S.gems = j.gems; paintGems(); render(); QC.toast('Faltam ' + j.missing + ' gemas para esta bandeja.', 3600); }
        else if (j && j.error === 'auth') QC.toast('Sua sessão terminou. Entre de novo.', 3200);
        else QC.toast(j && j.error === 'offline' ? 'Sem internet. Tente de novo.' : 'Não foi possível comprar agora. Nada foi cobrado.', 3400);
      });
    });
  }

  function openPreview(id) {
    var it = itemById(id) || FALLBACK[0], body = $('#tp-body'); if (!body) return;
    body.textContent = ''; $('#tp-title').textContent = it.name;
    var pv = previewBox(id, colorOf(id)); body.appendChild(pv);
    var d = el('p', 'shop-desc'); d.textContent = it.desc + (owns(id) ? '' : ' Preço: 💎 ' + it.price + '.'); body.appendChild(d);
    var acts = $('#tp-actions'); acts.textContent = '';
    if (!owns(id)) acts.appendChild(btn(S.logged ? 'Comprar 💎 ' + it.price : 'Entrar para comprar', 'btn-primary', function () { QC.closeModal('#modal-tray-preview'); buy(it); }));
    else if (S.equipped !== id) acts.appendChild(btn('Equipar', 'btn-primary', function () { QC.closeModal('#modal-tray-preview'); equip(id); }));
    var close = btn('Fechar', 'btn-ghost', function () { QC.closeModal('#modal-tray-preview'); }); close.id = 'tp-close'; close.setAttribute('data-back', ''); acts.appendChild(close);
    QC.openModal('#modal-tray-preview', '#tp-close');
    setTimeout(function () { if (pv._scale) pv._scale(); }, 30);
  }

  function openShop(tab) {
    if (tab) ui.tab = tab;
    ui.open = true; loadCatalog(); if (S.logged) refresh();
    QC.openModal('#modal-shop', '#shop-close'); render();
  }
  function closeShop() { ui.open = false; QC.closeModal('#modal-shop'); }
  QC.openShop = openShop;

  function wire() {
    var on = function (sel, fn) { var e = $(sel); if (e) e.addEventListener('click', fn); };
    on('#link-shop', function () { openShop('loja'); });
    on('#menu-shop', function () { QC.closeModal('#modal-menu'); openShop('loja'); });
    on('#shop-close', closeShop);
    Array.prototype.forEach.call(document.querySelectorAll('#modal-shop .shop-tab'), function (t) { t.addEventListener('click', function () { ui.tab = t.getAttribute('data-tab'); render(); }); });
    var m = $('#modal-shop'); if (m) m.addEventListener('click', function (e) { if (e.target === m) closeShop(); });
    window.addEventListener('resize', function () { if (ui.open) Array.prototype.forEach.call(document.querySelectorAll('#modal-shop .tray-preview, #modal-tray-preview .tray-preview'), function (w) { if (w._scale) w._scale(); }); });
    // a preferência de animação mudou em Ajustes: grava na conta também
    try {
      new MutationObserver(function () { var on2 = animOn(); if (S.anim !== on2) { S.anim = on2; if (S.logged) queue = queue.then(function () { return api('POST', '/shop/prefs', { anim: on2 }); }); } })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-tray-anim'] });
    } catch (e) { /* ignora */ }
    // o botão voltar do Android fecha a janela do topo clicando no botão marcado com data-back (como todas as outras janelas)
  }
  loadLocal();
  var already = QC.account && QC.account(); if (already) QC.onAccount(already);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
