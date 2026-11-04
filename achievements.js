'use strict';
/* Conquistas: catálogo, avaliação e coleta de estatísticas.
 *
 * - O catálogo é DADO (cada conquista = id, grupo, ícone, título, descrição, nível, estatística e meta). Nada aqui paga XP:
 *   o pagamento (uma única vez por conquista) continua dentro de accounts.js, na mesma transação do XP.
 * - Uma conquista ganha é PERMANENTE: quem decide é o registro do pagamento (earned), não a estatística de hoje.
 *   Assim remover um amigo, ou o catálogo de imagens crescer, nunca "desfaz" uma conquista.
 * - Cada conquista é PÚBLICA ou PRIVADA. O perfil de amigo só recebe as públicas (nunca melhores tempos, número de amigos,
 *   hábitos de dias/horários nem conquistas secretas): ver friendView().
 * - As conquistas por categoria nascem do catálogo da biblioteca: uma categoria nova ganha as dela sozinha.
 * Todos os números de equilíbrio (metas e XP por nível) ficam aqui, em um lugar só. */
const xpm = require('./xp');
const library = require('./library');

const TIERS = Object.freeze({
  bronze: { xp: 5, label: 'Bronze', icon: '🥉', order: 1 },
  prata: { xp: 15, label: 'Prata', icon: '🥈', order: 2 },
  ouro: { xp: 40, label: 'Ouro', icon: '🥇', order: 3 },
  diamante: { xp: 100, label: 'Diamante', icon: '💎', order: 4 }
});
const GROUPS = Object.freeze([
  { id: 'inicio', icon: '🌱', title: 'Primeiros passos', blurb: 'Quanto mais você joga, mais cresce' },
  { id: 'tamanho', icon: '📏', title: 'Mestre dos tamanhos', blurb: 'De 6 a 48 peças' },
  { id: 'velocidade', icon: '⚡', title: 'Velocidade', blurb: 'Só você vê estas' },
  { id: 'desafio', icon: '🏆', title: 'Desafio e equipe', blurb: 'Vitórias, duplas e foco' },
  { id: 'amizade', icon: '🤝', title: 'Amizade', blurb: 'Só você vê estas' },
  { id: 'constancia', icon: '📅', title: 'Constância', blurb: 'Só você vê estas' },
  { id: 'colecao', icon: '🖼️', title: 'Coleção geral', blurb: 'Sua galeria de imagens' },
  { id: 'categorias', icon: '🗂️', title: 'Por categoria', blurb: 'Uma jornada em cada coleção' },
  { id: 'evolucao', icon: '⭐', title: 'Evolução', blurb: 'Níveis e caça às conquistas' },
  { id: 'segredos', icon: '🤫', title: 'Segredos', blurb: 'Descubra jogando' }
]);

const MIN = 60 * 1000, SEC = 1000;
// XP das 10 conquistas que já existiam: mantém exatamente os valores de antes.
const LEGACY_XP = xpm.ACH_XP;

function def(id, g, icon, title, desc, tier, stat, goal, o) { return Object.assign({ id, g, icon, title, desc, tier, stat, goal, pub: true }, o || {}); }
const L = (id, g, icon, title, desc, tier, stat, goal, o) => def(id, g, icon, title, desc, tier, stat, goal, Object.assign({ lower: true }, o || {}));   // "menos é melhor" (tempos)

