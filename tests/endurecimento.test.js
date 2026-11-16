'use strict';
// Rodada "endurecimento" (auditoria de 14/11/2026, itens SEC-06, SEC-08, SEC-09 e .gitignore; decisões do proprietário em 15/11/2026).
// Sem banco: o teto de aparelhos e o oráculo da denúncia também são testados com banco em seguranca-perfil (grupos 3b e 5).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { startServer } = require('./helpers');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('SEC-08: sem a variável, chat e avisos ficam DESLIGADOS; só ligam com true (o Render já tem as duas variáveis)', async () => {
  const s = read('server.js');
  assert.match(s, /const envOn = \(v\) => \['true', '1', 'sim', 'on', 'yes'\]\.includes\(String\(v \|\| ''\)\.trim\(\)\.toLowerCase\(\)\);/);
  assert.match(s, /const CHAT_ENABLED = envOn\(process\.env\.CHAT_ENABLED\);/);
  assert.match(s, /if \(envOn\(process\.env\.PUSH_ENABLED\)\) \{/);
  for (const [valor, esperado] of [['', false], ['false', false], ['qualquer', false], ['true', true], ['TRUE', true], ['1', true]]) {
    const srv = await startServer({ CHAT_ENABLED: valor });
    try {
      const cfg = await (await fetch(srv.url + '/api/config')).json();
      assert.equal(cfg.chat === true, esperado, 'CHAT_ENABLED=' + JSON.stringify(valor) + ' → chat ' + (esperado ? 'ligado' : 'desligado'));
    } finally { await srv.stop(); }
  }
});

test('SEC-09: no máximo 5 aparelhos por perfil; sessões vencidas são apagadas a cada hora', () => {
  const a = read('accounts.js');
  assert.match(a, /const MAX_SESSIONS = 5;/);
  assert.match(a, /ORDER BY \(expires_at > now\(\)\) DESC, created_at DESC, token_hash DESC OFFSET \$3\)/, 'sai primeiro a vencida, depois a mais antiga');
  assert.match(a, /\[uid, hash, MAX_SESSIONS - 1\]/, 'a sessão que acabou de ser criada nunca é a que sai');
  assert.match(a, /revokeSocketHashes\(uid, new Set\(old\.map\(\(r\) => r\.token_hash\)\)\)/, 'o socket do aparelho que saiu perde a conta');
  assert.match(a, /DELETE FROM sessions WHERE expires_at <= now\(\)/);
  assert.match(a, /setInterval\(purgeExpiredSessions, 3600 \* 1000\)\.unref\(\);/);
});

test('SEC-06: na denúncia por ID, o motivo é conferido ANTES de procurar o ID', () => {
  const a = read('accounts.js');
  const rota = a.slice(a.indexOf("r.post('/reports'"), a.indexOf('\n  }));', a.indexOf("r.post('/reports'")));
  const iMotivo = rota.indexOf("if (typeof b.reason !== 'string' || !REPORT_REASONS.has(b.reason)) return bad(res, 400, 'reason');");
  const iBusca = rota.indexOf('await userByCode(');
  assert.ok(iMotivo > 0 && iBusca > iMotivo, 'motivo antes da busca do ID');
});

test('.gitignore: APK, AAB e arquivos da chave do Android ficam fora (o envio pelo site do GitHub é barrado pelo teste sem-segredos)', () => {
  const gi = read('.gitignore').split('\n').map((l) => l.trim());
  for (const p of ['*.apk', '*.aab', '*.idsig', 'dados-da-chave*', 'chave-de-envio/', '*.keystore', '*.jks', 'signing-key-info.txt', '.env']) assert.ok(gi.includes(p), '.gitignore precisa ter: ' + p);
});
