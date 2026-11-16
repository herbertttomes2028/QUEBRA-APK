'use strict';
// Rodada "sem-bate-papo" (pedidos do proprietário, 16/11/2026):
// (1) NADA de bate-papo: nem texto, nem frases prontas, nem reações/emojis enviados ao outro, nem o aviso "Nova frase liberada"
//     (ele aparecia mesmo com o bate-papo desligado, porque vinha da conta: conta.js comparava as frases liberadas);
// (2) "Ver dicas" e "Privacidade e exclusão de conta", abertos de dentro dos Ajustes, ficam POR CIMA (antes abriam atrás);
// (3) Loja e Ajustes maiores na barra de baixo.
// Servidor real + clientes Socket.IO + leitura do código. A prova visual (Chrome sem tela) está descrita no CONTINUIDADE.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { startServer, client, ROOT } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const dorme = (ms) => new Promise((r) => setTimeout(r, ms));
const pid = () => 'pid-sbp-' + Math.random().toString(36).slice(2);

let srv, img;
test.before(async () => { srv = await startServer({ CHAT_ENABLED: 'true' }); img = (await (await fetch(srv.url + '/api/config')).json()).images[0].file; });
test.after(async () => { await srv.stop(); });

test('servidor: nem com CHAT_ENABLED=true existe bate-papo (configuração, sala cooperativa e Sala Desafio)', async () => {
  const cfg = await (await fetch(srv.url + '/api/config')).json();
  assert.ok(!('chat' in cfg) && !('phrases' in cfg), 'a configuração não oferece conversa nem frases');

  const a = await client(srv.url), b = await client(srv.url);
  const r = await a.emitAck('create', { pid: pid(), imageId: img, pieces: 6, name: 'Ana' });
  const j = await b.emitAck('join', { pid: pid(), code: r.snapshot.code, name: 'Beto' });
  assert.ok(j.ok);
  for (const snap of [r.snapshot, j.snapshot]) assert.ok(!('chat' in snap) && !('chatOn' in snap), 'a sala não traz conversa');
  let chegou = 0, respondeu = 0;
  b.on('chat', () => { chegou++; });
  for (const m of [{ p: 'oi' }, { p: 'r_like' }, { text: 'olá' }]) a.emit('chat', m, () => { respondeu++; });
  await dorme(400);
  assert.deepEqual([chegou, respondeu], [0, 0], 'o evento não existe: nada chega e ninguém responde');
  a.close(); b.close();

  const c = await client(srv.url), d = await client(srv.url);
  const c1 = await c.emitAck('ch:create', { pid: pid(), imageId: img, pieces: 6, mode: 'comum', name: 'Ana' });
  const d1 = await d.emitAck('ch:join', { pid: pid(), code: c1.lobby.code, name: 'Beto' });
  assert.ok(d1.ok);
  assert.ok(!('chat' in c1) && !('chatOn' in c1) && !('chat' in d1) && !('chatOn' in d1), 'a Sala Desafio não traz conversa');
  let chegou2 = 0; d.on('chat', () => { chegou2++; });
  c.emit('ch:chat', { p: 'oi' }, () => { chegou2 += 10; });
  await dorme(400);
  assert.equal(chegou2, 0);
  c.close(); d.close();
});

test('código: phrases.js apagado; nada de conversa no servidor, nas contas nem no celular', () => {
  assert.ok(!fs.existsSync(path.join(ROOT, 'phrases.js')));
  const sv = read('server.js'), ch = read('challenge.js'), ac = read('accounts.js');
  for (const [n, s] of [['server.js', sv], ['challenge.js', ch]]) {
    assert.ok(!/CHAT_ENABLED\s*=|CHAT_KEEP|cleanChat|phraseOk|chatSeq|room\.chat\b/.test(s), n + ' sem restos do bate-papo');
  }
  assert.ok(!/allowedPhrases|phraseCache|phrases:/.test(ac), 'accounts.js não calcula nem devolve frases liberadas');
  assert.ok(!/tag: 'chat'/.test(sv + ch), 'nenhum aviso (push) de mensagem');

  const html = read('public/index.html'), js = read('public/game.js'), conta = read('public/conta.js'), css = read('public/style.css');
  for (const id of ['btn-chat', 'chat-badge', 'chat-pop', 'chat-panel', 'chat-quick', 'chat-phrases', 'chat-open-phrases']) {
    assert.ok(!html.includes('id="' + id + '"'), 'index.html ainda tem #' + id);
  }
  assert.ok(!/r_like|r_festa|Reações rápidas|Frases prontas/.test(html), 'sem reações nem frases na tela');
  assert.ok(!/chat|phrase|frase|\bunread\b|popTimer/i.test(js), 'game.js sem nenhuma referência à conversa');
  assert.ok(!/Nova frase liberada|setUnlocked|me\.phrases/.test(conta), 'o aviso "Nova frase liberada" saiu');
  assert.ok(!/\.chat-|#chat-/.test(css), 'style.css sem estilos da conversa');
  const priv = read('public/privacidade.html');
  assert.match(priv, /Não há bate-papo: nenhuma mensagem, frase ou reação passa de um jogador para o outro\./);
  assert.ok(!/frases prontas/.test(priv), 'a política não fala mais em frases prontas');
});

test('Ajustes: a janela que abre fica POR CIMA das abertas (Ver dicas, Privacidade e exclusão de conta); ao fechar, volta à camada normal', () => {
  const js = read('public/game.js');
  const open = js.slice(js.indexOf('function openModal('), js.indexOf('function closeModal('));
  assert.match(open, /if \(m\.hidden\) \{[\s\S]*raiseModal\(m\);[\s\S]*\}\s*m\.hidden = false;/, 'sobe a janela antes de mostrar');
  const raise = js.slice(js.indexOf('function raiseModal('), js.indexOf('function openModal('));
  assert.match(raise, /querySelectorAll\('\.modal:not\(\[hidden\]\)'\)/);
  assert.match(raise, /if \(top >= own\) m\.style\.zIndex = String\(top \+ 1\);/);
  const close = js.slice(js.indexOf('function closeModal('), js.indexOf('// anúncio para leitores de tela'));
  assert.match(close, /m\.hidden = true;\s*m\.style\.zIndex = '';/);
  assert.match(js, /\$\('#btn-safe'\)\.addEventListener\('click', function \(\) \{ safePending = null; openModal\('#modal-safe', '#safe-ok'\); \}\);/);
  // o botão Voltar do Android fecha a de cima primeiro (topModal escolhe a camada mais alta)
  assert.match(js, /function topModal\(\) \{[\s\S]*parseInt\(getComputedStyle\(m\)\.zIndex, 10\)/);
});

test('barra de baixo: Loja e Ajustes maiores (76 px de altura, ícone de 44 px, letra maior) e o conteúdo não fica atrás', () => {
  const tc = read('public/telas.css');
  assert.match(tc, /\.tabbar \.tab \{[^}]*max-width: 180px; min-height: 76px;[^}]*font: 700 \.92rem\/1\.1 "Fredoka"/);
  assert.match(tc, /\.tab-ico \{ display: block; width: 44px; height: 44px; \}/);
  assert.match(tc, /\.tab-svg \{ display: block; width: 44px; height: 44px; overflow: visible; \}/);
  assert.match(tc, /#screen-home \{ padding-bottom: calc\(104px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
});
