'use strict';
// Rodada "suavidade-geral" (17/11/2026): três causas MEDIDAS de trabalho à toa na thread principal, corrigidas sem mudar o que se vê.
// (1) mascote: o IntersectionObserver só fica ligado com a tela inicial rolada (com ele ligado, qualquer animação CSS, como a neve do
//     Natal, fazia a página inteira ser refeita a 60 quadros/s) e o canvas não é mais realocado ao sair e voltar da tela inicial;
// (2) imagem da partida decodificada FORA da thread principal (Blob → createImageBitmap), com o caminho de sempre como plano B;
// (3) as consultas matchMedia são criadas uma vez só. Números no CONTINUIDADE.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const game = read('public/game.js');
const mascot = read('public/mascot.js');

// pega o texto de uma função pelo nome (contando chaves; as funções daqui não têm chaves dentro de textos)
function fn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i >= 0, 'função ' + name + ' existe');
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, j + 1);
}
function bloco(src, inicio) {
  const i = src.indexOf(inicio); assert.ok(i >= 0, 'bloco: ' + inicio);
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (d === 0) break; } }
  return src.slice(i, j + 1);
}

/* ===================== (1) mascote ===================== */
test('mascote: o IntersectionObserver NÃO observa nada com a tela inicial no topo; liga ao rolar, desliga ao voltar ao topo (e o mascote volta a desenhar)', () => {
  const src = bloco(mascot, 'if (window.IntersectionObserver) {');
  const chamadas = [];
  class IO { constructor(cb) { this.cb = cb; IO.ultimo = this; } observe(el) { chamadas.push('observe:' + el.id); } disconnect() { chamadas.push('disconnect'); } }
  const ouvintes = {};
  const home = { scrollTop: 0, addEventListener: (ev, f, o) => { ouvintes[ev] = { f, o }; } }, btn = { id: 'mascot' };
  const ctx = { window: { IntersectionObserver: IO }, IntersectionObserver: IO, home, btn, inView: true, loop: [], startLoop() { ctx.loop.push('start'); }, stopLoop() { ctx.loop.push('stop'); } };
  vm.runInNewContext('(function(){ var inView = true; var startLoop = function(){ __c.startLoop(); }, stopLoop = function(){ __c.stopLoop(); };\n' + src.replace(/\binView\b/g, '__c.inView') + '\n})()', Object.assign(ctx, { __c: ctx }));
  assert.deepEqual(chamadas, [], 'ao carregar: nenhum alvo observado (a neve do Natal não obriga mais a refazer a página a cada quadro)');
  assert.ok(ouvintes.scroll && ouvintes.scroll.o && ouvintes.scroll.o.passive === true, 'ouve a rolagem da tela inicial, sem travar a rolagem');
  home.scrollTop = 120; ouvintes.scroll.f();
  assert.deepEqual(chamadas, ['observe:mascot'], 'rolou: passa a vigiar se o mascote saiu de vista');
  ouvintes.scroll.f(); assert.deepEqual(chamadas, ['observe:mascot'], 'continua rolada: não observa de novo');
  IO.ultimo.cb([{ isIntersecting: false }]); assert.equal(ctx.inView, false); assert.deepEqual(ctx.loop, ['stop'], 'fora de vista: para de desenhar (como antes)');
  home.scrollTop = 0; ouvintes.scroll.f();
  assert.deepEqual(chamadas, ['observe:mascot', 'disconnect'], 'de volta ao topo: desliga o observador');
  assert.equal(ctx.inView, true); assert.deepEqual(ctx.loop, ['stop', 'start'], 'e o mascote volta a desenhar');
  assert.doesNotMatch(mascot, /new IntersectionObserver\([^)]*\)[^;]*\)\.observe\(btn\)/, 'nada de observar o botão desde a abertura');
});

