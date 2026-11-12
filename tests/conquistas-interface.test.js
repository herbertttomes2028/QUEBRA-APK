"use strict";
// Conquistas e coleções: interface (abas, áreas), privacidade nas rotas, segurança do desenho e acessibilidade (toque e contraste).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('public/index.html'), conta = read('public/conta.js'), css = read('public/style.css'), accounts = read('accounts.js'), game = read('public/game.js');
const bloco = conta.slice(conta.indexOf('/* ---------- conquistas e coleções ---------- */'), conta.indexOf('function renderAvatarChoices()'));
const cssNovo = css.slice(css.indexOf('/* ===================== Conquistas e coleções (perfil) ===================== */'), css.indexOf('/* ===================== Conquista concluída: cartões, aviso no topo e selo nas listas ===================== */'));   // só o bloco do perfil (o do aviso de conquista tem os próprios testes)

test('abas do meu espaço: Perfil, Conquistas, Coleções e Partidas, cada uma com o seu painel', () => {
  for (const t of ['profile', 'ach', 'col', 'history']) assert.match(html, new RegExp('class="me-tab[^"]*" type="button" data-tab="' + t + '"'));
  for (const id of ['tab-ach', 'tab-col', 'ach-summary', 'ach-filters', 'ach-groups', 'ach-list', 'col-list', 'col-count', 'me-tab-ach-badge']) assert.ok(html.includes('id="' + id + '"'), id);
  assert.match(html, /<i id="me-tab-ach-badge" class="me-badge" hidden><\/i>/);
  assert.match(html, /id="fp-ach" class="shelf"/);                                          // perfil de amigo: prateleira, não a grade do dono
  assert.match(conta, /\['profile', 'ach', 'col', 'friends', 'history'\]\.forEach/);
  assert.match(conta, /if \(t === 'ach'\) renderAch\(\);\s*\n\s*if \(t === 'col'\) renderCol\(\);/);
  assert.match(conta, /paintStats\(\$\('#me-stats'\), \[\['Partidas', st\.games, 'c1'\][^\n]*\n\s*updateAchBadge\(\);/, 'o Perfil mostra só as estatísticas; o selo de novidades da aba do troféu continua');
  assert.match(conta, /paintFriendAch\(\$\('#fp-ach'\), \$\('#fp-ach-count'\), p\.achievements, p\.achSummary\)/);
});

test('o texto que vem do servidor nunca vira HTML: só textContent, nunca innerHTML com conteúdo', () => {
  assert.ok(bloco.length > 3000, 'bloco de conquistas não encontrado');
  const atribuicoes = [...bloco.matchAll(/\.innerHTML\s*=\s*([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(atribuicoes.length >= 5 && atribuicoes.every((v) => v === "''"), 'innerHTML só para LIMPAR: ' + atribuicoes.join(' | '));
  assert.doesNotMatch(bloco, /insertAdjacentHTML|outerHTML|document\.write|\.append\(\s*['"`]</);
  assert.match(bloco, /function el\(|el\('/);                                                // usa o helper el() (textContent)
});

test('privacidade nas rotas: meu perfil usa a visão completa, o do amigo SÓ a pública', () => {
  assert.match(accounts, /achievements: ach\.meView\(achRows\)/);
  assert.match(accounts, /achievements: ach\.friendView\(fr2\.rows\), achSummary: ach\.friendSummary\(fr2\.rows\)/);
  const rota = accounts.slice(accounts.indexOf("r.get('/friends/profile'"), accounts.indexOf("r.get('/matches'"));
  assert.ok(rota.includes('friendView') && !rota.includes('meView') && !/collections|achMeta/.test(rota), 'o perfil de amigo não recebe coleções, nem a visão do dono');
  assert.match(rota, /velocidade|hábitos|segredas|secretas/, 'o comentário de privacidade da rota cita o que não sai');
});

test('pagamento: várias passadas com limite, XP do catálogo, ref única por conquista e dentro de accounts.js', () => {
  const f = accounts.slice(accounts.indexOf('async function awardAchievements(uid)'), accounts.indexOf('// junta partida + conquistas'));
  assert.match(f, /for \(let pass = 0; pass < 6; pass\+\+\)/);
  assert.match(f, /'ach:' \+ a\.id, a\.xp/);
  assert.match(f, /ON CONFLICT \(user_id, ref\) DO NOTHING/);
  assert.match(f, /FOR UPDATE/);
  assert.match(f, /gemm\.creditTx\(q, uid, '', 0, false, u\.xp, r\.rows\[0\]\.xp\)/);
  assert.doesNotMatch(f, /req\.(body|query)/);
});

test('"NOVA": base na primeira vez, selo e emblema com texto para leitor de tela, seção própria no topo', () => {
  assert.match(bloco, /if \(seen === null\) \{ store\.set\(achSeenKey\(\), done\); return \[\]; \}/);
  assert.match(bloco, /conquista nova' : ' conquistas novas'/);
  assert.match(bloco, /'✨ Novas conquistas!'/);
  assert.match(bloco, /!\(onTop && isFresh\[a\.id\]\)/);                                  // não repete nos grupos
  assert.match(bloco, /achMarkSeen\(list\); updateAchBadge\(\);/);
});

test('acessibilidade: cada cartão e botão com nome completo, alvos de toque de 44 px, foco visível', () => {
  assert.match(bloco, /d\.setAttribute\('aria-label', a\.title \+ ', ' \+ TIER_NAME\[a\.tier\]/);
  assert.match(bloco, /ico\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(bloco, /aria-pressed/);
  assert.match(bloco, /ring\.setAttribute\('role', 'img'\)/);
  assert.match(cssNovo, /\.ach-chip \{[^}]*min-height: 44px/);
  assert.match(cssNovo, /\.ach-chip:focus-visible[^{]*\{ outline: 3px solid var\(--sel\)/);
  assert.match(cssNovo, /\.me-tabs \.me-tab \{ font-size: \.74rem; padding-inline: 2px; min-width: 0; \}/);       // 4 abas cabem em 320 px
  assert.match(cssNovo, /overflow-wrap: anywhere/);
});

test('sem movimento no bloco novo (nada de animação nem transição): o perfil continua calmo com "movimento reduzido"', () => {
  assert.doesNotMatch(cssNovo, /@keyframes|animation\s*:|transition\s*:/);
});

// contraste WCAG
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4))); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + .05) / (y + .05); };
test('contraste mínimo 4,5:1 nos selos de nível, nos dois temas, e no selo "NOVA"', () => {
  for (const t of ['bronze', 'prata', 'ouro', 'diamante']) {
    const claro = cssNovo.match(new RegExp('\\.t-' + t + ' \\{ --ring: (#[0-9a-f]{6}); --chip-bg: (#[0-9a-f]{6}); --chip-ink: (#[0-9a-f]{6}); \\}'));
    const escuro = cssNovo.match(new RegExp('html\\[data-theme="dark"\\] \\.t-' + t + ' \\{ --chip-bg: (#[0-9a-f]{6}); --chip-ink: (#[0-9a-f]{6}); \\}'));
    assert.ok(claro && escuro, t + ': paleta não encontrada');
    assert.ok(ratio(claro[2], claro[3]) >= 4.5, t + ' claro: ' + ratio(claro[2], claro[3]).toFixed(2));
    assert.ok(ratio(escuro[1], escuro[2]) >= 4.5, t + ' escuro: ' + ratio(escuro[1], escuro[2]).toFixed(2));
  }
  assert.ok(ratio('#d6204a', '#ffffff') >= 4.5, 'selo NOVA: ' + ratio('#d6204a', '#ffffff').toFixed(2));
  assert.ok(ratio('#b3261e', '#ffffff') >= 4.5 && ratio('#ffb4a8', '#1b1b2f') >= 4.5, 'título "Novas conquistas!" nos dois temas');
});
