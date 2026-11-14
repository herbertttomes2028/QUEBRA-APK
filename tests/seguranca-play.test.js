'use strict';
// Segurança antes da Play Store: /diagnostico só com token, CSP pronta para "enforce" e aviso curto de segurança online.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer, DIAG_TOKEN } = require('./helpers');
const security = require('../security');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

/* ===================== o portão do token (unidade, com relógio simulado) ===================== */
const reqDe = (o) => ({ ip: o.ip || '1.1.1.1', query: o.query || {}, get: (h) => (h.toLowerCase() === 'authorization' ? o.auth : undefined) });
const TOK = 'um-token-bem-longo-de-teste-123456';
test('portão do token: sem token configurado ou curto demais fica DESLIGADO; certo (Bearer ou ?token=) abre; errado nega; array/vazio nega', () => {
  assert.equal(security.createDiagGate({}).check(reqDe({ query: { token: TOK } })), 'desligado');
  const curto = security.createDiagGate({ DIAG_TOKEN: 'curto' }); assert.equal(curto.enabled, false); assert.equal(curto.tooShort, true); assert.equal(curto.check(reqDe({ query: { token: 'curto' } })), 'desligado', 'token curto nunca vale');
  assert.equal(security.createDiagGate({ DIAG_TOKEN: 'x'.repeat(201) }).enabled, false, 'longo demais também não');
  const g = security.createDiagGate({ DIAG_TOKEN: '  ' + TOK + '  ' }); assert.equal(g.enabled, true);
  assert.equal(g.check(reqDe({ auth: 'Bearer ' + TOK })), 'ok'); assert.equal(g.check(reqDe({ auth: 'bearer ' + TOK })), 'ok'); assert.equal(g.check(reqDe({ query: { token: TOK } })), 'ok');
  assert.equal(g.check(reqDe({ query: { token: TOK + 'x' } })), 'negado'); assert.equal(g.check(reqDe({ query: { token: [TOK, TOK] } })), 'negado', 'repetir ?token= não passa'); assert.equal(g.check(reqDe({})), 'negado');
  assert.equal(g.check(reqDe({ auth: 'Basic ' + TOK })), 'negado', 'só Bearer');
});
test('portão do token: 10 tentativas ERRADAS por endereço bloqueiam por 10 min (nem o token certo entra); outro endereço não é afetado; sem tentativa não conta; depois da janela volta', () => {
  let agora = 1000000; const g = security.createDiagGate({ DIAG_TOKEN: TOK }, () => agora);
  for (let i = 0; i < 20; i++) assert.equal(g.check(reqDe({ ip: '9.9.9.9' })), 'negado', 'abrir sem token nunca conta como erro');
  for (let i = 0; i < 10; i++) assert.equal(g.check(reqDe({ ip: '2.2.2.2', query: { token: 'errado' + i } })), 'negado');
  assert.equal(g.check(reqDe({ ip: '2.2.2.2', query: { token: TOK } })), 'limitado', 'o token certo também fica bloqueado: não dá para adivinhar');
  assert.equal(g.check(reqDe({ ip: '3.3.3.3', query: { token: TOK } })), 'ok', 'outro endereço entra');
  agora += 10 * 60 * 1000 + 1; assert.equal(g.check(reqDe({ ip: '2.2.2.2', query: { token: TOK } })), 'ok', 'passada a janela, volta');
});

/* ===================== o servidor de verdade ===================== */
test('/diagnostico SEM DIAG_TOKEN: só o essencial (o que já é público em /.well-known), sem e-mail, limites, CSP, contas nem encaixe; nunca é guardado em cache', async () => {
  const s = await startServer({ DIAG_TOKEN: '' });
  try {
    const r = await fetch(s.url + '/diagnostico'); const j = await r.json();
    assert.deepEqual(Object.keys(j).sort(), ['detalhes', 'servidor', 'verificacao_do_aplicativo']); assert.match(j.detalhes, /defina DIAG_TOKEN/); assert.deepEqual(Object.keys(j.verificacao_do_aplicativo).sort(), ['pacotes', 'publicado_em']);
    assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    const todo = JSON.stringify(j); for (const nao of ['seguranca', 'contas', 'encaixe', 'imagens', 'email', 'csp', 'limite']) assert.ok(!todo.includes(nao), 'não pode aparecer: ' + nao);
    assert.match(s.log(), /\[diagnostico\] detalhes DESLIGADOS/);
  } finally { await s.stop(); }
});
test('/diagnostico COM token: completo com Bearer ou ?token=; sem token ou errado volta ao essencial; token curto é ignorado com aviso; 10 erros dão 429 até para o token certo', async () => {
  const s = await startServer();
  try {
    const completo = (j) => j.seguranca && j.seguranca.csp && j.contas && j.encaixe;
    assert.ok(completo(await (await fetch(s.url + '/diagnostico', { headers: { Authorization: 'Bearer ' + DIAG_TOKEN } })).json()), 'Bearer');
    const q = await (await fetch(s.url + '/diagnostico?token=' + DIAG_TOKEN)).json(); assert.ok(completo(q), '?token='); assert.ok(['report', 'enforce', 'off'].includes(q.seguranca.csp.modo));
    const sem = await (await fetch(s.url + '/diagnostico')).json(); assert.ok(!completo(sem)); assert.match(sem.detalhes, /protegidos/);
    assert.ok(!completo(await (await fetch(s.url + '/diagnostico?token=errado')).json()));
    for (let i = 0; i < 9; i++) await fetch(s.url + '/diagnostico?token=errado' + i);
    const bloq = await fetch(s.url + '/diagnostico?token=' + DIAG_TOKEN); assert.equal(bloq.status, 429); assert.match((await bloq.json()).erro, /muitas tentativas/);
  } finally { await s.stop(); }
  const c = await startServer({ DIAG_TOKEN: 'curto' });
  try { assert.match(c.log(), /DIAG_TOKEN tem menos de 24 caracteres: ignorado/); assert.ok(!(await (await fetch(c.url + '/diagnostico?token=curto')).json()).seguranca); } finally { await c.stop(); }
});

