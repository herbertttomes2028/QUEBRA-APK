'use strict';
// Ajustes organizados em grupos (VISUAL, ANIMAÇÕES, EFEITOS), cada um com título e uma caixa sombreada; privacidade e segurança centralizadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('public/index.html'), css = read('public/style.css');
const sec = html.slice(html.indexOf('id="modal-settings"'), html.indexOf('id="set-close"'));
const grupo = (id) => { const i = sec.indexOf('<section class="set-group" aria-labelledby="' + id + '">'); assert.ok(i > 0, id); return sec.slice(i, sec.indexOf('</section>', i)); };

test('três grupos, na ordem pedida, cada um com título e caixa', () => {
  const v = grupo('sg-visual'), a = grupo('sg-anim'), e = grupo('sg-efeitos');
  assert.match(v, /<h4 id="sg-visual" class="set-group-title">Visual<\/h4>\s*<div class="set-box">/);
  assert.match(a, /<h4 id="sg-anim" class="set-group-title">Animações<\/h4>\s*<div class="set-box">/);
  assert.match(e, /<h4 id="sg-efeitos" class="set-group-title">Efeitos<\/h4>\s*<div class="set-box">/);
  const ordem = (txt, ids) => { const p = ids.map((x) => txt.indexOf(x)); assert.ok(p.every((n) => n > 0) && p.every((n, i) => !i || n > p[i - 1]), ids.join(' < ')); };
  ordem(v, ['data-setting="text"', 'data-setting="theme"']);
  ordem(a, ['data-setting="motion"', 'id="motion-note"', 'id="btn-pet"', 'id="pet-set-note"', 'data-setting="mascot"', 'id="mascot-note"', 'data-setting="trayAnim"']);
  ordem(e, ['data-setting="sound"', 'data-setting="vibrate"', 'data-setting="push"', 'id="push-note"']);
  ordem(sec, ['sg-visual', 'sg-anim', 'sg-efeitos', 'set-about', 'id="btn-safe"']);
  // nada sumiu nem ficou duplicado
  for (const id of ['lbl-text', 'lbl-theme', 'lbl-motion', 'motion-note', 'lbl-pet', 'btn-pet', 'pet-set-note', 'lbl-mascot', 'mascot-note', 'lbl-trayanim', 'trayanim-note', 'lbl-sound', 'lbl-vib', 'lbl-push', 'push-note', 'lbl-safe', 'btn-safe']) assert.equal(sec.split('id="' + id + '"').length, 2, id);
  assert.equal((sec.match(/<div\b/g) || []).length, (sec.match(/<\/div>/g) || []).length + 1, 'caixas bem fechadas (só a janela segue aberta até o Pronto)');
});
test('privacidade e "Jogue com segurança" centralizados; caixa leve (sem animação nem desfoque)', () => {
  assert.match(sec, /<\/section>\s*<p class="set-note set-about">/); assert.match(sec, /<div class="set-row set-safe">\s*<span id="lbl-safe"/);
  assert.match(css, /\.set-sheet > \.set-about \{ margin-top: 10px; text-align: center; \}/);
  assert.match(css, /\.set-sheet > \.set-safe \{ flex-direction: column; justify-content: center; text-align: center;/);
  const box = css.slice(css.indexOf('.set-box {'), css.indexOf('.set-sheet > .set-safe'));
  assert.match(box, /box-shadow: var\(--sh-caixa\)/);   // padrão visual: a sombra é o nome da régua (0 3px 10px) assert.doesNotMatch(box, /animation|transition|filter|backdrop|will-change/);
  assert.match(css, /\.set-group-title \{[^}]*text-transform: uppercase/);
});
