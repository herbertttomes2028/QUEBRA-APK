'use strict';
// Origem externa das imagens (MEDIA_BASE_URL): validação rígida, mesma origem no catálogo e na CSP, falha fechada.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { ROOT } = require('./helpers');
const media = require(path.join(ROOT, 'media'));

test('aceita só https (e http em 127.0.0.1/localhost, para testes) com nome de domínio e caminho limpo', () => {
  assert.deepEqual(media.parseMediaBase('https://pub-abc123.r2.dev'), { base: 'https://pub-abc123.r2.dev', origin: 'https://pub-abc123.r2.dev' });
  assert.deepEqual(media.parseMediaBase('https://img.meujogo.com.br/biblioteca/'), { base: 'https://img.meujogo.com.br/biblioteca', origin: 'https://img.meujogo.com.br' });
  assert.deepEqual(media.parseMediaBase(' http://127.0.0.1:4900/media '), { base: 'http://127.0.0.1:4900/media', origin: 'http://127.0.0.1:4900' });
  assert.equal(media.parseMediaBase(undefined), null);
  assert.equal(media.parseMediaBase(''), null);
});

test('recusa (falha fechada) tudo que seja perigoso ou malformado', () => {
  const ruins = ['http://img.exemplo.com', 'https://user:pw@x.com', 'https://x.com/a?b=1', 'https://x.com/#f', 'https://10.0.0.1/x', 'https://192.168.0.5',
    'https://localhost2/x', 'https://semponto/x', 'https://x.com/../y', 'https://x.com/./y', 'https://x.com//y', 'javascript:alert(1)', '//x.com', 'data:image/png;base64,AAAA',
    'https://x.com/a b', 'https://x.com/%2e%2e/y', 'https://x.com/a\\b', 'ftp://x.com', 'file:///etc/passwd', 'https://[::1]/x', 'https://x.com:99999', 'a'.repeat(300),
    'http://127.0.0.1.evil.com', 'http://localhost.evil.com', 'https://x.com\t.evil.com'];
  for (const r of ruins) assert.equal(media.parseMediaBase(r), null, 'deveria recusar: ' + r.slice(0, 50));
});

test('a MESMA origem entra no catálogo (com versão pelo sha256) e na CSP (img-src); sem a variável, nada muda', () => {
  const script = `
    const lib = require('./library'); const sec = require('./security');
    const m = lib.configureMedia(process.env.MEDIA_BASE_URL);
    const img = lib.catalog()[0].images[0];
    console.log(JSON.stringify({ m, url: img.url, thumb: img.thumb, csp: sec.cspPolicy('localhost:3000', true) }));`;
  const run = (env) => JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: ROOT, env: Object.assign({}, process.env, env), encoding: 'utf8' }));
  const com = run({ MEDIA_BASE_URL: 'https://img.meujogo.com.br/pasta' });
  assert.equal(com.m.origin, 'https://img.meujogo.com.br');
  assert.equal(com.url, 'https://img.meujogo.com.br/pasta/biblioteca/lib-fauna-01.webp');
  assert.equal(com.thumb, 'https://img.meujogo.com.br/pasta/biblioteca/mini/lib-fauna-01.webp');
  assert.match(com.csp, /img-src 'self' data: blob: https:\/\/img\.meujogo\.com\.br;/);
  assert.ok(!/script-src[^;]*img\.meujogo|connect-src[^;]*img\.meujogo|default-src[^;]*img\.meujogo/.test(com.csp), 'a origem das imagens NÃO ganha permissão de script, conexão nem padrão');
  const sem = run({ MEDIA_BASE_URL: '' });
  assert.equal(sem.m, null); assert.equal(sem.url, 'biblioteca/lib-fauna-01.webp');
  assert.ok(!/img\.meujogo/.test(sem.csp));
  const ruim = run({ MEDIA_BASE_URL: 'http://evil.example.com' });         // inválida: ignorada nos DOIS lugares (catálogo e CSP)
  assert.equal(ruim.m, null); assert.equal(ruim.url, 'biblioteca/lib-fauna-01.webp'); assert.ok(!/evil\.example/.test(ruim.csp));
});
