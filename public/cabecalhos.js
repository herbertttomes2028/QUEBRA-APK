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
  window.QCCab = { destaque: destaque, separador: separador, progresso: progresso };
})();
