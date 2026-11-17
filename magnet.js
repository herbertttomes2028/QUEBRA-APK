'use strict';
/* Ímã ao ARRASTAR (segurando a peça). A regra de encaixe continua só no servidor (tryLock, igual no Cooperativo, no Solo e na Sala Desafio):
 * a peça trava quando o centro dela fica a até SNAP do centro da casa certa.
 *
 * Versão MAIS FRACA (pedido do proprietário em 15/11/2026): antes, bastava o dedo PASSAR pela zona do ímã (o servidor olhava o trecho
 * inteiro entre duas amostras), e quem passeava com a peça pela grade encaixava sem querer, sem entender onde ela ia. Agora:
 *  - segurando, a peça só é puxada se o dedo FICAR perto da casa certa: a até DRAG_FACTOR × casa (padrão 0,25) por DWELL_MS (padrão 180 ms);
 *    passar rápido por cima não encaixa;
 *  - o dedo parado também conta: o servidor confere de novo sozinho quando o tempo vence (o celular não manda posições com o dedo parado);
 *  - ao SOLTAR vale o raio de sempre do tryLock (SNAP = SNAP_FACTOR × casa, padrão 0,35 desde esta rodada; ver server.js).
 * Ajustes no Render (opcionais): DRAG_MAGNET_FACTOR (0,15 a 0,5) e DRAG_MAGNET_MS (0 a 1000). DRAG_MAGNET=0 desliga o ímã ao arrastar
 * (só encaixa ao soltar). Valores fora da faixa são ignorados e vale o padrão. */
function target(cfg, p) {
  return { x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 };
}
function num(v, min, max, def) {
  const n = Number(v);
  return v !== undefined && v !== '' && Number.isFinite(n) && n >= min && n <= max ? n : def;
}
const ENABLED = process.env.DRAG_MAGNET !== '0';
const DRAG_FACTOR_DEFAULT = 0.25, DWELL_MS_DEFAULT = 180;
const DRAG_FACTOR = num(process.env.DRAG_MAGNET_FACTOR, 0.15, 0.5, DRAG_FACTOR_DEFAULT);
const DWELL_MS = Math.round(num(process.env.DRAG_MAGNET_MS, 0, 1000, DWELL_MS_DEFAULT));

// raio do ímã ao ARRASTAR (nunca maior que o raio ao soltar)
// nas quantidades grandes (64, 88, 96) o ímã ao arrastar também é mais forte: DRAG_FACTOR × cfg.IMA (no máximo meia casa)
function dragRadius(cfg) { return Math.min(cfg.SNAP, Math.max(2, Math.round(cfg.TILE * Math.min(0.5, DRAG_FACTOR * (cfg.IMA > 1 ? cfg.IMA : 1))))); }
function near(cfg, p, x, y) { const t = target(cfg, p); return Math.hypot(x - t.x, y - t.y) <= dragRadius(cfg); }

/* "Ficou perto por um instante". Um por servidor/sala de jogo; o estado fica FORA da peça (a peça vai inteira nas fotos da sala).
 * onMove(cfg, p, now, attempt): chamado a cada posição nova já aplicada em p.x/p.y. attempt() confere tudo de novo (quem segura, se a sala
 * ainda está em jogo) e chama o tryLock; devolve true se encaixou. cancel(p): ao soltar ou perder a peça. */
function createDwell(opts) {
  const o = opts || {}, dwell = o.dwellMs !== undefined ? o.dwellMs : DWELL_MS;
  const setT = o.setTimeout || setTimeout, clearT = o.clearTimeout || clearTimeout;
  const st = new WeakMap();
  function cancel(p) { const s = st.get(p); if (s) { if (s.timer) clearT(s.timer); st.delete(p); } }
  function onMove(cfg, p, now, attempt) {
    if (!near(cfg, p, p.x, p.y)) { cancel(p); return false; }            // saiu da zona: o tempo recomeça na próxima entrada
    let s = st.get(p);
    if (!s) { s = { since: now, timer: null }; st.set(p, s); }
    if (now - s.since >= dwell) { cancel(p); return attempt() === true; }  // já estava perto há tempo suficiente
    if (!s.timer) {
      s.timer = setT(() => {
        s.timer = null;
        if (st.get(p) !== s) return;                                         // saiu e voltou (ou soltou) nesse meio-tempo
        cancel(p);
        if (near(cfg, p, p.x, p.y)) attempt();
      }, dwell - (now - s.since));
      if (s.timer && s.timer.unref) s.timer.unref();
    }
    return false;
  }
  return { onMove, cancel, dwellMs: dwell };
}

module.exports = { ENABLED, DRAG_FACTOR, DRAG_FACTOR_DEFAULT, DWELL_MS, DWELL_MS_DEFAULT, target, dragRadius, near, createDwell };
