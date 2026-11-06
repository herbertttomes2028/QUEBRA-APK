/* Mascote 3D, NÚCLEO: matrizes, geometria, expressões, reações e o "cérebro" que decide o que ele faz.
 * Não usa DOM nem WebGL: roda no navegador (window.MascotCore) e no Node (para os testes).
 * O desenho em si (WebGL) está em mascot.js. Nada aqui lê, grava ou envia dado de ninguém. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.MascotCore = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var PI = Math.PI;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function sgnpow(a, e) { return (a < 0 ? -1 : 1) * Math.pow(Math.abs(a), e); }

  /* ===================== matrizes 4x4 (coluna-maior, como o WebGL espera) ===================== */
  function mIdent(o) { for (var i = 0; i < 16; i++) o[i] = (i % 5 === 0) ? 1 : 0; return o; }
  function mMul(o, a, b) {                       // o = a * b (o não pode ser a nem b)
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      var s = 0; for (var k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  // o = T * R * S, com R = Ry(yaw) * Rx(pitch) * Rz(roll)
  function mTRS(o, tx, ty, tz, rx, ry, rz, sx, sy, sz) {
    var cx = Math.cos(rx), sxn = Math.sin(rx), cy = Math.cos(ry), syn = Math.sin(ry), cz = Math.cos(rz), szn = Math.sin(rz);
    var r00 = cy * cz + syn * sxn * szn, r01 = -cy * szn + syn * sxn * cz, r02 = syn * cx;
    var r10 = cx * szn, r11 = cx * cz, r12 = -sxn;
    var r20 = -syn * cz + cy * sxn * szn, r21 = syn * szn + cy * sxn * cz, r22 = cy * cx;
    o[0] = r00 * sx; o[1] = r10 * sx; o[2] = r20 * sx; o[3] = 0;
    o[4] = r01 * sy; o[5] = r11 * sy; o[6] = r21 * sy; o[7] = 0;
    o[8] = r02 * sz; o[9] = r12 * sz; o[10] = r22 * sz; o[11] = 0;
    o[12] = tx; o[13] = ty; o[14] = tz; o[15] = 1;
    return o;
  }
  // matriz normal (3x3 coluna-maior) = inversa transposta da parte 3x3 de m
  function mNormal(o, m) {
    var a00 = m[0], a10 = m[1], a20 = m[2], a01 = m[4], a11 = m[5], a21 = m[6], a02 = m[8], a12 = m[9], a22 = m[10];
    var c00 = a11 * a22 - a12 * a21, c01 = -(a10 * a22 - a12 * a20), c02 = a10 * a21 - a11 * a20;
    var c10 = -(a01 * a22 - a02 * a21), c11 = a00 * a22 - a02 * a20, c12 = -(a00 * a21 - a01 * a20);
    var c20 = a01 * a12 - a02 * a11, c21 = -(a00 * a12 - a02 * a10), c22 = a00 * a11 - a01 * a10;
    var det = a00 * c00 + a01 * c01 + a02 * c02; if (Math.abs(det) < 1e-9) det = 1e-9;
    var id = 1 / det;
    o[0] = c00 * id; o[1] = c10 * id; o[2] = c20 * id;
    o[3] = c01 * id; o[4] = c11 * id; o[5] = c21 * id;
    o[6] = c02 * id; o[7] = c12 * id; o[8] = c22 * id;
    return o;
  }
  function mPerspective(o, fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2);
    for (var i = 0; i < 16; i++) o[i] = 0;
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) / (near - far); o[11] = -1; o[14] = 2 * far * near / (near - far);
    return o;
  }
  function mTransformPoint(m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  }

  /* ===================== geometria ===================== */
  // Superelipsoide: e = 1 é uma esfera/elipsoide; e < 1 vira um "cubo arredondado" (a peça de quebra-cabeça).
  function superEllipsoid(rx, ry, rz, e, lat, lon) {
    var nv = (lat + 1) * (lon + 1), pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint16Array(lat * lon * 6), p = 0, k = 0;
    for (var i = 0; i <= lat; i++) {
      var u = -PI / 2 + PI * i / lat, cu = Math.cos(u), su = Math.sin(u);
      for (var j = 0; j <= lon; j++) {
        var v = -PI + 2 * PI * j / lon, cv = Math.cos(v), sv = Math.sin(v);
        pos[p] = rx * sgnpow(cu, e) * sgnpow(cv, e); pos[p + 1] = ry * sgnpow(su, e); pos[p + 2] = rz * sgnpow(cu, e) * sgnpow(sv, e);
        var nx = sgnpow(cu, 2 - e) * sgnpow(cv, 2 - e) / rx, ny = sgnpow(su, 2 - e) / ry, nz = sgnpow(cu, 2 - e) * sgnpow(sv, 2 - e) / rz;
        var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nor[p] = nx / l; nor[p + 1] = ny / l; nor[p + 2] = nz / l; p += 3;
      }
    }
    for (var a = 0; a < lat; a++) for (var b = 0; b < lon; b++) {
      var i0 = a * (lon + 1) + b, i1 = i0 + 1, i2 = i0 + lon + 1, i3 = i2 + 1;
      idx[k++] = i0; idx[k++] = i2; idx[k++] = i1; idx[k++] = i1; idx[k++] = i2; idx[k++] = i3;
    }
    return { pos: pos, nor: nor, idx: idx, count: idx.length };
  }

  /* O corpo: um cubo arredondado, de peça de quebra-cabeça. faceZ(x, y) é a profundidade da frente do rosto (onde ficam olhos, boca etc.). */
  var BODY = { rx: 0.80, ry: 0.72, rz: 0.68, e: 0.62 };
  function faceZ(x, y) {
    var n = 2 / BODY.e;
    var t = 1 - Math.pow(Math.abs(x / BODY.rx), n) - Math.pow(Math.abs(y / BODY.ry), n);
    return BODY.rz * Math.pow(Math.max(t, 0), 1 / n);
  }
  function makeGeometries() {
    return { body: superEllipsoid(BODY.rx, BODY.ry, BODY.rz, BODY.e, 18, 28), sph: superEllipsoid(1, 1, 1, 1, 12, 16) };
  }

  /* A boca: uma tira dinâmica que acompanha a curvatura do rosto. sorriso -1..1, abertura 0..1, largura ~0.5..1.3. */
  var MOUTH_N = 17;
  function buildMouth(posMouth, posTongue, p) {
    var w = 0.17 * clamp(p.mouthW, 0.3, 1.5), open = clamp(p.mouthOpen, 0, 1.1), sm = clamp(p.mouthSmile, -1, 1), cy = -0.235, tongue = open > 0.35;
    for (var i = 0; i < MOUTH_N; i++) {
      var s = -1 + 2 * i / (MOUTH_N - 1), x = s * w, edge = Math.pow(Math.max(0, 1 - s * s), 0.5), c = cy + sm * 0.075 * s * s;
      var yU = c + 0.008 * edge, od = open * 0.2 * Math.pow(Math.max(0, 1 - s * s), 0.7), yL = c - 0.016 * edge - od;
      var o = i * 6;
      posMouth[o] = x; posMouth[o + 1] = yU; posMouth[o + 2] = faceZ(x, yU) + 0.018;
      posMouth[o + 3] = x; posMouth[o + 4] = yL; posMouth[o + 5] = faceZ(x, yL) + 0.018;
      var ts = s * 0.62, tx = ts * w, tc = cy + sm * 0.075 * ts * ts, tod = open * 0.2 * Math.pow(Math.max(0, 1 - ts * ts), 0.7);
      var tB = tc - 0.016 * Math.pow(Math.max(0, 1 - ts * ts), 0.5) - tod * 0.96, tT = tB + tod * 0.55;
      posTongue[o] = tx; posTongue[o + 1] = tT; posTongue[o + 2] = faceZ(tx, tT) + 0.024;
      posTongue[o + 3] = tx; posTongue[o + 4] = tB; posTongue[o + 5] = faceZ(tx, tB) + 0.024;
    }
    return tongue;
  }
  /* O traço do olho fechado: um arco fino que sobe nas pontas quando está feliz (∩) e fica reto quando pisca. Só existe com o olho quase fechado. */
  function buildLash(pos, side, p) {
    var open = side < 0 ? p.eyeL : p.eyeR, k = clamp((1 - open - 0.8) / 0.2, 0, 1), ex = side * 0.31, ey = 0.12, rx = 0.15, curve = clamp(p.mouthSmile, -0.5, 1) * 0.9;
    for (var i = 0; i < MOUTH_N; i++) {
      var s = -1 + 2 * i / (MOUTH_N - 1), x = ex + s * rx, edge = Math.pow(Math.max(0, 1 - s * s), 0.5), y = ey - 0.01 + curve * 0.065 * (1 - s * s), th = 0.027 * k * (0.5 + 0.5 * edge), z = faceZ(x, y) + 0.155, o = i * 6;
      pos[o] = x; pos[o + 1] = y + th; pos[o + 2] = z; pos[o + 3] = x; pos[o + 4] = y - th; pos[o + 5] = z;
    }
    return k > 0.02;
  }
  function mouthIndices() {
    var idx = new Uint16Array((MOUTH_N - 1) * 6), k = 0;
    for (var i = 0; i < MOUTH_N - 1; i++) { var a = i * 2; idx[k++] = a; idx[k++] = a + 1; idx[k++] = a + 2; idx[k++] = a + 2; idx[k++] = a + 1; idx[k++] = a + 3; }
    return idx;
  }

  /* ===================== a pose (todos os números que descrevem o corpo e o rosto) ===================== */
  // [valor inicial, rigidez da mola, amortecimento (1 = crítico, menor = balança um pouco)]
  var SPEC = {
    yaw: [0, 150, 0.62], pitch: [0, 150, 0.62], roll: [0, 150, 0.55], hop: [0, 260, 0.5], sx: [1, 300, 0.45], sy: [1, 300, 0.45], knob: [0, 90, 0.28],
    lookX: [0, 500, 0.8], lookY: [0, 500, 0.8],
    eyeL: [1, 520, 0.85], eyeR: [1, 520, 0.85], browL: [0, 380, 0.8], browR: [0, 380, 0.8], tiltL: [0, 380, 0.8], tiltR: [0, 380, 0.8],
    mouthW: [1, 420, 0.8], mouthOpen: [0.12, 420, 0.75], mouthSmile: [0.6, 420, 0.8], pupil: [1, 500, 0.9], blush: [0.1, 200, 0.9],
    armL: [0.25, 170, 0.45], armR: [0.25, 170, 0.45], armFL: [0, 170, 0.5], armFR: [0, 170, 0.5], thumb: [0, 300, 0.8]
  };
  var PARAMS = Object.keys(SPEC);
  var RANGE = {                                   // limites seguros: nada passa disso, venha de onde vier
    yaw: [-3.5, 7], pitch: [-0.8, 0.8], roll: [-0.8, 0.8], hop: [-0.1, 0.8], sx: [0.6, 1.4], sy: [0.6, 1.4], knob: [-1, 1], lookX: [-1.2, 1.2], lookY: [-1.2, 1.2],
    eyeL: [0, 1.3], eyeR: [0, 1.3], browL: [-1, 1.2], browR: [-1, 1.2], tiltL: [-1.2, 1.2], tiltR: [-1.2, 1.2], mouthW: [0.3, 1.5], mouthOpen: [0, 1.1], mouthSmile: [-1, 1],
    pupil: [0.5, 1.3], blush: [0, 1], armL: [0, 3.1], armR: [0, 3.1], armFL: [-0.2, 1.6], armFR: [-0.2, 1.6], thumb: [0, 1]
  };
  function defaults() { var o = {}; PARAMS.forEach(function (n) { o[n] = SPEC[n][0]; }); return o; }

  var EXPR = {
    neutral: {},
    happy: { browL: 0.25, browR: 0.25, mouthW: 1.1, mouthOpen: 0.3, mouthSmile: 0.9, blush: 0.35 },
    joy: { eyeL: 0, eyeR: 0, browL: 0.5, browR: 0.5, mouthW: 1.25, mouthOpen: 0.65, mouthSmile: 1, blush: 0.85 },
    wow: { eyeL: 1.2, eyeR: 1.2, browL: 1, browR: 1, mouthW: 0.5, mouthOpen: 1, mouthSmile: 0, pupil: 0.75 },
    think: { eyeL: 1, eyeR: 0.8, browL: 0.8, browR: -0.1, tiltL: 0.2, mouthW: 0.55, mouthOpen: 0, mouthSmile: -0.25 },
    determined: { eyeL: 0.85, eyeR: 0.85, browL: -0.2, browR: -0.2, tiltL: 0.9, tiltR: 0.9, mouthW: 1.1, mouthOpen: 0.3, mouthSmile: 0.5, pupil: 1.05 },
    sleepy: { eyeL: 0.3, eyeR: 0.3, browL: -0.35, browR: -0.35, mouthW: 0.6, mouthOpen: 0.05, mouthSmile: 0.05 },
    curious: { eyeL: 1.1, eyeR: 0.95, browL: 0.9, browR: 0.1, mouthW: 0.8, mouthOpen: 0.1, mouthSmile: 0.3 },
    wink: { eyeR: 0, browR: -0.1, mouthW: 1.1, mouthOpen: 0.25, mouthSmile: 0.95, blush: 0.3 },
    shy: { eyeL: 0.8, eyeR: 0.8, browL: 0.4, browR: 0.4, tiltL: -0.4, tiltR: -0.4, mouthW: 0.7, mouthOpen: 0.05, mouthSmile: 0.45, blush: 1 },
    dizzy: { eyeL: 1, eyeR: 1, browL: 0.3, browR: 0.3, mouthW: 0.8, mouthOpen: 0.4, mouthSmile: -0.1, pupil: 0.8 },
    proud: { eyeL: 0.9, eyeR: 0.9, browL: 0.45, browR: 0.45, mouthW: 1.15, mouthOpen: 0.45, mouthSmile: 1, blush: 0.5 },
    excited: { eyeL: 1.18, eyeR: 1.18, browL: 0.9, browR: 0.9, mouthW: 1.2, mouthOpen: 0.85, mouthSmile: 1, blush: 0.6, pupil: 1.1 },
    worried: { eyeL: 1, eyeR: 1, browL: 0.5, browR: 0.5, tiltL: -0.8, tiltR: -0.8, mouthW: 0.7, mouthOpen: 0.1, mouthSmile: -0.55 }
  };

  /* ===================== as reações ===================== */
  // run(t, u, T, A, ctx): t = segundos desde o início, u = 0..1 do progresso.
  // T = alvos (as molas suavizam), A = somas diretas (para vaivéns rápidos), ctx.look = {x, y} para olhar para outro lado, ctx.expr = troca de expressão no meio.
  function sw(t, hz, amp) { return Math.sin(t * hz * 2 * PI) * amp; }
  function env(u) { return Math.max(0, 1 - u); }                       // some devagar no fim
  var REACTIONS = {
    tapHappy: { dur: 1.1, prio: 2, expr: 'happy', run: function (t, u, T, A) { A.hop = Math.abs(Math.sin(u * PI * 2)) * 0.13 * env(u); A.sy = -0.05 * Math.abs(Math.sin(u * PI * 2)); T.armR = 2.35; A.armR = sw(t, 2.6, 0.3); A.roll = sw(t, 1.6, 0.05) * env(u); } },
    tapGiggle: { dur: 1.3, prio: 2, expr: 'joy', run: function (t, u, T, A) { A.roll = sw(t, 6, 0.1) * env(u); A.sy = sw(t, 6, 0.03) * env(u); T.blush = 0.9; T.armL = 0.9; T.armR = 0.9; T.armFL = 0.5; T.armFR = 0.5; } },
    tapSurprise: { dur: 1.0, prio: 2, expr: 'wow', run: function (t, u, T, A) { A.hop = 0.2 * Math.sin(clamp(u * 2.5, 0, 1) * PI); T.armL = 1.95; T.armR = 1.95; A.sy = 0.05 * Math.sin(clamp(u * 2.5, 0, 1) * PI); } },
    tapShy: { dur: 1.4, prio: 2, expr: 'shy', run: function (t, u, T, A, ctx) { T.armL = 1.1; T.armR = 1.1; T.armFL = 1.0; T.armFR = 1.0; A.roll = sw(t, 1.2, 0.08); ctx.look = { x: -ctx.dirX * 0.8, y: 0.45 }; T.pitch = 0.1; } },
    tapDizzy: { dur: 1.9, prio: 2, expr: 'dizzy', run: function (t, u, T, A, ctx) { A.yaw = sw(t, 1.7, 0.5) * (u < 0.85 ? 1 : 0.2); A.roll = sw(t, 2.2, 0.12); ctx.look = { x: Math.cos(t * 9) * 0.85, y: Math.sin(t * 9) * 0.85 }; if (u > 0.8) ctx.expr = 'sleepy'; } },
    goodPiece: { dur: 1.6, prio: 2, expr: 'proud', run: function (t, u, T, A, ctx) {            // olha para o botão, depois olha para o jogador: "boa escolha!"
        if (u > 0.2) ctx.look = { x: 0, y: -0.05 };
        if (u > 0.28 && u < 0.78) ctx.expr = 'wink';
        T.armR = 0.95; T.armFR = 1.15; T.thumb = u > 0.22 ? 1 : 0; A.pitch = (u > 0.2 && u < 0.7) ? sw(t, 3.4, 0.11) : 0; A.hop = Math.max(0, Math.sin(clamp((u - 0.2) * 3, 0, 1) * PI)) * 0.05;
      } },
    nod: { dur: 0.95, prio: 2, expr: 'happy', run: function (t, u, T, A) { A.pitch = sw(t, 3.4, 0.17) * env(u); } },
    nodSmall: { dur: 0.5, prio: 2, expr: 'happy', run: function (t, u, T, A) { A.pitch = sw(t, 3.6, 0.1) * env(u); A.hop = Math.sin(u * PI) * 0.025; } },
    shakeNo: { dur: 1.0, prio: 2, expr: 'worried', run: function (t, u, T, A) { A.yaw = sw(t, 3.6, 0.3) * env(u); } },
    wave: { dur: 1.7, prio: 2, expr: 'happy', run: function (t, u, T, A) { T.armR = 2.5; A.armR = sw(t, 2.3, 0.4); A.roll = sw(t, 1.1, 0.05); } },
    cheer: { dur: 2.4, prio: 3, expr: 'excited', run: function (t, u, T, A) { T.armL = 2.85; T.armR = 2.85; A.armL = sw(t, 2.4, 0.2); A.armR = -sw(t, 2.4, 0.2); A.hop = Math.abs(Math.sin(u * PI * 4)) * 0.2 * (u < 0.9 ? 1 : 0.3); } },
    celebrate: { dur: 3.4, prio: 3, expr: 'joy', run: function (t, u, T, A, ctx) {                  // subir de nível: pulo, giro de 360° e braços para cima
        A.hop = Math.abs(Math.sin(u * PI * 5)) * 0.24 * (u < 0.85 ? 1 : 0.3); T.armL = 2.9; T.armR = 2.9; A.armL = sw(t, 2.6, 0.18); A.armR = -sw(t, 2.6, 0.18);
        A.yaw = u < 0.34 ? (u / 0.34) * 2 * PI : 0; if (u > 0.4) ctx.expr = 'excited';
      } },
    proud: { dur: 1.7, prio: 2, expr: 'proud', run: function (t, u, T, A, ctx) { T.pitch = -0.1; T.armR = 0.95; T.armFR = 1.15; T.thumb = 1; if (u > 0.25 && u < 0.7) ctx.expr = 'wink'; A.pitch = sw(t, 3, 0.05); } },
    curious: { dur: 1.5, prio: 2, expr: 'curious', run: function (t, u, T) { T.roll = 0.16; T.pitch = -0.05; } },
    determined: { dur: 1.3, prio: 2, expr: 'determined', run: function (t, u, T, A) { T.armR = 1.35; T.armFR = 0.75; A.hop = Math.max(0, Math.sin(clamp(u * 2.5, 0, 1) * PI)) * 0.09; A.sy = -0.03 * Math.sin(clamp(u * 2.5, 0, 1) * PI); } },
    excitedHop: { dur: 1.2, prio: 2, expr: 'excited', run: function (t, u, T, A) { A.hop = Math.abs(Math.sin(u * PI * 3)) * 0.16 * env(u * 0.6); T.armL = 1.6; T.armR = 1.6; } },
    nearly: { dur: 2.0, prio: 2, expr: 'excited', run: function (t, u, T, A) { T.armFL = 0.6; T.armFR = 0.6; T.armL = 0.55; T.armR = 0.55; T.mouthW = 0.65; T.mouthOpen = 0.15; A.hop = sw(t, 7, 0.012) + Math.abs(Math.sin(u * PI * 2)) * 0.05; } },
    yawn: { dur: 2.3, prio: 1, expr: 'sleepy', run: function (t, u, T, A) { var k = Math.sin(clamp(u, 0, 1) * PI); T.mouthOpen = 1.0 * k; T.mouthW = 0.85; T.eyeL = 0.08; T.eyeR = 0.08; A.pitch = -0.12 * k; A.sy = 0.04 * k; } },
    wake: { dur: 0.9, prio: 2, expr: 'wow', run: function (t, u, T, A) { A.hop = 0.15 * Math.sin(clamp(u * 2, 0, 1) * PI); T.armL = 1.5; T.armR = 1.5; } },
    lookThink: { dur: 1.7, prio: 2, expr: 'think', run: function (t, u, T) { T.roll = -0.07; T.armR = 0.7; T.armFR = 0.5; } },
    hopeful: { dur: 1.7, prio: 1, expr: 'happy', run: function (t, u, T, A) { A.hop = Math.abs(Math.sin(u * PI * 2)) * 0.06 * env(u); T.armL = 0.6; T.armFL = 0.6; T.armR = 0.6; T.armFR = 0.6; } }
  };

  // botão da tela inicial -> reação
  var PRESS_MAP = { play: 'goodPiece', duel: 'determined', continue: 'nod', join: 'nod', friends: 'wave', settings: 'curious', help: 'curious', me: 'wave', codeFocus: 'lookThink', codeType: 'nodSmall', codeFull: 'excitedHop' };
  var EVENT_MAP = { win: 'cheer', levelup: 'celebrate', achievement: 'proud', nearly: 'nearly' };
  var TAP_SEQUENCE = ['tapHappy', 'tapGiggle', 'tapSurprise', 'tapShy', 'tapDizzy'];

  /* ===================== o cérebro ===================== */
  function createBrain(opts) {
    opts = opts || {};
    var rng = opts.rng || Math.random, clock = opts.now || function () { return Date.now(); };
    var P = defaults(), V = {}, T = defaults(), A = {}, out = defaults(), last = defaults();
    PARAMS.forEach(function (n) { V[n] = 0; A[n] = 0; });
    var cur = null, queued = null, delayed = null, pending = null, exprName = 'neutral';
    var idle = 0, sleeping = false, yawned = false, nextGesture = 14 + rng() * 10, nextBlink = 1.5 + rng() * 2.5, blinkT = -1, doubleBlink = false;
    var tapCount = 0, tapAt = -99, cooldown = 0, now = 0, active = true, reduced = false, continueVisible = false, changed = true;
    var ptr = { x: 0, y: 0, down: false, at: -99 }, hold = null, wander = { x: 0, y: 0, until: 0 };

    function setExpr(T, name) { var e = EXPR[name] || EXPR.neutral; for (var k in e) if (e.hasOwnProperty(k)) T[k] = e[k]; }
    function reset(o, base) { PARAMS.forEach(function (n) { o[n] = base ? SPEC[n][0] : 0; }); }
    function start(name, extra) {
      var R = REACTIONS[name]; if (!R) return false;
      if (cur && cur.prio > R.prio) return false;
      if (cur && cur.name === name && cur.t < 0.25) return false;                // não reinicia por toque duplicado
      cur = { name: name, t: 0, dur: R.dur, prio: R.prio, extra: extra || {} };
      return true;
    }
    function wakeUp() { if (sleeping) { sleeping = false; start('wake'); return true; } return false; }
    function touched() { idle = 0; yawned = false; nextGesture = 14 + rng() * 10; }

    var brain = {
      out: out,
      react: function (name, extra) { touched(); return start(name, extra); },
      tapMascot: function (gx, gy) {
        touched(); var woke = wakeUp(); ptr.x = gx || 0; ptr.y = gy || 0; ptr.at = now;
        if (now - tapAt > 6) tapCount = 0;
        tapAt = now; if (woke || cooldown > 0) return woke ? 'wake' : null;
        var name = TAP_SEQUENCE[Math.min(tapCount, TAP_SEQUENCE.length - 1)]; tapCount++;
        if (name === 'tapDizzy') { cooldown = 2.4; tapCount = 0; }
        start(name, { dirX: gx >= 0 ? 1 : -1 }); return name;
      },
      press: function (kind, gx, gy, extra) {
        touched(); var woke = wakeUp(); var name = PRESS_MAP[kind]; if (!name) return null;
        if (kind === 'join' || kind === 'enter') name = (extra && extra.codeReady) ? 'nod' : 'shakeNo';
        hold = { x: clamp(gx || 0, -1, 1), y: clamp(gy || 0, -1, 1), until: now + 0.35 };
        start(name, { dirX: (gx || 0) >= 0 ? 1 : -1 }); return woke ? 'wake+' + name : name;
      },
      pointer: function (gx, gy, down) { ptr.x = clamp(gx, -1, 1); ptr.y = clamp(gy, -1, 1); ptr.down = !!down; ptr.at = now; if (down) { touched(); wakeUp(); } },
      pointerEnd: function () { ptr.down = false; ptr.at = now; },
      note: function (ev) {
        var name = EVENT_MAP[ev]; if (!name) return false;
        if (active) { delayed = { name: name, wait: 0.35 }; } else pending = { name: name, at: clock() };
        return true;
      },
      activate: function () {
        active = true; touched();
        if (pending && clock() - pending.at <= 90000) delayed = { name: pending.name, wait: 0.6 };
        pending = null;
      },
      deactivate: function () { active = false; },
      setContinueVisible: function (b) { continueVisible = !!b; },
      setReduced: function (b) { reduced = !!b; changed = true; },
      isSleeping: function () { return sleeping; },
      isActive: function () { return active; },
      current: function () { return cur ? cur.name : null; },
      expression: function () { return exprName; },
      busy: function () { return !!(cur || delayed || blinkT >= 0 || ptr.down || (now - ptr.at) < 1.6 || hold); },
      consumeChanged: function () { var c = changed; changed = false; return c; },
      hasChanged: function () { return changed; },
      snapshot: function (name, u) {                                                      // uma pose parada de uma reação (para o modo estático e para as imagens de teste)
        var R = REACTIONS[name]; var t = {}, a = {}, ctx = { dirX: 1, look: null, expr: null };
        reset(t, true); reset(a, false); setExpr(t, R ? R.expr : name);
        if (R) { R.run(R.dur * u, u, t, a, ctx); if (ctx.expr) setExpr(t, ctx.expr); }
        var o = {}; PARAMS.forEach(function (n) { o[n] = clamp(t[n] + (R ? a[n] : 0), RANGE[n][0], RANGE[n][1]); });
        if (ctx.look) { o.lookX = clamp(ctx.look.x, -1, 1); o.lookY = clamp(-ctx.look.y, -1, 1); }
        return o;
      },
      tick: function (dt) {
        dt = clamp(dt, 0, 0.05); now += dt; if (cooldown > 0) cooldown -= dt;
        if (active) { idle += dt; }
        // atrasos (ex.: comemorar logo depois de a tela aparecer)
        if (delayed) { delayed.wait -= dt; if (delayed.wait <= 0) { var d = delayed; delayed = null; touched(); wakeUp(); cur = null; start(d.name); } }
        // idle: gestos, bocejo e sono
        if (!cur && !sleeping && active) {
          if (idle >= nextGesture && idle < 30) { var pool = ['wave', 'curious', 'excitedHop']; if (continueVisible) pool.push('hopeful', 'hopeful'); var g = pool[Math.floor(rng() * pool.length)]; nextGesture = idle + 12 + rng() * 10; start(g, { dirX: rng() < 0.5 ? 1 : -1 }); if (g === 'hopeful') hold = { x: 0, y: 0.35, until: now + 1.3 }; }
          else if (idle >= 30 && !yawned) { yawned = true; start('yawn'); }
          else if (idle >= 38) sleeping = true;
        }
        // alvos
        reset(T, true); reset(A, false); var ctx = { dirX: 1, look: null, expr: null };
        exprName = sleeping && !cur ? 'sleepy' : 'neutral';
        if (cur) {
          var R = REACTIONS[cur.name]; exprName = R.expr; ctx.dirX = cur.extra.dirX || 1;
          var tt = reduced ? cur.dur * 0.4 : cur.t, uu = tt / cur.dur;
          setExpr(T, exprName); R.run(tt, uu, T, A, ctx); if (ctx.expr) { exprName = ctx.expr; setExpr(T, ctx.expr); }
          cur.t += dt; if (cur.t >= cur.dur) { cur = null; if (hold && hold.until < now) hold = null; }
        } else setExpr(T, exprName);
        if (reduced) A = zero(A);
        // olhar: reação > botão tocado > dedo > passeio ocioso
        var look = ctx.look;
        if (!look && hold && now < hold.until + (cur ? 1.2 : 0)) look = { x: hold.x, y: hold.y };
        if (!look && (ptr.down || now - ptr.at < 1.4)) look = { x: ptr.x, y: ptr.y };
        if (!look) {
          if (now > wander.until) { wander.x = (rng() - 0.5) * 0.7; wander.y = (rng() - 0.5) * 0.4; wander.until = now + 1.5 + rng() * 2.5; }
          look = sleeping ? { x: 0, y: 0.3 } : wander;
        }
        T.lookX = look.x; T.lookY = -look.y; T.yaw += look.x * 0.3; T.pitch += look.y * 0.2;
        T.knob = -(T.roll + T.yaw * 0.15) * 0.9;
        // molas
        PARAMS.forEach(function (n) {
          if (reduced) { P[n] = T[n]; V[n] = 0; return; }
          var s = SPEC[n], k = s[1], c = 2 * Math.sqrt(k) * s[2], steps = dt > 0.025 ? 2 : 1, h = dt / steps;
          for (var i = 0; i < steps; i++) { V[n] += (k * (T[n] - P[n]) - c * V[n]) * h; P[n] += V[n] * h; }
        });
        // piscar
        if (!reduced) {
          nextBlink -= dt;
          if (blinkT < 0 && nextBlink <= 0) { blinkT = 0; doubleBlink = rng() < 0.15; nextBlink = 2 + rng() * 3.2; }
          if (blinkT >= 0) { blinkT += dt; if (blinkT > 0.17) { if (doubleBlink) { doubleBlink = false; blinkT = 0; } else blinkT = -1; } }
        } else blinkT = -1;
        var blink = blinkT >= 0 ? Math.sin(clamp(blinkT / 0.17, 0, 1) * PI) : 0;
        // saída (limitada)
        PARAMS.forEach(function (n) { out[n] = clamp(P[n] + A[n], RANGE[n][0], RANGE[n][1]); });
        if (!reduced) { out.sy = clamp(out.sy + Math.sin(now * 2.2) * 0.012, RANGE.sy[0], RANGE.sy[1]); out.eyeL *= (1 - blink); out.eyeR *= (1 - blink); }
        var diff = 0; PARAMS.forEach(function (n) { diff = Math.max(diff, Math.abs(out[n] - last[n])); last[n] = out[n]; });
        if (diff > 0.0005) changed = true;
        return out;
      }
    };
    function zero(o) { PARAMS.forEach(function (n) { o[n] = 0; }); return o; }
    return brain;
  }

  /* ===================== o modelo: quais peças existem e onde ficam ===================== */
  var C = { body: [0.23, 0.42, 1.0], dark: [0.106, 0.145, 0.349], white: [1, 1, 1], yellow: [1, 0.79, 0.2], pink: [1, 0.48, 0.66], tongue: [1, 0.42, 0.55] };
  var PART_DEFS = [   // id, geometria, cor, achatado (sem luz), contorno
    ['body', 'body', C.body, false, true], ['knob', 'sph', C.body, false, true],
    ['armL', 'sph', C.body, false, true], ['armR', 'sph', C.body, false, true], ['handL', 'sph', C.white, false, true], ['handR', 'sph', C.white, false, true], ['thumb', 'sph', C.white, false, false],
    ['footL', 'sph', C.yellow, false, true], ['footR', 'sph', C.yellow, false, true],
    ['eyeWL', 'sph', C.white, false, false], ['eyeWR', 'sph', C.white, false, false], ['pupL', 'sph', C.dark, true, false], ['pupR', 'sph', C.dark, true, false],
    ['hiL', 'sph', C.white, true, false], ['hiR', 'sph', C.white, true, false], ['lidL', 'sph', C.body, false, false], ['lidR', 'sph', C.body, false, false],
    ['lashL', 'lashL', C.dark, true, false], ['lashR', 'lashR', C.dark, true, false], ['browL', 'sph', C.dark, true, false], ['browR', 'sph', C.dark, true, false],
    ['cheekL', 'sph', C.pink, true, false], ['cheekR', 'sph', C.pink, true, false],
    ['mouth', 'mouth', C.dark, true, false], ['tongue', 'tongue', C.tongue, true, false]
  ];
  function makeParts() {
    var parts = [], byId = {};
    PART_DEFS.forEach(function (d) { var p = { id: d[0], geom: d[1], color: d[2], flat: d[3], outline: d[4], vis: true, M: new Float32Array(16), N: new Float32Array(9) }; parts.push(p); byId[d[0]] = p; });
    parts.byId = byId; return parts;
  }
  var tG = new Float32Array(16), tL = new Float32Array(16), tE = new Float32Array(16), tC = new Float32Array(16), tA = new Float32Array(16), tB = new Float32Array(16), tR = new Float32Array(16);
  function place(part, parent, local) { mMul(part.M, parent, local); mNormal(part.N, part.M); part.vis = true; }

  function computeParts(parts, p) {
    var by = parts.byId, sy = p.sy, sx = p.sx;
    mTRS(tG, 0, p.hop - BODY.ry * (1 - sy), 0, p.pitch, p.yaw, p.roll, sx, sy, sx);        // o corpo; o aperto/esticão fica preso aos pés
    place(by.body, tG, mIdent(tL));
    // o "dente" de peça de quebra-cabeça, com um balanço atrasado
    mTRS(tL, 0.24, BODY.ry + 0.07, -0.02, 0, 0, -0.22 + p.knob, 0.2, 0.18, 0.2); place(by.knob, tG, tL);
    // olhos e rosto
    for (var s = -1; s <= 1; s += 2) {
      var S = s < 0 ? 'L' : 'R', open = s < 0 ? p.eyeL : p.eyeR, brow = s < 0 ? p.browL : p.browR, tilt = s < 0 ? p.tiltL : p.tiltR;
      var ex = s * 0.31, ey = 0.12, ez = faceZ(ex, ey) - 0.01, yawE = s * 0.22;
      var kw = open > 1 ? 1 + (open - 1) * 0.6 : 1, kh = open > 1 ? 1 + (open - 1) * 0.8 : 1, rxE = 0.155 * kw, ryE = 0.2 * kh, rzE = 0.075;
      mTRS(tE, ex, ey, ez, 0, yawE, 0, 1, 1, 1); mMul(tC, tG, tE);                       // tC = referencial do olho (no mundo)
      mTRS(tL, 0, 0, 0, 0, 0, 0, rxE, ryE, rzE); place(by['eyeW' + S], tC, tL);
      var maxX = 0.058 * kw, maxY = 0.072 * kh, px = clamp(p.lookX, -1, 1) * maxX, py = clamp(p.lookY, -1, 1) * maxY;
      var pz = rzE * Math.sqrt(Math.max(0, 1 - (px / rxE) * (px / rxE) - (py / ryE) * (py / ryE))) + 0.012;
      mTRS(tL, px, py, pz, 0, 0, 0, 0.092 * p.pupil, 0.105 * p.pupil, 0.03); place(by['pup' + S], tC, tL);
      mTRS(tL, px + 0.03, py + 0.04, pz + 0.028, 0, 0, 0, 0.03, 0.03, 0.02); place(by['hi' + S], tC, tL);
      var cover = clamp(1 - open, 0, 1), edge = ryE - 2 * ryE * cover, top = ryE + 0.08, lc = (edge + top) / 2, lh = (top - edge) / 2;
      mTRS(tL, 0, lc, 0.035, 0, 0, 0, rxE * 1.12, lh, 0.1 * (0.3 + 0.7 * cover) * (cover > 0.85 ? 1 - (cover - 0.85) / 0.15 * 0.5 : 1)); place(by['lid' + S], tC, tL);
      if (cover >= 0.9) { by['pup' + S].vis = false; by['hi' + S].vis = false; }          // olho fechado: a pupila não aparece
      if (cover < 0.03) by['lid' + S].vis = false;                                         // olho aberto: sem a lasca da pálpebra
      if (cover >= 0.8) place(by['lash' + S], tG, mIdent(tL)); else by['lash' + S].vis = false;   // olho (quase) fechado: o traço curvo
      var bx = s * 0.31, byy = 0.12 + 0.2 + 0.1 + brow * 0.09, bz = faceZ(bx, byy) + 0.015;
      mTRS(tL, bx, byy, bz, 0, s * 0.2, s * tilt * 0.45, 0.13, 0.03, 0.035); place(by['brow' + S], tG, tL);
      var cb = clamp(p.blush, 0, 1);
      if (cb > 0.06) { var cx = s * 0.52, cyy = -0.1; mTRS(tL, cx, cyy, faceZ(cx, cyy) - 0.005, 0, s * 0.45, 0, 0.12 * cb, 0.07 * cb, 0.03); place(by['cheek' + S], tG, tL); } else by['cheek' + S].vis = false;
    }
    // braços: Rz (para os lados e para cima) depois Rx (para a frente); a mão sai da ponta
    for (var a = -1; a <= 1; a += 2) {
      var A2 = a < 0 ? 'L' : 'R', ang = a < 0 ? p.armL : p.armR, fwd = a < 0 ? p.armFL : p.armFR;
      mTRS(tA, a * 0.84, -0.2, 0, 0, 0, 0, 1, 1, 1);
      mTRS(tB, 0, 0, 0, 0, 0, a * ang, 1, 1, 1); mTRS(tR, 0, 0, 0, -fwd, 0, 0, 1, 1, 1);
      mMul(tL, tB, tR); mMul(tE, tA, tL);                                                  // tE = referencial do braço (no corpo)
      mTRS(tC, 0, -0.23, 0, 0, 0, 0, 0.1, 0.25, 0.1); mMul(tL, tE, tC); place(by['arm' + A2], tG, tL);
      mTRS(tC, 0, -0.47, 0, 0, 0, 0, 0.135, 0.135, 0.135); mMul(tL, tE, tC); place(by['hand' + A2], tG, tL);
      if (a > 0) {
        var hp = mTransformPoint(tE, 0, -0.47, 0);
        if (p.thumb > 0.03) { mTRS(tL, hp[0], hp[1] + 0.11, hp[2] + 0.03, 0, 0, 0, 0.05 * p.thumb, 0.09 * p.thumb, 0.05 * p.thumb); place(by.thumb, tG, tL); } else by.thumb.vis = false;
      }
    }
    // pés: ficam no chão (não acompanham o giro do corpo)
    for (var f = -1; f <= 1; f += 2) { mTRS(tL, f * 0.3 * sx, -0.82 + p.hop * 0.9, 0.1, 0, 0, 0, 0.21, 0.11, 0.27); mIdent(tC); place(by[f < 0 ? 'footL' : 'footR'], tC, tL); }
    // boca (os vértices já estão no espaço do corpo)
    place(by.mouth, tG, mIdent(tL)); place(by.tongue, tG, mIdent(tL));
  }

  return {
    clamp: clamp, mIdent: mIdent, mMul: mMul, mTRS: mTRS, mNormal: mNormal, mPerspective: mPerspective, mTransformPoint: mTransformPoint,
    superEllipsoid: superEllipsoid, makeGeometries: makeGeometries, faceZ: faceZ, BODY: BODY,
    buildMouth: buildMouth, buildLash: buildLash, mouthIndices: mouthIndices, MOUTH_N: MOUTH_N,
    SPEC: SPEC, PARAMS: PARAMS, RANGE: RANGE, defaults: defaults, EXPR: EXPR, REACTIONS: REACTIONS, PRESS_MAP: PRESS_MAP, EVENT_MAP: EVENT_MAP, TAP_SEQUENCE: TAP_SEQUENCE,
    createBrain: createBrain, makeParts: makeParts, computeParts: computeParts, PART_DEFS: PART_DEFS
  };
});
