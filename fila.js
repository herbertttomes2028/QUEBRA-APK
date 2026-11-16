'use strict';
/* FILEIRA DE 5 PEÇAS (decisão do proprietário em 15/11/2026): nas partidas de 20, 30 e 48 peças a bandeja grande (até 6 fileiras) deixava a
 * imagem pequena. Agora fica UMA fileira com 5 vagas abaixo da grade; as outras peças ficam guardadas (escondidas) e vão aparecendo:
 *  - na largada: 5 peças na fileira;
 *  - a peça nova aparece na vaga que ficou LIVRE na fileira (a da peça encaixada, ou a da peça puxada para a grade);
 *  - peças puxadas para a grade sem encaixar ("soltas"): até 3 soltas a fileira continua sendo completada até 5;
 *  - teto: no máximo FILA_SLOTS + FILA_SOLTAS (5 + 3 = 8) peças à vista sem encaixar. Chegando no teto, só um ENCAIXE certo libera
 *    a próxima (puxar uma 4ª peça para a grade deixa a vaga dela vazia até alguém encaixar).
 * Vale no Sozinho, no Cooperativo (uma fileira para os dois) e no Desafio Comum (uma por jogador). O Quebrando Cabeças continua com a caixa.
 * Módulo puro: não fala com a rede. Quem chama envia as peças reveladas (evento 'fila' no cooperativo e 'ch:fila' na Sala Desafio). */
const FILA_SLOTS = 5;
const FILA_SOLTAS = 3;
const FILA_MIN_PIECES = 20;           // 6 e 12 peças continuam com a bandeja de sempre

function usesFila(cfg) { return !!(cfg && cfg.FILA && Array.isArray(cfg.FILA.slots) && cfg.FILA.slots.length); }
// a peça está na faixa da fileira (abaixo da grade)?
function inStrip(cfg, p) { return p.y >= cfg.TRAY_LINE; }

function count(cfg, pieces) {
  let fila = 0, soltas = 0, guardadas = 0;
  for (const p of pieces) {
    if (p.locked) continue;
    if (p.out === false) guardadas++;
    else if (inStrip(cfg, p)) fila++;
    else soltas++;
  }
  return { fila, soltas, guardadas };
}

// vagas livres: cada peça da faixa ocupa a vaga mais próxima (ainda não ocupada); sobram as livres, da esquerda para a direita
function freeSlots(cfg, pieces) {
  const slots = cfg.FILA.slots, taken = new Set();
  const naFaixa = pieces.filter((p) => !p.locked && p.out !== false && inStrip(cfg, p))
    .map((p) => slots.map((s, i) => ({ i, d: Math.hypot(s.x - p.x, s.y - p.y) })).sort((a, b) => a.d - b.d))
    .sort((a, b) => a[0].d - b[0].d);
  for (const prefs of naFaixa) { const f = prefs.find((q) => !taken.has(q.i)); if (f) taken.add(f.i); }
  return slots.map((s, i) => i).filter((i) => !taken.has(i));
}

// próxima peça guardada, pela ordem sorteada (p.ord); sem ord, pela id
function nextHidden(pieces) {
  let best = null;
  for (const p of pieces) {
    if (p.locked || p.out !== false) continue;
    const k = Number.isFinite(p.ord) ? p.ord : p.id;
    if (!best || k < (Number.isFinite(best.ord) ? best.ord : best.id)) best = p;
  }
  return best;
}

function place(cfg, p, slot, nextZ) {
  const s = cfg.FILA.slots[slot];
  p.out = true; p.x = s.x; p.y = s.y; p.heldBy = null;
  if (nextZ) p.z = nextZ();
  return { id: p.id, x: p.x, y: p.y, z: p.z, slot };
}

// quantas peças podem aparecer agora: completa a fileira, sem passar do teto de peças à vista
function howMany(cfg, pieces) {
  const c = count(cfg, pieces);
  return Math.max(0, Math.min(FILA_SLOTS - c.fila, FILA_SLOTS + FILA_SOLTAS - (c.fila + c.soltas), c.guardadas));
}

/* revela as peças que cabem agora; devolve [{ id, x, y, z, slot }] (vazio se nada mudou) */
function refill(cfg, pieces, nextZ) {
  if (!usesFila(cfg)) return [];
  let n = howMany(cfg, pieces);
  if (!n) return [];
  const livres = freeSlots(cfg, pieces), out = [];
  for (const slot of livres) {
    if (!n) break;
    const p = nextHidden(pieces);
    if (!p) break;
    out.push(place(cfg, p, slot, nextZ)); n--;
  }
  return out;
}

/* começo (ou recomeço / "Continuar jogando"): guarda todas as peças não encaixadas e mostra as 5 primeiras da ordem.
 * order (opcional): ids na ordem em que devem aparecer (a Sala Desafio usa a mesma ordem para os dois jogadores); sem ela, sorteia. */
function init(cfg, pieces, order, nextZ) {
  if (!usesFila(cfg)) return;
  const ids = Array.isArray(order) && order.length === pieces.length ? order : shuffle(pieces.map((p) => p.id));
  const pos = new Map(ids.map((id, k) => [id, k]));
  for (const p of pieces) {
    p.ord = pos.has(p.id) ? pos.get(p.id) : p.id;
    if (p.locked) { p.out = true; continue; }
    p.out = false; p.heldBy = null;
    const s = cfg.FILA.slots[0]; p.x = s.x; p.y = s.y;                 // guardada: posição qualquer da faixa (não aparece nem pode ser pega)
  }
  for (let slot = 0; slot < FILA_SLOTS; slot++) {
    const p = nextHidden(pieces);
    if (!p) break;
    place(cfg, p, slot, nextZ);
  }
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

module.exports = { FILA_SLOTS, FILA_SOLTAS, FILA_MIN_PIECES, usesFila, inStrip, count, freeSlots, howMany, refill, init };
