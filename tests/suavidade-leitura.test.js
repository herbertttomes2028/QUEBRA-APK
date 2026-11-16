'use strict';
// Rodada "suavidade" (pedidos do proprietário, 16/11/2026):
// (1) A++: o texto "Jogar com amigos" vazava da caixa do botão;
// (2) rolagem dos textos (Ajustes, Privacidade, Dicas, Como jogar) com engasgos;
// (3) a imagem escolhida "gira e trava, dá alguns engasgos" na abertura da partida (desde a primeira versão).
// Leitura do código + trechos REAIS do game.js rodando isolados (vm). As medições no Chrome estão no CONTINUIDADE.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const game = read('public/game.js'), css = read('public/style.css'), mas = read('public/mascot.js');

// roda a parte da abertura do game.js num ambiente falso, com relógios controlados pelo teste
function abertura(reduzido) {
  const start = game.indexOf('  var go = {'), end = game.indexOf('  function doCreate(', start);
  const helpers = ['  function crossOriginOf(', '  function splashThumbUrl('].map((n) => { const a = game.indexOf(n); return game.slice(a, game.indexOf('\n', a) + 1); }).join('\n');
  const timers = [], frames = [], classes = new Set();
  const splash = { hidden: true, classList: { add: (x) => classes.add(x), remove: (...xs) => xs.forEach((x) => classes.delete(x)) } };
  const elems = { '#go-splash': splash, '#go-img': { style: {} }, '#go-sub': {}, '#go-cancel': { hidden: true } };
  let loading = null;
  const ctx = {
    $: (s) => elems[s], imageItem: () => ({ categoryId: 'fauna', thumb: 'biblioteca/mini/x.webp', url: 'biblioteca/x.webp' }),
    LIBRARY_MEDIA_VERSION: 'v', URL, location: { href: 'http://localhost/', origin: 'http://localhost' },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].f = null; },
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, cancelAnimationFrame: () => {},
    reducedMotion: () => reduzido, announce: () => {}, setLoading: (on) => { loading = on; }, playSound: () => {}, Promise
  };
  vm.runInNewContext(helpers + '\n' + game.slice(start, end), ctx);
  const runTimer = (ms) => { for (const t of timers) if (t.f && t.ms === ms) { const f = t.f; t.f = null; f(); } };
  const runFrames = () => { while (frames.length) frames.shift()(); };
  return { ctx, classes, timers, runTimer, runFrames, loading: () => loading };
}
const tick = () => new Promise((r) => setImmediate(r));

test('abertura: a partida só é montada quando a carta TERMINA a volta (nada pesado durante o giro)', async () => {
  const a = abertura(false);
  a.ctx.showGoSplash('x.webp');
  assert.equal(a.loading(), false, 'o "Carregando" não fica animando escondido atrás da abertura');
  let montou = false;
  a.ctx.goSpinDone().then(() => { montou = true; });
  await tick();
  assert.equal(montou, false, 'antes de girar: ainda não monta');
  a.runFrames();                                   // dois quadros de desenho → começa a girar
  assert.ok(a.classes.has('run'));
  await tick();
  assert.equal(montou, false, 'girando: não monta');
  a.runTimer(2400 + 60);                           // fim da volta (GO_SPIN_MS + folga)
  await tick();
  assert.equal(montou, true, 'terminou a volta: monta a partida');
});

test('abertura: cancelar/fechar libera quem esperava; com movimento reduzido não há espera; há rede de segurança', async () => {
  let a = abertura(false);
  a.ctx.showGoSplash('x.webp');
  let ok = false; a.ctx.goSpinDone().then(() => { ok = true; });
  a.ctx.hideGoSplash(true); await tick();
  assert.equal(ok, true, 'fechar a abertura não deixa a partida presa');

  a = abertura(false);
  a.ctx.showGoSplash('x.webp');
  ok = false; a.ctx.goSpinDone().then(() => { ok = true; });
  a.runTimer(2400 + 1200); await tick();            // o quadro de desenho nunca veio (app em segundo plano): a rede de segurança libera
  assert.equal(ok, true);

  a = abertura(true);
  a.ctx.showGoSplash('x.webp');
  ok = false; a.ctx.goSpinDone().then(() => { ok = true; }); await tick();
  assert.equal(ok, true, 'movimento reduzido: sem giro, sem espera');
});

