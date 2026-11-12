'use strict';
// Fundos padronizados + cabeçalhos novos (categorias e coleções). O que decide desbloqueio e progresso das coleções NÃO mudou (retrato da main anterior).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const F = require('../scripts/fundos.js');
const P = require('../public/pecas.js');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
const lum = (hex) => { const n = parseInt(hex.slice(1), 16), f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/* ===================== o gerador é a fonte única ===================== */
test('os arquivos de fundo do repositório são EXATAMENTE o que a especificação gera (nada editado à mão); nenhum arquivo sobrando', () => {
  const arq = F.tudo();
  for (const [f, c] of Object.entries(arq)) assert.equal(read('public/' + f), c, f + ' está fora de dia: rode node scripts/fundos.js');
  const reais = fs.readdirSync(path.join(root, 'public/fundos')).map((f) => 'fundos/' + f).sort(), esperados = Object.keys(arq).filter((f) => f.startsWith('fundos/')).sort();
  assert.deepEqual(reais, esperados, 'só existem os arquivos gerados');
});
const NAO_JANELA = Object.keys(F.VARIACOES).filter((n) => n !== 'janela');
test('cada variação segue as regras do JSON de referência: 4 a 7 peças, opacidade 0,20 a 0,45, peças nas BORDAS, centro livre, cores da família do jogo', () => {
  const L = F.LIMITES, w = F.LARGURA, h = F.ALTURA;
  for (const [nome, v] of Object.entries(F.VARIACOES)) {
    assert.ok(v.pecas.length >= L.pecasMin && v.pecas.length <= L.pecasMax, nome + ': número de peças ' + v.pecas.length);
    assert.equal(new Set(v.pecas.map((p) => p[0])).size, v.pecas.length, nome + ': ids únicos');
    for (const [id, cx, cy, tam, ang, cor, op] of v.pecas) {
      const q = nome + '/' + id; assert.ok(F.COR[cor], q + ': cor conhecida'); assert.ok(op >= L.opacMin && op <= L.opacMax, q + ': opacidade ' + op); assert.ok(tam >= 80 && tam <= 180, q + ': tamanho ' + tam); assert.ok(Math.abs(ang) <= 30, q + ': rotação discreta');
      assert.ok(cx <= 100 || cx >= w - 100, q + ': encostada na lateral (' + cx + ')');
      const dentro = cx > L.centro.x0 * w && cx < L.centro.x1 * w && cy > L.centro.y0 * h && cy < L.centro.y1 * h; assert.ok(!dentro, q + ': o centro fica livre');
      const alcance = cx < w / 2 ? cx + tam * 0.75 : cx - tam * 0.75;                                        // até onde a peça (com os dentes e a rotação) chega para dentro
      assert.ok(cx < w / 2 ? alcance <= L.centro.x0 * w + 40 : alcance >= L.centro.x1 * w - 40, q + ': não invade a área livre central (chega a ' + Math.round(alcance) + ')');
    }
    for (const l of v.luzes) { assert.ok(l[1] <= 0.4 && l[1] >= 0.2, nome + ': luz discreta'); assert.match(l[0], /^#[0-9A-F]{6}$/); }
  }
});
test('a variação "desafio" é a REFERÊNCIA do JSON (6 peças, cores, posições e luzes iguais) e as demais são diferentes dela e entre si', () => {
  assert.deepEqual(F.VARIACOES.desafio.pecas.map((p) => p.slice(1)), [[56, 325, 175, -16, 'azul', 0.38], [644, 248, 170, 16, 'cinza', 0.33], [12, 826, 88, 25, 'oliva', 0.42], [688, 789, 105, -13, 'roxo', 0.31], [24, 1270, 125, 16, 'turquesa', 0.34], [708, 1478, 177, -22, 'indigo', 0.33]]);
  assert.deepEqual([F.COR.azul, F.COR.cinza, F.COR.oliva, F.COR.roxo, F.COR.turquesa, F.COR.indigo], ['#25448F', '#605A5D', '#77704E', '#7E326F', '#0E929E', '#6555CA'], 'as cores do JSON'); assert.equal(F.BASE, '#111633');
  assert.deepEqual(F.VARIACOES.desafio.luzes, [['#24458E', 0.35, 22, 28, 55], ['#542C86', 0.35, 88, 88, 44]]);
  const nomes = Object.keys(F.VARIACOES), sig = (n) => F.VARIACOES[n].pecas.map((p) => p[1] + ',' + p[2] + ',' + p[4]);
  for (let i = 0; i < nomes.length; i++) for (let j = i + 1; j < nomes.length; j++) { const a = sig(nomes[i]), b = sig(nomes[j]); assert.equal(a.filter((x) => b.includes(x)).length, 0, nomes[i] + ' e ' + nomes[j] + ' não podem repetir a mesma peça na mesma posição e rotação'); }
  const cores = (n) => new Set(F.VARIACOES[n].pecas.map((p) => p[5]).join()); assert.notEqual([...F.VARIACOES.loja.pecas.map((p) => p[5])].sort().join(), [...F.VARIACOES.amigos.pecas.map((p) => p[5])].sort().join(), 'cada área tem os seus tons');
});
test('nuances pedidas: Loja em amarelo e roxo, Amigos em turquesa/verde e rosa, Ajustes em azul e cinza; a montagem tem só 4 peças pequenas e bem discretas', () => {
  const set = (n) => new Set(F.VARIACOES[n].pecas.map((p) => p[5]));
  for (const c of set('loja')) assert.ok(['ouro', 'amarelo', 'roxo', 'lilas'].includes(c), 'loja: ' + c);
  for (const c of set('amigos')) assert.ok(['turquesa', 'verde', 'rosa'].includes(c), 'amigos: ' + c);
  for (const c of set('ajustes')) assert.ok(['azul', 'cinza', 'indigo'].includes(c), 'ajustes: ' + c);
  const m = F.VARIACOES.montagem; assert.equal(m.pecas.length, 4); for (const p of m.pecas) { assert.ok(p[6] <= 0.3 && p[3] <= 130, 'montagem: peça discreta ' + p[0]); assert.ok(p[2] < 300 || p[2] > 1300, 'montagem: só nos cantos de cima e de baixo, longe do tabuleiro'); }
});
test('os SVG são seguros e leves: só formas e gradientes (sem script, imagem, link ou fonte externa), 720×1600 com corte pelas bordas, o fundo escuro tem a base marinho, o claro o degradê lavanda e a folha de janela nenhum dos dois', () => {
  for (const f of fs.readdirSync(path.join(root, 'public/fundos'))) {
    const s = read('public/fundos/' + f);
    assert.doesNotMatch(s, /<script|<image|<foreignObject|href=|xlink|url\(http|@import|onload|onerror|<style/i, f); assert.ok(s.length < 7000, f + ' pesa pouco: ' + s.length);
    assert.equal((s.match(/<svg/g) || []).length, 1); assert.equal((s.match(/<\/svg>/g) || []).length, 1); assert.equal((s.match(/<path /g) || []).length, (s.match(/\/>/g) || []).length - (s.match(/<rect /g) || []).length - (s.match(/<stop /g) || []).length);
    if (f === 'peca-icone.svg') continue;
    assert.match(s, /viewBox="0 0 720 1600" preserveAspectRatio="xMidYMid slice"/, f);
    const janela = /janela/.test(f), claro = /-claro\.svg$/.test(f) && !janela;
    assert.equal(/<rect width="720" height="1600" fill="#111633"\/>/.test(s), !janela && !claro, f + ': a base marinho só no fundo escuro completo');
    assert.equal(s.includes('fill="url(#bg)"'), claro, f + ': o fundo claro tem o degradê lavanda'); if (claro) assert.ok(s.includes('stop-color="' + F.CLARO.topo + '"') && s.includes('stop-color="' + F.CLARO.base + '"'), f + ': as duas pontas do degradê claro');
    if (janela) assert.ok(!/<rect|<linearGradient|<radialGradient/.test(s), f + ': a folha da janela só tem peças');
  }
});
test('o CSS gerado: o fundo vale nas 5 telas e ACOMPANHA O TEMA (lavanda no claro, marinho no escuro), cada variação aponta para arquivos que existem, e as janelas trocam de peças pastel e marinho', () => {
  const css = read('public/fundos.css'); assert.match(css, /^\/\* GERADO por scripts\/fundos\.js/);
  assert.match(css, new RegExp(':root \\{ --fundo-base: ' + F.CLARO.base + '; --janela-img: url\\("fundos/janela-claro\\.svg"\\); \\}'));
  assert.match(css, new RegExp('html\\[data-theme="dark"\\] \\{ --fundo-base: ' + F.BASE + '; --janela-img: url\\("fundos/janela-escuro\\.svg"\\); \\}'));
  assert.match(css, /html body :is\(#screen-home, #screen-me, #screen-pick, #screen-lobby, #screen-game\)\[data-fundo\] \{ background-color: var\(--fundo-base\); background-image: var\(--fundo-img\); background-position: center; background-size: cover; background-repeat: no-repeat; \}/);
  for (const m of css.matchAll(/url\("([^"]+)"\)/g)) assert.ok(fs.existsSync(path.join(root, 'public', m[1])), m[1] + ' existe');
  for (const n of NAO_JANELA) { assert.match(css, new RegExp('html body :is\\([^)]*\\)\\[data-fundo="' + n + '"\\] \\{ --fundo-img: url\\("fundos/' + n + '-claro\\.svg"\\); \\}')); assert.match(css, new RegExp('html\\[data-theme="dark"\\] body :is\\([^)]*\\)\\[data-fundo="' + n + '"\\] \\{ --fundo-img: url\\("fundos/' + n + '\\.svg"\\); \\}')); }
  for (const n of ['loja', 'ajustes', 'amigos']) assert.match(css, new RegExp('\\.sheet\\[data-janela="' + n + '"\\] \\{ --janela-img: url\\("fundos/' + n + '-janela-claro\\.svg"\\)'));
});

/* ===================== ligação nas telas ===================== */
test('cada tela e janela tem a sua variação, e os estilos vêm por último (depois de todos os outros), para ganhar dos fundos antigos', () => {
  const h = read('public/index.html');
  for (const [id, v] of [['screen-home', 'inicio'], ['screen-me', 'conta'], ['screen-pick', 'categorias'], ['screen-lobby', 'desafio'], ['screen-game', 'montagem']]) assert.match(h, new RegExp('<section id="' + id + '" class="screen[^"]*" data-fundo="' + v + '">'), id);
  assert.match(h, /<div class="sheet shop-sheet" data-janela="loja">/); assert.match(h, /<div class="sheet set-sheet" data-janela="ajustes">/); assert.equal((h.match(/data-janela="amigos"/g) || []).length, 2);
  const links = [...h.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]); assert.deepEqual(links.slice(-3), ['fundos.css', 'telas.css', 'suave.css']); assert.ok(links.indexOf('style.css') < links.indexOf('loja.css') && links.indexOf('pet.css') < links.indexOf('fundos.css'));
  const sc = [...h.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]); assert.ok(sc.indexOf('pecas.js') < sc.indexOf('cabecalhos.js') && sc.indexOf('cabecalhos.js') < sc.indexOf('game.js'));
  const sw = read('public/sw.js'); for (const f of ['/pecas.js', '/cabecalhos.js', '/fundos.css', '/telas.css', '/fundos/peca-icone.svg', ...NAO_JANELA.map((n) => '/fundos/' + n + '.svg'), ...NAO_JANELA.map((n) => '/fundos/' + n + '-claro.svg'), '/fundos/janela-claro.svg', '/fundos/janela-escuro.svg']) assert.ok(sw.includes("'" + f + "'"), 'service worker guarda ' + f);
  assert.match(sw, /const CACHE = 'quebra-cabeca-v21';/, 'a versão do cache não mudou');
});
test('a tela de montagem mantém a cor da bandeja equipada (loja define data-tint) e as peças decorativas ficam só nas bordas, longe das peças jogáveis', () => {
  const loja = read('public/loja.js'), tc = read('public/telas.css');
  assert.match(loja, /sg\.removeAttribute\('data-tint'\);/); assert.match(loja, /themed = true; sg\.setAttribute\('data-tint', '1'\);/);
  assert.match(tc, /html body #screen-game\[data-fundo\]\[data-tint\] \{ background-color: var\(--paper\); background-image: var\(--janela-img\), linear-gradient\(180deg, var\(--paper\) 0%, var\(--paper-3\) 100%\); \}/, 'o degradê da bandeja continua, com as peças por cima');
  assert.ok(!/pointer-events:\s*auto/.test(read('public/fundos.css')), 'o fundo nunca captura toques');
});

/* ===================== as regras das coleções não mudaram ===================== */
const LIB = {"libraryDone": "7505ba08611c92bc", "libraryGate": "5a444e672a4b2959", "libraryGateDone": "06efd627db179c40", "libraryHasGate": "5b02bcca419b90b1", "libraryDependents": "22bc0b1ad735805a", "librarySummary": "f9b7dbc7e05fc2e0", "libraryAvailable": "e757c9f63b876c21", "buyLibraryCategory": "4d0ef58d9290245d", "libraryPreview": "d98472754de78e98", "refreshLibrary": "180dfe96a152292a", "libraryToken": "618a81599b2a4266"};
function trecho(src, n) { const m = src.match(new RegExp('\\n  function ' + n + '\\(')); assert.ok(m, 'função ' + n); const i = m.index + 1, j = [src.indexOf('\n  function ', i + 10), src.indexOf('\n  // ', i + 10)].filter((x) => x > 0); return src.slice(i, Math.min(...j)); }
test('as funções que decidem liberação, progresso, compra e consulta das coleções são EXATAMENTE as de antes (retrato da main anterior)', () => {
  const g = read('public/game.js');
  for (const [n, hh] of Object.entries(LIB)) assert.equal(crypto.createHash('sha256').update(trecho(g, n)).digest('hex').slice(0, 16), hh, 'a função ' + n + ' não pode mudar nesta rodada');
});
test('cabeçalho de categorias e de coleção: os textos pedidos, a variação de fundo por vista e o selo com TODAS as coleções que o progresso libera', () => {
  const g = read('public/game.js'), h = read('public/index.html');
  assert.match(g, /QCCab\.destaque\(\$\('#pick-title'\), 'ESCOLHA UMA CATEGORIA'\)/); assert.match(g, /\$\('#pick-lead'\)\.textContent = 'Explore imagens e complete suas coleções\.';/);
  assert.match(g, /\$\('#screen-pick'\)\.setAttribute\('data-fundo', 'categorias'\)/); assert.equal((g.match(/setAttribute\('data-fundo', 'colecoes'\)/g) || []).length, 2, 'coleção e imagens clássicas');
  assert.match(g, /\$\('#library-heading'\)\.textContent = c\.name\.toLocaleUpperCase\('pt-BR'\);/); assert.match(g, /\$\('#library-sub'\)\.textContent = 'ESCOLHA SUA IMAGEM';/);
  assert.match(g, /QCCab\.progresso\(\$\('#library-progress'\), feitas, c\.images\.length\)/); assert.match(g, /\$\('#library-detail'\)\.textContent = librarySummary\(c\) \+ ' concluídas';/);
  assert.match(g, /function libraryNames\(list\)/); assert.match(g, /nomes = libraryNames\(deps\)/); assert.doesNotMatch(g.slice(g.indexOf('function renderLibraryCategory'), g.indexOf('function renderLibraryCurrent')), /deps\[0\]\.name/, 'o selo não fala só da primeira coleção');
  assert.match(h, /<div class="pick-top"><button id="btn-pick-back" class="btn btn-primary" type="button" aria-label="Voltar">‹ Voltar<\/button><\/div>/);
  assert.ok(h.indexOf('id="pick-title"') > h.indexOf('id="btn-pick-back"') && h.indexOf('id="library-heading"') < h.indexOf('id="library-sub"') && h.indexOf('id="library-sub"') < h.indexOf('id="library-progress"') && h.indexOf('id="library-progress"') < h.indexOf('id="library-gate"'), 'hierarquia: voltar, título, orientação, progresso, selo');
  for (const id of ['library-heading', 'library-detail', 'library-gate', 'library-continue', 'library-categories', 'pick-grid', 'pick-title', 'pick-lead', 'btn-pick-back']) assert.equal((h.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1, 'continua existindo: ' + id);
});
test('estilos: o texto solto SEGUE O TEMA (nada de cor fixa clara sobre o fundo), o voltar é UM padrão (amarelo, pequeno, toque ≥ 44 px) em todas as telas, títulos que quebram linha e movimento respeitado', () => {
  const tc = read('public/telas.css');
  assert.match(tc, /--stage-ink: var\(--ink\); --stage-soft: var\(--ink-soft\);/, 'texto sobre o fundo = as cores do tema (claro: marinho; escuro: quase branco)'); assert.doesNotMatch(tc, /--stage-ink: #|--stage-soft: #/);
  assert.match(tc, /--pick-hl: #c2185b;/); assert.match(tc, /html\[data-theme="dark"\] \{\s+--pick-hl: var\(--sun\);/);
  assert.match(tc, /#screen-pick #btn-pick-back, #me-back, #lobby-leave \{[^}]*min-height: 34px;[^}]*font-size: \.84rem;[^}]*background: var\(--sun\); color: var\(--on-sun\); box-shadow: 0 4px 0 var\(--sun-deep\);/, 'o mesmo botão amarelo nas categorias, em Amigos e na recepção da Sala Desafio');
  assert.match(tc, /#screen-pick #btn-pick-back::after, #me-back::after, #lobby-leave::after \{ content: ""; position: absolute; inset: -7px -8px; \}/); assert.ok(34 + 2 * 7 >= 44, 'área de toque');
  assert.match(tc, /\.pick-fixo \.pick-top \{ position: relative; z-index: 2;/, 'o voltar fica acima do cabeçalho animado'); assert.match(tc, /#me-back, #lobby-leave \{|#screen-pick #btn-pick-back, #me-back, #lobby-leave \{[^}]*z-index: 2;/);
  assert.match(tc, /#screen-pick #pick-title \{[^}]*text-wrap: balance; overflow-wrap: anywhere;/); assert.match(tc, /\.library-heading \{[^}]*text-wrap: balance; overflow-wrap: anywhere;/); assert.match(tc, /font-size: clamp\(1\.45rem, 6\.6vw, 2\.05rem\)/); assert.match(tc, /\.pick-hl \{ color: var\(--pick-hl\); \}/);
  assert.match(tc, /@media \(prefers-reduced-motion: no-preference\) \{\s+html:not\(\[data-motion="reduce"\]\) \.pick-head > \*/);
  assert.ok(cr('#C2185B', F.CLARO.base) >= 4.5 && cr('#1B2559', F.CLARO.base) >= 9 && cr('#55608F', F.CLARO.topo) >= 4.5, 'tema claro: destaque, texto e texto suave sobre o lavanda'); assert.ok(cr('#FFCF33', F.BASE) >= 9 && cr('#EEF1FF', F.BASE) >= 12 && cr('#AAB5E8', F.BASE) >= 7, 'tema escuro sobre o marinho');
  assert.match(tc, /\.prog-svg \{[^}]*max-width: 64vw;/); assert.match(tc, /\.pc-off \{ fill: var\(--pc-off-fill\); stroke: var\(--pc-off-line\);/); assert.match(tc, /\.library-gate::before \{[^}]*mask: url\("fundos\/peca-icone\.svg"\)/);
});
test('CABEÇALHO FIXO: voltar, título e subtítulo (categorias) e nome, orientação, progresso e selo (coleção) ficam num bloco que NÃO rola; só a lista de categorias/imagens rola', () => {
  const h = read('public/index.html'), a = h.indexOf('<section id="screen-pick"'), s = h.slice(a, h.indexOf('</section>', a));
  const fixo = s.indexOf('<div class="pick-fixo">'), rola = s.indexOf('<div id="pick-scroll" class="pick-scroll">'); assert.ok(fixo > 0 && fixo < rola, 'o bloco fixo vem ANTES e fora do bloco que rola');
  const dentroFixo = s.slice(fixo, rola), dentroRola = s.slice(rola);
  for (const id of ['btn-pick-back', 'pick-title', 'pick-lead', 'library-nav', 'library-heading', 'library-sub', 'library-progress', 'library-detail', 'library-gate']) { assert.ok(dentroFixo.includes('id="' + id + '"'), '#' + id + ' fica no bloco FIXO'); assert.ok(!dentroRola.includes('id="' + id + '"'), '#' + id + ' não está no bloco que rola'); }
  for (const id of ['library-categories', 'pick-grid', 'duel-modes', 'library-continue']) { assert.ok(dentroRola.includes('id="' + id + '"') && !dentroFixo.includes('id="' + id + '"'), '#' + id + ' rola'); }
  const tc = read('public/telas.css'); assert.match(tc, /\.pick-fixo \{ flex: none;/, 'não encolhe nem rola'); assert.match(tc, /\.pick-scroll \{ -webkit-mask-image: linear-gradient\(to bottom, transparent 0, #000 14px\)/);
  const st = read('public/style.css'); assert.match(st, /#screen-pick \{ overflow: hidden; align-items: stretch; \}/); assert.match(st, /\.pick-scroll \{ flex: 1; min-height: 0; width: 100%; overflow-y: auto;/, 'a lista é o único bloco que rola');
  assert.match(h, /<div id="pick-scroll"[\s\S]*?<div id="pick-sheet"/, 'o painel de baixo continua fora da lista');
});
test('BARRA DE ABAS fixa na tela inicial: Amigos, Loja e Ajustes com os mesmos ids de sempre, ícones de peças de quebra-cabeça, toque confortável e sem cobrir o conteúdo', () => {
  const h = read('public/index.html'), a = h.indexOf('<section id="screen-home"'), home = h.slice(a, h.indexOf('</section>', a)), nav = home.slice(home.indexOf('<nav class="tabbar"'), home.indexOf('</nav>') + 6);
  assert.match(nav, /<nav class="tabbar" aria-label="Menu principal">/); assert.deepEqual([...nav.matchAll(/<button id="([^"]+)" class="tab"/g)].map((m) => m[1]), ['link-friends', 'link-shop', 'link-settings'], 'mesma ordem e mesmos ids (as ligações com o jogo e com o mascote não mudam)');
  assert.deepEqual([...nav.matchAll(/data-ico="([^"]+)"/g)].map((m) => m[1]), ['amigos', 'loja', 'ajustes']); assert.match(nav, /<button id="link-friends" class="tab" type="button" hidden>/, 'Amigos só aparece com contas ligadas, como antes'); assert.match(nav, /<i id="friends-badge" class="me-badge" hidden>0<\/i>/);
  assert.ok(!/<div class="home-links">/.test(home) && !/class="btn btn-ghost"/.test(nav), 'os botões antigos saíram'); assert.ok(home.indexOf('class="join-card"') < home.indexOf('<nav class="tabbar"'), 'a barra vem depois do conteúdo, como filha direta da tela (sem transform por perto)');
  const tc = read('public/telas.css'); assert.match(tc, /\.tabbar \{ position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;/); assert.match(tc, /padding: 6px 10px calc\(6px \+ env\(safe-area-inset-bottom, 0px\)\)/, 'respeita o recorte do celular');
  assert.match(tc, /\.tabbar \.tab \{[^}]*flex: 1 1 0;[^}]*min-height: 56px;/); assert.match(tc, /#screen-home \{ padding-bottom: calc\(84px \+ env\(safe-area-inset-bottom, 0px\)\); \}/, 'o conteúdo nunca fica atrás da barra'); assert.match(tc, /\.tabbar \.tab:focus-visible/);
  const cab = read('public/cabecalhos.js'); for (const n of ['amigos', 'loja', 'ajustes']) assert.match(cab, new RegExp("nome === '" + n + "'")); assert.match(cab, /\[\[data-ico\]|querySelectorAll\('\[data-ico\]'\)/); assert.match(cab, /P\.caminho\(tabs\)/, 'os ícones usam a forma de peça do jogo');
  assert.match(cab, /icone: icone/);
  assert.equal((cab.match(/peca\(svg, \d/g) || []).length, 4, 'amigos = 2 peças, loja = 1 e ajustes = 1');
  assert.match(cab, /if \(nome === 'amigos'\) \{ peca\(svg, 10\.2, 16, 12\.5, \[0, 1, 0, 0\], '#4f7dff'\); peca\(svg, 23\.1, 16, 12\.5, \[0, 0, 0, -1\], '#ff6fa3'\); \}/, 'duas peças que se ENCAIXAM (dente à direita na azul, encaixe à esquerda na rosa)');
  assert.match(cab, /M15\.5 10\.4 L20\.1 15\.2 L15\.5 22 L10\.9 15\.2 Z/, 'a gema da loja'); assert.match(cab, /'stroke-dasharray': '2 2\.0'/, 'os dentes da engrenagem');
});

/* ===================== peças e progresso ===================== */
test('pecas.js: o caminho da peça é válido e o progresso encaixa as peças (um dente que entra no encaixe da próxima), com limites seguros', () => {
  for (const tabs of [[0, 0, 0, 0], [1, 1, 1, 1], [-1, -1, -1, -1], [1, -1, 1, -1], [0, 1, 0, -1]]) { const d = P.caminho(tabs); assert.match(d, /^M-0\.5 -0\.5.*Z$/); assert.doesNotMatch(d, /NaN|undefined|Infinity/); for (const n of d.match(/-?\d+\.?\d*/g)) assert.ok(Math.abs(Number(n)) <= 0.78, 'dentro de ±0,78: ' + n); }
  assert.equal(P.caminho([0, 0, 0, 0]), 'M-0.5 -0.5L0.5 -0.5L0.5 0.5L-0.5 0.5L-0.5 -0.5Z', 'sem dentes é um quadrado');
  const p = P.progresso(7, 19); assert.deepEqual([p.n, p.cheias, p.celulas.length], [19, 7, 19]); assert.deepEqual(p.celulas.map((c) => c.feita), Array.from({ length: 19 }, (_, i) => i < 7));
  assert.ok(p.celulas[0].d !== p.celulas[1].d && p.celulas[0].d.includes('C'), 'a primeira tem o dente à direita; as do meio, dente e encaixe'); assert.ok(!P.progresso(1, 1).celulas[0].d.includes('C'), 'uma só peça: sem dentes');
  assert.ok(p.celulas.every((c, i) => Math.abs(c.x - (i * 1.04 + 0.5)) < 1e-9)); assert.ok(p.largura > 19 * 1.04);
  assert.deepEqual([P.progresso(0, 5).cheias, P.progresso(5, 5).cheias, P.progresso(9, 5).cheias, P.progresso(-3, 5).cheias], [0, 5, 5, 0]);
  assert.deepEqual([P.progresso(7, 30).n, P.progresso(7, 30).cheias], [20, 5], 'mais de 20 imagens: 20 peças, proporcional'); assert.deepEqual([P.progresso(1, 200).cheias, P.progresso(199, 200).cheias, P.progresso(200, 200).cheias], [1, 19, 20], 'nunca mostra completo sem estar, nem vazio com progresso');
  for (const v of [NaN, undefined, null, 'x', {}, Infinity]) { const q = P.progresso(v, v); assert.deepEqual([q.n, q.cheias], [0, 0]); } assert.equal(P.progresso(3, 0).n, 0);
});
test('cabecalhos.js só desenha por DOM: sem HTML dinâmico, sem rede, sem armazenamento, e o indicador diz os números em voz alta', () => {
  const s = code(read('public/cabecalhos.js'));
  for (const proibido of [/innerHTML|outerHTML|insertAdjacentHTML|document\.write/, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/, /localStorage|sessionStorage|indexedDB|document\.cookie/, /\beval\s*\(|new Function/, /https?:\/\/(?!www\.w3\.org)/]) assert.doesNotMatch(s, proibido);
  assert.match(s, /createElementNS\(NS, tag\)/); assert.match(s, /host\.setAttribute\('aria-label', feitas \+ ' de ' \+ total \+ ' imagens concluídas'\)/); assert.match(s, /svg\.setAttribute\('aria-hidden', 'true'\)/);
  assert.doesNotMatch(code(read('public/pecas.js')), /document\b|window\b\./, 'pecas.js é puro');
});

test('rolagem: trocar de vista por ação do jogador volta ao topo, mas atualizar o progresso NÃO mexe na rolagem; e o Voltar fica no mesmo canto em todas as telas', () => {
  const g = read('public/game.js'), tc = read('public/telas.css');
  assert.match(g, /function pickScrollTop\(\) \{ var s = \$\('#pick-scroll'\); if \(s\) s\.scrollTop = 0; \}/);
  assert.equal((g.match(/pickScrollTop\(\)/g) || []).length, 5, 'definição + abrir categoria + abrir clássicas + voltar às categorias + entrar na tela');
  assert.match(g, /if \(libraryAvailable\(c\)\) \{ pickScrollTop\(\); renderLibraryCategory\(c\.id\); \}/); assert.match(g, /libraryView = 'legacy'; pickScrollTop\(\); renderPickGrid\(\);/); assert.match(g, /closePickSheet\(\); pickScrollTop\(\); renderLibraryHome\(\); return;/);
  const refresh = g.slice(g.indexOf('function renderLibraryCurrent'), g.indexOf('function renderLibraryCurrent') + 400); assert.doesNotMatch(refresh, /pickScrollTop/, 'a atualização automática do progresso não pode jogar o jogador para o topo');
  assert.match(tc, /#screen-lobby #lobby-leave \{ position: absolute; top: 12px; left: 16px; \}/); assert.match(tc, /#screen-lobby \.lobby-inner \{ padding-top: 56px; \}/);
  assert.match(tc, /\.me-head \{[^}]*padding: max\(12px, env\(safe-area-inset-top\)\) 16px 2px;/); assert.match(tc, /\.pick-fixo \.pick-top \{[^}]*margin-left: -4px;/); assert.match(tc, /\.pick-fixo \{[^}]*padding: 12px 20px 2px;/);
});
