/*
 * ÁREA DE CONTA do Quebra-cabeça a dois: perfil, amigos, convites, "Continuar jogando" e histórico.
 * Organização:
 *   1) Serviços  : api (fala com /api/acc), sessão (token neste aparelho), tempo real (Socket.IO)
 *   2) Telas     : entrar/criar conta, perfil, amigos, partidas, convites
 *   3) Integração: botão no canto da tela inicial, "Continuar jogando" e convites ao criar uma sala
 * Depende só da pequena ponte window.QC (criada no fim do game.js). Se o servidor não tiver banco de dados,
 * nada disto aparece e o jogo funciona como sempre (visitante).
 */
(function () {
  'use strict';
  var QC = window.QC;
  if (!QC) return;
  var $ = QC.$, state = QC.state, socket = QC.socket, store = QC.store;

  var acc = { enabled: false, google: null, token: store.get('token', '') || '', me: null, friends: null, tab: 'profile', view: 'profile', after: null, mode: 'in', pending: null, sent: {}, inv: null, invTimer: null, googleReady: false };

  /* =========================================================
   * 1) SERVIÇOS
   * ========================================================= */
  var MSG = {
    email: 'Confira o e-mail: ele precisa ter o formato nome@exemplo.com.',
    password: 'A senha precisa ter pelo menos 8 caracteres.',
    consent: 'Marque a caixa de privacidade para criar a conta.',
    email_taken: 'Já existe uma conta com este e-mail. Toque em "Entrar".',
    bad_login: 'E-mail ou senha incorretos. Confira se o e-mail está igual ao do cadastro e toque no olho 👁 para ver a senha que está digitando.',
    rate: 'Muitas tentativas. Espere alguns minutos e tente de novo.',
    server: 'Algo deu errado no servidor. Tente de novo daqui a pouco.',
    offline: 'Sem internet no momento. Confira a conexão.',
    notfound: 'Não encontramos ninguém com esse código.',
    code: 'Esse código não parece certo. Ele tem 8 letras e números, como ABCD-2XYZ.',
    self: 'Esse é o seu próprio código. Compartilhe-o com um amigo!',
    already_friends: 'Vocês já são amigos.',
    already_sent: 'Você já enviou um pedido para essa pessoa.',
    too_many: 'Você tem pedidos demais esperando resposta.',
    name: 'Escolha um nome de jogador.',
    confirm: 'Digite EXCLUIR, em letras maiúsculas, para confirmar.',
    google_token: 'Não consegui confirmar sua conta Google. Tente de novo.',
    not_friends: 'Só dá para convidar quem já é seu amigo.',
    no_room: 'Crie ou entre numa sala antes de convidar.',
    room_full: 'A sala já está cheia.',
    expired: 'O convite expirou.',
    gone: 'Essa sala não existe mais.',
    declined: 'O convite foi recusado.',
    nosave: 'Não há partida salva para continuar.',
    imagegone: 'A imagem dessa partida não está mais disponível. Você pode descartar o progresso e começar outra.',
    auth: 'Entre na sua conta para fazer isso.'
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
  var KIND = { coop: 'Cooperativo', comum: 'Desafio comum', quebra: 'Quebrando Cabeças' };
  var KIND_ICO = { coop: '🧩', comum: '🏁', quebra: '🎁' };
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function btn(text, cls, fn, label) { var b = el('button', 'btn ' + cls, text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
  function show(id, on) { $(id).hidden = !on; }
  function say(id, msg) { var p = $(id); p.textContent = msg || ''; p.hidden = !msg; }

  /* ---------- sessão ---------- */
  function saveSession(token) { acc.token = token || ''; store.set('token', acc.token); }
  function logoutLocal(msg) {
    saveSession('');
    acc.me = null; acc.friends = null; acc.pending = null;
    acc.mode = 'in';                                        // depois de sair, o formulário volta a ser "Entrar" (não "Criar conta")
    $('#auth-pass').value = ''; $('#auth-consent').checked = false; say('#auth-error', '');
    acc.mode = 'in';                         // depois de sair, a tela volta para "Entrar" (e não "Criar conta")
    try { socket.emit('acc:logout'); } catch (e) { /* ignora */ }
    paintChip(); paintContinue();
    if ($('#screen-me').classList.contains('active')) renderMe();
    if (msg) QC.toast(msg, 3200);
  }
  function applyAccount(me) {          // a conta passa a ser a fonte do nome e do avatar neste aparelho
    acc.me = me;
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
    var screenMe = $('#screen-me').classList.contains('active');
    if (ev.t === 'req') {
      QC.toast('👋 ' + ev.from.name + ' quer ser seu amigo!', 3200); QC.playSound('chime'); QC.vibrate(18);
      loadFriends();
    } else if (ev.t === 'friend') {
      QC.toast('🤝 ' + ev.from.name + ' agora é seu amigo!', 3200); QC.playSound('chime');
      loadFriends();
    } else if (ev.t === 'unfriend' || ev.t === 'presence') {
      if (ev.t === 'presence' && !screenMe) return;
      loadFriends();
    } else if (ev.t === 'inv') {
      loadFriends();
      if (state.inGame || state.duel) QC.toast('📨 ' + ev.invite.from.name + ' te convidou para jogar! Veja em Meu espaço.', 3600);
      else showInvite(ev.invite);
      QC.playSound('chime'); QC.vibrate([30, 40, 30]);
    } else if (ev.t === 'inv-up') {
      var who = acc.sent[ev.id];
      if (who) {
        if (ev.status === 'accepted') QC.toast('🎉 ' + who + ' aceitou o convite!', 3000);
        else if (ev.status === 'declined') QC.toast(who + ' agora não pode jogar.', 3000);
        else if (ev.status === 'expired') QC.toast('O convite para ' + who + ' expirou.', 3000);
        delete acc.sent[ev.id];
      }
      if (acc.inv && acc.inv.id === ev.id && ev.status === 'expired') { closeInvite(); QC.toast('O convite expirou.', 2400); }
      loadFriends();
    } else if (ev.t === 'deleted') {
      logoutLocal('Conta excluída.');
    }
  });

  /* =========================================================
   * 2) TELAS
   * ========================================================= */
  /* ---------- botão do canto da tela inicial ---------- */
  function badgeCount() {
    var f = acc.friends;
    if (f) return f.incoming.length + f.invites.length;
    return acc.me ? acc.me.pending.requests + acc.me.pending.invites : 0;
  }
  function paintChip() {
    var chip = $('#btn-me');
    chip.hidden = !acc.enabled;
    var me = acc.me;
    chip.classList.toggle('has', !!me);
    $('#me-chip-face').textContent = me ? faceOf(me) : '👤';
    $('#me-chip-text').textContent = me ? me.name.slice(0, 8) : 'Entrar';
    var n = badgeCount();
    $('#link-friends').hidden = !acc.enabled;
    $('#friends-badge').hidden = !(me && n > 0);
    $('#friends-badge').textContent = n;
    $('#link-friends').setAttribute('aria-label', 'Amigos' + (me && n ? ', ' + n + ' novidades' : ''));
    chip.setAttribute('aria-label', me ? 'Meu perfil: ' + me.name : 'Entrar na conta');
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
    return api('GET', '/me').then(function (j) {
      if (j && j.ok) { applyAccount(j.me); if (socket.connected) authSocket(); if ($('#screen-me').classList.contains('active')) renderProfile(); }
      return j;
    });
  }
  function loadFriends() {
    if (!acc.token) return Promise.resolve();
    return api('GET', '/friends').then(function (j) {
      if (j && j.ok) { acc.friends = j; paintChip(); if ($('#screen-me').classList.contains('active') && acc.view === 'friends') renderFriends(); }
    });
  }

  /* ---------- abrir/fechar a área ---------- */
  function openMe(view) {
    acc.view = view === 'friends' ? 'friends' : 'profile';
    QC.showScreen('me');
    QC.playSound('blip');
    renderMe();
    if (acc.token) { loadMe(); loadFriends(); }
  }
  // botão "Amigos" da tela inicial: com conta abre a lista; sem conta pede para entrar e depois leva à lista
  function openFriends() {
    acc.after = acc.token ? null : 'friends';
    openMe('friends');
  }
  function renderMe() {
    var logged = !!acc.me;
    show('#me-guest', !logged && !acc.token);
    show('#me-user', logged);
    var friendsView = acc.view === 'friends';
    show('#me-tabs', logged && !friendsView);                 // as abas (Perfil, Partidas) só existem na visão do perfil
    show('#me-head-title', friendsView);
    if (!logged) { if (!acc.token) renderGuest(); return; }
    setTab(friendsView ? 'friends' : (acc.tab === 'friends' ? 'profile' : acc.tab));
  }
  function setTab(t) {
    acc.tab = t;
    ['profile', 'friends', 'history'].forEach(function (n) { $('#tab-' + n).hidden = n !== t; });
    Array.prototype.forEach.call(document.querySelectorAll('.me-tab'), function (b) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
    $('#me-scroll').scrollTop = 0;
    if (t === 'profile') renderProfile();
    if (t === 'friends') { renderFriends(); loadFriends(); }
    if (t === 'history') loadHistory();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.me-tab'), function (b) { b.addEventListener('click', function () { QC.playSound('blip'); setTab(b.dataset.tab); }); });
  $('#me-back').addEventListener('click', function () { acc.after = null; QC.showScreen('home'); });
  $('#btn-me').addEventListener('click', function () { openMe('profile'); });
  $('#link-friends').addEventListener('click', openFriends);

  /* ---------- entrar / criar conta ---------- */
  function renderGuest() {
    var h = $('#me-guest .me-hero');
    h.querySelector('h2').textContent = acc.after === 'friends' ? 'Entre para ver seus amigos' : 'Guarde seu progresso';
    h.querySelector('p').textContent = acc.after === 'friends' ? 'Com uma conta você acha amigos pelo código, recebe convites e joga junto com eles.' : 'Com uma conta você continua partidas, junta amigos e vê suas conquistas, em qualquer celular.';
    setAuthMode(acc.mode);
    if (!$('#auth-name').value) $('#auth-name').value = state.name || '';
    setupGoogle();
  }
  function setAuthMode(m) {
    acc.mode = m;
    var up = m === 'up';
    $('#auth-tab-in').classList.toggle('on', !up); $('#auth-tab-up').classList.toggle('on', up);
    $('#auth-tab-in').setAttribute('aria-selected', String(!up)); $('#auth-tab-up').setAttribute('aria-selected', String(up));
    show('#auth-name-wrap', up); show('#auth-consent-wrap', up);
    $('#auth-pass').autocomplete = up ? 'new-password' : 'current-password';
    $('#auth-go').textContent = up ? 'Criar minha conta' : 'Entrar';
    say('#auth-error', '');
  }
  $('#auth-tab-in').addEventListener('click', function () { setAuthMode('in'); });
  $('#auth-tab-up').addEventListener('click', function () { setAuthMode('up'); });
  $('#auth-eye').addEventListener('click', function () {
    var p = $('#auth-pass'), on = p.type === 'password';
    p.type = on ? 'text' : 'password';
    $('#auth-eye').setAttribute('aria-label', on ? 'Esconder a senha' : 'Mostrar a senha');
  });
  $('#me-visitor').addEventListener('click', function () { acc.after = null; QC.showScreen('home'); });

  function afterAuth(j, welcome) {
    saveSession(j.token);
    applyAccount(j.me);
    acc.friends = null;
    $('#auth-pass').value = '';
    authSocket();
    loadFriends();
    QC.toast(welcome + ', ' + j.me.name + '! 🎉', 2800);
    QC.playSound('chime');
    if (acc.after === 'friends') { acc.view = 'friends'; acc.after = null; } else { acc.view = 'profile'; acc.tab = 'profile'; }
    renderMe();
  }
  $('#auth-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var up = acc.mode === 'up', go = $('#auth-go');
    var body = { email: $('#auth-email').value, password: $('#auth-pass').value };
    if (!body.email.trim() || !body.password) { say('#auth-error', 'Preencha o e-mail e a senha.'); return; }
    if (up) { body.name = $('#auth-name').value.trim() || state.name; body.avatar = state.avatar; body.consent = $('#auth-consent').checked; body.bests = state.bests; }
    go.disabled = true; say('#auth-error', '');
    api('POST', up ? '/register' : '/login', body).then(function (j) {
      go.disabled = false;
      if (!j || !j.ok) {
        if (up && j && j.error === 'email_taken') { setAuthMode('in'); say('#auth-error', 'Você já tem conta com este e-mail. Digite sua senha e toque em Entrar.'); QC.vibrate(30); return; }
        say('#auth-error', errText(j && j.error)); QC.vibrate(30); return;
      }
      afterAuth(j, up ? 'Conta criada! Bem-vindo(a)' : 'Que bom te ver de novo');
      if (!up && Object.keys(state.bests || {}).length) api('POST', '/import', { bests: state.bests }, true);   // leva os melhores tempos do modo visitante (já com o login guardado)
    });
  });

  /* ---------- Google (só aparece se o servidor tiver o GOOGLE_CLIENT_ID) ---------- */
  function setupGoogle() {
    if (!acc.google) return;
    function ready() {
      try {
        window.google.accounts.id.initialize({ client_id: acc.google, callback: onGoogle, auto_select: false });
        window.google.accounts.id.renderButton($('#google-btn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 260, locale: 'pt-BR' });
        show('#google-box', true);
        acc.googleReady = true;
      } catch (e) { show('#google-box', false); }
    }
    if (window.google && window.google.accounts) { if (!acc.googleReady) ready(); return; }
    if (document.getElementById('gsi-script')) return;
    var s = document.createElement('script');
    s.id = 'gsi-script'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = ready; s.onerror = function () { show('#google-box', false); };
    document.head.appendChild(s);
  }
  function onGoogle(resp) {
    api('POST', '/google', { credential: resp.credential, consent: $('#auth-consent').checked, name: state.name, avatar: state.avatar, bests: state.bests }).then(function (j) {
      if (!j || !j.ok) {
        if (j && j.error === 'consent') { setAuthMode('up'); say('#auth-error', 'Primeira vez aqui? Marque a caixa de privacidade e toque no botão do Google de novo.'); }
        else say('#auth-error', errText(j && j.error));
        return;
      }
      afterAuth(j, 'Bem-vindo(a)');
    });
  }

  /* ---------- perfil ---------- */
  function renderProfile() {
    var me = acc.me; if (!me) return;
    $('#me-avatar-face').textContent = faceOf(me);
    if (document.activeElement !== $('#me-name')) $('#me-name').value = me.name;
    $('#me-code').textContent = me.code;
    $('#me-email').textContent = me.email || '(conta Google)';
    show('#me-del-pass', me.hasPassword);
    var st = me.stats, stats = $('#me-stats');
    stats.innerHTML = '';
    [['Partidas', st.games, 'c1'], ['Vitórias', st.wins, 'c2'], ['Derrotas', st.losses, 'c3'], ['Concluídos', st.completed, 'c4']].forEach(function (x, i) {
      var c = el('div', 'me-stat ' + x[2]); c.style.animationDelay = (i * 60) + 'ms';
      c.appendChild(el('b', '', String(x[1]))); c.appendChild(el('span', '', x[0])); stats.appendChild(c);
    });
    var ach = $('#me-ach'), done = 0;
    ach.innerHTML = '';
    me.achievements.forEach(function (a) {
      if (a.done) done++;
      var d = el('div', 'me-a' + (a.done ? '' : ' lock'));
      d.setAttribute('aria-label', a.title + (a.done ? ' (conquistada)' : ' (bloqueada): ' + a.desc));
      d.appendChild(el('i', '', a.icon));
      var t = el('span'); t.appendChild(el('b', '', a.title)); t.appendChild(el('small', '', a.desc)); d.appendChild(t);
      ach.appendChild(d);
    });
    $('#me-ach-count').textContent = done + ' de ' + me.achievements.length;
    paintContinue();
  }
  function renderAvatarChoices() {
    var g = $('#me-avatar-grid');
    g.innerHTML = '';
    function add(face, val, label) {
      var b = el('button', '', face); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', label);
      b.setAttribute('aria-checked', (acc.me.avatar || '') === val ? 'true' : 'false');
      b.addEventListener('click', function () { saveProfile(acc.me.name, val); });
      g.appendChild(b);
    }
    add(initialOf(acc.me.name), '', 'Usar a inicial do meu nome');
    state.avatars.forEach(function (e) { add(e, e, 'Avatar ' + e); });
  }
  function saveProfile(name, avatar) {
    api('POST', '/profile', { name: name, avatar: avatar }).then(function (j) {
      if (!j || !j.ok) { QC.toast(errText(j && j.error), 2600); return; }
      applyAccount(j.me); renderProfile(); renderAvatarChoices();
      QC.playSound('blip'); QC.toast('Perfil atualizado ✓', 1800);
    });
  }
  $('#me-avatar').addEventListener('click', function () { var box = $('#me-avatars'); box.hidden = !box.hidden; if (!box.hidden) renderAvatarChoices(); });
  $('#me-name-save').addEventListener('click', function () { saveProfile($('#me-name').value.replace(/\s+/g, ' ').trim().slice(0, 12), acc.me.avatar); });
  $('#me-name').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#me-name-save').click(); });

  function copyText(t, ok) {
    function done() { QC.toast(ok, 1800); QC.vibrate(10); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { window.prompt('Copie o código:', t); });
    else window.prompt('Copie o código:', t);
  }
  $('#me-copy').addEventListener('click', function () { copyText(acc.me.code, 'Código copiado!'); });
  $('#me-share').addEventListener('click', function () {
    var text = 'Vem jogar quebra-cabeça comigo! Meu código de amigo no Quebra-cabeça a dois é ' + acc.me.code + '.';
    if (navigator.share) navigator.share({ title: 'Quebra-cabeça a dois', text: text, url: location.origin }).catch(function () { /* cancelou */ });
    else copyText(text, 'Convite copiado!');
  });
  $('#me-logout').addEventListener('click', function () {
    if (!window.confirm('Sair da conta neste aparelho? Seu progresso continua guardado na conta.')) return;
    api('POST', '/logout', {}).then(function () { logoutLocal('Você saiu da conta. Até logo! 👋'); QC.showScreen('home'); });
  });
  $('#me-delete').addEventListener('submit', function (e) { e.preventDefault(); $('#me-delete-go').click(); });
  $('#me-delete-open').addEventListener('click', function () { var d = $('#me-delete'); d.hidden = !d.hidden; });
  $('#me-delete-go').addEventListener('click', function () {
    var b = $('#me-delete-go'); b.disabled = true; say('#me-del-error', '');
    api('POST', '/delete', { confirm: $('#me-del-word').value.trim(), password: $('#me-del-pass').value }).then(function (j) {
      b.disabled = false;
      if (!j || !j.ok) { say('#me-del-error', j && j.error === 'bad_login' ? 'Senha incorreta.' : errText(j && j.error)); return; }
      $('#me-del-word').value = ''; $('#me-del-pass').value = ''; $('#me-delete').hidden = true;
      logoutLocal('Sua conta foi excluída.'); QC.showScreen('home');
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
        if (res && res.error === 'imagegone' && window.confirm('A imagem dessa partida não está mais disponível. Descartar o progresso salvo?')) api('POST', '/save/discard', {}).then(loadMe);
        return;
      }
      QC.enterRoom(res);
    });
  }
  $('#btn-continue').addEventListener('click', continueSaved);
  $('#me-save-card').addEventListener('click', continueSaved);

  /* ---------- amigos ---------- */
  function avatarBox(u, online) {
    var a = el('span', 'fr-av', faceOf(u));
    if (online !== undefined) a.appendChild(el('i', 'fr-dot'));
    a.setAttribute('aria-hidden', 'true');
    return a;
  }
  function row(u, sub, online, cls) {
    var r = el('div', 'fr-row' + (online ? ' on' : '') + (cls ? ' ' + cls : ''));
    r.appendChild(avatarBox(u, online));
    var i = el('div', 'fr-info'); i.appendChild(el('b', '', u.name)); i.appendChild(el('small', '', sub)); r.appendChild(i);
    return r;
  }
  function renderFriends() {
    var f = acc.friends;
    var inv = $('#fr-invites'), req = $('#fr-requests'), list = $('#fr-list'), sent = $('#fr-sent');
    [inv, req, list, sent].forEach(function (x) { x.innerHTML = ''; });
    if (!f) { list.appendChild(el('p', 'me-small', 'Carregando…')); return; }
    if (f.invites.length) {
      var box = el('div', 'fr-box hot'); box.appendChild(el('h3', 'me-h', '📨 Convites para jogar'));
      f.invites.forEach(function (i) {
        var r = row(i.from, KIND[i.kind] + ' · ' + i.imageLabel + ' · ' + i.pieces + ' peças', undefined, 'bare');
        var b = el('div', 'fr-btns');
        b.appendChild(btn('Aceitar', 'btn-primary me-mini', function () { respondInvite(i, true); }));
        b.appendChild(btn('✕', 'btn-secondary me-mini', function () { respondInvite(i, false); }, 'Recusar convite de ' + i.from.name));
        r.appendChild(b); box.appendChild(r);
      });
      inv.appendChild(box);
    }
    if (f.incoming.length) {
      var rb = el('div', 'fr-box'); rb.appendChild(el('h3', 'me-h', '👋 Pedidos de amizade'));
      f.incoming.forEach(function (u) {
        var r = row(u, 'quer ser seu amigo', undefined, 'bare');
        var b = el('div', 'fr-btns');
        b.appendChild(btn('Aceitar', 'btn-primary me-mini', function () { respondFriend(u, true); }));
        b.appendChild(btn('Recusar', 'btn-secondary me-mini', function () { respondFriend(u, false); }));
        r.appendChild(b); rb.appendChild(r);
      });
      req.appendChild(rb);
    }
    $('#fr-count').textContent = f.friends.length ? f.friends.filter(function (x) { return x.online; }).length + ' online · ' + f.friends.length + ' no total' : '';
    if (!f.friends.length) {
      var empty = el('div', 'fr-empty'); empty.appendChild(el('span', '', '🤝')); empty.appendChild(el('p', '', 'Ainda sem amigos. Peça o código de alguém ou compartilhe o seu: ele fica no seu perfil (botão com o seu nome, no canto da tela inicial).'));
      list.appendChild(empty);
    }
    f.friends.forEach(function (u) {
      var r = row(u, u.online ? 'online agora' : 'offline', u.online);
      var b = el('div', 'fr-btns');
      b.appendChild(btn('Desafiar', 'btn-primary me-mini', function () { openChallenge(u); }, 'Desafiar ' + u.name));
      b.appendChild(btn('⋯', 'btn-ghost me-mini', function () {
        if (window.confirm('Remover ' + u.name + ' dos seus amigos?')) api('POST', '/friends/remove', { code: u.code }).then(function (j) { if (j && j.ok) { QC.toast(u.name + ' foi removido(a).', 2200); loadFriends(); } });
      }, 'Remover ' + u.name));
      r.appendChild(b); list.appendChild(r);
    });
    if (f.outgoing.length) {
      sent.appendChild(el('h3', 'me-h', 'Pedidos enviados'));
      f.outgoing.forEach(function (u) { sent.appendChild(row(u, 'aguardando resposta…')); });
    }
  }
  function respondFriend(u, ok) {
    api('POST', '/friends/respond', { code: u.code, accept: ok }).then(function (j) {
      if (!j || !j.ok) { QC.toast(errText(j && j.error), 2400); return; }
      QC.toast(ok ? '🤝 Você e ' + u.name + ' agora são amigos!' : 'Pedido recusado.', 2400);
      if (ok) QC.playSound('chime');
      loadFriends(); loadMe();
    });
  }
  $('#fr-code').addEventListener('input', function (e) {
    var v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    e.target.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
    say('#fr-error', ''); show('#fr-found', false);
  });
  $('#fr-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#fr-search').click(); });
  $('#fr-search').addEventListener('click', function () {
    var code = $('#fr-code').value;
    if (code.replace('-', '').length !== 8) { say('#fr-error', errText('code')); return; }
    say('#fr-error', ''); show('#fr-found', false);
    api('POST', '/friends/search', { code: code }).then(function (j) {
      if (!j || !j.ok) { say('#fr-error', errText(j && j.error)); return; }
      var box = $('#fr-found'), u = j.user;
      box.innerHTML = '';
      box.appendChild(avatarBox(u));
      var i = el('div', 'fr-info'); i.appendChild(el('b', '', u.name)); i.appendChild(el('small', '', u.code)); box.appendChild(i);
      var act = el('div', 'fr-btns');
      if (j.relation === 'none') act.appendChild(btn('Pedir amizade', 'btn-primary me-mini', function () {
        api('POST', '/friends/request', { code: u.code }).then(function (r) {
          if (!r || !r.ok) { say('#fr-error', errText(r && r.error)); return; }
          QC.toast(r.state === 'accepted' ? '🤝 Vocês agora são amigos!' : 'Pedido enviado para ' + u.name + ' ✉️', 2600);
          $('#fr-code').value = ''; show('#fr-found', false); loadFriends(); loadMe();
        });
      }));
      else if (j.relation === 'pending_in') act.appendChild(btn('Aceitar', 'btn-primary me-mini', function () { respondFriend(u, true); show('#fr-found', false); }));
      else act.appendChild(el('small', 'fr-tag', { friend: 'Já é seu amigo ✓', pending_out: 'Pedido enviado', self: 'Esse é você 🙂' }[j.relation] || ''));
      box.appendChild(act);
      show('#fr-found', true);
    });
  });

  /* ---------- partidas ---------- */
  function loadHistory() {
    var box = $('#hist-list');
    box.innerHTML = '';
    box.appendChild(el('p', 'me-small', 'Carregando…'));
    api('GET', '/matches').then(function (j) {
      box.innerHTML = '';
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
        info.appendChild(el('small', '', KIND[m.mode] + (m.opponent ? ' com ' + m.opponent : '') + (m.durationMs ? ' · ' + fmtTime(m.durationMs) : '') + ' · ' + fmtDay(m.at)));
        r.appendChild(info);
        r.appendChild(el('span', 'hi-pill ' + m.result, { win: 'Vitória', loss: 'Derrota', done: 'Concluído' }[m.result]));
        box.appendChild(r);
      });
    });
  }

  /* ---------- convites: enviar ---------- */
  var challengeFriend = null;
  function openChallenge(u) {
    challengeFriend = u;
    $('#chal-title').textContent = 'Desafiar ' + u.name;
    QC.openModal('#modal-challenge', '.chal-opt');
  }
  Array.prototype.forEach.call(document.querySelectorAll('.chal-opt'), function (b) {
    b.addEventListener('click', function () {
      var u = challengeFriend, kind = b.dataset.kind;
      QC.closeModal('#modal-challenge');
      if (!u) return;
      acc.pending = { to: u, kind: kind };
      QC.goLabel = 'Criar e convidar ' + u.name;
      if (kind === 'coop') QC.openPick('create'); else QC.openPick('duel', kind);
    });
  });
  $('#chal-cancel').addEventListener('click', function () { QC.closeModal('#modal-challenge'); });
  // chamado pelo jogo logo que a sala é criada: manda o convite pendente (se houver)
  QC.afterEnter = function () {
    var p = acc.pending;
    QC.goLabel = null;
    if (!p || !acc.me) return;
    acc.pending = null;
    socket.emit('inv:send', { to: p.to.code }, function (res) {
      if (res && res.ok) { acc.sent[res.id] = p.to.name; QC.toast('✉️ Convite enviado para ' + p.to.name + '. Aguardando…', 3600); }
      else QC.toast('Sala criada, mas não deu para convidar: ' + errText(res && res.error), 4200);
    });
  };
  QC.onScreen = function (name) {
    if (name === 'home') { acc.pending = null; QC.goLabel = null; if (acc.me) loadMe(); }
  };

  /* ---------- convites: receber ---------- */
  function showInvite(inv) {
    acc.inv = inv;
    $('#inv-face').textContent = faceOf(inv.from);
    $('#inv-title').textContent = inv.from.name + ' te chamou para jogar!';
    $('#inv-text').textContent = KIND[inv.kind] + (inv.kind === 'coop' ? '' : ' (Sala Desafio)');
    $('#inv-meta').textContent = inv.imageLabel + ' · ' + inv.pieces + ' peças';
    var ms = Math.max(1000, new Date(inv.expiresAt).getTime() - Date.now());
    var fill = $('#inv-bar-fill');
    fill.style.animation = 'none'; void fill.offsetWidth;
    fill.style.animation = 'rm-run ' + ms + 'ms linear forwards';
    clearTimeout(acc.invTimer);
    acc.invTimer = setTimeout(function () { if (acc.inv && acc.inv.id === inv.id) { closeInvite(); QC.toast('O convite expirou.', 2200); } }, ms + 300);
    QC.openModal('#modal-invite', '#inv-yes');
  }
  function closeInvite() { clearTimeout(acc.invTimer); acc.inv = null; QC.closeModal('#modal-invite'); }
  function respondInvite(inv, ok) {
    socket.emit('inv:respond', { id: inv.id, accept: ok }, function (res) {
      if (acc.inv && acc.inv.id === inv.id) closeInvite();
      if (!res || !res.ok) { QC.toast(errText(res && res.error), 3200); loadFriends(); return; }
      loadFriends();
      if (!ok) return;
      QC.showScreen('home');
      QC.join(res.room);
    });
  }
  $('#inv-yes').addEventListener('click', function () { if (acc.inv) respondInvite(acc.inv, true); });
  $('#inv-no').addEventListener('click', function () { if (acc.inv) respondInvite(acc.inv, false); });

  /* =========================================================
   * 3) INÍCIO
   * ========================================================= */
  QC.ready.then(function () {
    if (!state.accounts) return;                  // servidor sem banco: nada muda para ninguém
    acc.enabled = true;
    acc.google = state.accounts.google || null;
    paintChip();
    if (acc.token) loadMe().then(function (j) { if (j && j.ok) loadFriends(); });
    if (socket.connected) authSocket();
  });
})();
