/* Idade mínima: 16 anos. Antes de QUALQUER coisa do jogo (inclusive entrar numa sala por link) aparece uma tela de idade NEUTRA: pede só o mês e o ano
 * de nascimento, sem dizer qual é o limite e sem sugerir resposta. O que a pessoa informa fica SÓ neste aparelho (nunca é enviado ao servidor).
 *  - 16 anos ou mais: segue para o jogo (e não pergunta de novo neste aparelho);
 *  - menos de 16: aparece o aviso "não indicado para menores de 16 anos", sem como corrigir a resposta (a idade guardada é reavaliada a cada abertura, então
 *    a pessoa passa a poder jogar quando fizer 16 anos). Se havia uma conta neste aparelho, ela é APAGADA no servidor (POST /api/acc/underage).
 * Como não sabemos o DIA do aniversário, vale a conta conservadora: só conta 16 anos depois que o mês do 16º aniversário terminou. */
(function (root) {
  'use strict';
  var KEY = 'qc.age.v1', MIN_YEARS = 16;
  function isInt(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n; }
  // 'ok' (16 anos completos), 'under' (menos de 16) ou 'invalid' (mês/ano que não existem, no futuro ou antes de 1900)
  function status(y, m, now) {
    y = Number(y); m = Number(m); now = now || new Date();
    if (!isInt(y) || !isInt(m) || m < 1 || m > 12 || y < 1900) return 'invalid';
    var ny = now.getFullYear(), nm = now.getMonth() + 1;
    if (y > ny || (y === ny && m > nm)) return 'invalid';
    return (ny - y) * 12 + (nm - m) > MIN_YEARS * 12 ? 'ok' : 'under';
  }
  var api = { KEY: KEY, MIN_YEARS: MIN_YEARS, status: status };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (!root || !root.document) return;

  var doc = root.document, modal = doc.getElementById('modal-age');
  var resolveReady, ready = new Promise(function (r) { resolveReady = r; }), passed = false;
  api.ready = ready;                      // o jogo só começa (sala, conta, tutorial) quando isto resolve; para menores de 16 nunca resolve
  api.isOk = function () { return passed; };
  root.QCIdade = api;
  if (!modal) { passed = true; resolveReady(); return; }

  var ask = doc.getElementById('age-ask'), no = doc.getElementById('age-no'), selM = doc.getElementById('age-m'), selY = doc.getElementById('age-y');
  var go = doc.getElementById('age-go'), err = doc.getElementById('age-err'), accNote = doc.getElementById('age-no-acc');
  var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  function lock(on) {                     // nada atrás da tela de idade recebe toque nem foco
    Array.prototype.forEach.call(doc.body.children, function (el) {
      if (el === modal || el.tagName === 'SCRIPT') return;
      if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert');
    });
  }
  function show(which) {
    modal.hidden = false; ask.hidden = which !== 'ask'; no.hidden = which !== 'no'; lock(true);
    try { (which === 'ask' ? selM : doc.getElementById('age-no-title')).focus({ preventScroll: true }); } catch (e) { /* ignora */ }
  }
  function pass() { passed = true; modal.hidden = true; lock(false); resolveReady(); }
  function readSaved() { try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); return s && typeof s === 'object' ? s : null; } catch (e) { return null; } }
  function save(y, m) { try { localStorage.setItem(KEY, JSON.stringify({ y: y, m: m })); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } }
  function token() { try { var t = JSON.parse(localStorage.getItem('qc.token') || '""'); return typeof t === 'string' ? t : ''; } catch (e) { return ''; } }

  function eraseAccountIfAny() {          // havia conta neste aparelho: a pessoa informou ter menos de 16 anos, então a conta é apagada
    var t = token(); if (!t) return;
    try {
      root.fetch('/api/acc/underage', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: '{}' })
        .then(function (r) { return r.json().catch(function () { return {}; }); })
        .then(function (j) {
          if (j && (j.ok === true || j.error === 'auth')) { try { localStorage.removeItem('qc.token'); } catch (e) { /* ignora */ } if (j.ok === true) accNote.hidden = false; }
        }).catch(function () { /* sem rede: tenta de novo na próxima abertura */ });
    } catch (e) { /* ignora */ }
  }

  var thisYear = new Date().getFullYear(), i;
  for (i = 0; i < 12; i++) { var o = doc.createElement('option'); o.value = String(i + 1); o.textContent = MESES[i]; selM.appendChild(o); }
  for (i = thisYear; i >= thisYear - 100; i--) { var p = doc.createElement('option'); p.value = String(i); p.textContent = String(i); selY.appendChild(p); }
  function sync() { go.disabled = !(selM.value && selY.value); err.hidden = true; }
  selM.addEventListener('change', sync); selY.addEventListener('change', sync);
  go.addEventListener('click', function () {
    var y = Number(selY.value), m = Number(selM.value), st = status(y, m);
    if (st === 'invalid') { err.textContent = 'Confira o mês e o ano.'; err.hidden = false; return; }
    save(y, m);
    if (st === 'ok') pass(); else { show('no'); eraseAccountIfAny(); }
  });

  var saved = readSaved(), st0 = saved ? status(saved.y, saved.m) : 'none';
  if (st0 === 'ok') { passed = true; resolveReady(); }
  else if (st0 === 'under') { show('no'); eraseAccountIfAny(); }
  else { if (saved) { try { localStorage.removeItem(KEY); } catch (e) { /* ignora */ } } show('ask'); }
})(typeof window !== 'undefined' ? window : null);
