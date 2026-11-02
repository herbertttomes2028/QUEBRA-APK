'use strict';
// Sons escolhidos (encaixe = "Plástico", botões = "dois tons"), peças SEM sombra e seta centralizada fora da região do encaixe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers');
const game = fs.readFileSync(path.join(ROOT, 'public/game.js'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'public/style.css'), 'utf8');

test('sons: o encaixe toca o "Plástico" (clack) e todo botão toca o "dois tons" (snap)', () => {
  assert.match(game, /function soundClack\(c\) \{ noiseBurst\(c, 'bandpass', 3200, 2\.5, 0\.016, 0\.6\); tone\(c, 1500, 0, \.04, 'triangle', \.22\); tone\(c, 620, 0, \.06, 'sine', \.22\); \}/, 'o Plástico mudou');
  assert.match(game, /snap: function \(c\) \{ tone\(c, 523, 0, \.09, 'triangle', \.13\); tone\(c, 784, \.07, \.15, 'triangle', \.13\); \}/, 'o dois tons mudou');
  assert.match(game, /clack: soundClack,/);
  assert.match(game, /playSound\('clack'\); announce\('Peça encaixada\./, 'a peça que encaixa toca clack (a última segue com o som de vitória)');
  assert.match(game, /aria-disabled'\) !== 'true'\) playSound\('snap'\)/, 'o ouvinte global de clique toca o dois tons');
  assert.ok(!/playSound\('blip'\)/.test(game), 'nenhum blip de botão sobrou');
});

test('peças sem sombra: nenhum drop-shadow no desenho das peças', () => {
  assert.doesNotMatch(css, /\.puzzle-piece-shadow \{[^}]*filter:/);
  assert.doesNotMatch(css, /\.puzzle-piece-svg \{[^}]*filter:/);
  assert.doesNotMatch(css, /\.piece[^{]*\{[^}]*drop-shadow\(0 calc\(var\(--tile\)/);
});

// ---- geometria: a seta cabe, com folga, dentro do desenho de TODAS as peças de todos os tamanhos
function trecho(nome) { const a = game.indexOf('  function ' + nome + '('); const b = game.indexOf('\n  function ', a + 5); return game.slice(a, b); }
const G = new Function(trecho('edgeDir') + '\n' + trecho('pieceEdges') + '\n' + trecho('puzzlePath') + '\nreturn { pieceEdges, puzzlePath };')();
const tri = /d: 'M (\d+) (\d+) l -([\d.]+) ([\d.]+) h ([\d.]+) Z'/.exec(trecho('pieceArt'));

function poligono(d) {                                   // caminho M/L/C -> polígono (curvas amostradas)
  const t = d.replace(/[MLCZ]/g, (c) => ' ' + c + ' ').trim().split(/\s+/); const pts = []; let i = 0, cmd = '', cur = null;
  while (i < t.length) {
    if (/[MLCZ]/.test(t[i])) { cmd = t[i++]; continue; }
    if (cmd === 'M' || cmd === 'L') { cur = [Number(t[i]), Number(t[i + 1])]; pts.push(cur); i += 2; }
    else if (cmd === 'C') {
      const [p1, p2, p3] = [[+t[i], +t[i + 1]], [+t[i + 2], +t[i + 3]], [+t[i + 4], +t[i + 5]]]; i += 6;
      for (let k = 1; k <= 24; k++) { const u = k / 24, v = 1 - u; pts.push([v * v * v * cur[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * cur[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]); }
      cur = p3;
    }
  }
  return pts;
}
const dentro = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c; };
const distSeg = (P, x, y) => { let m = Infinity; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let u = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; u = Math.max(0, Math.min(1, u)); m = Math.min(m, Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy)); } return m; };

test('seta: sempre centralizada (x = 62, meio do quadrado 12 a 112) e dentro do desenho, com folga, em TODAS as peças', () => {
  assert.ok(tri, 'triângulo da seta não encontrado em pieceArt');
  const [x0, y0, w2, h, w] = tri.slice(1).map(Number);
  assert.equal(x0, 62, 'centralizada');
  const V = [[x0, y0], [x0 - w2, y0 + h], [x0 - w2 + w, y0 + h]];
  const ctr = [(V[0][0] + V[1][0] + V[2][0]) / 3, (V[0][1] + V[1][1] + V[2][1]) / 3];
  let menor = Infinity; const combos = new Set(), topos = new Set();
  for (const [cols, rows] of [[2, 3], [3, 4], [4, 5], [5, 6], [6, 8], [12, 12]]) for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    combos.add(G.pieceEdges(c, r, cols, rows).join(',')); topos.add(G.pieceEdges(c, r, cols, rows)[0]);
    const P = poligono(G.puzzlePath(c, r, cols, rows));
    for (const [x, y] of V.concat([ctr])) { assert.ok(dentro(P, x, y), `seta fora do desenho na peça (${c},${r}) de ${cols}x${rows}`); menor = Math.min(menor, distSeg(P, x, y)); }
  }
  assert.deepEqual([...topos].sort(), [-1, 0, 1], 'o topo foi testado com saliência, cavidade e reto (' + combos.size + ' combinações de lados)');
  assert.ok(menor >= 4, 'folga mínima entre a seta e o contorno da peça (unidades de 100): ' + menor.toFixed(2));
});
