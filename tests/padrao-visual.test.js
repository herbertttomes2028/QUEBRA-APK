'use strict';
// Padrão visual único do jogo (rodada padrao-regua): as medidas com nome existem, com os valores combinados, e só num lugar.
// As próximas rodadas trocam valores soltos por estes nomes; mudar um número aqui muda o jogo inteiro.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public/style.css'), 'utf8');
const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));

const REGUA = {
  '--fs-marca': 'clamp(2.1rem, 9.6vw, 2.8rem)', '--fs-t1': '1.75rem', '--fs-t2': '1.5rem', '--fs-t3': '.8rem', '--fs-texto': '1rem', '--fs-nota': '.85rem', '--fs-mini': '.75rem', '--fs-destaque': '1.25rem',
  '--btn-g': '64px', '--btn-m': '52px', '--btn-p': '44px', '--btn-degrau': '5px', '--btn-degrau-on': '2px',
  '--r-peq': '12px', '--r-caixa': '18px', '--r-janela': '28px', '--r-redondo': '999px',
  '--sh-nenhuma': 'none', '--sh-caixa': '0 3px 10px rgba(27, 37, 89, .1)', '--sh-degrau': '0 var(--btn-degrau) 0', '--sh-flutua': '0 10px 28px rgba(27, 37, 89, .22)',
  '--caixa-fundo': 'var(--paper-2)', '--caixa-borda': '1px solid var(--line)',
  '--sp-1': '4px', '--sp-2': '8px', '--sp-3': '12px', '--sp-4': '16px', '--sp-5': '24px', '--sp-6': '32px'
};
test('a régua existe no :root com os valores combinados', () => {
  for (const [k, v] of Object.entries(REGUA)) {
    const m = new RegExp('\\n\\s*' + k + ': ([^;]+);').exec(root);
    assert.ok(m, k + ' existe no :root'); assert.equal(m[1].trim(), v, k);
  }
});
test('cada nome é definido uma vez só (fora o ajuste do tema escuro para as sombras)', () => {
  for (const k of Object.keys(REGUA)) {
    const defs = (css.match(new RegExp('(^|[\\s;{])' + k + '\\s*:', 'g')) || []).length;
    const esperado = ['--sh-caixa', '--sh-flutua'].includes(k) ? 2 : 1;
    assert.equal(defs, esperado, k);
  }
  const dark = css.slice(css.indexOf('html[data-theme="dark"] {\n  color-scheme: dark;'));
  assert.match(dark.slice(0, 400), /--sh-caixa: 0 3px 10px rgba\(0, 0, 0, \.3\);/);
  assert.match(dark.slice(0, 400), /--sh-flutua: 0 10px 28px rgba\(0, 0, 0, \.45\);/);
});
test('a régua bate com o modelo (a caixa dos Ajustes) e os botões usam a régua', () => {
  assert.match(css, /\.set-box \{[^}]*border-radius: var\(--r-caixa\); background: var\(--caixa-fundo\); border: var\(--caixa-borda\); box-shadow: var\(--sh-caixa\);/);
  assert.match(css, /\.btn-xl \{ min-height: var\(--btn-g\);/); assert.match(css, /\.btn-small \{ min-height: var\(--btn-p\);/);
  assert.match(css, /\.btn-primary \{[^}]*box-shadow: var\(--sh-degrau\) var\(--sun-deep\)/);
});

// Rodada padrao-letras-botoes (partes 2 e 3 do padrão visual)
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
test('títulos usam a régua: tela = t1, janela = t2 (1.5rem), grupo = t3', () => {
  assert.match(css, /\nh2 \{[^}]*font-size: var\(--fs-t1\);/); assert.match(css, /\nh3 \{[^}]*font-size: var\(--fs-t2\);/);
  assert.match(css, /\.duel-sheet h3 \{[^}]*font-size: var\(--fs-t2\);/); assert.match(css, /\.tut-head \{[^}]*font-size: var\(--fs-t2\);/);
  assert.match(css, /\.set-group-title \{[^}]*font-size: var\(--fs-t3\);/); assert.match(css, /#screen-home h1 \{[^}]*font-size: var\(--fs-marca\);/);
  assert.match(read('public/loja.css'), /\.shop-head h2 \{[^}]*font-size: var\(--fs-t2\);/);
  assert.match(read('public/telas.css'), /#pick-title \{[^}]*font-size: clamp\(1\.45rem, 6\.6vw, var\(--fs-t1\)\);/);
});
test('texto comum só nos 3 tamanhos da régua (fora jogo, ícones e emojis)', () => {
  // nenhum tamanho "quase igual" sobrou entre .72rem e 1.06rem nas folhas da interface (as exceções são ícones, peças, contagem e o jogo)
  const EXC = /hud|\.cd-|countdown|go-|piece|board|tile|tray-skin|ico\b|-ico|icon|emoji|av-face|avatar|badge|spark|crown|bulb|pet-em|\.lg\b|logo|mascot|tut-|confetti|victory|fr-av|\.dr-|milestone|me-eye|me-chip-face|letter|\.key\b|\.pz|\.ps-title|code-strip|#ver-code|#fg-code|size-btn|win-time strong|lvup|\.seg button|::before|::after/;
  for (const f of ['public/style.css', 'public/loja.css', 'public/pet.css', 'public/telas.css', 'public/suave.css']) {
    const s = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of s.matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
      const sel = m[1].trim(); if (sel.startsWith('@') || EXC.test(sel)) continue;
      for (const d of m[2].matchAll(/font-size\s*:\s*([0-9]*\.?[0-9]+)rem/g)) { const x = Number(d[1]); assert.ok(x < 0.72 || x > 1.06, f + ' ' + sel + ' usa ' + d[1] + 'rem: use --fs-mini/--fs-nota/--fs-texto'); }
    }
  }
});
test('botões: 3 alturas, mesmo degrau, perigo com classe própria', () => {
  assert.match(css, /\.btn \{[^}]*min-height: var\(--btn-m\);[^}]*font-size: var\(--fs-texto\);/);
  assert.match(css, /\.btn-ghost \{[^}]*min-height: var\(--btn-p\);/);
  assert.match(css, /#btn-play \{[^}]*min-height: var\(--btn-g\);[^}]*font-size: var\(--fs-destaque\);[^}]*box-shadow: var\(--sh-degrau\) var\(--sun-deep\)/);
  assert.match(css, /\.btn-duel \{[^}]*min-height: var\(--btn-g\);[^}]*box-shadow: var\(--sh-degrau\) #3a2fa8/);
  assert.match(css, /\.btn-continue, \.me-save \{[^}]*min-height: var\(--btn-g\);[^}]*border-radius: var\(--r-caixa\);[^}]*box-shadow: var\(--sh-degrau\) #0b7a5c;/);
  assert.match(css, /\.btn-danger, \.me-danger \{ background: var\(--warn\); color: #fff; box-shadow: var\(--sh-degrau\) #7d151b; \}/);
  for (const sel of ['.go-cancel', '.me-mini']) assert.match(css, new RegExp(sel.replace('.', '\\.') + ' \\{ min-height: var\\(--btn-p\\);'));
  const lj = read('public/loja.css'); assert.match(lj, /\.shop-x \{ min-width: var\(--btn-p\); min-height: var\(--btn-p\);/); assert.match(lj, /\.shop-ads-btn \{ min-height: var\(--btn-p\);[^}]*box-shadow: var\(--sh-degrau\) var\(--line\)/);
  // o degrau dos botões não volta a ter alturas diferentes (6 e 7 px eram do Jogar e do Jogar com amigos)
  assert.doesNotMatch(css, /box-shadow: 0 [67]px 0 (var\(--sun-deep\)|#3a2fa8)/);
});

// Rodada padrao-caixas (parte 4, opção A do proprietário): todas as caixas iguais às dos Ajustes — canto de 18px e sombra suave.
test('caixas: canto --r-caixa e sombra suave (sem o "degrau" embaixo); destaques coloridos continuam por cima', () => {
  const lj = read('public/loja.css'), pt = read('public/pet.css');
  assert.match(css, /--caixa-sombra: var\(--sh-caixa\), inset 0 0 0 1px var\(--line\);/);
  const regra = (txt, sel) => { const i = txt.indexOf('\n' + sel + ' {'); assert.ok(i >= 0, sel); return txt.slice(i, txt.indexOf('}', i)); };
  for (const sel of ['.me-card', '.me-stat', '.me-a', '.fr-row', '.fr-box', '.chal-opt', '.me-notice', '.fp-codebox', '.xp-line', '.ach-card', '.col-card', '.duel-row', '.lobby-image']) {
    const r = regra(css, sel); assert.match(r, /border-radius: var\(--r-caixa\);/, sel); assert.match(r, /box-shadow: var\(--caixa-sombra\);/, sel);
  }
  for (const sel of ['.shop-card', '.mine-editor', '.shop-note', '.shop-ads']) { const r = regra(lj, sel); assert.match(r, /border-radius: var\(--r-caixa\);/, sel); assert.match(r, /box-shadow: var\(--caixa-sombra\);/, sel); }
  assert.match(regra(pt, '.pet-opts'), /border-radius: var\(--r-caixa\);/);
  // nenhum "degrau" de caixa sobrou (o degrau agora é só dos botões)
  // (os botões de quantidade e os ícones do "Como jogar" são botão/ilustração: ficam com o degrau)
  for (const [nome, txt] of [['style.css', css], ['loja.css', lj]]) {
    const semBotoes = txt.split('\n').filter((l) => !/size-btn|tut-icons|^\s{2}box-shadow: 0 4px 0 var\(--line-2\);$/.test(l)).join('\n');
    assert.doesNotMatch(semBotoes, /box-shadow: 0 [3-9]px 0 (\d+px )?var\(--line-2\)/, nome + ': caixa com degrau');
    assert.doesNotMatch(txt, /0 6px 14px rgba/, nome + ': sombra antiga da Loja');
  }
  assert.match(css, /\n\.ach-pop \{[^}]*border-radius: var\(--r-caixa\);[^}]*box-shadow: var\(--sh-caixa\)/);
  // destaques continuam, junto com a sombra padrão
  assert.match(css, /\.pick-card\[aria-selected="true"\] \{[^}]*box-shadow: 0 0 0 4px var\(--sel\), var\(--sh-caixa\);/);
  assert.match(css, /\.lobby-player \{[^}]*box-shadow: var\(--sh-caixa\), inset 0 0 0 3px var\(--c\);/);
  assert.match(css, /\.ach-card\.fresh \{ box-shadow: 0 0 0 3px #ffbe36, var\(--sh-caixa\); \}/);
  assert.match(lj, /\.shop-card\.is-on \{[^}]*0 0 0 3px #0b7a5c, var\(--sh-caixa\)/);
});
test('"MUNDOS FANTÁSTICOS" (e qualquer categoria) só quebra entre palavras', () => {
  assert.match(css, /\.library-name \{[^}]*overflow-wrap: normal; word-break: normal;/);
  assert.match(css, /html\[data-text="xlarge"\] \.library-name \{ font-size: clamp\(\.7rem, 3\.2vw, \.84rem\); letter-spacing: 0; \}/);
});
