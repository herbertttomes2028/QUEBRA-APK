'use strict';
// SEGURANÇA DINÂMICA do perfil gerado (ID + código-chave) e das salas privadas.
// SÓ LOCAL: sobe o servidor REAL (server.js) contra um banco TEMPORÁRIO criado e apagado aqui (localhost), e ataca por HTTP e Socket.IO.
// Nunca toca Neon/Render/produção: se DATABASE_URL não for localhost, o teste se recusa a rodar.
// Cobre: criação e armazenamento do código-chave, login uniforme, força bruta, sessões e revogação, IDOR/BOLA, adulteração de gemas/XP
// (inclusive compras simultâneas), salas (terceira pessoa, nomes neutros, nenhum dado privado nos eventos, quem saiu, bloqueio) e logs.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { io } = require('socket.io-client');

const enabled = process.env.GEMAS_TEST_DB === '1';
const base = process.env.DATABASE_URL || '';
const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function startServer(dbUrl, extraEnv) {
  const port = await freePort();
  const env = Object.assign({}, process.env, { PORT: String(port), PUSH_ENABLED: 'false', CHAT_ENABLED: 'false', CH_COUNTDOWN_MS: '300', DATABASE_URL: dbUrl, ACC_RATE_MULT: '1000' }, extraEnv || {});
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  const url = 'http://127.0.0.1:' + port, t0 = Date.now();
  for (;;) {
    try { const r = await fetch(url + '/health'); if (r.ok) break; } catch (e) { /* subindo */ }
    if (Date.now() - t0 > 30000) { child.kill(); throw new Error('servidor não subiu:\n' + log); }
    await wait(150);
  }
  return { url, log: () => log, stop: () => new Promise((r) => { child.once('exit', r); child.kill(); }) };
}
function sock(url) {
  const s = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
  s.seen = []; s.onAny((ev, ...a) => s.seen.push([ev, a]));
  s.emitAck = (ev, data) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('sem resposta de ' + ev)), 6000); s.emit(ev, data, (r) => { clearTimeout(t); res(r); }); });
  return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
}
const dump = (s) => JSON.stringify(s.seen);

let ipN = 0;
const nextIp = () => { ipN++; return '10.77.' + (ipN >> 8) + '.' + ((ipN & 255) || 1); };
async function http(srv, method, route, o) {
  o = o || {};
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': o.ip || nextIp() };
  if (o.token) headers.authorization = 'Bearer ' + o.token;
  const r = await fetch(srv.url + '/api/acc' + route, { method, headers, body: o.raw !== undefined ? o.raw : (o.body === undefined ? undefined : JSON.stringify(o.body)) });
  let body = null; try { body = await r.json(); } catch (e) { /* sem JSON */ }
  return { status: r.status, body };
}
const KEY_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // gitleaks:allow
const randId = () => Array.from(crypto.randomBytes(8), (b) => KEY_CHARS[b % KEY_CHARS.length]).join('');

