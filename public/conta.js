/*
 * ÁREA DO PERFIL do Quebra-cabeça a dois: perfil gerado pelo jogo, conquistas, "Continuar jogando" e histórico.
 * Não existe e-mail, senha nem lista de amigos: o perfil é um ID + um código-chave mostrado uma única vez.
 * Organização:
 *   1) Serviços  : api (fala com /api/acc), sessão (token neste aparelho), tempo real (Socket.IO)
 *   2) Telas     : criar perfil / entrar com o código, perfil, conquistas, partidas
 *   3) Integração: botão no canto da tela inicial e "Continuar jogando"
 * Depende só da pequena ponte window.QC (criada no fim do game.js). Se o servidor não tiver banco de dados,
 * nada disto aparece e o jogo funciona como sempre (visitante).
 */
(function () {
  'use strict';
  var QC = window.QC;
  if (!QC) return;
  var $ = QC.$, state = QC.state, socket = QC.socket, store = QC.store;

  var acc = { enabled: false, token: store.get('token', '') || '', me: null, tab: 'profile', view: 'profile', mode: 'up', newKey: null };
  // Dados pesados (conquistas e coleções) ficam separados do /me: são pedidos só quando o perfil ou a aba abre (rota /achievements).
  // O /me leve é pedido na volta ao início apenas se algo mudou (acc.dirty) ou passou do prazo: antes era a CADA volta.
  acc.ach = null; acc.achAt = 0; acc.achStale = true; acc.achBusy = null; acc.meAt = 0; acc.dirty = false;
  var ME_TTL_MS = 3 * 60 * 1000, ACH_TTL_MS = 5 * 60 * 1000;
  function meFresh() { return !!acc.me && !acc.dirty && Date.now() - acc.meAt < ME_TTL_MS; }
  function achData() { return acc.ach || (acc.me && acc.me.achievements ? acc.me : null); }       // (o /me completo, de um aplicativo antigo, também serve)
  function achFresh() { return !!acc.ach && !acc.achStale && Date.now() - acc.achAt < ACH_TTL_MS; }
  function storeAch(src) { acc.ach = { achievements: src.achievements, achSummary: src.achSummary, collections: src.collections, achMeta: src.achMeta }; acc.achAt = Date.now(); acc.achStale = false; }

  /* =========================================================
   * 1) SERVIÇOS
   * ========================================================= */
  var MSG = {
    consent: 'Marque a caixa de privacidade para criar o perfil.',
    age16: 'Este jogo não é indicado para menores de 16 anos. Marque a caixa se você tem 16 anos ou mais.',
    reason: 'Escolha o motivo da denúncia.',
    guest: 'Essa pessoa não tem perfil, então não dá para denunciar por aqui. Você pode sair da partida pelo menu.',
    no_peer: 'Não há ninguém na sala para denunciar.',
    rate: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    server: 'Algo deu errado no servidor. Tente de novo daqui a pouco.',
    offline: 'Sem internet no momento. Confira a conexão.',
    notfound: 'Não encontramos esse jogador.',
    confirm: 'Digite EXCLUIR, em letras maiúsculas, para confirmar.',
    bad_login: 'ID ou código-chave incorretos. Confira os dois e tente de novo.',
    id: 'O ID tem 8 letras e números, como ABCD-2XYZ.',
    secret: 'O código-chave tem 20 letras e números, como ABCDE-FGHJK-MNPQR-STUVW.',
    nosave: 'Não há partida salva para continuar.',
    imagegone: 'A imagem dessa partida não está mais disponível. Você pode descartar o progresso e começar outra.',
    auth: 'Entre no seu perfil para fazer isso.'
  };
  var errText = function (e) { return MSG[e] || MSG.server; };

  // quiet = pedido de segundo plano: uma recusa dele nunca desconecta a pessoa
  function api(method, path, body, quiet) {
    var sent = acc.token;                                   // o "crachá" usado NESTE pedido
    var opt = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (sent) opt.headers.Authorization = 'Bearer ' + sent;
    if (body !== undefined) opt.body = JSON.stringify(body);
    return fetch('/api/acc' + path, opt)
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: 'server' }; }); })
      .then(function (j) {
        // só conta como "sessão terminou" se o pedido foi feito COM crachá e esse crachá ainda é o atual
        // (uma resposta atrasada de um login antigo, ou de um pedido sem crachá, não pode derrubar o login novo)
        if (j && j.error === 'auth' && !quiet && sent && sent === acc.token) logoutLocal('Sua sessão terminou. Entre de novo.');
        return j;
      })
      .catch(function () { return { ok: false, error: 'offline' }; });
  }

  function initialOf(n) { n = String(n || '').trim(); return n ? n.charAt(0).toUpperCase() : '?'; }
  function faceOf(u) { return (u && u.avatar) || initialOf(u && u.name); }
  function fmtTime(ms) { var s = Math.round(ms / 1000), m = Math.floor(s / 60); return m + ':' + ('0' + (s % 60)).slice(-2); }
  function fmtDay(iso) {
    var d = new Date(iso), n = new Date(), days = Math.round((new Date(n.getFullYear(), n.getMonth(), n.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
    if (days <= 0) return 'hoje';
    if (days === 1) return 'ontem';
    return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
  }
  var KIND = { coop: 'Cooperativo', comum: 'Desafio comum', quebra: 'Quebrando Cabeças', solo: 'Sozinho' };
  var KIND_ICO = { coop: '🧩', comum: '🏁', quebra: '🎁', solo: '🧩' };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, cls, fn, label) { var b = el('button', 'btn ' + cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
  function show(id, on) { $(id).hidden = !on; }
  function say(id, msg) { var p = $(id); p.textContent = msg || ''; p.hidden = !msg; }

  /* ---------- sessão ---------- */
  function saveSession(token) { acc.token = token || ''; store.set('token', acc.token); }
  function logoutLocal(msg) {
    saveSession('');
    acc.me = null; acc.ach = null; acc.achStale = true; acc.achAt = 0; acc.meAt = 0; acc.dirty = false; acc.newKey = null;
    QC.setLevelAccount(null, 0);
    acc.mode = 'up';                                        // depois de sair, a tela volta para "Criar perfil"
    $('#auth-id').value = ''; $('#auth-secret').value = ''; $('#auth-consent').checked = false; $('#auth-age').checked = false; say('#auth-error', '');
    QC.canBlock = false; QC.setUnlocked(null);
    if (QC.onAccount) QC.onAccount(null);                   // a loja volta ao modo visitante
    try { socket.emit('acc:logout'); } catch (e) { /* ignora */ }
    paintChip(); paintContinue();
    if ($('#screen-me').classList.contains('active')) renderMe();
    if (msg) QC.toast(msg, 3200);
  }
  function applyAccount(me) {          // a conta passa a ser a fonte do nome e do avatar neste aparelho
    acc.me = me; if (me.achievements) storeAch(me);
    QC.setLevelAccount(me.code, me.xp && me.xp.level);
    QC.canBlock = true;
    if (QC.onAccount) QC.onAccount(me);                     // a loja carrega as bandejas e o saldo desta conta
    QC.setUnlocked(me.phrases);
    var key = 'seen.' + me.code, seen = store.get(key, null);        // frases que a pessoa já conhece: avisa quando liberar uma nova
    if (!seen) store.set(key, me.phrases);
    else {
      var fresh = me.phrases.filter(function (id) { return seen.indexOf(id) < 0; });
      if (fresh.length) {
        store.set(key, me.phrases);
        var ph = state.phrases.filter(function (x) { return x.id === fresh[0]; })[0];
        QC.toast('💬 Nova frase liberada: ' + (ph ? ph.text : '') + (fresh.length > 1 ? ' (+' + (fresh.length - 1) + ')' : ''), 4600);
        QC.playSound('chime');
      }
    }
    QC.applyProfile(me.name, me.avatar);
    paintChip(); paintContinue();
  }

  /* ---------- tempo real ---------- */
  function authSocket() {
    if (!acc.token) return;
    socket.emit('acc:auth', { token: acc.token }, function (res) { if (res && !res.ok && res.error === 'auth') logoutLocal(); });
  }
  socket.on('connect', authSocket);

  socket.on('acc:ev', function (ev) {
    if (!ev || !acc.me) return;
    acc.dirty = true; acc.achStale = true;                                              // partida ou compra: o /me e as conquistas podem ter mudado
    var screenMe = $('#screen-me').classList.contains('active');
    if (ev.t === 'xp') {
      acc.me.xp = { total: ev.total, level: ev.level, into: ev.into, need: ev.need, pct: ev.pct, max: ev.max };
      if (Number.isSafeInteger(ev.gemsBalance) && ev.gemsBalance >= 0) acc.me.gems = Math.max(Number(acc.me.gems || 0), ev.gemsBalance);
      paintChip(); if (screenMe) renderProfile();
      QC.onXp(ev);
    } else if (ev.t === 'blocks') {
      if (!$('#sec-blocked').hidden) loadBlocked();
    } else if (ev.t === 'deleted') {
      logoutLocal('Perfil apagado.');
    }
  });

  /* =========================================================
   * 2) TELAS
   * ========================================================= */
  /* ---------- botão do canto da tela inicial ---------- */
  function paintChip() {
    var chip = $('#btn-me');
    chip.hidden = !acc.enabled;
    var me = acc.me;
    chip.classList.toggle('has', !!me);
    $('#me-chip-face').textContent = me ? faceOf(me) : '👤';
    if (me) QC.nameLv($('#me-chip-text'), me.name.slice(0, 14), me.xp ? me.xp.level : 0); else $('#me-chip-text').textContent = 'Entrar';
    $('#me-chip-gems').hidden = !me;
    if (me) $('#me-chip-gems').textContent = '💎 ' + Number(me.gems || 0).toLocaleString('pt-BR');
    chip.setAttribute('aria-label', me ? 'Meu perfil: ' + me.name : 'Criar perfil ou entrar com o código-chave');
  }
  function paintContinue() {
    var s = acc.me && acc.me.save;
    var sub = s ? s.imageLabel + ' · ' + s.pieces + ' peças · ' + s.locked + ' encaixadas' : '';
    $('#btn-continue').hidden = !s;
    $('#cont-sub').textContent = sub;
    $('#me-save-card').hidden = !s;
    $('#me-save-sub').textContent = sub + (s && s.elapsedMs ? ' · ' + fmtTime(s.elapsedMs) : '');
  }
  function loadMe() {
    if (!acc.token) return Promise.resolve(null);
    return api('GET', '/me?lite=1').then(function (j) {
      if (j && j.ok) { acc.meAt = Date.now(); acc.dirty = false; applyAccount(j.me); if (socket.connected) authSocket(); if ($('#screen-me').classList.contains('active') && acc.view === 'profile') renderProfile(); }
      return j;
    });
  }
  // Conquistas e coleções: só pede ao servidor se ainda não tem, ou se algo mudou (partida, amigo, compra) ou passou do prazo.
  function loadAch(force) {
    if (!acc.token) return Promise.resolve(null);
    if (!force && achFresh()) return Promise.resolve(acc.ach);
    if (acc.achBusy) return acc.achBusy;
    var sent = acc.token;
    acc.achBusy = api('GET', '/achievements').then(function (j) {
      acc.achBusy = null;
      if (j && j.ok && sent === acc.token) { storeAch(j); repaintAch(); }
      return j;
    });
    return acc.achBusy;
  }
  function repaintAch() {                 // os dados chegaram: refaz só o que está na tela
    if (!$('#screen-me').classList.contains('active')) return;
    var d = achData(); if (!d) return;
    if (acc.tab === 'ach') renderAch(); else if (acc.tab === 'col') renderCol();
    updateAchBadge();
  }
  /* ---------- abrir/fechar a área ---------- */
  function openMe() {
    acc.view = 'profile';
    QC.showScreen('me');
    renderMe();
    if (acc.token && !meFresh()) loadMe();
  }
  function renderMe() {
    var logged = !!acc.me, nk = !!acc.newKey;
    show('#me-newkey', nk);
    show('#me-guest', !logged && !acc.token && !nk);
    show('#me-user', logged && !nk);
    show('#me-tabs', logged && !nk);                          // as abas (Perfil, Conquistas, Coleções, Partidas) só existem com perfil
    show('#me-head-title', false);
    if (nk) { paintNewKey(); return; }
    if (!logged) { if (!acc.token) renderGuest(); return; }
    setTab(acc.tab);
  }
  function setTab(t) {
    acc.tab = t;
    ['profile', 'ach', 'col', 'history'].forEach(function (n) { $('#tab-' + n).hidden = n !== t; });
    Array.prototype.forEach.call(document.querySelectorAll('.me-tab'), function (b) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    $('#me-scroll').scrollTop = 0;
    if (t === 'profile') renderProfile();
    if (t === 'history') loadHistory();
    if (t === 'ach') renderAch();
    if (t === 'col') renderCol();
    if (t === 'profile' || t === 'ach' || t === 'col') loadAch();                // em segundo plano; só pede se faltar ou estiver velho
  }
  Array.prototype.forEach.call(document.querySelectorAll('.me-tab'), function (b) { b.addEventListener('click', function () { setTab(b.dataset.tab); }); });
  $('#me-back').addEventListener('click', function () { QC.showScreen('home'); });
  $('#btn-me').addEventListener('click', function () { openMe(); });
  // O aviso de "conquista concluída" abre direto a aba Conquistas (só com perfil).
  QC.showAchievements = function () { if (!acc.token) return; acc.tab = 'ach'; openMe(); };

  /* ---------- criar perfil / entrar com o código-chave ---------- */
  function renderGuest() {
    setAuthMode(acc.mode);
  }
  function setAuthMode(m) {
    acc.mode = m;
    var up = m === 'up';
    $('#auth-tab-in').classList.toggle('on', !up); $('#auth-tab-up').classList.toggle('on', up);
    $('#auth-tab-in').setAttribute('aria-selected', String(!up)); $('#auth-tab-up').setAttribute('aria-selected', String(up));
    show('#auth-up-wrap', up); show('#auth-in-wrap', !up);
    $('#auth-go').textContent = up ? 'Criar meu perfil' : 'Entrar';
    say('#auth-error', '');
  }
  $('#auth-tab-in').addEventListener('click', function () { setAuthMode('in'); });
  $('#auth-tab-up').addEventListener('click', function () { setAuthMode('up'); });
  $('#auth-eye').addEventListener('click', function () {
    var p = $('#auth-secret'), on = p.type === 'password';
    p.type = on ? 'text' : 'password';
    $('#auth-eye').setAttribute('aria-label', on ? 'Esconder o código-chave' : 'Mostrar o código-chave');
  });
  $('#me-visitor').addEventListener('click', function () { QC.showScreen('home'); });
  // ID e código-chave: só letras e números, em maiúsculas, com o traço no lugar certo (a digitação e a colagem ficam iguais)
  function groupText(v, size, max) {
    v = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, max);
    var out = []; for (var i = 0; i < v.length; i += size) out.push(v.slice(i, i + size)); return out.join('-');
  }
  $('#auth-id').addEventListener('input', function (e) { e.target.value = groupText(e.target.value, 4, 8); say('#auth-error', ''); });
  $('#auth-secret').addEventListener('input', function (e) { e.target.value = groupText(e.target.value, 5, 20); say('#auth-error', ''); });
  $('#me-del-secret').addEventListener('input', function (e) { e.target.value = groupText(e.target.value, 5, 20); say('#me-del-error', ''); });

  // Mostra o ID e o código-chave UMA vez (perfil novo ou código trocado). O código só existe aqui: o servidor guarda apenas o resumo (hash).
  function showNewKey(id, secret, why) {
    acc.newKey = { id: id, secret: secret, why: why || 'new' };
    $('#nk-saved').checked = false; $('#nk-done').disabled = true;
    renderMe();
  }
  function paintNewKey() {
    var k = acc.newKey; if (!k) return;
    $('#nk-id').textContent = k.id; $('#nk-secret').textContent = k.secret;
    $('#nk-done').textContent = k.why === 'rotate' ? 'Pronto, já anotei' : 'Começar a jogar';
    $('#me-scroll').scrollTop = 0;
  }
  $('#nk-saved').addEventListener('change', function () { $('#nk-done').disabled = !this.checked; });
  $('#nk-copy').addEventListener('click', function () {
    var k = acc.newKey; if (k) copyText('ID: ' + k.id + '\nCódigo-chave: ' + k.secret, 'ID e código copiados!');
  });
  $('#nk-done').addEventListener('click', function () {
    if (!acc.newKey || $('#nk-done').disabled) return;
    acc.newKey = null; $('#nk-secret').textContent = '----'; $('#nk-id').textContent = '----';      // o código sai da tela e da memória
    acc.tab = 'profile'; renderMe();
  });

  function afterAuth(j, welcome) {
    saveSession(j.token);
    applyAccount(j.me);
    $('#auth-secret').value = ''; $('#auth-id').value = '';
    authSocket();
    QC.toast(welcome + ', ' + j.me.name + '! 🎉', 2800);
    QC.playSound('chime');
    acc.view = 'profile'; acc.tab = 'profile';
    renderMe();
  }
  $('#auth-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var up = acc.mode === 'up', go = $('#auth-go');
    var body;
    if (up) {
      body = { consent: $('#auth-consent').checked, age16: $('#auth-age').checked, avatar: state.avatar, bests: state.bests };
      if (!body.consent) { say('#auth-error', errText('consent')); return; }
      if (!body.age16) { say('#auth-error', errText('age16')); return; }
    } else {
      body = { id: $('#auth-id').value, secret: $('#auth-secret').value };
      if (body.id.replace(/-/g, '').length !== 8) { say('#auth-error', errText('id')); return; }
      if (body.secret.replace(/-/g, '').length !== 20) { say('#auth-error', errText('secret')); return; }
    }
    go.disabled = true; say('#auth-error', '');
    api('POST', up ? '/profile/new' : '/profile/login', body).then(function (j) {
      go.disabled = false;
      if (!j || !j.ok) { say('#auth-error', errText(j && j.error)); QC.vibrate(30); return; }
      afterAuth(j, up ? 'Perfil criado! Bem-vindo(a)' : 'Que bom te ver de novo');
      if (up) showNewKey(j.id, j.secret, 'new');
      else if (Object.keys(state.bests || {}).length) api('POST', '/import', { bests: state.bests }, true);   // leva os melhores tempos do modo visitante
    });
  });

  /* ---------- perfil ---------- */
  function renderProfile() {
    var me = acc.me; if (!me) return;
    $('#me-avatar-face').textContent = faceOf(me);
    $('#me-name').textContent = me.name;
    $('#me-code').textContent = me.code;
    paintXpCard(me.xp);
    $('#me-gems').hidden = false;
    $('#me-gems-amount').textContent = Number(me.gems || 0).toLocaleString('pt-BR');
    var st = me.stats;
    paintStats($('#me-stats'), [['Partidas', st.games, 'c1'], ['Vitórias', st.wins, 'c2'], ['Derrotas', st.losses, 'c3'], ['Concluídos', st.completed, 'c4']]);
    updateAchBadge();
    paintContinue();
  }
  // Mantém os quatro cartões existentes: uma atualização do servidor só troca os números,
  // sem apagar/recriar elementos (o que causava repetições visuais na tela).
  function paintStats(box, rows) {
    rows.forEach(function (x, i) {
      var card = box.children[i];
      if (!card || !card.classList.contains('me-stat')) {
        card = el('div', 'me-stat ' + x[2]);
        card.appendChild(el('b')); card.appendChild(el('span'));
        box.appendChild(card);
      }
      card.className = 'me-stat ' + x[2];
      var value = String(x[1]);
      if (card.firstChild.textContent !== value) card.firstChild.textContent = value;
      if (card.lastChild.textContent !== x[0]) card.lastChild.textContent = x[0];
    });
    while (box.children.length > rows.length) box.lastElementChild.remove();
  }
  // selo ao lado do rótulo do nome + barra de progresso até o próximo nível
  function paintXpCard(xp) {
    var lvEl = $('#me-lv'), card = $('#me-xp');
    lvEl.textContent = '';
    if (!xp) { lvEl.hidden = true; card.hidden = true; return; }
    var t = QC.lvTag(xp.level); if (t) { lvEl.appendChild(t); lvEl.hidden = false; }
    card.hidden = false;
    var big = $('#xp-lv'); big.textContent = ''; var tb = QC.lvTag(xp.level, true); if (tb) big.appendChild(tb);
    var bar = card.querySelector('.xp-bar'); bar.className = 'xp-bar t' + (xp.level >= 50 ? 5 : xp.level >= 30 ? 4 : xp.level >= 20 ? 3 : xp.level >= 10 ? 2 : 1);
    bar.setAttribute('aria-valuenow', xp.max ? 100 : xp.pct);
    $('#xp-fill').style.width = (xp.max ? 100 : xp.pct) + '%';
    $('#xp-txt').textContent = xp.max ? xp.total.toLocaleString('pt-BR') + ' XP' : xp.into.toLocaleString('pt-BR') + ' / ' + xp.need.toLocaleString('pt-BR') + ' XP';
    $('#xp-next').textContent = xp.max ? 'Nível máximo! 🏆' : 'Faltam ' + (xp.need - xp.into).toLocaleString('pt-BR') + ' XP para o nível ' + (xp.level + 1);
  }
  /* ---------- conquistas e coleções ---------- */
  // Tudo o que o servidor decide (o que é conquista, o XP, a privacidade) vem pronto; aqui só desenhamos.
  var TIER_NAME = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante' };
  var TIER_ICON = { bronze: '🥉', prata: '🥈', ouro: '🥇', diamante: '💎' };
  var TIER_ORDER = ['diamante', 'ouro', 'prata', 'bronze'];
  var ACH_FIRST_BATCH = 4, ACH_BATCH = 10;        // cartões desenhados na hora (cabem na 1ª tela, abaixo do resumo) e a cada quadro depois
  function fmtMs(ms) { var s = Math.round(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : ''); }
  // "NOVA": o que foi ganho depois da última vez que você abriu a aba. Na primeira vez neste aparelho só fixamos a base (nada vira "NOVA" de uma vez).
  function achSeenKey() { return 'achSeen.' + (acc.me ? acc.me.code : ''); }
  function achNewIds(list) {
    var seen = store.get(achSeenKey(), null), done = list.filter(function (a) { return a.done; }).map(function (a) { return a.id; });
    if (seen === null) { store.set(achSeenKey(), done); return []; }
    return done.filter(function (id) { return seen.indexOf(id) < 0; });
  }
  function achMarkSeen(list) { store.set(achSeenKey(), list.filter(function (a) { return a.done; }).map(function (a) { return a.id; })); }
  function updateAchBadge() {
    var b = $('#me-tab-ach-badge'); if (!b) return;
    var d = achData(), n = d ? achNewIds(d.achievements).length : 0;
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); b.setAttribute('aria-label', n + (n === 1 ? ' conquista nova' : ' conquistas novas'));
  }
  function achProgress(a) {                       // só o dono vê (o servidor nunca manda progresso nem tempos ao perfil de amigo)
    if (a.done || a.secret) return '';
    if (a.lower) return a.now == null ? 'Ainda sem tempo registrado' : 'Seu melhor: ' + fmtMs(a.now);
    return a.goal > 1 ? a.now + ' de ' + a.goal : '';
  }
  function achCard(a, isNew, compact) {
    var d = el('article', 'ach-card t-' + a.tier + (a.done ? ' done' : ' todo') + (a.secret && !a.done ? ' secret' : '') + (isNew ? ' fresh' : '') + (compact ? ' compact' : ''));
    var pr = achProgress(a);
    d.setAttribute('aria-label', a.title + ', ' + TIER_NAME[a.tier] + (a.done ? ', concluída' : ', ainda não concluída. ' + a.desc + (pr ? '. ' + pr : '')) + (isNew ? ', nova' : ''));
    var ico = el('i', 'ach-ico', a.icon); ico.setAttribute('aria-hidden', 'true'); d.appendChild(ico);
    var body = el('div', 'ach-body'); body.appendChild(el('b', 'ach-title', a.title)); body.appendChild(el('small', 'ach-desc', a.desc));
    var meta = el('span', 'ach-meta');
    meta.appendChild(el('span', 'ach-tier t-' + a.tier, TIER_ICON[a.tier] + ' ' + TIER_NAME[a.tier]));
    if (a.done) meta.appendChild(el('span', 'ach-done-tag', '✓ Concluída'));
    meta.appendChild(el('span', 'ach-xp', '+' + a.xp + ' XP'));
    if (isNew) meta.appendChild(el('span', 'ach-new', 'NOVA'));
    body.appendChild(meta);
    if (pr) {
      if (!a.lower && a.goal > 1) { var bar = el('span', 'ach-bar'), fill = el('i'); fill.style.width = Math.round(100 * a.now / a.goal) + '%'; bar.appendChild(fill); bar.setAttribute('aria-hidden', 'true'); body.appendChild(bar); }
      body.appendChild(el('span', 'ach-prog', pr));
    }
    d.appendChild(body);
    return d;
  }
  function renderAch() {
    var me = achData();
    if (!me) { $('#ach-summary').textContent = ''; $('#ach-filters').textContent = ''; $('#ach-groups').textContent = ''; $('#ach-list').textContent = ''; acc.achSig = ''; $('#ach-summary').appendChild(el('p', 'ach-empty', 'Carregando suas conquistas…')); return; }
    var list = me.achievements, meta = me.achMeta || { groups: [] }, s = me.achSummary;
    var fresh = achNewIds(list), isFresh = {}; fresh.forEach(function (id) { isFresh[id] = true; });
    var box = $('#ach-summary'); box.textContent = '';
    var big = el('div', 'ach-big'); big.appendChild(el('b', '', String(s.done))); big.appendChild(el('span', '', ' de ' + s.total + ' concluídas')); box.appendChild(big);
    var bar = el('span', 'ach-bar ach-bar-lg'), fill = el('i'); fill.style.width = Math.round(100 * s.done / Math.max(1, s.total)) + '%'; bar.appendChild(fill); bar.setAttribute('aria-hidden', 'true'); box.appendChild(bar);
    var tiers = el('div', 'ach-tiers');
    TIER_ORDER.slice().reverse().forEach(function (t) { var x = s.tiers[t], c = el('span', 'ach-tier t-' + t, TIER_ICON[t] + ' ' + x.done + '/' + x.total); c.setAttribute('aria-label', TIER_NAME[t] + ': ' + x.done + ' de ' + x.total); tiers.appendChild(c); });
    box.appendChild(tiers);
    box.appendChild(el('p', 'ach-xp-line', 'XP das conquistas: ' + s.xpDone.toLocaleString('pt-BR') + ' de ' + s.xpTotal.toLocaleString('pt-BR')));
    var filter = acc.achFilter || 'all', group = acc.achGroup || 'all';
    function chip(host, text, on, fn, label) { var b = el('button', 'ach-chip' + (on ? ' on' : ''), text); b.type = 'button'; b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); host.appendChild(b); }
    var fbox = $('#ach-filters'); fbox.textContent = '';
    [['all', 'Todas'], ['done', 'Concluídas'], ['todo', 'Faltam']].forEach(function (f) { chip(fbox, f[1], filter === f[0], function () { acc.achFilter = f[0]; renderAch(); }); });
    var gbox = $('#ach-groups'); gbox.textContent = '';
    chip(gbox, 'Todos os grupos', group === 'all', function () { acc.achGroup = 'all'; renderAch(); });
    meta.groups.forEach(function (g) {
      var rows = list.filter(function (a) { return a.g === g.id; }), dn = rows.filter(function (a) { return a.done; }).length;
      if (!rows.length) return;
      chip(gbox, g.icon + ' ' + g.title + ' ' + dn + '/' + rows.length, group === g.id, function () { acc.achGroup = g.id; renderAch(); }, g.title + ': ' + dn + ' de ' + rows.length);
    });
    var out = $('#ach-list');
    // Os cartões são montados em LOTES: a primeira tela sai na hora e o resto entra nos quadros seguintes (tocar na aba nunca trava o aparelho).
    var plan = [], shown = 0;
    // As novas vão para o topo (ninguém rola 120 cartões atrás delas); depois de vistas, voltam ao lugar normal.
    var onTop = fresh.length > 0 && group === 'all' && filter !== 'todo';
    if (onTop) {
      plan.push(function () { var nh = el('h4', 'ach-sec ach-sec-new'); nh.appendChild(el('span', '', '✨ Novas conquistas!')); nh.appendChild(el('small', '', fresh.length + (fresh.length === 1 ? ' nova' : ' novas'))); return nh; });
      list.filter(function (a) { return isFresh[a.id]; }).forEach(function (a) { plan.push(function () { return achCard(a, true, false); }); shown++; });
    }
    meta.groups.forEach(function (g) {
      if (group !== 'all' && group !== g.id) return;
      var rows = list.filter(function (a) { return a.g === g.id; });
      var vis = rows.filter(function (a) { return (filter === 'all' || (filter === 'done' ? a.done : !a.done)) && !(onTop && isFresh[a.id]); });
      if (!vis.length) return;
      plan.push(function () {
        var h = el('h4', 'ach-sec'); h.appendChild(el('span', '', g.icon + ' ' + g.title));
        h.appendChild(el('small', '', rows.filter(function (a) { return a.done; }).length + ' de ' + rows.length)); return h;
      });
      if (g.blurb) plan.push(function () { return el('p', 'ach-blurb', g.blurb); });
      vis.forEach(function (a) { plan.push(function () { return achCard(a, !!isFresh[a.id], false); }); shown++; });
    });
    if (!shown) plan.push(function () { return el('p', 'ach-empty', filter === 'done' ? 'Nenhuma conquista concluída nesta lista ainda. Bora jogar! 🧩' : 'Você concluiu tudo desta lista! 🎉'); });
    // Nada mudou desde o último desenho (mesmos números, filtro e grupo)? Não refaz os 120 cartões.
    var sig = [s.done, s.xpDone, list.reduce(function (n, a) { return n + (a.now || 0); }, 0), filter, group, fresh.join(',')].join('|');
    if (out.childElementCount && acc.achSig === sig) { achMarkSeen(list); updateAchBadge(); return; }
    acc.achSig = sig; out.textContent = '';
    var token = acc.achToken = (acc.achToken || 0) + 1, next = 0;
    function lote(n) { var frag = document.createDocumentFragment(); for (var k = 0; k < n && next < plan.length; k++, next++) frag.appendChild(plan[next]()); out.appendChild(frag); }
    lote(ACH_FIRST_BATCH);
    (function resto() { if (next >= plan.length) return; requestAnimationFrame(function () { if (token !== acc.achToken) return; lote(ACH_BATCH); resto(); }); })();
    achMarkSeen(list); updateAchBadge();
  }
  // Uma área para cada categoria: progresso da coleção e as conquistas dela.
  function colCard(c, all) {
    var pct = c.total ? Math.round(100 * c.done / c.total) : 0;
    var d = el('article', 'col-card' + (c.open ? '' : ' locked') + (c.last ? ' full' : '')); d.setAttribute('data-cat', c.id);
    var head = el('div', 'col-head'), ring = el('div', 'col-ring');
    ring.style.setProperty('--p', String(pct)); ring.setAttribute('role', 'img'); ring.setAttribute('aria-label', c.done + ' de ' + c.total + ' imagens concluídas');
    ring.appendChild(el('i', 'col-icon', c.icon)); head.appendChild(ring);
    var t = el('div', 'col-title'); t.appendChild(el('b', '', c.name)); t.appendChild(el('small', '', c.subtitle)); head.appendChild(t); d.appendChild(head);
    var state = c.last ? '👑 Coleção completa!' :
      !c.open && c.unlock === 'gems' ? '💎 ' + c.price + ' gemas para desbloquear' :
      !c.open ? '🔒 Conclua as primeiras de ' + c.needs + ' para abrir' :
      c.done + ' de ' + c.total + ' imagens · ' + pct + '%';
    d.appendChild(el('p', 'col-state', state));
    var mine = (all || []).filter(function (a) { return a.cat === c.id; });
    if (mine.length) {
      d.appendChild(el('h5', 'col-sub', 'Conquistas da coleção ' + c.ach.done + '/' + c.ach.total));
      mine.forEach(function (a) { d.appendChild(achCard(a, false, true)); });
    }
    return d;
  }
  function renderCol() {
    var me = achData(), box = $('#col-list');
    if (!me) { box.textContent = ''; $('#col-count').textContent = 'Carregando…'; return; }
    var cols = me.collections || []; box.textContent = '';
    var tot = 0, dn = 0, open = 0;
    cols.forEach(function (c) { tot += c.total; dn += c.done; if (c.open) open++; });
    $('#col-count').textContent = open + ' de ' + cols.length + ' abertas · ' + dn + ' de ' + tot + ' imagens';
    cols.forEach(function (c) { box.appendChild(colCard(c, me.achievements)); });
  }
  function renderAvatarChoices() {
    var g = $('#me-avatar-grid');
    g.textContent = '';
    function add(face, val, label) {
      var b = el('button', '', face); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label);
      b.setAttribute('aria-checked', (acc.me.avatar || '') === val ? 'true' : 'false');
      b.addEventListener('click', function () { saveAvatar(val); });
      g.appendChild(b);
    }
    add(initialOf(acc.me.name), '', 'Usar a inicial do meu nome');
    state.avatars.forEach(function (e) { add(e, e, 'Avatar ' + e); });
  }
  function saveAvatar(avatar) {
    api('POST', '/profile', { avatar: avatar }).then(function (j) {
      if (!j || !j.ok) { QC.toast(errText(j && j.error), 2600); return; }
      applyAccount(j.me); renderProfile(); renderAvatarChoices();
      QC.toast('Avatar atualizado ✓', 1800);
    });
  }
  $('#me-avatar').addEventListener('click', function () { var box = $('#me-avatars'); box.hidden = !box.hidden; if (!box.hidden) renderAvatarChoices(); });
  $('#me-name-new').addEventListener('click', function () {            // o apelido é sorteado pelo jogo: ninguém digita nome
    var b = this; b.disabled = true;
    api('POST', '/profile/nickname', {}).then(function (j) {
      b.disabled = false;
      if (!j || !j.ok) { QC.toast(errText(j && j.error), 2600); return; }
      acc.me.name = j.me.name; applyAccount(acc.me); renderProfile();
      QC.toast('Seu apelido agora é ' + j.me.name + ' ✓', 2400);
    });
  });

  /* ---------- segurança: código-chave novo, sair de todos os aparelhos, bloqueados ---------- */
  $('#sec-newkey').addEventListener('click', function () {
    QC.confirm({ title: 'Gerar um código-chave novo?', text: 'O código antigo deixa de valer e os outros aparelhos saem do perfil. Você vai ver o código novo uma única vez.', ok: 'Gerar código novo', danger: true }).then(function (ok) {
      if (!ok) return;
      api('POST', '/profile/new-secret', {}).then(function (j) {
        if (!j || !j.ok) { QC.toast(errText(j && j.error), 3000); return; }
        showNewKey(acc.me.code, j.secret, 'rotate');
      });
    });
  });
  $('#sec-logout-all').addEventListener('click', function () {
    QC.confirm({ title: 'Sair em todos os aparelhos?', text: 'Você será desconectado(a) deste e de todos os outros aparelhos.', ok: 'Sair em todos', danger: true }).then(function (ok) {
      if (!ok) return;
      api('POST', '/logout-all', {}).then(function () { logoutLocal('Você saiu em todos os aparelhos.'); QC.showScreen('home'); });
    });
  });
  function loadBlocked() {
    return api('GET', '/blocks').then(function (j) {
      var box = $('#sec-blocked'); box.textContent = '';
      var list = (j && j.ok) ? j.blocked : [];
      $('#sec-blocked-n').textContent = list.length ? '(' + list.length + ')' : '';
      if (!list.length) box.appendChild(el('p', 'me-small', 'Você não bloqueou ninguém.'));
      list.forEach(function (u) {
        var r = row(u, 'bloqueado(a)', undefined, 'bare'), b = el('div', 'fr-btns');
        b.appendChild(btn('Desbloquear', 'btn-secondary me-mini', function () {
          api('POST', '/blocks/remove', { code: u.code }).then(function (x) { if (x && x.ok) { QC.toast(u.name + ' foi desbloqueado(a).', 2400); loadBlocked(); } });
        }));
        r.appendChild(b); box.appendChild(r);
      });
    });
  }
  $('#sec-blocked-open').addEventListener('click', function () { var b = $('#sec-blocked'); b.hidden = !b.hidden; if (!b.hidden) loadBlocked(); });
  /* ----- denunciar (apelido, avatar ou comportamento): só quem cuida do jogo lê; a outra pessoa não é avisada ----- */
  var rpCtx = null;
  function openReport(opts) {                    // opts: { name, send(payload) -> Promise<{ok, error, blocked}>, after(res) }
    rpCtx = opts;
    $('#rp-title').textContent = 'Denunciar ' + (opts.name || 'jogador');
    Array.prototype.forEach.call(document.querySelectorAll('input[name="rp-reason"]'), function (i) { i.checked = false; });
    $('#rp-note').value = ''; $('#rp-block').checked = false; say('#rp-error', ''); $('#rp-send').disabled = false;
    QC.openModal('#modal-report', '#rp-cancel');
  }
  $('#rp-cancel').addEventListener('click', function () { QC.closeModal('#modal-report'); rpCtx = null; });          // (data-back só serve ao botão voltar do Android: cada Cancelar fecha a sua janela)
  $('#rp-send').addEventListener('click', function () {
    var sel = document.querySelector('input[name="rp-reason"]:checked'), ctx = rpCtx, btn = this;
    if (!ctx) return;
    if (!sel) { say('#rp-error', MSG.reason); return; }
    btn.disabled = true; say('#rp-error', '');
    ctx.send({ reason: sel.value, note: $('#rp-note').value, alsoBlock: $('#rp-block').checked }).then(function (res) {
      btn.disabled = false;
      if (res && res.ok) { QC.closeModal('#modal-report'); QC.toast('Denúncia enviada. Obrigado por ajudar a manter o jogo legal.', 3600); if (ctx.after) ctx.after(res); }
      else say('#rp-error', errText(res && res.error));
    });
  });
  QC.reportPerson = openReport;                  // o menu da sala (game.js) usa a mesma janela
  function copyText(t, ok) {
    function done() { QC.toast(ok, 1800); QC.vibrate(10); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { QC.toast('Não consegui copiar. Anote: ' + t, 7000); });
    else QC.toast('Não consegui copiar. Anote: ' + t, 7000);
  }
  $('#me-copy').addEventListener('click', function () { copyText(acc.me.code, 'ID copiado!'); });
  $('#me-logout').addEventListener('click', function () {
    QC.confirm({ title: 'Sair deste aparelho?', text: 'Seu progresso continua guardado no perfil. Para voltar você vai precisar do ID e do código-chave.', ok: 'Sair' }).then(function (ok) {
      if (!ok) return;
      api('POST', '/logout', {}).then(function () { logoutLocal('Você saiu do perfil. Até logo! 👋'); QC.showScreen('home'); });
    });
  });
  $('#me-delete').addEventListener('submit', function (e) { e.preventDefault(); $('#me-delete-go').click(); });
  $('#me-delete-open').addEventListener('click', function () { var d = $('#me-delete'); d.hidden = !d.hidden; });
  $('#me-delete-go').addEventListener('click', function () {
    var b = $('#me-delete-go'), secret = $('#me-del-secret').value;
    if (secret.replace(/-/g, '').length !== 20) { say('#me-del-error', errText('secret')); return; }
    b.disabled = true; say('#me-del-error', '');
    api('POST', '/delete', { confirm: $('#me-del-word').value.trim(), secret: secret }).then(function (j) {
      b.disabled = false;
      if (!j || !j.ok) { say('#me-del-error', j && j.error === 'bad_login' ? 'Código-chave incorreto.' : errText(j && j.error)); return; }
      $('#me-del-word').value = ''; $('#me-del-secret').value = ''; $('#me-delete').hidden = true;
      logoutLocal('Seu perfil foi apagado.'); QC.showScreen('home');
    });
  });

  /* ---------- continuar jogando ---------- */
  function continueSaved() {
    if (!acc.me || !acc.me.save) return;
    QC.setLoading(true, 'Retomando sua partida…');
    socket.emit('acc:continue', { pid: state.pid, name: state.name, avatar: state.avatar }, function (res) {
      if (!res || !res.ok) {
        QC.setLoading(false);
        QC.toast(errText(res && res.error), 4200);
        if (res && res.error === 'nosave') { acc.me.save = null; paintContinue(); }
        if (res && res.error === 'imagegone') QC.confirm({ title: 'Imagem indisponível', text: 'A imagem dessa partida não está mais disponível. Descartar o progresso salvo?', ok: 'Descartar', danger: true }).then(function (ok) { if (ok) api('POST', '/save/discard', {}).then(loadMe); });
        return;
      }
      QC.enterRoom(res);
    });
  }
  $('#btn-continue').addEventListener('click', continueSaved);
  $('#me-save-card').addEventListener('click', continueSaved);

  /* ---------- linhas da lista de bloqueados ---------- */
  function avatarBox(u, online) {
    var a = el('span', 'fr-av', faceOf(u));
    if (online !== undefined) a.appendChild(el('i', 'fr-dot'));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function row(u, sub, online, cls) {
    var r = el('div', 'fr-row' + (online ? ' on' : '') + (cls ? ' ' + cls : ''));
    r.appendChild(avatarBox(u, online));
    var i = el('div', 'fr-info'); var nb = el('b'); QC.nameLv(nb, u.name, u.level); i.appendChild(nb); i.appendChild(el('small', '', sub)); r.appendChild(i);
    return r;
  }

  /* ---------- partidas ---------- */
  function loadHistory() {
    var box = $('#hist-list');
    box.textContent = '';
    box.appendChild(el('p', 'me-small', 'Carregando…'));
    api('GET', '/matches').then(function (j) {
      box.textContent = '';
      if (!j || !j.ok) { box.appendChild(el('p', 'me-small', errText(j && j.error))); return; }
      if (!j.matches.length) {
        var empty = el('div', 'fr-empty'); empty.appendChild(el('span', '', '🧩')); empty.appendChild(el('p', '', 'Suas partidas vão aparecer aqui. Que tal montar um quebra-cabeça?'));
        box.appendChild(empty); return;
      }
      j.matches.forEach(function (m, i) {
        var r = el('div', 'fr-row hi-row'); r.style.animationDelay = Math.min(i, 8) * 40 + 'ms';
        r.appendChild(el('span', 'fr-av', KIND_ICO[m.mode] || '🧩'));
        var info = el('div', 'fr-info');
        info.appendChild(el('b', '', m.imageLabel + ' · ' + m.pieces + ' peças'));
        info.appendChild(el('small', '', (KIND[m.mode] || 'Partida') + (m.opponent ? ' com ' + m.opponent : '') + (m.durationMs ? ' · ' + fmtTime(m.durationMs) : '') + ' · ' + fmtDay(m.at)));
        r.appendChild(info);
        r.appendChild(el('span', 'hi-pill ' + m.result, { win: 'Vitória', loss: 'Derrota', done: 'Concluído' }[m.result]));
        box.appendChild(r);
      });
    });
  }

  QC.api = api;                                  // a loja usa a mesma chamada (com o crachá da sessão)
  QC.account = function () { return acc.me; };   // a loja pergunta quem está logado (caso a conta carregue antes dela)
  QC.libraryBalanceChanged = function (gems) {
    if (!acc.me || !Number.isSafeInteger(gems) || gems < 0) return;
    acc.me.gems = gems; paintChip(); acc.achStale = true;                                // comprar categoria conta para as conquistas
    if ($('#screen-me').classList.contains('active')) renderProfile();
  };
  QC.onScreen = function (name) {
    if (name === 'home') { if (acc.me && !meFresh()) loadMe(); }
    else if (name !== 'me') acc.dirty = true;                       // jogou ou mexeu em algo: a próxima volta ao início atualiza (uma consulta leve)
  };

  /* ---------- botão voltar do Android ---------- */
  QC.nav.add(function () {                                   // o código-chave novo só sai da tela pelo botão "Continuar" (depois de anotar)
    if (!$('#screen-me').classList.contains('active') || !acc.newKey) return false;
    QC.toast('Anote o ID e o código-chave e marque a caixa para continuar.', 3200);
    return true;
  });

  /* =========================================================
   * 3) INÍCIO
   * ========================================================= */
  QC.ready.then(function () {
    if (!state.accounts) return;                  // servidor sem banco: nada muda para ninguém
    acc.enabled = true;
    paintChip();
    if (acc.token) loadMe();
    if (socket.connected) authSocket();
  });
})();
