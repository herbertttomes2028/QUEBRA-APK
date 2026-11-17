'use strict';
// Rodada limites-ip (17/11/2026). O /diagnostico do Render mostrou 3 endereços no X-Forwarded-For com o ÚLTIMO fora do Cloudflare: a regra
// do SEC-10 não reconhecia essa corrente e voltava ao último endereço (o mesmo para todo mundo). Esta rodada:
//  1) reconhece a corrente do Render (saltos internos no fim, ou um salto público logo depois do Cloudflare) sem deixar o celular forjar nada;
//  2) revê os limites por endereço para caber uma turma atrás do mesmo endereço (escola, operadora), com limites por aparelho e uma reserva
//     quando o servidor está quase cheio, para que um ou dois endereços não esgotem o jogo para todos.
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { startServer, wait } = require('./helpers');
const { io } = require('socket.io-client');
const security = require('../security');
const { makeProtection, windowGate } = require('../resource-guard');
const { makeLimiter, profileNewGate } = require('../accounts');

const CF = '104.22.17.40', CF6 = '2606:4700::6810:1111', RENDER_INT = '10.214.3.9', RENDER_PUB = '35.160.1.2';

/* ============================ 1) IP real ============================ */
test('IP real: a corrente de 3 endereços do Render (celular, Cloudflare, salto do Render) dá o celular', () => {
  const ip = security.clientIp;
  // formato provável: o Render acrescenta um salto INTERNO depois do Cloudflare
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.1, ' + CF + ', ' + RENDER_INT, 'cf-connecting-ip': '201.1.0.1' }, '10.0.0.5'), '201.1.0.1');
  // ou um salto PÚBLICO do Render logo depois do Cloudflare
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.2, ' + CF + ', ' + RENDER_PUB, 'cf-connecting-ip': '201.1.0.2' }, '10.0.0.5'), '201.1.0.2');
  // sem CF-Connecting-IP: o endereço que o Cloudflare acrescentou
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.3, ' + CF + ', ' + RENDER_INT }, '10.0.0.5'), '201.1.0.3');
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.4, ' + CF + ', ' + RENDER_PUB }, '10.0.0.5'), '201.1.0.4');
  // vários saltos internos
  assert.equal(ip({ 'x-forwarded-for': '201.1.0.5, ' + CF + ', 10.1.1.1, 172.16.0.9, 192.168.3.3', 'cf-connecting-ip': '201.1.0.5' }), '201.1.0.5');
  // IPv6 do celular: conta pelo bloco /64
  assert.equal(ip({ 'x-forwarded-for': '2804:14c:65a1:8000::9, ' + CF6 + ', ' + RENDER_INT, 'cf-connecting-ip': '2804:14c:65a1:8000::9' }), '2804:14c:65a1:8000::/64');
  // dois celulares atrás do mesmo Cloudflare/Render: chaves diferentes
  assert.notEqual(ip({ 'x-forwarded-for': '201.9.0.1, ' + CF + ', ' + RENDER_INT, 'cf-connecting-ip': '201.9.0.1' }), ip({ 'x-forwarded-for': '201.9.0.2, ' + CF + ', ' + RENDER_INT, 'cf-connecting-ip': '201.9.0.2' }));
});

