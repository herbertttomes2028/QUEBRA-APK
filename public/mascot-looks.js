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
    { id: 'menta', free: true, name: 'Menta', swatch: '#25c9a4', body: '#25c9a4', knob: '#25c9a4', hands: '#ffffff', feet: '#ff8a6b', cheek: '#ff7f8f',
      dots: [[-0.3, -0.64, 0.07, '#ff8a6b'], [-0.1, -0.655, 0.07, '#ffd24d'], [0.1, -0.655, 0.07, '#ff8a6b'], [0.3, -0.64, 0.07, '#ffd24d'], [-0.71, 0.18, 0.055, '#ffffff'], [0.71, 0.18, 0.055, '#ffffff']] },
    { id: 'por-do-sol', free: true, name: 'Pôr do sol', swatch: '#ff7a45', body: '#ff7a45', knob: '#ffcf33', hands: '#fff1d6', feet: '#8a4fff', cheek: '#ff4f8b',
      dots: [[-0.38, 0.625, 0.06, '#ffcf33'], [-0.19, 0.655, 0.06, '#ffcf33'], [0, 0.665, 0.07, '#ffe27a'], [0.19, 0.655, 0.06, '#ffcf33'], [0.38, 0.625, 0.06, '#ffcf33']] },
    { id: 'uva', free: true, name: 'Uva', swatch: '#a24bd6', body: '#a24bd6', knob: '#c4b5fd', hands: '#efe7ff', feet: '#ff86bb', cheek: '#ff6fa8',
      dots: [[-0.25, 0.64, 0.07, '#c9b2ff'], [0.25, 0.64, 0.07, '#c9b2ff'], [-0.71, 0.3, 0.07, '#c9b2ff'], [0.71, 0.3, 0.07, '#c9b2ff'], [-0.7, -0.3, 0.06, '#c9b2ff'], [0.7, -0.3, 0.06, '#c9b2ff'], [0, -0.64, 0.07, '#c9b2ff']] },
    { id: 'algodao-doce', free: true, name: 'Algodão-doce', swatch: '#ff8cc0', body: '#ff8cc0', knob: '#7fd4ff', hands: '#ffffff', feet: '#5cc8ff', cheek: '#ff6b6b',
      dots: [[-0.4, -0.63, 0.06, '#7fd4ff'], [-0.2, -0.655, 0.06, '#ffe27a'], [0, -0.66, 0.06, '#7fd4ff'], [0.2, -0.655, 0.06, '#ffe27a'], [0.4, -0.63, 0.06, '#7fd4ff'], [-0.7, 0.05, 0.05, '#ffffff'], [0.7, 0.05, 0.05, '#ffffff']] },
    { id: 'luar', free: true, name: 'Luar', swatch: '#8d9bb8', body: '#8d9bb8', knob: '#ffd84d', hands: '#ffffff', feet: '#ffb020', cheek: '#ff7fb0',
      dots: [[-0.3, 0.64, 0.05, '#ffd84d'], [0.12, 0.665, 0.07, '#ffd84d'], [0.4, 0.62, 0.045, '#ffd84d'], [-0.72, 0.28, 0.06, '#ffd84d'], [0.71, -0.2, 0.05, '#ffd84d'], [-0.2, -0.65, 0.05, '#ffd84d'], [0.28, -0.64, 0.06, '#ffd84d']] },
    { id: 'limao', free: false, name: 'Limão', swatch: '#9fd62a', body: '#9fd62a', knob: '#fff176', hands: '#ffffff', feet: '#ff9f1c', cheek: '#ff6f6f',
      dots: [[-0.3, 0.64, 0.06, '#ffffff'], [-0.1, 0.66, 0.05, '#ffffff'], [0.1, 0.66, 0.05, '#ffffff'], [0.3, 0.64, 0.06, '#ffffff'], [-0.71, 0.1, 0.055, '#fff59d'], [0.71, 0.1, 0.055, '#fff59d']] },
    { id: 'caramelo', free: false, name: 'Caramelo', swatch: '#a9714a', body: '#a9714a', knob: '#f3d9b1', hands: '#fff3df', feet: '#6b4226', cheek: '#ff8f8f',
      dots: [[-0.25, 0.64, 0.07, '#f3d9b1'], [0.25, 0.64, 0.07, '#f3d9b1'], [-0.7, 0.25, 0.065, '#f3d9b1'], [0.7, 0.25, 0.065, '#f3d9b1'], [-0.7, -0.25, 0.06, '#f3d9b1'], [0.7, -0.25, 0.06, '#f3d9b1']] },
    { id: 'lavanda', free: false, name: 'Lavanda', swatch: '#c3b1f2', body: '#c3b1f2', knob: '#8b6fe0', hands: '#ffffff', feet: '#7a5af8', cheek: '#ff7fb0',
      dots: [[-0.2, 0.655, 0.05, '#ffffff'], [0, 0.665, 0.07, '#8b6fe0'], [0.2, 0.655, 0.05, '#ffffff'], [-0.3, -0.64, 0.06, '#8b6fe0'], [0, -0.66, 0.06, '#ffffff'], [0.3, -0.64, 0.06, '#8b6fe0'], [-0.71, 0.1, 0.05, '#8b6fe0'], [0.71, 0.1, 0.05, '#8b6fe0']] },
    { id: 'cereja', free: false, name: 'Cereja', swatch: '#e0305e', body: '#e0305e', knob: '#3ecf6e', hands: '#ffffff', feet: '#ffd23f', cheek: '#ffa3b5',
      dots: [[-0.36, 0.62, 0.055, '#ffffff'], [-0.18, 0.655, 0.045, '#ffffff'], [0.3, 0.63, 0.05, '#ffb3c0'], [-0.7, 0.2, 0.07, '#ffb3c0'], [0.71, 0.2, 0.06, '#ffffff'], [-0.7, -0.28, 0.05, '#ffffff'], [0.7, -0.28, 0.055, '#ffb3c0']] },
    { id: 'ouro', free: false, name: 'Ouro', swatch: '#ffcc2e', body: '#ffcc2e', knob: '#fff3a0', hands: '#ffffff', feet: '#c77700', cheek: '#ff8a5c',
      dots: [[-0.38, 0.625, 0.05, '#ffffff'], [-0.19, 0.655, 0.045, '#c77700'], [0, 0.665, 0.06, '#ffffff'], [0.19, 0.655, 0.045, '#c77700'], [0.38, 0.625, 0.05, '#ffffff'], [-0.71, 0.18, 0.05, '#ffffff'], [0.71, 0.18, 0.05, '#c77700'], [-0.3, -0.64, 0.05, '#ffffff'], [0.3, -0.64, 0.05, '#c77700']] },
    { id: 'oceano', free: false, name: 'Azul Oceano', swatch: '#1688e8', body: '#1688e8', knob: '#66d9ff', hands: '#ffffff', feet: '#ffb347', cheek: '#ff8fa3',
      dots: [[-0.30, 0.64, 0.06, '#ffffff'], [0.30, 0.64, 0.06, '#ffffff']] }
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
    if (o.axis) {                                                      // tubo, anel, coroa: o "dentro" é o eixo de cada vértice (o.axis(a, b) -> [x, y, z])
      var s2 = 0; k = 0; for (i = 0; i <= nu; i++) for (j = 0; j <= nv; j++) { var ax0 = o.axis(i / nu, j / nv); s2 += nor[k] * (pos[k] - ax0[0]) + nor[k + 1] * (pos[k + 1] - ax0[1]) + nor[k + 2] * (pos[k + 2] - ax0[2]); k += 3; }
      flip = s2 < 0;
    } else if (o.outward) {                                            // decide o lado "de fora" pela maioria das normais
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

  // tubo ao longo de um arco de elipse no plano x-y (a faixa do fone de ouvido): do ângulo 0 (direita) até PI (esquerda)
  function arcTube(o) {
    var cy = o.cy, rx = o.rx, ry = o.ry, r = o.r;
    var at = function (a) { var th = a * PI; return [rx * Math.cos(th), cy + ry * Math.sin(th), 0]; };
    return gridMesh(function (a, b) { var th = a * PI, ang = b * 2 * PI, p = at(a), nx = Math.cos(th), ny = Math.sin(th); return [p[0] + r * Math.cos(ang) * nx, p[1] + r * Math.cos(ang) * ny, r * Math.sin(ang)]; }, o.rows || 26, o.seg || 10, { axis: function (a) { return at(a); } });
  }
  // anel (a auréola): raio R, espessura r, deitado (eixo y)
  function ring(o) {
    var R = o.R, r = o.r;
    return gridMesh(function (a, b) { var ph = a * 2 * PI, ps = b * 2 * PI, c = Math.cos(ph), sn = Math.sin(ph); return [(R + r * Math.cos(ps)) * c, r * Math.sin(ps), (R + r * Math.cos(ps)) * sn]; }, o.rows || 32, o.seg || 10, { axis: function (a) { var ph = a * 2 * PI; return [R * Math.cos(ph), 0, R * Math.sin(ph)]; } });
  }
  // coroa: parede com `teeth` pontas (borda de cima em zigue-zague); aberta em cima, dos dois lados
  function crown(o) {
    var R = o.R, H0 = o.H0, H1 = o.H1, teeth = o.teeth || 5, flare = o.flare || 0;
    return gridMesh(function (a, b) { var w = Math.abs(((b * teeth) % 1) * 2 - 1), h = a * (H0 + H1 * (1 - w)), rr = R + flare * a, ang = b * 2 * PI; return [rr * Math.cos(ang), h, rr * Math.sin(ang)]; },
      o.rows || 4, o.seg || 60, { two: true, axis: function (a, b) { return [0, a * (H0 + H1 * 0.5), 0]; } });
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
  /* Peças repetidas (pétalas, contas, listras, rebites) numa malha só: várias cópias de uma forma, cada uma com posição (t), giro (r) e tamanho (s)
   * no referencial do corpo, viram UMA malha. Assim uma roupa com dezenas de florzinhas continua com poucos desenhos por quadro (celular fraco agradece).
   * O giro segue a mesma ordem de Core.mTRS, então uma cópia aqui fica igual a uma peça solta com os mesmos t, r e s. */
  function unitBall(lat, lon) {
    var nv = (lat + 1) * (lon + 1), pos = new Float32Array(nv * 3), idx = new Uint16Array(lat * lon * 6), p = 0, k = 0, i, j;
    for (i = 0; i <= lat; i++) { var u = -PI / 2 + PI * i / lat; for (j = 0; j <= lon; j++) { var v = -PI + 2 * PI * j / lon; pos[p] = Math.cos(u) * Math.cos(v); pos[p + 1] = Math.sin(u); pos[p + 2] = Math.cos(u) * Math.sin(v); p += 3; } }
    for (i = 0; i < lat; i++) for (j = 0; j < lon; j++) { var i0 = i * (lon + 1) + j, i1 = i0 + 1, i2 = i0 + lon + 1, i3 = i2 + 1; idx[k++] = i0; idx[k++] = i2; idx[k++] = i1; idx[k++] = i1; idx[k++] = i2; idx[k++] = i3; }
    return { pos: pos, nor: pos, idx: idx, count: idx.length };                   // esfera de raio 1: a normal é a própria posição
  }
  var BALL = unitBall(5, 8), BALL_P = unitBall(3, 6), BALL_G = unitBall(10, 16);   // bolinha comum, pequenina (pétala, conta) e grande (asa)
  function merge(items) {
    var nv = 0, ni = 0; items.forEach(function (it) { nv += it.g.pos.length / 3; ni += it.g.idx.length; });
    var pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint16Array(ni), o = 0, oi = 0;
    items.forEach(function (it) {
      var g = it.g, t = it.t || [0, 0, 0], r = it.r || [0, 0, 0], s = it.s || [1, 1, 1], base = o / 3, k;
      var cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
      var a = cy * cz + sy * sx * sz, b = -cy * sz + sy * sx * cz, c = sy * cx, d = cx * sz, e = cx * cz, f = -sx, gg = -sy * cz + cy * sx * sz, h = sy * sz + cy * sx * cz, ii = cy * cx;
      for (k = 0; k < g.pos.length; k += 3) {
        var x = g.pos[k] * s[0], y = g.pos[k + 1] * s[1], z = g.pos[k + 2] * s[2], nx = g.nor[k] / s[0], ny = g.nor[k + 1] / s[1], nz = g.nor[k + 2] / s[2];
        pos[o] = a * x + b * y + c * z + t[0]; pos[o + 1] = d * x + e * y + f * z + t[1]; pos[o + 2] = gg * x + h * y + ii * z + t[2];
        var mx = a * nx + b * ny + c * nz, my = d * nx + e * ny + f * nz, mz = gg * nx + h * ny + ii * nz, l = Math.sqrt(mx * mx + my * my + mz * mz) || 1;
        nor[o] = mx / l; nor[o + 1] = my / l; nor[o + 2] = mz / l; o += 3;
      }
      for (k = 0; k < g.idx.length; k++) idx[oi++] = g.idx[k] + base;
    });
    return { pos: pos, nor: nor, idx: idx, count: idx.length };
  }
  // kit: monta uma roupa com peças soltas (add) e grupos de cópias da mesma cor (group -> lista onde se põem as cópias; vira uma malha em done)
  function kit() {
    var k = { meshes: {}, parts: [], groups: [] };
    k.add = function () { for (var i = 0; i < arguments.length; i++) k.parts.push(arguments[i]); };
    k.group = function (id, color, flat) { var g = { id: id, items: [] }; k.groups.push(g); k.parts.push({ id: id, mesh: id, color: color, flat: !!flat }); return g.items; };
    k.done = function () { k.groups.forEach(function (g) { k.meshes[g.id] = merge(g.items); }); return { meshes: k.meshes, parts: k.parts }; };
    return k;
  }
  function other(body, list, not) { return pick(body, list.filter(function (c) { return c !== not; })); }       // segunda cor: a melhor que não seja a primeira
  function flower(list, x, y, z, R, s, g, spin) { for (var q = 0; q < 5; q++) { var a = (spin || 0) + q * 2 * PI / 5; list.push({ g: g || BALL_P, t: [x + R * Math.cos(a), y + R * Math.sin(a), z], s: [s, s, s * 0.5] }); } }
  var OUTFITS = [
    { id: 'capa-heroi', free: true, name: 'Capa de herói', emoji: '🦸',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#e5383b', '#7a4fd6', '#2f6fe4', '#2fa84f']);
        m.cape = belt(B, { y0: -0.8, y1: 0.52, v0: -PI - 0.1, v1: 0.1, s0: 1.8, s1: 1.1, drop: 0.06, zpush: 0.3, two: true, lat: 10, lon: 40 });
        m.collar = belt(B, { y0: 0.4, y1: 0.54, v0: -PI - 0.08, v1: 0.08, s0: 1.12, s1: 1.12, two: true, lat: 2, lon: 26 });
        parts.push({ id: 'capa', mesh: 'cape', color: c }, { id: 'capaGola', mesh: 'collar', color: shade(c, -0.3) });
        [-1, 1].forEach(function (sd) { parts.push({ id: 'fecho' + (sd < 0 ? 'L' : 'R'), geom: 'sph', color: GOLD, t: [sd * 0.755, 0.34, front(B, sd * 0.755, 0.34) - 0.02], s: [0.085, 0.085, 0.065] }); });
        return { meshes: m, parts: parts };
      } },
    { id: 'cachecol', free: true, name: 'Cachecol de inverno', emoji: '🧣',
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
    { id: 'mago', free: true, name: 'Chapéu de mago', emoji: '🧙',
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
    { id: 'bailarina', free: true, name: 'Saia de bailarina', emoji: '🩰',
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
    { id: 'macacao', free: true, name: 'Macacão de jardineiro', emoji: '🧑‍🌾',
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
    ,
    // Natal (rodada tema-natal, 16/11/2026): grátis para todos. Gorro com aba e pompom brancos, casaco curto com cinto e fivela; o rosto fica livre.
    { id: 'papai-noel', free: true, name: 'Roupa de Papai Noel', emoji: '🎅',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#d62839', '#1f7a3a', '#2f6fe4']), H = 0.56, R = 0.39, TOP = 0.03, BEND = 0.34, hat = { t: [-0.2, 0.68, -0.02], r: [0, 0, 0.12] };
        m.hat = cone({ r: R, h: H, bend: BEND, top: TOP });
        m.coat = belt(B, { y0: -0.84, y1: -0.5, s0: 1.09, s1: 1.06, drop: 0.03, lat: 5, lon: 44 });
        m.belt = belt(B, { y0: -0.64, y1: -0.56, s0: 1.11, s1: 1.09, lat: 2, lon: 44 });
        parts.push({ id: 'gorro', mesh: 'hat', color: c, t: hat.t, r: hat.r }, { id: 'casaco', mesh: 'coat', color: c }, { id: 'cinto', mesh: 'belt', color: '#2b2d42' });
        parts.push({ id: 'gorroAba', geom: 'sph', color: WHITE, t: [hat.t[0], hat.t[1] + 0.02, hat.t[2]], r: hat.r, s: [0.47, 0.09, 0.47] });
        var cs = Math.cos(hat.r[2]), sn = Math.sin(hat.r[2]);
        parts.push({ id: 'pompom', geom: 'sph', color: WHITE, t: [hat.t[0] + BEND * cs - H * sn, hat.t[1] + BEND * sn + H * cs, hat.t[2]], s: [0.085, 0.085, 0.085] });
        var fz = front(B, 0, -0.6);
        parts.push({ id: 'fivela', geom: 'sph', color: GOLD, t: [0, -0.6, fz + 0.075], s: [0.12, 0.075, 0.035] }, { id: 'fivelaFuro', geom: 'sph', color: '#2b2d42', t: [0, -0.6, fz + 0.095], s: [0.06, 0.035, 0.02] });
        return { meshes: m, parts: parts };
      } }
    ,
    // Rodada roupas-novas (17/11/2026): 5 grátis e 15 com gemas, todas bem à mostra (como as asas de anjo); o rosto continua livre.
    { id: 'laco', free: true, name: 'Laço gigante', emoji: '🎀',
      make: function (B, body) {
        var parts = [], c = pick(body, ['#ff4f8b', '#e5383b', '#9b5de5', '#ffd23f']), d = shade(c, -0.25), X = 0.42, Y = 0.8;
        parts.push({ id: 'lacoAlcaE', geom: 'sph', color: c, t: [X - 0.26, Y + 0.1, 0.08], r: [0.1, 0, 0.45], s: [0.3, 0.19, 0.12] }, { id: 'lacoAlcaD', geom: 'sph', color: c, t: [X + 0.26, Y + 0.02, 0.08], r: [0.1, 0, -0.25], s: [0.3, 0.19, 0.12] });
        parts.push({ id: 'lacoDobraE', geom: 'sph', color: d, t: [X - 0.2, Y + 0.08, 0.17], r: [0.1, 0, 0.45], s: [0.12, 0.08, 0.04] }, { id: 'lacoDobraD', geom: 'sph', color: d, t: [X + 0.2, Y + 0.02, 0.17], r: [0.1, 0, -0.25], s: [0.12, 0.08, 0.04] });
        parts.push({ id: 'lacoGrandeNo', geom: 'sph', color: d, t: [X, Y + 0.05, 0.16], s: [0.1, 0.1, 0.1] });
        parts.push({ id: 'lacoPontaE', geom: 'sph', color: c, t: [X - 0.08, Y - 0.12, 0.2], r: [0, 0, 0.35], s: [0.06, 0.18, 0.03] }, { id: 'lacoPontaD', geom: 'sph', color: c, t: [X + 0.1, Y - 0.14, 0.2], r: [0, 0, -0.25], s: [0.06, 0.18, 0.03] });
        return { meshes: {}, parts: parts };
      } },
    { id: 'coroa-flores', free: true, name: 'Coroa de flores', emoji: '🌸',
      make: function (B, body) {
        var k = kit(), a = pick(body, ['#ff5fa2', '#ffffff', '#ffd23f']), b = other(body, ['#ffffff', '#ffd23f', '#ff5fa2'], a);
        var pA = k.group('floresA', a), pB = k.group('floresB', b), mi = k.group('floresMiolo', '#ff8a2a');
        for (var i = 0; i < 7; i++) { var ang = PI * (0.08 + 0.84 * i / 6), x = -0.62 * Math.cos(ang), z = 0.45 * Math.sin(ang) + 0.05, y = 0.76 + 0.04 * Math.sin(ang);
          flower(i % 2 ? pB : pA, x, y, z, 0.075, 0.065, BALL_P, i); mi.push({ g: BALL_P, t: [x, y, z + 0.03], s: [0.045, 0.045, 0.035] }); }
        [-1, 1].forEach(function (sd) { k.add({ id: 'floresFolha' + (sd < 0 ? 'L' : 'R'), geom: 'sph', color: '#2fa84f', t: [sd * 0.66, 0.72, 0.18], r: [0, 0, sd * 0.7], s: [0.11, 0.05, 0.03] }); });
        return k.done();
      } },
    { id: 'chapeu-palha', free: true, name: 'Chapéu de palha', emoji: '👒',
      make: function (B, body) {
        var k = kit(), straw = pick(body, ['#e9c46a', '#fff1c9', '#c98b3f']), h = { t: [-0.1, 0.66, -0.02], r: [0, 0, 0.08] };
        k.add({ id: 'palhaAba', geom: 'sph', color: straw, t: [h.t[0], h.t[1] + 0.02, h.t[2]], r: h.r, s: [1.0, 0.045, 0.82] });
        k.meshes.copa = cone({ r: 0.44, h: 0.3, top: 0.34, seg: 36, rows: 5 }); k.meshes.fita = cone({ r: 0.445, h: 0.1, top: 0.43, seg: 36, rows: 2 });
        k.add({ id: 'palhaCopa', mesh: 'copa', color: shade(straw, 0.08), t: h.t, r: h.r }, { id: 'palhaFita', mesh: 'fita', color: '#d62828', t: h.t, r: h.r });
        k.add({ id: 'palhaTopo', geom: 'sph', color: shade(straw, 0.08), t: [h.t[0] - 0.03, h.t[1] + 0.3, h.t[2]], r: h.r, s: [0.34, 0.06, 0.34] });
        var rem = k.group('palhaRemendos', '#2a9d8f', true), rem2 = k.group('palhaRemendos2', '#f4a261', true);
        [[-0.22, 0.17, rem], [0.05, 0.2, rem2], [0.25, 0.14, rem]].forEach(function (p, i) { p[2].push({ g: BALL, t: [h.t[0] + p[0], h.t[1] + p[1], 0.4], r: [0, 0, 0.4 * i], s: [0.06, 0.06, 0.015] }); });
        return k.done();
      } },
    { id: 'gorro-la', free: true, name: 'Gorro de lã', emoji: '🧶',
      make: function (B, body) {
        var k = kit(), c = pick(body, ['#e5383b', '#2fa84f', '#ff8a2a', '#7a4fd6']);
        k.meshes.gorro = belt(B, { y0: 0.64, y1: 0.72, s0: 1.08, s1: 1.0, lat: 3, lon: 48 }); k.meshes.dobra = belt(B, { y0: 0.6, y1: 0.68, s0: 1.13, s1: 1.12, lat: 2, lon: 48 });
        k.add({ id: 'gorroLa', mesh: 'gorro', color: c }, { id: 'gorroDobra', mesh: 'dobra', color: '#ffffff' }, { id: 'gorroCopa', geom: 'sph', color: c, t: [0, 0.71, 0], s: [0.68, 0.24, 0.57] });
        var lis = k.group('gorroListras', shade(c, -0.25), true);
        for (var i = 0; i < 7; i++) { var x = -0.48 + i * 0.16, ry = Math.max(0.05, 1 - Math.pow(x / 0.68, 2) - Math.pow(0.08 / 0.24, 2)); lis.push({ g: BALL, t: [x, 0.79, 0.57 * Math.sqrt(ry) + 0.005], r: [-0.5, 0, 0], s: [0.028, 0.1, 0.01] }); }
        k.add({ id: 'gorroPompom', geom: 'sph', color: '#ffffff', t: [0, 1.0, 0], s: [0.19, 0.19, 0.19] });
        return k.done();
      } },
    { id: 'aniversario', free: true, name: 'Chapéu de aniversário', emoji: '🥳',
      make: function (B, body) {
        var k = kit(), a = pick(body, ['#ff5fa2', '#00bbf9', '#9b5de5']), b = other(body, ['#ffd23f', '#ffffff', '#2fa84f'], a), h = { t: [-0.25, 0.68, 0], r: [0, 0, 0.22] }, cs = Math.cos(h.r[2]), sn = Math.sin(h.r[2]), R = 0.3, H = 0.6;
        k.meshes.chapeu = cone({ r: R, h: H, top: 0.004, seg: 28, rows: 6 });
        k.add({ id: 'aniverChapeu', mesh: 'chapeu', color: a, t: h.t, r: h.r });
        var faixas = [];
        [1, 3].forEach(function (q) { var y0 = q * H / 4, r0 = R * (1 - q / 4) + 0.008, r1 = R * (1 - (q + 1) / 4) + 0.008; faixas.push({ g: cone({ r: r0, h: H / 4, top: r1, seg: 28, rows: 1 }), t: [h.t[0] - y0 * sn, h.t[1] + y0 * cs, h.t[2]], r: h.r }); });
        k.meshes.faixas = merge(faixas); k.add({ id: 'aniverFaixas', mesh: 'faixas', color: b });
        k.add({ id: 'aniverPompom', geom: 'sph', color: '#ffffff', t: [h.t[0] - (H + 0.02) * sn, h.t[1] + (H + 0.02) * cs, h.t[2]], s: [0.1, 0.1, 0.1] });
        var c1 = k.group('confetes1', '#ffd23f', true), c2 = k.group('confetes2', '#00bbf9', true), c3 = k.group('confetes3', '#ff5fa2', true);
        [[-0.75, 0.6], [0.7, 0.75], [0.85, 0.3], [-0.9, 0.15], [0.5, 1.0], [-0.55, 1.05]].forEach(function (p, i) { [c1, c2, c3][i % 3].push({ g: BALL_P, t: [p[0], p[1], 0.2], r: [0, 0, i], s: [0.045, 0.022, 0.01] }); });
        return k.done();
      } }
    ,
    { id: 'bandana', free: false, name: 'Bandana de pirata', emoji: '🏴‍☠️',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#e5383b', '#2f6fe4', '#2fa84f', '#7a4fd6']);
        m.band = belt(B, { y0: 0.6, y1: 0.7, s0: 1.05, s1: 1.05, lat: 3, lon: 48 });
        parts.push({ id: 'bandana', mesh: 'band', color: c });
        [[-0.27, 0.636], [0, 0.662], [0.27, 0.636]].forEach(function (d, i) { parts.push({ id: 'caveira' + i, geom: 'sph', color: '#ffffff', flat: true, t: [d[0], d[1], front(B, d[0], d[1]) * 1.05 + 0.02], s: [0.05, 0.05, 0.03] }); });
        parts.push({ id: 'no', geom: 'sph', color: shade(c, -0.25), t: [0.74, 0.62, 0.06], s: [0.09, 0.09, 0.08] });
        parts.push({ id: 'ponta1', geom: 'sph', color: c, t: [0.84, 0.5, 0.0], r: [0, 0, -0.5], s: [0.05, 0.17, 0.04] }, { id: 'ponta2', geom: 'sph', color: c, t: [0.78, 0.45, -0.14], r: [0, 0, -0.2], s: [0.05, 0.17, 0.04] });
        return { meshes: m, parts: parts };
      } },
    { id: 'gatinho', free: false, name: 'Orelhas e rabo de gatinho', emoji: '🐱',
      make: function (B, body) {
        var k = kit(), c = pick(body, ['#f4a261', '#ffffff', '#2b2d42', '#9c9c9c']), ear = cone({ r: 0.2, h: 0.36, top: 0.01, seg: 20, rows: 4 }), inner = cone({ r: 0.12, h: 0.26, top: 0.01, seg: 20, rows: 3 });
        var or = [], de = [];
        [-1, 1].forEach(function (sd) { or.push({ g: ear, t: [sd * 0.5, 0.6, 0], r: [0.15, 0, sd * -0.3], s: [1, 1, 0.55] }); de.push({ g: inner, t: [sd * 0.5, 0.63, 0.06], r: [0.15, 0, sd * -0.3], s: [1, 1, 0.4] }); });
        k.meshes.orelhas = merge(or); k.meshes.dentro = merge(de);
        k.add({ id: 'gatoOrelhas', mesh: 'orelhas', color: c }, { id: 'gatoDentro', mesh: 'dentro', color: '#ff9fbe' });
        var rabo = k.group('gatoRabo', c), ponta = k.group('gatoPonta', shade(c, c === '#ffffff' ? -0.15 : 0.35));
        for (var i = 0; i < 9; i++) { var a = i / 8; (i === 8 ? ponta : rabo).push({ g: BALL, t: [0.75 + 0.35 * Math.sin(a * 2.2), -0.55 + 0.9 * a, -0.45 - 0.15 * a], s: [0.08, 0.08, 0.08] }); }
        return k.done();
      } },
    { id: 'havaiano', free: false, name: 'Colar havaiano', emoji: '🌺',
      make: function (B, body) {
        var k = kit(), a = pick(body, ['#ff5fa2', '#ffd23f', '#ffffff']), b = other(body, ['#ffffff', '#ffd23f', '#b06cff', '#ff5fa2'], a);
        var pA = k.group('colarA', a), pB = k.group('colarB', b), mi = k.group('colarMiolo', '#ff8a2a'), hib = k.group('colarHibisco', '#e5383b');
        for (var i = 0; i < 8; i++) { var x = -0.64 + i * (1.28 / 7), y = -0.64 + 0.24 * Math.pow(x / 0.64, 2), z = front(B, x, y) + 0.05;
          flower(i % 2 ? pB : pA, x, y, z, 0.062, 0.058, BALL_P, i); mi.push({ g: BALL_P, t: [x, y, z + 0.03], s: [0.03, 0.03, 0.03] }); }
        flower(hib, -0.68, 0.7, 0.24, 0.085, 0.085, BALL, 0.3); mi.push({ g: BALL_P, t: [-0.68, 0.7, 0.3], s: [0.04, 0.04, 0.04] });
        return k.done();
      } },
    { id: 'medalha', free: false, name: 'Medalha de ouro', emoji: '🥇',
      make: function (B, body) {
        var k = kit(), fita = pick(body, ['#2f6fe4', '#e5383b', '#2fa84f']), gold = pick(body, ['#ffc933', '#ff8a2a', '#c0c7d6']), y0 = -0.64, z0 = front(B, 0, y0) + 0.07;
        var f = k.group('medalhaFita', fita);
        [-1, 1].forEach(function (sd) { var P0 = [sd * 0.78, -0.32], P1 = [sd * 0.08, -0.63], ang = Math.atan2(P1[1] - P0[1], P1[0] - P0[0]);
          for (var i = 0; i < 7; i++) { var a = i / 6, x = P0[0] + (P1[0] - P0[0]) * a, y = P0[1] + (P1[1] - P0[1]) * a; f.push({ g: BALL, t: [x, y, front(B, x, y) + 0.012], r: [0, 0, ang], s: [0.07, 0.034, 0.014] }); } });
        k.add({ id: 'medalhaDisco', geom: 'sph', color: gold, t: [0, y0, z0], s: [0.14, 0.14, 0.04] }, { id: 'medalhaBorda', geom: 'sph', color: shade(gold, -0.25), t: [0, y0, z0 - 0.012], s: [0.155, 0.155, 0.035] });
        k.add({ id: 'medalhaEstrela1', geom: 'sph', color: '#fff3b0', flat: true, t: [0, y0, z0 + 0.04], r: [0, 0, PI / 4], s: [0.06, 0.06, 0.01] }, { id: 'medalhaEstrela2', geom: 'sph', color: '#fff3b0', flat: true, t: [0, y0, z0 + 0.041], s: [0.06, 0.06, 0.01] });
        return k.done();
      } },
    { id: 'faixa-campeao', free: false, name: 'Faixa de campeão', emoji: '🏆',
      make: function (B, body) {
        var k = kit(), c = pick(body, ['#e5383b', '#2f6fe4', '#ffd23f']), gold = c === '#ffd23f' ? '#ffffff' : '#ffc933';
        var fx = k.group('faixaCampeao', c), P0 = [-0.76, 0.3], P1 = [-0.92, -0.8], P2 = [0.44, -0.64], at = function (a) { var u = 1 - a; return [u * u * P0[0] + 2 * u * a * P1[0] + a * a * P2[0], u * u * P0[1] + 2 * u * a * P1[1] + a * a * P2[1]]; };
        for (var i = 0; i < 16; i++) { var a = i / 15, p = at(a), q = at(Math.min(1, a + 0.02)), r0 = at(Math.max(0, a - 0.02)), ang = Math.atan2(q[1] - r0[1], q[0] - r0[0]); fx.push({ g: BALL, t: [p[0], p[1], front(B, p[0], p[1]) + 0.01], r: [0, 0, ang], s: [0.09, 0.075, 0.018] }); }
        var ro = k.group('faixaRoseta', gold), rc = at(0.42), rz = front(B, rc[0], rc[1]) + 0.05;
        for (var j = 0; j < 8; j++) { var an = j * PI / 4; ro.push({ g: BALL, t: [rc[0] + 0.095 * Math.cos(an), rc[1] + 0.095 * Math.sin(an), rz], s: [0.065, 0.065, 0.025] }); }
        k.add({ id: 'faixaRosetaMeio', geom: 'sph', color: shade(c, -0.25), t: [rc[0], rc[1], rz + 0.025], s: [0.075, 0.075, 0.03] });
        return k.done();
      } },
    { id: 'explorador', free: false, name: 'Chapéu de explorador', emoji: '🧭',
      make: function (B, body) {
        var k = kit(), kh = pick(body, ['#d9c08c', '#f2e6c9', '#8b5a2b']), h = { t: [-0.12, 0.64, -0.02], r: [0, 0, 0.06] }, red = pick(body, ['#e5383b', '#2f6fe4']);
        k.add({ id: 'explAba', geom: 'sph', color: shade(kh, -0.06), t: [h.t[0], h.t[1] + 0.02, h.t[2]], r: [0.05, 0, h.r[2]], s: [0.8, 0.04, 0.72] });
        k.meshes.copa = cone({ r: 0.42, h: 0.3, top: 0.3, seg: 32, rows: 4 }); k.meshes.fita = cone({ r: 0.425, h: 0.09, top: 0.41, seg: 32, rows: 2 });
        k.add({ id: 'explCopa', mesh: 'copa', color: kh, t: h.t, r: h.r }, { id: 'explFita', mesh: 'fita', color: '#6b4226', t: h.t, r: h.r });
        k.add({ id: 'explTopo', geom: 'sph', color: kh, t: [h.t[0] - 0.02, h.t[1] + 0.3, h.t[2]], s: [0.3, 0.07, 0.3] });
        k.meshes.lenco = belt(B, { y0: -0.62, y1: -0.52, s0: 1.08, s1: 1.08, lat: 2, lon: 44 });
        k.add({ id: 'explLenco', mesh: 'lenco', color: red }, { id: 'explNo', geom: 'sph', color: shade(red, -0.2), t: [0.14, -0.6, front(B, 0.14, -0.6) + 0.07], s: [0.08, 0.055, 0.05] });
        var bol = k.group('explBolinhas', '#ffffff', true);
        for (var i = 0; i < 6; i++) { var x = -0.5 + i * 0.2; if (Math.abs(x - 0.14) < 0.08) continue; bol.push({ g: BALL_P, t: [x, -0.57, front(B, x, -0.57) * 1.08 + 0.012], s: [0.02, 0.02, 0.008] }); }
        return k.done();
      } },
    { id: 'chef', free: false, name: 'Chapéu e avental de chef', emoji: '👨‍🍳',
      make: function (B, body) {
        var k = kit(), av = pick(body, ['#ffffff', '#2f6fe4']), W = '#ffffff';
        k.meshes.avental = belt(B, { y0: -0.86, y1: -0.54, v0: 0.5, v1: PI - 0.5, s0: 1.06, s1: 1.05, lat: 6, lon: 20 }); k.meshes.barra = belt(B, { y0: -0.56, y1: -0.5, v0: 0.48, v1: PI - 0.48, s0: 1.07, s1: 1.07, lat: 1, lon: 20 });
        k.add({ id: 'chefAvental', mesh: 'avental', color: av }, { id: 'chefBarra', mesh: 'barra', color: '#e5383b' });
        k.add({ id: 'chefBolso', geom: 'sph', color: shade(av, -0.1), t: [0, -0.7, front(B, 0, -0.7) + 0.05], s: [0.2, 0.08, 0.03] });
        k.meshes.toque = cone({ r: 0.36, h: 0.36, top: 0.4, seg: 32, rows: 4 }); k.add({ id: 'chefToque', mesh: 'toque', color: W, t: [-0.05, 0.62, -0.02] });
        var nv = k.group('chefNuvem', W); [[-0.18, 1.02], [0.18, 1.02], [0, 1.1], [-0.3, 0.95], [0.3, 0.95]].forEach(function (p) { nv.push({ g: BALL, t: [p[0] - 0.05, p[1], -0.02], s: [0.22, 0.17, 0.3] }); });
        var la = k.group('chefLacos', '#e5383b'); [-1, 1].forEach(function (sd) { la.push({ g: BALL, t: [sd * 0.64, -0.53, front(B, sd * 0.64, -0.53) + 0.04], s: [0.06, 0.05, 0.04] }); });
        return k.done();
      } },
    { id: 'capa-chuva', free: false, name: 'Capa de chuva com capuz', emoji: '☔',
      make: function (B, body) {
        var k = kit(), Y = pick(body, ['#ffd23f', '#2f6fe4']), btn = Y === '#ffd23f' ? '#2f6fe4' : '#ffd23f';
        k.meshes.capuz = belt(B, { y0: -0.3, y1: 0.74, v0: -PI - 0.78, v1: 0.78, s0: 1.12, s1: 1.07, lat: 8, lon: 40, two: true });
        k.meshes.capa = belt(B, { y0: -0.86, y1: -0.52, s0: 1.14, s1: 1.08, drop: 0.04, lat: 5, lon: 48 });
        k.add({ id: 'chuvaCapuz', mesh: 'capuz', color: Y }, { id: 'chuvaTopo', geom: 'sph', color: Y, t: [0, 0.74, -0.02], s: [0.66, 0.09, 0.56] }, { id: 'chuvaCapa', mesh: 'capa', color: Y });
        var bt = k.group('chuvaBotoes', btn); [-0.6, -0.74].forEach(function (y) { bt.push({ g: BALL, t: [0.12, y, front(B, 0.12, y) * 1.1 + 0.04], s: [0.045, 0.045, 0.03] }); });
        var go = k.group('chuvaGotas', '#7fd4ff'); [[-0.85, 0.6], [0.85, 0.75], [0.95, 0.2], [-0.95, 0.15]].forEach(function (p) { go.push({ g: BALL, t: [p[0], p[1], 0.1], s: [0.035, 0.055, 0.035] }); });
        return k.done();
      } },
    { id: 'saia-florida', free: false, name: 'Saia rodada florida', emoji: '🌼',
      make: function (B, body) {
        var k = kit(), c = pick(body, ['#ff5fa2', '#ffd23f', '#00bbf9', '#9b5de5']), fb = c === '#ffd23f' ? '#ff5fa2' : '#ffd23f';
        k.meshes.saia = belt(B, { y0: -0.84, y1: -0.52, s0: 1.75, s1: 1.08, drop: 0.06, wave: 0.06, wn: 9, two: true, lat: 7, lon: 60 });
        k.add({ id: 'saiaRodada', mesh: 'saia', color: c });
        var fA = k.group('saiaFloresA', '#ffffff', true), fB = k.group('saiaFloresB', fb, true);
        for (var i = 0; i < 8; i++) { var ang = 0.35 + i * (PI - 0.7) / 7, x = 1.25 * Math.cos(ang) * 0.92, z = 1.25 * Math.sin(ang) * 0.85 + 0.02, y = -0.72; flower(i % 2 ? fB : fA, x, y, z, 0.045, 0.04, BALL_P, i); }
        flower(fA, 0.64, 0.7, 0.28, 0.08, 0.075, BALL, 0.2); fB.push({ g: BALL, t: [0.64, 0.7, 0.32], s: [0.04, 0.04, 0.04] });
        return k.done();
      } },
    { id: 'mochila', free: false, name: 'Mochila escolar', emoji: '🎒',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#e5383b', '#ffd23f', '#2fa84f', '#2f6fe4']);
        parts.push({ id: 'mochilaBolsa', geom: 'sph', color: c, t: [0, 0.05, -0.62], s: [0.98, 0.86, 0.32] }, { id: 'mochilaTampa', geom: 'sph', color: shade(c, -0.2), t: [0, 0.6, -0.6], s: [0.7, 0.3, 0.3] }, { id: 'mochilaPega', geom: 'sph', color: shade(c, -0.35), t: [0, 0.95, -0.55], s: [0.16, 0.08, 0.06] });
        m.alcas = merge([{ g: belt(B, { y0: -0.55, y1: 0.45, v0: 0.3, v1: 0.6, s0: 1.06, s1: 1.06, lat: 14, lon: 3 }) }, { g: belt(B, { y0: -0.55, y1: 0.45, v0: PI - 0.6, v1: PI - 0.3, s0: 1.06, s1: 1.06, lat: 14, lon: 3 }) }]);
        parts.push({ id: 'mochilaAlcas', mesh: 'alcas', color: shade(c, -0.3) });
        m.fivelas = merge([-1, 1].map(function (sd) { return { g: BALL, t: [sd * 0.7, -0.27, front(B, sd * 0.7, -0.27) * 1.06 + 0.03], s: [0.06, 0.05, 0.03] }; }));
        parts.push({ id: 'mochilaFivelas', mesh: 'fivelas', color: '#ffc933' }, { id: 'mochilaChaveiro', geom: 'sph', color: '#ff5fa2', t: [0.6, -0.5, -0.6], s: [0.08, 0.08, 0.08] });
        return { meshes: m, parts: parts };
      } },
    { id: 'boia', free: false, name: 'Boia de patinho', emoji: '🦆',
      make: function (B, body) {
        var k = kit(), Y = pick(body, ['#ffd23f', '#ff8a2a', '#00bbf9']), Yb = Y === '#ffd23f' ? '#ff5fa2' : '#ffffff', H = -0.66;
        k.meshes.boia = ring({ R: 0.92, r: 0.17 }); k.add({ id: 'boiaAnel', mesh: 'boia', color: Y, t: [0, H, 0], s: [1, 1, 0.92] });
        var li = k.group('boiaListras', Yb); [0.3, 1.3, 2.3, 3.3, 4.3, 5.3].forEach(function (a) { li.push({ g: BALL, t: [0.95 * Math.cos(a), H, 0.87 * Math.sin(a)], r: [0, -a, 0], s: [0.06, 0.18, 0.18] }); });
        k.add({ id: 'boiaPato', geom: 'sph', color: Y, t: [0.6, -0.4, 0.74], s: [0.18, 0.18, 0.18] }, { id: 'boiaBico', geom: 'sph', color: '#ff8a2a', t: [0.64, -0.42, 0.92], s: [0.09, 0.05, 0.08] }, { id: 'boiaOlho', geom: 'sph', color: '#2b2d42', t: [0.54, -0.34, 0.88], s: [0.025, 0.03, 0.02] });
        return k.done();
      } },
    { id: 'chapeu-couro', free: false, name: 'Chapéu de couro do sertão', emoji: '🤠',
      make: function (B, body) {
        var k = kit(), le = pick(body, ['#8b5a2b', '#5c3a1a']), h = { t: [-0.05, 0.64, -0.04], r: [0, 0, 0] }, M = [h.t[0], h.t[1] + 0.02, 0.5];
        k.add({ id: 'couroAba', geom: 'sph', color: shade(le, -0.15), t: [h.t[0], h.t[1] + 0.02, h.t[2]], s: [0.84, 0.04, 0.7] });
        k.meshes.copa = cone({ r: 0.44, h: 0.26, top: 0.28, seg: 36, rows: 5 }); k.add({ id: 'couroCopa', mesh: 'copa', color: le, t: h.t, r: h.r });
        // a meia-lua (aba da frente virada para cima): meio disco, um pouco curvado como a testa, com a borda escura em volta
        var half = function (r0, r1, RX, RY) { return gridMesh(function (a, b) { var rr = r0 + (r1 - r0) * a, th = b * PI, x = RX * rr * Math.cos(th); return [x, RY * rr * Math.sin(th), -0.16 * (x / RX) * (x / RX)]; }, 4, 24, { two: true, outward: [0, 0.2, -1] }); };
        k.meshes.lua = half(0.04, 0.9, 0.7, 0.44); k.meshes.luaBorda = half(0.88, 1.0, 0.7, 0.44);
        k.add({ id: 'couroMeiaLua', mesh: 'lua', color: shade(le, 0.12), t: M, r: [-0.18, 0, 0] }, { id: 'couroMeiaLuaBorda', mesh: 'luaBorda', color: shade(le, -0.35), t: [M[0], M[1], M[2] - 0.004], r: [-0.18, 0, 0] });
        var es = k.group('couroEstrelas', '#ffd23f', true), cr = Math.cos(-0.18), sr = Math.sin(-0.18);
        [[-0.36, 0.16], [0, 0.3], [0.36, 0.16], [-0.18, 0.08], [0.18, 0.08]].forEach(function (p) { var x = p[0], y = p[1], z = -0.16 * (x / 0.7) * (x / 0.7) + 0.012;
          [0, PI / 4].forEach(function (rot) { es.push({ g: BALL_P, t: [M[0] + x, M[1] + y * cr - z * sr, M[2] + y * sr + z * cr], r: [-0.18, 0, rot], s: [0.045, 0.045, 0.008] }); }); });
        return k.done();
      } },
    { id: 'fones', free: false, name: 'Fones de ouvido', emoji: '🎧',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#2b2d42', '#e5383b', '#ffd23f']);
        m.arch = arcTube({ cy: 0.05, rx: 0.9, ry: 0.76, r: 0.04 });
        parts.push({ id: 'arco', mesh: 'arch', color: c });
        [-1, 1].forEach(function (sd) {
          var n = sd < 0 ? 'L' : 'R';
          parts.push({ id: 'concha' + n, geom: 'sph', color: c, t: [sd * 0.9, 0.05, 0], s: [0.11, 0.21, 0.21] }, { id: 'almofada' + n, geom: 'sph', color: shade(c, 0.4), t: [sd * 0.83, 0.05, 0], s: [0.05, 0.16, 0.16] });
        });
        return { meshes: m, parts: parts };
      } },
    { id: 'unicornio', free: false, name: 'Chifre de unicórnio', emoji: '🦄',
      make: function (B, body) {
        var k = kit(), gold = pick(body, ['#ffc933', '#ffffff', '#ff5fa2']);
        k.meshes.chifre = cone({ r: 0.15, h: 0.62, top: 0.005, seg: 20, rows: 8 }); k.add({ id: 'uniChifre', mesh: 'chifre', color: gold, t: [0, 0.68, 0.22], r: [0.35, 0, 0] });
        var sp = k.group('uniEspiral', shade(gold, 0.55)), c35 = Math.cos(0.35), s35 = Math.sin(0.35);
        for (var q = 0; q < 4; q++) { var hh = 0.1 + q * 0.12, rr = 0.15 * (1 - hh / 0.62) + 0.01; sp.push({ g: BALL, t: [0, 0.68 + hh * c35, 0.22 + hh * s35], r: [0.35, 0, 0.5], s: [rr, 0.014, rr] }); }
        var cores = ['#ff5fa2', '#ffd23f', '#00bbf9', '#9b5de5'], cr = cores.map(function (c, i) { return k.group('uniCrina' + i, c); });
        for (var i = 0; i < 12; i++) { var a = i / 11; cr[i % 4].push({ g: BALL, t: [-0.25 - 0.62 * Math.sin(a * 1.5), 0.82 - a * 0.95, -0.2 + 0.08 * Math.sin(a * 3)], s: [0.15, 0.15, 0.15] }); }
        var ore = k.group('uniOrelhas', pick(body, ['#ffffff', '#ffd6e0', '#9b5de5'])); [-1, 1].forEach(function (sd) { ore.push({ g: BALL, t: [sd * 0.42, 0.78, -0.05], r: [0, 0, sd * -0.4], s: [0.08, 0.16, 0.06] }); });
        return k.done();
      } },
    { id: 'borboleta', free: false, name: 'Asas de borboleta', emoji: '🦋',
      make: function (B, body) {
        var k = kit(), c = pick(body, ['#ff5fa2', '#ffb703', '#9b5de5', '#00bbf9']), c2 = other(body, ['#ffd166', '#ffffff', '#80ffdb'], c), dark = '#2b2d42';
        var asa = k.group('borbAsa', c), asa2 = k.group('borbAsaBaixo', shade(c, -0.15)), bor = k.group('borbBorda', shade(c, -0.45)), pon = k.group('borbPontos', c2), pon2 = k.group('borbPontosBrancos', '#ffffff'), ant = k.group('borbAntenas', dark);
        [-1, 1].forEach(function (sd) {
          asa.push({ g: BALL_G, t: [sd * 0.98, 0.42, -0.42], r: [0, sd * 0.35, sd * -0.55], s: [0.5, 0.4, 0.04] });
          asa2.push({ g: BALL_G, t: [sd * 0.9, -0.18, -0.4], r: [0, sd * 0.35, sd * 0.45], s: [0.34, 0.28, 0.04] });
          bor.push({ g: BALL_G, t: [sd * 0.98, 0.42, -0.445], r: [0, sd * 0.35, sd * -0.55], s: [0.54, 0.44, 0.03] });
          [[1.16, 0.58, 0.09], [0.92, 0.34, 0.07], [0.98, -0.2, 0.08], [1.2, 0.32, 0.05]].forEach(function (d, i) { (i % 2 ? pon2 : pon).push({ g: BALL, t: [sd * d[0], d[1], -0.36 + (d[0] - 0.9) * 0.25], s: [d[2], d[2], 0.02] }); });
          ant.push({ g: BALL, t: [sd * 0.2, 0.94, 0], r: [0, 0, sd * -0.35], s: [0.018, 0.2, 0.018] });
          asa.push({ g: BALL, t: [sd * 0.28, 1.12, 0], s: [0.06, 0.06, 0.06] });
        });
        return k.done();
      } },
    { id: 'cartola', free: false, name: 'Cartola e gravata-borboleta', emoji: '🎩',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#2b2d42', '#e5383b', '#7a4fd6']), bow = pick(body, ['#e5383b', '#ffd23f', '#2f6fe4']), hat = { t: [-0.15, 0.66, -0.02], r: [0, 0, 0.1] };
        m.hat = cone({ r: 0.36, h: 0.5, top: 0.33, seg: 32, rows: 6 }); m.ribbon = cone({ r: 0.365, h: 0.1, top: 0.363, rows: 2, seg: 32 });
        parts.push({ id: 'cartola', mesh: 'hat', color: c, t: hat.t, r: hat.r }, { id: 'fita', mesh: 'ribbon', color: bow, t: hat.t, r: hat.r });
        var cs = Math.cos(hat.r[2]), sn = Math.sin(hat.r[2]);
        parts.push({ id: 'topo', geom: 'sph', color: shade(c, 0.12), t: [hat.t[0] - 0.5 * sn, hat.t[1] + 0.5 * cs, hat.t[2]], r: hat.r, s: [0.335, 0.025, 0.335] });
        parts.push({ id: 'aba', geom: 'sph', color: shade(c, -0.15), t: [hat.t[0], hat.t[1] + 0.005, hat.t[2]], r: hat.r, s: [0.52, 0.04, 0.52] });
        var fz = front(B, 0, -0.6) + 0.07;
        parts.push({ id: 'gravataL', geom: 'sph', color: bow, t: [-0.12, -0.6, fz], r: [0, 0, 0.35], s: [0.12, 0.075, 0.05] }, { id: 'gravataR', geom: 'sph', color: bow, t: [0.12, -0.6, fz], r: [0, 0, -0.35], s: [0.12, 0.075, 0.05] }, { id: 'gravataNo', geom: 'sph', color: shade(bow, -0.3), t: [0, -0.6, fz + 0.01], s: [0.055, 0.055, 0.055] });
        return { meshes: m, parts: parts };
      } },
    { id: 'asas-anjo', free: false, name: 'Asas de anjo', emoji: '😇',
      make: function (B, body) {
        var m = {}, parts = [], gold = pick(body, ['#ffc933', '#ff7a45', '#7a4fd6']);
        m.halo = ring({ R: 0.3, r: 0.035 });
        parts.push({ id: 'aureola', mesh: 'halo', color: gold, t: [-0.05, 1.1, 0], r: [0.6, 0, 0.08] });
        [-1, 1].forEach(function (sd) {
          var n = sd < 0 ? 'L' : 'R';
          parts.push({ id: 'asa' + n, geom: 'sph', color: '#ffffff', t: [sd * 0.98, 0.32, -0.3], r: [0, 0, sd * -0.6], s: [0.15, 0.6, 0.3] }, { id: 'pena' + n, geom: 'sph', color: '#d7e8ff', t: [sd * 1.04, -0.04, -0.3], r: [0, 0, sd * -0.95], s: [0.12, 0.44, 0.24] });
        });
        return { meshes: m, parts: parts };
      } },
    { id: 'foguete', free: false, name: 'Mochila-foguete', emoji: '🚀',
      make: function (B, body) {
        var k = kit(), c = pick(body, ['#c0c7d6', '#ffd23f']), red = '#e5383b';
        var tubo = cone({ r: 0.17, h: 0.65, top: 0.17, seg: 24, rows: 3 }), ponta = cone({ r: 0.17, h: 0.22, top: 0.01, seg: 24, rows: 3 }), fogo = cone({ r: 0.16, h: 0.46, top: 0.01, seg: 20, rows: 3 }), fogo2 = cone({ r: 0.1, h: 0.32, top: 0.01, seg: 16, rows: 2 });
        var T = [], P = [], F = [], F2 = [], X = [];
        [-1, 1].forEach(function (sd) { var x = sd * 1.0, z = -0.25;
          T.push({ g: tubo, t: [x, -0.22, z] }); P.push({ g: ponta, t: [x, 0.43, z] }, { g: BALL, t: [x, 0.1, z], s: [0.18, 0.04, 0.18] });
          F.push({ g: fogo, t: [x, -0.23, z], r: [PI, 0, 0] }); F2.push({ g: fogo2, t: [x, -0.24, z + 0.01], r: [PI, 0, 0] });
          X.push({ g: BALL, t: [sd * 0.86, -0.1, -0.15], s: [0.12, 0.06, 0.14] }); });
        k.meshes.tanques = merge(T); k.meshes.pontas = merge(P); k.meshes.fogo = merge(F); k.meshes.fogo2 = merge(F2); k.meshes.cintos = merge(X);
        k.add({ id: 'fogTanques', mesh: 'tanques', color: c }, { id: 'fogPontas', mesh: 'pontas', color: red }, { id: 'fogFogo', mesh: 'fogo', color: '#ff8a2a', flat: true }, { id: 'fogFogoMeio', mesh: 'fogo2', color: '#ffd23f', flat: true }, { id: 'fogCintos', mesh: 'cintos', color: '#2b2d42' });
        return k.done();
      } },
    { id: 'coroa', free: false, name: 'Coroa real', emoji: '👑',
      make: function (B, body) {
        var m = {}, parts = [], c = pick(body, ['#ffc933', '#c0c7d6', '#b5179e']), cr = { t: [-0.2, 0.68, -0.02], r: [0, 0, 0.1] }, R = 0.36, H0 = 0.14, H1 = 0.22, cs = Math.cos(cr.r[2]), sn = Math.sin(cr.r[2]);
        m.crown = crown({ R: R, H0: H0, H1: H1, teeth: 5, flare: 0.04 });
        parts.push({ id: 'coroa', mesh: 'crown', color: c, t: cr.t, r: cr.r });
        var gemCol = ['#e5383b', '#2f6fe4', '#2fa84f', '#e5383b', '#2f6fe4'];
        for (var k = 0; k < 5; k++) {                                                                  // uma pedra em cada ponta
          var ang = 2 * PI * k / 5, x = (R + 0.035) * Math.cos(ang), y = H0 + H1 - 0.015, z = (R + 0.035) * Math.sin(ang);
          parts.push({ id: 'pedra' + k, geom: 'sph', color: gemCol[k], t: [cr.t[0] + x * cs - y * sn, cr.t[1] + x * sn + y * cs, cr.t[2] + z], s: [0.05, 0.05, 0.05] });
        }
        parts.push({ id: 'joia', geom: 'sph', color: '#2f6fe4', t: [cr.t[0] + (-0.06) * 0 - 0.07 * sn, cr.t[1] + 0.07 * cs, cr.t[2] + R + 0.05], s: [0.06, 0.06, 0.04] });
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
