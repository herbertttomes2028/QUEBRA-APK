'use strict';
// Suavidade: recorte da imagem fora da thread principal, pet sem cair para 12 fps ao fim da reação e peças com camada própria.
// Cada decisão foi MEDIDA (CPU 4x mais lenta, navegador sem GPU): os números estão no CONTINUIDADE.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const flat = (s) => s.replace(/\s+/g, ' ').trim();

/* ===================== o worker de recorte, executado de verdade (com um OffscreenCanvas de mentira) ===================== */
function rodaWorker(msg, opts) {
  opts = opts || {}; const saidas = [], desenhos = [], fechou = []; let convertido = null;
  class FakeOC { constructor(w, h) { this.w = w; this.h = h; } getContext() { return { imageSmoothingQuality: '', drawImage: (...a) => desenhos.push(a) }; } convertToBlob(o) { convertido = o; return opts.rejeita ? Promise.reject({ name: 'SecurityError' }) : Promise.resolve({ fake: 'blob', size: 1 }); } }
  const self = { postMessage: (m) => saidas.push(m) }; vm.runInNewContext(read('public/crop-worker.js'), { self, OffscreenCanvas: FakeOC });
  const bm = msg.bm === undefined ? { width: 768, height: 1024, close: () => fechou.push(1) } : msg.bm; self.onmessage({ data: Object.assign({ id: 1, W: 720, H: 960 }, msg, { bm }) });
  return new Promise((res) => setTimeout(() => res({ saidas, desenhos, convertido, fechou }), 20));
}
test('worker: recorta no centro para a proporção pedida e codifica em JPEG 0,9 (o mesmo cálculo do caminho antigo), fecha o bitmap e devolve o blob', async () => {
  let r = await rodaWorker({}); assert.deepEqual(r.desenhos[0].slice(1), [0, 0, 768, 1024, 0, 0, 720, 960], '3:4 sobre 3:4: a imagem inteira'); assert.equal(r.desenhos[0][0].width, 768); assert.deepEqual(JSON.parse(JSON.stringify(r.convertido)), { type: 'image/jpeg', quality: 0.9 }); assert.equal(r.fechou.length, 1, 'bitmap liberado'); assert.deepEqual(JSON.parse(JSON.stringify(r.saidas)), [{ id: 1, blob: { fake: 'blob', size: 1 } }]);
  r = await rodaWorker({ bm: { width: 1600, height: 900, close() {} }, W: 720, H: 960 }); const d = r.desenhos[0]; assert.equal(d[3], 900 * 0.75, 'imagem larga: corta dos lados'); assert.equal(d[1], (1600 - 675) / 2, 'corte centralizado'); assert.equal(d[2], 0);
  r = await rodaWorker({ bm: { width: 600, height: 1600, close() {} }, W: 720, H: 720 }); const e = r.desenhos[0]; assert.equal(e[4], 600, 'imagem alta: corta em cima e embaixo'); assert.equal(e[2], (1600 - 600) / 2); assert.equal(e[1], 0);
  r = await rodaWorker({ W: 300, H: 400 }); assert.deepEqual(r.desenhos[0].slice(5), [0, 0, 300, 400], 'também serve para as miniaturas 300×400');
});
test('worker: recusa pedidos inválidos e devolve o NOME do erro (sem vazar nada) quando a codificação falha, para a página cair no plano B', async () => {
  for (const m of [{ W: 0 }, { H: -5 }, { W: 99999 }, { bm: null }]) { const r = await rodaWorker(m.bm === null ? { bm: null } : m); assert.equal(r.saidas.length, 1); assert.equal(r.saidas[0].erro, 'invalid'); assert.equal(r.saidas[0].blob, undefined); }
  const r = await rodaWorker({}, { rejeita: true }); assert.deepEqual(JSON.parse(JSON.stringify(r.saidas)), [{ id: 1, erro: 'SecurityError' }], 'imagem de outro endereço sem CORS: erro, e a página usa o caminho antigo');
});
test('worker: só calcula (sem rede, sem armazenamento, sem DOM) e o cálculo do recorte é IDÊNTICO ao do caminho antigo (cropMain)', () => {
  const w = code(read('public/crop-worker.js'));
  for (const proibido of [/\bfetch\s*\(|XMLHttpRequest|WebSocket|importScripts|sendBeacon/, /localStorage|indexedDB|caches\b|document\b|window\b/, /\beval\s*\(|new Function/]) assert.doesNotMatch(w, proibido);
  const g = flat(code(read('public/game.js'))), m = g.slice(g.indexOf('function cropMain'), g.indexOf('function cropMain') + 900);
  for (const trecho of ['if (sw / sh > ar) { var nw = sh * ar; sx = (sw - nw) / 2; sw = nw; }', 'else { var nh = sw / ar; sy = (sh - nh) / 2; sh = nh; }', "imageSmoothingQuality = 'high';"]) { assert.ok(flat(w).includes(trecho.replace('ctx.', 'c.')) || flat(w).includes(trecho), 'worker: ' + trecho); assert.ok(m.includes(trecho.replace('ctx.', 'ctx.')) || m.includes(trecho), 'cropMain: ' + trecho); }
});

/* ===================== a página: worker primeiro, plano B sempre ===================== */
const game = read('public/game.js');
test('game.js: o recorte tenta o worker (se o aparelho tiver Worker, OffscreenCanvas, createImageBitmap e convertToBlob) e CAI no caminho antigo se algo falhar', () => {
  assert.match(game, /if \(window\.Worker && window\.OffscreenCanvas && window\.createImageBitmap && typeof OffscreenCanvas\.prototype\.convertToBlob === 'function'\)/);
  assert.match(game, /new Worker\('crop-worker\.js'\)/); assert.match(game, /w\.postMessage\(\{ id: id, bm: bm, W: W, H: H \}, \[bm\]\)/, 'o bitmap é TRANSFERIDO (não copiado)');
  assert.match(game, /return cropInWorker\(img, W, H\)\.then\(function \(blob\) \{ return blobToUrl\(blob, fallbackUrl\); \}, function \(\) \{ return cropMain\(img, W, H, fallbackUrl\); \}\);/);
  assert.match(game, /w\.onerror = function \(\) \{ cropWorker = false; Object\.keys\(cropWait\)\.forEach\(function \(k\) \{ var p = cropWait\[k\]; delete cropWait\[k\]; p\.rej\(new Error\('worker'\)\); \}\);/, 'se o worker morrer, ninguém fica esperando para sempre');
  assert.match(game, /function blobToUrl\(blob, fallbackUrl\) \{\s+if \(!blob\) return fallbackUrl;\s+var url = URL\.createObjectURL\(blob\); ownedImageUrls\.add\(url\); return url;/, 'o endereço do blob continua registrado para ser liberado');
  assert.match(game, /cv\.toBlob\(function \(blob\) \{ res\(blobToUrl\(blob, fallbackUrl\)\); \}, 'image\/jpeg', 0\.9\);/, 'o plano B é o mesmo JPEG 0,9');
  const prep = game.slice(game.indexOf('function prepareImage'), game.indexOf('function prepareThumb')); assert.match(prep, /return cropToBlob\(img, W, H, item\.url\);/); assert.match(prep, /\.catch\(function \(\) \{ return item\.url; \}\)/, 'sem recorte possível: usa a imagem original, como sempre');
});
test('aquecimento: o Worker nasce ao entrar na escolha; o canvas só é aquecido em aparelho SEM worker (na thread principal atrapalharia a transição); as capas NÃO são pré-carregadas (medido: não ajuda e gasta dados)', () => {
  assert.match(game, /function idleDo\(fn, timeout\) \{ if \(window\.requestIdleCallback\) window\.requestIdleCallback\(fn, \{ timeout: timeout \|\| 3000 \}\); else setTimeout\(fn, 1200\); \}/);
  assert.match(game, /function openPick\(mode\) \{\s+state\.pickMode = mode; warmCanvasEncoder\(\);/);
  assert.match(game, /if \(cropWorkerGet\(\)\) return;/, 'com worker: só cria o worker, não gasta a thread principal');
  assert.match(game, /c\.width = c\.height = 16;[^}]*c\.toBlob\(function \(\) \{\}, 'image\/jpeg', 0\.9\)/, 'sem worker: desenho minúsculo, em tempo ocioso');
  assert.doesNotMatch(game, /warmCovers|\}, i \* 250\);/, 'nada de pré-carregar as capas das categorias');
  assert.equal((game.match(/warmCanvasEncoder\(\);/g) || []).length, 1, 'uma única chamada, ao entrar na escolha'); assert.ok(game.indexOf('var warmDone') < game.indexOf('function openPick'));
});
test('pet: depois de uma reação o laço mantém a taxa cheia por 900 ms (as molas ainda assentam) antes de voltar a 12 quadros por segundo; o núcleo do pet NÃO mudou', () => {
  const m = read('public/mascot.js');
  assert.match(m, /var settleUntil = 0, SETTLE_MS = 900;/); assert.match(m, /function capNow\(\) \{ var c = CAPS\[Math\.min\(quality, CAPS\.length - 1\)\], now = performance\.now\(\); if \(brain\.busy\(\)\) \{ settleUntil = now \+ SETTLE_MS; return c\[0\]; \} return now < settleUntil \? c\[0\] : c\[1\]; \}/);
  assert.match(m, /var CAPS = \[\[0, 83\], \[33, 125\], \[50, 166\]\]/, 'os limites por qualidade são os mesmos: aparelho fraco continua baixando o detalhe como antes');
});
test('peças com camada própria e layout isolado (suave.css), carregado por último e guardado no aplicativo instalado, junto com o worker', () => {
  const css = read('public/suave.css'); assert.match(css, /\.piece \{ will-change: transform; contain: layout style; \}/); assert.doesNotMatch(css, /paint|strict|content\b/, 'nada de contain: paint (cortaria a etiqueta e o brilho das peças)');
  const h = read('public/index.html'); assert.match(h, /<link rel="stylesheet" href="suave\.css">\s*<\/head>|<link rel="stylesheet" href="suave\.css">/); assert.ok(h.lastIndexOf('suave.css') > h.lastIndexOf('telas.css'));
  const sw = read('public/sw.js'); assert.match(sw, /'\/suave\.css', '\/crop-worker\.js'/); assert.match(sw, /const CACHE = 'quebra-cabeca-v21';/, 'o nome do cache não mudou');
  assert.match(read('security.js'), /"worker-src 'self'"/, 'a política de segurança já permitia o worker (do próprio site)');
});
