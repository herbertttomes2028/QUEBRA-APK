'use strict';
// Segurança do REPOSITÓRIO (app infantil): nada de segredo versionado, workflows com privilégio mínimo, nada de rastro de provedor de nuvem.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { ROOT } = require('./helpers');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function arquivosVersionados() {
  try { return execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean); }
  catch (e) {                                                                // sem git (pasta solta): percorre, ignorando node_modules e .git
    const out = []; (function walk(d) { for (const n of fs.readdirSync(path.join(ROOT, d))) { if (['node_modules', '.git'].includes(n)) continue; const p = path.join(d, n); fs.statSync(path.join(ROOT, p)).isDirectory() ? walk(p) : out.push(p); } })('.'); return out;
  }
}
const arquivos = arquivosVersionados();

test('workflows: permissões mínimas declaradas, sem pull_request_target e sem segredos', () => {
  const wf = arquivos.filter((f) => /^\.github\/workflows\/.+\.ya?ml$/.test(f));
  assert.ok(wf.length >= 2, 'workflows encontrados: ' + wf.length);
  for (const f of wf) {
    const t = read(f);
    assert.match(t, /^permissions:\s*\n\s+contents: read\s*$/m, f + ': precisa de "permissions: contents: read" no topo (privilégio mínimo)');
    assert.ok(!/pull_request_target/.test(t), f + ': pull_request_target dá segredos a código de terceiros');
    assert.ok(!/\$\{\{\s*secrets\./.test(t), f + ': não deve usar segredos (os testes usam só um banco descartável local)');
    assert.ok(!/(contents|packages|actions|id-token):\s*write/.test(t), f + ': nenhuma permissão de escrita');
  }
});

test('nenhum segredo versionado (chaves, tokens, senhas em endereços de banco), em nenhum arquivo do repositório', () => {
  const j = (...p) => p.join('');
  const padroes = [
    ['JWT (chave do Supabase/anon/service_role)', new RegExp(j('eyJ', '[A-Za-z0-9_-]{20,}\\.', '[A-Za-z0-9_-]{20,}'))],
    ['chave privada', new RegExp(j('-----BEGIN [A-Z ]*', 'PRIVATE KEY'))],
    ['chave secreta do Supabase', new RegExp(j('sb_', 'secret_[A-Za-z0-9_-]{8,}'))],
    ['token do GitHub', new RegExp(j('gh', '[pousr]_[A-Za-z0-9]{30,}'))],
    ['chave da AWS/R2', new RegExp(j('AK', 'IA[0-9A-Z]{16}'))],
    ['token do Slack', new RegExp(j('xo', 'x[baprs]-[A-Za-z0-9-]{10,}'))],
    ['endereço de banco com senha (não local)', new RegExp(j('postgres(ql)?', '://[^\\s\'"@:/]+:[^\\s\'"@]+@(?!127\\.0\\.0\\.1|localhost)[^\\s\'"/]+'))]
  ];
  const textuais = arquivos.filter((f) => !/\.(png|jpe?g|webp|gif|ico|woff2?|ttf|zip|apk|lock)$/i.test(f) && !/package-lock\.json$/.test(f));
  for (const f of textuais) {
    let t; try { t = read(f); } catch (e) { continue; }
    for (const [nome, re] of padroes) assert.ok(!re.test(t), `${nome} encontrado em ${f}`);
  }
});

test('.gitignore protege segredos e rastros de nuvem; nenhum arquivo de configuração de nuvem é versionado', () => {
  const gi = read('.gitignore');
  for (const p of ['.env', '.env.*', '*.pem', '*.key', 'supabase/.env*', 'supabase/.temp/', '.dev.vars', 'credentials*.json', 'service-account*.json', 'signing-key-info.txt']) assert.ok(gi.split('\n').includes(p), '.gitignore sem ' + p);
  const proibidos = arquivos.filter((f) => /(^|\/)(\.env($|\.(?!example))|supabase\/|wrangler\.toml|\.dev\.vars|credentials[^/]*\.json|service-account[^/]*\.json|.*\.(pem|key|p12|pfx|jks|keystore))/.test(f));
  assert.deepEqual(proibidos, [], 'arquivos que não deveriam estar no repositório');
});

test('package.json: nenhum script de instalação automática (cadeia de suprimentos) e nenhuma dependência nova de rede/nuvem', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const k of ['preinstall', 'install', 'postinstall', 'prepare']) assert.ok(!(pkg.scripts || {})[k], 'script ' + k + ' roda código sozinho em quem instala');
  const deps = Object.keys(pkg.dependencies || {});
  assert.ok(!deps.some((d) => /supabase|aws-sdk|cloudflare|firebase|sharp/i.test(d)), 'dependências de nuvem/binárias não entram: ' + deps.join(','));
});
