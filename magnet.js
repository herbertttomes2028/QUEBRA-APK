'use strict';
/* Ímã ao ARRASTAR. A regra de encaixe continua só no servidor (tryLock, igual no Cooperativo e na Sala Desafio): a peça trava quando o centro dela fica a até
 * SNAP do centro da casa certa. Antes isso só era conferido ao SOLTAR. Agora o servidor também confere enquanto a peça é arrastada ('move'): se ela passou
 * pela zona do ímã da própria casa, é puxada na hora, mesmo com o dedo ainda segurando.
 * As posições chegam em amostras (a cada ~50 ms); num arrasto rápido o dedo pode atravessar a zona ENTRE duas amostras. Por isso olhamos o TRECHO entre a
 * posição anterior e a nova: se ele passou pela zona, usamos o ponto do trecho mais próximo do centro da casa (que o tryLock então confere como sempre). */
function target(cfg, p) {
  return { x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 };
}
// ponto do segmento (ax,ay)→(bx,by) mais próximo de (tx,ty)
function closestOnSegment(ax, ay, bx, by, tx, ty) {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((tx - ax) * dx + (ty - ay) * dy) / len2));
  return { x: ax + t * dx, y: ay + t * dy };
}
/* Posição a considerar para o ímã. Devolve o ponto mais próximo da casa certa ao longo do trecho anterior→novo se esse trecho passou pela zona do ímã
 * (e é um deslocamento "de verdade": no máximo 2,5 casas, para um salto de rede ou uma peça saindo da bandeja nunca valer como "passou por cima");
 * caso contrário, a própria posição nova. */
function pullPoint(cfg, p, prevX, prevY, nx, ny) {
  const t = target(cfg, p);
  if (Math.hypot(nx - prevX, ny - prevY) <= cfg.TILE * 2.5) {
    const c = closestOnSegment(prevX, prevY, nx, ny, t.x, t.y);
    if (Math.hypot(c.x - t.x, c.y - t.y) <= cfg.SNAP) return c;
  }
  return { x: nx, y: ny };
}
// Chave de segurança: DRAG_MAGNET=0 (no Render) desliga só o puxão AO ARRASTAR e volta ao comportamento antigo (encaixe só ao soltar).
const ENABLED = process.env.DRAG_MAGNET !== '0';
module.exports = { ENABLED, target, closestOnSegment, pullPoint };
