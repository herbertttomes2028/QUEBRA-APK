'use strict';
// Bandejas personalizáveis (cliente): só a BANDEJA é decorada, atrás das peças e sem receber toque; a grade de encaixe não muda.
// O loja.js de verdade é executado aqui com um DOM mínimo de mentira; os layouts vêm do servidor de verdade.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { startServer, client } = require('./helpers');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const js = read('public/loja.js'), css = read('public/loja.css'), game = read('public/game.js'), html = read('public/index.html'), conta = read('public/conta.js');

function carrega() {
  function El(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.className = ''; this.style = { cssText: '', props: {}, setProperty(k, v) { this.props[k] = v; } }; this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } }; }
  El.prototype.appendChild = function (c) { this.children.push(c); return c; };
  El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
  El.prototype.addEventListener = function () {};
  const guardado = {};
  const QC = { $: () => null, store: { get: (k, d) => (k in guardado ? guardado[k] : d), set: (k, v) => { guardado[k] = v; } }, state: { settings: {} }, toast() {}, openModal() {}, closeModal() {}, confirm: () => Promise.resolve(false) };
  const document = { createElement: (t) => new El(t), createElementNS: (ns, t) => new El(t), documentElement: { getAttribute: () => 'on', setAttribute() {} }, readyState: 'complete', querySelector: () => null, querySelectorAll: () => [], addEventListener() {} };
  const ctx = { window: { QC, addEventListener() {} }, document, MutationObserver: function () { this.observe = () => {}; }, setTimeout, clearTimeout, Promise, Number, Math, Object, Array, String, parseInt, console, fetch: () => Promise.reject(new Error('sem rede')) };
  vm.runInNewContext(js, ctx, { filename: 'loja.js' });
  return { QC, T: QC.tray, guardado };
}
const { T, QC } = carrega();
const HEX = /^#[0-9a-f]{6}$/;
const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// lê um caminho SVG (só comandos absolutos M L H V A Q Z) e devolve todos os pontos (finais e de controle)
function pontos(d) {
  const tk = d.match(/[MLHVAQZ]|-?\d*\.?\d+/g), n = { M: 2, L: 2, H: 1, V: 1, A: 7, Q: 4, Z: 0 }, pts = []; let i = 0, x = 0, y = 0, cmd = null, cmds = [];
  while (i < tk.length) {
    if (/[MLHVAQZ]/.test(tk[i])) { cmd = tk[i++]; cmds.push(cmd); if (cmd === 'Z') continue; }
    const a = tk.slice(i, i + n[cmd]).map(Number); assert.ok(a.length === n[cmd] && a.every(Number.isFinite), 'números válidos em ' + cmd); i += n[cmd];
    if (cmd === 'M' || cmd === 'L') { x = a[0]; y = a[1]; } else if (cmd === 'H') x = a[0]; else if (cmd === 'V') y = a[0]; else if (cmd === 'A') { x = a[5]; y = a[6]; } else if (cmd === 'Q') { pts.push([a[0], a[1], true]); x = a[2]; y = a[3]; }
    pts.push([x, y, false]);
  }
  return { pts, cmds };
}

