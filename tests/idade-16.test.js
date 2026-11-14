'use strict';
// Jogo NÃO indicado para menores de 16 anos: tela de idade neutra (só no aparelho), trava do jogo até a idade ser informada, conta apagada se a pessoa declara menos de 16,
// confirmação "16 anos ou mais" no cadastro e política de privacidade coerente.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const { status, KEY, MIN_YEARS } = require('../public/idade.js');
const em = (a, m, d) => new Date(a, m - 1, d || 15);

test('a regra de idade: 16 anos COMPLETOS, de forma conservadora (sem saber o dia, só vale depois que o mês do 16º aniversário terminou)', () => {
  assert.equal(MIN_YEARS, 16); assert.equal(KEY, 'qc.age.v1');
  const hoje = em(2026, 11, 13);
  assert.equal(status(2010, 10, hoje), 'ok', 'fez 16 em outubro: já passou');
  assert.equal(status(2010, 11, hoje), 'under', 'faz 16 NESTE mês: ainda não libera (pode ser no fim do mês)');
  assert.equal(status(2010, 12, hoje), 'under'); assert.equal(status(2011, 1, hoje), 'under'); assert.equal(status(2020, 6, hoje), 'under');
  assert.equal(status(2000, 1, hoje), 'ok'); assert.equal(status(1950, 12, hoje), 'ok'); assert.equal(status(1900, 1, hoje), 'ok');
  assert.equal(status(2010, 12, em(2027, 1, 15)), 'ok', 'virada de ano: nasceu em dezembro de 2010, em janeiro de 2027 já passou o mês');
  assert.equal(status(2011, 1, em(2027, 1, 15)), 'under'); assert.equal(status(2011, 1, em(2027, 2, 1)), 'ok');
  assert.equal(status(2010, 11, em(2026, 12, 1)), 'ok', 'no mês seguinte ao 16º aniversário libera');
});
test('a regra de idade: mês/ano que não existem, no futuro, antes de 1900, não numéricos ou fracionados são INVÁLIDOS (nunca liberam)', () => {
  const hoje = em(2026, 11, 13);
  for (const [y, m] of [[2030, 1], [2026, 12], [2027, 11], [1899, 5], [2000, 0], [2000, 13], [2000, -1], ['abc', 5], [2000, 'x'], [NaN, 5], [2000.5, 5], [2000, 5.5], [null, 5], [undefined, undefined], [Infinity, 1]]) assert.equal(status(y, m, hoje), 'invalid', JSON.stringify([y, m]));
  assert.equal(status('2000', '5', hoje), 'ok', 'números como texto (vindos do select) valem');
  assert.equal(status(2026, 11, hoje), 'under', 'nasceu neste mês: bebê');
});

