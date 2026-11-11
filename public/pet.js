/* "Meu pet": a janela para escolher a skin e a roupa do mascote (Ajustes > Meu pet) e a memória dessa escolha.
 * A escolha vale na hora, fica guardada SÓ neste aparelho (localStorage, chave qc.pet) e nunca é enviada a ninguém. O desenho do mascote está em mascot.js / mascot-looks.js. */
(function () {
  'use strict';
  var Looks = window.MascotLooks, M = window.Mascot, modal = document.getElementById('modal-pet'), open = document.getElementById('btn-pet');
  if (!open) return;
  if (!Looks || !M || !M.setLook || !modal) { open.hidden = true; return; }               // sem o mascote (ou sem WebGL no aparelho que bloqueou o script): nada para escolher
  var KEY = 'qc.pet', sel = { skin: '', outfit: '' };
  function load() { try { var raw = localStorage.getItem(KEY); return Looks.sanitize(raw ? JSON.parse(raw) : {}); } catch (e) { return { skin: '', outfit: '' }; } }
  function save() { try { if (sel.skin || sel.outfit) localStorage.setItem(KEY, JSON.stringify(sel)); else localStorage.removeItem(KEY); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } }
  function openModal() { if (window.QC && window.QC.openModal) window.QC.openModal('#modal-pet', '.pet-opt[aria-checked="true"]'); else modal.hidden = false; }
  function closeModal() { if (window.QC && window.QC.closeModal) window.QC.closeModal('#modal-pet'); else modal.hidden = true; }
  var skinHost = document.getElementById('pet-skins'), outHost = document.getElementById('pet-outfits');

  function radios(host, list, none, mk) {
    host.textContent = '';
    [none].concat(list).forEach(function (it) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'pet-opt'; b.setAttribute('role', 'radio'); b.setAttribute('data-id', it.id); b.setAttribute('aria-label', it.name); b.appendChild(mk(it)); host.appendChild(b);
    });
  }
  function mark(host, cur) { Array.prototype.forEach.call(host.querySelectorAll('.pet-opt'), function (b) { var on = b.getAttribute('data-id') === cur; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; }); }
  function paint() {
    mark(skinHost, sel.skin); mark(outHost, sel.outfit);
    var s = Looks.byId(Looks.SKINS, sel.skin), o = Looks.byId(Looks.OUTFITS, sel.outfit);
    document.getElementById('pet-skin-name').textContent = s ? s.name : 'Azul clássico'; document.getElementById('pet-outfit-name').textContent = o ? o.name : 'Sem roupa';
    var note = document.getElementById('pet-note'), off = !!(M.status && M.status().hidden);
    if (note) { note.hidden = !off; if (off) note.textContent = '⚠️ O mascote está escondido agora (Ajustes ou movimento reduzido). A escolha fica guardada e aparece quando ele voltar.'; }
  }
  function pick(kind, id) {
    var next = { skin: sel.skin, outfit: sel.outfit }; next[kind] = id; sel = Looks.sanitize(next);
    M.setLook(sel); save(); paint();
    if (M.react) M.react('nodSmall');                                              // um "gostei!" para mostrar a mudança (só se o mascote estiver à mostra)
  }
  radios(skinHost, Looks.SKINS, { id: '', name: 'Azul clássico', swatch: '#3b6bff' }, function (it) { var i = document.createElement('i'); i.className = 'pet-sw'; i.style.background = it.swatch; i.setAttribute('aria-hidden', 'true'); return i; });
  radios(outHost, Looks.OUTFITS, { id: '', name: 'Sem roupa', emoji: '🚫' }, function (it) { var i = document.createElement('i'); i.className = 'pet-em'; i.textContent = it.emoji; i.setAttribute('aria-hidden', 'true'); return i; });
  [[skinHost, 'skin'], [outHost, 'outfit']].forEach(function (h) {
    h[0].addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.pet-opt'); if (b) pick(h[1], b.getAttribute('data-id')); });
    h[0].addEventListener('keydown', function (e) {                               // setas movem a escolha, como em qualquer grupo de opções
      var k = e.key; if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
      var all = Array.prototype.slice.call(h[0].querySelectorAll('.pet-opt')), i = all.indexOf(document.activeElement); if (i < 0) return;
      e.preventDefault(); var n = all[(i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : all.length - 1)) % all.length]; n.focus(); pick(h[1], n.getAttribute('data-id'));
    });
  });
  open.addEventListener('click', function () {
    var close = document.getElementById('set-close'); if (close) close.click();                  // fecha os Ajustes (devolvendo o foco como sempre) e abre "Meu pet"
    paint(); openModal();
  });
  document.getElementById('pet-close').addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });

  sel = load(); M.setLook(sel); paint();                                           // a escolha guardada vale desde o começo
})();