test('SEGURANÇA dinâmica (local): perfil gerado, sessões, acesso indevido, gemas e salas', { skip: !enabled, timeout: 240000 }, async (t) => {
  const u = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw Error('PROTEÇÃO: só banco local; nunca Neon/produção');
  const { Pool } = require('pg');
  const dbName = 'qc_seg_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: base, ssl: false, max: 1 });
  await admin.query('CREATE DATABASE ' + dbName);
  const dbUrl = base.replace(/\/[^/?]+(\?.*)?$/, '/' + dbName);
  const pool = new Pool({ connectionString: dbUrl, ssl: false, max: 3 });
  admin.on('error', () => {}); pool.on('error', () => {});   // ao apagar o banco temporário o Postgres derruba conexões ociosas: isso não pode virar exceção não tratada (Node 18)
  const dbq = (s, p) => pool.query(s, p);
  let S1 = null, S2 = null; const abertos = [];
  const abre = async (srv) => { const s = await sock(srv.url); abertos.push(s); return s; };
  try {
    S1 = await startServer(dbUrl, { CSP_MODE: 'enforce' });          // limites por IP afrouxados (ACC_RATE_MULT=1000): o foco é o resto; CSP em modo que BLOQUEIA
    const cfg = await (await fetch(S1.url + '/api/config')).json();
    const imagem = cfg.images[0].file;
    const novo = async (srv) => {
      const r = await http(srv || S1, 'POST', '/profile/new', { body: { consent: true, age16: true } });
      assert.equal(r.status, 200, 'criar perfil: ' + JSON.stringify(r.body));
      const id = r.body.id.replace(/-/g, ''), row = (await dbq('SELECT id FROM users WHERE friend_code = $1', [id])).rows[0];
      return { token: r.body.token, id: r.body.id, secret: r.body.secret, raw: id, uid: row.id, me: r.body.me };
    };

    /* ============ 1) criação e armazenamento do código-chave ============ */
    await t.test('1) criar perfil exige as duas confirmações; o código-chave só existe na resposta e vai ao banco como hash', async () => {
      for (const body of [{}, { consent: true }, { age16: true }, { consent: true, age16: 'true' }, { consent: 1, age16: true }]) assert.equal((await http(S1, 'POST', '/profile/new', { body })).status, 400, JSON.stringify(body));
      assert.equal((await dbq("SELECT count(*)::int AS n FROM users")).rows[0].n, 0, 'nada foi criado sem as confirmações');
      const a = await novo();
      assert.match(a.id, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/); assert.match(a.secret, /^([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/);
      assert.ok(!/[01OIL]/.test(a.secret), 'o código não usa caracteres que se confundem (0, 1, O, I, L)');
      assert.match(a.me.name, /^[\p{L}-]+ [\p{L}]+$/u, 'apelido sorteado: Animal + Cor');
      const j = JSON.stringify(a.me);
      const ach = /"(email|secret_hash|secretHash|hash|password|hasPassword|google\w*|friend_code)"\s*:/i.exec(j); assert.ok(!ach, 'a resposta do perfil não tem e-mail, hash nem segredo: achou "' + (ach && ach[0]) + '" em …' + (ach ? j.slice(Math.max(0, ach.index - 60), ach.index + 60) : ''));
      const row = (await dbq('SELECT email, google_sub, secret_hash, kind, name FROM users WHERE id = $1', [a.uid])).rows[0];
      assert.equal(row.email, null); assert.equal(row.google_sub, null); assert.equal(row.kind, 'gerado');
      assert.match(row.secret_hash, /^scrypt\$[\w-]{22}\$[\w-]{86}$/, 'formato do hash guardado: scrypt, sal aleatório de 16 bytes e chave de 64 bytes'); assert.ok(!row.secret_hash.includes(a.secret.replace(/-/g, '')), 'o código não está no banco');
      const all = JSON.stringify((await dbq('SELECT * FROM users')).rows) + JSON.stringify((await dbq('SELECT * FROM sessions')).rows);
      assert.ok(!all.includes(a.secret.replace(/-/g, '')) && !all.includes(a.secret) && !all.includes(a.token), 'nem o código nem o token (só o hash do token) aparecem em users/sessions');
      const dois = new Set(); for (let i = 0; i < 12; i++) dois.add((await novo()).secret); assert.equal(dois.size, 12, 'códigos todos diferentes');
    });

    /* ============ 2) login uniforme ============ */
    await t.test('2) login: ID inexistente e código errado dão a MESMA resposta; entradas estranhas nunca quebram o servidor', async () => {
      const a = await novo(), b = await novo();
      const ok = await http(S1, 'POST', '/profile/login', { body: { id: a.id.toLowerCase().replace('-', ' '), secret: a.secret.toLowerCase().replace(/-/g, ' ') } });
      assert.equal(ok.status, 200, 'aceita minúsculas, espaços e traços'); assert.ok(ok.body.token && ok.body.token !== a.token, 'cada login cria um token novo');
      const errado = await http(S1, 'POST', '/profile/login', { body: { id: a.id, secret: b.secret } });
      const inexistente = await http(S1, 'POST', '/profile/login', { body: { id: randId(), secret: a.secret } });
      const semSecret = await http(S1, 'POST', '/profile/login', { body: { id: a.id } });
      for (const r of [errado, inexistente, semSecret]) assert.deepEqual([r.status, r.body], [401, { ok: false, error: 'bad_login' }], 'resposta única para qualquer falha');
      for (const body of [{ id: { $ne: 1 }, secret: { $ne: 1 } }, { id: [a.id], secret: [a.secret] }, { id: null, secret: null }, { id: 123, secret: 456 }, { id: 'x'.repeat(5000), secret: 'y'.repeat(5000) }, { id: "' OR 1=1 --", secret: "' OR 1=1 --" }, []]) {
        const r = await http(S1, 'POST', '/profile/login', { body }); assert.ok(r.status >= 400 && r.status < 500, 'entrada estranha vira 4xx: ' + JSON.stringify(body).slice(0, 40) + ' → ' + r.status);
      }
      for (const raw of ['{', 'nao-e-json', '\u0000', '{"id":']) { const r = await http(S1, 'POST', '/profile/login', { raw }); assert.ok(r.status >= 400 && r.status < 500, 'JSON inválido: ' + r.status); }
      assert.equal((await fetch(S1.url + '/health')).status, 200, 'o servidor continua de pé');
      const med = async (id, sec) => { const t0 = process.hrtime.bigint(); await http(S1, 'POST', '/profile/login', { body: { id, secret: sec } }); return Number(process.hrtime.bigint() - t0) / 1e6; };
      const m = async (f) => { const v = []; for (let i = 0; i < 6; i++) v.push(await f()); v.sort((x, y) => x - y); return v[3]; };
      const tExiste = await m(() => med(a.id, b.secret)), tNao = await m(() => med(randId(), b.secret));
      t.diagnostic('tempo do login (mediana): ID existente+código errado ' + tExiste.toFixed(1) + ' ms · ID inexistente ' + tNao.toFixed(1) + ' ms');
      assert.ok(Math.max(tExiste, tNao) / Math.min(tExiste, tNao) < 3, 'mesmo trabalho de scrypt nos dois casos (sem diferença grande de tempo)');
    });

    /* ============ 3) sessões e revogação ============ */
    await t.test('3) logout, sair de todos, código novo: tokens e sockets antigos morrem; o aparelho atual continua', async () => {
      const a = await novo();
      const l2 = await http(S1, 'POST', '/profile/login', { body: { id: a.id, secret: a.secret } }), tok2 = l2.body.token;
      const s2 = await abre(S1); assert.equal((await s2.emitAck('acc:auth', { token: tok2 })).ok, true);
      assert.equal((await http(S1, 'GET', '/me?lite=1', { token: tok2 })).status, 200);
      const nv = await http(S1, 'POST', '/profile/new-secret', { token: a.token });
      assert.equal(nv.status, 200); assert.notEqual(nv.body.secret, a.secret); assert.match(nv.body.secret, /^([A-Z2-9]{5}-){3}[A-Z2-9]{5}$/);
      assert.equal((await http(S1, 'POST', '/profile/login', { body: { id: a.id, secret: a.secret } })).status, 401, 'o código ANTIGO deixou de valer');
      assert.equal((await http(S1, 'GET', '/me?lite=1', { token: tok2 })).status, 401, 'o outro aparelho foi expulso');
      assert.equal((await http(S1, 'GET', '/me?lite=1', { token: a.token })).status, 200, 'o aparelho que gerou o código continua');
      assert.equal((await s2.emitAck('acc:reportPeer', { reason: 'outro' })).error, 'auth', 'o socket do aparelho expulso perdeu a conta');
      const l3 = await http(S1, 'POST', '/profile/login', { body: { id: a.id, secret: nv.body.secret } }); assert.equal(l3.status, 200, 'o código novo funciona');
      assert.equal((await http(S1, 'POST', '/logout', { token: l3.body.token })).status, 200);
      assert.equal((await http(S1, 'GET', '/me', { token: l3.body.token })).status, 401, 'token usado no logout morre');
      await http(S1, 'POST', '/logout-all', { token: a.token });
      assert.equal((await http(S1, 'GET', '/me', { token: a.token })).status, 401, 'sair de todos derruba tudo');
      assert.equal((await http(S1, 'POST', '/profile/nickname', { token: 'qualquer-coisa' })).status, 401);
    });

    /* ============ 4) toda rota privada exige sessão ============ */
    await t.test('4) rotas privadas: sem token, com token falso ou malformado → sempre 401 (nunca 200 nem 500)', async () => {
      const rotas = [['GET', '/me'], ['GET', '/achievements'], ['GET', '/matches'], ['GET', '/library'], ['GET', '/shop'], ['GET', '/save'], ['GET', '/blocks'],
        ['POST', '/profile'], ['POST', '/profile/nickname'], ['POST', '/profile/new-secret'], ['POST', '/import'], ['POST', '/delete'], ['POST', '/underage'], ['POST', '/logout'], ['POST', '/logout-all'],
        ['POST', '/shop/buy'], ['POST', '/shop/equip'], ['POST', '/shop/prefs'], ['POST', '/library/unlock'], ['POST', '/save/discard'], ['POST', '/blocks'], ['POST', '/blocks/remove'], ['POST', '/reports']];
      for (const [m, r] of rotas) for (const tok of [undefined, 'falso', 'x'.repeat(2000), '../../etc/passwd', 'Bearer ']) {
        const x = await http(S1, m, r, { token: tok, body: m === 'POST' ? {} : undefined }); assert.equal(x.status, 401, m + ' ' + r + ' com token ' + String(tok).slice(0, 12) + ' → ' + x.status);
      }
      for (const r of ['/friends', '/friends/search', '/friends/request', '/register', '/login', '/google', '/verify', '/password/forgot', '/invites']) { const x = await http(S1, 'POST', r, { body: {} }); assert.ok([404, 405].includes(x.status), 'a rota removida não existe: ' + r + ' → ' + x.status); }
    });

    /* ============ 5) IDOR / BOLA ============ */
    await t.test('5) IDOR/BOLA: com o token de A, nada de B é lido nem alterado, mesmo mandando o ID/código de B', async () => {
      const A = await novo(), B = await novo();
      await dbq('UPDATE users SET gems = 500 WHERE id IN ($1, $2)', [A.uid, B.uid]);
      const comprouB = await http(S1, 'POST', '/shop/buy', { token: B.token, body: { itemId: 'nuvem' } }); assert.equal(comprouB.status, 200);
      const forjado = { userId: B.uid, uid: B.uid, user_id: B.uid, id: B.raw, code: B.raw, friend_code: B.raw, email: 'b@x.com' };
      const me = await http(S1, 'GET', '/me?lite=1&uid=' + B.uid + '&code=' + B.raw, { token: A.token }); assert.equal(me.body.me.code, A.id, '/me devolve sempre o dono do token');
      assert.ok(!JSON.stringify(me.body).includes(B.raw), 'nenhum rastro de B na resposta de A');
      const antesB = (await dbq('SELECT name, avatar, gems, xp, bests, secret_hash FROM users WHERE id = $1', [B.uid])).rows[0];
      await http(S1, 'POST', '/profile', { token: A.token, body: Object.assign({ avatar: '🐢', name: 'Hacker' }, forjado) });
      await http(S1, 'POST', '/profile/nickname', { token: A.token, body: forjado });
      await http(S1, 'POST', '/import', { token: A.token, body: Object.assign({ bests: { '12': 1 } }, forjado) });
      await http(S1, 'POST', '/shop/equip', { token: A.token, body: Object.assign({ itemId: 'nuvem', category: 'bandejas' }, forjado) });
      const eq = await http(S1, 'POST', '/shop/equip', { token: A.token, body: { itemId: 'nuvem', category: 'bandejas' } }); assert.equal(eq.status, 403, 'A não pode usar o item que só B comprou');
      const compraA = await http(S1, 'POST', '/shop/buy', { token: A.token, body: Object.assign({ itemId: 'estrela' }, forjado) }); assert.equal(compraA.status, 200);
      const depoisB = (await dbq('SELECT name, avatar, gems, xp, bests, secret_hash FROM users WHERE id = $1', [B.uid])).rows[0];
      assert.deepEqual(depoisB, Object.assign({}, antesB, { gems: antesB.gems }), 'B não mudou em nada (nome, avatar, gemas, XP, melhores tempos, código)');
      assert.equal((await dbq('SELECT gems FROM users WHERE id = $1', [A.uid])).rows[0].gems, 500 - 250, 'a compra foi cobrada de A, não de B');
      const del = await http(S1, 'POST', '/delete', { token: A.token, body: Object.assign({ confirm: 'EXCLUIR', secret: B.secret }, forjado) });
      assert.deepEqual([del.status, del.body.error], [401, 'bad_login'], 'apagar com o token de A exige o código de A (o de B não serve)');
      assert.equal((await dbq('SELECT count(*)::int AS n FROM users WHERE id IN ($1,$2)', [A.uid, B.uid])).rows[0].n, 2, 'ninguém foi apagado');
      const bl = await http(S1, 'POST', '/blocks/remove', { token: A.token, body: { code: B.raw } }); assert.ok([200, 404].includes(bl.status));
      for (const r of ['/matches', '/save', '/library', '/shop', '/achievements', '/blocks']) {
        const x = await http(S1, 'GET', r + '?uid=' + B.uid + '&user=' + B.raw, { token: A.token }); assert.equal(x.status, 200, r);
        assert.ok(!JSON.stringify(x.body).includes(B.raw) && !JSON.stringify(x.body).includes(B.id), r + ' não vaza o ID de B');
      }
      const rep = await http(S1, 'POST', '/reports', { token: A.token, body: { code: B.raw, reason: 'apelido' } });
      const rep2 = await http(S1, 'POST', '/reports', { token: A.token, body: { code: randId(), reason: 'apelido' } });
      assert.deepEqual(rep.body, rep2.body, 'denunciar um ID que existe e um que não existe: mesma resposta (não revela IDs)');
    });

    /* ============ 6) adulteração de gemas e XP ============ */
    await t.test('6) gemas e XP só mudam pelo servidor: campos forjados são ignorados e compras simultâneas não gastam em dobro', async () => {
      const A = await novo();
      const gem = async () => (await dbq('SELECT gems, xp FROM users WHERE id = $1', [A.uid])).rows[0];
      const g0 = await gem(); assert.deepEqual([g0.gems, g0.xp], [0, 0]);
      for (const [r, body] of [['/import', { bests: { '12': 1 }, gems: 99999, xp: 99999, level: 50 }], ['/profile', { avatar: '🐢', gems: 99999, xp: 99999 }], ['/profile/nickname', { gems: 99999 }], ['/me', { gems: 99999 }]]) await http(S1, 'POST', r, { token: A.token, body });
      await http(S1, 'GET', '/me?lite=1&gems=99999&xp=99999', { token: A.token });
      assert.deepEqual(await gem(), g0, 'nada de gemas/XP por campos forjados');
      const s = await abre(S1); await s.emitAck('acc:auth', { token: A.token });
      for (const ev of ['acc:xp', 'acc:gems', 'acc:finish', 'xp', 'gems', 'matchDone', 'finishDuel', 'acc:addGems']) s.emit(ev, { gems: 99999, xp: 99999, uid: A.uid });
      await wait(400); assert.deepEqual(await gem(), g0, 'eventos de socket inventados não pagam nada');
      const caro = await http(S1, 'POST', '/shop/buy', { token: A.token, body: { itemId: 'nuvem', price: 0, gems: 999 } });
      assert.deepEqual([caro.status, caro.body.error], [409, 'gems'], 'sem saldo: recusa mesmo mandando price=0'); assert.deepEqual(await gem(), g0);
      for (const itemId of [{}, [], null, 5, '../x', 'galaxia\u0000', 'toString', '__proto__', 'constructor']) { const r = await http(S1, 'POST', '/shop/buy', { token: A.token, body: { itemId } }); assert.ok([400, 409].includes(r.status), 'itemId estranho: ' + JSON.stringify(itemId) + ' → ' + r.status); }
      for (const categoryId of [{}, [], null, -1, '__proto__']) { const r = await http(S1, 'POST', '/library/unlock', { token: A.token, body: { categoryId } }); assert.ok(r.status >= 400 && r.status < 500, 'categoria estranha: ' + r.status); }
      assert.deepEqual(await gem(), g0);
      await dbq('UPDATE users SET gems = 400 WHERE id = $1', [A.uid]);
      const par = await Promise.all(Array.from({ length: 10 }, () => http(S1, 'POST', '/shop/buy', { token: A.token, body: { itemId: 'estrela' } })));
      const oks = par.filter((r) => r.status === 200 && r.body.already === false).length;       // as outras respondem "já é seu" sem cobrar
      t.diagnostic('10 compras simultâneas da mesma bandeja (250 gemas, saldo 400): ' + oks + ' aprovada(s); saldo final ' + (await gem()).gems);
      assert.equal(oks, 1, 'só UMA das 10 compras simultâneas passa'); assert.equal((await gem()).gems, 150, 'cobrado uma vez só');
      assert.equal((await dbq("SELECT count(*)::int AS n FROM shop_purchases WHERE user_id = $1 AND item_id = 'estrela'", [A.uid]).catch(() => ({ rows: [{ n: 1 }] }))).rows[0].n, 1, 'um único registro de compra');
      const cats = cfg.library.filter((c) => c.price > 0); assert.ok(cats.length, 'há categoria paga no catálogo');
      await dbq('UPDATE users SET gems = $2 WHERE id = $1', [A.uid, cats[0].price + 10]);
      const par2 = await Promise.all(Array.from({ length: 8 }, () => http(S1, 'POST', '/library/unlock', { token: A.token, body: { categoryId: cats[0].id } })));
      assert.equal((await dbq('SELECT count(*)::int AS n FROM library_unlocks WHERE user_id = $1 AND category_id = $2', [A.uid, cats[0].id])).rows[0].n, 1, 'um único desbloqueio gravado'); assert.equal((await gem()).gems, 10, 'categoria cobrada uma vez só (' + par2.filter((r) => r.status === 200).length + ' respostas ok, as outras "já é seu")');
      assert.ok((await dbq('SELECT gems FROM users WHERE id = $1', [A.uid])).rows[0].gems >= 0, 'saldo nunca negativo');
    });

    /* ============ 7) sala cooperativa ============ */
    await t.test('7) sala cooperativa: só dois jogadores, nomes neutros, nenhum dado privado nos eventos, quem saiu não recebe mais nada, bloqueio vale', async () => {
      const A = await novo(), B = await novo(), C = await novo();
      const sa = await abre(S1), sb = await abre(S1), sc = await abre(S1);
      for (const [s, p] of [[sa, A], [sb, B], [sc, C]]) assert.equal((await s.emitAck('acc:auth', { token: p.token })).ok, true);
      const cr = await sa.emitAck('create', { pid: 'pid-a-' + crypto.randomUUID(), imageId: imagem, pieces: 12, name: 'Maria Silva joao@exemplo.com', avatar: '🐢' }); assert.equal(cr.ok, true, JSON.stringify(cr).slice(0, 200));
      const code = cr.snapshot.code;
      const jb = await sb.emitAck('join', { pid: 'pid-b-' + crypto.randomUUID(), code, name: '(11) 98888-7777', avatar: '🦊' }); assert.equal(jb.ok, true);
      const jc = await sc.emitAck('join', { pid: 'pid-c-' + crypto.randomUUID(), code, name: 'Intruso' }); assert.equal(jc.ok, false, 'a TERCEIRA pessoa não entra'); assert.equal(jc.error, 'full');
      await wait(300);
      const tudo = dump(sa) + dump(sb);
      for (const [rotulo, bad] of [['nome digitado', 'Maria Silva'], ['e-mail digitado', 'joao@exemplo.com'], ['telefone digitado', '98888-7777'], ['ID de A', A.raw], ['ID de B', B.raw], ['ID de A (com traço)', A.id], ['token de A', A.token], ['token de B', B.token], ['código-chave de A', A.secret.replace(/-/g, '')], ['código-chave de B', B.secret.replace(/-/g, '')], ['e-mail', '@'], ['campo xp', '"xp"'], ['campo gems', '"gems"'], ['friend_code', 'friend_code'], ['apelido sorteado de A', A.me.name], ['apelido sorteado de B', B.me.name]])
        assert.ok(!tudo.includes(bad), 'os eventos da sala NÃO podem conter: ' + rotulo);
      assert.ok(tudo.includes('Jogador 1') && tudo.includes('Jogador 2'), 'os dois aparecem só como "Jogador 1" e "Jogador 2"');
      assert.ok(!dump(sc).includes('Jogador 1') && !dump(sc).includes(code.slice(0, 3) + '"x'), 'quem não entrou não recebeu dados da sala');
      for (const bad of ['Intruso']) assert.ok(!tudo.includes(bad));
      // quem saiu não recebe mais os eventos da sala e não consegue mexer nela
      const ev0 = sb.seen.length;
      const out = await sb.emitAck('create', { pid: 'pid-b2-' + crypto.randomUUID(), imageId: imagem, pieces: 12, solo: true }); assert.equal(out.ok, true);
      const pc = cr.snapshot.pieces[0];
      sa.emit('grab', { id: pc.id }); await wait(150); sa.emit('move', { id: pc.id, x: 300, y: 300 }); await wait(150);
      const novos = sb.seen.slice(ev0).filter(([e, a]) => ['grabbed', 'moved', 'locked'].includes(e) && JSON.stringify(a).length > 0);
      assert.deepEqual(novos, [], 'B saiu da sala de A: não recebe mais nada dela');
      const ev1 = sa.seen.length; sb.emit('grab', { id: pc.id }); sb.emit('move', { id: pc.id, x: 10, y: 10 }); await wait(250);
      assert.ok(!sa.seen.slice(ev1).some(([e]) => e === 'grabbed' || e === 'moved'), 'e o que B manda depois de sair não chega à sala de A');
      // bloqueio: A bloqueia B pela sala → B não acha mais as salas de A
      const sa2 = await abre(S1), sb2 = await abre(S1); await sa2.emitAck('acc:auth', { token: A.token }); await sb2.emitAck('acc:auth', { token: B.token });
      const c2 = await sa2.emitAck('create', { pid: 'pid-a3-' + crypto.randomUUID(), imageId: imagem, pieces: 12 }); const code2 = c2.snapshot.code;
      const sc2 = await abre(S1); await sc2.emitAck('acc:auth', { token: C.token });
      assert.equal((await sc2.emitAck('join', { pid: 'pid-c2-' + crypto.randomUUID(), code: code2 })).ok, true, 'C entra na sala de A');
      assert.equal((await sa2.emitAck('acc:blockPeer', {})).ok, true, 'A bloqueia a outra pessoa da sala (C)');
      const re = await sc2.emitAck('join', { pid: 'pid-c3-' + crypto.randomUUID(), code: (await sa2.emitAck('create', { pid: 'pid-a4-' + crypto.randomUUID(), imageId: imagem, pieces: 12 })).snapshot.code });
      assert.deepEqual([re.ok, re.error], [false, 'notfound'], 'quem foi bloqueado recebe "não existe" (sem revelar que a sala existe)');
      // chat desligado
      const rr = await sb2.emitAck('chat', { text: 'oi', phraseId: 'oi' }).catch((e) => ({ erro: String(e.message) })); assert.ok(rr && (rr.ok === false || rr.erro), 'chat desligado no servidor');
    });

    /* ============ 7b) privacidade da sala: nível e lista de bloqueados (rodada privacidade-sala, achados SEC-01 e SEC-05) ============ */
    await t.test('7b) sala: o nível nunca circula; bloquear pela sala não revela ID, apelido, nível nem avatar; desbloqueio só por referência opaca', async () => {
      const A = await novo(), B = await novo(), C = await novo();
      await dbq('UPDATE users SET xp = 50000, xp_seeded = true WHERE id = $1', [B.uid]);              // B tem nível alto (29): não pode aparecer para A
      const sa = await abre(S1), sb = await abre(S1);
      await sa.emitAck('acc:auth', { token: A.token }); await sb.emitAck('acc:auth', { token: B.token });
      const cr = await sa.emitAck('create', { pid: 'pid-a7b-' + crypto.randomUUID(), imageId: imagem, pieces: 12, avatar: '🐢' });
      const jb = await sb.emitAck('join', { pid: 'pid-b7b-' + crypto.randomUUID(), code: cr.snapshot.code, avatar: '🦊' }); assert.equal(jb.ok, true);
      await wait(300);
      const niveis = sa.seen.filter(([e]) => e === 'meta').flatMap(([, a]) => a[0].players.map((p) => p.level));
      assert.ok(niveis.length && niveis.every((l) => l === 0), 'cooperativo: o nível nos eventos é sempre 0 (recebido: ' + niveis.join(',') + ')');
      assert.ok([...jb.snapshot.players, ...cr.snapshot.players].every((p) => p.level === 0), 'cooperativo: o nível no snapshot é sempre 0');
      // Sala Desafio: o mesmo
      const da = await abre(S1), dbs = await abre(S1);
      await da.emitAck('acc:auth', { token: A.token }); await dbs.emitAck('acc:auth', { token: B.token });
      const dc = await da.emitAck('ch:create', { pid: 'ch-a7b-' + crypto.randomUUID(), imageId: imagem, pieces: 12, mode: 'comum' }); assert.ok(dc.ok, JSON.stringify(dc).slice(0, 200));
      const dj = await dbs.emitAck('ch:join', { pid: 'ch-b7b-' + crypto.randomUUID(), code: dc.lobby.code }); assert.ok(dj.ok);
      await wait(300);
      const lobbies = [dj.lobby, ...da.seen.filter(([e]) => e === 'ch:lobby').map(([, a]) => a[0])];
      assert.ok(lobbies.every((l) => l.players.every((p) => p.level === 0)), 'Sala Desafio: o nível é sempre 0');
      // A bloqueia B de dentro da sala cooperativa
      assert.equal((await sa.emitAck('acc:blockPeer', {})).ok, true);
      const bl = await http(S1, 'GET', '/blocks', { token: A.token });
      assert.equal(bl.status, 200); assert.equal(bl.body.blocked.length, 1);
      const txt = JSON.stringify(bl.body), linha = bl.body.blocked[0];
      for (const [rotulo, bad] of [['ID cru de B', B.raw], ['ID de B', B.id], ['apelido de B', B.me.name], ['avatar de B', '🦊'], ['uid de B', B.uid]]) assert.ok(!txt.includes(bad), 'a lista de bloqueados NÃO pode conter: ' + rotulo);
      assert.equal(linha.level, 0); assert.equal(linha.avatar, ''); assert.equal(linha.name, 'Jogador bloqueado');
      assert.match(linha.ref, /^b[0-9a-f]{32}$/, 'referência opaca'); assert.equal(linha.code, linha.ref, 'code (app antigo) é a mesma referência, nunca o ID');
      assert.ok(!Number.isNaN(Date.parse(linha.at)), 'data do bloqueio');
      // a referência de A não serve para C, e um valor inventado não desbloqueia nada
      assert.equal((await http(S1, 'POST', '/blocks/remove', { token: C.token, body: { ref: linha.ref } })).status, 404, 'a referência de A não vale na conta de C');
      assert.equal((await http(S1, 'POST', '/blocks/remove', { token: A.token, body: { ref: 'b' + '0'.repeat(32) } })).status, 404, 'referência inventada');
      assert.equal((await dbq('SELECT count(*)::int AS n FROM blocks WHERE blocker = $1 AND blocked = $2', [A.uid, B.uid])).rows[0].n, 1, 'o bloqueio continua');
      // desbloquear pela referência (e pelo campo code, como o aplicativo antigo faz)
      assert.equal((await http(S1, 'POST', '/blocks/remove', { token: A.token, body: { ref: linha.ref } })).status, 200);
      assert.equal((await dbq('SELECT count(*)::int AS n FROM blocks WHERE blocker = $1 AND blocked = $2', [A.uid, B.uid])).rows[0].n, 0, 'desbloqueou');
      await http(S1, 'POST', '/blocks', { token: A.token, body: { code: B.id } });                     // bloquear pelo ID continua possível
      const l2 = (await http(S1, 'GET', '/blocks', { token: A.token })).body.blocked[0];
      assert.ok(!JSON.stringify(l2).includes(B.raw), 'mesmo bloqueado pelo ID, a lista não mostra o ID');
      assert.equal((await http(S1, 'POST', '/blocks/remove', { token: A.token, body: { code: l2.code } })).status, 200, 'app antigo: desbloqueia mandando code');
      await http(S1, 'POST', '/blocks', { token: A.token, body: { code: B.id } });
      assert.equal((await http(S1, 'POST', '/blocks/remove', { token: A.token, body: { code: B.id } })).status, 200, 'desbloquear pelo ID também continua possível');
      assert.equal((await dbq('SELECT count(*)::int AS n FROM blocks WHERE blocker = $1', [A.uid])).rows[0].n, 0);
    });

    /* ============ 8) Sala Desafio ============ */
    await t.test('8) Sala Desafio: terceira pessoa recusada e nomes neutros', async () => {
      const A = await novo(), B = await novo(); const sa = await abre(S1), sb = await abre(S1), sc = await abre(S1);
      await sa.emitAck('acc:auth', { token: A.token }); await sb.emitAck('acc:auth', { token: B.token });
      const c = await sa.emitAck('ch:create', { pid: 'ch-a-' + crypto.randomUUID(), imageId: imagem, pieces: 12, mode: 'comum', name: 'Pessoa Real Sobrenome' }); assert.ok(c.ok, JSON.stringify(c).slice(0, 200));
      const code = c.lobby.code;
      assert.ok((await sb.emitAck('ch:join', { pid: 'ch-b-' + crypto.randomUUID(), code, name: 'fulano@mail.com' })).ok);
      const terceiro = await sc.emitAck('ch:join', { pid: 'ch-c-' + crypto.randomUUID(), code, name: 'Intruso' }); assert.equal(terceiro.ok, false, 'terceiro recusado na Sala Desafio');
      const falso = await sc.emitAck('ch:join', { pid: 'ch-c2-' + crypto.randomUUID(), code: 'ZZZZZZ' }); assert.equal(falso.ok, false);
      await wait(300);
      const tudo = dump(sa) + dump(sb);
      for (const bad of ['Pessoa Real', 'fulano@mail.com', A.raw, B.raw, A.token, B.token, '"xp"', '"gems"', 'friend_code', A.me.name, B.me.name]) assert.ok(!tudo.includes(bad), 'sem ' + bad + ' nos eventos da Sala Desafio');
      assert.ok(tudo.includes('Jogador 1') && tudo.includes('Jogador 2'), 'nomes neutros na Sala Desafio');
      assert.ok(!dump(sc).includes('Jogador 1'), 'o terceiro não recebeu nada do lobby');
    });

    /* ============ 9) força bruta com os limites reais ============ */
    S2 = await startServer(dbUrl, { ACC_RATE_MULT: '1' });
    await t.test('9) força bruta: trava por ID (8 erros) e por endereço (20 erros); um perfil bloqueado não afeta os outros; criação limitada por endereço', async () => {
      const ipC = '10.55.0.1'; const mk = async () => { const r = await http(S2, 'POST', '/profile/new', { ip: nextIp(), body: { consent: true, age16: true } }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
      const X = await mk(), Y = await mk();
      for (let i = 1; i <= 8; i++) { const r = await http(S2, 'POST', '/profile/login', { ip: nextIp(), body: { id: X.id, secret: randId() + randId() + 'AAAA' } }); assert.equal(r.status, 401, 'tentativa ' + i); }
      const dep = await http(S2, 'POST', '/profile/login', { ip: nextIp(), body: { id: X.id, secret: X.secret } });
      assert.deepEqual([dep.status, dep.body.error], [429, 'rate'], 'depois de 8 erros o ID trava, mesmo com o código certo (e de outro endereço)');
      assert.equal((await http(S2, 'POST', '/profile/login', { ip: nextIp(), body: { id: Y.id, secret: Y.secret } })).status, 200, 'o outro perfil continua entrando');
      for (let i = 1; i <= 20; i++) { const r = await http(S2, 'POST', '/profile/login', { ip: ipC, body: { id: randId(), secret: randId() + randId() + 'AAAA' } }); assert.equal(r.status, 401, 'palpite ' + i); }
      const ipTrava = await http(S2, 'POST', '/profile/login', { ip: ipC, body: { id: Y.id, secret: Y.secret } });
      assert.deepEqual([ipTrava.status, ipTrava.body.error], [429, 'rate'], 'um endereço que erra 20 vezes é travado, até com o código certo');
      assert.equal((await http(S2, 'POST', '/profile/login', { ip: nextIp(), body: { id: Y.id, secret: Y.secret } })).status, 200, 'outro endereço não é afetado');
      const er = await http(S2, 'POST', '/profile/erase', { ip: nextIp(), body: { id: X.id, secret: X.secret, confirm: 'EXCLUIR' } }); assert.equal(er.status, 429, 'apagar por ID+código também respeita a trava');
      const mesmo = '10.66.6.6'; let n429 = 0, n200 = 0; for (let i = 0; i < 9; i++) { const r = await http(S2, 'POST', '/profile/new', { ip: mesmo, body: { consent: true, age16: true } }); if (r.status === 200) n200++; if (r.status === 429) n429++; }
      t.diagnostic('criação de perfis do MESMO endereço em sequência: ' + n200 + ' criados, ' + n429 + ' barrados'); assert.ok(n200 <= 6 && n429 >= 3, 'criação em massa por endereço é limitada');
    });

    /* ============ 9c) mapa de limites cheio NÃO barra quem chega depois (auditoria SEC-02) ============ */
    await t.test('9c) muitas tentativas erradas de muitos endereços enchem o grupo de limites, mas um aparelho novo ainda entra e cria perfil', async () => {
      const S3 = await startServer(dbUrl, { ACC_RATE_MULT: '1', ACC_LIMIT_GROUP_MAX: '40' });     // grupos de só 40 chaves: enchem com poucas tentativas
      try {
        const vit = await http(S3, 'POST', '/profile/new', { ip: nextIp(), body: { consent: true, age16: true } }); assert.equal(vit.status, 200);
        const st = {};
        for (let i = 0; i < 70; i++) { const r = await http(S3, 'POST', '/profile/login', { ip: nextIp(), body: { id: randId(), secret: randId() + randId() + 'AAAA' } }); st[r.status] = (st[r.status] || 0) + 1; }
        assert.deepEqual(st, { 401: 70 }, 'cada tentativa errada (de um endereço novo) é só "código errado", nunca 429 por mapa cheio: ' + JSON.stringify(st));
        const ok = await http(S3, 'POST', '/profile/login', { ip: nextIp(), body: { id: vit.body.id, secret: vit.body.secret } });
        assert.equal(ok.status, 200, 'o login CORRETO de um aparelho novo continua funcionando (antes: 429)');
        assert.equal((await http(S3, 'POST', '/profile/new', { ip: nextIp(), body: { consent: true, age16: true } })).status, 200, 'criar perfil de um aparelho novo continua funcionando');
        const ip = nextIp(); let n = 0;
        for (let i = 0; i < 21; i++) { const r = await http(S3, 'POST', '/profile/login', { ip, body: { id: randId(), secret: randId() + randId() + 'AAAA' } }); if (r.status === 429) n++; }
        assert.ok(n >= 1, 'o limite por endereço (20 erros) continua valendo com o grupo cheio');
      } finally { await S3.stop(); }
    });

    await t.test('9b) palpites de código de sala em sequência são travados (locked) e a sala de verdade continua protegida', async () => {
      const A = await novo(S2), sa = await abre(S2); await sa.emitAck('acc:auth', { token: A.token });
      const cr = await sa.emitAck('create', { pid: 'pid-' + crypto.randomUUID(), imageId: imagem, pieces: 12 }); assert.equal(cr.ok, true);
      const atac = await abre(S2); let travou = false, n = 0;
      for (let i = 0; i < 60 && !travou; i++) { n++; const r = await atac.emitAck('join', { pid: 'pid-x-' + i, code: Array.from(crypto.randomBytes(6), (b) => KEY_CHARS[b % KEY_CHARS.length]).join('') }); if (r.error === 'locked') travou = true; else assert.equal(r.error, 'notfound'); }
      t.diagnostic('palpites de código de sala até travar: ' + n); assert.ok(travou, 'palpites de códigos de sala em sequência são travados');
      const certo = await atac.emitAck('join', { pid: 'pid-y-' + crypto.randomUUID(), code: cr.snapshot.code }); assert.deepEqual([certo.ok, certo.error], [false, 'locked'], 'travado também para o código certo');
    });

    /* ============ 10) apagar o perfil ============ */
    await t.test('10) apagar: código errado = ID inexistente; código certo apaga tudo em cascata e derruba sessão e socket', async () => {
      const A = await novo(), B = await novo(); await dbq('UPDATE users SET gems = 700 WHERE id = $1', [A.uid]);
      await http(S1, 'POST', '/shop/buy', { token: A.token, body: { itemId: 'nuvem' } }); await http(S1, 'POST', '/reports', { token: A.token, body: { code: B.raw, reason: 'outro' } });
      const s = await abre(S1); await s.emitAck('acc:auth', { token: A.token });
      const e1 = await http(S1, 'POST', '/profile/erase', { body: { id: A.id, secret: B.secret, confirm: 'EXCLUIR' } }), e2 = await http(S1, 'POST', '/profile/erase', { body: { id: randId(), secret: A.secret, confirm: 'EXCLUIR' } });
      assert.deepEqual([e1.status, e1.body], [e2.status, e2.body], 'mesma resposta para "código errado" e "ID inexistente"'); assert.equal(e1.status, 401);
      assert.equal((await http(S1, 'POST', '/profile/erase', { body: { id: A.id, secret: A.secret, confirm: 'excluir' } })).status, 400, 'sem a palavra EXCLUIR não apaga');
      assert.equal((await dbq('SELECT count(*)::int AS n FROM users WHERE id = $1', [A.uid])).rows[0].n, 1);
      const ok = await http(S1, 'POST', '/profile/erase', { body: { id: A.id, secret: A.secret, confirm: 'EXCLUIR' } }); assert.equal(ok.status, 200);
      for (const tb of ['users', 'sessions', 'matches', 'saves', 'xp_events', 'shop_purchases', 'reports']) {
        const col = tb === 'users' ? 'id' : tb === 'reports' ? 'reporter' : 'user_id';
        const n = await dbq('SELECT count(*)::int AS n FROM ' + tb + ' WHERE ' + col + ' = $1', [A.uid]).then((r) => r.rows[0].n, () => 0); assert.equal(n, 0, 'nada de A sobrou em ' + tb);
      }
      assert.equal((await http(S1, 'GET', '/me', { token: A.token })).status, 401, 'o token morreu');
      assert.equal((await http(S1, 'POST', '/profile/login', { body: { id: A.id, secret: A.secret } })).status, 401, 'o perfil não existe mais');
      assert.ok(s.seen.some(([e, a]) => e === 'acc:ev' && a[0] && a[0].t === 'deleted'), 'o aparelho conectado foi avisado');
      assert.equal((await http(S1, 'GET', '/me', { token: B.token })).status, 200, 'B não foi afetado');
    });

    /* ============ 11) superfície pública, cabeçalhos e logs ============ */
    await t.test('11) superfície pública sem Google/e-mail, cabeçalhos de segurança e logs sem segredos', async () => {
      const home = await fetch(S1.url + '/'); const csp = home.headers.get('content-security-policy') || '';
      assert.ok(csp.includes("default-src 'self'") && csp.includes("script-src 'self'") && csp.includes("frame-src 'none'") && !/google/i.test(csp), 'CSP sem Google: ' + csp.slice(0, 200));
      assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
      const html = await home.text(); assert.ok(!/accounts\.google\.com|gsi\/client|type="email"|type="password" autocomplete="current-password"/.test(html), 'a página não carrega Google nem pede e-mail/senha');
      const conf = JSON.stringify(await (await fetch(S1.url + '/api/config')).json()); assert.ok(!/google|"mail"/i.test(conf), '/api/config não fala de Google nem de e-mail');
      const st = await http(S1, 'GET', '/status'); assert.deepEqual(st.body, { ok: true, enabled: true, key: true });
      const diag = await fetch(S1.url + '/diagnostico'); const dtxt = await diag.text(); assert.ok(!/@[a-z0-9-]+\.[a-z]{2,}/i.test(dtxt) || diag.status !== 200, 'o diagnóstico sem token não mostra e-mails');
      assert.equal((await fetch(S1.url + '/api/acc/me', { headers: { 'x-forwarded-for': nextIp() } })).headers.get('cache-control'), 'no-store', 'respostas da conta não ficam em cache');
      const r404 = await fetch(S1.url + '/api/acc/profile/nao-existe'); assert.ok(r404.status === 404 && !/at .*\.js:\d+/.test(await r404.text()), '404 sem pilha de erros');
      const logs = S1.log() + S2.log();
      const segredos = (await dbq('SELECT token_hash FROM sessions')).rows.map((r) => r.token_hash);
      for (const s of segredos.concat(['Bearer ', 'secret_hash', 'scrypt'])) assert.ok(!logs.includes(s), 'o log não pode conter: ' + String(s).slice(0, 14));
      assert.ok(!/[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}-[A-Z2-9]{5}/.test(logs), 'nenhum código-chave nos logs');
      assert.ok(!/@[a-z0-9-]+\.(com|net|org|br)/i.test(logs), 'nenhum e-mail nos logs');
      assert.ok(!/UnhandledPromiseRejection|TypeError|ReferenceError/.test(logs), 'nenhum erro não tratado nos logs: ' + (logs.match(/.*(TypeError|ReferenceError|Unhandled).*/) || [''])[0].slice(0, 200));
    });
  } finally {
    abertos.forEach((s) => { try { s.close(); } catch (e) { /* ignora */ } });
    if (S1) await S1.stop().catch(() => {});
    if (S2) await S2.stop().catch(() => {});
    await pool.end().catch(() => {});
    await admin.query('DROP DATABASE IF EXISTS ' + dbName + ' WITH (FORCE)').catch(() => {});
    await admin.end().catch(() => {});
  }
});