test('IP real: ninguém forja o endereço (nem com Cloudflare inventado, nem com salto interno inventado, nem sem Cloudflare)', () => {
  const ip = security.clientIp;
  // o celular escreve endereços à esquerda: ignorados
  assert.equal(ip({ 'x-forwarded-for': '8.8.8.8, 104.16.0.9, 10.0.0.1, 201.2.0.1, ' + CF + ', ' + RENDER_INT, 'cf-connecting-ip': '201.2.0.1' }), '201.2.0.1');
  // sem Cloudflare na frente (ex.: alguém que chegasse direto ao Render): CF-Connecting-IP forjado é ignorado
  assert.equal(ip({ 'x-forwarded-for': '201.2.0.2, ' + RENDER_INT, 'cf-connecting-ip': '9.9.9.9' }), '201.2.0.2');
  // ...mesmo com um endereço do Cloudflare inventado no meio: quem fica é o endereço que o Render viu
  assert.equal(ip({ 'x-forwarded-for': '9.9.9.9, ' + CF + ', 201.2.0.3, ' + RENDER_INT, 'cf-connecting-ip': '9.9.9.9' }), '201.2.0.3');
  // ...e "Cloudflare + salto público" só vale com o salto público no FIM (depois de saltos internos, não)
  assert.equal(ip({ 'x-forwarded-for': '9.9.9.9, ' + CF + ', 201.2.0.5, ' + RENDER_INT, 'cf-connecting-ip': '9.9.9.9' }), '201.2.0.5');
  // "Cloudflare + 1 salto público": só vale com alguém ANTES do Cloudflare (o Cloudflare sempre acrescenta o celular)
  assert.equal(ip({ 'x-forwarded-for': CF + ', ' + RENDER_PUB, 'cf-connecting-ip': '9.9.9.9' }), RENDER_PUB);
  // todos internos (testes locais): o primeiro, como antes quando era um só
  assert.equal(ip({ 'x-forwarded-for': '10.88.0.1' }, '127.0.0.1'), '10.88.0.1');
  assert.equal(ip({}, '127.0.0.1'), '127.0.0.1');
  for (const x of ['10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1', 'fd00::1', 'fe80::1', '::1']) assert.equal(security.isInternal(x), true, x);
  for (const x of ['201.1.0.1', '172.32.0.1', '100.128.0.1', CF, '8.8.8.8', '2804:14c::1', '', 'lixo']) assert.equal(security.isInternal(x), false, x);
});

test('IP real: o /diagnostico mostra o TIPO de cada posição e a regra usada, nunca endereços', () => {
  const shape = security.ipShape({ 'x-forwarded-for': '201.1.0.1, ' + CF + ', ' + RENDER_INT, 'cf-connecting-ip': '201.1.0.1' });
  assert.deepEqual(shape.tipos_do_primeiro_ao_ultimo, ['externo', 'cloudflare', 'interno']);
  assert.equal(shape.enderecos_no_x_forwarded_for, 3);
  assert.equal(shape.ultimo_e_cloudflare, false);
  assert.equal(shape.tem_cf_connecting_ip, true);
  assert.equal(shape.cf_connecting_ip_igual_a_posicao, 1);
  assert.match(shape.regra_usada, /Cloudflare \+ saltos internos do Render \(CF-Connecting-IP\)/);
  for (const v of ['201.1', '104.22', '10.214']) assert.equal(JSON.stringify(shape).includes(v), false, 'nenhum endereço: ' + v);
  assert.match(security.ipShape({ 'x-forwarded-for': '201.1.0.1, ' + CF + ', ' + RENDER_PUB, 'cf-connecting-ip': '201.1.0.1' }).regra_usada, /1 salto público/);
  assert.match(security.ipShape({ 'x-forwarded-for': '201.1.0.1, 35.1.1.1' }).regra_usada, /sem Cloudflare: último endereço/);
});

/* ============================ 2) palpites de código de sala ============================ */
const code = (i) => 'Z' + String(i).padStart(5, '0');
test('palpites: quem erra muito trava só o PRÓPRIO aparelho; a turma (mesmo endereço) continua', () => {
  const g = security.createJoinGuard({});
  assert.deepEqual([g.limits.MAX, g.limits.DAILY, g.limits.IP_MAX, g.limits.IP_DAILY], [6, 30, 40, 200]);
  let r;
  for (let i = 0; i < 6; i++) r = g.fail('177.20.30.40', code(i), 's:aluno-1');
  assert.equal(r.locked, true, 'o 6º erro do mesmo aparelho trava esse aparelho');
  assert.equal(g.check('177.20.30.40', 's:aluno-1').locked, true);
  assert.equal(g.check('177.20.30.40', 's:aluno-2').locked, false, 'o colega na mesma rede não é travado');
  assert.equal(g.fail('177.20.30.40', code(100), 's:aluno-2').locked, false);
  // perfil logado: a trava segue o perfil mesmo se ele reabrir o aplicativo (conexão nova)
  for (let i = 0; i < 6; i++) g.fail('177.20.30.40', code(200 + i), 'u:perfil-1');
  assert.equal(g.check('177.20.30.40', 'u:perfil-1').locked, true);
});

