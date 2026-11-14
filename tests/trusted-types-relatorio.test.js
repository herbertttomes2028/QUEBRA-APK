'use strict';
// Trusted Types SÓ EM RELATÓRIO: o servidor manda o aviso (Report-Only) e NUNCA obriga. Obrigar quebraria o jogo sem teste em Android real.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.join(__dirname, '..');
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
async function cabecalhos(mode) {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: Object.assign({}, process.env, { PORT: String(port), DATABASE_URL: '', CSP_MODE: mode }), stdio: 'ignore' });
  try {
    for (let i = 0; i < 100; i++) { try { const r = await fetch('http://127.0.0.1:' + port + '/health'); if (r.ok) break; } catch (e) { /* subindo */ } await new Promise((r) => setTimeout(r, 150)); }
    const r = await fetch('http://127.0.0.1:' + port + '/');
    return { csp: r.headers.get('content-security-policy') || '', ro: r.headers.get('content-security-policy-report-only') || '' };
  } finally { child.kill(); }
}

test('modo report: a política em relatório inclui Trusted Types e a obrigatória continua só com frame-ancestors', async () => {
  const h = await cabecalhos('report');
  assert.equal(h.csp, "frame-ancestors 'none'");
  assert.match(h.ro, /require-trusted-types-for 'script'/);
  assert.match(h.ro, /script-src 'self'/);
});
test('modo enforce: a CSP obrigatória NÃO tem Trusted Types (só o relatório separado tem)', async () => {
  const h = await cabecalhos('enforce');
  assert.ok(!/trusted-types/.test(h.csp), 'Trusted Types não pode ser obrigatório');
  assert.match(h.csp, /script-src 'self'/);
  assert.match(h.ro, /^require-trusted-types-for 'script'; report-uri \/api\/csp-report$/);
});
test('modo off: nenhum cabeçalho de relatório; e o código nunca obriga Trusted Types', async () => {
  const h = await cabecalhos('off');
  assert.equal(h.ro, '');
  const src = fs.readFileSync(path.join(ROOT, 'security.js'), 'utf8');
  assert.ok(!/h\['Content-Security-Policy'\][^;]*trusted/i.test(src));
});
