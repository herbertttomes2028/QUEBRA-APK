/* "Meu pet": a janela para escolher a skin e a roupa do mascote (Ajustes > Meu pet).
 * Quem guarda a escolha, sabe o que é grátis e o que foi desbloqueado com gemas é a LOJA (loja.js, API QC.shopPet): aqui só se mostra e se pede.
 * Item que ainda não é seu aparece com cadeado; tocar nele abre a loja na categoria certa. O desenho do mascote está em mascot.js / mascot-looks.js. */
(function () {
  'use strict';
  var Looks = window.MascotLooks, M = window.Mascot, SP = window.QC && window.QC.shopPet, modal = document.getElementById('modal-pet'), open = document.getElementById('btn-pet');
  if (!open) return;
  if (!Looks || !M || !M.setLook || !SP || !modal) { open.hidden = true; return; }          // sem o mascote (ou sem a loja): nada para escolher
  var skinHost = document.getElementById('pet-skins'), outHost = document.getElementById('pet-outfits');
  function openModal() { if (window.QC.openModal) window.QC.openModal('#modal-pet', '.pet-opt[aria-checked="true"]'); else modal.hidden = false; }
  function closeModal() { if (window.QC.closeModal) window.QC.closeModal('#modal-pet'); else modal.hidden = true; }

  function option(host, kind, it, cur) {
    var b = document.createElement('button'), i = document.createElement('i'), on = (it.look || '') === cur;
    b.type = 'button'; b.className = 'pet-opt' + (it.usable ? '' : ' lock'); b.setAttribute('role', 'radio'); b.setAttribute('data-id', it.look || ''); b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1;
    b.setAttribute('aria-label', it.name + (it.usable ? '' : ', bloqueado: custa ' + it.price + ' gemas na loja'));
    if (kind === 'skin') { i.className = 'pet-sw'; i.style.background = it.swatch; } else { i.className = 'pet-em'; i.textContent = it.emoji; }
    i.setAttribute('aria-hidden', 'true'); b.appendChild(i); host.appendChild(b);
  }
  function build() {
    var st = SP.state(), none = { look: '', name: '', usable: true, price: 0 };
    skinHost.textContent = ''; outHost.textContent = '';
    option(skinHost, 'skin', { look: '', name: 'Azul clássico', swatch: '#3b6bff', usable: true, price: 0 }, st.sel.skin);
    st.skins.forEach(function (it) { var x = Looks.byId(Looks.SKINS, it.look); if (x) { it.swatch = x.swatch; option(skinHost, 'skin', it, st.sel.skin); } });
    option(outHost, 'outfit', { look: '', name: 'Sem roupa', emoji: '🚫', usable: true, price: 0 }, st.sel.outfit);
    st.outfits.forEach(function (it) { var x = Looks.byId(Looks.OUTFITS, it.look); if (x) { it.emoji = x.emoji; option(outHost, 'outfit', it, st.sel.outfit); } });
    var s = Looks.byId(Looks.SKINS, st.sel.skin), o = Looks.byId(Looks.OUTFITS, st.sel.outfit);
    document.getElementById('pet-skin-name').textContent = s ? s.name : 'Azul clássico'; document.getElementById('pet-outfit-name').textContent = o ? o.name : 'Sem roupa';
    var note = document.getElementById('pet-note'), off = !!(M.status && M.status().hidden);
    if (note) { note.hidden = !off; if (off) note.textContent = '⚠️ O mascote está escondido agora (Ajustes ou movimento reduzido). A escolha fica guardada e aparece quando ele voltar.'; }
  }
  function choose(host, kind, cat, btn) {
    var look = btn.getAttribute('data-id'), st = SP.state(), list = cat === 'skins' ? st.skins : st.outfits, it = look ? list.filter(function (x) { return x.look === look; })[0] : null;
    if (it && !it.usable) { closeModal(); if (window.QC.openShop) window.QC.openShop('loja', cat); return; }      // bloqueado: a loja é o lugar de desbloquear
    SP.pick(kind, look);
    if (M.react) M.react('nodSmall');                                              // um "gostei!" para mostrar a mudança (só se o mascote estiver à mostra)
  }
  [[skinHost, 'skin', 'skins'], [outHost, 'outfit', 'roupas']].forEach(function (h) {
    h[0].addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.pet-opt'); if (b) choose(h[0], h[1], h[2], b); });
    h[0].addEventListener('keydown', function (e) {                               // setas movem o foco e a escolha, como em qualquer grupo de opções
      var k = e.key; if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
      var all = Array.prototype.slice.call(h[0].querySelectorAll('.pet-opt')), i = all.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); var n = all[(i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : all.length - 1)) % all.length]; n.focus(); choose(h[0], h[1], h[2], n);
    });
  });
  open.addEventListener('click', function () {
    var close = document.getElementById('set-close'); if (close) close.click();                  // fecha os Ajustes (devolvendo o foco como sempre) e abre "Meu pet"
    build(); openModal();
  });
  document.getElementById('pet-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  SP.on(function (sel) { M.setLook(sel); if (!modal.hidden) { var f = document.activeElement, id = f && f.closest && f.closest('.pet-opts') ? f.parentNode.id : ''; build(); if (id) { var h = document.getElementById(id), c = h && h.querySelector('.pet-opt[aria-checked="true"]'); if (c) c.focus(); } } });
  SP.ready();                                                                       // relê a escolha guardada (agora que as aparências existem) e avisa o ouvinte acima
  var st0 = SP.state(); M.setLook(st0.sel); build();                                // a escolha guardada vale desde o começo
})();