const STATIC = [
  /* ---------- primeiros passos ---------- */
  def('primeira', 'inicio', '🌟', 'Primeira partida', 'Jogue sua primeira partida', 'bronze', 'games', 1),
  def('concluido_1', 'inicio', '🎯', 'Missão cumprida', 'Conclua seu primeiro quebra-cabeça', 'bronze', 'completed', 1),
  def('dez', 'inicio', '🔟', 'Dez partidas', 'Jogue 10 partidas', 'prata', 'games', 10),
  def('montador', 'inicio', '🧩', 'Montador', 'Conclua 5 quebra-cabeças', 'prata', 'completed', 5),
  def('concluido_15', 'inicio', '🙌', 'Mãos de ouro', 'Conclua 15 quebra-cabeças', 'prata', 'completed', 15),
  def('jogos_30', 'inicio', '🔁', 'Já virou hábito', 'Jogue 30 partidas', 'prata', 'games', 30),
  def('concluido_40', 'inicio', '🏃', 'Maratona de peças', 'Conclua 40 quebra-cabeças', 'ouro', 'completed', 40),
  def('jogos_75', 'inicio', '💙', 'Fã de carteirinha', 'Jogue 75 partidas', 'ouro', 'games', 75),
  def('concluido_100', 'inicio', '🏛️', 'Lenda do quebra-cabeça', 'Conclua 100 quebra-cabeças', 'diamante', 'completed', 100),
  def('jogos_150', 'inicio', '🏡', 'Craque da casa', 'Jogue 150 partidas', 'diamante', 'games', 150),
  // Aposentada: o envio de fotos próprias foi removido. Quem já ganhou continua com ela; para os outros ela nem aparece.
  def('imagem', 'inicio', '📸', 'Minha imagem', 'Jogue com uma imagem sua', 'prata', 'customGames', 1, { retired: true }),

  /* ---------- mestre dos tamanhos ---------- */
  def('t6_5', 'tamanho', '🔥', 'Aquecimento', 'Conclua 5 quebra-cabeças de 6 peças', 'bronze', 'c6', 5),
  def('t6_25', 'tamanho', '🐜', 'Pequeno gigante', 'Conclua 25 quebra-cabeças de 6 peças', 'prata', 'c6', 25),
  def('t12_5', 'tamanho', '🥾', 'Trilha fácil', 'Conclua 5 quebra-cabeças de 12 peças', 'bronze', 'c12', 5),
  def('t12_25', 'tamanho', '👣', 'Passo firme', 'Conclua 25 quebra-cabeças de 12 peças', 'prata', 'c12', 25),
  def('t20_5', 'tamanho', '⛰️', 'Meio da subida', 'Conclua 5 quebra-cabeças de 20 peças', 'bronze', 'c20', 5),
  def('t20_25', 'tamanho', '🧗', 'Escalador', 'Conclua 25 quebra-cabeças de 20 peças', 'prata', 'c20', 25),
  def('t30_5', 'tamanho', '🥊', 'Desafio aceito', 'Conclua 5 quebra-cabeças de 30 peças', 'prata', 'c30', 5),
  def('t30_25', 'tamanho', '🦾', 'Dedos de aço', 'Conclua 25 quebra-cabeças de 30 peças', 'ouro', 'c30', 25),
  def('mestre', 'tamanho', '🧠', 'Mestre dos 48', 'Conclua um quebra-cabeça de 48 peças', 'ouro', 'maxPieces', 48),
  def('t48_5', 'tamanho', '🦣', 'Gigante das 48', 'Conclua 5 quebra-cabeças de 48 peças', 'ouro', 'c48', 5),
  def('t48_15', 'tamanho', '🗿', 'Titã dos 48', 'Conclua 15 quebra-cabeças de 48 peças', 'diamante', 'c48', 15),
  def('todos_tam', 'tamanho', '🌈', 'Todos os tamanhos', 'Conclua pelo menos um de cada tamanho: 6, 12, 20, 30 e 48 peças', 'ouro', 'sizesDone', 5),

  /* ---------- velocidade (privadas, menos é melhor; o "Veloz" original continua público) ---------- */
  L('veloz', 'velocidade', '⚡', 'Veloz', 'Conclua 20+ peças em menos de 5 minutos', 'ouro', 'fastest20', 5 * MIN),
  L('v6_45', 'velocidade', '👁️', 'Piscou, montou', 'Conclua 6 peças em menos de 45 segundos', 'bronze', 'f6', 45 * SEC, { pub: false }),
  L('v6_20', 'velocidade', '🌩️', 'Raio', 'Conclua 6 peças em menos de 20 segundos', 'prata', 'f6', 20 * SEC, { pub: false }),
  L('v12_90', 'velocidade', '🐇', 'Ligeirinho', 'Conclua 12 peças em menos de 1 min 30 s', 'bronze', 'f12', 90 * SEC, { pub: false }),
  L('v12_45', 'velocidade', '🚀', 'Foguete', 'Conclua 12 peças em menos de 45 segundos', 'prata', 'f12', 45 * SEC, { pub: false }),
  L('v20_180', 'velocidade', '🏎️', 'Turbo', 'Conclua 20 peças em menos de 3 minutos', 'prata', 'f20', 3 * MIN, { pub: false }),
  L('v20_90', 'velocidade', '✈️', 'Supersônico', 'Conclua 20 peças em menos de 1 min 30 s', 'ouro', 'f20', 90 * SEC, { pub: false }),
  L('v30_300', 'velocidade', '🌪️', 'Vento forte', 'Conclua 30 peças em menos de 5 minutos', 'prata', 'f30', 5 * MIN, { pub: false }),
  L('v30_180', 'velocidade', '🌀', 'Tufão', 'Conclua 30 peças em menos de 3 minutos', 'ouro', 'f30', 3 * MIN, { pub: false }),
  L('v48_480', 'velocidade', '🥁', 'Ritmo de campeão', 'Conclua 48 peças em menos de 8 minutos', 'prata', 'f48', 8 * MIN, { pub: false }),
  L('v48_300', 'velocidade', '⚔️', 'Relâmpago dos 48', 'Conclua 48 peças em menos de 5 minutos', 'diamante', 'f48', 5 * MIN, { pub: false }),

  /* ---------- desafio e equipe ---------- */
  def('vitoria', 'desafio', '🏆', 'Primeira vitória', 'Vença uma Sala Desafio', 'prata', 'wins', 1),
  def('duelo_5', 'desafio', '🤺', 'Aprendiz de duelista', 'Jogue 5 partidas da Sala Desafio', 'bronze', 'duels', 5),
  def('solo_10', 'desafio', '🎧', 'Foco total', 'Jogue 10 partidas no modo Solo', 'bronze', 'soloGames', 10),
  def('coop_5', 'desafio', '👯', 'Dupla perfeita', 'Conclua 5 quebra-cabeças em dupla', 'bronze', 'coopDone', 5),
  def('seq3', 'desafio', '🔥', 'Em chamas', 'Vença 3 desafios seguidos', 'prata', 'winStreak', 3),
  def('duelo_25', 'desafio', '🏟️', 'Veterano da arena', 'Jogue 25 partidas da Sala Desafio', 'prata', 'duels', 25),
  def('solo_50', 'desafio', '🧘', 'Mente tranquila', 'Jogue 50 partidas no modo Solo', 'prata', 'soloGames', 50),
  def('campeao', 'desafio', '👑', 'Campeão', 'Vença 10 desafios', 'ouro', 'wins', 10),
  def('seq5', 'desafio', '🦁', 'Invencível', 'Vença 5 desafios seguidos', 'ouro', 'winStreak', 5),
  def('coop_20', 'desafio', '🌠', 'Equipe dos sonhos', 'Conclua 20 quebra-cabeças em dupla', 'ouro', 'coopDone', 20),
  def('vit_25', 'desafio', '🛡️', 'Imbatível', 'Vença 25 desafios', 'ouro', 'wins', 25),
  def('vit_50', 'desafio', '🐉', 'Lenda do Desafio', 'Vença 50 desafios', 'diamante', 'wins', 50),

  /* ---------- amizade (privadas: nunca mostram quantos amigos alguém tem) ---------- */
  def('amigo', 'amizade', '🤝', 'Primeiro amigo', 'Adicione um amigo', 'bronze', 'friends', 1, { pub: false }),
  def('convite_1', 'amizade', '💌', 'Convite aceito', 'Convide um amigo e ele aceite jogar', 'bronze', 'invitesOk', 1, { pub: false }),
  def('junto_5', 'amizade', '🫶', 'Parceria', 'Conclua 5 partidas junto com amigos', 'bronze', 'friendMatches', 5, { pub: false }),
  def('turma', 'amizade', '🎉', 'Turma', 'Tenha 5 amigos', 'prata', 'friends', 5, { pub: false }),
  def('convite_5', 'amizade', '🏠', 'Anfitrião', 'Tenha 5 convites aceitos', 'prata', 'invitesOk', 5, { pub: false }),
  def('junto_25', 'amizade', '🎶', 'Dupla afinada', 'Conclua 25 partidas junto com amigos', 'prata', 'friendMatches', 25, { pub: false }),
  def('parceiros_3', 'amizade', '🌍', 'Mundo de amigos', 'Jogue com 3 amigos diferentes', 'prata', 'partners', 3, { pub: false }),
  def('amigos_10', 'amizade', '🎪', 'Turma grande', 'Tenha 10 amigos', 'ouro', 'friends', 10, { pub: false }),
  def('junto_100', 'amizade', '🧵', 'Inseparáveis', 'Conclua 100 partidas junto com amigos', 'ouro', 'friendMatches', 100, { pub: false }),
  def('parceiros_8', 'amizade', '🎖️', 'Embaixador', 'Jogue com 8 amigos diferentes', 'ouro', 'partners', 8, { pub: false }),

  /* ---------- constância (privadas: não mostram dias nem horários de ninguém) ---------- */
  def('dias_3', 'constancia', '👋', 'Voltou!', 'Jogue em 3 dias diferentes', 'bronze', 'days', 3, { pub: false }),
  def('seq_3', 'constancia', '🔗', 'Sequência', 'Jogue 3 dias seguidos', 'bronze', 'streak', 3, { pub: false }),
  def('dia_5', 'constancia', '☀️', 'Dia cheio', 'Jogue 5 partidas no mesmo dia', 'bronze', 'dayMax', 5, { pub: false }),
  def('hora_1', 'constancia', '⏱️', 'Primeira hora', 'Some 1 hora de jogo', 'bronze', 'playMin', 60, { pub: false }),
  def('dias_7', 'constancia', '🗓️', 'Semana de jogo', 'Jogue em 7 dias diferentes', 'prata', 'days', 7, { pub: false }),
  def('seq_7', 'constancia', '🌟', 'Semana perfeita', 'Jogue 7 dias seguidos', 'prata', 'streak', 7, { pub: false }),
  def('dia_10', 'constancia', '🌋', 'Dia de maratona', 'Jogue 10 partidas no mesmo dia', 'prata', 'dayMax', 10, { pub: false }),
  def('hora_5', 'constancia', '⌛', 'Tempo bem gasto', 'Some 5 horas de jogo', 'prata', 'playMin', 300, { pub: false }),
  def('dias_30', 'constancia', '📆', 'Mês inteiro', 'Jogue em 30 dias diferentes', 'ouro', 'days', 30, { pub: false }),
  def('seq_14', 'constancia', '🥇', 'Quinzena de ouro', 'Jogue 14 dias seguidos', 'ouro', 'streak', 14, { pub: false }),
  def('hora_20', 'constancia', '🕰️', 'Horas de diversão', 'Some 20 horas de jogo', 'ouro', 'playMin', 1200, { pub: false }),
  def('dias_100', 'constancia', '🏅', 'Cem dias', 'Jogue em 100 dias diferentes', 'diamante', 'days', 100, { pub: false }),
  def('seq_30', 'constancia', '💎', 'Mês sem falhar', 'Jogue 30 dias seguidos', 'diamante', 'streak', 30, { pub: false }),

  /* ---------- coleção geral ---------- */
  def('img_1', 'colecao', '🖼️', 'Primeiro quadro', 'Conclua uma imagem das coleções', 'bronze', 'libImages', 1),
  def('cats_3', 'colecao', '🔭', 'Curioso', 'Conclua imagens de 3 coleções diferentes', 'bronze', 'libCats', 3),
  def('compra_1', 'colecao', '🗝️', 'Chave de ouro', 'Desbloqueie uma coleção com gemas', 'bronze', 'purchases', 1),
  def('img_10', 'colecao', '🏛️', 'Mini galeria', 'Conclua 10 imagens das coleções', 'prata', 'libImages', 10),
  def('img_25', 'colecao', '🎨', 'Galeria completa', 'Conclua 25 imagens das coleções', 'prata', 'libImages', 25),
  def('full_1', 'colecao', '🏁', 'Categoria concluída', 'Conclua todas as imagens de uma coleção', 'prata', 'libCatsFull', 1),
  def('replay_5', 'colecao', '🔄', 'Quero de novo!', 'Conclua o mesmo quebra-cabeça 5 vezes', 'prata', 'replayMax', 5),
  def('pecas_1000', 'colecao', '🧩', 'Mil peças', 'Monte 1.000 peças no total', 'prata', 'piecesTotal', 1000),
  def('cats_all', 'colecao', '🌐', 'Viajante dos mundos', 'Conclua imagens de todas as coleções', 'prata', 'libCats', (lib) => lib.CATEGORIES.length),
  def('img_50', 'colecao', '🏺', 'Museu pessoal', 'Conclua 50 imagens das coleções', 'ouro', 'libImages', 50),
  def('full_3', 'colecao', '👑', 'Tripla coroa', 'Conclua todas as imagens de 3 coleções', 'ouro', 'libCatsFull', 3),
  def('pecas_5000', 'colecao', '🧱', 'Cinco mil peças', 'Monte 5.000 peças no total', 'ouro', 'piecesTotal', 5000),
  def('compra_all', 'colecao', '🏰', 'Dono do acervo', 'Desbloqueie todas as coleções com gemas', 'prata', 'purchases', (lib) => lib.CATEGORIES.filter((c) => c.unlock === 'gems').length || 1),
  def('img_100', 'colecao', '🧑‍🎨', 'Curador-chefe', 'Conclua 100 imagens das coleções', 'diamante', 'libImages', 100),
  def('full_all', 'colecao', '🌌', 'Colecionador supremo', 'Conclua todas as imagens de todas as coleções', 'diamante', 'libCatsFull', (lib) => lib.CATEGORIES.length),

  /* ---------- evolução ---------- */
  def('nivel_3', 'evolucao', '🔰', 'Aprendiz', 'Chegue ao nível 3', 'bronze', 'level', 3),
  def('nivel_5', 'evolucao', '🧭', 'Explorador', 'Chegue ao nível 5', 'bronze', 'level', 5),
  def('cacador_10', 'evolucao', '🔎', 'Caçador de conquistas', 'Ganhe 10 conquistas', 'bronze', 'achCount', 10, { meta: true }),
  def('nivel_8', 'evolucao', '🗡️', 'Aventureiro', 'Chegue ao nível 8', 'prata', 'level', 8),
  def('nivel_10', 'evolucao', '🎯', 'Veterano', 'Chegue ao nível 10', 'prata', 'level', 10),
  def('cacador_25', 'evolucao', '🎖️', 'Colecionador de medalhas', 'Ganhe 25 conquistas', 'prata', 'achCount', 25, { meta: true }),
  def('nivel_15', 'evolucao', '🔮', 'Mestre', 'Chegue ao nível 15', 'ouro', 'level', 15),
  def('nivel_20', 'evolucao', '🏵️', 'Campeão de verdade', 'Chegue ao nível 20', 'ouro', 'level', 20),
  def('nivel_30', 'evolucao', '🌟', 'Lenda', 'Chegue ao nível 30', 'ouro', 'level', 30),
  def('cacador_50', 'evolucao', '🏆', 'Mestre das conquistas', 'Ganhe 50 conquistas', 'ouro', 'achCount', 50, { meta: true }),
  def('nivel_40', 'evolucao', '🦸', 'Herói', 'Chegue ao nível 40', 'diamante', 'level', 40),
  def('nivel_50', 'evolucao', '👸', 'Imortal', 'Chegue ao nível 50', 'diamante', 'level', 50),
  def('cacador_tudo', 'evolucao', '🪐', 'Completista', 'Ganhe todas as conquistas visíveis', 'diamante', 'achCount', (lib) => countable(allDefs(lib)).length, { meta: true }),

  /* ---------- segredos (mostram "???" até serem ganhos) ---------- */
  def('seg_devagar', 'segredos', '🐢', 'Sem pressa', 'Capricho vale mais que pressa: leve mais de 10 minutos num quebra-cabeça de 6 peças', 'bronze', 'slow6', 10 * MIN, { secret: true, pub: false }),
  def('seg_teimoso', 'segredos', '🔁', 'Teimosia boa', 'Conclua o mesmo quebra-cabeça 10 vezes', 'prata', 'replayMax', 10, { secret: true, pub: false }),
  def('seg_dia', 'segredos', '🌎', 'Um mundo num dia', 'Conclua imagens de 3 coleções diferentes no mesmo dia', 'prata', 'catsInDay', 3, { secret: true, pub: false }),
  def('seg_lenda', 'segredos', '🔮', 'Lenda viva', 'Nível 20, 100 quebra-cabeças concluídos e 10 vitórias', 'diamante', 'legend', 1, { secret: true, pub: false })
];

