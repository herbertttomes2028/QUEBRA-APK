'use strict';
// Pet: 3 reações novas, 5 skins novas e 5 roupas novas. O que já existia NÃO mudou: o "retrato" abaixo (hashes) foi tirado da main ANTES desta rodada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const C = require('../public/mascot-core.js');
const L = require('../public/mascot-looks.js');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const h16 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const seeded = (seed) => { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); };

const BASE = {"reactions": {"tapHappy": "bf5ebd4c92b806e6", "tapGiggle": "74356ea6d4206028", "tapSurprise": "a97655e23e506494", "tapShy": "298e370624b697e6", "tapDizzy": "260e9f3031557e53", "goodPiece": "22e21c16bdbd5ea8", "nod": "55e2abba27532cfd", "nodSmall": "216238b9804a79e2", "shakeNo": "277115d807425102", "wave": "ba5ff3323e255323", "cheer": "f566d83ab714606b", "celebrate": "861fb695ae10a1d3", "proud": "e3888dc695cfa41f", "curious": "baa700db0686d009", "determined": "8fdc65669e40e43b", "excitedHop": "8625129f006c2c3a", "nearly": "71f3a3541156f141", "yawn": "e8b59e75f0bc7878", "wake": "42cf4653ce9dcc1f", "lookThink": "acc0b57aa03ef161", "hopeful": "e7d36cbc86914eca"}, "expr": {"neutral": "44136fa355b3678a", "happy": "9db31fb70c1feff5", "joy": "79e540b671d04d8c", "wow": "6b639ccc8ace61ec", "think": "d844fc9a2461bcd6", "determined": "c95762d0c3558ea5", "sleepy": "887da8b3caa19edf", "curious": "d243a9d6a904c75b", "wink": "c6a487c845c5e1a6", "shy": "14e3009a5ed501b4", "dizzy": "e74060c824d56abb", "proud": "ba68dbcae9f5677f", "excited": "a08baea4ccdbbe97", "worried": "c2448be55ce4d33f"}, "press": {"play": "goodPiece", "duel": "determined", "continue": "nod", "join": "nod", "friends": "wave", "settings": "curious", "help": "curious", "me": "wave", "codeFocus": "lookThink", "codeType": "nodSmall", "codeFull": "excitedHop"}, "event": {"win": "cheer", "levelup": "celebrate", "achievement": "proud", "nearly": "nearly"}, "tap": ["tapHappy", "tapGiggle", "tapSurprise", "tapShy", "tapDizzy"], "spec": "bd2a8668fd20cf8e", "range": "d464ec5d60f0394f", "parts": "4536c2ba9b2f6681", "compute": "9eadd1f12b796816", "brain": "ce943180b3d01b05"};
const NOVAS = ['admire', 'cuddle', 'heart'], EXPR_NOVAS = ['dreamy', 'content', 'love'];

