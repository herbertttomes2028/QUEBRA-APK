'use strict';
// Meu espaço: as conquistas ficam SÓ na aba do troféu (nunca no Perfil), e a aba Coleções cabe na tela (nenhum cartão passa da largura).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('public/index.html'), conta = read('public/conta.js'), style = read('public/style.css');
const pane = (id) => { const a = html.indexOf('<div id="' + id + '" class="me-tabpane"'); assert.ok(a > 0, id); const rest = html.slice(a + 10); const m = rest.search(/<!-- [a-zçãé ]+ -->\s*\n\s*<div id="tab-/i); return html.slice(a, m > 0 ? a + 10 + m : a + 6000); };

test('Perfil: depois das estatísticas NÃO há mais conquistas (nem título, nem "Quase lá", nem o botão "Ver todas"): só a Segurança e a conta', () => {
  const p = pane('tab-profile');
  assert.ok(p.includes('id="me-stats"'), 'as estatísticas continuam');
  for (const sumiu of ['id="me-ach"', 'id="me-ach-count"', 'id="me-ach-all"', 'ach-next', 'Ver todas as conquistas', '>Conquistas <small']) assert.ok(!p.includes(sumiu), 'saiu do Perfil: ' + sumiu);
  assert.ok(p.indexOf('id="me-stats"') < p.indexOf('🔒 Segurança'), 'estatísticas → Segurança');
  assert.doesNotMatch(conta, /function paintAchNext|function paintAchLoading|#me-ach\b|me-ach-all|me-ach-count/, 'o JS do bloco removido também saiu');
  assert.doesNotMatch(style, /\.ach-next\b/, 'e o estilo dele');
});
test('as conquistas continuam na aba do troféu (resumo, filtros, grupos e lista), com o selo de novidades, e o aviso de "conquista concluída" ainda abre essa aba', () => {
  const a = pane('tab-ach');
  for (const id of ['ach-summary', 'ach-filters', 'ach-groups', 'ach-list']) assert.ok(a.includes('id="' + id + '"'), id);
  assert.match(html, /data-tab="ach"><span aria-hidden="true">🏆<\/span>Conquistas<i id="me-tab-ach-badge" class="me-badge" hidden><\/i>/);
  assert.match(conta, /QC\.showAchievements = function \(\) \{ if \(!acc\.token\) return; acc\.tab = 'ach'; openMe\(\); \};/);
  assert.match(conta, /if \(acc\.tab === 'ach'\) renderAch\(\); else if \(acc\.tab === 'col'\) renderCol\(\);/, 'ao chegar os dados repinta só a aba aberta'); assert.match(conta, /paintStats\([^\n]*\n\s*updateAchBadge\(\);/, 'o Perfil só pinta estatísticas e atualiza o selo da aba do troféu');
  assert.ok(pane('tab-col').includes('id="col-list"'), 'a aba Coleções continua');
});
test('Coleções: o cartão NUNCA passa da largura da tela (contain-intrinsic-size com um valor dava 420 px de LARGURA estimada); nenhum CSS usa mais essa propriedade', () => {
  for (const f of fs.readdirSync(path.join(root, 'public')).filter((n) => n.endsWith('.css'))) assert.doesNotMatch(read('public/' + f).replace(/\/\*[\s\S]*?\*\//g, ''), /contain-intrinsic-size/, f + ': só se estima a ALTURA (contain-intrinsic-height)');
  assert.match(style, /\.ach-card, \.col-card \{ content-visibility: auto; contain-intrinsic-height: auto 118px; \}/); assert.match(style, /\.col-card \{ contain-intrinsic-height: auto 420px; min-width: 0; max-width: 100%; \}/);
  assert.match(style, /\.col-list \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/, 'a coluna da grade nunca passa do espaço disponível');
  assert.match(read('public/loja.css'), /content-visibility: auto; contain-intrinsic-height: auto 400px;/, 'o cartão da loja tinha o mesmo defeito latente');
  assert.match(style, /#tab-col > \.me-h small \{ display: block;/, 'o contador das coleções numa linha própria');
});
