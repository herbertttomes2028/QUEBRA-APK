/*
 * Anúncios RECOMPENSADOS na Loja (opcionais). Configuração e regras no servidor: ads.js e accounts.js (/api/acc/ads...).
 * - Com a chave DESLIGADA (padrão) este arquivo não faz nada além de um pedido pequeno quando alguém com perfil abre a Loja.
 * - Nunca para visitante, nunca na partida, nunca pelo pet: só aparece o botão "Ver um anúncio" dentro da Loja.
 * - O script do Google só é baixado na PRIMEIRA vez que alguém com perfil abre a Loja com ADS_MODO=teste/real (não pesa na abertura do jogo).
 * - Sempre não personalizado (requestNonPersonalizedAds = 1) e marcado como público menor de idade.
 * - O celular nunca diz quantas gemas ganhou: só devolve a ficha de uso único; o servidor decide e credita.
 */
(function () {
  'use strict';
  var QC = window.QC;
  var modal = document.getElementById('modal-shop'), box = document.getElementById('shop-ads');
  if (!QC || !modal || !box) return;
  var btn = document.getElementById('shop-ads-btn'), txt = document.getElementById('shop-ads-txt'), note = document.getElementById('shop-ads-note');
  var sim = document.getElementById('modal-ad-sim'), simCount = document.getElementById('adsim-count'), simClose = document.getElementById('adsim-close');

  var info = null;            // resposta de /ads (modo, gemas, restantes, esperar)
  var busy = false;           // um anúncio por vez
  var showAd = null;          // função do Google para mostrar o anúncio já carregado (só existe depois de beforeReward)
  var nonce = '';             // ficha do servidor para ESTE anúncio
  var viewed = false;
  var loaded = false;         // script do Google já pedido
  var asked = false;          // já pedimos um anúncio ao Google nesta abertura da Loja

  function logged() { return !!(QC.account && QC.account()); }
  function api(m, p, b) { return QC.api ? QC.api(m, p, b, true) : Promise.resolve({ ok: false, error: 'offline' }); }
  function say(t) { note.textContent = t || ''; }
  function minutos(s) { var m = Math.ceil(s / 60); return m <= 1 ? '1 minuto' : m + ' minutos'; }
  function hide() { box.hidden = true; btn.disabled = true; say(''); }

  function paint() {
    if (!info || info.modo === 'desligado' || !logged()) return hide();
    box.hidden = false;
    txt.textContent = 'Ver um anúncio: +' + info.gemas + (info.gemas === 1 ? ' gema' : ' gemas');
    if (!info.restantes) { btn.disabled = true; return say('Os anúncios de hoje já foram vistos. Amanhã tem de novo.'); }
    if (info.esperar > 0) { btn.disabled = true; return say('Opcional. O próximo fica disponível em ' + minutos(info.esperar) + '.'); }
    if (info.modo !== 'simulado' && !showAd) { btn.disabled = true; return say(asked ? 'Procurando um anúncio…' : 'Opcional.'); }
    btn.disabled = busy;
    say('Opcional. ' + (info.restantes === 1 ? 'Falta 1 hoje.' : 'Faltam ' + info.restantes + ' hoje.'));
  }

  /* ---------- script do Google (só teste/real) ---------- */
  var policy = null;
  function scriptUrl(client) { return 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client); }
  function loadGoogle() {
    if (loaded || !info || !info.client) return;
    loaded = true;
    var url = scriptUrl(info.client);
    try {                                              // Trusted Types: esta política aceita SÓ este endereço exato
      if (window.trustedTypes && window.trustedTypes.createPolicy) policy = window.trustedTypes.createPolicy('qc-anuncios', { createScriptURL: function (u) { if (u !== url) throw new Error('url'); return u; } });
    } catch (e) { policy = null; }
    window.adsbygoogle = window.adsbygoogle || [];
    window.adsbygoogle.requestNonPersonalizedAds = 1;  // nunca anúncio por perfil de interesses (ECA Digital, art. 22)
    window.adBreak = window.adConfig = function (o) { window.adsbygoogle.push(o); };
    var s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.setAttribute('data-ad-client', info.client);
    if (info.modo === 'teste') s.setAttribute('data-adbreak-test', 'on');
    s.setAttribute('data-tag-for-child-directed-treatment', '1');
    s.setAttribute('data-tag-for-under-age-of-consent', '1');
    s.setAttribute('data-ad-frequency-hint', Math.max(30, info.intervalo | 0) + 's');
    s.src = policy ? policy.createScriptURL(url) : url;
    s.onerror = function () { say('Os anúncios não carregaram agora. Tente mais tarde.'); };
    document.head.appendChild(s);
    window.adConfig({ preloadAdBreaks: 'on', sound: 'off' });
  }
  function askGoogle() {                               // pede ao Google um anúncio recompensado; o botão só acende quando houver um pronto
    if (asked || !info || !info.client || !info.restantes || info.esperar > 0) return;
    asked = true; showAd = null; viewed = false;
    loadGoogle();
    window.adBreak({
      type: 'reward', name: 'loja-gemas',
      beforeAd: function () { busy = true; },
      afterAd: function () { busy = false; },
      beforeReward: function (fn) { showAd = fn; paint(); },
      adDismissed: function () { viewed = false; },
      adViewed: function () { viewed = true; },
      adBreakDone: function (p) {
        var st = p && p.breakStatus;
        showAd = null; asked = false; busy = false;
        if (st === 'viewed' || viewed) return reward();
        if (st === 'dismissed') { nonce = ''; say('Tudo bem: o anúncio foi fechado antes do fim, então não há gemas desta vez.'); btn.disabled = true; return; }
        nonce = '';
        say(st === 'frequencyCapped' ? 'Por agora não há anúncio. Tente mais tarde.' : 'Nenhum anúncio disponível agora. Tente mais tarde.');
        btn.disabled = true;
      }
    });
    paint();
  }

  /* ---------- anúncio simulado (ADS_MODO=simulado): feito pelo próprio jogo, sem internet e sem Google ---------- */
  var simT = 0, simLeft = 0;
  function simEnd(ok) {
    clearInterval(simT); simT = 0;
    if (!sim.hidden) QC.closeModal('#modal-ad-sim');
    busy = false;
    if (ok) return reward();
    nonce = '';
    paint();
    say('Tudo bem: o anúncio foi fechado antes do fim, então não há gemas desta vez.');
  }
  function simStart() {
    simLeft = (info && info.simuladoS) || 5;
    simCount.textContent = String(simLeft);
    QC.openModal('#modal-ad-sim', '#adsim-close');
    simT = setInterval(function () {
      simLeft -= 1;
      simCount.textContent = String(Math.max(0, simLeft));
      if (simLeft <= 0) simEnd(true);
    }, 1000);
  }
  if (simClose) simClose.addEventListener('click', function () { if (simT) simEnd(false); });
  if (sim) new MutationObserver(function () { if (sim.hidden && simT) simEnd(false); }).observe(sim, { attributes: true, attributeFilter: ['hidden'] });   // voltar (Android) também fecha

  /* ---------- servidor ---------- */
  function reward() {
    var n = nonce; nonce = '';
    if (!n) return paint();
    api('POST', '/ads/reward', { nonce: n }).then(function (j) {
      if (j && (j.restantes != null)) info = Object.assign({}, info, { restantes: j.restantes, esperar: j.esperar });
      if (j && j.ok && j.ganhou > 0) {
        if (QC.libraryBalanceChanged) QC.libraryBalanceChanged(j.gems);
        if (QC.toast) QC.toast('💎 +' + j.ganhou + (j.ganhou === 1 ? ' gema. Obrigado!' : ' gemas. Obrigado!'));
        if (QC.announce) QC.announce('Você ganhou ' + j.ganhou + ' gemas.');
      } else if (j && j.error === 'limite') say('Os anúncios de hoje já foram vistos. Amanhã tem de novo.');
      else say('Não deu para registrar as gemas agora. Tente de novo mais tarde.');
      paint();
    });
  }
  function start() {
    if (busy || !info || btn.disabled) return;
    if (info.modo !== 'simulado' && !showAd) return;
    busy = true; btn.disabled = true;
    var fn = showAd;
    api('POST', '/ads/start').then(function (j) {
      if (!j || !j.ok) {
        busy = false;
        if (j && j.restantes != null) info = Object.assign({}, info, { restantes: j.restantes, esperar: j.esperar });
        say(j && j.error === 'limite' ? 'Os anúncios de hoje já foram vistos. Amanhã tem de novo.' : 'Não deu para abrir o anúncio agora. Tente mais tarde.');
        return paint();
      }
      nonce = j.nonce;
      if (info.modo === 'simulado') return simStart();
      showAd = null;
      try { fn(); } catch (e) { busy = false; nonce = ''; say('Não deu para abrir o anúncio agora. Tente mais tarde.'); }
    });
  }
  btn.addEventListener('click', start);

  function refresh() {
    if (!logged()) { info = null; return hide(); }
    api('GET', '/ads').then(function (j) {
      if (modal.hidden) return;
      info = j && j.ok ? j : null;
      paint();
      if (info && info.client) askGoogle();
    });
  }
  // Abrir a Loja = momento de olhar se há anúncio. Fechar a Loja não cancela um anúncio que já está na tela.
  new MutationObserver(function () { if (!modal.hidden) refresh(); }).observe(modal, { attributes: true, attributeFilter: ['hidden'] });
})();
