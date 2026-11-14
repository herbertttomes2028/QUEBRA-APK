'use strict';
// Rodada limites-disponibilidade (auditoria de 14/11/2026, SEC-02 e SEC-03). Sem rede e sem banco.
//  SEC-02: o mapa de limites, cheio, recusava QUALQUER chave nova (ninguém novo entrava nem criava perfil).
//  SEC-03: o limite de scrypt simultâneo só reconhecia as rotas do login ANTIGO; as do perfil gerado passavam sem ele.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { makeLimiter } = require('../accounts');
const { makeProtection, HEAVY_AUTH_RE } = require('../resource-guard');

const accSrc = fs.readFileSync(path.join(__dirname, '..', 'accounts.js'), 'utf8');

test('limites: os números de cada limite continuam os mesmos (só mudou como o mapa guarda as chaves)', () => {
  for (const s of ["tooMany('kfail:ip:' + ip, 20 * RATE_MULT, LOGIN_FAIL_MS)", "tooMany('kfail:id:' + code, 8, LOGIN_FAIL_MS)", "allow('pnew:' + req.ip, 6, 3600 * 1000, true)", "allow('pnew:all', 1500, 3600 * 1000)", "allow('plogin:' + req.ip, 40, 10 * 60 * 1000, true)", "allow('perase:' + req.ip, 20, 10 * 60 * 1000, true)", "allow('psec:' + req.user.id, 5, 3600 * 1000)", 'const LOGIN_FAIL_MS = 15 * 60 * 1000;'])
    assert.ok(accSrc.includes(s), 'limite inalterado: ' + s);
  assert.ok(!/hits\.size >= 6000/.test(accSrc), 'o teto único que recusava todo mundo não existe mais');
});

test('limiter: conta, recusa no limite e libera quando a janela vence', () => {
  let t = 1000; const L = makeLimiter({ now: () => t });
  for (let i = 0; i < 3; i++) assert.equal(L.allow('plogin:1.1.1.1', 3, 1000), true);
  assert.equal(L.allow('plogin:1.1.1.1', 3, 1000), false, '4ª no mesmo minuto: recusada');
  t += 1001; assert.equal(L.allow('plogin:1.1.1.1', 3, 1000), true, 'janela venceu: libera');
  for (let i = 0; i < 8; i++) L.note('kfail:id:ABCD2345', 900);
  assert.equal(L.tooMany('kfail:id:ABCD2345', 8, 900), true); assert.equal(L.tooMany('kfail:id:OUTRO234', 8, 900), false);
  t += 901; assert.equal(L.tooMany('kfail:id:ABCD2345', 8, 900), false, 'falhas antigas deixam de contar');
});

test('limiter: um grupo cheio NÃO recusa ninguém novo e NÃO afeta os outros grupos', () => {
  let t = 5000; const L = makeLimiter({ now: () => t, groupMax: 50 });
  for (let i = 0; i < 500; i++) L.note('kfail:id:ID' + i, 900000);          // enxurrada de IDs errados (como na prova de 14/11)
  for (let i = 0; i < 500; i++) assert.equal(L.allow('plogin:10.0.' + (i >> 8) + '.' + (i & 255), 40, 600000), true);
  assert.ok(L.size('kfail:id') <= 50 && L.size('plogin') <= 50, 'cada grupo respeita o próprio teto');
  assert.equal(L.allow('plogin:200.1.1.1', 40, 600000), true, 'endereço novo continua sendo atendido');
  assert.equal(L.allow('pnew:200.1.1.1', 6, 3600000), true, 'outro grupo (criar perfil) nem percebe');
  assert.equal(L.size('pnew'), 1);
});

test('limiter: com o grupo cheio, quem está sendo barrado CONTINUA barrado (a chave usada agora não é a descartada)', () => {
  let t = 1; const L = makeLimiter({ now: () => t, groupMax: 20 });
  for (let i = 0; i < 20; i++) assert.equal(L.allow('kfail:ip:atacante', 20, 900000), true);
  assert.equal(L.allow('kfail:ip:atacante', 20, 900000), false);
  for (let i = 0; i < 200; i++) { t++; L.note('kfail:ip:outro' + i, 900000); if (i % 10 === 0) assert.equal(L.allow('kfail:ip:atacante', 20, 900000), false, 'continua barrado'); }
});

