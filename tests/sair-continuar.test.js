'use strict';
// "Continuar jogando" no Cooperativo (pedido do proprietário, 16/11/2026):
//  - quem SAI PELO BOTÃO (evento 'leave', ou o disconnect de propósito do celular antigo) encerrou a partida para si:
//    o botão verde "Continuar jogando" NÃO aparece na tela inicial, nem depois que o outro continua encaixando;
//  - quem só CAIU ou FECHOU o aplicativo sem querer continua com o "Continuar jogando";
//  - sair de uma sala NOVA (sem nenhuma peça encaixada) não apaga o progresso salvo de OUTRA partida;
//  - quem ficou na sala segue com o seu progresso salvo; ao concluir, o de quem saiu (agora de outra partida) não é apagado.
// SÓ LOCAL: servidor real contra um banco TEMPORÁRIO no localhost (nunca Neon/produção).
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

async function startServer(dbUrl) {
  const port = await freePort();
  const env = Object.assign({}, process.env, { PORT: String(port), PUSH_ENABLED: 'false', DATABASE_URL: dbUrl, ACC_RATE_MULT: '1000', SAVE_DEBOUNCE_MS: '150', ROOM_CREATES_PER_10MIN: '100' });
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', (d) => { log += d; }); child.stderr.on('data', (d) => { log += d; });
  const url = 'http://127.0.0.1:' + port, t0 = Date.now();
  for (;;) {
    try { if ((await fetch(url + '/health')).ok) break; } catch (e) { /* subindo */ }
    if (Date.now() - t0 > 30000) { child.kill(); throw new Error('servidor não subiu:\n' + log); }
    await wait(150);
  }
  return { url, log: () => log, stop: () => new Promise((r) => { child.once('exit', r); child.kill(); }) };
}
function sock(url) {
  const s = io(url, { transports: ['websocket'], reconnection: false, forceNew: true });
  s.emitAck = (ev, data) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('sem resposta de ' + ev)), 6000); s.emit(ev, data, (r) => { clearTimeout(t); res(r); }); });
  s.once_ = (ev, pred) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('não chegou ' + ev)), 6000); const h = (d) => { if (pred && !pred(d)) return; clearTimeout(t); s.off(ev, h); res(d); }; s.on(ev, h); });
  return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
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

