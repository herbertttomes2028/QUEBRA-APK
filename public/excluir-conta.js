/* Página pública de exclusão: envia ID do perfil + código-chave para /api/acc/profile/erase (sem sessão). */
(function () {
  'use strict';
  var f = document.getElementById('apagar'), msg = document.getElementById('msg'), go = document.getElementById('go');
  function say(t, cls) { msg.textContent = t; msg.className = cls || ''; }
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (document.getElementById('pconf').value.trim().toUpperCase() !== 'EXCLUIR') { say('Digite EXCLUIR para confirmar.', 'err'); return; }
    go.disabled = true; say('Apagando…');
    fetch('/api/acc/profile/erase', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, cache: 'no-store',
      body: JSON.stringify({ id: document.getElementById('pid').value, secret: document.getElementById('psecret').value, confirm: 'EXCLUIR' })
    }).then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (o) {
        go.disabled = false;
        if (o.j && o.j.ok) { f.reset(); say('Pronto: o perfil e os dados ligados a ele foram apagados.', 'ok'); return; }
        if (o.s === 429) { say('Muitas tentativas. Espere alguns minutos e tente de novo.', 'err'); return; }
        if (o.s === 503) { say('O jogo está com muitos acessos agora. Tente de novo em alguns segundos.', 'err'); return; }   // ocupado: não é código errado
        say('ID ou código-chave incorreto.', 'err');           // a mesma resposta para qualquer falha: ninguém descobre quais IDs existem
      })
      .catch(function () { go.disabled = false; say('Não consegui falar com o servidor. Tente de novo em instantes.', 'err'); });
  });
})();
