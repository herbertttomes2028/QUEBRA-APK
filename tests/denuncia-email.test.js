"use strict";
// Aviso de denúncia por e-mail a quem cuida do jogo: o que o e-mail mostra (e o que NUNCA mostra), injeção (HTML, SQL, cabeçalho),
// falha e lentidão do Brevo, teto por hora, e destino. As partes com banco rodam só no qc_test, em schema temporário.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { reportEmail, reportTarget, FRIEND_CODE_RE } = require('../mailer');
const root = path.join(__dirname, '..'); const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const enabled = process.env.GEMAS_TEST_DB === '1'; const connection = process.env.DATABASE_URL || '';
const TOKEN_FALSO = 'tk' + crypto.randomBytes(8).toString('hex');         // valor inventado na hora: prova que nada de quem denunciou vaza
const base = { id: 42, reason: 'apelido', context: 'perfil', name: 'Beto-Alvo', code: 'KBBBBBB2', note: 'apelido ofensivo', at: new Date('2026-11-09T17:32:00Z') };

/* ================= A) a mensagem ================= */
test('e-mail: traz o que é preciso para agir (código de amigo, motivo, onde, apelido, nota) e os comandos prontos', () => {
  const m = reportEmail(base);
  assert.equal(m.subject, 'Denúncia nova (#42) — Quebra-cabeça a dois');
  for (const parte of ['#42', 'Apelido ou avatar ofensivo', 'no perfil do amigo', '"Beto-Alvo"', 'KBBB-BBB2', '(no banco: KBBBBBB2)', '"apelido ofensivo"', '09/11/2026', 'horário de Fortaleza',
    "update users set name = 'Jogador', avatar = '' where friend_code = 'KBBBBBB2';", "delete from users where friend_code = 'KBBBBBB2';", "update reports set status = 'analisado' where id = 42;"])
    assert.ok(m.text.includes(parte), 'o texto precisa ter: ' + parte);
  for (const parte of ['KBBB-BBB2', 'Beto-Alvo', 'Apelido ou avatar ofensivo', "friend_code = 'KBBBBBB2'"]) assert.ok(m.html.includes(parte), 'o HTML precisa ter: ' + parte);
  assert.match(reportEmail(Object.assign({}, base, { context: 'sala' })).text, /dentro de uma partida/); assert.match(reportEmail(Object.assign({}, base, { context: 'amigos' })).text, /lista de amigos/);
  assert.match(reportEmail(Object.assign({}, base, { reason: 'comportamento' })).text, /Comportamento ruim/); assert.match(reportEmail(Object.assign({}, base, { note: '' })).text, /Nota de quem denunciou: \(nenhuma\)/);
});
test('e-mail: NUNCA revela quem denunciou (nem se o objeto trouxer esses dados por engano)', () => {
  const m = reportEmail(Object.assign({}, base, { reporter: 'uuid-do-denunciante', reporterName: 'Zelador-Rep', reporterEmail: 'zelador@t.test', reporterCode: 'RRRRRRR2', email: 'quem@t.test', token: TOKEN_FALSO }));
  for (const k of ['uuid-do-denunciante', 'Zelador-Rep', 'zelador@t.test', 'RRRRRRR2', 'quem@t.test', TOKEN_FALSO]) assert.ok(!m.text.includes(k) && !m.html.includes(k) && !m.subject.includes(k), 'vazou: ' + k);
  assert.match(m.text, /não traz o e-mail, o código nem o apelido de quem denunciou/);
});
test('e-mail: apelido e nota (texto de jogador) são escapados no HTML, sem quebras de linha, sem links e nunca entram nos comandos SQL', () => {
  const m = reportEmail(Object.assign({}, base, { name: '<img src=x onerror=alert(1)>', note: `"><script>alert(1)</script>\nlinha2\u2028fim` }));
  assert.ok(!/<img|<script/.test(m.html), 'nada de tag viva no HTML'); assert.ok(m.html.includes('&lt;img') && m.html.includes('&lt;script&gt;'), 'aparecem escapados');
  const h = reportEmail(Object.assign({}, base, { name: "x\r\nBcc: ladrao@x.com'; drop table users; --" }));            // (o apelido é cortado em 40 letras)
  assert.ok(!/[\r\u2028\u2029]/.test(m.subject + m.text + h.subject + h.text), 'sem CR nem separadores de linha do Unicode');
  const linha = h.text.split('\n').find((l) => l.startsWith('Apelido da pessoa denunciada:')); assert.ok(linha.includes('Bcc: ladrao@x.com'), 'a tentativa de cabeçalho fica DENTRO de uma linha de texto, inofensiva');
  assert.ok(!/^Bcc:/m.test(h.text) && !/^Bcc:/m.test(h.html), 'nenhuma linha começa com um cabeçalho forjado');
  assert.ok(!h.subject.includes('Bcc') && !/[\r\n]/.test(h.subject) && !h.subject.includes('drop') && !m.subject.includes('img'), 'o assunto nunca leva texto de jogador');
  for (const msg of [m, h]) { const sqls = msg.text.split('\n').filter((l) => /^    (update|delete|select)/.test(l)); assert.equal(sqls.length, 3);
    for (const l of sqls) assert.ok(!/drop|Bcc|<|script|ladrao|img/i.test(l), 'o apelido/nota nunca entram no SQL: ' + l); }
  assert.ok(!/http|<a |<img|<link|src=/i.test(reportEmail(base).html), 'sem links nem imagens');
});
test('e-mail: o código vai ao SQL só se for um código de amigo válido (alfabeto do jogo); senão, só o id', () => {
  for (const ruim of ["K'; DROP TABLE users;--", 'kbbbbbb2', 'KBBBBBB', 'KBBBBBBO', 'KBBBBBB1', '', null, undefined, 'KBBBBBB2 ', 'AAAA-AAA2']) {
    const m = reportEmail(Object.assign({}, base, { code: ruim })); assert.ok(!/delete from users|update users set/.test(m.text + m.html), 'sem comando por código: ' + JSON.stringify(ruim));
    assert.match(m.text, /select u\.friend_code from reports r join users u on u\.id = r\.reported where r\.id = 42;/); assert.match(m.text, /\(indisponível\)/);
  }
  assert.ok(FRIEND_CODE_RE.test('KBBBBBB2') && !FRIEND_CODE_RE.test('LOJA2AA2'));
  for (const idRuim of ['1; drop table users', -5, 0, 1.5, NaN, null, '42; --']) assert.ok(!/drop|;\s*--/.test(reportEmail(Object.assign({}, base, { id: idRuim })).text.replace(/;$/gm, '')), 'id ruim vira 0, sem texto vivo: ' + idRuim);
});
test('e-mail: o aviso de excedente aparece só quando houve denúncias sem e-mail', () => {
  assert.doesNotMatch(reportEmail(base).text, /não vieram por e-mail/); assert.doesNotMatch(reportEmail(Object.assign({}, base, { skipped: 0 })).html, /Atenção/);
  const m = reportEmail(Object.assign({}, base, { skipped: 7 })); assert.match(m.text, /mais 7 denúncia\(s\) nesta hora não vieram por e-mail/); assert.match(m.html, /mais 7 denúncia\(s\)/);
});
test('destino: REPORT_NOTIFY_EMAIL, ou o remetente do Brevo; valor duvidoso desliga em vez de enviar', () => {
  const mail = { from: 'remetente@brevo.test' };
  assert.deepEqual(reportTarget({ REPORT_NOTIFY_EMAIL: ' dono@gmail.com ' }, mail), { to: 'dono@gmail.com', origem: 'REPORT_NOTIFY_EMAIL' });
  assert.deepEqual(reportTarget({}, mail), { to: 'remetente@brevo.test', origem: 'remetente do Brevo' });
  for (const ruim of ['sem-arroba', 'a@b', 'a b@c.com', 'a@b.com\nBcc:x@y.com', 'a@b.com, c@d.com', '<a@b.com>', 'a@b.com;c@d.com', '"a"@b.com', 'a'.repeat(260) + '@b.com'])
    assert.equal(reportTarget({ REPORT_NOTIFY_EMAIL: ruim }, mail).to, null, 'inválido desliga: ' + ruim.slice(0, 30));
  assert.equal(reportTarget({}, null).to, null); assert.equal(reportTarget({}, { from: 'x' }).to, null);
});

