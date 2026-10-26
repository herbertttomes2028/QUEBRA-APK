'use strict';
/*
 * FRASES PRONTAS (no lugar da conversa livre, para proteger crianças).
 * - Ninguém digita texto para o outro jogador: só se escolhem frases desta lista (o servidor confere pelo código da frase).
 * - 10 frases básicas ficam sempre liberadas; as demais são liberadas conforme a pessoa joga (contas).
 * - As reações com emoji também são prontas e sempre liberadas.
 */
const BASE = [
  { id: 'oi', text: 'Oi! 👋' },
  { id: 'jogar', text: 'Vamos jogar? 🧩' },
  { id: 'boa', text: 'Boa! 👏' },
  { id: 'muitobem', text: 'Muito bem! ⭐' },
  { id: 'quase', text: 'Quase lá! 💪' },
  { id: 'calma', text: 'Calma, vai dar certo! 😊' },
  { id: 'ajuda', text: 'Preciso de ajuda 🙋' },
  { id: 'pensando', text: 'Estou pensando... 🤔' },
  { id: 'obrigado', text: 'Obrigado(a)! 🙏' },
  { id: 'tchau', text: 'Até logo! 👋' }
];
const REACTIONS = [
  { id: 'r_like', text: '👍' }, { id: 'r_ri', text: '😂' }, { id: 'r_palmas', text: '👏' }, { id: 'r_uau', text: '😮' },
  { id: 'r_pensa', text: '🤔' }, { id: 'r_amor', text: '❤️' }, { id: 'r_festa', text: '🎉' }
];
// liberadas jogando: "stat" é uma estatística da conta, "n" a quantidade necessária, "need" o texto mostrado para a criança
const UNLOCK = [
  { id: 'divertido', text: 'Foi divertido! 🎉', stat: 'games', n: 1, need: 'Jogue 1 partida' },
  { id: 'denovo', text: 'Vamos de novo? 🔁', stat: 'games', n: 1, need: 'Jogue 1 partida' },
  { id: 'dificil', text: 'Que peça difícil! 😅', stat: 'games', n: 3, need: 'Jogue 3 partidas' },
  { id: 'achei', text: 'Achei uma! 🔍', stat: 'games', n: 3, need: 'Jogue 3 partidas' },
  { id: 'rapido', text: 'Você é rápido(a)! ⚡', stat: 'games', n: 5, need: 'Jogue 5 partidas' },
  { id: 'parabens', text: 'Parabéns! 🏆', stat: 'wins', n: 1, need: 'Vença 1 desafio' },
  { id: 'boapartida', text: 'Boa partida! 🤝', stat: 'wins', n: 1, need: 'Vença 1 desafio' },
  { id: 'fera', text: 'Sou fera nisso! 😎', stat: 'completed', n: 3, need: 'Conclua 3 quebra-cabeças' },
  { id: 'amigo', text: 'Que bom ter você como amigo(a)! 💛', stat: 'friends', n: 1, need: 'Adicione 1 amigo' },
  { id: 'demais', text: 'Você é demais! 🌟', stat: 'games', n: 10, need: 'Jogue 10 partidas' },
  { id: 'equipe', text: 'Que equipe boa! 🤗', stat: 'games', n: 10, need: 'Jogue 10 partidas' },
  { id: 'revanche', text: 'Vamos para a revanche? 🔥', stat: 'wins', n: 5, need: 'Vença 5 desafios' },
  { id: 'imagem', text: 'Gostei da imagem! 🖼️', stat: 'customGames', n: 1, need: 'Jogue com uma imagem sua' },
  { id: 'mestre', text: 'Mestre dos quebra-cabeças! 👑', stat: 'games', n: 25, need: 'Jogue 25 partidas' }
];
const ALL = [].concat(BASE.map((p) => Object.assign({ group: 'base' }, p)), REACTIONS.map((p) => Object.assign({ group: 'reacao' }, p)), UNLOCK.map((p) => Object.assign({ group: 'liberar' }, p)));
const MAP = new Map(ALL.map((p) => [p.id, p]));
const ALWAYS = new Set(BASE.concat(REACTIONS).map((p) => p.id));

const byId = (id) => MAP.get(String(id)) || null;
// conjunto de frases liberadas para quem tem estas estatísticas (sem estatísticas = só as básicas e as reações)
function unlockedFor(stats) {
  const s = new Set(ALWAYS);
  if (stats) for (const p of UNLOCK) if ((stats[p.stat] || 0) >= p.n) s.add(p.id);
  return s;
}
// catálogo enviado ao celular (texto e o que falta para liberar; nunca o código de nada sensível)
const catalog = () => ALL.map((p) => ({ id: p.id, text: p.text, group: p.group, need: p.need || '' }));

module.exports = { byId, unlockedFor, catalog, ALWAYS, BASE, REACTIONS, UNLOCK };
