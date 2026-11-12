'use strict';
/* GERADOR DOS FUNDOS. Fonte única do visual de fundo das telas e janelas: lê só a especificação abaixo e escreve public/fundos/*.svg e public/fundos.css.
 *   node scripts/fundos.js          escreve os arquivos (rode depois de mexer na especificação)
 *   node scripts/fundos.js --check  confere se os arquivos do repositório são exatamente o que a especificação gera (o teste usa isso)
 * Referência visual: fundo_sala_desafio.json (base marinho, duas luzes radiais e 4 a 7 peças de quebra-cabeça, sem contorno, baixa opacidade, nas bordas, centro livre).
 * Cada tela tem uma VARIAÇÃO: muda posição, rotação, tamanho e tom das peças e a intensidade das luzes; o resto (a identidade) é igual. */
const fs = require('node:fs');
const path = require('node:path');
const { caminho } = require('../public/pecas.js');

const LARGURA = 720, ALTURA = 1600, BASE = '#111633';
// cores das peças (as do JSON mais tons discretos de verde, amarelo e rosa)
const COR = { azul: '#25448F', roxo: '#7E326F', turquesa: '#0E929E', cinza: '#605A5D', oliva: '#77704E', indigo: '#6555CA', violeta: '#4C286F', amarelo: '#9A7B1F', rosa: '#A33A74', verde: '#1E8A62', ouro: '#B38B1E', lilas: '#6B3DA8' };
const LIMITES = { pecasMin: 4, pecasMax: 7, opacMin: 0.2, opacMax: 0.45, centro: { x0: 0.23, x1: 0.77, y0: 0.23, y1: 0.77 } };