/* ---------- conquistas por categoria (nascem do catálogo da biblioteca) ---------- */
const CAT_TITLES = {
  fauna: ['Primeiro safári', 'Explorador da Fauna', 'Guardião da mata', 'Mestre da Fauna'],
  biomas: ['Primeira trilha', 'Explorador dos biomas', 'Guardião das paisagens', 'Mestre dos Biomas'],
  espaco: ['Decolagem', 'Astronauta', 'Navegador estelar', 'Mestre do Cosmos'],
  cultura: ['Primeira pincelada', 'Amigo da arte', 'Curador', 'Mestre da Cultura'],
  fantasia: ['Era uma vez…', 'Aprendiz de mago', 'Contador de histórias', 'Mestre da Fantasia']
};
// Índice do catálogo (aceita o módulo library ou um catálogo montado por library.build, para testes).
function index(lib) {
  lib = lib || library;
  if (lib.byCat && lib.byFile) return lib;
  const byCat = new Map(lib.CATEGORIES.map((c) => [c.id, []])), byFile = new Map();
  for (const i of lib.ALL) { byFile.set(i.file, i); if (byCat.has(i.categoryId)) byCat.get(i.categoryId).push(i); }
  return { CATEGORIES: lib.CATEGORIES, ALL: lib.ALL, byCat, byFile };
}
function categoryDefs(lib) {
  lib = index(lib);
  const out = [];
  for (const c of lib.CATEGORIES) {
    const n = (lib.byCat.get(c.id) || []).length;
    if (n < 1) continue;
    const t = CAT_TITLES[c.id] || ['Primeiro passo: ' + c.name, 'Explorador: ' + c.name, 'Metade do caminho: ' + c.name, 'Mestre: ' + c.name];
    const gate = Math.min(c.gate || 5, n), half = Math.ceil(n / 2), cs = 'cat.' + c.id;
    const mk = (suffix, icon, title, desc, tier, goal) => def('cat_' + c.id + '_' + suffix, 'categorias', icon, title, desc, tier, cs, goal, { cat: c.id });
    out.push(mk('1', c.icon || '🗂️', t[0], 'Conclua a primeira imagem de ' + c.name, 'bronze', 1));
    if (gate > 1 && gate < n) out.push(mk('g', '🧭', t[1], 'Conclua as ' + gate + ' primeiras imagens de ' + c.name, 'prata', gate));
    if (n >= 6 && half > Math.max(gate, 1) && half < n) out.push(mk('h', '🏅', t[2], 'Conclua metade das imagens de ' + c.name + ' (' + half + ')', 'ouro', half));
    if (n >= 2) out.push(mk('all', '👑', t[3], 'Conclua todas as ' + n + ' imagens de ' + c.name, n >= 10 ? 'diamante' : 'ouro', n));
  }
  return out;
}