test('limiter: grupo cheio descarta primeiro as chaves já vencidas', () => {
  let t = 0; const L = makeLimiter({ now: () => t, groupMax: 10 });
  for (let i = 0; i < 5; i++) L.allow('shop:velho' + i, 15, 100);              // janela curta: vão vencer
  t = 50; for (let i = 0; i < 5; i++) L.allow('shop:novo' + i, 15, 100000);
  t = 200; L.allow('shop:chegou', 15, 100000);                                  // grupo cheio: saem as vencidas, não as válidas
  for (let i = 0; i < 5; i++) assert.equal(L.tooMany('shop:novo' + i, 1, 100000), true, 'chave válida mantida: novo' + i);
  assert.equal(L.size('shop'), 6);
  L.sweep(); assert.equal(L.size('shop'), 6);
});

test('scrypt: toda rota de accounts.js que roda scrypt está no limite de operações caras (e as antigas, que não existem mais, não)', () => {
  const rotas = [...accSrc.matchAll(/r\.post\('([^']+)'/g)].map((m) => m[1]);
  const corpo = (r) => { const a = accSrc.indexOf("r.post('" + r + "'"), b = accSrc.indexOf('\n  }));', a); return accSrc.slice(a, b); };      // só o corpo da rota
  const caras = rotas.filter((r) => /checkPassword\(|hashPassword\(|userByKey\(/.test(corpo(r)));
  assert.deepEqual(caras.sort(), ['/delete', '/profile/erase', '/profile/login', '/profile/new', '/profile/new-secret']);
  for (const r of caras) assert.ok(HEAVY_AUTH_RE.test('/api/acc' + r), 'no limite: ' + r);
  for (const r of rotas.filter((x) => !caras.includes(x))) assert.ok(!HEAVY_AUTH_RE.test('/api/acc' + r), 'rota barata fora do limite: ' + r);
});

test('scrypt: com o limite em 2, a 3ª operação cara simultânea recebe 503 em cada rota do perfil gerado', () => {
  for (const r of ['/api/acc/profile/login', '/api/acc/profile/new', '/api/acc/profile/erase', '/api/acc/profile/new-secret', '/api/acc/delete']) {
    const shield = makeProtection({ MAX_AUTH_INFLIGHT: '2', MAX_API_INFLIGHT: '50' });
    const start = () => { const res = new EventEmitter(); let code = 200, ok = false; res.status = (c) => { code = c; return res; }; res.json = () => res; shield.httpMiddleware({ path: r, method: 'POST', ip: '1.2.3.' + Math.floor(Math.random() * 250) }, res, () => { ok = true; }); return { ok, code: () => code, end: () => res.emit('finish') }; };
    try {
      const a = start(), b = start(), c = start();
      assert.deepEqual([a.ok, b.ok, c.ok, c.code()], [true, true, false, 503], r);
      a.end(); assert.equal(start().ok, true, r + ': libera a vaga ao terminar');
    } finally { shield.close(); }
  }
});

test('telas: "ocupado" (503) tem mensagem própria; a página de exclusão não diz "código incorreto" quando o servidor só está ocupado', () => {
  const conta = fs.readFileSync(path.join(__dirname, '..', 'public', 'conta.js'), 'utf8');
  const exc = fs.readFileSync(path.join(__dirname, '..', 'public', 'excluir-conta.js'), 'utf8');
  assert.match(conta, /busy: 'O jogo está com muitos acessos agora\. Tente de novo em alguns segundos\.'/);
  const i503 = exc.indexOf('if (o.s === 503)'), iBad = exc.indexOf("say('ID ou código-chave incorreto.'");
  assert.ok(i503 > 0 && iBad > i503, 'o 503 é tratado ANTES da mensagem de código incorreto');
});