test('mascote: com a tela inicial escondida (botão com 0 px) o canvas NÃO é realocado nem redesenhado; com tamanho, segue igual', () => {
  const src = fn(mascot, 'resize');
  assert.match(src, /var r = btn\.getBoundingClientRect\(\), dpr = [^\n]*\n(\s*\/\/[^\n]*\n)*\s*if \(!r\.width \|\| !r\.height\) return;/, 'a checagem vem logo depois de medir o botão, antes de mexer no canvas');
  const run = (rect, canvas0) => {
    const desenhos = [], canvas = Object.assign({}, canvas0);
    const ctx = { btn: { getBoundingClientRect: () => rect }, canvas, quality: 0, window: { devicePixelRatio: 3 }, Math, lastPose: { x: 1 }, gl: { viewport() {} }, FOV: 0.5, CAM_Y: 0.15, CAM_D: 5.2, proj: [], view: [], vp: [],
      Core: { mPerspective() {}, mIdent() {}, mMul() {} }, drawPose: (p) => desenhos.push(p) };
    vm.runInNewContext(src + '; resize();', ctx);
    return { canvas, desenhos };
  };
  const esc = run({ width: 0, height: 0 }, { width: 375, height: 281 });
  assert.deepEqual([esc.canvas.width, esc.canvas.height], [375, 281], 'escondida: o canvas fica no tamanho cheio (antes ia para 64×48)');
  assert.equal(esc.desenhos.length, 0, 'escondida: nada é desenhado');
  const vis = run({ width: 187.5, height: 140.5 }, { width: 64, height: 48 });
  assert.deepEqual([vis.canvas.width, vis.canvas.height], [375, 281], 'visível: mesmo cálculo de antes (densidade até 2)');
  assert.equal(vis.desenhos.length, 1, 'mudou de tamanho: redesenha (senão o canvas fica em branco)');
  const igual = run({ width: 187.5, height: 140.5 }, { width: 375, height: 281 });
  assert.equal(igual.desenhos.length, 0, 'mesmo tamanho: não realoca nem redesenha');
});

/* ===================== (3) matchMedia uma vez ===================== */
test('Ajustes: prefersDark() e reducedMotion() reaproveitam a MESMA consulta (o .matches acompanha o celular) e respeitam o ajuste do jogo', () => {
  const src = [fn(game, 'mqOf'), fn(game, 'prefersDark'), fn(game, 'reducedMotion')].join('\n');
  const criadas = [];
  const mm = (q) => { const o = { q, matches: false }; criadas.push(o); return o; };
  const ctx = { window: { matchMedia: mm }, state: { settings: { motion: 'auto' } } };
  vm.runInNewContext(src, ctx);
  for (let i = 0; i < 50; i++) { ctx.reducedMotion(); ctx.prefersDark(); }
  assert.equal(criadas.length, 2, 'uma consulta para cada pergunta, não uma por chamada');
  assert.equal(ctx.reducedMotion(), false);
  criadas.find((o) => /reduced-motion/.test(o.q)).matches = true; assert.equal(ctx.reducedMotion(), true, 'o celular mudou "reduzir movimento": vale na hora');
  criadas.find((o) => /reduced-motion/.test(o.q)).matches = false; ctx.state.settings.motion = 'reduce'; assert.equal(ctx.reducedMotion(), true, 'o ajuste do jogo continua valendo');
  criadas.find((o) => /color-scheme/.test(o.q)).matches = true; assert.equal(ctx.prefersDark(), true);
  const sem = { window: {}, state: { settings: { motion: 'auto' } } }; vm.runInNewContext(src, sem);
  assert.equal(sem.reducedMotion(), false); assert.equal(sem.prefersDark(), false, 'aparelho sem matchMedia: como antes, falso');
});