function allDefs(lib) { return STATIC.concat(categoryDefs(lib)); }
const countable = (defs) => defs.filter((a) => !a.retired && !a.secret && !a.meta);
const xpOf = (a) => LEGACY_XP[a.id] || TIERS[a.tier].xp;

// Lista pronta para avaliar: metas dinâmicas já resolvidas em números.
function list(lib) {
  lib = index(lib);
  return allDefs(lib).map((a) => Object.assign({}, a, { goal: typeof a.goal === 'function' ? a.goal(lib) : a.goal, xp: xpOf(a) }));
}

/* ---------- avaliação ---------- */
function valueOf(a, st) {
  if (a.stat === 'legend') return st.level >= 20 && st.completed >= 100 && st.wins >= 10 ? 1 : 0;
  if (a.stat === 'sizesDone') return [st.c6, st.c12, st.c20, st.c30, st.c48].filter((n) => n >= 1).length;
  if (a.stat.indexOf('cat.') === 0) return (st.cat && st.cat[a.stat.slice(4)]) || 0;
  const v = st[a.stat];
  return v == null ? null : Number(v);
}
function isDone(a, st) {
  const v = valueOf(a, st);
  if (v == null) return false;
  return a.lower ? v < a.goal : v >= a.goal;
}
// Linhas para o celular. "earned" = conquistas já pagas (permanentes). Aposentadas só aparecem para quem já tem.
function evaluate(items, st, earned) {
  const rows = [];
  for (const a of items) {
    const got = earned.has(a.id), done = got || isDone(a, st);
    if (a.retired && !done) continue;
    const v = valueOf(a, st);
    rows.push({ id: a.id, g: a.g, icon: a.icon, title: a.title, desc: a.desc, tier: a.tier, xp: a.xp, done, pub: a.pub, secret: !!a.secret, lower: !!a.lower, cat: a.cat || null,
      now: a.lower ? (v == null ? null : Number(v)) : Math.min(v == null ? 0 : Number(v), a.goal), goal: a.goal });
  }
  return rows;
}
// O que o dono vê: tudo, com os segredos escondidos enquanto não forem ganhos.
function meView(rows) {
  return rows.map((r) => r.secret && !r.done ? { id: r.id, g: r.g, icon: '❔', title: '???', desc: 'Conquista secreta: descubra jogando', tier: r.tier, xp: r.xp, done: false, secret: true, lower: false, cat: null, now: null, goal: null } : r);
}
// O que um AMIGO vê: só as públicas, só se ganhou ou não (nunca o progresso, tempos, contagens, nem segredos).
function friendView(rows) {
  return rows.filter((r) => r.pub && !r.secret).map((r) => ({ id: r.id, g: r.g, icon: r.icon, title: r.title, desc: r.desc, tier: r.tier, done: r.done }));
}
function summary(rows) {
  const vis = rows.filter((r) => !r.secret || r.done), out = { done: 0, total: 0, xpDone: 0, xpTotal: 0, tiers: {} };
  for (const t of Object.keys(TIERS)) out.tiers[t] = { done: 0, total: 0 };
  for (const r of vis) {
    out.total++; out.xpTotal += r.xp; out.tiers[r.tier].total++;
    if (r.done) { out.done++; out.xpDone += r.xp; out.tiers[r.tier].done++; }
  }
  return out;
}
// Perfil de amigo: só o que é público.
function friendSummary(rows) { const pub = rows.filter((r) => r.pub && !r.secret); return { done: pub.filter((r) => r.done).length, total: pub.length }; }

