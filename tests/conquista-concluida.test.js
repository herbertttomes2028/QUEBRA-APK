"use strict";
// Conquista concluída: como o jogo AVISA (cartões no resultado, aviso no topo, som próprio) e o selo "Concluída" nas listas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const game = read('public/game.js'), conta = read('public/conta.js'), css = read('public/style.css'), html = read('public/index.html');
const cssAviso = css.slice(css.indexOf('/* ===================== Conquista concluída: cartões, aviso no topo e selo nas listas ===================== */'));
const fn = (name) => { const m = game.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}')); assert.ok(m, name + ' não encontrada'); return m[0]; };
const mk = (tier, xp, title) => ({ id: tier + xp + title, icon: '🏅', title: title || ('T' + xp), tier, xp });

test('achPlan: mostra 3 (as mais valiosas primeiro), resume o resto e aguenta lixo', () => {
  const rank = new Function(game.match(/var ACH_RANK = \{[^}]*\};/)[0] + '; return ACH_RANK;')();
  const achPlan = new Function('ACH_RANK', fn('achPlan') + '; return achPlan;')(rank);
  assert.deepEqual(achPlan([]), { show: [], extra: 0, total: 0 }); assert.deepEqual(achPlan(null), { show: [], extra: 0, total: 0 });
  const p = achPlan([mk('bronze', 5), mk('diamante', 100), mk('prata', 15), mk('ouro', 40), mk('ouro', 60), mk('bronze', 25)]);
  assert.equal(p.total, 6); assert.equal(p.extra, 3);
  assert.deepEqual(p.show.map((a) => a.tier + a.xp), ['diamante100', 'ouro60', 'ouro40'], 'nível primeiro, depois o XP');
  assert.equal(achPlan([mk('bronze', 5), { title: 'sem nível', xp: 999 }]).show[1].title, 'sem nível', 'sem nível conhecido vai para o fim, sem quebrar');
  assert.equal(achPlan(Array.from({ length: 25 }, (_, i) => mk('bronze', i))).extra, 22);
});

test('o título que vem do servidor nunca vira HTML (cartão montado só com textContent)', () => {
  const src = fn('achPopEl');
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML/);
  const nodes = [];
  const doc = { createElement: (tag) => { const e = { tag, className: '', textContent: '', children: [], attrs: {}, style: {}, appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = v; } }; nodes.push(e); return e; } };
  const rank = new Function(game.match(/var ACH_RANK = \{[^}]*\};/)[0] + '; return ACH_RANK;')();
  const achPopEl = new Function('document', 'ACH_RANK', src + '; return achPopEl;')(doc, rank);
  const el = achPopEl({ icon: '🏆', title: '<img src=x onerror=alert(1)>', tier: 'ouro', xp: 40 });
  assert.equal(el.className, 'ach-pop t-ouro');
  assert.ok(nodes.some((n) => n.textContent === '<img src=x onerror=alert(1)>'), 'o título fica como TEXTO');
  assert.ok(nodes.every((n) => n.tag !== 'img'), 'nenhum <img> foi criado a partir do título');
  assert.deepEqual(el.children.filter((c) => c.attrs['aria-hidden']).map((c) => c.className), ['ach-pop-ico', 'ach-pop-check'], 'ícone e ✓ são decorativos para o leitor de tela');
  assert.equal(achPopEl({ icon: '🏅', title: 'x', tier: 'invalido', xp: 0 }).className, 'ach-pop t-bronze', 'nível desconhecido não quebra');
});

test('resultado da partida: cartões em lista (e a linha cinza de antes não leva mais as conquistas)', () => {
  assert.doesNotMatch(game, /achBits/, 'a função antiga foi substituída');
  assert.match(game, /var aplan = achPlan\(ev\.ach\);/);
  assert.match(game, /strip\.className = 'xp-ach'; strip\.setAttribute\('role', 'list'\)/);
  assert.match(game, /p\.setAttribute\('role', 'listitem'\)/);
  assert.match(game, /'🏅 \+' \+ aplan\.extra \+ ' conquistas concluídas · veja todas em Meu espaço'/);
  assert.match(game, /p\.lastChild\.style\.animationDelay = \(i \* 170 \+ 280\) \+ 'ms'/);                      // o carimbo ✓ bate depois do cartão
  const antes = game.slice(game.indexOf("['completion', 'friend', 'win', 'participation'].forEach"), game.indexOf('var aplan = achPlan'));
  assert.doesNotMatch(antes, /ev\.ach/, 'a linha cinza só traz as partes do XP');
});