/* ===================== a tela de idade (HTML) ===================== */
const html = read('public/index.html');
test('tela de idade NEUTRA: não diz qual é o limite, só pede mês e ano, não tem como fechar nem corrigir depois; a resposta de menor de 16 não oferece "voltar"', () => {
  const m = html.match(/<div id="modal-age"[\s\S]*?<\/section>\s*<section id="age-no"[\s\S]*?<\/section>\s*<\/div>\s*<\/div>/); assert.ok(m, 'janela'); const j = m[0];
  assert.match(j, /role="dialog" aria-modal="true" aria-labelledby="age-title" aria-describedby="age-note"/); assert.match(j, /class="modal age-modal" hidden/);
  const pergunta = j.slice(j.indexOf('<section id="age-ask">'), j.indexOf('<section id="age-no"')).replace(/<[^>]+>/g, ' ');
  assert.ok(!/16|dezesseis|idade mínima|menor|maior/i.test(pergunta), 'a pergunta não pode revelar o limite: ' + pergunta.replace(/\s+/g, ' '));
  assert.match(j, /<select id="age-m">[\s\S]*<select id="age-y">/); assert.match(j, /<button id="age-go" class="btn btn-primary btn-block" type="button" disabled>Continuar<\/button>/);
  assert.ok(!/data-back|<a |type="submit"|age-close|Voltar|Corrigir/i.test(j), 'sem saída, sem corrigir, sem link');
  const nao = j.slice(j.indexOf('<section id="age-no"')); assert.match(nao, /Este jogo não é indicado para menores de 16 anos/); assert.match(nao, /Você poderá jogar quando fizer 16 anos/); assert.match(nao, /<p id="age-no-acc" hidden>Como havia uma conta neste aparelho, ela foi apagada\.<\/p>/);
});
test('a tela de idade vem ANTES do jogo: a janela é filha direta do <body> e existe antes do idade.js, que roda antes do game.js; o jogo só começa depois da idade; Voltar e Esc não fecham', () => {
  const iJan = html.indexOf('<div id="modal-age"'), iIdade = html.indexOf('<script src="idade.js"></script>'), iGame = html.indexOf('<script src="game.js"></script>'), iBoot = html.indexOf('<script src="boot.js"></script>');
  assert.ok(iBoot > 0 && iJan > html.indexOf('</main>') || iJan > 0); assert.ok(iJan < iIdade && iIdade < iGame, 'ordem: janela, idade.js, game.js');
  const antes = html.slice(0, iJan); const abre = (antes.match(/<(div|main|section|header|nav|aside|footer)\b[^>]*>/g) || []).length, fecha = (antes.match(/<\/(div|main|section|header|nav|aside|footer)>/g) || []).length; assert.equal(abre, fecha, 'a janela não está dentro de outro elemento (o "inert" nos irmãos a travaria)');
  const g = read('public/game.js');
  assert.match(g, /fetchConfig\(\)\.then\(function \(\) \{ return window\.QCIdade \? window\.QCIdade\.ready : null; \}\)\.then\(function \(\) \{/, 'sala, conta e tutorial só depois da idade');
  assert.match(g, /if \(m\.id === 'modal-age'\) return true;/, 'o Voltar do Android não fecha a tela de idade'); const esc = g.slice(g.indexOf("if (e.key === 'Escape') {"), g.indexOf("if (e.key === 'Escape') {") + 500); assert.ok(!esc.includes('modal-age'), 'Esc não fecha');
  const sw = read('public/sw.js'); assert.match(sw, /'\/boot\.js', '\/idade\.js', /); assert.match(sw, /const CACHE = 'quebra-cabeca-v21';/);
  const css = read('public/telas.css'); assert.match(css, /\.age-modal \{ z-index: 99999; background: var\(--paper\); align-items: center; justify-content: center;/); assert.match(css, /#age-no-title:focus \{ outline: none; \}/); const max = Math.max(...fs.readdirSync(path.join(root, 'public')).filter((f) => f.endsWith('.css')).flatMap((f) => [...read('public/' + f).matchAll(/z-index:\s*(\d+)/g)].map((x) => Number(x[1])).filter((z) => z < 99999))); assert.ok(max < 99999);
});
test('idade.js: só guarda mês e ano NO APARELHO, nunca envia a resposta; a única chamada ao servidor é apagar a conta (sem corpo); menor de 16 não resolve a espera do jogo', () => {
  const j = read('public/idade.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.equal((j.match(/\.fetch\(/g) || []).length, 1); assert.match(j, /root\.fetch\('\/api\/acc\/underage', \{ method: 'POST', headers: \{ 'Content-Type': 'application\/json', Authorization: 'Bearer ' \+ t \}, body: '\{\}' \}\)/);
  assert.doesNotMatch(j, /sendBeacon|XMLHttpRequest|WebSocket|socket|sessionStorage|document\.cookie/); assert.match(j, /localStorage\.setItem\(KEY, JSON\.stringify\(\{ y: y, m: m \}\)\)/);
  assert.match(j, /else if \(st0 === 'under'\) \{ show\('no'\); eraseAccountIfAny\(\); \}/, 'menor: bloqueia e (se havia conta) apaga'); assert.ok(!/under'\)[^;]*resolveReady/.test(j), 'menor nunca libera');
  assert.match(j, /if \(st === 'ok'\) pass\(\); else \{ show\('no'\); eraseAccountIfAny\(\); \}/);
  assert.match(j, /\.setAttribute\('inert', ''\)/, 'nada atrás da tela recebe toque ou foco'); assert.match(j, /\(which === 'ask' \? selM : doc\.getElementById\('age-no-title'\)\)\.focus\(/, 'o foco vai para o que está VISÍVEL (o mês, ou o aviso de bloqueio)');
});

/* ===================== servidor: cadastro e exclusão ===================== */
const acc = read('accounts.js');
test('servidor: a criação do perfil exige age16 === true (só o booleano), e /underage apaga SÓ a conta da sessão, com limite, sem pedir senha, pelo mesmo apagador do /delete', () => {
  assert.equal((acc.match(/if \(b\.age16 !== true\) return bad\(res, 400, 'age16'\);/g) || []).length, 1, 'um único ponto de criação: /profile/new'); assert.ok(!/age13/.test(acc));
  assert.match(acc, /async function eraseAccount\(user\) \{[\s\S]*?DELETE FROM users WHERE id = \$1[\s\S]*?revokeSocketSessions\(user\.id\);\s*\}/);
  assert.match(acc, /r\.post\('\/delete', needUser, guard\(async \(req, res\) => \{[\s\S]*?if \(b\.confirm !== 'EXCLUIR'\) return bad\(res, 400, 'confirm'\);[\s\S]*?bad_login[\s\S]*?await eraseAccount\(req\.user\);/, 'o /delete continua pedindo confirmação e senha');
  assert.match(acc, /r\.post\('\/underage', needUser, guard\(async \(req, res\) => \{\s+if \(!allow\('under:' \+ req\.user\.id, 5, 10 \* 60 \* 1000\)\) return bad\(res, 429, 'rate'\);\s+await eraseAccount\(req\.user\);/);
  const conta = read('public/conta.js'); assert.ok(!/age13/.test(conta)); assert.match(conta, /age16: 'Este jogo não é indicado para menores de 16 anos\. Marque a caixa se você tem 16 anos ou mais\.'/);
  assert.match(html, /<span>Tenho 16 anos ou mais\. \(Este jogo não é indicado para menores de 16 anos\.\)<\/span>/);
});
test('política de privacidade e textos: 16 anos em todo lugar, nada de "13 anos" nem de data de nascimento pedida ao servidor, e uma seção para pais e responsáveis', () => {
  const pol = read('public/privacidade.html').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const t of ['não é indicado para menores de 16 anos', 'pedimos o mês e o ano do seu nascimento só para saber se você pode jogar', 'Ao criar um perfil, você confirma que tem 16 anos ou mais', 'Quem informa ter menos de 16 anos não consegue jogar, e o perfil que existir neste aparelho é apagado', 'Para pais e responsáveis', 'nada disso é enviado ao servidor', 'atualizada em 14 de novembro de 2026']) assert.ok(pol.includes(t), t);
  assert.ok(!/13 anos|data de nascimento nem localização/.test(pol));
  for (const f of ['public/manifest.webmanifest', 'public/index.html', 'public/conta.js', 'README.md', 'CONTAS.md', 'PLAY-STORE.md']) assert.ok(!/(?:para|tem|Tenho|menores de|maiores de)\s+13 anos|13\+/.test(read(f).replace(/ECA[^\n]*/g, '')), f + ' ainda fala em 13 anos');
  assert.match(read('PLAY-STORE.md'), /Marque 16–17 e 18 ou mais\. Não marque 5 ou menos, 6–8, 9–12 nem 13–15\./); assert.match(read('PLAY-STORE.md'), /informe um mês e um ano de nascimento de alguém com 16 anos ou mais/);
});