test('cor segura: qualquer cor escolhida vira uma cor em que as peças e a interface continuam visíveis; a paleta nunca precisa de ajuste', () => {
  for (const c of T.palette) { assert.match(c, HEX); assert.equal(T.safeTray(c).changed, false, 'paleta sem ajuste: ' + c); }
  assert.equal(new Set(T.palette).size, 12, '12 cores diferentes na paleta');
  for (const m of ['classica', 'nuvem', 'estrela', 'gelatina', 'galaxia']) { assert.match(T.defaults[m], HEX); assert.equal(T.safeTray(T.defaults[m]).changed, false, 'cor original de ' + m); }
  let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const amostras = ['#ffffff', '#000000', '#fefefe', '#010101', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#808080'];
  for (let i = 0; i < 300; i++) amostras.push('#' + [0, 0, 0].map(() => ('0' + Math.floor(rnd() * 256).toString(16)).slice(-2)).join(''));
  for (const c of amostras) {
    const p = T.safeTray(c);
    for (const k of ['fill', 'edge', 'glow']) assert.match(p[k], HEX, k + ' de ' + c);
    assert.ok(lum(p.fill) > 0.02 && lum(p.fill) < 0.9, 'nem quase preta nem quase branca: ' + c + ' → ' + p.fill);
    assert.ok(lum(p.edge) < lum(p.fill), 'a borda é mais escura que o corpo (' + c + ')'); assert.ok(lum(p.glow) >= lum(p.fill), 'o brilho é mais claro');
    assert.ok(cr(p.fill, p.edge) >= 1.25, 'a borda separa a bandeja do fundo e das peças: ' + c + ' ' + cr(p.fill, p.edge).toFixed(2));
    assert.ok(cr(p.fill, '#ffffff') >= 1.12, 'a bandeja nunca some sobre uma peça branca: ' + c);
    assert.ok(p.ink === '#ffffff' || p.ink === '#1b2559'); assert.match(p.mat, /^rgba\(/);
  }
  assert.equal(T.safeTray('#ffffff').changed, true); assert.equal(T.safeTray('#000000').changed, true);
  for (const ruim of ['', null, undefined, 'vermelho', '#abc', '#gggggg', 'javascript:alert(1)', '#ffffff;background:url(x)', 42, {}]) assert.equal(T.safeTray(ruim).fill, '#dbe2ff', 'entrada inválida cai na cor padrão: ' + JSON.stringify(ruim));
});

test('formas: os 5 contornos cabem na faixa da bandeja em TODOS os layouts reais (6 a 48 peças, cooperativo e Sala Desafio) e nunca invadem a grade nem a área das peças', async () => {
  const srv = await startServer({ ROOM_CREATES_PER_10MIN: '100' });
  try {
    const cfgJson = await (await fetch(srv.url + '/api/config')).json(); const cfgs = [];
    for (const n of [6, 12, 20, 30, 48]) { const a = await client(srv.url); const r = await a.emitAck('create', { pid: 'p' + Math.random(), imageId: cfgJson.images[0].file, pieces: n, name: 'Ana' }); assert.ok(r.ok, JSON.stringify(r)); cfgs.push(['coop ' + n, r.snapshot.cfg]); a.close(); }
    for (const n of [6, 12, 48]) { const a = await client(srv.url); const r = await a.emitAck('ch:create', { pid: 'p' + Math.random(), imageId: cfgJson.images[0].file, pieces: n, mode: 'quebra', name: 'Ana' }); assert.ok(r.ok, JSON.stringify(r)); cfgs.push(['quebra ' + n, r.lobby.cfg || r.cfg || null]); a.close(); }
    for (const [nome, cfg] of cfgs.filter((c) => c[1])) {
      const g = T.geom(cfg);
      assert.ok(g.y >= cfg.BOARD_Y + cfg.BOARD_H, nome + ': a bandeja começa DEPOIS da grade (nunca por cima dela)');
      assert.equal(g.y + g.T, cfg.TRAY_TOP, nome + ': o corpo começa exatamente onde as peças começam');
      if (!cfg.GIFT) assert.ok(g.B >= cfg.TRAY_TOP + cfg.TRAY_ROWS * cfg.TRAY + (cfg.TRAY_ROWS - 1) * cfg.ROW_GAP - g.y, nome + ': o corpo cobre até a última fileira de peças');
      assert.ok(g.W <= cfg.FIELD_W && g.x >= 0 && g.H > 100 && g.B < g.H && g.T < g.B, nome + ': ' + JSON.stringify(g));
      for (const m of Object.keys(T.shapes)) {
        const d = T.shapes[m](g.W, g.H, g.T, g.B), { pts, cmds } = pontos(d);
        assert.equal(cmds[0], 'M'); assert.equal(cmds[cmds.length - 1], 'Z', nome + ' ' + m + ': contorno fechado'); assert.ok(cmds.every((c) => 'MLHVAQZ'.includes(c)));
        for (const [x, y, ctrl] of pts) {
          assert.ok(x >= -0.5 && x <= g.W + 0.5, nome + ' ' + m + ': x dentro da largura (' + x + ')');
          assert.ok(y >= -30 && y <= g.H + 30, nome + ' ' + m + ': y perto da faixa (' + y + ')');
          if (!ctrl) assert.ok(y >= 0 && y <= g.H, nome + ' ' + m + ': o contorno fica dentro da faixa (' + y + ' em ' + g.H + ')');
          // nenhum ponto do contorno entra na área das peças (só nas bordas de cima/baixo ou nas laterais)
          if (!ctrl && y > g.T + 16 && y < g.B - 16) assert.ok(x <= 14 || x >= g.W - 14, nome + ' ' + m + ': o contorno não corta a área das peças (' + x + ',' + y + ')');
        }
      }
    }
    assert.ok(cfgs.filter((c) => c[1]).length >= 5);
  } finally { await srv.stop(); }
});

test('a bandeja montada: camada decorativa com corpo, sombra, brilho, borda, decoração e efeito; cores por variável; recorte da decoração', () => {
  const g = { x: 8, y: 900, W: 984, H: 420, T: 24, B: 380 };
  const conta = (e, cls) => ((e.className + ' ' + (e.attrs['class'] || '')).split(' ').includes(cls) ? 1 : 0) + e.children.reduce((a, c) => a + conta(c, cls), 0);
  const animados = (e) => (/\b(tray-grp|tray-neb|tray-orb|tray-wob)\b/.test(e.className) ? 1 : 0) + e.children.reduce((a, c) => a + animados(c), 0);
  const quantos = { classica: 0, nuvem: 3, estrela: 4, gelatina: 1, galaxia: 6 };      // filhos da decoração: camadas animadas agrupadas + 1 camada estática
  for (const m of Object.keys(quantos)) {
    const sk = T.buildSkin(m, '#ff8800', g);
    assert.equal(sk.className, 'tray-skin tray-' + m); assert.match(sk.style.cssText, /left:8px;top:900px;width:984px;height:420px/);
    for (const v of ['--tf', '--te', '--tg', '--tm']) assert.ok(sk.style.props[v], m + ' define ' + v);
    assert.equal(sk.style.props['--tf'], '#ff8800', 'a cor escolhida é o corpo');
    for (const cls of ['tray-shadow', 'tray-body', 'tray-mat', 'tray-sheen', 'tray-rim', 'tray-decor', 'tray-fx', 'tray-wob']) assert.equal(conta(sk, cls), 1, m + ' tem ' + cls);
    const dec = sk.children.find((c) => c.className === 'tray-decor'); assert.equal(dec.children.length, quantos[m], m + ': quantidade de camadas da decoração');
    assert.ok(animados(sk) <= 7, m + ': poucas camadas animadas (cada elemento animado vira uma camada de GPU): ' + animados(sk));
    assert.equal(!!dec.style.clipPath, m !== 'estrela', m + ': enfeites recortados pelo contorno (menos os brilhos da Estrela)');
    if (dec.style.clipPath) assert.match(dec.style.clipPath, /^path\('M[^']+Z'\)$/);
    // modo estático (prévias): leve, sem animação, sem brilho de efeito
    const st = T.buildSkin(m, '#ff8800', g, false);
    assert.match(st.className, /tray-static/); assert.equal(conta(st, 'tray-fx'), 0, 'sem elemento de efeito'); assert.equal(conta(st, 'tray-body'), 1);
    for (const cls of ['tray-shadow', 'tray-mat', 'tray-sheen', 'tray-rim']) assert.equal(conta(st, cls), 0, 'estática sem ' + cls);
    assert.ok(st.children.find((c) => c.className === 'tray-decor').children.length <= Math.max(1, quantos[m] ? 3 : 0), m + ': decoração estática enxuta');
  }
  assert.equal(T.buildSkin('modelo-que-nao-existe', '#ff8800', g).className, 'tray-skin tray-classica', 'modelo desconhecido vira a Clássica');
  assert.equal(T.buildSkin('nuvem', 'x', g).style.props['--tf'], '#dbe2ff', 'cor inválida vira a cor padrão');
});

test('prévia da loja: imagem SVG autocontida (sem scripts, sem endereços externos), com o corpo, a cor e as peças de exemplo', () => {
  const g = { x: 8, y: 0, W: 984, H: 392, T: 28, B: 352 };
  for (const m of Object.keys(T.shapes)) {
    const uri = T.previewImage(m, '#33aa77', g); assert.match(uri, /^data:image\/svg\+xml;charset=utf-8,/);
    const svg = decodeURIComponent(uri.replace(/^[^,]+,/, '')); assert.ok(svg.length < 20000, m + ': leve (' + svg.length + ' bytes)');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 1000 392"/);
    assert.ok(svg.includes('d="' + T.shapes[m](g.W, g.H, g.T, g.B) + '"'), m + ': o corpo é o mesmo contorno do jogo');
    assert.ok(svg.includes('fill="' + T.safeTray('#33aa77').fill + '"') && svg.includes('stroke="' + T.safeTray('#33aa77').edge + '"'), m + ': usa a cor segura');
    assert.equal((svg.match(/<rect /g) || []).length, 10, m + ': 10 peças de exemplo (2 espaços vazios)');
    assert.doesNotMatch(svg, /<script|<foreignObject|<image|href=|onload|javascript:|<style|url\(/i, m + ': sem nada executável nem externo');
  }
  assert.ok(decodeURIComponent(T.previewImage('classica', 'não-é-cor', g)).includes(T.safeTray('#dbe2ff').fill), 'cor inválida cai na cor padrão');
});

test('cor da PARTIDA inteira: fundo, campo, tabuleiro e grade acompanham a cor escolhida, com contraste garantido nos dois temas', () => {
  const ch = ['--paper', '--paper-2', '--paper-3', '--field', '--field-bg', '--field-ring', '--board-ring', '--grid', '--track', '--line'];
  let s = 424242; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cores = ['#dbe2ff', '#bfe4ff', '#ffe08a', '#ff9fc8', '#2d2a6e', '#ffffff', '#000000', '#808080', '#ff0000', '#00ff00', '#0000ff', '#ffff00'];
  for (let i = 0; i < 300; i++) cores.push('#' + [0, 0, 0].map(() => ('0' + Math.floor(rnd() * 256).toString(16)).slice(-2)).join(''));
  for (const hex of cores) for (const escuro of [false, true]) {
    const th = T.theme(hex, escuro), tag = hex + (escuro ? ' escuro' : ' claro');
    assert.deepEqual(Object.keys(th.vars), ch, 'as mesmas variáveis do jogo: ' + tag); assert.ok(Object.values(th.vars).every((v) => /^hsla?\(\d{1,3},\d{1,3}%,\d{1,3}%(,[\d.]+)?\)$/.test(v)), 'só valores de cor válidos: ' + tag);
    for (const k of ['paper', 'field', 'ring', 'grid']) assert.match(th[k], HEX, k + ' ' + tag);
    // o que vale é o que VAI PARA A TELA: as cores são lidas das próprias variáveis CSS (e conferidas com as amostras)
    const hsl2hex = (h, sa, l) => { const f = (p, q, t) => { if (t < 0) t += 1; if (t > 1) t -= 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; const q2 = l < 0.5 ? l * (1 + sa) : l + sa - l * sa, p2 = 2 * l - q2; const rgb = sa ? [f(p2, q2, h + 1 / 3), f(p2, q2, h), f(p2, q2, h - 1 / 3)] : [l, l, l]; return '#' + rgb.map((v) => ('0' + Math.round(v * 255).toString(16)).slice(-2)).join(''); };
    const lê = (v) => { const m = /^hsla?\((\d+),(\d+)%,(\d+)%/.exec(v); return hsl2hex(Number(m[1]) / 360, Number(m[2]) / 100, Number(m[3]) / 100); };
    const real = { paper: lê(th.vars['--paper']), field: lê(th.vars['--field']), ring: lê(th.vars['--board-ring']), grid: lê(th.vars['--grid']) };
    for (const k of Object.keys(real)) assert.equal(real[k], th[k], k + ': a amostra é exatamente a variável usada na tela (' + tag + ')');
    const ink = escuro ? '#eef1ff' : '#1b2559';
    assert.ok(cr(ink, real.paper) >= 7, 'o texto lê bem sobre o fundo (' + tag + '): ' + cr(ink, real.paper).toFixed(2));
    assert.ok(cr(real.ring, real.field) >= 3, 'o contorno do tabuleiro se vê (' + tag + '): ' + cr(real.ring, real.field).toFixed(2));
    assert.ok(cr(real.grid, real.field) >= 2.2, 'as linhas da grade se veem (' + tag + '): ' + cr(real.grid, real.field).toFixed(2));
    assert.ok(cr(th.field, th.paper) >= 1.01 || th.field !== th.paper, 'o tabuleiro se destaca do fundo (' + tag + ')');
    if (!escuro) assert.ok(cr(th.field, '#ffffff') >= 1.1, 'o tabuleiro nunca é branco puro, as peças claras aparecem (' + tag + ')');
    assert.equal(th.dark, escuro);
  }
  assert.equal(T.theme('#ff0000', false).vars['--paper'].split(',')[0], 'hsl(0', 'o matiz da cor escolhida é mantido');
  assert.match(T.theme('#808080', false).vars['--paper'], /^hsl\(\d+,0%,/, 'cinza continua cinza (sem tingir)');
  assert.equal(T.themeOn(), false, 'a Clássica de fábrica NÃO pinta a partida (o visual de sempre)');
});

test('o catálogo reserva do cliente (sem internet) é igual ao do servidor: mesmos modelos, nomes, descrições e preços', () => {
  const shop = require('../shop');
  assert.deepEqual(JSON.parse(JSON.stringify(T.fallback)), shop.catalog().categories[0].items);
  assert.deepEqual(Object.keys(T.shapes), shop.ITEMS.map((i) => i.id), 'há um contorno para cada bandeja vendida');
  assert.deepEqual(Object.keys(T.defaults), shop.ITEMS.map((i) => i.id));
  assert.equal(T.current().model, 'classica', 'sem conta e sem nada salvo: Clássica');
});

test('animações leves e desligáveis: só transform e opacity; param no arrasto, nos Ajustes e com movimento reduzido; nunca recebem toque', () => {
  const blocos = css.match(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})+\s*\}/g) || []; assert.ok(blocos.length >= 10, 'keyframes: ' + blocos.length);
  for (const b of blocos) for (const m of b.matchAll(/\{([^{}]*)\}/g)) for (const decl of m[1].split(';').map((x) => x.trim()).filter(Boolean)) assert.match(decl, /^(transform|opacity)\s*:/, 'só transform/opacity nas animações: ' + decl + ' em ' + b.slice(0, 30));
  assert.match(css, /\.tray-skin \{[^}]*pointer-events: none;[^}]*\}/); assert.match(css, /\.tray-skin, \.tray-skin \* \{ pointer-events: none; \}/);
  assert.match(css, /\.tray-skin \{[^}]*z-index: 0;/, 'atrás das peças'); assert.match(css, /\.tray-skin \{[^}]*contain: layout paint;/);
  assert.match(css, /html\[data-tray-anim="off"\] \.tray-skin, html\[data-tray-anim="off"\] \.tray-skin \*,\s*html\[data-motion="reduce"\] \.tray-skin, html\[data-motion="reduce"\] \.tray-skin \* \{ animation: none !important; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.tray-skin, \.tray-skin \*, #field\.tray-enter \.piece \{ animation: none !important; \} \}/);
  assert.match(css, /#field\.dragging \.tray-skin \.tray-puffg, #field\.dragging \.tray-skin \.tray-twk,[\s\S]{0,400}animation-play-state: paused !important;/, 'ambiente pausa no arrasto');
  assert.match(css, /#field\.dragging \.tray-skin:not\(\.fx-a\):not\(\.fx-b\) \.tray-wob/, 'o efeito de "peça retirada" não é congelado');
  assert.match(css, /\.scrolling \.tray-skin, \.scrolling \.tray-skin \* \{ animation-play-state: paused !important; \}/, 'rolando a loja nada se mexe');
  assert.match(css, /\.tray-static, \.tray-static \* \{ animation: none !important; \}/, 'prévia estática não anima');
  assert.match(css, /\.tray-fx \{[^}]*will-change: transform, opacity;/, 'o brilho já existe como camada antes do toque');
  assert.match(css, /@keyframes trayFxA[\s\S]*@keyframes trayFxB/, 'brilho A/B (reinicia sem forçar layout)'); assert.doesNotMatch(css, /fx-select|fx-pick/);
  assert.doesNotMatch(css, /filter\s*:|backdrop-filter|box-shadow\s*:[^;]*\banimation/, 'sem filtros pesados');
  assert.doesNotMatch(css, /#board|\.puzzle-board-guides|\.tile|\.locked \{/, 'o CSS da loja não estiliza a grade');
  const regrasPeca = css.split('\n').filter((l) => /\.piece/.test(l)); assert.equal(regrasPeca.length, 2, 'só o fade de entrada da Clássica toca nas peças');
  assert.ok(regrasPeca.every((l) => /animation: (trayPieceIn \.5s ease both|none !important)/.test(l) && !/transform|left|top|width|height/.test(l.replace(/animation:[^;]*;/g, '').replace(/\.tray-skin[^{]*/g, ''))), 'e só com opacidade (nunca a posição)');
});

test('integração mínima com o jogo: a bandeja entra logo depois do tabuleiro; a grade e a regra de encaixe não foram tocadas', () => {
  assert.match(game, /field\.appendChild\(board\);\n    if \(typeof QC !== 'undefined' && QC\.tray\) QC\.tray\.build\(field, cfg\);/);
  assert.equal((game.match(/QC\.tray\./g) || []).length, 5, 'só 5 chamadas ao módulo da loja dentro do jogo');
  assert.doesNotMatch(game, /window\.QC && QC\.tray/, 'os ganchos funcionam mesmo onde não existe window (testes do cliente em vm)');
  assert.match(game, /QC\.tray\.fx\('select', p\.x, p\.y\)/);
  const pd = game.slice(game.indexOf('function onPointerDown'), game.indexOf('function onPointerMove')); assert.doesNotMatch(pd, /QC\.tray/, 'nada da loja roda no instante do toque (o jogo já faz o trabalho mais pesado ali)');
  assert.match(game, /resetIdle\(\);\s+\/\/ tocou numa peça nova: fica escolhida\n\s+if \(p && !cancelled && typeof QC !== 'undefined' && QC\.tray\) QC\.tray\.fx\('select'/, 'o brilho de escolher dispara ao SOLTAR um toque simples');
  assert.match(js, /_f = !s\._f/); assert.doesNotMatch(js, /offsetWidth|offsetHeight|getBoundingClientRect\(\)\.|clientHeight/, 'nenhuma leitura que force layout no caminho do toque'); assert.match(game, /QC\.tray\.drag\(true\); if \(d\.fromTray\) QC\.tray\.fx\('pick'/); assert.match(game, /state\.drag = null;\n    if \(typeof QC !== 'undefined' && QC\.tray\) QC\.tray\.drag\(false\);/);
  assert.match(game, /mascot: true, trayAnim: true \};/); assert.match(game, /h\.setAttribute\('data-tray-anim', s\.trayAnim === false \? 'off' : 'on'\);/);
  assert.match(read('public/boot.js'), /if \(s\.trayAnim === false\) d\.setAttribute\('data-tray-anim', 'off'\);/);
  assert.match(js, /field\.insertBefore\(skin, board\.nextSibling\)/, 'a camada fica logo depois do tabuleiro: as peças ficam por cima');
  assert.doesNotMatch(js, /cfg\.SNAP|tryLock|gameEmit|socket\.emit|\.locked\s*=|p\.x\s*=|p\.y\s*=/, 'a loja nunca mexe em peças, encaixe ou eventos do jogo');
  assert.doesNotMatch(js, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, 'nada de HTML montado por texto (tudo por textContent/atributos)');
  assert.match(conta, /QC\.api = api;/); assert.match(conta, /if \(QC\.onAccount\) QC\.onAccount\(me\);/); assert.match(conta, /if \(QC\.onAccount\) QC\.onAccount\(null\);/);
});

test('telas: botão da loja na inicial e no menu da partida, janelas com data-back, interruptor nos Ajustes, arquivos no aplicativo instalado', () => {
  for (const id of ['link-shop', 'menu-shop', 'modal-shop', 'modal-tray-preview', 'shop-gems', 'shop-body', 'shop-close', 'tp-title', 'tp-body', 'tp-actions']) assert.ok(html.includes('id="' + id + '"'), 'existe #' + id);
  assert.match(html, /<button id="shop-close" data-back /, 'o voltar do Android fecha a loja'); assert.match(js, /close\.setAttribute\('data-back', ''\)/);
  assert.match(html, /<button id="link-shop" class="btn btn-ghost" type="button" aria-label="Loja de bandejas"><svg/, 'botão com ícone de sacola');
  assert.match(html, /data-tab="loja">Loja<\/button>\s*<button[^>]*data-tab="minhas">Minhas Bandejas<\/button>/);
  assert.match(html, /role="switch" aria-labelledby="lbl-trayanim"[^>]*data-setting="trayAnim"/);
  assert.match(html, /id="modal-shop" class="modal shop-modal" hidden role="dialog" aria-modal="true" aria-labelledby="shop-title"/);
  assert.ok(html.indexOf('<script src="game.js">') < html.indexOf('<script src="conta.js">') && html.indexOf('<script src="conta.js">') < html.indexOf('<script src="loja.js">'), 'ordem dos scripts');
  assert.match(html, /<link rel="stylesheet" href="loja\.css">/);
  const sw = read('public/sw.js'); assert.match(sw, /'\/loja\.js', '\/loja\.css'/); assert.match(sw, /const CACHE = 'quebra-cabeca-v21';/, 'o nome do cache continua o mesmo');
  assert.match(game, /var ms = \$\('#menu-shop'\); if \(ms\) ms\.hidden = !!state\.duel;/, 'na Sala Desafio (competitiva) a loja não aparece no menu');
  assert.match(js, /🧺 BANDEJAS/); assert.match(js, /'Faltam ' \+ m \+ ' gema'/); assert.match(js, /QC\.confirm\(\{ title: 'Comprar ' \+ it\.name \+ '\?'/, 'confirmação com o nome e o preço');
});