test('som: toca UMA vez por aviso (Ouro e Diamante tocam a versão grande) e o leitor de tela é avisado', () => {
  const rank = new Function(game.match(/var ACH_RANK = \{[^}]*\};/)[0] + '; return ACH_RANK;')();
  const achPlan = new Function('ACH_RANK', fn('achPlan') + '; return achPlan;')(rank);
  const calls = [];
  const achSignal = new Function('achPlan', 'playSound', 'announce', fn('achSignal') + '; return achSignal;')(achPlan, (n) => calls.push(['som', n]), (t) => calls.push(['fala', t]));
  achSignal([mk('bronze', 5, 'A')]); assert.deepEqual(calls.splice(0), [['som', 'ach'], ['fala', 'Conquista concluída: A.']]);
  achSignal([mk('prata', 15), mk('ouro', 40, 'B')]); assert.deepEqual(calls.splice(0), [['som', 'achBig'], ['fala', 'Conquista concluída: B, e mais 1.']]);
  achSignal([mk('diamante', 100, 'C')]); assert.equal(calls[0][1], 'achBig'); calls.length = 0;
  achSignal([]); assert.deepEqual(calls, [], 'sem conquistas: silêncio');
  const refresh = game.slice(game.indexOf('function refreshXp()'), game.indexOf('// A comemoração é só apresentação'));
  assert.match(refresh, /xpBox\(\$\('#win-xp'\), ev\); xpBox\(\$\('#duel-xp'\), ev\);\s*\n\s*state\.xpLast = null;\s*\n\s*if \(ev\.ach && ev\.ach\.length\) achSignal\(ev\.ach\);/);
  assert.equal((game.match(/achSignal\(/g) || []).length, 3, 'só a definição, o resultado da partida e o aviso no topo (via it.sig): nenhuma chamada extra que repetiria o som');
});

test('sons novos: curtos, seguros e diferentes da vitória e da subida de nível', () => {
  const um = (re) => { const m = game.match(re); assert.ok(m, String(re)); return m[0]; };
  const soundAch = um(/function soundAch\(c\) \{[^\n]*\}/), achBig = um(/achBig: function \(c\) \{[^\n]*\},/);
  const run = (code, name) => { const calls = []; new Function('tone', 'c', 'SOUNDS', code + '; return 0;')((ctx, f, s, d, ty, v) => calls.push({ f, s, d, v }), {}, {}); return calls; };
  const ach = []; new Function('tone', soundAch + '; soundAch({});')((c, f, s, d, t, v) => ach.push({ f, s, d, v }));
  const big = []; new Function('tone', soundAch + '; var SOUNDS = { ' + achBig + ' }; SOUNDS.achBig({});')((c, f, s, d, t, v) => big.push({ f, s, d, v }));
  assert.equal(ach.length, 3); assert.equal(big.length, 6);
  for (const n of ach.concat(big)) assert.ok(n.f > 900 && n.f < 3000 && n.d > 0 && n.d <= .5 && n.v > 0 && n.v <= .15, JSON.stringify(n));
  assert.ok(Math.max(...big.map((n) => n.s + n.d)) < 1.1, 'a versão grande acaba em menos de 1,1 s');
  assert.ok(Math.max(...ach.map((n) => n.s + n.d)) < .5, 'a comum acaba em menos de meio segundo');
  assert.deepEqual(ach.map((n) => n.f).slice(0, 2), [988, 1319]);
  assert.match(game, /ach: soundAch,/); assert.match(game, /levelup: soundLevelup,/);                      // convivem com o som do nível
  assert.doesNotMatch(soundAch, /523|659|784|1047/, 'não é o arpejo da vitória');
});

