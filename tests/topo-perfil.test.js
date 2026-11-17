'use strict';
// Correção de 16/11/2026: na tela inicial, o perfil (alto, à direita) ficava por cima do logotipo (e do gorro do Natal) em alguns celulares
// (nome + nível + gemas no perfil, 393–430 px de largura, altura até ~640 px, ou letra grande). O perfil continua onde sempre esteve;
// o conteúdo começa abaixo dele onde há risco. Varredura no navegador (fora do repositório, topo-conflito.js): 432 combinações, 28 → 0 sobreposições.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const style = read('public/style.css'), telas = read('public/telas.css'), natal = read('public/tema-natal.css');
const RESERVA = /calc\(max\(0px, 10px - env\(safe-area-inset-top, 0px\)\) \+ (\d+)px\)/;

test('o perfil e a ajuda continuam no alto, onde sempre estiveram (44 px, a max(10px, área segura) do topo)', () => {
  for (const c of ['.me-chip {', '.help-chip {']) { const b = style.slice(style.indexOf(c), style.indexOf('}', style.indexOf(c))); assert.match(b, /position: absolute;\s*top: max\(10px, env\(safe-area-inset-top\)\);/); assert.match(b, /height: 44px;/); }
  assert.match(style, /@media \(max-width: 380px\) \{\s*\.me-chip \{ padding: 0 7px; \}\s*\.me-chip-text \{ display: none; \}/, 'abaixo de 380 px o perfil é só o avatar');
});

test('onde o perfil é largo (≥ 380 px) ou a letra é grande, o conteúdo começa abaixo dele: 44 px + 4 de sombra + folga', () => {
  const base = telas.match(new RegExp('@media \\(min-width: 380px\\) \\{ #screen-home \\.home-inner \\{ padding-top: ' + RESERVA.source)); assert.ok(base); assert.ok(Number(base[1]) >= 54);
  const grande = telas.match(new RegExp('html:is\\(\\[data-text="large"\\], \\[data-text="xlarge"\\]\\) #screen-home \\.home-inner \\{ padding-top: ' + RESERVA.source)); assert.ok(grande); assert.ok(Number(grande[1]) >= 54);
  assert.ok(telas.indexOf('#screen-home .home-inner { padding-top: calc(') > telas.indexOf('#screen-home { padding-bottom:'), 'telas.css vem depois do style.css (vence o padding-top: 12px)');
  assert.match(telas, /@media \(min-width: 380px\) and \(max-height: 760px\) \{ #screen-home \.logo \{ --u: \.74;/, 'em tela baixa o logotipo diminui para os botões não irem para trás da barra');
});

test('com o Natal, o gorro (que sobe acima do logotipo) também não encosta no perfil', () => {
  const n = natal.match(new RegExp('@media \\(min-width: 380px\\) \\{ html\\[data-natal\\] #screen-home \\.home-inner \\{ padding-top: ' + RESERVA.source)); assert.ok(n);
  assert.ok(Number(n[1]) >= 54 + 24, 'reserva do Natal = perfil + gorro');
  assert.match(natal, /html\[data-natal\]:is\(\[data-text="large"\], \[data-text="xlarge"\]\) #screen-home \.home-inner \{ padding-top: /);
});