/* ================= B) integração com PostgreSQL e um mailer de mentira ================= */
test('PostgreSQL: cada denúncia NOVA gera um e-mail seguro; repetida, falha, lentidão, teto por hora e destino', { skip: !enabled }, async () => {
  const url = new URL(connection); if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg'); const { createAccounts } = require('../accounts');
  const schema = 't_dem_' + crypto.randomBytes(5).toString('hex'); const admin = new Pool({ connectionString: connection, ssl: false, max: 1 });
  await admin.query(`CREATE SCHEMA ${schema}`); const pool = new Pool({ connectionString: connection, ssl: false, max: 4, options: `-c search_path=${schema}` });
  const db = { q: (s, p) => pool.query(s, p), pool }; const sha = (s) => crypto.createHash('sha256').update(s).digest('hex'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const errosLog = []; const errOrig = console.error; console.error = (...a) => { errosLog.push(a.join(' ')); };
  const dateOrig = Date.now;
  try {
    const dir = path.join(root, 'migrations'); for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await pool.query(fs.readFileSync(path.join(dir, f), 'utf8'));
    const q = (s, p) => pool.query(s, p);
    const mkUser = async (name, code) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded) VALUES ($1,$2,$3,0,true) RETURNING id', [name.toLowerCase() + '@segredo.test', name, code])).rows[0].id;
    const mkSession = async (uid) => { const t = 'tok-' + crypto.randomBytes(8).toString('hex'); await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,now() + interval '1 day')", [sha(t), uid]); return t; };
    const alvo = await mkUser('Beto-Alvo', 'KBBBBBB2'), visit = await mkUser('Davi-Alvo', 'KDDDDDD2');
    // cada cenário tem a sua instância (as configurações são lidas quando ela é criada) e o seu denunciante (o limite de 15/h é por pessoa)
    let n = 0;
    const build = async (env, mailerOpts) => {
      const old = {}; for (const k of ['REPORT_NOTIFY_EMAIL', 'REPORT_MAIL_MAX_PER_HOUR']) { old[k] = process.env[k]; delete process.env[k]; } Object.assign(process.env, env || {});
      const outbox = []; const mailer = mailerOpts === null ? null : { from: 'remetente@brevo.test', stats: {}, send: mailerOpts && mailerOpts.send ? (m) => mailerOpts.send(m, outbox) : async (m) => { outbox.push(m); } };
      const routes = {}; const router = { get(p, ...hh) { routes['GET ' + p] = hh; return router; }, post(p, ...hh) { routes['POST ' + p] = hh; return router; }, use() { return router; } };
      const io = Object.assign(new EventEmitter(), { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) }); let peer = null;
      const info = createAccounts({ app: { use() {} }, express: { Router: () => router, json: () => (_, __, next) => next() }, io, db, cleanName: (x) => String(x || '').slice(0, 12), cleanAvatar: (a) => a, roomInfo: () => null, roomOfSocket: () => null,
        imageLabel: () => 'Capivara', getUpload: () => null, putUpload: () => null, onAuth: () => {}, mailer, peerOf: () => peer, elapsedOf: () => 0 });
      for (const k of Object.keys(old)) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; }
      const uid = await mkUser('Zelador-Rep' + (++n), 'RRRRRR' + String.fromCharCode(64 + n) + '2'), tok = await mkSession(uid);
      const post = (route, body) => new Promise((resolve) => { const req = { get: (h) => (h.toLowerCase() === 'authorization' ? 'Bearer ' + tok : ''), query: {}, body, method: 'POST', path: route, ip: '127.0.0.1' };
        const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() {}, json(x) { resolve({ status: this.statusCode, body: x }); } }; const hh = routes['POST ' + route]; let i = 0; const next = () => hh[++i](req, res, next); hh[0](req, res, next); });
      const h = {}; const sock = { id: 's' + n, data: { uid, sessionHash: sha(tok) }, handshake: { auth: {} }, on(ev, fn) { h[ev] = fn; }, join() {}, leave() {}, emit() {}, rooms: new Set() }; io.emit('connection', sock);
      return { outbox, post, uid, code: 'RRRRRR' + String.fromCharCode(64 + n) + '2', sala: (b) => new Promise((ok) => h['acc:reportPeer'](b, ok)), setPeer: (p) => { peer = p; }, info: info.reportMailInfo(), reporterEmail: 'zelador-rep' + n + '@segredo.test' };
    };
    const rep = (S, reason, extra) => S.post('/reports', Object.assign({ code: 'KBBBBBB2', reason }, extra || {}));

    /* 1) uma denúncia nova = um e-mail, para o remetente do Brevo (sem REPORT_NOTIFY_EMAIL), sem NADA de quem denunciou */
    const S1 = await build({}); assert.deepEqual([S1.info.ligado, S1.info.origem, S1.info.destino], [true, 'remetente do Brevo', 'r***@brevo.test'], 'o diagnóstico mostra o destino já mascarado');
    const r1 = await rep(S1, 'apelido', { note: '<b>ofensivo</b>\nlinha2', context: 'amigos' }); assert.deepEqual([r1.status, r1.body.ok], [200, true]); await sleep(60);
    assert.equal(S1.outbox.length, 1, 'exatamente um e-mail'); const e1 = S1.outbox[0]; const id1 = (await q('SELECT id FROM reports ORDER BY id DESC LIMIT 1')).rows[0].id;
    assert.equal(e1.to, 'remetente@brevo.test'); assert.equal(e1.subject, `Denúncia nova (#${id1}) — Quebra-cabeça a dois`);
    for (const k of ['KBBB-BBB2', 'KBBBBBB2', 'Beto-Alvo', 'Apelido ou avatar ofensivo', 'na lista de amigos']) assert.ok(e1.text.includes(k), 'o e-mail traz: ' + k);
    assert.ok(e1.html.includes('&lt;b&gt;ofensivo&lt;/b&gt;') && !e1.html.includes('<b>ofensivo</b>'), 'a nota do jogador chega escapada');
    for (const k of [S1.code, S1.reporterEmail, 'Zelador-Rep', 'segredo.test', String(S1.uid)]) assert.ok(!e1.text.includes(k) && !e1.html.includes(k) && !e1.subject.includes(k), 'o e-mail NÃO pode conter dados de quem denunciou: ' + k);
    assert.ok(!e1.text.includes('beto-alvo@segredo.test') && !e1.html.includes('beto-alvo@segredo.test'), 'nem o e-mail da pessoa denunciada');
    /* 2) a mesma denúncia repetida em 24 h: nenhum e-mail novo; outro motivo: um novo */
    await rep(S1, 'apelido'); await sleep(60); assert.equal(S1.outbox.length, 1, 'repetida não gera e-mail'); await rep(S1, 'comportamento'); await sleep(60); assert.equal(S1.outbox.length, 2, 'outro motivo gera');
    /* 3) denúncia inválida ou recusada nunca gera e-mail */
    const antes = S1.outbox.length; await rep(S1, 'xingamento'); await S1.post('/reports', { code: 'ZZZZZZZ9', reason: 'apelido' }); await S1.post('/reports', { code: S1.code, reason: 'apelido' }); await sleep(60); assert.equal(S1.outbox.length, antes, 'motivo inválido, código inexistente e a si mesmo: sem e-mail');
    /* 4) pela sala (socket): contexto "sala"; visitante não tem e-mail algum */
    const S4 = await build({}); S4.setPeer({ uid: alvo, name: 'Beto-Alvo' }); const k = await S4.sala({ reason: 'comportamento', note: 'trapaça' }); assert.equal(k.ok, true); await sleep(60);
    assert.equal(S4.outbox.length, 1); assert.match(S4.outbox[0].text, /dentro de uma partida/); assert.match(S4.outbox[0].text, /KBBB-BBB2/); S4.setPeer({ uid: null, name: 'Visitante' }); await S4.sala({ reason: 'apelido' }); await sleep(60); assert.equal(S4.outbox.length, 1, 'visitante: sem denúncia, sem e-mail');
    /* 5) REPORT_NOTIFY_EMAIL manda para o endereço escolhido (e não para o remetente) */
    const S5 = await build({ REPORT_NOTIFY_EMAIL: 'dono@gmail.com' }); assert.equal(S5.info.origem, 'REPORT_NOTIFY_EMAIL'); await rep(S5, 'outro'); await sleep(60); assert.equal(S5.outbox[0].to, 'dono@gmail.com'); assert.equal(S5.outbox.length, 1);
    /* 6) destino inválido, teto 0 e sem e-mail ligado: nada é enviado, e a denúncia continua sendo salva */
    for (const [env, mail, nome] of [[{ REPORT_NOTIFY_EMAIL: 'a@b.com, c@d.com' }, undefined, 'destino inválido'], [{ REPORT_MAIL_MAX_PER_HOUR: '0' }, undefined, 'teto 0'], [{}, null, 'sem Brevo']]) {
      const S = await build(env, mail); const c0 = (await q('SELECT count(*)::int AS n FROM reports')).rows[0].n; const r = await rep(S, 'outro'); await sleep(60);
      assert.equal(r.body.ok, true, nome); assert.equal((await q('SELECT count(*)::int AS n FROM reports')).rows[0].n, c0 + 1, nome + ': a denúncia foi salva'); assert.equal(S.outbox.length, 0, nome + ': sem e-mail'); assert.equal(S.info.ligado, false, nome + ': o diagnóstico diz desligado'); }
    /* 7) o Brevo falha: a denúncia continua salva, a resposta é ok, e o registro do servidor não vaza e-mails nem a chave */
    errosLog.length = 0; const S7 = await build({}, { send: async () => { throw new Error('Brevo respondeu 401 (key_not_found: ***@***)'); } }); const c7 = (await q('SELECT count(*)::int AS n FROM reports')).rows[0].n;
    const r7 = await rep(S7, 'apelido'); await sleep(80); assert.deepEqual([r7.status, r7.body.ok], [200, true]); assert.equal((await q('SELECT count(*)::int AS n FROM reports')).rows[0].n, c7 + 1, 'salva mesmo com o e-mail falhando');
    const log = errosLog.join('\n'); assert.match(log, /aviso da denúncia #\d+ não foi enviado/); assert.ok(!/@(?!\*)/.test(log.replace(/\*\*\*@\*\*\*/g, '')) && !log.includes('KBBBBBB2') && !log.includes('Beto-Alvo'), 'o registro não leva e-mail, código nem apelido: ' + log.slice(0, 200));
    /* 8) o Brevo travado não atrasa a resposta ao jogador */
    const S8 = await build({}, { send: () => new Promise(() => {}) }); const t0 = Date.now(); const r8 = await rep(S8, 'apelido'); const dt = Date.now() - t0; assert.equal(r8.body.ok, true); assert.ok(dt < 400, 'a resposta não espera o e-mail: ' + dt + ' ms');
    /* 9) teto por hora: acima do teto não manda, conta; na hora seguinte o próximo e-mail avisa quantas ficaram de fora; tudo continua salvo */
    const S9 = await build({ REPORT_MAIL_MAX_PER_HOUR: '2' }); assert.equal(S9.info.maximo_por_hora, 2); const c9 = (await q('SELECT count(*)::int AS n FROM reports')).rows[0].n;
    await rep(S9, 'apelido'); await rep(S9, 'comportamento'); await rep(S9, 'outro'); await rep(S9, 'apelido', { code: 'KDDDDDD2' }); await rep(S9, 'comportamento', { code: 'KDDDDDD2' }); await sleep(80);
    assert.equal(S9.outbox.length, 2, 'só 2 e-mails na hora'); assert.equal((await q('SELECT count(*)::int AS n FROM reports')).rows[0].n, c9 + 5, 'as 5 denúncias foram salvas'); assert.ok(!S9.outbox.some((m) => /não vieram por e-mail/.test(m.text)), 'ainda sem aviso de excedente');
    const t = dateOrig(); Date.now = () => t + 3700 * 1000; await rep(S9, 'outro', { code: 'KDDDDDD2' }); await sleep(80); Date.now = dateOrig;
    assert.equal(S9.outbox.length, 3, 'na hora seguinte volta a enviar'); assert.match(S9.outbox[2].text, /mais 3 denúncia\(s\) nesta hora não vieram por e-mail/, 'e avisa quantas ficaram de fora');
    void visit;
  } finally {
    Date.now = dateOrig; console.error = errOrig; await pool.end().catch(() => {}); await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {}); await admin.end().catch(() => {});
  }
});

