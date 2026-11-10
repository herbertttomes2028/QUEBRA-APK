"use strict";
// Nenhum segredo no repositório. Chaves, senhas e arquivos de assinatura NUNCA entram no GitHub (hoje público, amanhã privado: o histórico
// de um repositório guarda tudo para sempre). Este teste vigia os arquivos acompanhados pelo git em todo Pull Request; o CI vermelho
// aqui é o aviso certo. Segredos vivem só no painel do Render (Environment) e no computador do proprietário.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');

const RULES = [
  ['chave de API do Brevo', /xkeysib-[A-Za-z0-9-]{20,}/],
  ['chave privada (bloco PEM)', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['endereço de banco com usuário e senha fora do computador local', /postgres(?:ql)?:\/\/[^:@\s\/'"`]+:[^@\s\/'"`]+@(?!127\.0\.0\.1|localhost|\$|\{)[^\s\/'"`]+/i],
  ['token do GitHub', /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/],
  ['chave de API do Google', /AIza[0-9A-Za-z_-]{35}/],
  ['segredo de cliente do Google', /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ['chave de acesso da AWS', /\bAKIA[0-9A-Z]{16}\b/],
  ['token do Slack', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['chave VAPID privada com valor', /VAPID_PRIVATE_KEY["']?\s*[:=]\s*["']?[A-Za-z0-9_-]{30,}/],
  // senha, segredo ou token escritos como texto no código (sem espaços, com letra e número ou símbolo: não pega mensagens de tela)
  ['senha, segredo ou token escritos no código', /\b(?:password|passwd|senha|secret|segredo|token|api[_-]?key)\w*["']?\s*[:=]\s*["'](?=[^"'\s]*[A-Za-z])(?=[^"'\s]*[0-9!@#$%^&*])[^"'\s]{10,}["']/i]
];
const scan = (texto) => RULES.filter(([, re]) => re.test(texto)).map(([nome]) => nome);

const NOME_PROIBIDO = [
  [/\.(keystore|jks|p12|pfx|pem|key)$/i, 'arquivo de chave ou certificado'],
  [/(^|\/)\.env(\..*)?$/, 'arquivo .env (só .env.example é permitido)'],
  [/(^|\/)signing-key-info\.txt$|(^|\/)dados-da-chave\.txt$|(^|\/)chave-de-envio(\/|$)/i, 'dados da chave de assinatura do app'],
  [/\.(apk|aab)$/i, 'pacote do aplicativo (o AAB/APK e a chave ficam só com o proprietário)']
];
const nomeRuim = (arq) => (/\.env\.example$/.test(arq) ? null : (NOME_PROIBIDO.find(([re]) => re.test(arq)) || [])[1] || null);

function arquivos() {
  try { return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
  catch (e) {                                                       // sem git (pacote solto): percorre as pastas
    const lista = []; const anda = (d) => { for (const n of fs.readdirSync(path.join(root, d))) { const rel = d ? d + '/' + n : n; if (['node_modules', '.git'].includes(n)) continue; fs.statSync(path.join(root, rel)).isDirectory() ? anda(rel) : lista.push(rel); } }; anda(''); return lista;
  }
}
const BINARIO = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|zip|gz|pdf|mp3|mp4|wasm)$/i;

test('o detector pega cada tipo de segredo (exemplos montados na hora) e não acusa o que é inofensivo', () => {
  const cola = (...p) => p.join('');
  const positivos = {
    'chave de API do Brevo': cola('xkeysib', '-', 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'),
    'chave privada (bloco PEM)': cola('-----BEGIN ', 'PRIVATE KEY-----'),
    'endereço de banco com usuário e senha fora do computador local': cola('postgresql://', 'usuario:S3nhaForte@ep-exemplo.neon.tech/db'),
    'token do GitHub': cola('gh', 'p_', 'A'.repeat(36)),
    'chave de API do Google': cola('AI', 'za', 'B'.repeat(35)),
    'segredo de cliente do Google': cola('GOC', 'SPX-', 'abcdefghij1234567'),
    'chave de acesso da AWS': cola('AK', 'IA', 'ABCDEFGHIJKLMNOP'),
    'token do Slack': cola('xo', 'xb-', '1234567890-abcdef'),
    'chave VAPID privada com valor': cola('VAPID_PRIVATE_KEY', '=', 'q'.repeat(43)),
    'senha, segredo ou token escritos no código': cola("const senha = '", "Abc123!xyz9", "';")
  };
  for (const [nome, texto] of Object.entries(positivos)) assert.ok(scan(texto).includes(nome), 'precisa pegar: ' + nome);
  assert.equal(Object.keys(positivos).length, RULES.length, 'todo tipo de regra tem um exemplo');
  const inofensivos = [
    'postgresql://qc:qc@127.0.0.1:5432/qc_test', 'postgres://user:pass@localhost/db', 'DATABASE_URL=postgresql:' + '//${USER}:${PASS}@${HOST}/db', 'process.env.BREVO_API_KEY', 'REPORT_NOTIFY_EMAIL',
    "$('#auth-pass').autocomplete = up ? 'new-password' : 'current-password';", "password: 'A senha precisa ter pelo menos 8 caracteres.',", "no_password: 'Sua conta entra pelo Google e não tem senha.',",
    "const token = crypto.randomBytes(16).toString('hex');", "senha: '',", 'BUBBLEWRAP_KEYSTORE_PASSWORD', "--deep-shadow: 0 0 0 1px red;", 'xkeysib-chave-de-teste', 'Basic ' + 'x'.repeat(40)
  ];
  for (const t of inofensivos) assert.deepEqual(scan(t), [], 'não pode acusar: ' + t.slice(0, 60));
  assert.equal(nomeRuim('android.keystore'), 'arquivo de chave ou certificado'); assert.ok(nomeRuim('chave-de-envio/dados-da-chave.txt')); assert.ok(nomeRuim('app/app-release-bundle.aab')); assert.ok(nomeRuim('.env')); assert.ok(nomeRuim('x/.env.local'));
  assert.equal(nomeRuim('.env.example'), null); assert.equal(nomeRuim('public/assetlinks.json'), null); assert.equal(nomeRuim('tests/play-store.test.js'), null);
});

test('nenhum arquivo do repositório tem nome de chave, certificado, .env, dados de assinatura ou pacote do app', () => {
  const ruins = arquivos().map((a) => [a, nomeRuim(a)]).filter(([, motivo]) => motivo);
  assert.deepEqual(ruins, [], 'NÃO suba estes arquivos ao GitHub: ' + ruins.map(([a, m]) => a + ' (' + m + ')').join('; '));
});

test('nenhum arquivo do repositório contém chave, senha, token ou endereço de banco com senha', () => {
  const achados = [];
  for (const arq of arquivos()) {
    if (BINARIO.test(arq) || arq === 'package-lock.json') continue;
    const cam = path.join(root, arq); let st; try { st = fs.statSync(cam); } catch (e) { continue; } if (!st.isFile() || st.size > 3 * 1024 * 1024) continue;
    const linhas = fs.readFileSync(cam, 'utf8').split('\n');
    linhas.forEach((l, i) => { for (const nome of scan(l)) achados.push(arq + ':' + (i + 1) + ' → ' + nome); });
  }
  assert.deepEqual(achados, [], 'SEGREDO NO REPOSITÓRIO (apague a linha, GIRE a chave no serviço de origem e só então envie): ' + achados.join(' | '));
});

test('o .gitignore já bloqueia chaves, certificados, .env e a chave de assinatura do app', () => {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8').split('\n').map((l) => l.trim());
  for (const item of ['.env', '.env.*', '*.pem', '*.key', '*.jks', '*.keystore', 'signing-key-info.txt']) assert.ok(gi.includes(item), '.gitignore precisa ter: ' + item);
});

test('o código lê os segredos só do ambiente (Render) e a página de diagnóstico nunca os mostra por inteiro', () => {
  const sv = fs.readFileSync(path.join(root, 'server.js'), 'utf8'), ml = fs.readFileSync(path.join(root, 'mailer.js'), 'utf8');
  for (const nome of ['DATABASE_URL', 'BREVO_API_KEY', 'VAPID_PRIVATE_KEY']) assert.match(sv + ml + fs.readFileSync(path.join(root, 'db.js'), 'utf8'), new RegExp('env\\.' + nome + '|process\\.env\\.' + nome), nome + ' vem de variável de ambiente');
  assert.doesNotMatch(sv, /diagnostico[\s\S]{0,4000}(BREVO_API_KEY|VAPID_PRIVATE_KEY)\s*[,}]/, 'o diagnóstico não devolve a chave');
});