// luz = [cor, opacidade, centro x %, centro y %, raio %]
const LUZ_A = ['#24458E', 0.35, 22, 28, 55], LUZ_B = ['#542C86', 0.35, 88, 88, 44];
// peça = [id, cx, cy, tamanho, ângulo, cor, opacidade]   (as variações abaixo só dizem O QUE muda)
const VARIACOES = {
  desafio: { nome: 'Sala Desafio (a referência do JSON): azul e rosa', luzes: [LUZ_A, LUZ_B], pecas: [
    ['superior-esq', 56, 325, 175, -16, 'azul', 0.38], ['superior-dir', 644, 248, 170, 16, 'cinza', 0.33], ['meio-esq', 12, 826, 88, 25, 'oliva', 0.42],
    ['meio-dir', 688, 789, 105, -13, 'roxo', 0.31], ['inferior-esq', 24, 1270, 125, 16, 'turquesa', 0.34], ['inferior-dir', 708, 1478, 177, -22, 'indigo', 0.33]] },
  inicio: { nome: 'Tela inicial: azul, amarelo, verde, rosa', luzes: [['#24458E', 0.35, 22, 24, 55], ['#7A2F72', 0.30, 86, 90, 44]], pecas: [
    ['a', 40, 300, 160, -14, 'azul', 0.36], ['b', 690, 210, 150, 18, 'amarelo', 0.34], ['c', 14, 900, 100, 22, 'verde', 0.34],
    ['d', 700, 1000, 120, -18, 'rosa', 0.32], ['e', 30, 1420, 150, 12, 'indigo', 0.34], ['f', 690, 1500, 170, -25, 'turquesa', 0.33]] },
  categorias: { nome: 'Categorias: roxo, turquesa, amarelo e rosa', luzes: [['#1F4E8F', 0.34, 80, 18, 52], ['#4C286F', 0.36, 14, 86, 46]], pecas: [
    ['a', 690, 170, 160, 20, 'roxo', 0.34], ['b', 30, 420, 120, -18, 'turquesa', 0.36], ['c', 706, 700, 110, 14, 'azul', 0.38],
    ['d', 8, 1000, 135, 24, 'amarelo', 0.32], ['e', 700, 1280, 150, -16, 'rosa', 0.30], ['f', 50, 1520, 160, 10, 'indigo', 0.34]] },
  colecoes: { nome: 'Coleções: verde, azul, rosa e amarelo', luzes: [['#1E6A7A', 0.26, 18, 22, 50], ['#542C86', 0.34, 90, 84, 44]], pecas: [
    ['a', 20, 200, 140, 12, 'verde', 0.34], ['b', 700, 330, 120, -20, 'azul', 0.36], ['c', 700, 860, 100, 16, 'indigo', 0.34],
    ['d', 14, 1100, 130, -12, 'rosa', 0.32], ['e', 690, 1450, 170, 20, 'amarelo', 0.30]] },
  montagem: { nome: 'Montagem: só 4 peças pequenas e discretas, bem longe do jogo', luzes: [['#24458E', 0.22, 50, 40, 70], ['#542C86', 0.22, 50, 95, 60]], pecas: [
    ['a', 10, 120, 110, -14, 'azul', 0.24], ['b', 712, 170, 100, 18, 'indigo', 0.22], ['c', 8, 1500, 120, 16, 'turquesa', 0.22], ['d', 712, 1470, 130, -20, 'roxo', 0.24]] },
  loja: { nome: 'Loja: amarelo e roxo', luzes: [['#6B4A1E', 0.28, 20, 26, 52], ['#542C86', 0.38, 88, 86, 46]], pecas: [
    ['a', 30, 260, 150, -12, 'ouro', 0.36], ['b', 700, 330, 140, 16, 'roxo', 0.36], ['c', 10, 880, 100, 22, 'lilas', 0.34],
    ['d', 704, 980, 115, -14, 'amarelo', 0.30], ['e', 40, 1400, 150, 14, 'roxo', 0.34], ['f', 690, 1500, 150, -22, 'ouro', 0.32]] },
  amigos: { nome: 'Amigos: turquesa, verde e rosa', luzes: [['#0E6F7A', 0.28, 22, 28, 52], ['#7E326F', 0.30, 88, 88, 44]], pecas: [
    ['a', 690, 230, 150, 15, 'turquesa', 0.36], ['b', 24, 360, 130, -18, 'rosa', 0.34], ['c', 700, 860, 110, 12, 'verde', 0.34],
    ['d', 8, 1060, 120, 20, 'turquesa', 0.32], ['e', 30, 1440, 160, -14, 'rosa', 0.30], ['f', 700, 1500, 130, 24, 'verde', 0.30]] },
  ajustes: { nome: 'Ajustes: azul e cinza, bem discreto', luzes: [['#24458E', 0.30, 22, 28, 55], ['#3A3F66', 0.30, 88, 88, 44]], pecas: [
    ['a', 30, 280, 150, -16, 'azul', 0.32], ['b', 690, 250, 140, 14, 'cinza', 0.30], ['c', 14, 960, 100, 20, 'cinza', 0.30],
    ['d', 700, 900, 110, -12, 'azul', 0.30], ['e', 700, 1440, 160, -20, 'indigo', 0.30]] },
  conta: { nome: 'Meu espaço: roxo e azul', luzes: [['#4C286F', 0.34, 78, 22, 52], ['#24458E', 0.34, 16, 88, 46]], pecas: [
    ['a', 680, 260, 150, 18, 'roxo', 0.34], ['b', 20, 330, 140, -14, 'indigo', 0.36], ['c', 704, 820, 100, 14, 'azul', 0.34],
    ['d', 8, 1180, 120, 22, 'roxo', 0.30], ['e', 36, 1500, 160, -18, 'azul', 0.32], ['f', 700, 1450, 140, 16, 'verde', 0.28]] },
  janela: { nome: 'Janelas em geral (só as peças, sobre a folha da janela): poucas e discretas', luzes: [], pecas: [
    ['a', 20, 240, 130, -14, 'azul', 0.34], ['b', 704, 380, 120, 14, 'roxo', 0.34], ['c', 8, 1000, 110, 20, 'turquesa', 0.32], ['d', 706, 1100, 120, -18, 'amarelo', 0.32]] }
};
// quais variações também viram "folha de janela" (só as peças, sem fundo), e em que telas o fundo inteiro é usado
const JANELAS = ['janela', 'loja', 'ajustes', 'amigos'];
const TELAS = ['#screen-home', '#screen-me', '#screen-pick', '#screen-lobby', '#screen-game'];

const mistura = (hex, k) => { const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k)); return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase(); };
const num = (v) => String(Math.round(v * 100) / 100);

