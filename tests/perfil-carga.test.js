"use strict";
// Carga do perfil e das conquistas: /me leve, conquistas sob demanda, sem recarregar a cada volta ao início, e pilha de fontes sem nomes inexistentes.
// (Medido com CPU 4x mais lenta: abrir "Meu espaço" 700 ms -> ~150 ms só por causa da pilha de fontes.)
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const conta = read('public/conta.js'), css = read('public/style.css'), game = read('public/game.js'), acc = read('accounts.js'), ach = read('achievements.js');
const fn = (src, name) => { const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}')); assert.ok(m, name + ' não encontrada'); return m[0]; };

/* ---------------- servidor ---------------- */
test('servidor: /me leve (ou completo, para o aplicativo antigo em cache) e /achievements em rota própria', () => {
  assert.match(acc, /r\.get\('\/me', needUser, guard\(async \(req, res\) => res\.json\(\{ ok: true, me: req\.query\.lite === '1' \? await meLite\(req\.user\) : await meOf\(req\.user\) \}\)\)\);/);
  assert.match(acc, /r\.get\('\/achievements', needUser, guard\(async \(req, res\) => res\.json\(Object\.assign\(\{ ok: true \}, await achievementsOf\(req\.user\.id\)\)\)\)\);/);
  const lite = fn(acc, 'meLite');
  assert.doesNotMatch(lite, /achievements|achSummary|collections|achMeta|achRowsOf|gatherStats/, 'o /me leve não toca nas conquistas');
  assert.match(acc, /async function meOf\(u\) \{\s*\n\s*const lite = await meLite\(u\);\s*\n\s*return Object\.assign\(lite, await achievementsOf\(u\.id, lite\.stats\)\);/, 'o completo = leve + conquistas, como antes');
});

test('servidor: cada pedaço é UMA consulta ao banco (antes eram 8 no /me e 9 nas conquistas)', () => {
  const g = ach.slice(ach.indexOf('async function gatherStats'), ach.indexOf('function complete('));
  assert.equal((g.match(/await q\(/g) || []).length, 1, 'gatherStats faz uma única consulta');
  assert.doesNotMatch(g, /Promise\.all/);
  const core = fn(acc, 'coreOf');
  assert.equal((core.match(/\bone\(/g) || []).length, 1, 'o núcleo do /me é uma consulta');
  assert.match(acc, /Promise\.all\(\[base \|\| statsOf\(uid\), ach\.gatherStats\(/, 'estatísticas básicas e extras seguem em paralelo (uma onda só)');
  assert.match(acc, /const r = await one\(`SELECT \$\{STATS_COLS\}, \(\$\{FRIENDS_SQL\}\) AS friends FROM matches WHERE user_id = \$1`, \[uid\]\);/, 'statsOf: uma consulta (as amizades entram como subconsulta)');
});

test('servidor: o que o /me leve devolve continua sendo do BANCO e protegido por login', () => {
  assert.match(acc, /SELECT xp, xp_seeded, gems FROM users WHERE id = \$1/);
  assert.match(fn(acc, 'meLite'), /x\.xp_seeded \? x\.xp : await ensureSeeded\(u\.id\)/, 'o histórico antigo continua virando XP na primeira vez');
  assert.doesNotMatch(read('accounts.js'), /r\.get\('\/achievements', guard/, 'sempre com needUser');
});

/* ---------------- cliente ---------------- */
test('cliente: pede o /me LEVE e as conquistas à parte (nunca o /me completo)', () => {
  assert.match(conta, /return api\('GET', '\/me\?lite=1'\)\.then\(function \(j\) \{\s*\n\s*if \(j && j\.ok\) \{ acc\.meAt = Date\.now\(\); acc\.dirty = false; applyAccount\(j\.me\);/);
  assert.match(conta, /api\('GET', '\/achievements'\)/);
  assert.doesNotMatch(conta, /api\('GET', '\/me'\)/);
});

test('cliente: regra de frescor — recarrega só se mudou (sujo), se não tem ou se passou do prazo', () => {
  const ttl = conta.match(/var ME_TTL_MS = (\d+) \* 60 \* 1000, ACH_TTL_MS = (\d+) \* 60 \* 1000;/); assert.ok(ttl);
  assert.ok(Number(ttl[1]) >= 1 && Number(ttl[1]) <= 5, 'o /me nunca fica velho por mais de 5 minutos: ' + ttl[1]);
  assert.ok(Number(ttl[2]) >= 1 && Number(ttl[2]) <= 10, 'as conquistas, no máximo 10 minutos: ' + ttl[2]);
  const mk = (acc, now) => new Function('acc', 'Date', ttl[0] + ' ' + conta.match(/function meFresh\(\)[^\n]*/)[0] + ' ' + conta.match(/function achFresh\(\)[^\n]*/)[0] + ' return { meFresh: meFresh, achFresh: achFresh };')(acc, { now: () => now });
  const T = 1000000, M = Number(ttl[1]) * 60000, A = Number(ttl[2]) * 60000;
  assert.equal(mk({ me: null, dirty: false, meAt: T }, T).meFresh(), false, 'sem dados: busca');
  assert.equal(mk({ me: {}, dirty: true, meAt: T }, T).meFresh(), false, 'sujo (jogou, XP, amigo): busca');
  assert.equal(mk({ me: {}, dirty: false, meAt: T }, T + M + 1).meFresh(), false, 'passou do prazo: busca');
  assert.equal(mk({ me: {}, dirty: false, meAt: T }, T + M - 1).meFresh(), true, 'dentro do prazo e sem mudança: NÃO busca');
  assert.equal(mk({ ach: null, achStale: false, achAt: T }, T).achFresh(), false);
  assert.equal(mk({ ach: {}, achStale: true, achAt: T }, T).achFresh(), false, 'marcadas como velhas (partida, amigo, compra): busca');
  assert.equal(mk({ ach: {}, achStale: false, achAt: T }, T + A - 1).achFresh(), true);
  assert.equal(mk({ ach: {}, achStale: false, achAt: T }, T + A + 1).achFresh(), false);
});

test('cliente: a volta ao início só recarrega se preciso; outras telas e eventos do servidor marcam "sujo"', () => {
  assert.match(conta, /if \(name === 'home'\) \{ acc\.pending = null; QC\.goLabel = null; if \(acc\.me && !meFresh\(\)\) loadMe\(\); \}\s*\n\s*else if \(name !== 'me'\) acc\.dirty = true;/);
  assert.doesNotMatch(conta.slice(conta.indexOf('QC.onScreen = function')).split('\n').slice(0, 4).join('\n'), /loadAch/, 'a tela inicial nunca pede as conquistas');
  assert.match(conta, /if \(ev\.t !== 'presence'\) \{ acc\.dirty = true; acc\.achStale = true; \}/, 'XP, amigo, convite: sujo; presença (frequente): não');
  assert.match(conta, /acc\.me\.gems = gems; paintChip\(\); acc\.achStale = true;/, 'comprar categoria conta para as conquistas');
  assert.match(conta, /if \(acc\.token\) \{ if \(!meFresh\(\)\) loadMe\(\); loadFriends\(\); \}/);
});

test('cliente: as conquistas só são pedidas ao abrir perfil/aba, sem pedido duplicado e sem aceitar resposta de outra conta', () => {
  const load = fn(conta, 'loadAch');
  assert.match(load, /if \(!force && achFresh\(\)\) return Promise\.resolve\(acc\.ach\);\s*\n\s*if \(acc\.achBusy\) return acc\.achBusy;/, 'não repete o pedido em andamento');
  assert.match(load, /var sent = acc\.token;[\s\S]*if \(j && j\.ok && sent === acc\.token\) \{ storeAch\(j\); repaintAch\(\); \}/, 'a resposta de um login antigo é descartada');
  assert.match(conta, /if \(t === 'profile' \|\| t === 'ach' \|\| t === 'col'\) loadAch\(\);/);
  assert.equal((conta.match(/loadAch\(/g) || []).length, 2, 'só a definição e o setTab: nenhum pedido escondido em outro lugar (a tela inicial e os eventos nunca pedem as conquistas)');
  assert.match(conta, /acc\.me = null; acc\.friends = null; acc\.pending = null; acc\.ach = null; acc\.achStale = true;/, 'sair da conta apaga as conquistas guardadas');
});

test('cliente: enquanto as conquistas carregam aparece um aviso (e nunca HTML com dado do servidor)', () => {
  assert.match(conta, /function paintAchLoading\(\)/);
  assert.match(conta, /'Carregando suas conquistas…'/);
  assert.match(conta, /\$\('#col-count'\)\.textContent = 'Carregando…'/);
  for (const m of conta.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)) assert.match(m[1].trim(), /^''$/, 'innerHTML só para limpar: ' + m[0]);
});

/* ---------------- fontes: o maior custo medido ---------------- */
test('fontes: nenhum nome de fonte que não existe nos aparelhos (cada um custa ~230 ms na abertura do perfil)', () => {
  const OK = new Set(['fredoka', 'system-ui', '-apple-system', 'roboto', 'sans-serif', 'avenir next rounded', 'monospace', 'serif', 'ui-monospace']);
  const stacks = [...css.matchAll(/(?:font-family|--font|--home-font):\s*([^;}]+)[;}]/g)].map((m) => m[1]);
  const names = new Set();
  for (const st of stacks) for (const n of st.split(',')) { const x = n.trim().replace(/^["']|["']$/g, '').toLowerCase(); if (x && !x.startsWith('var(')) names.add(x); }
  for (const n of names) assert.ok(OK.has(n), 'nome de fonte não permitido: "' + n + '"');
  for (const proibido of ['nunito', 'segoe ui', 'segoe ui variable display']) assert.ok(!names.has(proibido), proibido + ' não pode voltar');
  assert.match(css, /--font: system-ui, -apple-system, Roboto, sans-serif;/);
  assert.match(css, /--home-font: "Fredoka", var\(--font\);/);
  assert.doesNotMatch(css, /font-family: "Fredoka", "Avenir Next Rounded"/);
});

test('fontes: nos aparelhos da Apple a Avenir Next Rounded continua (só lá), e o canvas da imagem compartilhada também ficou sem nomes inexistentes', () => {
  assert.match(css, /@supports \(font: -apple-system-body\) \{ :root \{ --font: "Avenir Next Rounded", system-ui, -apple-system, Roboto, sans-serif; \} \}/);
  assert.ok(css.indexOf('@supports (font: -apple-system-body)') > css.indexOf('--font: system-ui'), 'a regra da Apple vem DEPOIS, para vencer');
  assert.match(game, /var fam = 'system-ui, Roboto, sans-serif';/);
  assert.doesNotMatch(game, /Segoe UI|Nunito|Avenir/);
});