/* ===================== (2) imagem da partida decodificada fora da thread principal ===================== */
function montaRecorte(opts) {
  opts = opts || {};
  const log = { fetch: [], bitmap: [], img: [], worker: [], main: [] };
  const src = ['cropSizeOf', 'prepareImage', 'postCrop', 'cropInWorker', 'bitmapOfUrl', 'cropFromFile', 'blobToUrl', 'cropToBlob'].map((n) => fn(game, n)).join('\n');
  const worker = opts.semWorker ? false : { postMessage(m) { log.worker.push({ W: m.W, H: m.H, q: m.q, de: m.bm.de }); Promise.resolve().then(() => { const p = ctx.cropWait[m.id]; delete ctx.cropWait[m.id]; if (opts.workerFalha) p.rej(new Error('crop')); else p.res({ blob: true }); }); } };
  const ctx = {
    imgCache: {}, preparedKeys: [], cropSeq: 0, cropWait: {}, ownedImageUrls: new Set(), Promise, Error,
    location: { href: 'https://jogo.exemplo/', origin: 'https://jogo.exemplo' }, URL: Object.assign(function (u, b) { return new URL(u, b); }, { createObjectURL: () => 'blob:https://jogo.exemplo/recorte' }),
    window: { fetch: true },
    fetch: (u, o) => { log.fetch.push({ u, o }); if (opts.fetchFalha) return Promise.resolve({ ok: false, status: 404 }); return Promise.resolve({ ok: true, blob: () => Promise.resolve({ tipo: 'blob', u }) }); },
    createImageBitmap: (x) => { log.bitmap.push(x.tipo || 'img'); if (opts.decodeFalha && x.tipo === 'blob') return Promise.reject(new Error('decode')); return Promise.resolve({ de: x.tipo || 'img', width: opts.w || 768, height: opts.h || 1024, close() {} }); },
    cropWorkerGet: () => worker,
    loadImage: (u) => { log.img.push(u); if (opts.imgFalha) return Promise.reject(new Error('img')); return Promise.resolve({ tipo: undefined, naturalWidth: opts.w || 768, naturalHeight: opts.h || 1024 }); },
    cropMain: (img, W, H, fb, q) => { log.main.push({ W, H, q }); return Promise.resolve('blob:principal'); }
  };
  vm.runInNewContext(src, ctx);
  return { ctx, log };
}

test('imagem da partida: endereço do próprio site → baixa como Blob, decodifica em segundo plano e recorta no worker (sem <img>, sem decodificar na thread principal)', async () => {
  const { ctx, log } = montaRecorte();
  const url = await ctx.prepareImage({ file: 'f1', url: 'biblioteca/lib-fauna-01.webp?v=capas-20261031' }, 4, 5);
  assert.equal(url, 'blob:https://jogo.exemplo/recorte');
  assert.deepEqual(log.fetch.map((x) => x.u), ['https://jogo.exemplo/biblioteca/lib-fauna-01.webp?v=capas-20261031']);
  assert.equal(log.fetch[0].o.credentials, 'same-origin');
  assert.deepEqual(log.bitmap, ['blob'], 'o bitmap sai do Blob (decodificação fora da thread principal), nunca do <img>');
  assert.deepEqual(log.img, [], 'nenhum <img> carregado para o recorte');
  assert.deepEqual(log.worker, [{ W: 720, H: 900, q: 0.9, de: 'blob' }], 'mesmo tamanho e mesma qualidade de antes (720 de largura; 0,9)');
  assert.ok(ctx.ownedImageUrls.has('blob:https://jogo.exemplo/recorte'), 'o endereço do recorte continua registrado para ser liberado');
  assert.equal(ctx.preparedKeys[0], 'f1|4x5'); assert.equal(await ctx.prepareImage({ file: 'f1', url: 'x' }, 4, 5), url, 'mesma chave (imagem + grade): reaproveita');
  assert.equal(log.fetch.length, 1);
});

