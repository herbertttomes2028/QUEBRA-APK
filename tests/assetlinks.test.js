"use strict";
// Vínculo site <-> aplicativo Android (Digital Asset Links). Sem a impressão digital CERTA da chave que assinou o app instalado,
// o Android abre o jogo com a barra de endereço. Este teste trava as chaves conhecidas e confere o que o servidor realmente publica.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const PACOTE = 'com.onrender.quebra_apk.twa';
const PWABUILDER = '99:50:38:B0:CE:4F:27:B7:61:52:C1:C3:54:12:61:BA:36:77:2A:8E:B6:49:36:CC:EF:F8:A5:98:85:4E:5A:53';   // APK antigo (PWABuilder)
const ENVIO = '12:D9:5C:57:7A:58:76:0A:A1:65:68:6A:DC:C1:F7:41:BB:0D:A4:3E:A9:AB:94:29:A1:5C:D2:EF:7F:59:AD:1F';          // chave de envio (APK de teste e AAB)
const FP = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const lido = () => JSON.parse(fs.readFileSync(path.join(root, 'public/assetlinks.json'), 'utf8'));

test('assetlinks.json: pacote certo, relação certa, e as duas chaves conhecidas (APK antigo e chave de envio)', () => {
  const d = lido(); assert.ok(Array.isArray(d) && d.length === 1, 'uma declaração só');
  const t = d[0].target; assert.deepEqual(d[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(t.namespace, 'android_app'); assert.equal(t.package_name, PACOTE);
  assert.ok(t.sha256_cert_fingerprints.includes(PWABUILDER), 'quem já instalou o APK antigo continua sem barra');
  assert.ok(t.sha256_cert_fingerprints.includes(ENVIO), 'o APK de teste e o AAB assinados com a chave de envio abrem sem barra');
});
test('assetlinks.json: toda impressão digital é um SHA-256 válido, em maiúsculas, sem repetição e sem texto de modelo', () => {
  const lista = lido()[0].target.sha256_cert_fingerprints; assert.ok(lista.length >= 2);
  for (const f of lista) assert.match(f, FP, 'formato AA:BB:… (32 pares): ' + f.slice(0, 20));
  assert.equal(new Set(lista).size, lista.length, 'sem repetidas');
  assert.doesNotMatch(JSON.stringify(lido()), /COLE_AQUI|PREENCHER|SEU/i, 'nenhum texto de modelo esquecido');
});
test('servidor: publica o vínculo em /.well-known/assetlinks.json (200, JSON, sem redirecionar) e a variável ASSETLINKS_JSON tem prioridade', async () => {
  const sobe = (port, extra) => spawn(process.execPath, ['server.js'], { cwd: root, env: Object.assign({}, process.env, { PORT: String(port), NODE_ENV: 'test', DATABASE_URL: '' }, extra), stdio: 'ignore' });
  const espera = async (port) => { for (let i = 0; i < 60; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/health'); if (r.ok) return; } catch (e) { /* ainda subindo */ } await new Promise((r) => setTimeout(r, 250)); } throw Error('o servidor não subiu'); };
  const pega = (port) => fetch('http://127.0.0.1:' + port + '/.well-known/assetlinks.json', { redirect: 'manual' });
  const p1 = sobe(4981 + (process.pid % 20), {}); const porta1 = 4981 + (process.pid % 20);
  try { await espera(porta1); const r = await pega(porta1); assert.equal(r.status, 200, 'sem redirecionamento'); assert.match(r.headers.get('content-type') || '', /json/);
    assert.deepEqual(await r.json(), lido(), 'o servidor publica exatamente o arquivo do repositório'); } finally { p1.kill(); }
  const outro = [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: PACOTE, sha256_cert_fingerprints: [PWABUILDER, ENVIO, 'AA:'.repeat(31) + 'AA'] } }];
  const porta2 = 5001 + (process.pid % 20); const p2 = sobe(porta2, { ASSETLINKS_JSON: JSON.stringify(outro) });
  try { await espera(porta2); const r = await pega(porta2); assert.equal(r.status, 200); const j = await r.json(); assert.equal(j[0].target.sha256_cert_fingerprints.length, 3, 'a variável do Render (com a chave da Play) vence o arquivo'); } finally { p2.kill(); }
});
