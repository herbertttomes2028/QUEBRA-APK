'use strict';
/*
 * SISTEMA DE XP E NÍVEIS. Todas as fórmulas e tabelas ficam AQUI, para ajustar depois sem mexer no resto do jogo.
 * São funções puras (sem banco): o servidor as usa para calcular e o teste automático as confere.
 */

/* ---------- curva de níveis ---------- */
const MAX_LEVEL = 100;
// XP necessário para ir do nível L ao nível L+1:  5 × arredondar(10 × L^1,3)  (≈ 50 × L^1,3, em múltiplos de 5)
const needFor = (L) => 5 * Math.round(10 * Math.pow(L, 1.3));
const CUM = [0, 0];                                            // CUM[L] = XP total para estar no nível L
for (let L = 1; L < MAX_LEVEL; L++) CUM[L + 1] = CUM[L] + needFor(L);
function levelFromXp(xp) { xp = Math.max(0, Math.floor(Number(xp) || 0)); let L = 1; while (L < MAX_LEVEL && xp >= CUM[L + 1]) L++; return L; }
function progress(xp) {
  xp = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelFromXp(xp);
  if (level >= MAX_LEVEL) return { total: xp, level, into: 0, need: 0, pct: 100, max: true };
  const into = xp - CUM[level], need = needFor(level);
  return { total: xp, level, into, need, pct: Math.min(99, Math.floor((into * 100) / need)), max: false };
}

/* ---------- XP por conclusão, por faixa de quantidade de peças ---------- */
const BANDS = [            // [até X peças, XP base]
  [8, 20],                 //  1–8   (6 peças)
  [15, 45],                //  9–15  (12 peças)
  [24, 80],                // 16–24  (20 peças)
  [36, 130],               // 25–36  (30 peças)
  [54, 220],               // 37–54  (48 peças)
  [Infinity, 300]          // 55 ou mais
];
const baseXp = (pieces) => { for (const [max, xp] of BANDS) if (pieces <= max) return xp; return BANDS[BANDS.length - 1][1]; };
// tempo mínimo plausível para montar (abaixo disso o jogo NÃO paga a conclusão: evita partida "fantasma")
const MIN_MS = [[8, 8000], [15, 15000], [24, 25000], [36, 40000], [54, 60000], [Infinity, 90000]];
const minMs = (pieces) => { for (const [max, ms] of MIN_MS) if (pieces <= max) return ms; return 90000; };

/* ---------- redução por repetição (individual: cada jogador × cada quebra-cabeça) ---------- */
const REP = [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.25];              // 1ª vez 100%, 2ª 80%, 3ª 65%, 4ª 50%, 5ª 40%, 6ª 30%, 7ª em diante 25% (nunca zera)
const repFactor = (clears) => REP[Math.min(Math.max(0, clears | 0), REP.length - 1)];
const CUSTOM_MULT = 0.6;                                       // imagem própria paga 60% (todas as imagens próprias de um tamanho contam como UM quebra-cabeça)
const puzzleKey = (label, pieces, custom) => (custom ? 'custom' : String(label || '').toLowerCase().replace(/\s+/g, ' ').trim()) + ':' + pieces;

/* ---------- partidas com outras pessoas ---------- */
const PARTICIPATION = 10, PARTICIPATION_PER_DAY = 10;          // +10 por partida jogada (até 10 por dia)
const FRIEND_MULT = 1.25, FRIEND_PAIR_PER_DAY = 4;             // +25% jogando com amigo da lista (as 4 primeiras do dia com a mesma pessoa)
const WIN_RATE = 0.3, WIN_PAIR_PER_DAY = 3;                    // vitória no Desafio: +30% do XP base (as 3 primeiras do dia contra a mesma pessoa)

/* ---------- conquistas que já existem (XP de única vez) ---------- */
const ACH_XP = { primeira: 25, dez: 40, vitoria: 40, campeao: 100, montador: 50, mestre: 100, veloz: 80, imagem: 25, amigo: 25, turma: 60 };

/*
 * Calcula o XP de UMA partida para UM jogador.
 *  in:  pieces, completed, won, custom, elapsedMs (tempo da montagem), gameMs (duração da partida),
 *       clears (vezes que ele já ganhou XP deste quebra-cabeça), humans (jogou com outra pessoa),
 *       friend (a outra pessoa é amiga na lista), partCount / pairFriend / pairWin (contagens de HOJE)
 *  out: { total, parts: { completion, friend, win, participation }, earnedCompletion }
 */
function matchReward(o) {
  const pieces = o.pieces | 0, base = baseXp(pieces), rep = repFactor(o.clears), cm = o.custom ? CUSTOM_MULT : 1;
  const longEnough = o.elapsedMs == null || o.elapsedMs >= minMs(pieces);
  const parts = { completion: 0, friend: 0, win: 0, participation: 0 };
  const earnedCompletion = !!(o.completed && longEnough);
  if (earnedCompletion) parts.completion = Math.max(1, Math.round(base * rep * cm));
  if (earnedCompletion && o.friend && (o.pairFriend | 0) < FRIEND_PAIR_PER_DAY) parts.friend = Math.round(parts.completion * (FRIEND_MULT - 1));
  if (earnedCompletion && o.won && o.humans && (o.pairWin | 0) < WIN_PAIR_PER_DAY) parts.win = Math.max(1, Math.round(base * WIN_RATE * rep * cm));
  if (o.humans && o.gameMs != null && o.gameMs >= minMs(pieces) && (o.partCount | 0) < PARTICIPATION_PER_DAY) parts.participation = PARTICIPATION;
  const total = parts.completion + parts.friend + parts.win + parts.participation;
  return { total, parts, earnedCompletion };
}

module.exports = { MAX_LEVEL, needFor, CUM, levelFromXp, progress, BANDS, baseXp, MIN_MS, minMs, REP, repFactor, CUSTOM_MULT, puzzleKey, PARTICIPATION, PARTICIPATION_PER_DAY, FRIEND_MULT, FRIEND_PAIR_PER_DAY, WIN_RATE, WIN_PAIR_PER_DAY, ACH_XP, matchReward };