/* ============================ nada do que existia mudou ============================ */
test('as 21 reações, as 14 expressões, os mapas, a pose, o modelo e o cérebro continuam EXATAMENTE como estavam (retrato da main anterior)', () => {
  for (const [n, v] of Object.entries(BASE.reactions)) { const r = C.REACTIONS[n]; assert.ok(r, n + ' continua existindo'); assert.equal(h16(String(r.run) + '|' + r.dur + '|' + r.prio + '|' + r.expr), v, 'a reação ' + n + ' não pode mudar'); }
  for (const [n, v] of Object.entries(BASE.expr)) assert.equal(h16(JSON.stringify(C.EXPR[n])), v, 'a expressão ' + n + ' não pode mudar');
  for (const [k, v] of Object.entries(BASE.press)) assert.equal(C.PRESS_MAP[k], v, 'botão ' + k + ' continua com a mesma reação');
  for (const [k, v] of Object.entries(BASE.event)) assert.equal(C.EVENT_MAP[k], v, 'evento ' + k + ' continua com a mesma reação');
  assert.deepEqual(C.TAP_SEQUENCE, BASE.tap, 'a sequência de toques é a mesma');
  assert.equal(h16(JSON.stringify(C.SPEC)), BASE.spec, 'molas da pose'); assert.equal(h16(JSON.stringify(C.RANGE)), BASE.range, 'limites'); assert.equal(h16(JSON.stringify(C.PART_DEFS)), BASE.parts, 'o modelo (peças e cores de fábrica)');
  assert.equal(h16(String(C.computeParts)), BASE.compute, 'a montagem do corpo'); assert.equal(h16(String(C.createBrain)), BASE.brain, 'o cérebro (gestos ociosos, toques, prioridades, eventos)');
});
test('só entraram 3 reações novas (e as 3 expressões delas): nem uma a mais, nem uma a menos', () => {
  const novas = Object.keys(C.REACTIONS).filter((n) => !(n in BASE.reactions)).sort(); assert.deepEqual(novas, NOVAS.slice().sort());
  assert.equal(Object.keys(BASE.reactions).length, 21); assert.equal(Object.keys(C.REACTIONS).length, 24);
  assert.deepEqual(Object.keys(C.EXPR).filter((n) => !(n in BASE.expr)).sort(), EXPR_NOVAS.slice().sort());
  assert.deepEqual(Object.keys(C.PRESS_MAP).filter((k) => !(k in BASE.press)), ['shop']); assert.deepEqual(Object.keys(C.EVENT_MAP).filter((k) => !(k in BASE.event)), ['friend']);
});

