/* Tema de Natal (rodada tema-natal, 16/11/2026): uma camada SÓ VISUAL e temporária.
 * Não mexe em regras, peças, encaixe, partidas, gemas, loja, conta nem servidor. Ligado, este arquivo só:
 *   1) põe o atributo data-natal no <html> (todo o CSS de tema-natal.css depende dele);
 *   2) mostra as saudações que já estão no index.html escondidas ([data-natal-msg]);
 *   3) acrescenta as luzinhas do topo e a neve da tela inicial (só enfeite: aria-hidden e sem toque).
 * Desligado, nada disso acontece e o visual de sempre fica intacto.
 *
 * ====== A CHAVE ÚNICA ======
 *   MODO = 'ligado'      → liga sozinho de 1º de dezembro a 6 de janeiro, pela data do aparelho (padrão)
 *   MODO = 'ligado'    → sempre ligado
 *   MODO = 'desligado' → sempre desligado
 * Para conferir antes de dezembro, sem mudar a chave: abra o endereço com ?natal=1 (?natal=0 desliga). Vale só para aquela abertura. */
(function () {
  'use strict';
  var MODO = 'auto';

  function epoca(d) { var m = d.getMonth(), dia = d.getDate(); return m === 11 || (m === 0 && dia <= 6); }      // 1º/12 a 31/12 e 1º/01 a 6/01
  function ligado(modo, d, q) {
    if (q === '1') return true;
    if (q === '0') return false;
    if (modo === 'ligado') return true;
    if (modo === 'desligado') return false;
    return epoca(d);
  }
  var q = null;
  try { q = new URLSearchParams(window.location.search).get('natal'); } catch (e) { /* navegador antigo: fica a chave */ }
  var on = ligado(MODO, new Date(), q), raiz = document.documentElement;
  window.QCNatal = { ativo: on, modo: MODO, epoca: epoca, ligado: ligado };
  if (!on) return;
  raiz.setAttribute('data-natal', '');
  raiz.setAttribute('data-natal-tela', 'home');

  function montar() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-natal-msg]'), function (e) { e.hidden = false; });
    var luz = document.createElement('div'); luz.className = 'natal-luzes'; luz.setAttribute('aria-hidden', 'true');
    document.body.appendChild(luz);
    var home = document.getElementById('screen-home');
    if (home) {                                                     // neve: UMA camada leve, atrás do conteúdo da tela inicial
      var neve = document.createElement('div'), deco = home.querySelector('.bg-deco');
      neve.className = 'natal-neve'; neve.setAttribute('aria-hidden', 'true');
      neve.appendChild(document.createElement('i'));
      home.insertBefore(neve, deco ? deco.nextSibling : home.firstChild);
    }
    var QC = window.QC;                                             // a tela atual: na partida não há luzinhas (nem neve, que só existe na tela inicial)
    if (QC) { var antes = QC.onScreen; QC.onScreen = function (name) { if (antes) antes(name); raiz.setAttribute('data-natal-tela', String(name)); }; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar); else montar();
})();