test('palpites: quem reabre o aplicativo para escapar esbarra no limite do ENDEREÇO (40); outro endereço não é afetado', () => {
  const g = security.createJoinGuard({});
  let r, n = 0;
  for (let i = 0; i < 60; i++) { n++; r = g.fail('203.0.113.7', code(i), 's:conexao-' + i); if (r.locked) break; }   // 1 palpite por conexão
  assert.equal(n, 40, 'trava no 40º palpite do endereço');
  assert.ok(r.retryMs > 0 && r.retryMs <= 10 * 60 * 1000, 'primeira trava do endereço: 10 min');
  assert.equal(g.check('203.0.113.7', 's:conexao-nova').locked, true, 'conexão nova do mesmo endereço também espera');
  assert.equal(g.check('198.51.100.1', 's:outro').locked, false, 'outro endereço continua');
});

test('palpites: o mesmo código repetido em poucos segundos conta uma vez; sem aparelho, conta só o endereço (como antes)', () => {
  const g = security.createJoinGuard({});
  for (let i = 0; i < 10; i++) assert.equal(g.fail('1.2.3.4', 'AAAAAA', 's:x').locked, false);
  for (let i = 0; i < 39; i++) g.fail('5.6.7.8', code(i));
  assert.equal(g.check('5.6.7.8').locked, false);
  assert.equal(g.fail('5.6.7.8', code(999)).locked, true);
});

test('palpites: mapa de endereços cheio descarta só quem errou uma vez; cheio de quem insiste, trava só os novos; mapa de aparelhos nunca trava todo mundo', () => {
  const g = security.createJoinGuard({});
  for (let i = 0; i < 20000; i++) g.fail('10.' + (i >> 16) + '.' + ((i >> 8) & 255) + '.' + (i & 255), 'X' + i, 's:c' + i);
  assert.equal(g.size().enderecos, 8000, 'o mapa de endereços não passa de 8000');
  assert.equal(g.fail('172.20.0.1', 'NOVO01', 's:aparelho-novo').locked, false, 'endereços que erraram UMA vez saem: quem chega depois não é travado');
  const q = security.createJoinGuard({});
  for (let i = 0; i < 8000; i++) { q.fail('11.0.' + (i >> 8) + '.' + (i & 255), 'A' + i); q.fail('11.0.' + (i >> 8) + '.' + (i & 255), 'B' + i); }
  assert.equal(q.fail('172.20.0.2', 'NOVO02').locked, true, 'cheio de endereços com 2+ erros: o novo fica travado (ninguém tem a contagem zerada)');
  for (let i = 0; i < 5; i++) q.fail('11.0.0.7', 'C' + i);
  assert.equal(q.check('11.0.0.7').locked, false, 'quem já estava no mapa continua contando normalmente');
  const h = security.createJoinGuard({});
  for (let i = 0; i < 20050; i++) h.fail('9.9.9.' + (i % 200), 'Y' + i, 's:d' + i);     // muitos aparelhos, poucos endereços
  assert.ok(h.size().aparelhos <= 20000, 'o mapa de aparelhos não cresce sem fim');
});

/* ============================ 3) conexões e salas ============================ */
const fakeIo = () => { const o = { use(fn) { o.mw = fn; } }; return o; };
const fakeSock = (ip, id) => { const s = new EventEmitter(); s.id = id; s.data = {}; s.handshake = { address: ip }; s.conn = new EventEmitter(); s.use = () => {}; return s; };
const admit = (mw, s) => { let err = null; mw(s, (e) => { err = e || null; }); return !err; };