/* ---------- áreas das categorias (perfil) ---------- */
function collectionsOf(lib, clears, purchases, unlocked, rows) {
  lib = index(lib);
  const done = new Set(clears);
  return lib.CATEGORIES.map((c) => {
    const imgs = lib.byCat.get(c.id) || [], n = done.size ? imgs.filter((i) => done.has(i.file)).length : 0;
    const gate = Math.min(c.gate || 5, imgs.length || 1), gateDone = imgs.slice(0, gate).filter((i) => done.has(i.file)).length;
    const mine = rows.filter((r) => r.cat === c.id);
    const prev = c.requires ? lib.CATEGORIES.find((x) => x.id === c.requires) : null;
    return { id: c.id, name: c.name, subtitle: c.subtitle || '', icon: c.icon || '🗂️', total: imgs.length, done: n, unlock: c.unlock, price: c.price || 0,
      open: !!unlocked[c.id], purchased: purchases.has(c.id), gate: { done: gateDone, total: gate }, needs: prev ? prev.name : '',
      ach: { done: mine.filter((r) => r.done).length, total: mine.length }, last: n >= imgs.length && imgs.length > 0 };
  });
}

/* ---------- estatísticas (SQL) ---------- */
const TZ = "'America/Fortaleza'";
const SIZES = [6, 12, 20, 30, 48];
function streakOf(days) {                                       // maior sequência de dias seguidos, a partir de "AAAA-MM-DD" já ordenados
  let best = 0, run = 0, prev = null;
  for (const d of days) {
    const t = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86400000;
    run = prev !== null && t - prev === 1 ? run + 1 : 1; prev = t; if (run > best) best = run;
  }
  return best;
}
function winStreakOf(results) { let best = 0, run = 0; for (const r of results) { run = r === 'win' ? run + 1 : 0; if (run > best) best = run; } return best; }