/* ============================ as 3 reações novas ============================ */
test('as reações novas são válidas: duração razoável, prioridade igual às de toque, expressão própria que existe, e nunca passam dos limites seguros', () => {
  for (const n of NOVAS) {
    const r = C.REACTIONS[n]; assert.ok(r.dur >= 1.5 && r.dur <= 3, n + ': duração'); assert.equal(r.prio, 2, n + ': mesma prioridade das reações de toque (não interrompe comemorações, que valem 3)');
    assert.ok(EXPR_NOVAS.includes(r.expr) && C.EXPR[r.expr], n + ': usa uma das 3 expressões novas');
    for (const u of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) { const o = C.createBrain({ rng: seeded(3) }).snapshot(n, u); for (const k of C.PARAMS) { assert.ok(Number.isFinite(o[k]), n + ' ' + k); assert.ok(o[k] >= C.RANGE[k][0] - 1e-9 && o[k] <= C.RANGE[k][1] + 1e-9, n + ' ' + k + ' fora dos limites'); } }
  }
  for (const [name, e] of Object.entries(C.EXPR)) for (const [k, v] of Object.entries(e)) { assert.ok(k in C.RANGE, name + '.' + k + ' é um parâmetro de verdade'); assert.ok(v >= C.RANGE[k][0] && v <= C.RANGE[k][1], name + '.' + k + ' dentro dos limites'); }
});
test('são INÉDITAS: nenhuma se parece com uma das 21 existentes (distância de pose muito acima da de duas existentes parecidas)', () => {
  const b = C.createBrain({ rng: () => 0.5, now: () => 0 }), W = {}; C.PARAMS.forEach((n) => { W[n] = 1 / (C.RANGE[n][1] - C.RANGE[n][0]); });
  const dist = (a, c) => Math.sqrt(C.PARAMS.reduce((s, n) => s + Math.pow((a[n] - c[n]) * W[n], 2), 0)), snaps = (n) => [0.25, 0.5, 0.75].map((u) => b.snapshot(n, u));
  for (const n of NOVAS) { let min = Infinity, who = ''; for (const e of Object.keys(BASE.reactions)) for (const sa of snaps(n)) for (const sb of snaps(e)) { const d = dist(sa, sb); if (d < min) { min = d; who = e; } } assert.ok(min >= 0.55, n + ' parece demais com ' + who + ': ' + min.toFixed(3)); }
  for (const a of NOVAS) for (const c of NOVAS) if (a < c) { let min = Infinity; for (const sa of snaps(a)) for (const sb of snaps(c)) min = Math.min(min, dist(sa, sb)); assert.ok(min >= 0.5, a + ' e ' + c + ' parecem demais uma com a outra'); }
});
test('cada reação nova tem a sua pose-chave: admire (olhos brilhando, mãos juntas na frente), cuddle (olhos fechados, amassadinho, abraçado), heart (braços abertos para a frente, bochechas cheias, bate como um coração)', () => {
  const b = C.createBrain({ rng: seeded(5) }), a = b.snapshot('admire', 0.5), c = b.snapshot('cuddle', 0.5), h = b.snapshot('heart', 0.4);
  assert.ok(a.pupil >= 1.05 && a.eyeL >= 1.1 && a.armFL >= 1.3 && a.armFR >= 1.3 && a.armL < 1.2 && a.mouthSmile > 0.5, 'admire');
  assert.ok(c.eyeL <= 0.1 && c.eyeR <= 0.1 && c.mouthSmile >= 0.9 && c.blush >= 0.85 && c.sy < 0.97 && c.sx > 1.02 && c.armFL >= 1.2 && c.armL < 0.7, 'cuddle');
  assert.ok(h.blush >= 0.95 && h.mouthSmile >= 0.9 && h.armFL >= 1.2 && h.armL >= 1.5 && h.pupil >= 1.2, 'heart');
  const pulse = []; for (let u = 0; u <= 1; u += 0.02) pulse.push(b.snapshot('heart', u).sx); assert.ok(Math.max(...pulse) - Math.min(...pulse) > 0.03, 'o coração bate (o corpo pulsa)');
  const purr = []; for (let u = 0.2; u <= 0.8; u += 0.01) purr.push(b.snapshot('cuddle', u).sy); assert.ok(Math.max(...purr) - Math.min(...purr) > 0.005, 'o ronronar balança de leve');
});
test('integração: Loja → admire, novo amigo → heart (guardado se estiver fora da tela inicial, por até 90 s), e o cérebro aceita cuddle sem interromper comemorações', () => {
  let t = 0; const b = C.createBrain({ rng: seeded(9), now: () => t * 1000 }), step = (s) => { for (let i = 0; i < s * 60; i++) { b.tick(1 / 60); t += 1 / 60; } };
  assert.equal(b.press('shop', 0.2, 0.1), 'admire'); assert.equal(b.current(), 'admire'); step(2.2); assert.equal(b.current(), null, 'admire termina sozinha');
  assert.equal(b.note('friend'), true); step(0.2); assert.equal(b.current(), null, 'ainda no atraso de 0,35 s'); step(0.3); assert.equal(b.current(), 'heart');
  step(3); const d = C.createBrain({ rng: seeded(9), now: () => t * 1000 }); d.deactivate(); assert.equal(d.note('friend'), true); d.activate(); for (let i = 0; i < 90; i++) { d.tick(1 / 60); t += 1 / 60; } assert.equal(d.current(), 'heart', 'amigo novo feito fora da tela inicial: comemora ao voltar');
  const e = C.createBrain({ rng: seeded(2) }); assert.equal(e.react('celebrate'), true); assert.equal(e.react('cuddle'), false, 'comemorar (prioridade 3) não é interrompido'); assert.equal(e.current(), 'celebrate');
  const f = C.createBrain({ rng: seeded(2) }); f.react('tapHappy'); assert.equal(f.react('cuddle'), true, 'carinho substitui um toque comum'); assert.equal(f.current(), 'cuddle');
  const g = C.createBrain({ rng: seeded(4) }); g.setReduced(true); g.react('cuddle'); for (let i = 0; i < 40; i++) g.tick(1 / 60); const o = g.out; for (const k of C.PARAMS) assert.ok(Number.isFinite(o[k]), 'movimento reduzido: ' + k);
});
test('o cérebro nunca produz número inválido com as reações novas, com qualquer tamanho de passo', () => {
  for (const n of NOVAS) for (const dt of [0.004, 1 / 60, 1 / 30, 0.05, 0.2]) { const b = C.createBrain({ rng: seeded(11) }); b.react(n); for (let i = 0; i < 400; i++) { const o = b.tick(dt); for (const k of C.PARAMS) { assert.ok(Number.isFinite(o[k]), n + ' ' + k); assert.ok(o[k] >= C.RANGE[k][0] - 1e-9 && o[k] <= C.RANGE[k][1] + 1e-9, n + ' ' + k + ' fora dos limites'); } } }
});

