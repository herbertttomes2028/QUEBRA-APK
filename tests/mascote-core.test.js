"use strict";
// Mascote 3D, núcleo (sem navegador): matrizes, geometria, boca, olhos fechados, tabela de reações e o "cérebro" que decide o que ele faz.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../public/mascot-core.js');

const near = (a, b, eps = 1e-6, msg) => assert.ok(Math.abs(a - b) <= eps, (msg || '') + ' esperado ' + b + ' obtido ' + a);
const seeded = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };
const mk = (o) => C.createBrain(Object.assign({ rng: seeded(11) }, o || {}));
const run = (brain, seconds, dt = 1 / 30) => { let o; for (let t = 0; t < seconds; t += dt) o = brain.tick(dt); return Object.assign({}, o); };   // cópia: brain.out é sempre o mesmo objeto
const finite = (o) => Object.keys(o).every((k) => Number.isFinite(o[k]));

/* ---------------- matrizes ---------------- */
test('matrizes: identidade, multiplicação, rotações (yaw, pitch, roll), escala e translação', () => {
  const I = C.mIdent(new Float32Array(16)); assert.deepEqual([...I], [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const T = C.mTRS(new Float32Array(16), 1, 2, 3, 0, 0, 0, 1, 1, 1), S = C.mTRS(new Float32Array(16), 0, 0, 0, 0, 0, 0, 2, 3, 4);
  const TS = C.mMul(new Float32Array(16), T, S), p = C.mTransformPoint(TS, 1, 1, 1);
  [3, 5, 7].forEach((v, i) => near(p[i], v, 1e-5, 'T*S'));
  const yaw = C.mTransformPoint(C.mTRS(new Float32Array(16), 0, 0, 0, 0, Math.PI / 2, 0, 1, 1, 1), 0, 0, 1);
  [1, 0, 0].forEach((v, i) => near(yaw[i], v, 1e-5, 'yaw 90° leva a frente (z) para +x'));
  const pitch = C.mTransformPoint(C.mTRS(new Float32Array(16), 0, 0, 0, Math.PI / 2, 0, 0, 1, 1, 1), 0, 0, 1);
  [0, -1, 0].forEach((v, i) => near(pitch[i], v, 1e-5, 'pitch 90° inclina o rosto para baixo'));
  const roll = C.mTransformPoint(C.mTRS(new Float32Array(16), 0, 0, 0, 0, 0, Math.PI / 2, 1, 1, 1), 1, 0, 0);
  [0, 1, 0].forEach((v, i) => near(roll[i], v, 1e-5, 'roll 90° leva +x para +y'));
  const A = C.mTRS(new Float32Array(16), 0.3, -0.2, 0.9, 0.4, -0.7, 0.2, 1.1, 0.8, 1.3), B = C.mTRS(new Float32Array(16), -1, 2, 0.5, 0.1, 0.2, 0.3, 0.7, 1.2, 0.9), D = C.mTRS(new Float32Array(16), 4, 3, 2, -0.3, 0.5, 0.9, 1, 1, 1);
  const L = C.mMul(new Float32Array(16), C.mMul(new Float32Array(16), A, B), D), R = C.mMul(new Float32Array(16), A, C.mMul(new Float32Array(16), B, D));
  for (let i = 0; i < 16; i++) near(L[i], R[i], 1e-4, 'associatividade [' + i + ']');
});

test('matriz normal: continua perpendicular depois de uma escala NÃO uniforme (o sombreamento não entorta)', () => {
  const M = C.mTRS(new Float32Array(16), 0, 0, 0, 0.3, 0.5, 0.2, 0.1, 0.25, 0.1), N = C.mNormal(new Float32Array(9), M);
  const n = [0.3, 0.8, 0.52], t = [0.8, -0.3, 0];                        // t · n = 0
  assert.ok(Math.abs(n[0] * t[0] + n[1] * t[1] + n[2] * t[2]) < 1e-9);
  const tt = [M[0] * t[0] + M[4] * t[1] + M[8] * t[2], M[1] * t[0] + M[5] * t[1] + M[9] * t[2], M[2] * t[0] + M[6] * t[1] + M[10] * t[2]];
  const nn = [N[0] * n[0] + N[3] * n[1] + N[6] * n[2], N[1] * n[0] + N[4] * n[1] + N[7] * n[2], N[2] * n[0] + N[5] * n[1] + N[8] * n[2]];
  near(tt[0] * nn[0] + tt[1] * nn[1] + tt[2] * nn[2], 0, 1e-6, 'normal ⊥ tangente');
  const deg = C.mNormal(new Float32Array(9), new Float32Array(16));            // matriz toda zero: não pode virar NaN
  assert.ok([...deg].every(Number.isFinite));
});

test('perspectiva: um ponto no eixo da câmera fica no centro da tela e o w do clip é a distância', () => {
  const P = C.mPerspective(new Float32Array(16), 28 * Math.PI / 180, 1.333, 1, 20), V = C.mIdent(new Float32Array(16)); V[14] = -5.2;
  const VP = C.mMul(new Float32Array(16), P, V), x = VP[0] * 0 + VP[4] * 0 + VP[8] * 0 + VP[12], w = VP[3] * 0 + VP[7] * 0 + VP[11] * 0 + VP[15];
  near(x, 0); near(w, 5.2, 1e-5);
});

/* ---------------- geometria ---------------- */
test('geometria do corpo e da esfera: sem valores inválidos, normais unitárias, faces para fora, índices válidos', () => {
  const g = C.makeGeometries();
  for (const k of ['body', 'sph']) {
    const G = g[k]; assert.ok(G.pos.every(Number.isFinite) && G.nor.every(Number.isFinite), k + ' finito');
    assert.ok(G.pos.length === G.nor.length && G.pos.length / 3 < 65536, 'cabe em Uint16');
    assert.ok(Math.max(...G.idx) < G.pos.length / 3, 'índices dentro do intervalo');
    for (let i = 0; i < G.nor.length; i += 3) near(Math.hypot(G.nor[i], G.nor[i + 1], G.nor[i + 2]), 1, 1e-4, 'normal unitária');
    let virados = 0, total = 0;
    for (let i = 0; i < G.idx.length; i += 3) {
      const a = G.idx[i] * 3, b = G.idx[i + 1] * 3, c = G.idx[i + 2] * 3;
      const u = [G.pos[b] - G.pos[a], G.pos[b + 1] - G.pos[a + 1], G.pos[b + 2] - G.pos[a + 2]], v = [G.pos[c] - G.pos[a], G.pos[c + 1] - G.pos[a + 1], G.pos[c + 2] - G.pos[a + 2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(...n) < 1e-12) continue; total++;
      const vn = [G.nor[a] + G.nor[b] + G.nor[c], G.nor[a + 1] + G.nor[b + 1] + G.nor[c + 1], G.nor[a + 2] + G.nor[b + 2] + G.nor[c + 2]];
      if (n[0] * vn[0] + n[1] * vn[1] + n[2] * vn[2] < 0) virados++;
    }
    assert.equal(virados, 0, k + ': nenhuma face virada para dentro (de ' + total + ')');
  }
  let mx = [0, 0, 0]; for (let i = 0; i < g.body.pos.length; i += 3) for (let j = 0; j < 3; j++) mx[j] = Math.max(mx[j], Math.abs(g.body.pos[i + j]));
  near(mx[0], C.BODY.rx, 1e-3); near(mx[1], C.BODY.ry, 1e-3); near(mx[2], C.BODY.rz, 1e-3);
  near(Math.max(...g.sph.pos.map(Math.abs)), 1, 1e-4);
  assert.ok(g.body.idx.length / 3 + g.sph.idx.length / 3 < 2500, 'poucos triângulos (leve para celular)');
});

test('frente do rosto (faceZ): máxima no centro, cai para as bordas, simétrica e nunca negativa', () => {
  near(C.faceZ(0, 0), C.BODY.rz, 1e-6);
  assert.ok(C.faceZ(0.3, 0.1) < C.faceZ(0, 0) && C.faceZ(0.6, 0.1) < C.faceZ(0.3, 0.1));
  near(C.faceZ(0.31, 0.12), C.faceZ(-0.31, 0.12), 1e-9); near(C.faceZ(5, 5), 0, 1e-9);
  for (let x = -1; x <= 1; x += 0.1) for (let y = -1; y <= 1; y += 0.1) assert.ok(C.faceZ(x, y) >= 0 && Number.isFinite(C.faceZ(x, y)));
});

/* ---------------- boca e olhos fechados ---------------- */
test('boca: sorriso levanta os cantos, tristeza abaixa, abrir aumenta a altura, a língua só aparece bem aberta e tudo fica na frente do rosto', () => {
  const N = C.MOUTH_N, mk2 = (p) => { const a = new Float32Array(N * 6), t = new Float32Array(N * 6); const tg = C.buildMouth(a, t, Object.assign({ mouthW: 1, mouthOpen: 0.1, mouthSmile: 0 }, p)); return { a, t, tg }; };
  const cornerY = (m) => m.a[1], centerY = (m) => m.a[(N >> 1) * 6 + 1];
  assert.ok(cornerY(mk2({ mouthSmile: 1 })) > centerY(mk2({ mouthSmile: 1 })), 'sorriso: cantos mais altos que o centro');
  assert.ok(cornerY(mk2({ mouthSmile: -1 })) < centerY(mk2({ mouthSmile: -1 })), 'tristeza: cantos mais baixos');
  const h = (m) => m.a[(N >> 1) * 6 + 1] - m.a[(N >> 1) * 6 + 4];
  assert.ok(h(mk2({ mouthOpen: 1 })) > h(mk2({ mouthOpen: 0.1 })) * 4, 'aberta é bem mais alta que fechada');
  const w = (m) => m.a[(N - 1) * 6] - m.a[0]; assert.ok(w(mk2({ mouthW: 1.3 })) > w(mk2({ mouthW: 0.5 })) * 2, 'largura acompanha o parâmetro');
  assert.equal(mk2({ mouthOpen: 0.2 }).tg, false); assert.equal(mk2({ mouthOpen: 0.9 }).tg, true, 'língua só com a boca bem aberta');
  const m = mk2({ mouthOpen: 0.9, mouthSmile: 0.5 });
  for (const arr of [m.a, m.t]) { assert.ok(arr.every(Number.isFinite)); for (let i = 0; i < N * 2; i++) assert.ok(arr[i * 3 + 2] > C.faceZ(arr[i * 3], arr[i * 3 + 1]), 'na frente da superfície do rosto'); }
  const idx = C.mouthIndices(); assert.equal(idx.length, (N - 1) * 6); assert.ok(Math.max(...idx) < N * 2);
  const extremo = mk2({ mouthW: 99, mouthOpen: 99, mouthSmile: 99 }); assert.ok(extremo.a.every(Number.isFinite), 'valores absurdos são limitados, nunca viram NaN');
});

test('olho fechado: o traço só existe com o olho quase fechado, e é um arco "∩" quando está feliz', () => {
  const N = C.MOUTH_N, pos = new Float32Array(N * 6), P = (o) => Object.assign({ eyeL: 1, eyeR: 1, mouthSmile: 1 }, o);
  assert.equal(C.buildLash(pos, -1, P({ eyeL: 1 })), false, 'olho aberto: sem traço');
  assert.equal(C.buildLash(pos, -1, P({ eyeL: 0.5 })), false, 'meio aberto: sem traço');
  assert.equal(C.buildLash(pos, -1, P({ eyeL: 0 })), true, 'fechado: com traço');
  const alt = (i) => pos[i * 6 + 1];
  assert.ok(alt(N >> 1) > alt(0) + 0.02, 'feliz: o meio do traço fica mais alto que as pontas (∩)');
  C.buildLash(pos, 1, P({ eyeR: 0, mouthSmile: -0.5 })); assert.ok(alt(N >> 1) < alt(0) + 1e-9, 'triste: o meio não sobe');
  assert.ok(pos.every(Number.isFinite));
  C.buildLash(pos, -1, P({ eyeL: 0 })); const x0 = pos[0], x1 = pos[(N - 1) * 6]; assert.ok(x0 < -0.31 + 1e-9 && x1 > -0.31 - 1e-9 && x1 - x0 > 0.2, 'o traço cobre a largura do olho esquerdo');
});

/* ---------------- tabelas ---------------- */
test('tabelas: toda expressão, reação e mapa aponta para algo que existe, e tudo respeita os limites seguros', () => {
  for (const [nome, e] of Object.entries(C.EXPR)) for (const [k, v] of Object.entries(e)) { assert.ok(C.PARAMS.includes(k), nome + '.' + k + ' é um parâmetro'); assert.ok(v >= C.RANGE[k][0] && v <= C.RANGE[k][1], nome + '.' + k + ' dentro do limite'); }
  for (const [nome, r] of Object.entries(C.REACTIONS)) { assert.ok(r.dur > 0.3 && r.dur <= 4, nome + ': duração razoável'); assert.ok([1, 2, 3].includes(r.prio), nome + ': prioridade'); assert.ok(C.EXPR[r.expr], nome + ': expressão existe'); assert.equal(typeof r.run, 'function'); }
  for (const alvo of [...Object.values(C.PRESS_MAP), ...Object.values(C.EVENT_MAP), ...C.TAP_SEQUENCE]) assert.ok(C.REACTIONS[alvo], alvo + ' existe');
  for (const k of C.PARAMS) { const [def, kk, z] = C.SPEC[k]; assert.ok(def >= C.RANGE[k][0] && def <= C.RANGE[k][1], k + ': valor inicial dentro do limite'); assert.ok(kk > 0 && z > 0 && z <= 1.2); }
  assert.ok(Object.keys(C.REACTIONS).length >= 20, 'catálogo de reações completo');
  assert.deepEqual(C.TAP_SEQUENCE, ['tapHappy', 'tapGiggle', 'tapSurprise', 'tapShy', 'tapDizzy']);
  for (const [k, v] of Object.entries({ play: 'goodPiece', duel: 'determined', friends: 'wave', settings: 'curious', codeFocus: 'lookThink', codeType: 'nodSmall', codeFull: 'excitedHop' })) assert.equal(C.PRESS_MAP[k], v, 'botão ' + k);
  assert.equal(C.PRESS_MAP.join, 'nod', 'o botão "Entrar" existe no mapa (era um defeito: retornava antes de escolher sim ou não)');
});

/* ---------------- cérebro ---------------- */
test('cérebro: nenhuma reação produz número inválido nem passa dos limites, com qualquer tamanho de passo de tempo', () => {
  for (const dtv of [1 / 60, 1 / 30, 0.05, 0.2, 5, -1, 0]) {
    for (const nome of Object.keys(C.REACTIONS)) {
      const b = mk(); b.react(nome, { dirX: -1 });
      for (let i = 0; i < 160; i++) { const o = b.tick(dtv); assert.ok(finite(o), nome + ' dt ' + dtv + ' passo ' + i); for (const k of C.PARAMS) assert.ok(o[k] >= C.RANGE[k][0] - 1e-9 && o[k] <= C.RANGE[k][1] + 1e-9, nome + '.' + k + '=' + o[k]); }
    }
  }
});

test('cérebro: é determinístico com a mesma semente e muda com outra', () => {
  const a = mk({ rng: seeded(5) }), b = mk({ rng: seeded(5) }), c = mk({ rng: seeded(99) });
  const sa = JSON.stringify(run(a, 20)), sb = JSON.stringify(run(b, 20)), sc = JSON.stringify(run(c, 20));
  assert.equal(sa, sb); assert.notEqual(sa, sc);
});

test('toques no mascote: escalam feliz → cócegas → surpresa → tímido → tontinho; esperar zera; o tontinho tem pausa', () => {
  const b = mk(), nomes = [];
  for (let i = 0; i < 5; i++) { nomes.push(b.tapMascot(0.4, 0)); run(b, 1.3); }
  assert.deepEqual(nomes, C.TAP_SEQUENCE);
  assert.equal(b.tapMascot(0, 0), null, 'durante a pausa do tontinho não reage a outro toque'); run(b, 2.6);
  assert.equal(b.tapMascot(0, 0), 'tapHappy', 'depois da pausa recomeça do começo');
  const c = mk(); c.tapMascot(0, 0); run(c, 1.3); c.tapMascot(0, 0); run(c, 8); assert.equal(c.tapMascot(0, 0), 'tapHappy', 'passou de 6 s sem tocar: zera a escala');
});

test('botões: cada um dispara a reação certa, "Entrar" decide sim/não pelo código, e ele olha para o lado do botão', () => {
  const casos = { play: 'goodPiece', duel: 'determined', continue: 'nod', friends: 'wave', settings: 'curious', help: 'curious', me: 'wave', codeFocus: 'lookThink', codeType: 'nodSmall', codeFull: 'excitedHop' };
  for (const [k, v] of Object.entries(casos)) { const b = mk(); b.press(k, 0, 0); assert.equal(b.current(), v, k); }
  let b = mk(); b.press('join', 0, 0, { codeReady: true }); assert.equal(b.current(), 'nod');
  b = mk(); b.press('join', 0, 0, { codeReady: false }); assert.equal(b.current(), 'shakeNo');
  b = mk(); assert.equal(b.press('nao-existe', 0, 0), null); assert.equal(b.current(), null);
  b = mk(); b.press('friends', -0.9, 0.2); const l = run(b, 0.4); b = mk(); b.press('friends', 0.9, 0.2); const r = run(b, 0.4);
  assert.ok(l.lookX < -0.3 && r.lookX > 0.3, 'olha para o botão: ' + l.lookX + ' / ' + r.lookX); assert.ok(l.yaw < 0 && r.yaw > 0, 'a cabeça acompanha');
  b = mk(); b.press('codeFocus', 0, 0.9); assert.ok(run(b, 0.5).lookY < -0.3, 'campo do código está embaixo: olha para baixo');
});

test('"boa escolha": olha para o botão, depois encara o jogador, pisca e faz joinha', () => {
  const b = mk(); b.press('play', -0.8, 0.5); const cedo = run(b, 0.15), tarde = run(b, 0.85);
  assert.ok(cedo.lookX < -0.1, 'no começo olha para o botão (' + cedo.lookX.toFixed(2) + ')');
  assert.ok(Math.abs(tarde.lookX) < 0.25, 'depois encara o jogador (' + tarde.lookX.toFixed(2) + ')');
  const meio = b.snapshot('goodPiece', 0.5); assert.ok(meio.eyeR < 0.3 && meio.eyeL > 0.7, 'pisca um olho só'); assert.equal(meio.thumb, 1); assert.ok(meio.armFR > 1, 'braço à frente (joinha)');
});

test('prioridades: comemorar não é interrompido por toque; reação nova de mesma prioridade substitui; toque duplo não reinicia', () => {
  let b = mk(); b.note('levelup'); run(b, 0.5); assert.equal(b.current(), 'celebrate');
  b.tapMascot(0, 0); b.press('play', 0, 0); assert.equal(b.current(), 'celebrate', 'prioridade 3 não é interrompida');
  b = mk(); b.react('tapHappy'); run(b, 0.5); b.press('duel', 0, 0); assert.equal(b.current(), 'determined', 'mesma prioridade: a nova vale');
  b = mk(); b.react('wave'); b.tick(0.05); assert.equal(b.react('wave'), false, 'mesma reação em menos de 0,25 s é ignorada');
  b = mk(); b.react('wave'); run(b, 5); assert.equal(b.current(), null, 'reação termina sozinha'); assert.equal(b.react('naoexiste'), false);
});

test('eventos do jogo: vitória, nível e conquista comemoram; fora da tela inicial ficam guardados por até 90 s', () => {
  for (const [ev, esperado] of Object.entries({ win: 'cheer', levelup: 'celebrate', achievement: 'proud', nearly: 'nearly' })) { const b = mk(); assert.equal(b.note(ev), true); run(b, 0.6); assert.equal(b.current(), esperado, ev); }
  assert.equal(mk().note('desconhecido'), false); assert.equal(mk().note(''), false);
  let agora = 1000000; let b = mk({ now: () => agora }); b.deactivate(); b.note('levelup'); run(b, 1); assert.equal(b.current(), null, 'inativo: nada acontece');
  agora += 30000; b.activate(); run(b, 1); assert.equal(b.current(), 'celebrate', 'voltou em 30 s: comemora');
  b = mk({ now: () => agora }); b.deactivate(); b.note('win'); agora += 95000; b.activate(); run(b, 1.5); assert.notEqual(b.current(), 'cheer', 'passou de 90 s: não comemora algo velho');
  b = mk({ now: () => agora }); b.deactivate(); b.note('win'); b.note('levelup'); agora += 1000; b.activate(); run(b, 1.2); assert.equal(b.current(), 'celebrate', 'só o último evento guardado vale');
});

test('ocioso: gesto de vez em quando, boceja aos 30 s, dorme aos 38 s, e o toque acorda', () => {
  const b = mk(), vistos = new Set(); let bocejou = false, dormiu = false, tempoDormir = 0;
  for (let t = 0; t < 45; t += 0.05) { b.tick(0.05); if (b.current()) vistos.add(b.current()); if (b.current() === 'yawn') bocejou = true; if (b.isSleeping() && !dormiu) { dormiu = true; tempoDormir = t; } }
  assert.ok(['wave', 'curious', 'excitedHop'].some((g) => vistos.has(g)), 'fez algum gesto ocioso: ' + [...vistos]);
  assert.ok(bocejou, 'bocejou'); assert.ok(dormiu && tempoDormir >= 35 && tempoDormir <= 41, 'dormiu perto dos 38 s: ' + tempoDormir.toFixed(1));
  assert.ok(run(b, 0.5).eyeL < 0.5, 'dormindo: olhos quase fechados');
  assert.equal(b.tapMascot(0, 0), 'wake'); run(b, 0.3); assert.equal(b.current(), 'wake'); assert.equal(b.isSleeping(), false, 'o toque acorda');
  const c = mk(); for (let t = 0; t < 20; t += 0.05) { c.tick(0.05); if (Math.round(t * 20) % 100 === 0) c.pointer(0.2, 0.1, true); } assert.equal(c.isSleeping(), false, 'tocando de vez em quando, nunca dorme');
  const d = mk(); d.setContinueVisible(true); const nomes = new Set(); for (let i = 0; i < 40; i++) { const e = mk({ rng: seeded(i + 3) }); e.setContinueVisible(true); for (let t = 0; t < 28; t += 0.05) { e.tick(0.05); if (e.current()) nomes.add(e.current()); } }
  assert.ok(nomes.has('hopeful'), 'com "Continuar jogando" na tela, às vezes olha esperançoso para ele');
});

test('piscar: acontece de tempos em tempos, é rápido e nunca pisca duas vezes seguidas por muito tempo', () => {
  const b = mk(); let piscadas = 0, abaixo = false, minimo = 1;
  for (let t = 0; t < 30; t += 1 / 60) { const o = b.tick(1 / 60); const fechado = o.eyeL < 0.5; if (fechado && !abaixo) piscadas++; abaixo = fechado; minimo = Math.min(minimo, o.eyeL); }
  assert.ok(piscadas >= 5 && piscadas <= 20, 'piscadas em 30 s: ' + piscadas); assert.ok(minimo < 0.15, 'chega a fechar quase tudo');
});

test('olhar: segue o dedo, limita os valores absurdos e volta a passear quando o dedo sai', () => {
  const b = mk(); b.pointer(5, -9, true); const o = run(b, 0.5); assert.ok(Math.abs(o.lookX) <= 1.2 && Math.abs(o.lookY) <= 1.2); assert.ok(o.lookX > 0.5 && o.lookY > 0.5);
  b.pointerEnd(); const passeio = run(b, 6); assert.ok(Math.abs(passeio.lookX) < 0.6, 'voltou a olhar mais para o meio');
});

test('movimento reduzido: sem balanço (pose parada), sem piscar, mas a expressão e a pose-chave aparecem; e termina', () => {
  const b = mk(); b.setReduced(true); b.tapMascot(0, 0); const a = Object.assign({}, b.tick(1 / 30)), c = Object.assign({}, b.tick(1 / 30)), d = run(b, 0.5);
  for (const k of C.PARAMS) { near(a[k], c[k], 1e-9, k + ' parado'); near(c[k], d[k], 1e-9, k + ' parado (depois)'); }
  assert.ok(d.armR > 1.8, 'pose-chave do tapHappy (braço levantado): ' + d.armR); assert.ok(d.mouthSmile > 0.7, 'expressão feliz');
  assert.equal(d.hop, 0, 'sem pulinho (o pulo é um efeito de movimento)'); near(d.roll, 0, 1e-9, 'sem balanço'); near(d.sy, 1, 1e-9, 'sem respiração nem esticão'); near(d.yaw, 0, 1e-9, 'sem girar a cabeça');
  run(b, 3); assert.equal(b.current(), null); assert.ok(b.tick(1 / 30).armR < 0.5, 'voltou ao repouso'); assert.ok(Math.abs(d.armR - c.armR) < 1e-9 && d.armR > 1.8, 'e a pose parada era mesmo diferente do repouso'); assert.equal(b.busy(), false, 'e para de pedir quadros');
  let piscou = false; const e = mk(); e.setReduced(true); for (let t = 0; t < 12; t += 0.05) if (e.tick(0.05).eyeL < 0.9) piscou = true; assert.equal(piscou, false, 'sem piscar com movimento reduzido');
  assert.equal(b.consumeChanged(), true); assert.equal(b.consumeChanged(), false); assert.equal(b.hasChanged(), false, 'hasChanged não consome; consumeChanged consome');
});

test('snapshot (pose parada de cada reação): finito, dentro dos limites e com a pose-chave certa', () => {
  const b = mk();
  for (const n of [...Object.keys(C.REACTIONS), ...Object.keys(C.EXPR)]) for (const u of [0, 0.25, 0.5, 0.75, 1]) { const o = b.snapshot(n, u); assert.ok(finite(o), n + '@' + u); for (const k of C.PARAMS) assert.ok(o[k] >= C.RANGE[k][0] - 1e-9 && o[k] <= C.RANGE[k][1] + 1e-9, n + '.' + k); }
  assert.ok(b.snapshot('cheer', 0.5).armL >= 2.5 && b.snapshot('cheer', 0.5).armR >= 2.5, 'comemorar: braços para cima (com o vaivém, perto de 2,85)');
  assert.ok(Math.abs(b.snapshot('wave', 0.5).armR - 2.5) < 0.6, 'acenar: braço direito erguido');
  assert.ok(b.snapshot('tapSurprise', 0.3).eyeL > 1.1 && b.snapshot('tapSurprise', 0.3).mouthOpen > 0.8, 'surpresa: olhos grandes e boca aberta');
  assert.ok(b.snapshot('tapGiggle', 0.5).eyeL === 0 && b.snapshot('tapGiggle', 0.5).blush > 0.7, 'cócegas: olhos fechados e bochechas');
  assert.ok(b.snapshot('determined', 0.5).tiltL > 0.5, 'determinado: sobrancelhas inclinadas'); assert.ok(b.snapshot('yawn', 0.5).mouthOpen > 0.9, 'bocejo: boca bem aberta');
  const t = b.snapshot('celebrate', 0.15); assert.ok(t.yaw > 1.5, 'subir de nível: gira (yaw ' + t.yaw.toFixed(2) + ')');
});

/* ---------------- o modelo ---------------- */
test('modelo: todas as peças existem e são únicas, as matrizes ficam finitas e a anatomia faz sentido', () => {
  const parts = C.makeParts(), ids = parts.map((p) => p.id); assert.equal(new Set(ids).size, ids.length); assert.equal(parts.length, C.PART_DEFS.length);
  for (const id of ['body', 'knob', 'armL', 'armR', 'handL', 'handR', 'footL', 'footR', 'eyeWL', 'eyeWR', 'pupL', 'pupR', 'lidL', 'lidR', 'browL', 'browR', 'mouth', 'tongue']) assert.ok(parts.byId[id], id);
  const P = (o) => Object.assign(C.defaults(), o || {}); C.computeParts(parts, P());
  for (const p of parts) { assert.ok([...p.M].every(Number.isFinite) && [...p.N].every(Number.isFinite), p.id + ' finito'); }
  const pos = (id) => C.mTransformPoint(parts.byId[id].M, 0, 0, 0);
  near(pos('eyeWL')[0], -pos('eyeWR')[0], 1e-6, 'olhos simétricos'); assert.ok(pos('eyeWL')[2] > 0.5, 'olhos na frente do corpo');
  assert.ok(pos('footL')[1] < pos('body')[1] - 0.6, 'pés embaixo do corpo'); assert.ok(pos('browL')[1] > pos('eyeWL')[1], 'sobrancelha acima do olho');
  const mao0 = pos('handR')[1]; C.computeParts(parts, P({ armR: 2.8 })); assert.ok(pos('handR')[1] > mao0 + 0.5, 'braço levantado: a mão sobe');
  C.computeParts(parts, P({ armR: 1.2, armFR: 1.0 })); assert.ok(pos('handR')[2] > 0.3, 'braço para a frente: a mão vem para a frente (0,47 × sen 1 rad ≈ 0,40)');
  C.computeParts(parts, P({ thumb: 0 })); assert.equal(parts.byId.thumb.vis, false); C.computeParts(parts, P({ thumb: 1 })); assert.equal(parts.byId.thumb.vis, true);
  C.computeParts(parts, P({ eyeL: 1 })); assert.equal(parts.byId.lashL.vis, false); assert.equal(parts.byId.lidL.vis, false, 'olho aberto: sem lasca de pálpebra');
  C.computeParts(parts, P({ eyeL: 0 })); assert.equal(parts.byId.lashL.vis, true); assert.equal(parts.byId.pupL.vis, false, 'olho fechado: sem pupila');
  C.computeParts(parts, P({ eyeL: 0.5 })); assert.equal(parts.byId.lidL.vis, true, 'meio aberto: pálpebra aparece');
  C.computeParts(parts, P({ blush: 0 })); assert.equal(parts.byId.cheekL.vis, false); C.computeParts(parts, P({ blush: 1 })); assert.equal(parts.byId.cheekL.vis, true);
  const antes = pos('body')[1]; C.computeParts(parts, P({ hop: 0.2 })); near(pos('body')[1] - antes, 0.2, 1e-5, 'pulo sobe o corpo'); near(pos('footL')[1], -0.82 + 0.2 * 0.9, 1e-5, 'e os pés acompanham');
  C.computeParts(parts, P({ yaw: 0.5, eyeL: 1.3, eyeR: 1.3, pupil: 1.3, lookX: 1.2, lookY: -1.2, sx: 1.4, sy: 0.6 })); assert.ok(parts.every((p) => [...p.M].every(Number.isFinite)), 'extremos continuam finitos');
});

test('a pupila acompanha o olhar dentro do olho (nunca sai do branco)', () => {
  const parts = C.makeParts(), P = (o) => Object.assign(C.defaults(), o), pos = (id) => C.mTransformPoint(parts.byId[id].M, 0, 0, 0);
  C.computeParts(parts, P({ lookX: 0, lookY: 0 })); const c = pos('pupR'); C.computeParts(parts, P({ lookX: 1, lookY: 0 })); const d = pos('pupR');
  assert.ok(d[0] > c[0] + 0.03, 'olha para a direita'); C.computeParts(parts, P({ lookX: 1.2, lookY: 1.2 })); const e = pos('pupR'), w = pos('eyeWR');
  assert.ok(Math.abs(e[0] - w[0]) < 0.155 + 0.01 && Math.abs(e[1] - w[1]) < 0.2 + 0.01, 'a pupila fica dentro do olho mesmo com o olhar no limite');
});
