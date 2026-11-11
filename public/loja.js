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
  // Skins e roupas do pet (a lógica de desenho está em mascot-looks.js). Só o que é GRÁTIS existe sem internet; o catálogo de verdade (preços e raridade) vem do servidor.
  var PET_CATS = ['skins', 'roupas'], PET_NOUN = { skins: 'skin', roupas: 'roupa' }, RARITY = { comum: 'Comum', rara: 'Rara', epica: 'Épica', lendaria: 'Lendária' };
  function petFallback() {
    var L = window.MascotLooks, out = { skins: [], roupas: [] };
    if (!L) return out;
    L.SKINS.forEach(function (x) { if (x.free) out.skins.push({ id: 'skin-' + x.id, look: x.id, name: x.name, price: 0, desc: '', cat: 'skins' }); });
    L.OUTFITS.forEach(function (x) { if (x.free) out.roupas.push({ id: 'roupa-' + x.id, look: x.id, name: x.name, price: 0, desc: '', cat: 'roupas' }); });
    return out;
  }
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

  /* ============================== a cor da PARTIDA inteira ==============================
   * A cor escolhida para a bandeja também pinta toda a tela da partida: fundo, campo, tabuleiro e a GRADE de encaixe. Isso é só troca de variáveis de cor
   * na tela do jogo (--paper, --field, --grid, --board-ring...): tamanhos, posições e encaixe não mudam. O matiz e a saturação vêm da cor escolhida; a claridade
   * é fixa por tema (claro/escuro), então texto, peças e botões continuam sempre legíveis. A Clássica de fábrica mantém o visual de sempre. */
  function themeVars(hex, dark) {
    var p = safeTray(hex), rgb = hexToRgb(p.fill), hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]), h = Math.round(hsl[0] * 360), s = hsl[1], gray = s < 0.06;
    function sat(k, lo, hi) { return gray ? 0 : Math.round(Math.max(lo, Math.min(hi, s * k)) * 100); }
    function c(sp, l, a) { return (a === undefined ? 'hsl(' : 'hsla(') + h + ',' + sp + '%,' + l + '%' + (a === undefined ? ')' : ',' + a + ')'); }
    function hx(sp, l) { return hslToHex(h / 360, sp / 100, l / 100); }
    var sa = sat(0.85, 0.1, 0.6), sf = sat(0.7, 0.1, 0.5), sr = sat(1, 0.2, 0.8), v;
    if (!dark) {
      v = { '--paper': c(sa, 93), '--paper-2': c(sa, 96), '--paper-3': c(sa, 87), '--field': c(sf, 90), '--field-bg': c(sa, 97, 0.55), '--field-ring': c(sa, 99, 0.85), '--board-ring': c(sr, 24), '--grid': c(sr, 24, 0.26), '--track': c(sa, 83), '--line': c(sa, 80) };
      return { vars: v, paper: hx(sa, 93), field: hx(sf, 90), ring: hx(sr, 24), grid: hx(sr, 24), dark: false };
    }
    sa = sat(0.5, 0.1, 0.4); sf = sat(0.5, 0.1, 0.4); sr = sat(1, 0.2, 0.7);
    v = { '--paper': c(sa, 11), '--paper-2': c(sa, 15), '--paper-3': c(sa, 8), '--field': c(sf, 19), '--field-bg': c(sa, 85, 0.07), '--field-ring': c(sa, 88, 0.15), '--board-ring': c(sr, 68), '--grid': c(sr, 85, 0.22), '--track': c(sa, 20), '--line': c(sa, 28) };
    return { vars: v, paper: hx(sa, 11), field: hx(sf, 19), ring: hx(sr, 68), grid: hx(sr, 85), dark: true };
  }
  var themed = false, metaOrig = null;
  function themeOn() { return S.equipped !== 'classica' || !!S.colors.classica; }
  function paintTheme(screenName) {
    var sg = $('#screen-game'); if (!sg) return;
    var on = themeOn() && screenName === 'game', mt = document.querySelector('meta[name="theme-color"]'), keys = Object.keys(themeVars('#dbe2ff', false).vars), i;
    if (!on) {
      if (themed) { for (i = 0; i < keys.length; i++) sg.style.removeProperty(keys[i]); if (mt && metaOrig !== null) mt.setAttribute('content', metaOrig); themed = false; }
      return;
    }
    var t = themeVars(current().hex, document.documentElement.getAttribute('data-theme') === 'dark');
    for (i = 0; i < keys.length; i++) sg.style.setProperty(keys[i], t.vars[keys[i]]);
    if (mt) { if (!themed) metaOrig = mt.getAttribute('content'); mt.setAttribute('content', t.paper); }
    themed = true;
  }
  function gameScreen() { var sg = $('#screen-game'); return sg && sg.classList.contains('active') ? 'game' : 'outra'; }

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

  /* Decoração: o que pesa na GPU é o NÚMERO de elementos animados (cada um vira uma camada). Por isso as partículas ficam desenhadas
   * dentro de poucos "grupos" (um <svg> por grupo) e só o grupo inteiro pisca/flutua: 3 a 6 camadas animadas por bandeja, não dezenas. */
  function layer(cls, x, y, w, h, css, fill) {
    var d = el('div', cls, 'left:' + n(x) + 'px;top:' + n(y) + 'px;width:' + n(w) + 'px;height:' + n(h) + 'px;' + (css || '')), s = sv('svg', { viewBox: '0 0 ' + n(w) + ' ' + n(h), width: n(w), height: n(h), 'aria-hidden': 'true', focusable: 'false' });
    fill(s); d.appendChild(s); return d;
  }
  function circ(s, x, y, r) { s.appendChild(sv('circle', { cx: n(x), cy: n(y), r: n(r) })); }
  function star4(s, cx, cy, r, cls) {
    var X = n(cx), Y = n(cy);
    s.appendChild(sv('path', { 'class': cls || '', d: 'M' + X + ',' + n(cy - r) + ' Q' + X + ',' + Y + ' ' + n(cx + r) + ',' + Y + ' Q' + X + ',' + Y + ' ' + X + ',' + n(cy + r) + ' Q' + X + ',' + Y + ' ' + n(cx - r) + ',' + Y + ' Q' + X + ',' + Y + ' ' + X + ',' + n(cy - r) + 'Z' }));
  }
  function decor(model, g, simple) {
    var box = el('div', 'tray-decor'), r = rng(model.length * 7919 + Math.round(g.W)), i, k, bh = Math.max(40, g.B - g.T);
    var dly = function () { return 'animation-delay:-' + n(r() * 6) + 's;'; };
    if (model === 'nuvem') {
      for (i = 0; i < 3; i++) box.appendChild(layer('tray-grp tray-puffg', 30 + i * ((g.W - 260) / 2) + r() * 40, g.T + 12 + r() * Math.max(10, bh - 110), 200, 90, '--d:' + n(5 + r() * 4) + 's;' + dly(), function (s) { circ(s, 62, 56, 26); circ(s, 98, 42, 34); circ(s, 140, 56, 27); circ(s, 100, 62, 28); }));
    } else if (model === 'estrela') {
      box.appendChild(layer('tray-stat', 0, 0, g.W, g.H, '', function (s) { var q; for (q = 0; q < 16; q++) star4(s, 14 + r() * (g.W - 28), (q % 2 ? g.T - 6 : g.B + 4) + (r() * 18 - 9), 7 + r() * 8, 'tray-sp'); }));
      if (!simple) for (k = 0; k < 3; k++) (function (kk) { var w3 = g.W / 3; box.appendChild(layer('tray-grp tray-twk', kk * w3, 0, w3, g.H, '--d:' + n(1.8 + r() * 1.6) + 's;' + dly(), function (s) { var q; for (q = 0; q < 6; q++) star4(s, 12 + r() * (w3 - 24), q < 3 ? g.T + (r() * 30 - 22) : g.T + 24 + r() * Math.max(10, bh - 40), 9 + r() * 9, q < 3 ? 'tray-sp' : 'tray-sp in'); })); })(k);
    } else if (model === 'gelatina') {
      box.appendChild(layer('tray-stat', 0, 0, g.W, g.H, '', function (s) {
        s.appendChild(sv('ellipse', { 'class': 'tray-gl', cx: n(30 + g.W * 0.19), cy: n(g.T + 4), rx: n(g.W * 0.19), ry: 11 })); s.appendChild(sv('ellipse', { 'class': 'tray-gl', cx: n(g.W * 0.51), cy: n(g.T + 6), rx: n(g.W * 0.05), ry: 7 })); s.appendChild(sv('circle', { 'class': 'tray-gl', cx: n(g.W - 52), cy: n(g.T + 26), r: 9 }));
      }));
    } else if (model === 'galaxia') {
      if (!simple) box.appendChild(el('div', 'tray-neb', 'left:-40px;top:' + n(g.T - 40) + 'px;width:' + n(g.W + 80) + 'px;height:' + n(bh + 80) + 'px'));
      box.appendChild(layer('tray-stat', 0, 0, g.W, g.H, '', function (s) { var q; for (q = 0; q < 22; q++) { circ(s, 10 + r() * (g.W - 20), g.T - 12 + r() * (bh + 24), 1 + r() * 2); } }));
      if (!simple) for (k = 0; k < 2; k++) (function (kk) { var w2 = g.W / 2; box.appendChild(layer('tray-grp tray-twk', kk * w2, 0, w2, g.H, '--d:' + n(1.8 + r() * 2) + 's;' + dly(), function (s) { var q; for (q = 0; q < 10; q++) circ(s, 8 + r() * (w2 - 16), g.T - 10 + r() * (bh + 20), 1.2 + r() * 2.4); })); })(k);
      if (!simple) for (i = 0; i < 2; i++) { var sz = 30 + r() * 24; box.appendChild(el('span', 'tray-orb', 'left:' + n(60 + r() * (g.W - 160)) + 'px;top:' + n(g.T + r() * Math.max(10, bh - 50)) + 'px;width:' + n(sz) + 'px;height:' + n(sz) + 'px;--d:' + n(9 + r() * 6) + 's;' + dly())); }
    }
    return box;
  }

  /* Monta a bandeja. Devolve a camada pronta (para o campo do jogo ou para a pré-visualização). */
  function buildSkin(model, hex, g, live) {
    if (!SHAPES[model]) model = 'classica';
    var pal = safeTray(hex), id = 'tg' + (++uid), skin = el('div', 'tray-skin tray-' + model + (live === false ? ' tray-static' : ''), 'left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.W + 'px;height:' + g.H + 'px');
    skin.style.setProperty('--tf', pal.fill); skin.style.setProperty('--te', pal.edge); skin.style.setProperty('--tg', pal.glow); skin.style.setProperty('--tm', pal.mat);
    var wob = el('div', 'tray-wob'), svg = sv('svg', { viewBox: '0 0 ' + g.W + ' ' + g.H, width: g.W, height: g.H, 'class': 'tray-svg', 'aria-hidden': 'true', focusable: 'false' }), d = SHAPES[model](g.W, g.H, g.T, g.B);
    if (live !== false) {                          // bandeja de jogo / prévia com movimento: acabamento completo (sombra, brilho, borda de luz)
      var defs = sv('defs'), lg = sv('linearGradient', { id: id, x1: '0', y1: '0', x2: '0', y2: '1' });
      lg.appendChild(sv('stop', { offset: '0', 'stop-color': '#ffffff', 'stop-opacity': '0.32' })); lg.appendChild(sv('stop', { offset: '0.6', 'stop-color': '#ffffff', 'stop-opacity': '0' }));
      defs.appendChild(lg); svg.appendChild(defs);
      svg.appendChild(sv('path', { 'class': 'tray-shadow', d: d, transform: 'translate(0,7)' }));
      svg.appendChild(sv('path', { 'class': 'tray-body', d: d }));
      svg.appendChild(sv('path', { 'class': 'tray-mat', d: d }));
      svg.appendChild(sv('path', { 'class': 'tray-sheen', d: d, fill: 'url(#' + id + ')' }));
      svg.appendChild(sv('path', { 'class': 'tray-rim', d: d }));
    } else svg.appendChild(sv('path', { 'class': 'tray-body', d: d }));                 // lista da loja: só o corpo e o contorno (leve de pintar)
    wob.appendChild(svg); skin.appendChild(wob);
    var dec = decor(model, g, live === false);
    if (model !== 'estrela') { dec.style.clipPath = "path('" + d + "')"; dec.style.webkitClipPath = dec.style.clipPath; }     // decoração só dentro do contorno (os brilhos da Estrela passam das pontas de propósito)
    skin.appendChild(dec);
    if (live !== false) skin.appendChild(el('div', 'tray-fx'));                    // o brilho de "peça retirada" só existe onde há jogo (a prévia estática não precisa)
    skin._d = d;
    return skin;
  }

  /* ============================== estado, preferências e servidor ============================== */
  var S = { items: FALLBACK.slice(), owned: ['classica'], equipped: 'classica', colors: {}, gems: null, logged: false, uid: null, history: [], loaded: false, anim: null, petItems: { skins: [], roupas: [] }, pet: { skin: '', outfit: '' } };
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
  function loadLocalTrays() {
    var p = S.logged ? store.get('shopc', null) : store.get('shopg', null);
    if (!p || (S.logged && p.u !== S.uid)) { S.equipped = 'classica'; S.colors = {}; return; }
    S.equipped = MODELS.indexOf(p.equipped) >= 0 ? p.equipped : 'classica';
    S.colors = {}; MODELS.forEach(function (m) { if (p.colors && HEX.test(p.colors[m] || '')) S.colors[m] = p.colors[m]; });
    if (!S.logged) S.owned = ['classica'];
  }
  function loadLocal() { loadLocalTrays(); petLoadLocal(); }

  /* ---------- skins e roupas do pet ---------- */
  function petList(cat) { var l = S.petItems[cat]; if (l && l.length) return l; var fb = petFallback(); S.petItems[cat] = fb[cat]; return fb[cat]; }
  function petById(id) { var all = petList('skins').concat(petList('roupas')); for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]; return null; }
  function petByLook(cat, look) { var l = petList(cat); for (var i = 0; i < l.length; i++) if (l[i].look === look) return l[i]; return null; }
  function petUsable(it) { return !!it && (it.price <= 0 || S.owned.indexOf(it.id) >= 0); }          // grátis (para todos, até visitantes) ou já desbloqueado na conta
  function petClean(sel, trust) {                                                                      // só ids conhecidos e só o que dá para usar
    var L = window.MascotLooks, c = L ? L.sanitize(sel) : { skin: '', outfit: '' }, a = c.skin && petByLook('skins', c.skin), b = c.outfit && petByLook('roupas', c.outfit);
    return { skin: a && (trust || petUsable(a)) ? c.skin : '', outfit: b && (trust || petUsable(b)) ? c.outfit : '' };
  }
  var petListeners = [];
  function petNotify() { var cur = { skin: S.pet.skin, outfit: S.pet.outfit }; petListeners.forEach(function (f) { try { f(cur); } catch (e) { /* um ouvinte nunca derruba a loja */ } }); }
  function petSave() { if (S.logged) store.set('petc', { u: S.uid, skin: S.pet.skin, outfit: S.pet.outfit }); else store.set('pet', { skin: S.pet.skin, outfit: S.pet.outfit }); }
  function petLoadLocal() {                                                                            // visitante: o que ele guardou (só grátis vale); conta: o que a conta tinha neste aparelho, até o servidor responder
    var p = S.logged ? store.get('petc', null) : store.get('pet', null);
    S.pet = !p || (S.logged && p.u !== S.uid) ? { skin: '', outfit: '' } : petClean(p, S.logged);
    petNotify();
  }
  function petFromServer(p) {
    var look = function (id) { var it = typeof id === 'string' ? petById(id) : null; return it ? it.look : ''; };
    S.pet = { skin: look(p && p.skin), outfit: look(p && p.outfit) }; petSave(); petNotify();
  }
  function petPick(kind, look) {                                                                        // kind: 'skin' | 'outfit'; look '' = o pet de fábrica
    var cat = kind === 'skin' ? 'skins' : 'roupas', it = look ? petByLook(cat, look) : null;
    if (look && !petUsable(it)) return false;
    var next = { skin: S.pet.skin, outfit: S.pet.outfit }; next[kind] = look || ''; S.pet = next; petSave(); petNotify(); renderIfOpen();
    if (S.logged) queue = queue.then(function () { return api('POST', '/shop/equip', it ? { itemId: it.id } : { category: cat, itemId: null }); }).then(function (j) {
      if (j && !j.ok && j.error !== 'offline') { refresh(); QC.toast('Não deu para trocar o pet agora.', 2600); }
    });
    return true;
  }
  function petState() {
    var entry = function (it) { return { id: it.id, look: it.look, name: it.name, price: it.price, rarity: it.rarity || null, usable: petUsable(it), cat: it.cat }; };
    return { logged: S.logged, sel: { skin: S.pet.skin, outfit: S.pet.outfit }, skins: petList('skins').map(entry), outfits: petList('roupas').map(entry) };
  }
  // loja.js carrega ANTES de mascot-looks.js: nesse momento ainda não dá para validar ids de skin/roupa. O pet.js (último a carregar) chama ready() para reler o que estava guardado.
  function petReady() { if (S.loaded) petNotify(); else petLoadLocal(); }
  QC.shopPet = { state: petState, pick: petPick, ready: petReady, on: function (fn) { if (typeof fn === 'function') petListeners.push(fn); } };

  function takeCatalog(cats) {                       // bandejas (as do jogo de antes) e as categorias do pet, cada uma pelo seu id
    (cats || []).forEach(function (c) {
      if (!c || !Array.isArray(c.items)) return;
      if (c.id === 'bandejas') S.items = c.items.slice();
      else if (PET_CATS.indexOf(c.id) >= 0) S.petItems[c.id] = c.items.map(function (i) { var o = {}; Object.keys(i).forEach(function (k) { o[k] = i[k]; }); o.cat = c.id; return o; });
    });
  }
  function takeServer(j) {
    if (!j || !j.ok) return false;
    takeCatalog(j.categories);
    if (typeof j.gems === 'number') S.gems = j.gems;
    S.owned = (j.owned || ['classica']).filter(function (x) { return MODELS.indexOf(x) >= 0 || !!petById(x); });
    S.equipped = j.equipped && MODELS.indexOf(j.equipped) >= 0 ? j.equipped : 'classica';
    S.colors = {}; MODELS.forEach(function (m) { if (j.colors && HEX.test(j.colors[m] || '')) S.colors[m] = j.colors[m]; });
    S.history = j.history || [];
    if (typeof j.anim === 'boolean') { S.anim = j.anim; applyAnim(j.anim); }
    S.loaded = true; saveLocal(); if (j.pet) petFromServer(j.pet); return true;
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
    return api('GET', '/shop').then(function (j) { if (takeServer(j)) { S.at = Date.now(); QC.tray.refresh(); renderIfOpen(); paintGems(); } });
  }
  function loadCatalog() {                       // visitante: o catálogo (nomes e preços) vem do /api/config
    if (S.loaded || S.logged) return Promise.resolve();
    return fetch('/api/config').then(function (r) { return r.json(); }).then(function (c) {
      if (c && c.shop && c.shop.categories) { takeCatalog(c.shop.categories); petNotify(); renderIfOpen(); }
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
      paintTheme('game');                                           // a cor escolhida também pinta a tela da partida e a grade
      if (c.model === 'classica') { field.classList.add('tray-enter'); setTimeout(function () { field.classList.remove('tray-enter'); }, 900); }
    },
    refresh: function () {                        // trocou de modelo ou de cor (ex.: pela loja aberta durante a partida)
      if (!cur || !cur.field || !cur.field.isConnected) return;
      var c = current(), skin = buildSkin(c.model, c.hex, geom(cur.cfg));
      skin.style.animation = 'none';             // troca instantânea, sem repetir a entrada
      cur.skin.parentNode.replaceChild(skin, cur.skin); cur.skin = skin; cur.model = c.model;
      cur.field.classList.remove('tray-classica', 'tray-nuvem', 'tray-estrela', 'tray-gelatina', 'tray-galaxia'); cur.field.classList.add('tray-' + c.model);
      paintTheme(gameScreen());
    },
    fx: function (kind, x, y) {                   // brilho ao escolher/retirar a peça (só visual): UM por toque; nunca mexe nas peças
      if (!cur || !cur.skin || !cur.skin.isConnected || !animOn()) return;
      var s = cur.skin, g = geom(cur.cfg), px = Math.max(0, Math.min(g.W, x - g.x)), py = Math.max(0, Math.min(g.H, y - g.y));
      s.style.setProperty('--fx-x', n(px) + 'px'); s.style.setProperty('--fx-y', n(py) + 'px');
      s._f = !s._f; s.classList.remove('fx-a', 'fx-b'); s.classList.add(s._f ? 'fx-a' : 'fx-b');       // alterna A/B: reinicia o efeito sem forçar layout
      clearTimeout(fxT); fxT = setTimeout(function () { s.classList.remove('fx-a', 'fx-b'); }, 700);
    },
    drag: function (on) { if (cur && cur.field) cur.field.classList.toggle('dragging', !!on); },   // pausa as animações durante o arrasto (fluidez)
    theme: themeVars, themeOn: themeOn, previewImage: previewImage, safeTray: safeTray, buildSkin: buildSkin, shapes: SHAPES, geom: geom, palette: PALETTE, defaults: DEFAULT_COLOR, fallback: FALLBACK, current: current
  };

  /* ============================== a loja (interface) ============================== */
  var ui = { tab: 'loja', cat: 'bandejas', mine: null, open: false, pvs: [], sig: '' };
  function paintGems() { var g = $('#shop-gems'); if (g) g.textContent = S.logged ? '💎 ' + (S.gems == null ? '…' : S.gems) : '💎 —'; }
  function sig() { return JSON.stringify([ui.cat, S.pet, S.petItems.skins.length, S.petItems.roupas.length, S.logged, S.gems, S.owned, S.equipped, S.colors, S.items.map(function (i) { return i.id + ':' + i.price; }), ui.tab, ui.mine, animOn()]); }
  function renderIfOpen() { if (ui.open && sig() !== ui.sig) render(); else if (!ui.open) ui.sig = ''; }          // dados iguais: não refaz a tela (evita piscar e trabalho à toa)
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
  /* Prévia ESTÁTICA da lista da loja: uma imagem SVG autocontida (corpo, contorno, enfeites e peças de exemplo) desenhada UMA vez num canvas, em segundo plano.
   * Na tela vira um bitmap pronto (barato de mostrar): repintar vetores aninhados e escalados a cada quadro era o que travava ao abrir e ao rolar. */
  function previewImage(model, hex, g) {
    var pal = safeTray(hex), d = SHAPES[model](g.W, g.H, g.T, g.B), r = rng(model.length * 7919 + Math.round(g.W)), o = [], q, bh = Math.max(40, g.B - g.T);
    function star(cx, cy, rr, fill, op) { var X = n(cx), Y = n(cy); return '<path fill="' + fill + '" opacity="' + op + '" d="M' + X + ',' + n(cy - rr) + ' Q' + X + ',' + Y + ' ' + n(cx + rr) + ',' + Y + ' Q' + X + ',' + Y + ' ' + X + ',' + n(cy + rr) + ' Q' + X + ',' + Y + ' ' + n(cx - rr) + ',' + Y + ' Q' + X + ',' + Y + ' ' + X + ',' + n(cy - rr) + 'Z"/>'; }
    function dot(cx, cy, rr, op) { return '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(rr) + '" fill="#fff" opacity="' + op + '"/>'; }
    o.push('<path d="' + d + '" fill="' + pal.fill + '" stroke="' + pal.edge + '" stroke-width="5" stroke-linejoin="round"/>');
    if (model === 'nuvem') { for (q = 0; q < 3; q++) { var cx = 130 + q * ((g.W - 260) / 2) + r() * 40, cy = g.T + 55 + r() * Math.max(10, bh - 120); o.push('<g fill="#fff" opacity=".5"><circle cx="' + n(cx) + '" cy="' + n(cy + 14) + '" r="26"/><circle cx="' + n(cx + 36) + '" cy="' + n(cy) + '" r="34"/><circle cx="' + n(cx + 78) + '" cy="' + n(cy + 14) + '" r="27"/></g>'); } }
    else if (model === 'estrela') { for (q = 0; q < 16; q++) o.push(star(14 + r() * (g.W - 28), (q % 2 ? g.T - 6 : g.B + 4) + (r() * 18 - 9), 7 + r() * 8, pal.glow, '.9')); for (q = 0; q < 8; q++) o.push(star(20 + r() * (g.W - 40), g.T + 24 + r() * Math.max(10, bh - 40), 9 + r() * 9, '#fff', '.5')); }
    else if (model === 'gelatina') { o.push('<ellipse cx="' + n(30 + g.W * 0.19) + '" cy="' + n(g.T + 4) + '" rx="' + n(g.W * 0.19) + '" ry="11" fill="#fff" opacity=".5"/><ellipse cx="' + n(g.W * 0.51) + '" cy="' + n(g.T + 6) + '" rx="' + n(g.W * 0.05) + '" ry="7" fill="#fff" opacity=".5"/><circle cx="' + n(g.W - 52) + '" cy="' + n(g.T + 26) + '" r="9" fill="#fff" opacity=".5"/>'); }
    else if (model === 'galaxia') { o.push('<ellipse cx="' + n(g.W * 0.3) + '" cy="' + n(g.T + bh / 2) + '" rx="' + n(g.W * 0.3) + '" ry="' + n(bh / 2) + '" fill="' + pal.glow + '" opacity=".2"/><ellipse cx="' + n(g.W * 0.72) + '" cy="' + n(g.T + bh / 2) + '" rx="' + n(g.W * 0.28) + '" ry="' + n(bh / 2) + '" fill="#ff82e1" opacity=".14"/>'); for (q = 0; q < 24; q++) o.push(dot(10 + r() * (g.W - 20), g.T - 12 + r() * (bh + 24), 1 + r() * 2.2, '.85')); }
    var cols = 6, t = 140, gap = (g.W - cols * t) / (cols + 1), rs = rng(11), i, hue;
    for (i = 0; i < 12; i++) { if (i === 3 || i === 8) continue; hue = Math.round(rs() * 360); o.push('<rect x="' + n(g.x + gap + (i % cols) * (t + gap)) + '" y="' + n(g.y + g.T + 14 + Math.floor(i / cols) * (t + 14)) + '" width="' + t + '" height="' + t + '" rx="26" fill="hsl(' + hue + ',72%,68%)" stroke="rgba(27,37,89,.3)" stroke-width="4"/>'); }
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 392" width="1000" height="392">' + o.join('') + '</svg>');
  }
  /* Prévia: a MESMA bandeja do jogo em escala. Na lista da loja é ESTÁTICA (imagem) e montada aos poucos; as prévias com movimento (Visualizar e
   * Minhas Bandejas) são uma só por vez, com o desenho vivo. A escala do desenho vivo vem da variável --k (calculada uma vez por tela). */
  function previewBox(model, hex, live) {
    var wrap = el('div', 'tray-preview'), stage = el('div', 'tray-stage'), g = { x: 8, y: 0, W: 984, H: 392, T: 28, B: 352 };
    wrap._stage = stage; wrap._model = model;
    wrap._build = function () {
      if (wrap._built) return; wrap._built = true;
      if (live) { wrap.appendChild(stage); stage.appendChild(buildSkin(model, hex, g, true)); stage.appendChild(samples(g, 12)); }       // com movimento: o desenho vivo
      else {                                                                                  // lista: um canvas desenhado UMA vez em segundo plano (bitmap pronto, barato de mostrar)
        var cv = el('canvas', 'tray-img'), im = new Image(); cv.width = 900; cv.height = 353; cv.setAttribute('role', 'presentation'); wrap.appendChild(cv);
        im.onload = function () { try { cv.getContext('2d').drawImage(im, 0, 0, 900, 353); } catch (e) { /* ignora */ } };
        im.src = previewImage(model, hex, g);
      }
    };
    if (live) wrap._build();
    return wrap;
  }
  function setScale(root) {                       // uma única leitura de largura por tela (nada de ler o layout a cada cartão)
    var pv = root && root.querySelector('.tray-preview'); if (!pv) return;
    var w = pv.clientWidth; if (w > 0) root.style.setProperty('--k', String(Math.round((w / 1000) * 1000) / 1000));
  }
  function buildStaged(wraps) {                   // uma prévia por quadro, as que aparecem primeiro vêm primeiro
    var q = wraps.slice();
    (function step() { var w = q.shift(); if (!w) return; if (w.isConnected) w._build(); requestAnimationFrame(step); })();
  }
  function recolor(wrap, hex) {               // prévia em tempo real (sem salvar)
    var skin = wrap._stage.querySelector('.tray-skin'), pal = safeTray(hex);
    skin.style.setProperty('--tf', pal.fill); skin.style.setProperty('--te', pal.edge); skin.style.setProperty('--tg', pal.glow); skin.style.setProperty('--tm', pal.mat);
  }

  function missing(it) { return Math.max(0, it.price - (S.gems || 0)); }
  function card(it) {
    var c = el('article', 'shop-card' + (S.equipped === it.id ? ' on' : '')), own = owns(it.id), using = own && S.equipped === it.id;
    c.setAttribute('data-item', it.id);
    var pv = previewBox(it.id, colorOf(it.id), false); c.appendChild(pv); ui.pvs.push(pv);
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

  function petCard(it) {
    var use = petUsable(it), cur = it.cat === 'skins' ? S.pet.skin : S.pet.outfit, using = use && cur === it.look;
    var c = el('article', 'shop-card pet-card' + (using ? ' on' : '') + (it.rarity ? ' r-' + it.rarity : '')); c.setAttribute('data-item', it.id);
    var pv = el('div', 'pet-thumb'), img = el('img'); img.src = '/pet/' + it.id + '.webp'; img.alt = ''; img.width = 240; img.height = 180; img.loading = 'lazy'; img.decoding = 'async';
    img.addEventListener('error', function () { pv.classList.add('nofoto'); img.hidden = true; }); pv.appendChild(img); c.appendChild(pv);
    var head = el('div', 'shop-card-head'), h = el('h3', 'shop-name'); h.textContent = it.name; head.appendChild(h);
    var badge = el('span', 'shop-badge' + (using ? ' use' : use ? ' own' : ' price')); badge.textContent = using ? 'Em uso' : use ? (it.price ? 'Adquirido ✓' : 'Grátis ✓') : '💎 ' + it.price; head.appendChild(badge); c.appendChild(head);
    if (it.rarity) { var rt = el('span', 'shop-rar r-' + it.rarity); rt.textContent = RARITY[it.rarity] || ''; c.appendChild(rt); }
    if (it.desc) { var p = el('p', 'shop-desc'); p.textContent = it.desc; c.appendChild(p); }
    if (!use && S.logged) { var m = missing(it); if (m > 0) { var f = el('p', 'shop-miss'); f.textContent = 'Faltam ' + m + ' gema' + (m === 1 ? '' : 's') + ' para comprar.'; f.setAttribute('role', 'status'); c.appendChild(f); } }
    var acts = el('div', 'shop-acts'), kind = it.cat === 'skins' ? 'skin' : 'outfit';
    if (!use) acts.appendChild(btn(S.logged ? 'Comprar 💎 ' + it.price : 'Entrar para comprar', 'btn-primary', function () { buy(it); }, (S.logged ? 'Comprar ' : 'Entrar para comprar ') + it.name + ' por ' + it.price + ' gemas'));
    else if (using) { var u = btn('Em uso', 'btn-secondary', null); u.disabled = true; acts.appendChild(u); acts.appendChild(btn('Tirar', 'btn-ghost', function () { petPick(kind, ''); }, 'Tirar ' + it.name)); }
    else acts.appendChild(btn('Equipar', 'btn-primary', function () { petPick(kind, it.look); QC.toast('✓ ' + it.name + ' em uso!', 2200); }, 'Equipar ' + it.name));
    c.appendChild(acts);
    return c;
  }

  function renderLoja(body) {
    var cats = el('div', 'shop-cats'); cats.setAttribute('role', 'tablist'); cats.setAttribute('aria-label', 'Categorias da loja');
    [['bandejas', '🧺 BANDEJAS'], ['skins', '🎨 SKINS'], ['roupas', '👕 ROUPAS']].forEach(function (c) {
      var chip = el('button', 'shop-cat' + (ui.cat === c[0] ? ' on' : '')); chip.type = 'button'; chip.setAttribute('role', 'tab'); chip.setAttribute('aria-selected', ui.cat === c[0] ? 'true' : 'false'); chip.setAttribute('data-cat', c[0]); chip.textContent = c[1];
      chip.addEventListener('click', function () { ui.cat = c[0]; render(); }); cats.appendChild(chip);
    });
    body.appendChild(cats);
    var pet = ui.cat !== 'bandejas';
    if (!S.logged) { var n1 = el('p', 'shop-note'); n1.textContent = pet ? 'Os itens grátis já são seus. Para desbloquear os outros com gemas, entre na sua conta.' : 'Dá para ver tudo e mudar a cor da Clássica. Para comprar com gemas, entre na sua conta.'; body.appendChild(n1); }
    var list = el('div', 'shop-list' + (pet ? ' pet-list' : '')); ui.pvs = [];
    if (pet) petList(ui.cat).forEach(function (it) { list.appendChild(petCard(it)); }); else S.items.forEach(function (it) { list.appendChild(card(it)); });
    body.appendChild(list);
    if (!pet) { setScale(body); buildStaged(ui.pvs); }
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
    var id = ui.mine, it = itemById(id) || FALLBACK[0], ed = el('section', 'mine-editor'), pv = previewBox(id, colorOf(id), true); ed.appendChild(pv);
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
    setScale(body);
  }

  function render() {
    var body = $('#shop-body'); if (!body) return;
    var scroll = body.scrollTop; body.textContent = '';
    Array.prototype.forEach.call(document.querySelectorAll('#modal-shop .shop-tab'), function (t) { var on = t.getAttribute('data-tab') === ui.tab; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
    if (ui.tab === 'minhas') renderMine(body); else renderLoja(body);
    paintGems(); body.scrollTop = scroll; ui.sig = sig();
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
    var what = it.cat ? PET_NOUN[it.cat] : 'bandeja', fem = 'esta ';
    if (!S.logged) { closeShop(); var me = $('#btn-me'); if (me) me.click(); QC.toast('Entre na sua conta para comprar com gemas.', 3200); return; }
    var m = missing(it);
    if (m > 0) { QC.toast('Faltam ' + m + ' gema' + (m === 1 ? '' : 's') + ' para ' + (it.cat ? it.name : 'a ' + it.name.toLowerCase()) + '. Jogue para ganhar mais!', 3600); return; }
    QC.confirm({ title: 'Comprar ' + it.name + '?', text: 'Usar ' + it.price + ' gemas para ter ' + fem + what + ' para sempre. Seu saldo: ' + S.gems + ' gemas (ficam ' + (S.gems - it.price) + ').', ok: 'Comprar 💎 ' + it.price, cancel: 'Agora não' }).then(function (yes) {
      if (!yes) return;
      api('POST', '/shop/buy', { itemId: it.id }).then(function (j) {
        if (j && j.ok) {
          S.gems = j.gems; if (j.owned) S.owned = j.owned.filter(function (x) { return MODELS.indexOf(x) >= 0 || !!petById(x); });
          if (QC.libraryBalanceChanged) QC.libraryBalanceChanged(j.gems);
          paintGems(); render(); refresh();
          QC.toast(j.already ? 'Você já tem ' + fem + what + '.' : '🎉 ' + it.name + ' desbloqueada! Toque em Equipar para usar.', 3800); QC.playSound && QC.playSound('chime');
        } else if (j && j.error === 'gems') { S.gems = j.gems; paintGems(); render(); QC.toast('Faltam ' + j.missing + ' gemas para ' + fem + what + '.', 3600); }
        else if (j && j.error === 'auth') QC.toast('Sua sessão terminou. Entre de novo.', 3200);
        else QC.toast(j && j.error === 'offline' ? 'Sem internet. Tente de novo.' : 'Não foi possível comprar agora. Nada foi cobrado.', 3400);
      });
    });
  }

  function openPreview(id) {
    var it = itemById(id) || FALLBACK[0], body = $('#tp-body'); if (!body) return;
    body.textContent = ''; $('#tp-title').textContent = it.name;
    var pv = previewBox(id, colorOf(id), true); body.appendChild(pv);
    var d = el('p', 'shop-desc'); d.textContent = it.desc + (owns(id) ? '' : ' Preço: 💎 ' + it.price + '.'); body.appendChild(d);
    var acts = $('#tp-actions'); acts.textContent = '';
    if (!owns(id)) acts.appendChild(btn(S.logged ? 'Comprar 💎 ' + it.price : 'Entrar para comprar', 'btn-primary', function () { QC.closeModal('#modal-tray-preview'); buy(it); }));
    else if (S.equipped !== id) acts.appendChild(btn('Equipar', 'btn-primary', function () { QC.closeModal('#modal-tray-preview'); equip(id); }));
    var close = btn('Fechar', 'btn-ghost', function () { QC.closeModal('#modal-tray-preview'); }); close.id = 'tp-close'; close.setAttribute('data-back', ''); acts.appendChild(close);
    QC.openModal('#modal-tray-preview', '#tp-close');
    setScale(body);
  }

  function openShop(tab, cat) {
    if (tab) ui.tab = tab;
    if (cat === 'bandejas' || cat === 'skins' || cat === 'roupas') ui.cat = cat;
    ui.open = true; loadCatalog();
    QC.openModal('#modal-shop', '#shop-close');
    if (sig() !== ui.sig || !$('#shop-body').firstChild) render(); else setScale($('#shop-body'));      // já montada em segundo plano: abrir é só mostrar
    if (S.logged && (!S.at || Date.now() - S.at > 20000)) refresh();                 // o servidor só é consultado se os dados têm mais de 20 s
  }
  function closeShop() { ui.open = false; QC.closeModal('#modal-shop'); }
  // monta a loja (escondida) quando o app fica ocioso: na hora do toque não sobra trabalho de montar nada
  function prewarm() {
    if (ui.open || ui.warm) return; ui.warm = true;
    var tab = ui.tab; ui.tab = 'loja'; render(); ui.pvs.forEach(function (w) { w._build(); }); ui.tab = tab;
  }
  QC.openShop = openShop;

  function wire() {
    var on = function (sel, fn) { var e = $(sel); if (e) e.addEventListener('click', fn); };
    on('#link-shop', function () { openShop('loja'); });
    on('#menu-shop', function () { QC.closeModal('#modal-menu'); openShop('loja'); });
    on('#shop-close', closeShop);
    Array.prototype.forEach.call(document.querySelectorAll('#modal-shop .shop-tab'), function (t) { t.addEventListener('click', function () { ui.tab = t.getAttribute('data-tab'); render(); }); });
    var m = $('#modal-shop'); if (m) m.addEventListener('click', function (e) { if (e.target === m) closeShop(); });
    window.addEventListener('resize', function () { if (ui.open) { setScale($('#shop-body')); setScale($('#tp-body')); } });
    // enquanto a lista rola, as animações param (rolagem sempre fluida)
    var scT = 0; var sb = $('#shop-body');
    if (sb) sb.addEventListener('scroll', function () { if (!sb.classList.contains('scrolling')) sb.classList.add('scrolling'); clearTimeout(scT); scT = setTimeout(function () { sb.classList.remove('scrolling'); }, 140); }, { passive: true });
    // a preferência de animação mudou em Ajustes: grava na conta também
    try {
      new MutationObserver(function () { var on2 = animOn(); if (S.anim !== on2) { S.anim = on2; if (S.logged) queue = queue.then(function () { return api('POST', '/shop/prefs', { anim: on2 }); }); } })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-tray-anim'] });
      new MutationObserver(function () { paintTheme(gameScreen()); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) { /* ignora */ }
    // o botão voltar do Android fecha a janela do topo clicando no botão marcado com data-back (como todas as outras janelas)
  }
  (window.requestIdleCallback || function (f) { return setTimeout(f, 1500); })(function () { try { prewarm(); } catch (e) { /* ignora: abrir a loja monta na hora */ } }, { timeout: 5000 });
  var prevScreen = QC.onScreen;                  // sair da partida limpa a cor da tela (a tela inicial e os menus seguem iguais)
  QC.onScreen = function (name) { if (prevScreen) prevScreen(name); paintTheme(name); };
  loadLocal();
  var already = QC.account && QC.account(); if (already) QC.onAccount(already);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