/* ================= C) guardas estáticos ================= */
test('código: o e-mail é disparado sem esperar, só para denúncia nova, sem dados de quem denunciou, e o estado aparece no diagnóstico', () => {
  const acc = read('accounts.js'), sv = read('server.js');
  assert.match(acc, /RETURNING id, created_at`, \[reporter, target\.id, reason, ctx, note, nm\]\);/, 'só a linha realmente inserida tem id');
  assert.match(acc, /mailReport\(\{ id: ins\.rows\[0\]\.id, reason, context: ctx, name: nm, code: target\.friend_code, note, at: ins\.rows\[0\]\.created_at \}\)\.catch\(\(\) => \{\}\);/, 'sem await e sem dados do denunciante');
  const chamada = acc.slice(acc.indexOf('mailReport({ id:'), acc.indexOf('mailReport({ id:') + 200); assert.doesNotMatch(chamada, /reporter|req\.user|email|token/, 'a chamada não leva nada de quem denunciou');
  assert.doesNotMatch(acc, /await mailReport\(/, 'nunca espera o e-mail');
  assert.match(acc, /const t = await one\('SELECT id, name, friend_code FROM users WHERE id = \$1', \[peer\.uid\]\);/, 'a sala também leva o código');
  assert.match(acc, /process\.env\.REPORT_MAIL_MAX_PER_HOUR === undefined \? 20 :/); assert.match(acc, /reportMailInfo: \(\) => \(\{ ligado:/);
  assert.match(sv, /avisos_de_denuncia_por_email: accounts && accounts\.reportMailInfo \? accounts\.reportMailInfo\(\) : \{ ligado: false \}/);
  assert.match(read('mailer.js'), /NUNCA traz o e-mail, o código nem o apelido de QUEM denunciou/);
});
test('documentos: a política conta que as denúncias chegam por e-mail (sem identificar quem denunciou) e o SEGURANCA.md ensina a configurar', () => {
  const t = read('public/privacidade.html').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const x of ['Brevo', 'aviso de cada denúncia', 'nenhum e-mail de jogador é enviado', 'cada uma chega por e-mail a essa pessoa, sem identificar quem denunciou']) assert.ok(t.includes(x), x);
  const sg = read('SEGURANCA.md'); for (const x of ['REPORT_NOTIFY_EMAIL', 'REPORT_MAIL_MAX_PER_HOUR', 'avisos_de_denuncia_por_email']) assert.ok(sg.includes(x), x);
});