/* ============================ skins ============================ */
const lum = (c) => { const f = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const DARK = C.PART_DEFS.find((d) => d[0] === 'mouth')[2], WHITE = [1, 1, 1], ORIG = C.PART_DEFS[0][2];
test('são exatamente 5 skins, cada uma com id, nome em português e cores válidas', () => {
  assert.equal(L.SKINS.length, 5); assert.equal(new Set(L.SKINS.map((s) => s.id)).size, 5); assert.equal(new Set(L.SKINS.map((s) => s.name)).size, 5);
  for (const s of L.SKINS) { assert.match(s.id, /^[a-z]+(-[a-z]+)*$/); assert.ok(s.name.length >= 3 && s.name.length <= 20, s.name); for (const k of ['swatch', 'body', 'knob', 'hands', 'feet', 'cheek']) assert.match(s[k], /^#[0-9a-f]{6}$/, s.id + '.' + k); assert.ok(s.dots.length >= 5 && s.dots.length <= 9, s.id + ': detalhes pintados'); for (const d of s.dots) { assert.equal(d.length, 4); assert.match(d[3], /^#[0-9a-f]{6}$/); assert.ok(d[2] >= 0.04 && d[2] <= 0.1, 'raio do detalhe'); } }
});
test('as skins são diferentes entre si e do original (cor do corpo, do dentinho, dos pés), mas o pet continua o mesmo: mesmas peças, mesmo desenho do rosto', () => {
  const body = L.SKINS.map((s) => L.rgb(s.body)).concat([ORIG]);
  for (let i = 0; i < body.length; i++) for (let j = i + 1; j < body.length; j++) assert.ok(L.colorDist(body[i], body[j]) >= 0.3, 'corpos parecidos demais: ' + i + ' e ' + j);
  assert.equal(new Set(L.SKINS.map((s) => s.feet)).size, 5, 'cada skin tem os pés de uma cor'); assert.equal(new Set(L.SKINS.map((s) => s.dots.map((d) => d[3]).sort().join())).size, 5, 'cada skin tem o seu conjunto de detalhes');
  const ids = C.makeParts().map((p) => p.id);
  for (const s of L.SKINS) { const parts = C.makeParts(); L.apply(C, parts, L.build(C, { skin: s.id })); assert.deepEqual(parts.slice(0, ids.length).map((p) => p.id), ids, s.id + ': as 31 peças de sempre, na mesma ordem'); assert.equal(parts.length, ids.length + s.dots.length); }
});
test('o rosto continua legível em todas as skins: boca, sobrancelhas e pupilas contrastam com o corpo, as bochechas aparecem e as mãos se distinguem', () => {
  for (const s of L.SKINS) {
    const b = L.rgb(s.body); assert.ok(cr(b, DARK) >= 2.8, s.id + ': rosto (boca/sobrancelhas) contra o corpo ' + cr(b, DARK).toFixed(2)); assert.ok(cr(b, WHITE) >= 1.5, s.id + ': o branco do olho aparece');
    assert.ok(L.colorDist(b, L.rgb(s.cheek)) >= 0.25, s.id + ': bochechas visíveis'); assert.ok(L.colorDist(b, L.rgb(s.hands)) >= 0.25, s.id + ': mãos visíveis'); assert.ok(L.colorDist(L.rgb(s.knob), L.rgb(s.body)) >= 0 && L.colorDist(L.rgb(s.feet), b) >= 0.3, s.id + ': pés visíveis');
    for (const d of s.dots) assert.ok(L.colorDist(L.rgb(d[3]), b) >= 0.25, s.id + ': detalhe visível ' + d[3]);
  }
});
test('as pintas ficam só fora do rosto (olhos, sobrancelhas, bochechas e boca), em cima do corpo, e dentro da frente do corpo', () => {
  for (const s of L.SKINS) for (const d of s.dots) { const [x, y, r] = d; const inFace = (Math.abs(x) < 0.5 && y > -0.2 && y < 0.58) || (Math.abs(x) < 0.66 && y > -0.2 && y < 0.02) || (Math.abs(x) < 0.3 && y > -0.47 && y < -0.2); assert.ok(!inFace, s.id + ' pinta em cima do rosto: ' + x + ',' + y); assert.ok(L.front(C.BODY, x, y) > 0.12, s.id + ': a pinta tem corpo embaixo dela (' + x + ',' + y + ')'); assert.ok(r > 0); }
});
test('aplicar e tirar uma aparência restaura o pet de fábrica sem alterar as cores originais (as cores de C nunca mudam)', () => {
  const orig = JSON.stringify(C.PART_DEFS), parts = C.makeParts(), before = JSON.stringify(parts.map((p) => [p.id, p.color]));
  for (const s of L.SKINS) for (const o of L.OUTFITS) { L.apply(C, parts, L.build(C, { skin: s.id, outfit: o.id })); assert.equal(JSON.stringify(C.PART_DEFS), orig, 'PART_DEFS intacto'); }
  L.apply(C, parts, L.build(C, {})); assert.equal(JSON.stringify(parts.map((p) => [p.id, p.color])), before, 'sem skin nem roupa: exatamente o de fábrica'); assert.equal(parts.length, C.PART_DEFS.length, 'sem peças sobrando'); assert.deepEqual(Object.keys(parts.byId).sort(), C.PART_DEFS.map((d) => d[0]).sort());
  assert.deepEqual(L.sanitize({ skin: '<img onerror=1>', outfit: 'x'.repeat(500) }), { skin: '', outfit: '' }); assert.deepEqual(L.sanitize(null), { skin: '', outfit: '' }); assert.deepEqual(L.sanitize({ skin: 'uva', outfit: 'mago' }), { skin: 'uva', outfit: 'mago' }); assert.deepEqual(L.sanitize({ skin: 5, outfit: {} }), { skin: '', outfit: '' });
});

/* ============================ roupas ============================ */
const OUT_IDS = ['capa-heroi', 'cachecol', 'mago', 'bailarina', 'macacao'];
test('são exatamente 5 roupas, de modelos e estilos diferentes (capa, cachecol, chapéu, saia, macacão), cada uma com id, nome em português e emoji', () => {
  assert.deepEqual(L.OUTFITS.map((o) => o.id), OUT_IDS); assert.equal(new Set(L.OUTFITS.map((o) => o.name)).size, 5); assert.equal(new Set(L.OUTFITS.map((o) => o.emoji)).size, 5);
  for (const o of L.OUTFITS) { assert.match(o.name, /^[A-ZÁÉÍÓÚ]/); assert.ok(o.emoji.length >= 1); }
  const ids = L.OUTFITS.map((o) => L.build(C, { outfit: o.id }).extras.map((e) => e.id)), all = [].concat(...ids); assert.equal(new Set(all).size, all.length, 'cada roupa tem as suas próprias peças (nenhuma é a outra com outra cor)');
  const verts = L.OUTFITS.map((o) => Object.values(L.build(C, { outfit: o.id }).geoms).reduce((s, g) => s + g.pos.length / 3, 0)); assert.equal(new Set(verts).size, 5, 'cada roupa tem uma forma própria (vértices: ' + verts.join(' ') + ')');
});
function worldVerts(look) {                                                      // todos os vértices e esferas da roupa, no referencial do corpo
  const out = [];
  for (const e of look.extras) {
    const l = e.local, M = new Float32Array(16); C.mTRS(M, l.t[0], l.t[1], l.t[2], l.r[0], l.r[1], l.r[2], l.s[0], l.s[1], l.s[2]);
    if (e.geom === 'sph') { out.push({ id: e.id, sph: true, p: [l.t[0], l.t[1], l.t[2]], rad: Math.max(l.s[0], l.s[1], l.s[2]) }); continue; }
    const g = look.geoms[e.geom]; for (let i = 0; i < g.pos.length; i += 3) out.push({ id: e.id, p: C.mTransformPoint(M, g.pos[i], g.pos[i + 1], g.pos[i + 2]) });
  }
  return out;
}
test('a geometria das roupas é válida: sem NaN, índices dentro do limite, normais unitárias, poucas malhas e poucos vértices (leve para celular fraco)', () => {
  for (const o of L.OUTFITS) { const look = L.build(C, { outfit: o.id }); let total = 0;
    for (const [k, g] of Object.entries(look.geoms)) { const n = g.pos.length / 3; total += n; assert.ok(n >= 4 && n < 65000, o.id + ' ' + k); assert.equal(g.idx.length % 3, 0); assert.equal(g.count, g.idx.length); for (const v of g.pos) assert.ok(Number.isFinite(v)); for (const i of g.idx) assert.ok(i < n, 'índice fora'); let bad = 0; for (let i = 0; i < g.nor.length; i += 3) { const l = Math.hypot(g.nor[i], g.nor[i + 1], g.nor[i + 2]); if (!(Math.abs(l - 1) < 0.02)) bad++; } assert.ok(bad / n < 0.02, o.id + ' ' + k + ': normais não unitárias ' + bad); }
    assert.ok(Object.keys(look.geoms).length <= 3, o.id + ': poucas malhas'); assert.ok(total <= 2500, o.id + ': vértices ' + total); assert.ok(look.extras.length <= 8, o.id + ': poucas peças (chamadas de desenho)'); }
});
test('o ROSTO FICA LIVRE: nenhuma roupa cobre olhos, sobrancelhas, bochechas ou boca (nem aberta), com qualquer skin', () => {
  for (const o of L.OUTFITS) for (const sk of [''].concat(L.SKINS.map((s) => s.id))) {
    const look = L.build(C, { skin: sk, outfit: o.id }), outfitParts = look.extras.filter((e) => !/^pinta/.test(e.id)), keep = { geoms: look.geoms, extras: outfitParts };
    for (const v of worldVerts(keep)) { const [x, y, z] = v.p, r = v.sph ? v.rad * 0.5 : 0; const inFace = z > 0.1 && ((Math.abs(x) < 0.5 - r && y > -0.2 + r && y < 0.58 - r) /* olhos e sobrancelhas */ || (Math.abs(x) < 0.66 - r && y > -0.2 + r && y < 0.02 - r) /* bochechas */ || (Math.abs(x) < 0.3 - r && y > -0.47 + r && y < -0.2 - r) /* boca (aberta, no bocejo) */); assert.ok(!inFace, o.id + '/' + (sk || 'original') + ': ' + v.id + ' cobre o rosto em ' + x.toFixed(2) + ',' + y.toFixed(2) + ',' + z.toFixed(2)); }
  }
});
test('a roupa SEMPRE se enxerga: a cor principal contrasta com o corpo de cada skin (o macacão azul não some no pet azul)', () => {
  for (const o of L.OUTFITS) for (const sk of [''].concat(L.SKINS.map((s) => s.id))) {
    const skin = L.SKINS.find((s) => s.id === sk), body = skin ? L.rgb(skin.body) : ORIG, look = L.build(C, { skin: sk, outfit: o.id }), main = look.extras.find((e) => !/^pinta/.test(e.id)).color;
    assert.ok(L.colorDist(main, body) >= 0.45, o.id + ' sobre ' + (sk || 'original') + ': contraste ' + L.colorDist(main, body).toFixed(2));
  }
  const a = L.pick(ORIG, ['#2f6fe4', '#e5383b']); assert.equal(a, '#e5383b', 'o azul some no corpo azul: escolhe o vermelho'); assert.equal(L.pick(ORIG, ['#e5383b', '#2fa84f']), '#e5383b', 'a primeira cor boa vence'); assert.equal(L.pick(ORIG, ['#3b6bff', '#3a6aff']), '#3a6aff'.length ? L.pick(ORIG, ['#3b6bff', '#3a6aff']) : '', 'sem opção boa: devolve uma das listadas');
});
test('as roupas cabem na tela do mascote: o chapéu não passa do topo da câmera, a capa e a saia não passam das laterais, nada afunda abaixo dos pés', () => {
  const TOP = 1.4, SIDE = 1.55, BOTTOM = -1.0;
  for (const o of L.OUTFITS) for (const v of worldVerts(L.build(C, { outfit: o.id }))) { const [x, y] = v.p; assert.ok(y <= TOP, o.id + ' passa do topo: ' + y.toFixed(2)); assert.ok(Math.abs(x) <= SIDE, o.id + ' passa das laterais: ' + x.toFixed(2)); assert.ok(y >= BOTTOM, o.id + ' passa dos pés: ' + y.toFixed(2)); }
});
test('as roupas acompanham o corpo em TODA a faixa de poses (pulo, giro, achatamento, inclinação): matrizes finitas, e se movem junto com o corpo', () => {
  const rng = seeded(21);
  for (const o of L.OUTFITS) { const parts = C.makeParts(); L.apply(C, parts, L.build(C, { skin: 'uva', outfit: o.id }));
    for (let k = 0; k < 120; k++) { const pose = C.defaults(); for (const n of C.PARAMS) pose[n] = C.RANGE[n][0] + rng() * (C.RANGE[n][1] - C.RANGE[n][0]); C.computeParts(parts, pose); L.place(C, parts, pose); for (const e of parts.looks.extras) { for (const v of e.M) assert.ok(Number.isFinite(v), o.id + ' ' + e.id); for (const v of e.N) assert.ok(Number.isFinite(v)); assert.ok(e.vis); } }
    const p0 = C.defaults(), p1 = Object.assign({}, p0, { hop: 0.3 }); C.computeParts(parts, p0); L.place(C, parts, p0); const a = parts.looks.extras[0].M[13]; C.computeParts(parts, p1); L.place(C, parts, p1); assert.ok(Math.abs(parts.looks.extras[0].M[13] - a - 0.3) < 1e-4, o.id + ': sobe junto com o corpo quando ele pula'); }
});

/* ============================ ligações, janela "Meu pet" e privacidade ============================ */
const html = read('public/index.html'), mas = read('public/mascot.js'), pet = read('public/pet.js'), looks = read('public/mascot-looks.js'), conta = read('public/conta.js'), sw = read('public/sw.js'), css = read('public/pet.css');
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
test('as aparências são só desenho: sem rede, sem armazenamento, sem DOM, sem HTML dinâmico, sem eval (mascot-looks.js)', () => {
  const src = code(looks);
  for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\b/, /window\b/, /\beval\s*\(/, /new Function/, /innerHTML/, /insertAdjacentHTML/, /https?:\/\//, /Math\.random/, /Date\b/]) assert.doesNotMatch(src, proibido, 'mascot-looks.js não pode conter ' + proibido);
  assert.match(looks, /module\.exports = api/);
});
test('a escolha fica SÓ neste aparelho: pet.js usa localStorage (chave qc.pet) e mais nada; o mascote em si continua sem armazenamento', () => {
  const src = code(pet);
  for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\beval\s*\(/, /new Function/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /https?:\/\//, /QC\.(state|socket|join|enterRoom|showScreen)/]) assert.doesNotMatch(src, proibido, 'pet.js não pode conter ' + proibido);
  assert.deepEqual([...new Set((src.match(/localStorage\.\w+\(/g) || []))].sort(), ['localStorage.getItem(', 'localStorage.removeItem(', 'localStorage.setItem(']); assert.equal((src.match(/'qc\.pet'/g) || []).length, 1, 'uma única chave');
  assert.match(src, /Looks\.sanitize\(raw \? JSON\.parse\(raw\) : \{\}\)/, 'o que vem do armazenamento sempre passa pela lista de ids conhecidos'); assert.match(src, /catch \(e\) \{ return \{ skin: '', outfit: '' \}; \}/, 'guardado corrompido não derruba nada');
  assert.doesNotMatch(code(mas), /localStorage|sessionStorage/, 'mascot.js continua sem armazenamento'); assert.doesNotMatch(code(mas), /openModal|closeModal|keydown|keyup/, 'mascot.js continua sem janelas nem teclado');
  assert.equal((code(mas).match(/preventDefault\(\)/g) || []).length, 1, 'único preventDefault do mascote: o da perda de contexto WebGL');
});
test('a janela "Meu pet": acessível (diálogo, grupos de opções com nome, botões de 44 px), aberta pelos Ajustes e fechada pelo botão voltar do Android como qualquer janela', () => {
  assert.match(html, /<div id="modal-pet" class="modal pet-modal" hidden role="dialog" aria-modal="true" aria-labelledby="pet-title">/);
  assert.match(html, /<div id="pet-skins" class="pet-opts" role="radiogroup" aria-labelledby="lbl-pet-skin"><\/div>/); assert.match(html, /<div id="pet-outfits" class="pet-opts" role="radiogroup" aria-labelledby="lbl-pet-outfit"><\/div>/);
  assert.match(html, /id="btn-pet"[^>]*aria-describedby="lbl-pet pet-set-note"/); assert.match(html, /<link rel="stylesheet" href="pet\.css">/);
  assert.match(pet, /setAttribute\('role', 'radio'\)/); assert.match(pet, /setAttribute\('aria-label', it\.name\)/); assert.match(pet, /aria-checked/); assert.match(pet, /ArrowRight/);
  assert.match(css, /\.pet-opt \{[^}]*min-width: 44px; height: 44px;/); assert.match(css, /\.pet-opt:focus-visible/); assert.match(css, /#modal-pet\[hidden\] \{ display: none !important; \}/);
  assert.match(html, /<div id="modal-pet"[\s\S]*?<div id="modal-settings"/, 'a janela fica junto das outras janelas (o gerenciador do botão voltar fecha qualquer .modal aberta)');
});
test('ligações: o mascote ouve o botão Loja e o evento de amizade, e segurar o dedo faz carinho; a conta só AVISA o mascote (sem mexer nele) e nunca o deixa derrubar o jogo', () => {
  assert.match(mas, /'link-shop': 'shop'/); assert.match(mas, /HOLD_MS = 650/); assert.match(mas, /brain\.react\('cuddle', \{ dirX: 1 \}\)/); assert.match(mas, /holdTimer = setTimeout\(function \(\) \{ holdTimer = 0; if \(!homeActive\(\)\) return;/, 'só faz carinho se o mascote está à mostra');
  assert.match(mas, /function pointerUp\(\) \{ brain\.pointerEnd\(\); clearHold\(\); \}/, 'soltar cancela'); assert.match(mas, /window\.Mascot\.note = function \(ev\) \{ if \(hidden\) return false;/);
  assert.match(conta, /try \{ if \(window\.Mascot && window\.Mascot\.note\) window\.Mascot\.note\('friend'\); \} catch \(e\) \{[^}]*\}/);
  assert.equal((conta.match(/Mascot\.note\(/g) || []).length, 1, 'um único aviso ao mascote, no evento de amizade');
  assert.match(sw, /'\/mascot-core\.js', '\/mascot-looks\.js', '\/mascot\.js', '\/pet\.js', '\/pet\.css'/); assert.match(sw, /const CACHE = 'quebra-cabeca-v21';/, 'a versão do cache não mudou');
  const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]); const i = (n) => tags.findIndex((t) => t.includes(n)); assert.ok(i('mascot-core.js') < i('mascot-looks.js') && i('mascot-looks.js') < i('mascot.js') && i('mascot.js') < i('pet.js'));
});
test('desenho: as peças novas entram nos mesmos grupos (esfera ou malha própria), sem textura, sem transparência e só com 1 chamada de buffers por grupo', () => {
  assert.match(mas, /if \(Looks\) Looks\.place\(Core, parts, pose\);/); assert.match(mas, /uploadLook\(\);[^\n]*\n\s+ready = true; resize\(\);/, 'as malhas da roupa vão para a GPU logo que ela fica pronta (e de novo se o contexto for refeito)');
  assert.match(mas, /gl\.deleteBuffer\(b\.pos\); gl\.deleteBuffer\(b\.nor\); gl\.deleteBuffer\(b\.idx\)/, 'libera a memória da roupa anterior'); assert.doesNotMatch(code(mas), /createTexture|BLEND|readPixels/);
  assert.ok((read('public/mascot-core.js') + mas).length < 60000, 'núcleo + desenho continuam abaixo de 60 KB'); assert.ok(looks.length < 24000 && pet.length < 8000, 'módulos novos pequenos');
});