test('abertura: startGame espera o fim do giro antes de montar; a abertura só sai depois que a partida foi desenhada', () => {
  const sg = game.slice(game.indexOf('  function startGame(snap) {'), game.indexOf('  function fullyInsideBoard('));
  assert.match(sg, /return prepareImage\(imageItem\(snap\.imageId\), snap\.cfg\.COLS, snap\.cfg\.ROWS\);\s*\}\)\.then\(function \(u\) \{\s*urlPronta = u;\s*return goSpinDone\(\);/);
  assert.ok(sg.indexOf('goSpinDone()') < sg.indexOf('buildField(snap)'), 'monta só depois do giro');
  const og = game.slice(game.indexOf('  function onGameShown() {'), game.indexOf('  function doCreate('));
  assert.match(og, /requestAnimationFrame\(function \(\) \{ requestAnimationFrame\(function \(\) \{\s*setTimeout\(function \(\) \{\s*hideGoSplash\(false\);/);
  assert.match(game, /var GO_SPIN_MS = 2400;/);
  assert.match(css, /go-spin 2\.4s/, 'o tempo do giro no CSS bate com GO_SPIN_MS');
  assert.match(game, /function setLoading\(on, text\) \{\s*\$\('#loading'\)\.hidden = !on \|\| !!\(go && go\.on\);/);
  // a abertura continua sem trabalho de imagem pesado e sem medir layout
  const sh = game.slice(game.indexOf('  function showGoSplash('), game.indexOf('  function hideGoSplash('));
  assert.doesNotMatch(sh, /cropToBlob\(|toBlob\(|prepareImage\(|void\s+el\.offsetWidth|\.offsetWidth\s*;/);
});

test('rolagem dos textos: o mascote 3D para de desenhar com qualquer janela, abertura ou "Carregando" por cima da tela inicial', () => {
  assert.match(mas, /var covered = false, COVER_SEL = '\.modal:not\(\[hidden\]\), #go-splash:not\(\[hidden\]\), #loading:not\(\[hidden\]\)';/);
  assert.match(mas, /function homeActive\(\) \{ return home\.classList\.contains\('active'\) && !document\.hidden && !hidden && !covered; \}/);
  assert.match(mas, /if \(c\) stopLoop\(\); else startLoop\(\);/, 'para ao cobrir e volta ao descobrir');
  assert.match(mas, /querySelectorAll\('\.modal, #go-splash, #loading'\)[\s\S]{0,120}attributeFilter: \['hidden'\]/);
  assert.match(css, /\.sheet \{ overscroll-behavior: contain; -webkit-overflow-scrolling: touch; \}/);
});

test('rolagem dos textos: as animações do "Como jogar" só mexem em transparência e posição (nada de repintar cor ou sombra)', () => {
  const kf = [...css.matchAll(/@keyframes (tut-[a-z0-9-]+) \{([\s\S]*?)\}\s*(?=@keyframes|@media|\n\S)/g)];
  assert.ok(kf.length >= 10, 'achou as animações do tutorial');
  for (const [, nome, corpo] of kf) {
    const props = [...corpo.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const p of props) assert.ok(['transform', 'opacity'].includes(p), nome + ' anima "' + p + '" (só transform/opacity)');
  }
  assert.match(css, /html:not\(\[data-motion="reduce"\]\) \.tb i:nth-child\(6\)::after \{ animation: tut-drag-cell/);
  assert.match(css, /html:not\(\[data-motion="reduce"\]\) \.t-rot \.pi::after \{ animation: tut-rot-ring/);
});

test('A++: "Jogar com amigos" quebra a linha em vez de vazar da caixa', () => {
  const r = css.slice(css.indexOf('.btn-duel {'), css.indexOf('}', css.indexOf('.btn-duel {')));
  assert.match(r, /white-space: normal;/);
  assert.doesNotMatch(r, /white-space: nowrap/);
  assert.match(r, /overflow-wrap: break-word;/);
});
