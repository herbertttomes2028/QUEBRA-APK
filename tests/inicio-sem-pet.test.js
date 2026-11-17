'use strict';
// Tela inicial com o pet escondido: o espaço dele vira respiro entre os blocos; com o pet visível, nada muda.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'public/telas.css'), 'utf8');
const bloco = css.slice(css.indexOf('/* Tela inicial SEM o pet'));

test('só vale com o pet desligado (ou movimento reduzido) e só em telas com altura sobrando', () => {
  assert.ok(bloco.length > 200);
  const regras = bloco.replace(/\/\*[\s\S]*?\*\//g, '').split('}').map((x) => x.trim()).filter((x) => x && !/^@media/.test(x) && x.includes('{'));
  for (const r of regras) {
    const sel = r.slice(r.lastIndexOf('\n') + 1 > 0 ? 0 : 0, r.indexOf('{')).replace(/@media[^{]*\{/g, '').trim();
    if (!sel) continue;
    assert.ok(/html:is\(\[data-mascot="off"\], \[data-motion="reduce"\]\)/.test(sel) || /prefers-reduced-motion/.test(bloco), 'regra fora do escopo: ' + sel);
  }
  assert.match(bloco, /@media \(min-height: 600px\) \{\s+html:is\(\[data-mascot="off"\], \[data-motion="reduce"\]\)/);
  assert.match(bloco, /@media \(min-height: 700px\) \{/);
  assert.match(bloco, /@media \(prefers-reduced-motion: reduce\) and \(min-height: 600px\)/);
  assert.doesNotMatch(bloco, /\.mascot\b|animation|transition|transform/, 'não mexe no pet nem anima nada');
  // nenhuma regra solta (sem escopo do pet) fora das @media de movimento reduzido
  const fora = bloco.replace(/@media \(prefers-reduced-motion[\s\S]*$/, '');
  for (const linha of fora.split('\n')) if (/#screen-home/.test(linha)) assert.match(linha, /html:is\(\[data-mascot="off"\], \[data-motion="reduce"\]\)/, linha);
});
