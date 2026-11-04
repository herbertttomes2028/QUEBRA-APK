"use strict";
// Rodada A: nova celebração de nível (medalha por faixa, número que rola, anel, confete, gemas contando, som próprio).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const js = read('public/game.js'), css = read('public/style.css'), html = read('public/index.html');
const fn = (name) => { const m = js.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}')); assert.ok(m, name + ' não encontrada'); return m[0]; };

test('HTML: camadas decorativas escondidas dos leitores de tela e o selo de faixa começa oculto', () => {
  assert.match(html, /id="lvup-confetti" class="lvup-confetti" aria-hidden="true"/);
  assert.match(html, /id="lvup-tier" class="lvup-tier" hidden/);
  assert.match(html, /<span class="lvup-flash"><\/span><span class="lvup-ring"><\/span>/);
  assert.match(html, /<div class="lvup-award" aria-hidden="true">/);                      // a medalha é decorativa; o número vai em #lvup-sr-level
  assert.match(html, /id="lvup-sr-level" class="sr-only"/);
});

test('movimento reduzido: a sequência NÃO começa (sem lvup-go), o valor final já está no texto e só o som toca', () => {
  const f = fn('playLevelAnimation');
  const iRed = f.indexOf('if (reducedMotion())'), iGo = f.indexOf("classList.add('lvup-go')");
  assert.ok(iRed > 0 && iGo > iRed, 'a checagem de movimento reduzido vem ANTES de ligar as animações');
  assert.match(f, /\$\('#lvup-n'\)\.textContent = String\(to\);\s+\/\/ o valor final/);
  assert.match(f, /if \(reducedMotion\(\)\) \{ playSound\(tierUp \? 'levelupTier' : 'levelup'\); return; \}/);
  assert.match(f, /box\.className = 'lvup t' \+ lvTier\(to\)/);                            // cor da medalha = faixa do selo
  assert.match(f, /if \(steps\.length > 5\) steps = steps\.slice\(-5\)/);                  // muitas subidas: rola só pelos últimos 5 níveis
});