test('conexões: uma turma inteira (120 por endereço) entra; com o servidor quase cheio, quem já tem muitas não abre mais e as vagas ficam para os outros', () => {
  const p = makeProtection({ MAX_LIVE_SOCKETS: '500' });
  try {
    const x = fakeIo(); p.installSocketShield(x);
    let ok = 0; for (let i = 0; i < 125; i++) if (admit(x.mw, fakeSock('177.20.30.40', 'e' + i))) ok++;
    assert.equal(ok, 120, 'escola: 120 conexões no mesmo endereço (eram 32)');
    assert.equal(p.limits.conexoes.por_endereco, 120);
  } finally { p.close(); }
  const q = makeProtection({ MAX_LIVE_SOCKETS: '50' });
  try {
    const x = fakeIo(); q.installSocketShield(x);
    let ata = 0; for (let i = 0; i < 60; i++) if (admit(x.mw, fakeSock('203.0.113.9', 'a' + i))) ata++;
    assert.equal(ata, 38, 'um endereço sozinho para em 75% do teto (38 de 50), em vez de ocupar tudo');
    let outros = 0; for (let i = 0; i < 20; i++) if (admit(x.mw, fakeSock('198.51.100.' + i, 'o' + i))) outros++;
    assert.equal(outros, 12, 'as 12 vagas que sobram ficam para os outros endereços');
    assert.equal(q.stats().activeSockets, 50);
  } finally { q.close(); }
});

test('salas: 60 por endereço e 20 por aparelho em 10 min; quase cheio, quem já criou 12 espera e quem criou pouco continua', () => {
  const p = makeProtection({ MAX_ACTIVE_ROOMS: '240' });
  try {
    const a = fakeSock('177.20.30.40', 'aluno-a');
    let n = 0; for (let i = 0; i < 25; i++) if (p.allowRoom(a, 10)) n++;
    assert.equal(n, 20, 'um aparelho insistindo: 20 salas em 10 min');
    let turma = 0; for (let i = 0; i < 60; i++) if (p.allowRoom(fakeSock('177.20.30.40', 'k' + i), 10)) turma++;
    assert.equal(turma, 40, 'a rede da escola: 60 no total (20 já usadas pelo aparelho a)');
    assert.equal(p.allowRoom(fakeSock('198.51.100.5', 'outra-rede'), 10), true, 'outra rede não é afetada');
    // servidor quase cheio (75% de 240 = 180 salas): a escola, que já criou 60, espera; uma rede que criou pouco continua
    assert.equal(p.allowRoom(fakeSock('203.0.113.50', 'r1'), 200), true);
    const b = makeProtection({ MAX_ACTIVE_ROOMS: '240' });
    try {
      let k = 0; for (let i = 0; i < 20; i++) if (b.allowRoom(fakeSock('203.0.113.60', 'z' + i), 100)) k++;
      assert.equal(k, 20);
      assert.equal(b.allowRoom(fakeSock('203.0.113.60', 'z-novo'), 190), false, 'quase cheio: quem já criou 12 ou mais espera');
      assert.equal(b.allowRoom(fakeSock('203.0.113.61', 'w'), 190), true, 'quase cheio: quem criou pouco continua');
      assert.equal(b.allowRoom(fakeSock('203.0.113.62', 'v'), 240), false, 'cheio: ninguém');
    } finally { b.close(); }
    // perfil logado: o limite por aparelho segue o perfil (reabrir o aplicativo não zera)
    const c = makeProtection({});
    try {
      let m = 0; for (let i = 0; i < 25; i++) { const s = fakeSock('192.0.2.' + (i % 3), 'conexao-' + i); s.data.uid = 'perfil-1'; if (c.allowRoom(s, 0)) m++; }
      assert.equal(m, 20);
    } finally { c.close(); }
  } finally { p.close(); }
});