test('aviso no topo: fila, espera o que importa, desiste sozinho e abre as conquistas ao tocar', () => {
  assert.match(html, /<div id="ach-banner" class="ach-banner" role="status" aria-live="polite" hidden><\/div>/);
  const b = fn('achBannerBlocked');
  for (const cond of ["currentScreen() === 'game'", "!$('#lvup').hidden", "!$('#modal-win').hidden", "!$('#modal-duel').hidden", 'banner-wake']) assert.ok(b.includes(cond), 'deveria esperar: ' + cond);
  const step = fn('achBannerStep');
  assert.match(step, /if \(\+\+achTries > 25\) \{ achQ\.length = 0;/);                                      // não fica preso para sempre
  assert.match(step, /achTimer = setTimeout\(achBannerStep, 700\)/);
  assert.match(step, /if \(it\.sig\) achSignal\(it\.sig\)/);                                                // som só no primeiro da fila
  assert.match(step, /QC\.showAchievements\(\)/);
  assert.match(step, /x\.setAttribute\('aria-label', 'Fechar aviso de conquista'\)/);
  assert.match(step, /' conquistas concluídas' : 'Conquista concluída: '/);
  assert.doesNotMatch(step, /innerHTML/);
  assert.match(game, /else if \(currentScreen\(\) !== 'game'\) \{ toast\('⭐ \+' \+ ev\.gained \+ ' XP', 3000\); if \(ev\.ach && ev\.ach\.length\) achBannerShow\(ev\.ach\); \}/);
  assert.match(conta, /QC\.showAchievements = function \(\) \{ if \(!acc\.token\) return; acc\.tab = 'ach'; openMe\(\); \};/);
});

test('CSS: o aviso fica abaixo do cartão de nível, alvos de toque grandes, e todo movimento só com transform/opacity e desligado em "movimento reduzido"', () => {
  assert.match(cssAviso, /\.ach-banner \{[^}]*z-index: 91/);
  assert.match(css, /\.lvup \{ position: fixed; inset: 0; z-index: 95;/, 'o cartão de nível continua por cima do aviso');
  assert.match(cssAviso, /\.ach-banner-card \{[^}]*min-height: 56px/); assert.match(cssAviso, /\.ach-banner-x \{[^}]*width: 44px; height: 44px/);
  for (const k of ['ach-pop-in', 'ach-stamp']) {
    const m = cssAviso.match(new RegExp('@keyframes ' + k + ' \\{[^\\n]*\\}')); assert.ok(m, k);
    assert.deepEqual([...m[0].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]).filter((p) => p !== 'transform' && p !== 'opacity'), [], k + ' só pode animar transform e opacity');
  }
  assert.match(cssAviso, /html:not\(\[data-motion="reduce"\]\) \.xp-ach \.ach-pop \{ animation: ach-pop-in/);
  assert.match(cssAviso, /html:not\(\[data-motion="reduce"\]\) \.ach-pop-check \{ animation: ach-stamp/);
  assert.match(cssAviso, /@media \(prefers-reduced-motion: reduce\) \{ \.xp-ach \.ach-pop, \.ach-pop-check \{ animation: none; \} \.ach-banner\.in \{ transition: none; \} \}/);
  assert.match(cssAviso, /html\[data-motion="reduce"\] \.ach-banner\.in \{ transition: none; \}/);
  assert.match(cssAviso, /\.ach-banner:focus|\.ach-banner-card:focus-visible, \.ach-banner-x:focus-visible \{ outline: 3px solid/);
});

// contraste WCAG
const lum = (hex) => { if (hex.length === 4) hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3]; const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4))); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
test('contraste mínimo 4,5:1: selo "Concluída", rótulo do cartão e check, nos dois temas', () => {
  const cor = (re) => { const m = cssAviso.match(re); assert.ok(m, String(re)); return m[1]; };
  const tagClaro = cssAviso.match(/\.ach-done-tag \{[^}]*background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6});/), tagEscuro = cssAviso.match(/html\[data-theme="dark"\] \.ach-done-tag \{ background: (#[0-9a-f]{6}); color: (#[0-9a-f]{6}); \}/);
  assert.ok(ratio(tagClaro[1], tagClaro[2]) >= 4.5, 'selo claro ' + ratio(tagClaro[1], tagClaro[2]).toFixed(2)); assert.ok(ratio(tagEscuro[1], tagEscuro[2]) >= 4.5, 'selo escuro ' + ratio(tagEscuro[1], tagEscuro[2]).toFixed(2));
  const rotuloClaro = cor(/\.ach-pop-txt small \{[^}]*color: (#[0-9a-f]{6});/), rotuloEscuro = cor(/html\[data-theme="dark"\] \.ach-pop-txt small \{ color: (#[0-9a-f]{6}); \}/);
  assert.ok(ratio(rotuloClaro, '#ffffff') >= 4.5, 'rótulo claro'); assert.ok(ratio(rotuloEscuro, '#1d2551') >= 4.5, 'rótulo escuro ' + ratio(rotuloEscuro, '#1d2551').toFixed(2));
  const check = cssAviso.match(/\.ach-pop-check \{[^}]*background: (#[0-9a-f]{3,6}); color: (#[0-9a-f]{3,6});/);
  assert.ok(ratio(check[1], check[2]) >= 4.5, 'check ' + ratio(check[1], check[2]).toFixed(2));
});

test('listas do perfil: selo "✓ Concluída", check no ícone e textos coerentes (concluída, não "ganha")', () => {
  assert.match(conta, /if \(a\.done\) meta\.appendChild\(el\('span', 'ach-done-tag', '✓ Concluída'\)\);/);
  assert.match(conta, /\[\['all', 'Todas'\], \['done', 'Concluídas'\], \['todo', 'Faltam'\]\]/);
  assert.match(conta, /a\.done \? ', concluída' : ', ainda não concluída\. '/);
  assert.match(conta, /' de ' \+ s\.total \+ ' concluídas'/);
  assert.match(cssAviso, /\.ach-card\.done \.ach-ico::after \{ content: "✓"/);
  assert.doesNotMatch(conta, /'Ganhas'|conquistada'|\(a\.done \? '✓ ' : ''\)/);
});
