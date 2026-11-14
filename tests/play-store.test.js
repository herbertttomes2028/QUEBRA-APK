"use strict";
// Preparação para a Google Play Store: galeria sem imagens de terceiros, jogo não indicado para menores de 16 anos (cadastro, textos e divulgação),
// política de privacidade e página de exclusão de conta (conferidas contra o app), e a interface de denúncia.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('public/index.html'), conta = read('public/conta.js'), game = read('public/game.js'), acc = read('accounts.js'), css = read('public/style.css');
const priv = read('public/privacidade.html'), del = read('public/excluir-conta.html'), manifest = JSON.parse(read('public/manifest.webmanifest'));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'node_modules' || e.name === '.git' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]));
const text = (h) => h.replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');

/* ---------------- galeria ---------------- */
const BANIDAS = /batman|stitch|\blula\b|(^|[^a-z])lula([^a-z]|$)|jesus|aparecida|(^|[^a-z])angel([^a-z]|$)/i;
test('galeria: só as ilustrações originais do jogo; nenhuma imagem de personagem de terceiros, de pessoa real ou de origem desconhecida', () => {
  const imgs = fs.readdirSync(path.join(root, 'public/imagens')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
  assert.deepEqual(imgs, ['astronauta-e-robo.jpg', 'castelo-dos-sonhos.jpg', 'cavaleiro-e-dragao.jpg', 'fada-da-floresta.jpg', 'mago-das-estrelas.jpg', 'princesa-e-dragaozinho.jpg', 'princesa-no-jardim.jpg', 'sereia-do-mar.jpg', 'unicornio-arco-iris.jpg']);
  const minis = fs.readdirSync(path.join(root, 'public/imagens/mini')).sort(); assert.deepEqual(minis, imgs, 'cada imagem tem a sua miniatura, e não sobra miniatura órfã');
  const nomes = JSON.parse(read('public/imagens/nomes.json')); for (const k of Object.keys(nomes)) assert.doesNotMatch(k + ' ' + nomes[k], BANIDAS, 'nomes.json');
  for (const f of walk(path.join(root, 'public'))) assert.doesNotMatch(path.basename(f), BANIDAS, 'nenhum arquivo público com esse nome: ' + f);
});
test('galeria: o catálogo da biblioteca (migrações e lotes) também não cita personagens de terceiros nem pessoas reais', () => {
  const alvos = [...fs.readdirSync(path.join(root, 'migrations')).map((f) => 'migrations/' + f), ...(fs.existsSync(path.join(root, 'scripts/lotes')) ? fs.readdirSync(path.join(root, 'scripts/lotes')).map((f) => 'scripts/lotes/' + f) : []), 'library.js'];
  const re = /\b(batman|superman|stitch|mickey|pikachu|lula|jesus|aparecida|disney|marvel)\b/i;
  for (const f of alvos) assert.doesNotMatch(read(f), re, f);
});
test('galeria: o servidor oferece exatamente o que está na pasta (nada mais é servido como imagem padrão)', () => {
  const sv = read('server.js'); assert.match(sv, /images: listImages\(\)\.filter\(i => !i\.categoryId\)/);
  assert.match(sv, /readdirSync\(IMG_DIR\)/);
});

/* ---------------- 16 anos ou mais ---------------- */
test('16+: o servidor recusa a criação do perfil sem a confirmação, e só aceita o booleano true', () => {
  assert.equal((acc.match(/if \(b\.age16 !== true\) return bad\(res, 400, 'age16'\);/g) || []).length, 1, 'único ponto de criação: /profile/new');
  const reg = acc.slice(acc.indexOf("r.post('/profile/new'"), acc.indexOf("r.post('/profile/login'")); assert.ok(reg.indexOf("b.consent !== true") < reg.indexOf("b.age16 !== true") && reg.indexOf("b.age16 !== true") < reg.indexOf('createUser('), 'a conta só é criada depois das duas confirmações');
});
test('16+: o cadastro mostra a caixa "tenho 16 anos ou mais" (só ao criar conta) e a envia ao servidor', () => {
  assert.match(html, /<label id="auth-age-wrap" class="me-check">\s*<input id="auth-age" type="checkbox">\s*<span>Tenho 16 anos ou mais\. \(Este jogo não é indicado para menores de 16 anos\.\)<\/span><\/label>/);
  assert.ok(html.indexOf('id="auth-consent-wrap"') < html.indexOf('id="auth-age-wrap"') && html.indexOf('id="auth-age-wrap"') < html.indexOf('id="auth-error"'));
  assert.match(conta, /show\('#auth-up-wrap', up\); show\('#auth-in-wrap', !up\);/, 'as caixas só aparecem ao criar o perfil'); assert.match(conta, /age16: \$\('#auth-age'\)\.checked/);
  assert.match(conta, /\$\('#auth-age'\)\.checked = false; say\('#auth-error', ''\);/, 'sair do perfil desmarca');
  assert.match(conta, /age16: 'Este jogo não é indicado para menores de 16 anos\. Marque a caixa se você tem 16 anos ou mais\.'/);
});
test('16+: nada do app, da loja ou dos documentos o apresenta como jogo infantil', () => {
  const alvo = [html, game, conta, priv, del, JSON.stringify(manifest), read('public/boot.js')].join('\n');
  assert.doesNotMatch(text(alvo) + alvo.replace(/<[^>]+>/g, ' '), /(para|de|das?) (as )?crian[çc]as|infantil|crian[çc]ada|para os pequenos|kids|baby/i, 'sem linguagem voltada a crianças');
  assert.doesNotMatch(priv, /feito para crianças|Crianças devem/);
  assert.match(manifest.description, /Não indicado para menores de 16 anos/);
  for (const f of ['CONTAS.md', 'README.md']) assert.doesNotMatch(read(f), /voltado ao público infantil|o público é infantil/, f);
  assert.doesNotMatch(read('server.js'), /o público é infantil/);
  assert.match(read('CONTAS.md'), /ECA Digital/, 'o risco legal brasileiro está registrado para o responsável conferir com um profissional');
});

/* ---------------- política de privacidade e exclusão (conferidas contra o app) ---------------- */
test('privacidade: diz para quem é o jogo, o que guarda, com quem passa, por quanto tempo, os direitos e como excluir', () => {
  const t = text(priv);
  for (const trecho of ['não é indicado para menores de 16 anos', 'Não coletamos dados de menores de 16 anos', 'visitante', 'Render', 'Neon', 'Brevo', 'fora do Brasil', '60 dias', 'LGPD', 'ANPD', 'em até 15 dias', 'bloquear', 'denunciar', 'não fica sabendo', 'Meu espaço', 'Apagar meus dados…', 'código-chave', 'Jogador 1', 'excluir-conta.html', 'frases prontas', 'não aceita fotos'])
    assert.ok(t.includes(trecho), 'a política precisa dizer: ' + trecho);
  assert.match(priv, /<b id="contato">[^<@]+@[^<]+<\/b>/, 'e-mail de contato preenchido'); assert.doesNotMatch(priv, /PREENCHER/); assert.match(priv, /<html lang="pt-BR">/);
  assert.match(priv, /atualizada em \d{1,2} de [a-zç]+ de 20\d\d/, 'tem data');
  assert.match(priv, /<main>/, 'o app abre a política copiando o <main>');
  assert.match(read('public/sw.js'), /'\/privacidade\.html'/, 'abre mesmo sem internet');
});
test('exclusão de conta: a página pública traz os passos com as MESMAS palavras da tela do app, o que é apagado e o prazo', () => {
  const t = text(del);
  for (const r of ['Apagar meus dados…', 'Apagar de vez', 'EXCLUIR']) { assert.ok(t.includes(r), 'a página cita: ' + r); }
  const ui = text(html);
  for (const r of ['Apagar meus dados…', 'Apagar de vez', 'EXCLUIR']) assert.ok(ui.includes(r), 'e o app TEM esse texto (se mudar um, o outro precisa mudar): ' + r);
  assert.match(html, /id="tab-profile"/); assert.match(html, /data-tab="profile"[^>]*>(<span[^>]*>[^<]*<\/span>)?Perfil<\/button>/, 'a aba se chama Perfil');
  for (const t2 of ['Quebra-Cabeça a Dois', 'Herbert', 'em até 15 dias', 'ID do perfil', 'código-chave', 'denúncias', 'XP', 'backup|Cópias de segurança'.split('|')[1]]) assert.ok(t.toLowerCase().includes(t2.toLowerCase()), t2);
  assert.match(del, /herbert\.[^<]*@gmail\.com/); assert.equal(priv.match(/herbert\.[a-z.]*@gmail\.com/)[0], del.match(/herbert\.[a-z.]*@gmail\.com/)[0], 'o mesmo e-mail nas duas páginas');
  assert.match(acc, /r\.post\('\/delete', needUser/); assert.match(acc, /b\.confirm !== 'EXCLUIR'/, 'o servidor exige a palavra que a página manda digitar');
});
test('exclusão de conta: TODA tabela ligada a um usuário apaga em cascata (a página promete "nada fica no jogo")', () => {
  const sql = fs.readdirSync(path.join(root, 'migrations')).sort().map((f) => read('migrations/' + f)).join('\n');
  const tabelas = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  const comUsuario = tabelas.filter((tb) => new RegExp('CREATE TABLE IF NOT EXISTS ' + tb + ' \\([\\s\\S]*?\\n\\);').exec(sql) && /REFERENCES users\(id\)/.test(new RegExp('CREATE TABLE IF NOT EXISTS ' + tb + ' \\([\\s\\S]*?\\n\\);').exec(sql)[0]));
  assert.ok(comUsuario.length >= 12 && comUsuario.includes('reports'), 'tabelas ligadas a usuários: ' + comUsuario.join(', '));
  for (const tb of comUsuario) { const def = new RegExp('CREATE TABLE IF NOT EXISTS ' + tb + ' \\([\\s\\S]*?\\n\\);').exec(sql)[0]; for (const m of def.matchAll(/REFERENCES users\(id\)([^,\n]*)/g)) assert.match(m[1], /ON DELETE CASCADE/, tb + ' precisa apagar em cascata'); }
});
test('app: a política e a exclusão estão dentro dos Ajustes e no cadastro (a Play pede a política acessível no app)', () => {
  assert.match(html, /<p class="set-note set-about">Jogo não indicado para menores de 16 anos\. <a href="\/privacidade\.html" data-privacy>Privacidade e exclusão de conta<\/a><\/p>/);
  assert.match(html, /<a href="\/privacidade\.html" data-privacy>política de privacidade<\/a>/);
  assert.ok(html.indexOf('id="push-note"') < html.indexOf('set-about') && html.indexOf('set-about') < html.indexOf('id="set-close"'));
});

/* ---------------- denúncia ---------------- */
test('denúncia: janela acessível com motivos, nota opcional de 200 letras e "também bloquear"; botão no menu da sala', () => {
  const m = html.slice(html.indexOf('id="modal-report"'), html.indexOf('id="modal-rematch"'));
  assert.match(m, /role="dialog" aria-modal="true" aria-labelledby="rp-title" aria-describedby="rp-help"/); assert.match(m, /role="radiogroup" aria-labelledby="rp-title"/);
  for (const v of ['apelido', 'comportamento', 'outro']) assert.match(m, new RegExp('type="radio" name="rp-reason" value="' + v + '"'));
  assert.match(m, /<textarea id="rp-note" maxlength="200"/); assert.match(m, /id="rp-block" type="checkbox"/); assert.match(m, /id="rp-error" class="error" role="alert" hidden/); assert.match(m, /id="rp-cancel" data-back/);
  assert.match(m, /a outra pessoa não fica sabendo/);
  for (const id of ['menu-report']) assert.match(html, new RegExp('<button id="' + id + '"[^>]*type="button"[^>]*>[^<]*Denunciar'));
  assert.match(html, /id="menu-report"[^>]*hidden/, 'na sala só aparece para quem tem conta, como o bloquear');
  assert.match(css, /\.me-field textarea \{[^}]*box-sizing: border-box/);
});
test('denúncia: servidor valida (só texto, lista fechada), limita (15/hora), deduplica (24 h), não avisa a outra pessoa e a sala usa o mesmo caminho', () => {
  assert.match(acc, /const REPORT_REASONS = new Set\(\['apelido', 'comportamento', 'outro'\]\), REPORT_CONTEXTS = new Set\(\['perfil', 'amigos', 'sala'\]\);/);
  assert.match(acc, /typeof b\.reason === 'string' \? b\.reason : ''/); assert.match(acc, /WHERE NOT EXISTS \(SELECT 1 FROM reports WHERE reporter = \$1 AND reported = \$2 AND reason = \$3 AND created_at > now\(\) - interval '24 hours'\)/);
  assert.equal((acc.match(/allow\('report:' \+ (req\.user\.id|uid), 15, 3600 \* 1000\)/g) || []).length, 2, 'o MESMO limite na rota e na sala');
  assert.match(acc, /r\.post\('\/reports', needUser, guard\(/); assert.match(acc, /socket\.on\('acc:reportPeer', wrap\(/);
  assert.match(acc, /if \(b\.alsoBlock === true\) \{ await blockUser\(reporter, target\.id\); blocked = true; \}/);
  const f = acc.slice(acc.indexOf('async function fileReport'), acc.indexOf("r.post('/reports'")); assert.doesNotMatch(f, /notify\(|io\.to\(/, 'quem foi denunciado nunca é avisado');
  assert.match(acc, /\.replace\(\/\[\\u0000-\\u001f\\u007f\]\/g, ' '\)[\s\S]{0,60}\.slice\(0, 200\)/, 'a nota perde caracteres de controle e é cortada em 200');
});
test('denúncia: o cliente usa a janela de denúncia no menu da sala, e nunca deixa o botão preso', () => {
  assert.match(conta, /QC\.reportPerson = openReport;/); assert.ok(!/fp-report|fa-report|reportPerson\(/.test(conta), 'não há mais denúncia a partir de perfil ou lista de amigos');
  assert.match(conta, /if \(!sel\) \{ say\('#rp-error', MSG\.reason\); return; \}/, 'sem motivo: não envia'); assert.match(conta, /btn\.disabled = true;[\s\S]*btn\.disabled = false;/);
  assert.match(conta, /Denúncia enviada\. Obrigado por ajudar a manter o jogo legal\./);
  assert.match(conta, /\$\('#rp-cancel'\)\.addEventListener\('click', function \(\) \{ QC\.closeModal\('#modal-report'\); rpCtx = null; \}\);/, 'Cancelar fecha a janela de denúncia');
  assert.match(game, /\$\('#menu-block'\)\.hidden = \$\('#menu-report'\)\.hidden = !\(window\.QC && window\.QC\.canBlock\) \|\| state\.solo;/);
  assert.match(game, /socket\.emit\('acc:reportPeer', p, function \(res\)/); assert.match(game, /setTimeout\(function \(\) \{ if \(!done\) \{ done = true; resolve\(\{ ok: false, error: 'offline' \}\); \} \}, 8000\);/, 'sem resposta em 8 s: libera o botão');
  assert.match(game, /after: function \(res\) \{ if \(res\.blocked\) \{ if \(state\.duel\) leaveDuel\(\); else leaveCoop\(\); \} \}/, 'denunciar e bloquear na sala também sai da partida, como o bloquear');
  for (const k of ['guest', 'no_peer', 'reason']) assert.match(conta, new RegExp('^\\s+' + k + ': ', 'm'));
});
test('denúncia: a migração existe, está travada por hash e tem as restrições', () => {
  const sql = read('migrations/012_denuncias.sql'), lock = JSON.parse(read('tests/migrations.sha256.json'));
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root, 'migrations/012_denuncias.sql'))).digest('hex'), lock['012_denuncias.sql']);
  for (const x of ["CHECK (reason IN ('apelido', 'comportamento', 'outro'))", "CHECK (context IN ('perfil', 'amigos', 'sala'))", 'CHECK (length(note) <= 200)', 'CHECK (reporter <> reported)', 'reporter      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE', 'reported      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE']) assert.ok(sql.includes(x), x);
  assert.match(read('SEGURANCA.md'), /## 12\. Denúncias e moderação/);
});
