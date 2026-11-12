/* Elementos visuais dos cabeçalhos das telas (inspirados em peças de quebra-cabeça). Só montam elementos por DOM (nunca HTML de texto), não leem nem enviam dado nenhum
 * e dependem só de pecas.js. O texto e os números vêm do jogo; aqui só se desenha. */
(function () {
  'use strict';
  var P = window.QCPecas, NS = 'http://www.w3.org/2000/svg';
  if (!P) return;
  function svgEl(tag, attrs) { var e = document.createElementNS(NS, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
  function limpa(host) { while (host.firstChild) host.removeChild(host.firstChild); }
  function tira(svg) { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); return svg; }

  /* Título com a ÚLTIMA palavra em destaque ("ESCOLHA UMA " + "CATEGORIA"). O texto continua sendo texto de verdade (leitores de tela leem inteiro). */
  function destaque(el, texto) {
    limpa(el); var i = texto.lastIndexOf(' ');
    if (i < 0) { el.textContent = texto; return; }
    el.appendChild(document.createTextNode(texto.slice(0, i + 1)));
    var s = document.createElement('span'); s.className = 'pick-hl'; s.textContent = texto.slice(i + 1); el.appendChild(s);
  }
  /* Separador discreto: três peças pequenas encaixadas (azul, amarela e rosa, as cores do logotipo). */
  function separador(host) {
    limpa(host); var p = P.progresso(3, 3), svg = tira(svgEl('svg', { viewBox: '0 0 ' + p.largura + ' 1.1', class: 'peca-sep-svg' }));
    p.celulas.forEach(function (c, i) { svg.appendChild(svgEl('path', { d: c.d, transform: 'translate(' + c.x + ' 0.55)', class: 'cor-' + (i % 3) })); });
    host.appendChild(svg);
  }
  /* Progresso: uma peça por imagem, encaixadas; as concluídas ficam coloridas. */
  function progresso(host, feitas, total) {
    limpa(host); var p = P.progresso(feitas, total);
    host.classList.toggle('completo', total > 0 && feitas >= total);
    if (!p.n) { host.hidden = true; return; }
    host.hidden = false;
    var svg = tira(svgEl('svg', { viewBox: '0 0 ' + p.largura + ' 1.1', class: 'prog-svg' }));
    svg.style.setProperty('--n', String(p.n));
    p.celulas.forEach(function (c) { svg.appendChild(svgEl('path', { d: c.d, transform: 'translate(' + c.x + ' 0.55)', class: c.feita ? 'pc-on' : 'pc-off' })); });
    host.appendChild(svg);
    host.setAttribute('aria-label', feitas + ' de ' + total + ' imagens concluídas');
  }
  /* Ícones da barra de abas, todos feitos de peças de quebra-cabeça (o mesmo traçado do resto do jogo):
   *  amigos = duas peças que se encaixam (azul e rosa);  loja = peça amarela com uma gema;  ajustes = peça roxa com uma engrenagem. */
  var BORDA = 'rgba(27,37,89,.32)';
  function peca(svg, cx, cy, tam, tabs, cor) {
    svg.appendChild(svgEl('path', { d: P.caminho(tabs), transform: 'translate(' + cx + ' ' + cy + ') scale(' + tam + ')', fill: cor, stroke: BORDA, 'stroke-width': 0.07, 'stroke-linejoin': 'round' }));
  }
  function icone(host, nome) {
    limpa(host); var svg = tira(svgEl('svg', { viewBox: '0 0 32 32', class: 'tab-svg' }));
    if (nome === 'amigos') { peca(svg, 10.2, 16, 12.5, [0, 1, 0, 0], '#4f7dff'); peca(svg, 23.1, 16, 12.5, [0, 0, 0, -1], '#ff6fa3'); }
    else if (nome === 'loja') {
      peca(svg, 15.5, 16, 17, [1, 0, 0, -1], '#ffcf33');
      svg.appendChild(svgEl('path', { d: 'M15.5 10.4 L20.1 15.2 L15.5 22 L10.9 15.2 Z', fill: '#ffffff', stroke: '#2a5ee8', 'stroke-width': 1.1, 'stroke-linejoin': 'round' }));
      svg.appendChild(svgEl('path', { d: 'M10.9 15.2 H20.1', fill: 'none', stroke: '#2a5ee8', 'stroke-width': 0.9 }));
    } else if (nome === 'ajustes') {
      peca(svg, 15.5, 16, 17, [0, 1, 0, -1], '#8b6cf0');
      svg.appendChild(svgEl('circle', { cx: 15.5, cy: 16, r: 5.1, fill: 'none', stroke: '#ffffff', 'stroke-width': 2.6, 'stroke-dasharray': '2 2.0' }));
      svg.appendChild(svgEl('circle', { cx: 15.5, cy: 16, r: 3.3, fill: '#8b6cf0', stroke: '#ffffff', 'stroke-width': 1.5 }));
    }
    host.appendChild(svg);
  }
  Array.prototype.forEach.call(document.querySelectorAll('[data-ico]'), function (el) { icone(el, el.getAttribute('data-ico')); });
  window.QCCab = { destaque: destaque, separador: separador, progresso: progresso, icone: icone };
})();
