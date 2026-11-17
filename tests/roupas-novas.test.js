'use strict';
// Rodada roupas-novas (17/11/2026): 20 roupas novas para o pet, bem à mostra (como as asas de anjo), sem mexer no rosto.
// Preços escolhidos pelo proprietário: 5 grátis; a maioria por 150, algumas por 200, poucas por 300 e uma por 500.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../public/mascot-core.js');
const L = require('../public/mascot-looks.js');
const shop = require('../shop');
const root = path.join(__dirname, '..');

const NOVAS = {
  laco: 0, 'coroa-flores': 0, 'chapeu-palha': 0, 'gorro-la': 0, aniversario: 0,
  gatinho: 150, havaiano: 150, medalha: 150, 'faixa-campeao': 150, explorador: 150, chef: 150, 'capa-chuva': 150, 'saia-florida': 150,
  mochila: 200, boia: 200, 'chapeu-couro': 200,
  unicornio: 300, borboleta: 300,
  foguete: 500
};

test('as 19 roupas novas (o capacete viking saiu antes da entrega, a pedido do proprietário): na loja com o preço aprovado, no pet com o mesmo nome, grátis ⇔ grátis, e com foto', () => {
  const precos = Object.values(NOVAS), conta = (p) => precos.filter((x) => x === p).length;
  assert.deepEqual([conta(0), conta(150), conta(200), conta(300), conta(500)], [5, 8, 3, 2, 1], '5 grátis, 8 por 150, 3 por 200, 2 por 300 e 1 por 500');
  for (const [look, price] of Object.entries(NOVAS)) {
    const it = shop.ITEMS.find((i) => i.id === 'roupa-' + look), o = L.byId(L.OUTFITS, look);
    assert.ok(it && o, look); assert.equal(it.price, price, look + ': preço'); assert.equal(it.category, 'roupas'); assert.equal(!!o.free, price === 0, look + ': grátis');
    assert.equal(it.name, o.name); assert.ok(fs.existsSync(path.join(root, 'public/pet/roupa-' + look + '.webp')), look + ': foto na loja');
  }
  const ordem = shop.ITEMS.filter((i) => i.category === 'roupas').map((i) => i.price), gratis = ordem.filter((p) => p === 0).length;
  assert.ok(ordem.slice(0, gratis).every((p) => p === 0), 'na loja, as grátis primeiro'); assert.deepEqual(ordem.slice(gratis), ordem.slice(gratis).slice().sort((a, b) => a - b), 'e as pagas da mais barata para a mais cara');
  assert.deepEqual(L.OUTFITS.map((o) => o.id), shop.ITEMS.filter((i) => i.category === 'roupas').map((i) => i.look), 'a janela "Meu pet" mostra na mesma ordem da loja');
});

test('peças juntadas numa malha só ficam EXATAMENTE onde ficaria a peça solta (mesmo giro, tamanho e posição de Core.mTRS)', () => {
  // a medalha tem uma fita juntada (várias bolinhas giradas): cada vértice tem de estar na superfície da bolinha que Core.mTRS desenharia
  const look = L.build(C, { outfit: 'medalha' }), fita = look.extras.find((e) => e.id === 'medalhaFita'), g = look.geoms[fita.geom];
  assert.equal(g.pos.length % 3, 0); assert.ok(g.count === g.idx.length && g.idx.length % 3 === 0);
  const src = fs.readFileSync(path.join(root, 'public/mascot-looks.js'), 'utf8');
  assert.match(src, /function merge\(items\)/); assert.match(src, /function kit\(\)/);
  const one = g;
  for (let i = 0; i < one.pos.length; i += 3) assert.ok(Number.isFinite(one.pos[i]) && Number.isFinite(one.nor[i]));
  // cada vértice da fita fica numa das 14 bolinhas: (p - t_k) passa por M_k^-1 e cai na esfera de raio 1
  let fora = 0; const N = one.pos.length / 3, porBola = N / 14;
  assert.equal(porBola, Math.round(porBola), '14 bolinhas iguais');
  for (let v = 0; v < N; v++) { const k = Math.floor(v / porBola), sd = k < 7 ? -1 : 1, a = (k % 7) / 6, P0 = [sd * 0.78, -0.32], P1 = [sd * 0.08, -0.63], ang = Math.atan2(P1[1] - P0[1], P1[0] - P0[0]);
    const x = P0[0] + (P1[0] - P0[0]) * a, y = P0[1] + (P1[1] - P0[1]) * a, Mk = new Float32Array(16); C.mTRS(Mk, x, y, L.front(C.BODY, x, y) + 0.012, 0, 0, ang, 0.07, 0.034, 0.014);
    const px = one.pos[v * 3] - Mk[12], py = one.pos[v * 3 + 1] - Mk[13], pz = one.pos[v * 3 + 2] - Mk[14];
    const ux = (Mk[0] * px + Mk[1] * py + Mk[2] * pz) / (0.07 * 0.07), uy = (Mk[4] * px + Mk[5] * py + Mk[6] * pz) / (0.034 * 0.034), uz = (Mk[8] * px + Mk[9] * py + Mk[10] * pz) / (0.014 * 0.014);
    if (Math.abs(Math.hypot(ux, uy, uz) - 1) > 1e-3) fora++; }
  assert.equal(fora, 0, 'todos os vértices da fita estão na superfície da bolinha que o jogo desenharia solta');
});

test('as roupas novas continuam leves: nenhuma tem mais desenhos que a mais pesada de antes, e cada uma desenha no máximo 2.500 vértices por quadro', () => {
  const antes = Math.max(...['capa-heroi', 'cachecol', 'mago', 'bailarina', 'macacao', 'papai-noel', 'bandana', 'fones', 'cartola', 'asas-anjo', 'coroa'].map((id) => L.build(C, { outfit: id }).extras.length));
  for (const look of Object.keys(NOVAS)) {
    const b = L.build(C, { outfit: look }), verts = Object.values(b.geoms).reduce((s, g) => s + g.pos.length / 3, 0) + b.extras.filter((e) => e.geom === 'sph').length * 221;
    assert.ok(b.extras.length <= antes, look + ': ' + b.extras.length + ' desenhos (as antigas chegam a ' + antes + ')'); assert.ok(verts <= 2500, look + ': ' + verts + ' vértices');
  }
});
