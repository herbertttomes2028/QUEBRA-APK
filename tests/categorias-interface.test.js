"use strict";
// Rodada A: interface das categorias (regra de liberação clara, grade em 3 colunas, "próxima", gate e prévia da compra).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = read('public/game.js'), css = read('public/style.css'), html = read('public/index.html');

test('o texto de bloqueio usa a regra de VERDADE (as N primeiras), com progresso, e não o nome da categoria inteira', () => {
  assert.match(js, /function libraryUnlockInfo\(c\)/);
  assert.match(js, /'Conclua as ' \+ g \+ ' primeiras de ' \+ prev\.name/);
  assert.match(js, /function hintFor\(c\) \{ var u = libraryUnlockInfo\(c\);/);
  assert.match(js, /var u = libraryUnlockInfo\(c\);\s*\n\s*if \(!libraryProgress\.loaded && libraryToken\(\)\)/);
  assert.doesNotMatch(js, /'Conclua ' \+ libraryRequired\(c\)\.name \+ ' para liberar'/, 'o texto antigo (pedia a categoria inteira) não pode voltar');
  assert.match(js, /library-gate-progress/);                                  // barra do progresso do gate na placa
  assert.match(js, /' \(' \+ u\.done \+ ' de ' \+ u\.total \+ '\) para liberar\.'/);   // rótulo de acessibilidade com o progresso
});

test('categorias pagas mostram a quantidade real de imagens; a confirmação não diz mais "as 5 imagens"', () => {
  assert.match(js, /library-count', c\.images\.length \+ ' imagens'/);
  assert.match(js, /as ' \+ c\.images\.length \+ ' imagens\? Saldo: '/);
  assert.doesNotMatch(js, /as 5 imagens/);
  assert.match(js, /'Desbloquear ' \+ c\.name \+ ' por ' \+ c\.price \+ ' gemas, ' \+ c\.images\.length \+ ' imagens'/);
});

test('prévia na confirmação: miniaturas escondidas dos leitores de tela e sempre limpa antes de cada confirmação', () => {
  assert.match(html, /id="cfm-preview" class="cfm-preview" aria-hidden="true" hidden/);
  assert.match(js, /preview: libraryPreview\(c\)/);
  assert.match(js, /var pv = \$\('#cfm-preview'\); pv\.textContent = '';/);
  assert.match(js, /im\.alt = '';/);
  assert.match(js, /pv\.hidden = !\(o\.preview && o\.preview\.length\);/);
  assert.match(css, /\.cfm-thumb \{[^}]*width: 62px; height: 83px/);
});

test('libraryPreview devolve até 4 imagens distintas e espalhadas (primeira e última incluídas)', () => {
  const src = (js.match(/function libraryPreview\(c\) \{[\s\S]*?\n  \}/) || [])[0];
  assert.ok(src, 'função não encontrada');
  const libraryPreview = new Function(src + '; return libraryPreview;')();
  const mk = (n) => ({ images: Array.from({ length: n }, (_, i) => ({ file: 'f' + i })) });
  for (const n of [1, 2, 3, 4, 5, 15, 63]) {
    const r = libraryPreview(mk(n));
    assert.ok(r.length >= 1 && r.length <= 4, 'n=' + n + ' -> ' + r.length);
    assert.equal(new Set(r).size, r.length, 'sem repetidas, n=' + n);
    assert.equal(r[0], 'f0'); assert.equal(r[r.length - 1], 'f' + (n - 1));
  }
  assert.deepEqual(libraryPreview(mk(63)), ['f0', 'f21', 'f42', 'f62']);
});

test('cartões da categoria: miniatura versionada; a capa continua usando a imagem principal', () => {
  assert.match(js, /function libraryImage\(file, title, small\)/);
  assert.match(js, /var src = i\.categoryId \? i\.url : \(i\.thumb \|\| i\.url\);\s*\n\s*if \(small && i\.thumb\) src = splashThumbUrl\(i\.thumb\);/);
  assert.match(js, /thumb\.appendChild\(libraryImage\(item\.file, item\.label, true\)\)/);
  assert.match(js, /cover\.appendChild\(libraryImage\(c\.images\[0\]\.file, c\.name\)\)/);       // capa: sem "small"
});

test('"Próxima", chave do gate e atalho "Continuar" (com movimento reduzido respeitado)', () => {
  assert.match(js, /\(nextItem && item\.file === nextItem\.file \? ' next' : ''\)/);
  assert.match(js, /\(idx < gateN && !libraryDone\(item\.file\) \? ' gate' : ''\)/);
  assert.match(js, /'▶ Próxima'/); assert.match(js, /'🔑'/);
  assert.match(js, /' Conta para liberar ' \+ deps\[0\]\.name/);                                 // quem usa leitor de tela ouve o motivo da chave
  assert.match(js, /cont\.hidden = !\(inCat && nextIdx >= 6\)/);
  assert.match(js, /behavior: reducedMotion\(\) \? 'auto' : 'smooth'/);
  assert.match(js, /b\.title = item\.label/);                                                    // o rótulo cortado em 2 linhas continua inteiro no toque longo
  assert.match(html, /id="library-continue" class="library-continue" type="button" hidden/);
  assert.match(html, /id="library-gate" class="library-gate" hidden/);
});

test('cabeçalho da categoria explica o que ela libera e quanto falta', () => {
  // desde a rodada "fundos": o selo lista TODAS as coleções que o progresso libera ("A, B e C"), e o "✓" virou o ícone de peça do selo
  assert.match(js, /nomes \+ \(varias \? ' liberadas' : ' liberada'\)/);
  assert.match(js, /'As ' \+ gn \+ ' primeiras liberam ' \+ nomes/);
  assert.match(js, /'Concluir todas libera ' \+ nomes/);
  assert.match(js, /function libraryNames\(list\)/);
});

test('CSS: 3 colunas, chips, ping só com movimento permitido, alvos de toque e modo escuro', () => {
  assert.match(css, /#screen-pick \.pick-grid\.library-gallery \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); gap: 9px; \}/);
  assert.match(css, /\.pick-chip\.next-chip/); assert.match(css, /\.pick-chip\.key-chip/);
  assert.match(css, /html:not\(\[data-motion="reduce"\]\) \.pick-card\.ping \{ animation: pick-ping/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.pick-card\.ping \{ animation: none; \} \}/);
  assert.match(css, /\.library-continue \{[^}]*min-height: 44px/);
  assert.match(css, /html\[data-theme="dark"\] \.library-gate/);
  assert.match(css, /\.library-gate\[hidden\], \.library-continue\[hidden\], \.cfm-preview\[hidden\] \{ display: none; \}/);
  const kf = (css.match(/@keyframes pick-ping \{[^\n]*\}/) || [''])[0];
  assert.ok(kf && !/(box-shadow|filter|width|height|top|left)\s*:/.test(kf), 'pick-ping só pode animar transform');
});