/* ===================== CSP pronta para enforce ===================== */
test('CSP: os três modos (report = padrão, enforce, off) montam os cabeçalhos certos e o frame-ancestors é obrigatório em todos', async () => {
  const cabecalhos = async (modo) => { const s = await startServer(modo === undefined ? {} : { CSP_MODE: modo }); try { const r = await fetch(s.url + '/'); return { csp: r.headers.get('content-security-policy'), ro: r.headers.get('content-security-policy-report-only') }; } finally { await s.stop(); } };
  const padrao = await cabecalhos(), enf = await cabecalhos('enforce'), off = await cabecalhos('off');
  assert.equal(padrao.csp, "frame-ancestors 'none'"); assert.match(padrao.ro, /default-src 'self'/, 'o padrão só RELATA');
  assert.equal(off.csp, "frame-ancestors 'none'"); assert.equal(off.ro, null);
  assert.equal(enf.ro, "require-trusted-types-for 'script'; report-uri /api/csp-report", 'enforce não repete o relato da CSP; só relata Trusted Types (nunca obrigatório)'); assert.doesNotMatch(enf.csp, /trusted-types/, 'Trusted Types nunca no cabeçalho que bloqueia');
  for (const d of ["default-src 'self'", "script-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "worker-src 'self'", "manifest-src 'self'", 'report-uri /api/csp-report']) assert.ok(enf.csp.includes(d), 'enforce: ' + d);
  assert.match(enf.csp, /connect-src 'self' ws:\/\/127\.0\.0\.1:\d+ wss:\/\/127\.0\.0\.1:\d+;/, 'o WebSocket do próprio site');
  assert.doesNotMatch(enf.csp, /script-src[^;]*'unsafe-inline'|script-src[^;]*'unsafe-eval'/, 'scripts nunca inline nem eval');
});
test('CSP: o HTML não tem script embutido, atributo de evento (onclick...), javascript: nem recurso de outro site (só o login do Google), então o enforce não quebra a tela', () => {
  const h = read('public/index.html'), boot = read('public/boot.js'); assert.ok(boot.length > 20);
  for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) { assert.match(m[1], /\bsrc="[^"]+"/, 'script sem src (inline): ' + m[0].slice(0, 60)); assert.equal(m[2].trim(), '', 'script com conteúdo embutido'); }
  assert.doesNotMatch(h, /\son[a-z]+\s*=\s*["']/i, 'atributo de evento inline'); assert.doesNotMatch(h, /javascript:/i);
  for (const m of h.matchAll(/\b(?:src|href)="(https?:\/\/[^"]+)"/g)) assert.fail('recurso externo no HTML: ' + m[1]);
  const js = ['game.js', 'conta.js', 'loja.js', 'pet.js', 'mascot.js'].map((f) => read('public/' + f)).join('\n'); assert.doesNotMatch(js, /\beval\s*\(|new Function\s*\(/, 'nada de eval');
});

/* ===================== aviso curto de segurança online ===================== */
const html = read('public/index.html'), game = read('public/game.js'), conta = read('public/conta.js');
test('aviso de segurança: janela acessível, três recomendações curtas em português simples e um botão "Entendi" que NÃO tem data-back (o Voltar do Android só fecha, sem seguir adiante)', () => {
  const m = html.match(/<div id="modal-safe"[\s\S]*?<\/div>\s*<\/div>/); assert.ok(m); const j = m[0];
  assert.match(j, /role="dialog" aria-modal="true" aria-labelledby="safe-title" aria-describedby="safe-list"/); assert.match(j, /<h3 id="safe-title">🛡️ Jogue com segurança<\/h3>/);
  const itens = [...j.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1].replace(/<[^>]+>/g, '')); assert.equal(itens.length, 3);
  assert.deepEqual(itens, ['Jogue só com quem você conhece.', 'Nunca conte seu nome completo, endereço, escola, telefone ou senha.', 'Se algo incomodar, saia da sala, use Bloquear ou Denunciar e conte a um adulto de confiança.']);
  assert.ok(itens.join(' ').length < 260, 'curto: ' + itens.join(' ').length + ' letras'); assert.match(j, /<button id="safe-ok" class="btn btn-primary btn-block" type="button">Entendi<\/button>/); assert.ok(!/data-back/.test(j), 'sem data-back');
  assert.match(html, /<span id="lbl-safe" class="set-label">Jogue com segurança<\/span>\s*<button type="button" id="btn-safe" class="btn btn-secondary btn-small" aria-describedby="lbl-safe">🛡️ Ver dicas<\/button>/, 'atalho nos Ajustes');
  assert.match(read('public/telas.css'), /\.safe-list \{/);
});
test('aviso de segurança: aparece UMA vez por aparelho antes de jogar com outra pessoa (criar partida, Sala Desafio, entrar por código) e NUNCA no modo solo', () => {
  assert.match(game, /var SAFE_KEY = 'qc\.safe\.v1', safeMem = false, safePending = null;/);
  assert.match(game, /function safeAcked\(\) \{ if \(safeMem\) return true; try \{ return localStorage\.getItem\(SAFE_KEY\) === '1'; \} catch \(e\) \{ return false; \} \}/);
  assert.match(game, /function safeThen\(fn\) \{\s+if \(safeAcked\(\)\) \{ fn\(\); return; \}\s+safePending = fn; openModal\('#modal-safe', '#safe-ok'\);/);
  assert.match(game, /\$\('#safe-ok'\)\.addEventListener\('click', function \(\) \{\s+safeMem = true; try \{ localStorage\.setItem\(SAFE_KEY, '1'\); \}[^\n]*\n\s+var fn = safePending; safePending = null; closeModal\('#modal-safe'\);\s+if \(fn\) \{ try \{ fn\(\); \}/);
  assert.match(game, /\$\('#btn-safe'\)\.addEventListener\('click', function \(\) \{ safePending = null; openModal\('#modal-safe', '#safe-ok'\); \}\);/, 'pelos Ajustes não segue para lugar nenhum');
  assert.match(game, /safeThen\(function \(\) \{ openPick\('duel'\); \}\);/); assert.match(game, /readName\(\); safeThen\(function \(\) \{ openPick\('create'\); \}\); \}\);/); assert.match(game, /safeThen\(function \(\) \{ doJoin\(code\); \}\);/);
  assert.match(game, /\$\('#btn-solo'\)\.addEventListener\('click', function \(\) \{ closeModal\('#modal-play'\); readName\(\); openPick\('solo'\); \}\);/, 'solo sem aviso');
  assert.match(game, /window\.QC = \{\s+safeThen: safeThen,/, 'dentro do objeto QC (um window.QC = {...} posterior apagaria uma atribuição solta)');
  assert.ok(!/safeThen|respondInvite|openFriends/.test(conta), 'sem Amigos e sem convites, o aviso fica só nos botões de sala do jogo');
});

/* ===================== documentação coerente com o código ===================== */
test('documentação: o README não descreve mais upload de imagens nem chat de texto livre (não existem), e explica o token, a CSP e o aviso; SEGURANCA.md tem a seção do token e o checklist do AAB', () => {
  const r = read('README.md'), sg = read('SEGURANCA.md'), ct = read('CONTAS.md'), sv = read('server.js');
  assert.ok(!/\/api\/up\b|UPLOAD_RATE|200 letras|Escreva e toque em \*\*Enviar|Adicionar minha imagem/.test(r), 'README descreve recurso removido'); assert.ok(!/app\.(post|get|put)\('\/api\/up/.test(sv), 'e o servidor não tem a rota');
  assert.ok(!/campo de texto/.test(r.slice(r.indexOf('## Conversa'), r.indexOf('## Tela inicial'))) || /não existe campo de texto/.test(r), 'chat: só frases prontas');
  for (const k of ['DIAG_TOKEN', 'CSP_MODE', 'Ajustes > Jogue com segurança', 'seção 13']) assert.ok(r.includes(k), 'README cita ' + k);
  assert.match(sg, /## 0\. Token do `\/diagnostico`/); assert.match(sg, /## 13\. Antes de gerar o AAB da Play Store/); assert.match(sg, /targetSdkVersion/); assert.match(sg, /12 testadores por 14 dias/); assert.match(sg, /impressão digital SHA-256 da \*\*chave de assinatura do app\*\*/);
  assert.match(ct, /diagnostico\?token=SEU_TOKEN/);
  const fora0 = sg.slice(sg.indexOf('## 1. Ordem recomendada')); for (const m of fora0.matchAll(/https:\/\/SEU-APP\.onrender\.com\/diagnostico(?!\?token)/g)) assert.fail('SEGURANCA.md manda abrir o /diagnostico sem token: ' + m[0]);
});
