'use strict';
// Trava contra XSS por descuido: o cliente NÃO pode montar HTML a partir de dados.
// Só são aceitos os 3 usos de innerHTML com texto FIXO abaixo (nenhum recebe dado de jogador, da URL ou do servidor).
// Qualquer outro innerHTML com conteúdo, insertAdjacentHTML, outerHTML, document.write, eval ou new Function faz este teste falhar:
// use textContent / createElement, ou, se for mesmo preciso, acrescente o caso aqui com uma justificativa revisada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'sw.js');
const PERMITIDOS = new Map([
  ['game.js', [
    "tx.innerHTML = 'Sem conexão com o servidor.<br>Verifique a internet e abra o jogo de novo.';",
    'gift.innerHTML = GIFT_SVG;',
    "inv.innerHTML = 'Você foi convidado para a sala <strong></strong>.<br>Toque em <b>Entrar</b>.';",
  ]],
]);

test('cliente: nenhum innerHTML com dados, nem insertAdjacentHTML/outerHTML/document.write/eval/new Function', () => {
  const achados = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const ok = PERMITIDOS.get(f) || [];
    src.split('\n').forEach((linha, i) => {
      const t = linha.trim();
      if (/\binsertAdjacentHTML\b|\.outerHTML\s*=|document\.write\s*\(|\beval\s*\(|new Function\s*\(|\.srcdoc\s*=/.test(t) && !t.startsWith('//') && !t.startsWith('*')) achados.push(f + ':' + (i + 1) + ' ' + t.slice(0, 90));
      for (const m of t.matchAll(/\.innerHTML\s*=\s*([^;]*);?/g)) {            // cada atribuição da linha (limpar com '' é sempre permitido)
        if (/^(''|"")$/.test(m[1].trim())) continue;
        if (!ok.some((p) => p.includes(m[0].trim()) || m[0].trim().includes(p.replace(/;$/, '')))) achados.push(f + ':' + (i + 1) + ' ' + m[0].slice(0, 90));
      }
    });
  }
  assert.deepEqual(achados, [], 'HTML montado a partir de dados (use textContent): ' + achados.join(' | '));
});

test('cliente: os usos permitidos continuam existindo (a lista não pode ficar velha)', () => {
  const src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  for (const p of PERMITIDOS.get('game.js')) assert.ok(src.includes(p), 'não existe mais: ' + p);
});

test('botões de tamanho: o rótulo entra por textContent', () => {
  const src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  assert.ok(!src.includes("'<b>' + p.pieces"), 'voltou a montar HTML com p.pieces/p.label');
  assert.match(src, /nl\.textContent = String\(p\.label\)/);
});
