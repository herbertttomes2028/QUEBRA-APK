'use strict';
// ANÚNCIOS RECOMPENSADOS (dinâmico, SÓ LOCAL): sobe o servidor REAL (server.js) contra um banco TEMPORÁRIO (localhost) em três modos:
// desligado (padrão), simulado e teste. Nunca toca Neon/Render nem o Google: no modo "teste" só se conferem cabeçalhos, /ads.txt e /api/acc/ads.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

const enabled = process.env.GEMAS_TEST_DB === '1';
const base = process.env.DATABASE_URL || '';
const ROOT = path.join(__dirname, '..');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

async function startServer(dbUrl, extraEnv) {
  const port = await freePort();
  const env = Object.assign({}, process.env, { PORT: String(port), PUSH_ENABLED: 'false', DATABASE_URL: dbUrl, ACC_RATE_MULT: '1000', ADS_MODO: '', ADS_CLIENT: '' }, extraEnv || {});
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  const url = 'http://127.0.0.1:' + port, t0 = Date.now();
  for (;;) {
    try { const r = await fetch(url + '/health'); if (r.ok) break; } catch (e) { /* subindo */ }
    if (Date.now() - t0 > 30000) { child.kill(); throw new Error('servidor não subiu:\n' + log); }
    await wait(150);
  }
  return { url, log: () => log, stop: () => new Promise((r) => { if (child.exitCode !== null || child.signalCode) return r(); child.once('exit', r); child.kill(); }) };
}
let ipN = 0;
async function http(srv, method, route, o) {
  o = o || {}; ipN++;
  const headers = { 'content-type': 'application/json', 'x-forwarded-for': '10.88.' + (ipN >> 8) + '.' + ((ipN & 255) || 1) };
  if (o.token) headers.authorization = 'Bearer ' + o.token;
  const r = await fetch(srv.url + '/api/acc' + route, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  let body = null; try { body = await r.json(); } catch (e) { /* sem JSON */ }
  return { status: r.status, body };
}

test('anúncios recompensados (local): desligado por padrão, simulado com limites, teste só com ca-pub válido', { skip: !enabled, timeout: 180000 }, async (t) => {
  const u = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw Error('PROTEÇÃO: só banco local; nunca Neon/produção');
  const { Pool } = require('pg');
  const dbName = 'qc_ads_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: base, ssl: false, max: 1 });
  await admin.query('CREATE DATABASE ' + dbName);
  const dbUrl = base.replace(/\/[^/?]+(\?.*)?$/, '/' + dbName);
  const pool = new Pool({ connectionString: dbUrl, ssl: false, max: 3 });
  admin.on('error', () => {}); pool.on('error', () => {});
  const dbq = (s, p) => pool.query(s, p);
  const servers = [];
  const up = async (env) => { const s = await startServer(dbUrl, env); servers.push(s); return s; };
  const novo = async (srv) => {
    const r = await http(srv, 'POST', '/profile/new', { body: { consent: true, age16: true } });
    assert.equal(r.status, 200, 'criar perfil: ' + JSON.stringify(r.body));
    const row = (await dbq('SELECT id FROM users WHERE friend_code = $1', [r.body.id.replace(/-/g, '')])).rows[0];
    return { token: r.body.token, uid: row.id };
  };
  const gems = async (uid) => (await dbq('SELECT gems FROM users WHERE id = $1', [uid])).rows[0].gems;
  const adRows = async (uid) => (await dbq("SELECT ref, amount FROM gem_events WHERE user_id = $1 AND kind = 'ad' ORDER BY created_at", [uid])).rows;
  const voltaNoTempo = (uid) => dbq("UPDATE gem_events SET created_at = created_at - interval '10 minutes' WHERE user_id = $1 AND kind = 'ad'", [uid]);
  try {
    await t.test('desligado (sem ADS_MODO): nada muda; rotas fechadas, política sem anúncios, CSP sem Google, sem /ads.txt', async () => {
      const S = await up({});
      const a = await novo(S);
      assert.deepEqual((await http(S, 'GET', '/ads', { token: a.token })).body, { ok: true, modo: 'desligado' });
      assert.equal((await http(S, 'POST', '/ads/start', { token: a.token })).status, 404);
      assert.equal((await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: 'x' } })).status, 404);
      assert.equal((await fetch(S.url + '/ads.txt')).status, 404);
      const pr = await fetch(S.url + '/privacidade.html'); const html = await pr.text();
      assert.equal(pr.status, 200); assert.match(html, /Não há anúncios, compras com dinheiro real/); assert.doesNotMatch(html, /AdSense|id="anuncios"|ANUNCIOS-->/);
      const csp = pr.headers.get('content-security-policy-report-only') || '';
      assert.match(csp, /frame-src 'none'/); assert.doesNotMatch(csp, /google/i);
      assert.doesNotMatch(pr.headers.get('permissions-policy'), /browsing-topics/);
      await S.stop();
    });

    await t.test('simulado: ficha de uso único, tempo mínimo, valor do servidor, intervalo e limite por dia', async () => {
      const S = await up({ ADS_MODO: 'simulado', ADS_GEMAS: '2', ADS_LIMITE_DIA: '2', ADS_INTERVALO_S: '30' });
      assert.match(S.log(), /\[anúncios\] modo simulado, 2 gemas por anúncio, até 2 por dia/);
      assert.equal((await http(S, 'GET', '/ads')).status, 401, 'visitante (sem perfil) não tem anúncio');
      const a = await novo(S), b = await novo(S);
      const g0 = await gems(a.uid);
      const st = (await http(S, 'GET', '/ads', { token: a.token })).body;
      assert.equal(st.modo, 'simulado'); assert.equal(st.gemas, 2); assert.equal(st.restantes, 2); assert.equal(st.esperar, 0); assert.ok(!('client' in st) || !st.client, 'simulado não tem ca-pub');
      assert.equal((await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: 'inventada' } })).status, 400, 'sem ficha não há gemas');
      // pressa: recompensa logo depois de começar não vale e a ficha morre
      let s1 = (await http(S, 'POST', '/ads/start', { token: a.token })).body; assert.ok(s1.ok && s1.nonce.length >= 20);
      let r = await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: s1.nonce } }); assert.equal(r.status, 400); assert.equal(r.body.error, 'cedo');
      r = await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: s1.nonce } }); assert.equal(r.status, 400); assert.equal(r.body.error, 'ficha', 'a ficha é de uso único');
      // a ficha de B não serve para A
      const sb = (await http(S, 'POST', '/ads/start', { token: b.token })).body;
      assert.equal((await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: sb.nonce } })).status, 400);
      // assistido até o fim: ganha o valor do SERVIDOR, mesmo que o celular mande outro número
      s1 = (await http(S, 'POST', '/ads/start', { token: a.token })).body; await wait(4200);
      r = await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: s1.nonce, gems: 999, ganhou: 999, amount: 999 } });
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.ganhou, 2); assert.equal(r.body.gems, g0 + 2); assert.equal(r.body.restantes, 1);
      assert.equal(await gems(a.uid), g0 + 2); assert.equal((await adRows(a.uid)).length, 1);
      assert.equal((await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: s1.nonce } })).status, 400, 'repetir não paga duas vezes');
      assert.equal(await gems(a.uid), g0 + 2);
      // intervalo mínimo
      r = await http(S, 'POST', '/ads/start', { token: a.token }); assert.equal(r.status, 409); assert.equal(r.body.error, 'cedo'); assert.ok(r.body.esperar > 0 && r.body.esperar <= 30);
      // depois do intervalo, o segundo (e último) do dia
      await voltaNoTempo(a.uid);
      s1 = (await http(S, 'POST', '/ads/start', { token: a.token })).body; assert.ok(s1.ok); await wait(4200);
      r = await http(S, 'POST', '/ads/reward', { token: a.token, body: { nonce: s1.nonce } }); assert.equal(r.body.ganhou, 2); assert.equal(r.body.restantes, 0);
      await voltaNoTempo(a.uid);
      r = await http(S, 'POST', '/ads/start', { token: a.token }); assert.equal(r.status, 409); assert.equal(r.body.error, 'limite');
      assert.equal(await gems(a.uid), g0 + 4); assert.equal((await adRows(a.uid)).length, 2);
      assert.ok((await adRows(a.uid)).every((x) => /^ad:[\w-]{20,}$/.test(x.ref) && x.amount === 2));
      // B não foi afetado por A e ainda pode ver os dele
      assert.equal((await http(S, 'GET', '/ads', { token: b.token })).body.restantes, 2);
      // política mostra a seção de anúncios; /ads.txt só existe com ca-pub (teste/real)
      const html = await (await fetch(S.url + '/privacidade.html')).text();
      assert.match(html, /<h2 id="anuncios">Anúncios<\/h2>/); assert.match(html, /não personalizados/); assert.doesNotMatch(html, /Não há anúncios, compras/); assert.doesNotMatch(html, /ANUNCIOS-->/);
      assert.equal((await fetch(S.url + '/ads.txt')).status, 404);
      // o tipo 'ad' sai junto com o perfil (exclusão em cascata continua valendo)
      await dbq('DELETE FROM users WHERE id = $1', [a.uid]); assert.equal((await adRows(a.uid)).length, 0);
      await S.stop();
    });

    await t.test('teste: só com ca-pub válido; CSP libera o Google e bloqueia Topics/grupos de interesse; /ads.txt oficial', async () => {
      let S = await up({ ADS_MODO: 'teste', ADS_CLIENT: 'pub-123' });
      assert.match(S.log(), /ADS_CLIENT ausente ou inválido/);
      const a = await novo(S);
      assert.equal((await http(S, 'GET', '/ads', { token: a.token })).body.modo, 'desligado', 'ca-pub inválido = desligado');
      await S.stop();
      S = await up({ ADS_MODO: 'teste', ADS_CLIENT: 'ca-pub-1234567890123456' });
      const st = (await http(S, 'GET', '/ads', { token: a.token })).body;
      assert.equal(st.modo, 'teste'); assert.equal(st.client, 'ca-pub-1234567890123456');
      const txt = await fetch(S.url + '/ads.txt'); assert.equal(txt.status, 200);
      assert.equal(await txt.text(), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n');
      const pr = await fetch(S.url + '/');
      const csp = pr.headers.get('content-security-policy-report-only') || '';
      assert.match(csp, /script-src 'self' https:\/\/pagead2\.googlesyndication\.com/); assert.match(csp, /frame-src https:\/\/googleads\.g\.doubleclick\.net/);
      assert.doesNotMatch(csp, /frame-src 'none'/);
      assert.match(pr.headers.get('permissions-policy'), /browsing-topics=\(\), join-ad-interest-group=\(\)$/);
      await S.stop();
    });
  } finally {
    for (const s of servers) await s.stop().catch(() => {});
    await pool.end().catch(() => {});
    await admin.query('DROP DATABASE IF EXISTS ' + dbName + ' WITH (FORCE)').catch(() => {});
    await admin.end().catch(() => {});
  }
});