function tabsDe(i) { return [((i + 1) % 3) - 1, ((i * 2 + 1) % 3) - 1, ((i + 2) % 3) - 1, ((i * 2) % 3) - 1]; }       // dentes diferentes de peça para peça (sempre os mesmos)
function pecasSvg(v, tema) {
  return v.pecas.map((p, i) => {
    const [, cx, cy, tam, ang, cor, op] = p, c = tema === 'claro' ? mistura(COR[cor], 0.62) : COR[cor], o = tema === 'claro' ? Math.min(0.55, num(op * 1.45)) : op;
    return `<path d="${caminho(tabsDe(i))}" transform="translate(${cx} ${cy}) rotate(${ang}) scale(${tam})" fill="${c}" fill-opacity="${o}"/>`;
  }).join('\n  ');
}
// tema: 'completo' (fundo marinho + luzes + peças), 'escuro' ou 'claro' (só as peças, para a folha das janelas)
function svg(nome, tema) {
  const v = VARIACOES[nome];
  const luzes = tema === 'completo' ? v.luzes.map((l, i) => `<radialGradient id="l${i}" gradientUnits="userSpaceOnUse" cx="${num(l[2] / 100 * LARGURA)}" cy="${num(l[3] / 100 * ALTURA)}" r="${num(l[4] / 100 * 1000)}"><stop offset="0" stop-color="${l[0]}" stop-opacity="${l[1]}"/><stop offset="1" stop-color="${l[0]}" stop-opacity="0"/></radialGradient>`).join('') : '';
  const camadas = tema === 'completo' ? `<rect width="${LARGURA}" height="${ALTURA}" fill="${BASE}"/>\n  ` + v.luzes.map((l, i) => `<rect width="${LARGURA}" height="${ALTURA}" fill="url(#l${i})"/>`).join('\n  ') + '\n  ' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LARGURA} ${ALTURA}" preserveAspectRatio="xMidYMid slice" width="${LARGURA}" height="${ALTURA}">\n  <!-- GERADO por scripts/fundos.js (${nome}, ${tema}). Não edite à mão. -->\n  ${luzes ? '<defs>' + luzes + '</defs>\n  ' : ''}${camadas}${pecasSvg(v, tema)}\n</svg>\n`;
}
function css() {
  const nomes = Object.keys(VARIACOES).filter((n) => n !== 'janela'), tela = TELAS.join(', ');
  let s = `/* GERADO por scripts/fundos.js a partir da especificação dos fundos. Não edite à mão (rode: node scripts/fundos.js). */\n:root { --fundo-base: ${BASE}; --janela-img: url("fundos/janela-claro.svg"); }\nhtml[data-theme="dark"] { --janela-img: url("fundos/janela-escuro.svg"); }\n`;
  s += `/* telas: fundo marinho com as luzes e as peças da variação escolhida em data-fundo (o scripts troca o atributo nas telas que mudam de aparência, como categorias e coleções) */\nhtml body :is(${tela})[data-fundo] { background-color: var(--fundo-base); background-image: var(--fundo-img); background-position: center; background-size: cover; background-repeat: no-repeat; }\n`;
  nomes.forEach((n) => { s += `html body :is(${tela})[data-fundo="${n}"] { --fundo-img: url("fundos/${n}.svg"); }\n`; });
  s += `/* janelas: só as peças (pastel no tema claro) sobre a folha da janela */\n.sheet { background-image: var(--janela-img); background-position: center; background-size: cover; background-repeat: no-repeat; }\n`;
  JANELAS.filter((n) => n !== 'janela').forEach((n) => { s += `.sheet[data-janela="${n}"] { --janela-img: url("fundos/${n}-janela-claro.svg"); }\nhtml[data-theme="dark"] .sheet[data-janela="${n}"] { --janela-img: url("fundos/${n}-janela-escuro.svg"); }\n`; });
  return s;
}
function tudo() {
  const out = { 'fundos.css': css(), 'fundos/peca-icone.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.62 -0.62 1.24 1.24"><!-- GERADO por scripts/fundos.js: o ícone de peça dos selos (usado como máscara). --><path d="${caminho([1, 1, -1, -1])}" fill="#000"/></svg>\n` };
  Object.keys(VARIACOES).filter((n) => n !== 'janela').forEach((n) => { out['fundos/' + n + '.svg'] = svg(n, 'completo'); });
  JANELAS.forEach((n) => { ['claro', 'escuro'].forEach((t) => { out['fundos/' + (n === 'janela' ? '' : n + '-') + 'janela-' + t + '.svg'] = svg(n, t); }); });
  return out;
}
module.exports = { LARGURA, ALTURA, BASE, COR, LIMITES, VARIACOES, JANELAS, TELAS, svg, css, tudo, mistura };

if (require.main === module) {
  const pub = path.join(__dirname, '..', 'public'), arq = tudo(); let ruim = 0;
  if (process.argv.includes('--check')) {
    for (const [f, c] of Object.entries(arq)) { let atual = null; try { atual = fs.readFileSync(path.join(pub, f), 'utf8'); } catch (e) { /* falta */ } if (atual !== c) { ruim++; console.log('DIFERENTE: ' + f); } }
    console.log(ruim ? ruim + ' arquivo(s) fora de dia: rode node scripts/fundos.js' : 'ok: todos os fundos batem com a especificação'); process.exit(ruim ? 1 : 0);
  }
  fs.mkdirSync(path.join(pub, 'fundos'), { recursive: true });
  for (const [f, c] of Object.entries(arq)) fs.writeFileSync(path.join(pub, f), c);
  console.log('gerados', Object.keys(arq).length, 'arquivos');
}