test('contador por aparelho cheio não barra ninguém (o limite por endereço continua); o por endereço cheio continua barrando os novos', () => {
  const dev = windowGate({ max: 1, windowMs: 60000, entries: 3, openWhenFull: true });
  const ip = windowGate({ max: 1, windowMs: 60000, entries: 3 });
  try {
    for (const k of ['a', 'b', 'c']) { assert.equal(dev.allow(k), true); assert.equal(ip.allow(k), true); }
    assert.equal(dev.allow('d'), true, 'aparelho: mapa cheio deixa passar');
    assert.equal(ip.allow('d'), false, 'endereço: mapa cheio barra o novo (não zera ninguém)');
    assert.equal(dev.allow('a'), false, 'quem já está no mapa continua limitado');
    assert.equal(dev.used('a'), 1); assert.equal(dev.used('zz'), 0);
  } finally { dev.close(); ip.close(); }
});

test('pedidos HTTP: uma turma carregando o jogo ao mesmo tempo cabe (API 1500/min, arquivos 6000/min por endereço)', () => {
  const p = makeProtection({});
  try {
    assert.deepEqual(p.limits.pedidos_por_minuto, { api: 1500, arquivos: 6000 });
    const run = (path, n) => { let ok = 0; for (let i = 0; i < n; i++) { let passed = false; const res = { status() { return this; }, json() {}, once() {} }; p.httpMiddleware({ path, ip: '177.20.30.40', method: 'GET' }, res, () => { passed = true; }); if (passed) ok++; } return ok; };
    assert.equal(run('/img/x.png', 6005), 6000);
    const resFinish = []; let ok = 0;
    for (let i = 0; i < 1505; i++) { let passed = false; const res = { status() { return this; }, json() {}, once(ev, fn) { if (ev === 'finish') resFinish.push(fn); } }; p.httpMiddleware({ path: '/api/config', ip: '177.20.30.40', method: 'GET' }, res, () => { passed = true; }); if (passed) { ok++; resFinish.pop()(); } }
    assert.equal(ok, 1500);
  } finally { p.close(); }
});

/* ============================ 4) criar perfil ============================ */
test('criar perfil: 60 por hora e 300 por dia por endereço; com o servidor quase no teto, cada endereço volta a 10 por hora; teto geral 1500', () => {
  let t = 1e12; const L = makeLimiter({ now: () => t }), ok = profileNewGate(L, 1);
  let n = 0; for (let i = 0; i < 65; i++) if (ok('177.20.30.40')) n++;
  assert.equal(n, 60, 'uma turma (até 60) cria perfil na mesma hora (eram 6)');
  assert.equal(ok('198.51.100.1'), true, 'outro endereço não é afetado');
  let dia = 60; for (let h = 1; h < 8; h++) { t += 3600 * 1000 + 1; for (let i = 0; i < 60; i++) if (ok('177.20.30.40')) dia++; }
  assert.equal(dia, 300, '300 por dia no mesmo endereço');
  // quase no teto: 750 criados na última hora (de muitos endereços)
  t += 25 * 3600 * 1000; const M = makeLimiter({ now: () => t }), ok2 = profileNewGate(M, 1);
  for (let i = 0; i < 750; i++) assert.equal(ok2('10.9.' + (i >> 8) + '.' + (i & 255)), true);
  let c = 0; for (let i = 0; i < 20; i++) if (ok2('203.0.113.77')) c++;
  assert.equal(c, 10, 'com metade do teto usada, um endereço novo cria 10 por hora');
  for (let i = 0; i < 740; i++) ok2('10.10.' + (i >> 8) + '.' + (i & 255));
  assert.equal(ok2('203.0.113.78'), false, 'teto geral de 1500 por hora continua');
});

