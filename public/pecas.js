/* Forma da peça de quebra-cabeça (a mesma em todo o jogo visual novo): o fundo decorativo das telas (scripts/fundos.js) e o indicador de progresso dos cabeçalhos
 * (QCPecas.progresso) usam ESTE traçado, então tudo "fala a mesma língua". Sem DOM obrigatório (o desenho de SVG só toca o DOM quando é chamado no navegador). */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api; else root.QCPecas = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var f3 = function (v) { return String(Math.round(v * 1000) / 1000); };
  // o "dente": 0 = lado reto, 1 = dente para fora, -1 = encaixe para dentro. u anda ao longo do lado (0 a 1) e v para fora (a ponta chega a ~0,27).
  var DENTE = [[0.37, 0], [0.37, 0.08, 0.28, 0.10, 0.28, 0.17], [0.28, 0.27, 0.72, 0.27, 0.72, 0.17], [0.72, 0.10, 0.63, 0.08, 0.63, 0], [1, 0]];
  var PROFUNDIDADE = 0.27;
  // lados de um quadrado de 1 x 1 centrado na origem, no sentido horário (SVG: y para baixo): início, direção ao longo do lado e normal para fora
  var LADOS = [
    { p: [-0.5, -0.5], d: [1, 0], n: [0, -1] },      // cima
    { p: [0.5, -0.5], d: [0, 1], n: [1, 0] },        // direita
    { p: [0.5, 0.5], d: [-1, 0], n: [0, 1] },        // baixo
    { p: [-0.5, 0.5], d: [0, -1], n: [-1, 0] }       // esquerda
  ];
  function ponto(l, u, v, s) { return f3(l.p[0] + l.d[0] * u + l.n[0] * v * s) + ' ' + f3(l.p[1] + l.d[1] * u + l.n[1] * v * s); }
  /* Caminho SVG de uma peça de lado 1 (em torno da origem). tabs = [cima, direita, baixo, esquerda], cada um -1, 0 ou 1. */
  function caminho(tabs) {
    var d = 'M-0.5 -0.5';
    for (var i = 0; i < 4; i++) {
      var l = LADOS[i], s = tabs[i] || 0;
      if (!s) { d += 'L' + ponto(l, 1, 0, 1); continue; }
      DENTE.forEach(function (seg) {
        if (seg.length === 2) d += 'L' + ponto(l, seg[0], seg[1], s);
        else d += 'C' + ponto(l, seg[0], seg[1], s) + ' ' + ponto(l, seg[2], seg[3], s) + ' ' + ponto(l, seg[4], seg[5], s);
      });
    }
    return d + 'Z';
  }
  /* Indicador de progresso: `total` peças ENCAIXADAS lado a lado (cada uma com o dente à direita entrando no encaixe da seguinte); as `feitas` primeiras ficam coloridas.
   * Devolve só dados (cada célula com o caminho e se está feita), para o navegador montar o SVG sem HTML dinâmico. Com muitas imagens, limita a 20 células (proporcional). */
  function progresso(feitas, total) {
    total = Number(total); feitas = Number(feitas);
    total = isFinite(total) ? Math.max(0, Math.floor(total)) : 0; feitas = isFinite(feitas) ? Math.max(0, Math.min(total, Math.floor(feitas))) : 0;        // número inválido ou infinito vira 0
    var n = Math.min(total, 20), cheias = total <= 20 ? feitas : (feitas === 0 ? 0 : (feitas === total ? n : Math.max(1, Math.min(n - 1, Math.round(feitas / total * n)))));
    var cel = [];
    for (var i = 0; i < n; i++) cel.push({ d: caminho([0, i < n - 1 ? 1 : 0, 0, i > 0 ? -1 : 0]), x: i * 1.04 + 0.5, feita: i < cheias });
    return { n: n, cheias: cheias, largura: n * 1.04 + 0.28, celulas: cel };
  }
  return { caminho: caminho, progresso: progresso, PROFUNDIDADE: PROFUNDIDADE };
});