test('a sequência é limpa ao fechar (timers, animação das gemas, confete e classes) e ao recomeçar', () => {
  const f = fn('lvClear');
  for (const re of [/lvAnim\.timers\.forEach\(clearTimeout\)/, /cancelAnimationFrame\(lvAnim\.raf\)/, /classList\.remove\('lvup-go', 'lvup-land'\)/, /\$\('#lvup-confetti'\)\.textContent = ''/, /\$\('#lvup-tier'\)\.hidden = true/]) assert.match(f, re);
  assert.match(js, /box\.hidden = true; lvClear\(\);/);
  assert.match(fn('playLevelAnimation'), /^function playLevelAnimation\(from, to, gems\) \{\s*\n\s*lvClear\(\);/);
  assert.match(js, /playLevelAnimation\(from, to, \(pendingGems && pendingGems\.gems\) \|\| 0\)/);   // outra subida com o cartão aberto: recomeça com o novo total
});

test('confete: 24 peças (34 ao mudar de faixa), saem do centro da medalha e somem sozinhas', () => {
  const f = fn('lvBurst');
  assert.match(f, /count = big \? 34 : 24/);
  assert.match(f, /getBoundingClientRect\(\)/);
  assert.match(f, /lvAfter\(1900, function \(\) \{ layer\.textContent = ''; \}\)/);
  assert.match(f, /style\.setProperty\('--dx'/);
});

test('som próprio: fanfarra de subida e uma versão maior para mudança de faixa (a vitória do quebra-cabeça não é reusada)', () => {
  assert.match(js, /levelup: soundLevelup,/);
  assert.match(js, /levelupTier: function \(c\) \{/);
  assert.doesNotMatch(fn('tryLevelCelebration'), /playSound\('win'\)/);
  const calls = [];
  const soundLevelup = new Function('tone', fn('soundLevelup') + '; return soundLevelup;')((ctx, freq, start, dur, type, vol) => calls.push({ freq, start, dur, vol }));
  soundLevelup({});
  assert.equal(calls.length, 10, 'escala de 4 notas + acorde de 3 + 3 cintilações');
  assert.ok(calls.every((c) => c.freq > 300 && c.freq < 3000 && c.dur > 0 && c.dur <= 1 && c.vol > 0 && c.vol <= .2), 'faixa de frequência, duração e volume seguros');
  assert.ok(Math.max(...calls.map((c) => c.start + c.dur)) < 1.6, 'a fanfarra inteira dura menos de 1,6 s');
  assert.deepEqual(calls.slice(0, 4).map((c) => c.freq), [392, 494, 587, 784]);
});

test('CSS: 5 paletas de medalha (uma por faixa do selo) e a medalha usa as variáveis', () => {
  for (const t of [1, 2, 3, 4, 5]) assert.match(css, new RegExp('\\.lvup\\.t' + t + ' \\{ --m1:'));
  assert.match(css, /\.lvup \.lvup-medal \{ border-color: var\(--rim, #ffda66\); background: linear-gradient\(140deg, var\(--m1, #fffaad\)/);
  assert.match(css, /\.lvup \.lvup-medal-inner \{ background: radial-gradient\(circle at 35% 20%, var\(--i1/);
});

test('CSS: as animações novas só mexem em transform/opacity e só existem sob .lvup-go (que o JS só liga sem movimento reduzido)', () => {
  const nomes = ['lvup-stamp', 'lvup-title', 'lvup-ring', 'lvup-flash', 'lvup-pop', 'lvup-bump', 'lvup-nudge', 'lvup-roll-out', 'lvup-roll-in', 'lvup-confetti'];
  for (const n of nomes) {
    const m = css.match(new RegExp('@keyframes ' + n + ' \\{[^\\n]*\\}')); assert.ok(m, n);
    const props = [...m[0].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]).filter((p) => p !== 'transform' && p !== 'opacity');
    assert.deepEqual(props, [], n + ' só pode animar transform e opacity (nada de filter, blur, sombra ou layout)');
  }
  for (const sel of ['.lvup-go .lvup-medal', '.lvup-go .lvup-ring', '.lvup-go .lvup-flash', '.lvup-go.lvup-land .lvup-gems', '#lvup-n.roll-in']) assert.ok(css.includes(sel + ' { animation:'), sel);
  assert.match(css, /html\[data-motion="reduce"\] \.lvup-flash, html\[data-motion="reduce"\] \.lvup-ring, html\[data-motion="reduce"\] \.lvup-confetti \{ display: none; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.lvup-flash, \.lvup-ring, \.lvup-confetti \{ display: none; \} \}/);
});

test('regressão: anel e clarão começam INVISÍVEIS e esperam o impacto da medalha (0,78 s), em vez de aparecerem durante a queda', () => {
  assert.match(css, /\.lvup-go \.lvup-ring \{ animation: lvup-ring \.95s \.78s ease-out both; \}/);
  assert.match(css, /\.lvup-go \.lvup-flash \{ animation: lvup-flash \.55s \.78s ease-out both; \}/);
  assert.match(css, /@keyframes lvup-ring \{ 0% \{ transform: scale\(\.9\); opacity: 0; \}/);
  assert.match(css, /@keyframes lvup-flash \{ 0% \{ transform: scale\(\.55\); opacity: 0; \}/);
  assert.match(css, /\.lvup-go\.lvup-land \.lvup-continue \{ animation: lvup-nudge 1\.1s \.35s ease-in-out 3; \}/);      // o pulso do botão é finito
});

test('as gemas só aparecem na aterrissagem e contam até o total (o texto final sempre fica certo)', () => {
  assert.match(css, /\.lvup-go:not\(\.lvup-land\) \.lvup-gems \{ opacity: 0;/);
  const f = fn('lvCountGems');
  assert.match(f, /k >= 1 \? total :/);                                                    // no último passo escreve o total exato
  assert.match(fn('playLevelAnimation'), /\$\('#lvup-gems-count'\)\.textContent = '\+' \+ \(Number\(gems\) \|\| 0\)/);
});