/* ============================ 5) servidor real: uma turma inteira atrás do mesmo endereço ============================ */
function conectar(url, ip) {
  const s = io(url, { transports: ['websocket'], reconnection: false, forceNew: true, extraHeaders: { 'x-forwarded-for': ip + ', ' + CF + ', ' + RENDER_INT, 'cf-connecting-ip': ip } });
  s.emitAck = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return new Promise((res) => { s.once('connect', () => res(s)); s.once('connect_error', () => { s.close(); res(null); }); });
}
test('servidor real: 40 alunos na mesma rede conectam, criam 20 salas, entram nelas; quem erra muito trava só o próprio aparelho', async () => {
  const srv = await startServer({});
  const socks = [];
  try {
    const ESCOLA = '177.20.30.40';
    for (let i = 0; i < 40; i++) socks.push(await conectar(srv.url, ESCOLA));
    assert.equal(socks.filter(Boolean).length, 40, 'os 40 conectam (antes: 32)');
    const cfg = await (await fetch(srv.url + '/api/config')).json();
    const codigos = [];
    for (let i = 0; i < 20; i++) { const r = await socks[i].emitAck('create', { pid: 'pid-c-' + i, imageId: cfg.images[0].file, pieces: 6, name: 'A' }); assert.equal(r.ok, true, 'sala ' + i + ': ' + JSON.stringify(r)); codigos.push(r.snapshot.code); }
    // 15 colegas digitam errado uma vez antes de acertar (15 erros na mesma rede): ninguém é travado
    for (let i = 20; i < 35; i++) { const e = await socks[i].emitAck('join', { pid: 'pid-j-' + i, code: 'ERRO' + String.fromCharCode(65 + i - 20) + 'Z' }); assert.equal(e.error, 'notfound'); }
    // um aluno insiste no erro: trava SÓ o aparelho dele
    let travou = false; for (let i = 0; i < 8 && !travou; i++) { const e = await socks[39].emitAck('join', { pid: 'pid-insiste', code: 'XQ' + i + 'ZZZ' }); travou = e.error === 'locked'; }
    assert.equal(travou, true, 'o aparelho que insiste é travado');
    for (let i = 20; i < 39; i++) { const r = await socks[i].emitAck('join', { pid: 'pid-j-' + i, code: codigos[i - 20] }); assert.equal(r.ok, true, 'aluno ' + i + ' entra na sala certa: ' + JSON.stringify(r)); }
    const outra = await conectar(srv.url, '198.51.100.20');
    assert.equal((await outra.emitAck('join', { pid: 'pid-outra-rede', code: 'NAOEXZ' })).error, 'notfound', 'outra rede não sente nada');
    outra.close();
    const d = await (await fetch(srv.url + '/diagnostico', { headers: { authorization: 'Bearer token-de-teste-do-diagnostico-0123456789' } })).json();
    assert.equal(d.seguranca.limites_por_endereco.conexoes.por_endereco, 120);
    assert.equal(d.seguranca.limite_de_tentativas.IP_MAX, 40);
    assert.ok(Array.isArray(d.seguranca.ip_real.tipos_do_primeiro_ao_ultimo));
  } finally { for (const s of socks) if (s) s.close(); await wait(50); await srv.stop(); }
});

test('servidor real: quem reabre conexões para continuar chutando códigos trava o próprio endereço; a escola ao lado continua', async () => {
  const srv = await startServer({});
  try {
    const ATACANTE = '203.0.113.99';
    let n = 0, travado = false;
    while (!travado && n < 80) { const s = await conectar(srv.url, ATACANTE); for (let k = 0; k < 5 && !travado; k++) { n++; const r = await s.emitAck('join', { pid: 'pid-atacante-' + n, code: 'Q' + String(n).padStart(4, '0') + 'Z' }); travado = r.error === 'locked'; } s.close(); }
    assert.ok(travado && n <= 40, 'o endereço trava em até 40 palpites, mesmo trocando de conexão (' + n + ')');
    const nova = await conectar(srv.url, ATACANTE);
    assert.equal((await nova.emitAck('join', { pid: 'pid-atacante-z', code: 'AAAAAA' })).error, 'locked', 'conexão nova do mesmo endereço continua travada');
    nova.close();
    const escola = await conectar(srv.url, '177.20.30.41');
    assert.equal((await escola.emitAck('join', { pid: 'pid-escola-e', code: 'AAAAAA' })).error, 'notfound', 'outro endereço não é travado');
    escola.close();
  } finally { await srv.stop(); }
});
