'use strict';
/* Nomes sorteados pelo jogo (Animal + Cor). O jogador NÃO digita o nome: isso evita nome verdadeiro, dado pessoal e texto ofensivo.
 * O nome só aparece para a própria pessoa; nas salas os dois aparecem como "Jogador 1" e "Jogador 2". */
const crypto = require('crypto');
const ANIMAIS = ['Onça', 'Arara', 'Tucano', 'Capivara', 'Tamanduá', 'Jacaré', 'Boto', 'Preguiça', 'Tatu', 'Sagui', 'Quati', 'Ariranha', 'Seriema', 'Sabiá', 'Jabuti', 'Cutia',
  'Carcará', 'Garça', 'Gavião', 'Coruja', 'Papagaio', 'Mico', 'Lontra', 'Lobo', 'Jaguatirica', 'Peixe-boi', 'Beija-flor', 'Bem-te-vi', 'Pirarucu', 'Tartaruga', 'Baleia',
  'Golfinho', 'Pinguim', 'Coala', 'Panda', 'Raposa', 'Falcão', 'Cervo', 'Esquilo', 'Lebre', 'Zebra', 'Girafa', 'Elefante', 'Leopardo', 'Pelicano', 'Flamingo', 'Cisne', 'Ema'];
const CORES = ['Azul', 'Verde', 'Rosa', 'Dourado', 'Prata', 'Coral', 'Violeta', 'Turquesa', 'Laranja', 'Lilás', 'Âmbar', 'Cinza', 'Vermelho', 'Amarelo', 'Branco', 'Roxo',
  'Marrom', 'Índigo', 'Menta', 'Ouro', 'Pêssego', 'Cereja', 'Limão', 'Oliva'];
const pick = () => ANIMAIS[crypto.randomInt(0, ANIMAIS.length)] + ' ' + CORES[crypto.randomInt(0, CORES.length)];
module.exports = { pick, ANIMAIS, CORES, TOTAL: ANIMAIS.length * CORES.length };