// q(sql, params) devolve { rows } (o mesmo formato de db.q). Devolve só as estatísticas EXTRAS; as básicas vêm de statsOf.
async function gatherStats(q, uid, lib) {
  lib = index(lib);
  const minParams = SIZES.map(xpm.minMs);
  const sizeSql = SIZES.map((p) => `count(*) FILTER (WHERE completed AND pieces = ${p})::int AS c${p}`).join(', ') + ', ' +
    SIZES.map((p, i) => `min(duration_ms) FILTER (WHERE completed AND pieces = ${p} AND duration_ms >= $${i + 2})::bigint AS f${p}`).join(', ');
  const [m, days, duels, fx, pc, lc, lu, inv, ux] = await Promise.all([
    q(`SELECT count(*) FILTER (WHERE mode = 'solo')::int AS solo, count(*) FILTER (WHERE mode IN ('comum', 'quebra'))::int AS duels,
              count(*) FILTER (WHERE mode = 'coop' AND completed)::int AS "coopDone", ${sizeSql},
              coalesce(max(duration_ms) FILTER (WHERE completed AND pieces = 6), 0)::bigint AS slow6,
              coalesce(sum(pieces) FILTER (WHERE completed), 0)::int AS "piecesTotal"
         FROM matches WHERE user_id = $1`, [uid].concat(minParams)),
    q(`SELECT (created_at AT TIME ZONE ${TZ})::date::text AS d, count(*)::int AS n FROM matches WHERE user_id = $1 GROUP BY 1 ORDER BY 1`, [uid]),
    q(`SELECT result FROM matches WHERE user_id = $1 AND mode IN ('comum', 'quebra') AND result IN ('win', 'loss') ORDER BY created_at, id`, [uid]),
    q(`SELECT count(*) FILTER (WHERE kind = 'match' AND coalesce((meta->'parts'->>'friend')::int, 0) > 0)::int AS fm,
              count(DISTINCT meta->>'partner') FILTER (WHERE kind = 'match' AND meta->>'partner' IS NOT NULL AND meta->>'partner' <> 'guest')::int AS partners,
              coalesce(array_agg(substr(ref, 5)) FILTER (WHERE kind = 'ach'), '{}') AS earned
         FROM xp_events WHERE user_id = $1`, [uid]),
    q('SELECT coalesce(max(clears), 0)::int AS m FROM puzzle_clears WHERE user_id = $1', [uid]),
    q(`SELECT image_id, (completed_at AT TIME ZONE ${TZ})::date::text AS d FROM library_clears WHERE user_id = $1`, [uid]),
    q('SELECT category_id FROM library_unlocks WHERE user_id = $1', [uid]),
    q("SELECT count(*)::int AS n FROM invites WHERE from_user = $1 AND status = 'accepted'", [uid]),
    q('SELECT xp FROM users WHERE id = $1', [uid])
  ]);
  const r = m.rows[0], ev = fx.rows[0];
  const cat = {}, perDay = new Map(), imgs = new Set();
  for (const row of lc.rows) {
    const it = lib.byFile.get(row.image_id); if (!it) continue;                  // imagem que saiu do catálogo não conta
    imgs.add(it.file); cat[it.categoryId] = (cat[it.categoryId] || 0) + 1;
    if (!perDay.has(row.d)) perDay.set(row.d, new Set()); perDay.get(row.d).add(it.categoryId);
  }
  const dayRows = days.rows;
  const st = {
    soloGames: r.solo, duels: r.duels, coopDone: r.coopDone, slow6: Number(r.slow6),
    piecesTotal: r.piecesTotal, days: dayRows.length, dayMax: dayRows.reduce((a, x) => Math.max(a, x.n), 0), streak: streakOf(dayRows.map((x) => x.d)),
    winStreak: winStreakOf(duels.rows.map((x) => x.result)), friendMatches: ev.fm, partners: ev.partners, invitesOk: inv.rows[0].n,
    replayMax: pc.rows[0].m, libImages: imgs.size, cat, libCats: Object.keys(cat).length,
    libCatsFull: lib.CATEGORIES.filter((c) => { const t = (lib.byCat.get(c.id) || []).length; return t > 0 && (cat[c.id] || 0) >= t; }).length,
    purchases: lu.rows.length, catsInDay: [...perDay.values()].reduce((a, s) => Math.max(a, s.size), 0),
    level: xpm.levelFromXp((ux.rows[0] || { xp: 0 }).xp),
    earned: new Set(ev.earned || []),
    clearsSet: imgs, purchasesSet: new Set(lu.rows.map((x) => x.category_id))
  };
  for (const p of SIZES) { st['c' + p] = r['c' + p]; st['f' + p] = r['f' + p] == null ? null : Number(r['f' + p]); }
  return st;
}
// "playMin" e "achCount" dependem das estatísticas básicas e das conquistas já ganhas: preenchidos por quem junta tudo.
function complete(base, extra, items) {
  const st = Object.assign({}, base, extra);
  st.playMin = Math.floor((base.totalMs || 0) / 60000);
  const cnt = countable(items || list());
  st.achCount = cnt.filter((a) => extra.earned.has(a.id)).length;
  return st;
}

module.exports = { index, TIERS, GROUPS, STATIC, CAT_TITLES, list, evaluate, isDone, valueOf, meView, friendView, summary, friendSummary, collectionsOf, gatherStats, complete, streakOf, winStreakOf, countable, categoryDefs, SIZES };