test('imagem da partida: quantidades grandes (8 colunas) usam o tamanho ORIGINAL do recorte e JPEG 0,95, igual ao caminho de sempre', async () => {
  const a = montaRecorte({ w: 768, h: 1024 }); await a.ctx.prepareImage({ file: 'f', url: '/biblioteca/x.webp' }, 8, 12);
  const b = montaRecorte({ w: 768, h: 1024, semWorker: true }); await b.ctx.prepareImage({ file: 'f', url: '/biblioteca/x.webp' }, 8, 12);
  assert.deepEqual(a.log.worker, [{ W: 683, H: 1025, q: 0.95, de: 'blob' }]);
  assert.deepEqual(b.log.main, [{ W: 683, H: 1025, q: 0.95 }], 'o plano B calcula exatamente o mesmo tamanho');
});

test('imagem da partida: outro endereço (armazenamento externo), blob: ou data: → NÃO usa fetch (a política de segurança bloquearia e mandaria relatório); vai pelo <img> de sempre', async () => {
  for (const u of ['https://midia.exemplo/img/a.jpg', 'blob:https://jogo.exemplo/abc', 'data:image/png;base64,AAAA']) {
    const { ctx, log } = montaRecorte();
    const r = await ctx.prepareImage({ file: u, url: u }, 4, 5);
    assert.deepEqual(log.fetch, [], 'sem fetch para ' + u.slice(0, 12));
    assert.deepEqual(log.img, [u], 'carrega pelo <img>, como sempre');
    assert.deepEqual(log.bitmap, ['img']); assert.deepEqual(log.worker, [{ W: 720, H: 900, q: 0.9, de: 'img' }]);
    assert.equal(r, 'blob:https://jogo.exemplo/recorte');
  }
});

test('imagem da partida: se o download, a decodificação do Blob ou o worker falharem, cai no caminho de sempre; sem nada possível, usa a imagem original', async () => {
  let x = montaRecorte({ fetchFalha: true }); assert.equal(await x.ctx.prepareImage({ file: 'a', url: '/b/a.webp' }, 4, 5), 'blob:https://jogo.exemplo/recorte'); assert.deepEqual(x.log.img, ['/b/a.webp'], 'resposta não-ok: plano B');
  x = montaRecorte({ decodeFalha: true }); await x.ctx.prepareImage({ file: 'a', url: '/b/a.webp' }, 4, 5); assert.deepEqual(x.log.bitmap, ['blob', 'img'], 'Blob que não decodifica (ex.: SVG): plano B');
  x = montaRecorte({ workerFalha: true }); assert.equal(await x.ctx.prepareImage({ file: 'a', url: '/b/a.webp' }, 4, 5), 'blob:principal'); assert.deepEqual(x.log.main, [{ W: 720, H: 900, q: 0.9 }], 'worker falhou duas vezes: recorte na thread principal (o plano B de sempre)');
  x = montaRecorte({ semWorker: true }); await x.ctx.prepareImage({ file: 'a', url: '/b/a.webp' }, 4, 5); assert.deepEqual(x.log.fetch, [], 'sem worker não há para onde mandar o bitmap: nem baixa de novo'); assert.deepEqual(x.log.main, [{ W: 720, H: 900, q: 0.9 }]);
  x = montaRecorte({ fetchFalha: true, imgFalha: true }); assert.equal(await x.ctx.prepareImage({ file: 'a', url: '/b/a.webp' }, 4, 5), '/b/a.webp', 'nada deu certo: a imagem original, como sempre');
});

test('imagem da partida: o worker de recorte e a mensagem para ele não mudaram (o bitmap continua TRANSFERIDO)', () => {
  assert.match(fn(game, 'postCrop'), /w\.postMessage\(\{ id: id, bm: bm, W: W, H: H, q: q \}, \[bm\]\)/);
  assert.match(fn(game, 'cropInWorker'), /return createImageBitmap\(img\)\.then\(function \(bm\) \{ return postCrop\(bm, W, H, q\); \}\);/);
  assert.match(fn(game, 'bitmapOfUrl'), /u\.origin !== location\.origin \|\| !\/\^https\?:\$\/\.test\(u\.protocol\)/, 'só endereços http(s) do próprio site');
  assert.match(read('security.js'), /"connect-src 'self'"/, 'a política de segurança permite fetch ao próprio site (nada mudou nela)');
});
