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
  '--fs-marca': 'clamp(2.1rem, 9.6vw, 2.8rem)', '--fs-t1': '1.75rem', '--fs-t2': '1.4rem', '--fs-t3': '.8rem', '--fs-texto': '1rem', '--fs-nota': '.85rem', '--fs-mini': '.75rem',
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
test('a régua bate com o modelo (a caixa dos Ajustes) e com o botão de hoje', () => {
  assert.match(css, /\.set-box \{[^}]*border-radius: 18px; background: var\(--paper-2\); border: 1px solid var\(--line\); box-shadow: 0 3px 10px rgba\(27, 37, 89, \.1\);/);
  assert.match(css, /\.btn-xl \{ min-height: 64px;/); assert.match(css, /\.btn-small \{ min-height: 44px;/);
  assert.match(css, /\.btn-primary \{[^}]*box-shadow: 0 5px 0 var\(--sun-deep\)/);
});