test('Cooperativo: sair pelo botão apaga o "Continuar jogando"; cair ou fechar o app sem querer mantém', { skip: !enabled, timeout: 120000 }, async (t) => {
  const u = new URL(base);
  if (!['127.0.0.1', 'localhost'].includes(u.hostname)) throw Error('PROTEÇÃO: só banco local; nunca Neon/produção');
  const { Pool } = require('pg');
  const dbName = 'qc_sair_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: base, ssl: false, max: 1 });
  await admin.query('CREATE DATABASE ' + dbName);
  const dbUrl = base.replace(/\/[^/?]+(\?.*)?$/, '/' + dbName);
  const pool = new Pool({ connectionString: dbUrl, ssl: false, max: 3 });
  admin.on('error', () => {}); pool.on('error', () => {});
  let S = null; const abertos = [];
  try {
    S = await startServer(dbUrl);
    const img = (await (await fetch(S.url + '/api/config')).json()).images[0].file;
    const novo = async () => { const r = await http(S, 'POST', '/profile/new', { body: { consent: true, age16: true } }); assert.equal(r.status, 200, JSON.stringify(r.body)); return { token: r.body.token }; };
    const continuar = async (p) => { const r = await http(S, 'GET', '/me?lite=1', { token: p.token }); return r.body.me.save; };      // o que a tela inicial usa para o botão verde
    const entra = async (p) => { const s = await sock(S.url); abertos.push(s); assert.equal((await s.emitAck('acc:auth', { token: p.token })).ok, true); return s; };
    const sala = async (A, B, pieces) => {
      const a = await entra(A), b = await entra(B);
      const c = await a.emitAck('create', { pid: 'pid-' + crypto.randomUUID(), imageId: img, pieces: pieces || 12 });
      assert.ok(c.ok, JSON.stringify(c));
      const j = await b.emitAck('join', { pid: 'pid-' + crypto.randomUUID(), code: c.snapshot.code });
      assert.ok(j.ok, JSON.stringify(j));
      return { a, b, snap: c.snapshot };
    };
    const encaixa = async (s, cfg, p, outro) => {
      s.emit('grab', { id: p.id }); await s.once_('grabbed', (d) => d.id === p.id);
      const vai = s.once_('locked', (d) => d.id === p.id);
      s.emit('drop', { id: p.id, x: cfg.BOARD_X + p.col * cfg.TILE + cfg.TILE / 2, y: cfg.BOARD_Y + p.row * cfg.TILE + cfg.TILE / 2 });
      await vai; if (outro) await outro.once_('locked', (d) => d.id === p.id).catch(() => {});
    };
    const esperaSalvo = async (p, quer) => { for (let i = 0; i < 40; i++) { const s = await continuar(p); if (!!s === quer) return s; await wait(100); } return continuar(p); };

    await t.test('1) sair pelo botão (evento leave): o botão verde some para quem saiu e NÃO volta quando o outro continua; quem ficou mantém o seu', async () => {
      const A = await novo(), B = await novo();
      const { a, b, snap } = await sala(A, B);
      await encaixa(a, snap.cfg, snap.pieces[0], b);
      assert.ok(await esperaSalvo(A, true), 'antes de sair: A tem "Continuar jogando"');
      assert.ok(await esperaSalvo(B, true));
      const r = await a.emitAck('leave', {});                       // o que o botão Sair do jogo novo faz (espera a resposta antes de recarregar)
      assert.equal(r.ok, true);
      assert.equal(await continuar(A), null, 'logo depois da resposta, a tela inicial de A já vem SEM o botão verde');
      a.close();
      await encaixa(b, snap.cfg, snap.pieces[1]);                   // quem ficou continua jogando
      await wait(500);
      assert.equal(await continuar(A), null, 'o progresso de quem saiu não volta a ser gravado');
      const sb = await continuar(B);
      assert.ok(sb && sb.locked === 2, 'quem ficou continua com o seu "Continuar jogando" (2 encaixadas): ' + JSON.stringify(sb));
      b.close();
    });

    await t.test('2) celular antigo (sai desconectando de propósito, sem leave): o botão verde também some', async () => {
      const A = await novo(), B = await novo();
      const { a, b, snap } = await sala(A, B);
      await encaixa(a, snap.cfg, snap.pieces[0], b);
      assert.ok(await esperaSalvo(A, true));
      a.disconnect();                                                // reason 'client namespace disconnect' = saída de propósito
      assert.equal(await esperaSalvo(A, false), null);
      b.close();
    });

    await t.test('3) caiu ou fechou o app sem querer: o "Continuar jogando" CONTINUA', async () => {
      const A = await novo(), B = await novo();
      const { a, b, snap } = await sala(A, B);
      await encaixa(a, snap.cfg, snap.pieces[0], b);
      assert.ok(await esperaSalvo(A, true));
      a.io.engine.close();                                           // a conexão cai (transport close), como fechar o app ou perder a internet
      await wait(800);
      assert.ok(await continuar(A), 'quem caiu continua com o botão verde');
      await encaixa(b, snap.cfg, snap.pieces[1]);
      const sa = await esperaSalvo(A, true);
      assert.ok(sa && sa.locked >= 1);
      b.close();
    });

    await t.test('4) sair de uma sala NOVA (nada encaixado) não apaga o progresso de OUTRA partida', async () => {
      const A = await novo(), B = await novo(), C = await novo();
      const s1 = await sala(A, B);
      await encaixa(s1.a, s1.snap.cfg, s1.snap.pieces[0], s1.b);
      assert.ok(await esperaSalvo(A, true));
      s1.a.io.engine.close(); s1.b.close(); await wait(500);         // A caiu da partida 1: o progresso fica
      const s2 = await sala(A, C);                                   // A abre outra partida e sai pelo botão sem encaixar nada
      assert.equal((await s2.a.emitAck('leave', {})).ok, true);
      const sv = await continuar(A);
      assert.ok(sv && sv.locked === 1, 'o progresso da partida 1 continua: ' + JSON.stringify(sv));
      s2.a.close(); s2.b.close();
    });

    await t.test('5) "Continuar jogando" e depois sair pelo botão: o botão verde some', async () => {
      const A = await novo(), B = await novo();
      const s1 = await sala(A, B);
      await encaixa(s1.a, s1.snap.cfg, s1.snap.pieces[0], s1.b);
      assert.ok(await esperaSalvo(A, true));
      s1.a.io.engine.close(); s1.b.close(); await wait(500);
      const a = await entra(A);
      const c = await a.emitAck('acc:continue', { pid: 'pid-' + crypto.randomUUID() });
      assert.equal(c.ok, true, JSON.stringify(c));
      assert.ok(await continuar(A), 'retomar não apaga');
      assert.equal((await a.emitAck('leave', {})).ok, true);
      assert.equal(await continuar(A), null, 'saiu pelo botão da partida retomada: o botão verde some');
      a.close();
    });

    await t.test('6) nada de erro no registro do servidor', async () => {
      assert.ok(!/UnhandledPromiseRejection|TypeError|ReferenceError|apagar salvo ao sair/.test(S.log()), S.log().slice(-600));
    });
  } finally {
    abertos.forEach((s) => { try { s.close(); } catch (e) { /* ignora */ } });
    if (S) await S.stop().catch(() => {});
    await pool.end().catch(() => {});
    await admin.query('DROP DATABASE IF EXISTS ' + dbName + ' WITH (FORCE)').catch(() => {});
    await admin.end().catch(() => {});
  }
});
