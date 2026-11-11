/* Mascote 3D, APARÊNCIAS: skins (cores e detalhes) e roupas (peças extras presas ao corpo).
 * Não usa DOM nem WebGL: roda no navegador (window.MascotLooks) e no Node (para os testes). Não lê, não grava e não envia dado de ninguém.
 * Nada aqui altera o modelo, as expressões ou as reações do mascote: só troca a COR das peças que já existem e ACRESCENTA peças novas.
 * O rosto (olhos, sobrancelhas, bochechas, boca) fica sempre livre: as roupas só usam as zonas que o rosto não usa. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MascotLooks = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PI = Math.PI;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgnpow(a, e) { return (a < 0 ? -1 : 1) * Math.pow(Math.abs(a), e); }
  function rgb(hex) { var n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }

  /* ===================== as skins (as cores do corpo e os detalhes) ===================== */
  // body = corpo, braços e pálpebras; knob = o "dente" de peça; hands = mãos e polegar; feet = pés; cheek = bochechas.
  // dots: detalhes pintados na frente, só nas zonas que o rosto não usa: [x, y, raio, cor] (x e y na frente do corpo; o z vem da superfície).
  var SKINS = [
    { id: 'menta', name: 'Menta', swatch: '#25c9a4', body: '#25c9a4', knob: '#25c9a4', hands: '#ffffff', feet: '#ff8a6b', cheek: '#ff7f8f',
      dots: [[-0.3, -0.64, 0.07, '#ff8a6b'], [-0.1, -0.655, 0.07, '#ffd24d'], [0.1, -0.655, 0.07, '#ff8a6b'], [0.3, -0.64, 0.07, '#ffd24d'], [-0.71, 0.18, 0.055, '#ffffff'], [0.71, 0.18, 0.055, '#ffffff']] },
    { id: 'por-do-sol', name: 'Pôr do sol', swatch: '#ff7a45', body: '#ff7a45', knob: '#ffcf33', hands: '#fff1d6', feet: '#8a4fff', cheek: '#ff4f8b',
      dots: [[-0.38, 0.625, 0.06, '#ffcf33'], [-0.19, 0.655, 0.06, '#ffcf33'], [0, 0.665, 0.07, '#ffe27a'], [0.19, 0.655, 0.06, '#ffcf33'], [0.38, 0.625, 0.06, '#ffcf33']] },
    { id: 'uva', name: 'Uva', swatch: '#a24bd6', body: '#a24bd6', knob: '#c4b5fd', hands: '#efe7ff', feet: '#ff86bb', cheek: '#ff6fa8',
      dots: [[-0.25, 0.64, 0.07, '#c9b2ff'], [0.25, 0.64, 0.07, '#c9b2ff'], [-0.71, 0.3, 0.07, '#c9b2ff'], [0.71, 0.3, 0.07, '#c9b2ff'], [-0.7, -0.3, 0.06, '#c9b2ff'], [0.7, -0.3, 0.06, '#c9b2ff'], [0, -0.64, 0.07, '#c9b2ff']] },
    { id: 'algodao-doce', name: 'Algodão-doce', swatch: '#ff8cc0', body: '#ff8cc0', knob: '#7fd4ff', hands: '#ffffff', feet: '#5cc8ff', cheek: '#ff6b6b',
      dots: [[-0.4, -0.63, 0.06, '#7fd4ff'], [-0.2, -0.655, 0.06, '#ffe27a'], [0, -0.66, 0.06, '#7fd4ff'], [0.2, -0.655, 0.06, '#ffe27a'], [0.4, -0.63, 0.06, '#7fd4ff'], [-0.7, 0.05, 0.05, '#ffffff'], [0.7, 0.05, 0.05, '#ffffff']] },
    { id: 'luar', name: 'Luar', swatch: '#8d9bb8', body: '#8d9bb8', knob: '#ffd84d', hands: '#ffffff', feet: '#ffb020', cheek: '#ff7fb0',
      dots: [[-0.3, 0.64, 0.05, '#ffd84d'], [0.12, 0.665, 0.07, '#ffd84d'], [0.4, 0.62, 0.045, '#ffd84d'], [-0.72, 0.28, 0.06, '#ffd84d'], [0.71, -0.2, 0.05, '#ffd84d'], [-0.2, -0.65, 0.05, '#ffd84d'], [0.28, -0.64, 0.06, '#ffd84d']] }
  ];

  /* ===================== malhas que acompanham o corpo ===================== */
  // y -> latitude da superelipsoide do corpo, e ponto da superfície do corpo (u = latitude, v = longitude; v = PI/2 é a frente)
  function latForY(B, y) { var k = clamp(Math.abs(y) / B.ry, 0, 1); return (y < 0 ? -1 : 1) * Math.asin(Math.pow(k, 1 / B.e)); }
  function surface(B, u, v) { var cu = Math.cos(u), su = Math.sin(u); return [B.rx * sgnpow(cu, B.e) * sgnpow(Math.cos(v), B.e), B.ry * sgnpow(su, B.e), B.rz * sgnpow(cu, B.e) * sgnpow(Math.sin(v), B.e)]; }
  // malha paramétrica: fn(a, b) -> [x, y, z] com a, b de 0 a 1. As normais saem das diferenças finitas; "outward" é um ponto de referência: se a maioria das normais apontar para ele, inverte.
  function gridMesh(fn, nu, nv, o) {
    o = o || {}; var cnt = (nu + 1) * (nv + 1), pos = new Float32Array(cnt * 3), nor = new Float32Array(cnt * 3), h = 1e-3, k = 0, i, j;
    for (i = 0; i <= nu; i++) for (j = 0; j <= nv; j++) {
      var a = i / nu, b = j / nv, p = fn(a, b), pa = fn(clamp(a + h, 0, 1), b), pa0 = fn(clamp(a - h, 0, 1), b), pb = fn(a, clamp(b + h, 0, 1)), pb0 = fn(a, clamp(b - h, 0, 1));
      var ax = pa[0] - pa0[0], ay = pa[1] - pa0[1], az = pa[2] - pa0[2], bx = pb[0] - pb0[0], by = pb[1] - pb0[1], bz = pb[2] - pb0[2];
      var nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = p[2]; nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l; k += 3;
    }
    var flip = !!o.flip;
    if (o.outward) {                                                   // decide o lado "de fora" pela maioria das normais
      var s = 0; for (k = 0; k < cnt * 3; k += 3) s += nor[k] * (pos[k] - o.outward[0]) + nor[k + 1] * (pos[k + 1] - o.outward[1]) + nor[k + 2] * (pos[k + 2] - o.outward[2]);
      flip = s < 0;
    }
    if (flip) for (k = 0; k < cnt * 3; k++) nor[k] = -nor[k];
    var tris = nu * nv * 2, idx = new Uint16Array(tris * 3 * (o.two ? 2 : 1)), t = 0;
    for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) {
      var i0 = i * (nv + 1) + j, i1 = i0 + 1, i2 = i0 + nv + 1, i3 = i2 + 1;
      if (!flip) { idx[t++] = i0; idx[t++] = i2; idx[t++] = i1; idx[t++] = i1; idx[t++] = i2; idx[t++] = i3; } else { idx[t++] = i0; idx[t++] = i1; idx[t++] = i2; idx[t++] = i1; idx[t++] = i3; idx[t++] = i2; }
    }
    if (o.two) {                                                       // dois lados (capa, saia): também aparece por dentro, com a normal virada
      var base = pos.length / 3, pos2 = new Float32Array(pos.length * 2), nor2 = new Float32Array(nor.length * 2);
      pos2.set(pos); pos2.set(pos, pos.length); nor2.set(nor); for (k = 0; k < nor.length; k++) nor2[nor.length + k] = -nor[k];
      for (i = 0; i < nu; i++) for (j = 0; j < nv; j++) {
        var q0 = base + i * (nv + 1) + j, q1 = q0 + 1, q2 = q0 + nv + 1, q3 = q2 + 1;
        if (!flip) { idx[t++] = q0; idx[t++] = q1; idx[t++] = q2; idx[t++] = q1; idx[t++] = q3; idx[t++] = q2; } else { idx[t++] = q0; idx[t++] = q2; idx[t++] = q1; idx[t++] = q1; idx[t++] = q2; idx[t++] = q3; }
      }
      pos = pos2; nor = nor2;
    }
    return { pos: pos, nor: nor, idx: idx, count: idx.length };
  }
  var CENTER = [0, 0, 0];
  /* Faixa que abraça o corpo: de y0 (embaixo) a y1 (em cima), da longitude v0 a v1, com escala s0 (embaixo) e s1 (em cima) só na horizontal.
   * "drop" desce a borda de baixo; "wave" faz a barra ondulada (babado). Como usa a mesma superfície do corpo, acompanha os cantos arredondados. */
  function belt(B, o) {
    var u0 = latForY(B, o.y0), u1 = latForY(B, o.y1), v0 = o.v0 == null ? -PI : o.v0, v1 = o.v1 == null ? PI : o.v1, s0 = o.s0 || 1.04, s1 = o.s1 || s0, drop = o.drop || 0, wave = o.wave || 0, wn = o.wn || 12;
    return gridMesh(function (a, b) {
      var u = u0 + (u1 - u0) * a, v = v0 + (v1 - v0) * b, p = surface(B, u, v), sc = s0 + (s1 - s0) * a, w = wave * Math.sin(v * wn) * (1 - a) * (1 - a);
      return [p[0] * (sc + w), p[1] - (drop + w * 0.5) * (1 - a), p[2] * (sc + w) + (o.zpush ? -o.zpush * (1 - a) : 0)];
    }, o.lat || 5, o.lon || 40, { outward: CENTER, two: !!o.two });
  }
  // cone (chapéu): apex em (bend, h, 0), base no plano y = 0 com raio r
  function cone(o) {
    var r = o.r, h = o.h, bend = o.bend || 0, top = o.top || 0, seg = o.seg || 28, rows = o.rows || 8;
    return gridMesh(function (a, b) { var t = a, ang = b * 2 * PI, rr = r + (top - r) * t; return [rr * Math.cos(ang) + bend * t * t, h * t, rr * Math.sin(ang)]; }, rows, seg, { outward: [o.bend ? o.bend * 0.3 : 0, h * 0.5, 0] });
  }

  /* ===================== as roupas ===================== */
  var WHITE = '#ffffff', GOLD = '#ffc933';
  // Cada roupa escolhe, entre as suas cores, a que mais contrasta com o corpo da skin atual (o macacão azul sumiria num pet azul): a primeira que for bem diferente, ou a mais diferente de todas.
  function colorDist(a, b) { var d0 = a[0] - b[0], d1 = a[1] - b[1], d2 = a[2] - b[2]; return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2); }
  var MIN_DIST = 0.55;
  function pick(body, list) {
    var best = list[0], bd = -1, i;
    for (i = 0; i < list.length; i++) { var d = colorDist(body, rgb(list[i])); if (d >= MIN_DIST) return list[i]; if (d > bd) { bd = d; best = list[i]; } }
    return best;
  }
  function shade(hex, k) { var c = rgb(hex); return c.map(function (v) { return k >= 0 ? v + (1 - v) * k : v * (1 + k); }); }       // k > 0 clareia, k < 0 escurece
  // Cada roupa devolve { meshes: {nome: malha}, parts: [{ id, mesh | geom:'sph', color, flat, t:[x,y,z], r:[rx,ry,rz], s:[sx,sy,sz] }] } no referencial do corpo (acompanham pulo, giro e achatamento).
  function front(B, x, y) { var n = 2 / B.e, t = 1 - Math.pow(Math.abs(x / B.rx), n) - Math.pow(Math.abs(y / B.ry), n); return B.rz * Math.pow(Math.max(t, 0), 1 / n); }
  var OUTFITS = [
    { id: 'capa-heroi', name: 'Capa de herói', emoji: '🦸',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#e5383b', '#7a4fd6', '#2f6fe4', '#2fa84f']);
        m.cape = belt(B, { y0: -0.8, y1: 0.52, v0: -PI - 0.1, v1: 0.1, s0: 1.8, s1: 1.1, drop: 0.06, zpush: 0.3, two: true, lat: 10, lon: 40 });
        m.collar = belt(B, { y0: 0.4, y1: 0.54, v0: -PI - 0.08, v1: 0.08, s0: 1.12, s1: 1.12, two: true, lat: 2, lon: 26 });
        parts.push({ id: 'capa', mesh: 'cape', color: c }, { id: 'capaGola', mesh: 'collar', color: shade(c, -0.3) });
        [-1, 1].forEach(function (sd) { parts.push({ id: 'fecho' + (sd < 0 ? 'L' : 'R'), geom: 'sph', color: GOLD, t: [sd * 0.755, 0.34, front(B, sd * 0.755, 0.34) - 0.02], s: [0.085, 0.085, 0.065] }); });
        return { meshes: m, parts: parts };
      } },
    { id: 'cachecol', name: 'Cachecol de inverno', emoji: '🧣',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#e5383b', '#2fa84f', '#ff8a2a', '#7a4fd6']);
        m.a = belt(B, { y0: -0.6, y1: -0.5, s0: 1.1, s1: 1.1, lat: 3, lon: 44 }); m.b = belt(B, { y0: -0.67, y1: -0.6, s0: 1.1, s1: 1.1, lat: 3, lon: 44 }); m.c = belt(B, { y0: -0.74, y1: -0.67, s0: 1.1, s1: 1.1, lat: 3, lon: 44 });
        parts.push({ id: 'cachecolA', mesh: 'a', color: c }, { id: 'cachecolB', mesh: 'b', color: WHITE }, { id: 'cachecolC', mesh: 'c', color: c });
        var fz = front(B, -0.36, -0.62);
        parts.push({ id: 'pontaA', geom: 'sph', color: c, t: [-0.36, -0.7, fz + 0.1], r: [0, 0, 0.12], s: [0.13, 0.27, 0.055] });
        parts.push({ id: 'pontaB', geom: 'sph', color: WHITE, t: [-0.352, -0.78, fz + 0.108], r: [0, 0, 0.12], s: [0.132, 0.05, 0.055] });
        parts.push({ id: 'nozinho', geom: 'sph', color: shade(c, -0.25), t: [-0.36, -0.56, fz + 0.095], s: [0.14, 0.095, 0.075] });
        return { meshes: m, parts: parts };
      } },
    { id: 'mago', name: 'Chapéu de mago', emoji: '🧙',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#35177a', '#6d3fd1', '#e5383b', '#2fa84f']), H = 0.7, R = 0.4, TOP = 0.02, BEND = 0.16, hat = { t: [-0.2, 0.68, -0.02], r: [0, 0, 0.12] };
        m.hat = cone({ r: R, h: H, bend: BEND, top: TOP }); m.band = cone({ r: R + 0.012, h: 0.1, top: R, rows: 2 });
        parts.push({ id: 'chapeu', mesh: 'hat', color: c, t: hat.t, r: hat.r }, { id: 'chapeuFaixa', mesh: 'band', color: GOLD, t: hat.t, r: hat.r });
        parts.push({ id: 'chapeuAba', geom: 'sph', color: shade(c, -0.18), t: [hat.t[0], hat.t[1] + 0.005, hat.t[2]], r: hat.r, s: [0.58, 0.05, 0.58] });
        var cs = Math.cos(hat.r[2]), sn = Math.sin(hat.r[2]);
        [[0.3, 0.0], [0.5, -0.5], [0.66, 0.35]].forEach(function (st, i) {                         // estrelas na frente do chapéu: [altura (fração), ângulo]
          var f = st[0], ang = PI / 2 + st[1] * 0.6, rr = R + (TOP - R) * f + 0.012, x = rr * Math.cos(ang) + BEND * f * f, y = H * f, z = rr * Math.sin(ang);
          parts.push({ id: 'estrela' + i, geom: 'sph', color: '#ffe27a', flat: true, t: [hat.t[0] + x * cs - y * sn, hat.t[1] + x * sn + y * cs, hat.t[2] + z], s: [0.05, 0.05, 0.03] });
        });
        return { meshes: m, parts: parts };
      } },
    { id: 'bailarina', name: 'Saia de bailarina', emoji: '🩰',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#ff7ac0', '#7a4fd6', '#2f6fe4', '#ffd23f']);
        m.skirtB = belt(B, { y0: -0.8, y1: -0.58, s0: 1.9, s1: 1.4, drop: 0.07, wave: 0.05, wn: 14, two: true, lat: 6, lon: 56 });
        m.skirtA = belt(B, { y0: -0.7, y1: -0.5, s0: 1.55, s1: 1.08, drop: 0.03, wave: 0.035, wn: 11, two: true, lat: 6, lon: 56 });
        m.waist = belt(B, { y0: -0.56, y1: -0.5, s0: 1.1, s1: 1.1, lat: 2, lon: 44 });
        parts.push({ id: 'saiaB', mesh: 'skirtB', color: c }, { id: 'saiaA', mesh: 'skirtA', color: shade(c, 0.45) }, { id: 'cintura', mesh: 'waist', color: shade(c, -0.35) });
        var bw = shade(c, -0.35), fz = front(B, 0, -0.52);
        parts.push({ id: 'lacoL', geom: 'sph', color: bw, t: [-0.11, -0.52, fz + 0.1], s: [0.11, 0.075, 0.05], r: [0, 0, 0.35] }, { id: 'lacoR', geom: 'sph', color: bw, t: [0.11, -0.52, fz + 0.1], s: [0.11, 0.075, 0.05], r: [0, 0, -0.35] }, { id: 'lacoNo', geom: 'sph', color: shade(c, -0.55), t: [0, -0.52, fz + 0.11], s: [0.055, 0.055, 0.055] });
        return { meshes: m, parts: parts };
      } },
    { id: 'macacao', name: 'Macacão de jardineiro', emoji: '🧑‍🌾',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#e5383b', '#ffd23f', '#2fa84f', '#2f6fe4', '#7a4fd6']), btn = c === '#ffd23f' ? WHITE : GOLD;
        m.pants = belt(B, { y0: -0.72, y1: -0.52, v0: 0.25, v1: PI - 0.25, s0: 1.07, s1: 1.07, lat: 3, lon: 30 });
        m.strapR = belt(B, { y0: -0.58, y1: 0.42, v0: 0.5, v1: 0.76, s0: 1.05, s1: 1.05, lat: 14, lon: 4 });
        m.strapL = belt(B, { y0: -0.58, y1: 0.42, v0: PI - 0.76, v1: PI - 0.5, s0: 1.05, s1: 1.05, lat: 14, lon: 4 });
        parts.push({ id: 'calca', mesh: 'pants', color: c }, { id: 'alcaR', mesh: 'strapR', color: c }, { id: 'alcaL', mesh: 'strapL', color: c });
        [-1, 1].forEach(function (sd) { parts.push({ id: 'botao' + (sd < 0 ? 'L' : 'R'), geom: 'sph', color: btn, t: [sd * 0.68, 0.34, front(B, sd * 0.68, 0.34) + 0.03], s: [0.065, 0.065, 0.05] }); });
        parts.push({ id: 'bolso', geom: 'sph', color: shade(c, -0.28), t: [0, -0.63, front(B, 0, -0.63) + 0.05], s: [0.18, 0.08, 0.045] });
        return { meshes: m, parts: parts };
      } }
  ];

  /* ===================== montar e aplicar ===================== */
  var DEFAULT_BODY = [0.23, 0.42, 1.0];                                          // a cor do corpo de fábrica (a mesma de mascot-core.js)
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function sanitize(sel) {                                                      // qualquer coisa que não seja um id conhecido vira "nenhum" (o visual de sempre)
    sel = sel && typeof sel === 'object' ? sel : {};
    return { skin: typeof sel.skin === 'string' && byId(SKINS, sel.skin) ? sel.skin : '', outfit: typeof sel.outfit === 'string' && byId(OUTFITS, sel.outfit) ? sel.outfit : '' };
  }
  /* build: devolve tudo o que uma aparência precisa, sem tocar em nada: as cores das peças existentes, as peças novas e as malhas novas. */
  function build(Core, sel) {
    sel = sanitize(sel); var B = Core.BODY, skin = byId(SKINS, sel.skin), outfit = byId(OUTFITS, sel.outfit);
    var look = { skin: sel.skin, outfit: sel.outfit, colors: {}, extras: [], geoms: {} }, n = 0;
    if (skin) {
      var c = { body: rgb(skin.body), knob: rgb(skin.knob), hands: rgb(skin.hands), feet: rgb(skin.feet), cheek: rgb(skin.cheek) };
      ['body', 'armL', 'armR', 'lidL', 'lidR'].forEach(function (id) { look.colors[id] = c.body; });
      look.colors.knob = c.knob; ['handL', 'handR', 'thumb'].forEach(function (id) { look.colors[id] = c.hands; });
      ['footL', 'footR'].forEach(function (id) { look.colors[id] = c.feet; }); ['cheekL', 'cheekR'].forEach(function (id) { look.colors[id] = c.cheek; });
      skin.dots.forEach(function (d, i) {
        look.extras.push({ id: 'pinta' + i, geom: 'sph', color: rgb(d[3]), flat: true, local: { t: [d[0], d[1], front(B, d[0], d[1]) - d[2] * 0.12], r: [0, 0, 0], s: [d[2] * 1.3, d[2] * 1.3, d[2] * 0.6] } });
      });
    }
    if (outfit) {
      var made = outfit.make(B, skin ? rgb(skin.body) : DEFAULT_BODY);
      Object.keys(made.meshes).forEach(function (k) { look.geoms['lk' + (n++)] = made.meshes[k]; made.meshes[k].key = 'lk' + (n - 1); });
      made.parts.forEach(function (p) {
        look.extras.push({ id: p.id, geom: p.mesh ? made.meshes[p.mesh].key : 'sph', color: Array.isArray(p.color) ? p.color : rgb(p.color), flat: !!p.flat, local: { t: p.t || [0, 0, 0], r: p.r || [0, 0, 0], s: p.s || [1, 1, 1] } });
      });
    }
    return look;
  }
  /* apply: coloca a aparência nas peças do mascote (restaurando as cores originais antes) e acrescenta as peças novas. Devolve a lista de malhas a enviar para a GPU. */
  function apply(Core, parts, look) {
    if (parts.looks) { var keep = parts.looks.extras.length; parts.splice(parts.length - keep, keep); parts.looks.extras.forEach(function (e) { delete parts.byId[e.id]; }); }
    Core.PART_DEFS.forEach(function (d) { if (parts.byId[d[0]]) parts.byId[d[0]].color = d[2]; });                // volta ao visual original (as cores de C nunca são alteradas)
    Object.keys(look.colors).forEach(function (id) { if (parts.byId[id]) parts.byId[id].color = look.colors[id]; });
    var mine = look.extras.map(function (e) {
      var p = { id: e.id, geom: e.geom, color: e.color, flat: e.flat, outline: false, vis: true, local: e.local, M: new Float32Array(16), N: new Float32Array(9) };
      parts.push(p); parts.byId[e.id] = p; return p;
    });
    parts.looks = { extras: mine, geoms: look.geoms }; return look.geoms;
  }
  var tG = new Float32Array(16), tL = new Float32Array(16);
  /* place: a cada quadro, depois de Core.computeParts, posiciona as peças novas no referencial do corpo (o mesmo do corpo: pulo, giro e achatamento). */
  function place(Core, parts, pose) {
    if (!parts.looks || !parts.looks.extras.length) return;
    Core.mTRS(tG, 0, pose.hop - Core.BODY.ry * (1 - pose.sy), 0, pose.pitch, pose.yaw, pose.roll, pose.sx, pose.sy, pose.sx);
    parts.looks.extras.forEach(function (p) {
      var l = p.local; Core.mTRS(tL, l.t[0], l.t[1], l.t[2], l.r[0], l.r[1], l.r[2], l.s[0], l.s[1], l.s[2]);
      Core.mMul(p.M, tG, tL); Core.mNormal(p.N, p.M); p.vis = true;
    });
  }

  return { SKINS: SKINS, OUTFITS: OUTFITS, pick: pick, colorDist: colorDist, MIN_DIST: MIN_DIST, DEFAULT_BODY: DEFAULT_BODY, sanitize: sanitize, build: build, apply: apply, place: place, byId: byId, rgb: rgb, latForY: latForY, surface: surface, gridMesh: gridMesh, belt: belt, cone: cone, front: front };
});
