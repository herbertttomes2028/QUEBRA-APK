'use strict';
// Trava contra XSS por descuido: o cliente NÃO pode montar HTML a partir de dados.
// Só é aceito 1 uso de innerHTML, com uma CONSTANTE do código (a caixa de presentes); nenhum dado de jogador, da URL ou do servidor vira HTML.
// Para esvaziar um elemento use textContent = '' (innerHTML = '' também é reportado pelo Trusted Types).
// Qualquer outro innerHTML com conteúdo, insertAdjacentHTML, outerHTML, document.write, eval ou new Function faz este teste falhar:
// use textContent / createElement, ou, se for mesmo preciso, acrescente o caso aqui com uma justificativa revisada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'sw.js');
const PERMITIDOS = new Map([
  ['game.js', [
    'gift.innerHTML = TT ? TT.createHTML(GIFT_SVG) : GIFT_SVG;',     // a caixa de presentes: constante do código, liberada pela política do Trusted Types
  ]],
]);

// Outros caminhos que escapavam da trava (auditoria de 14/11/2026): innerHTML +=, acesso entre colchetes, srcdoc por setAttribute,
// endereços javascript:, createContextualFragment, setHTML/setHTMLUnsafe, atributos de evento por setAttribute e innerHTML em Object.assign.
const OUTROS_PONTOS = [
  [/\.innerHTML\s*\+=/, 'innerHTML +='],
  [/\[\s*['"`](innerHTML|outerHTML)['"`]\s*\]/, 'innerHTML entre colchetes'],
  [/setAttribute\(\s*['"`](srcdoc|on[a-z]+)['"`]/i, 'srcdoc/evento por setAttribute'],
  [/['"`]\s*javascript:/i, 'endereço javascript:'],
  [/createContextualFragment\s*\(/, 'createContextualFragment'],
  [/\.setHTML(Unsafe)?\s*\(/, 'setHTML'],
  [/\binnerHTML\s*:/, 'innerHTML dentro de objeto (Object.assign)']
];

test('a própria trava pega os caminhos que antes escapavam', () => {
  const amostras = ["el.innerHTML += nome;", "el['innerHTML'] = nome;", 'el.setAttribute("srcdoc", x);', "a.href = 'javascript:' + x;", 'r.createContextualFragment(x);', 'el.setHTMLUnsafe(x);', 'Object.assign(el, { innerHTML: x });', "b.setAttribute('onclick', x);"];
  for (const a of amostras) assert.ok(OUTROS_PONTOS.some(([re]) => re.test(a)), 'a trava deixaria passar: ' + a);
  for (const ok of ["el.textContent = nome;", "a.setAttribute('href', '/privacidade.html');", "img.src = state.imageUrl;"]) assert.ok(!OUTROS_PONTOS.some(([re]) => re.test(ok)), 'falso alarme: ' + ok);
});

test('cliente: nenhum innerHTML com dados, nem insertAdjacentHTML/outerHTML/document.write/eval/new Function', () => {
  const achados = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const ok = PERMITIDOS.get(f) || [];
    src.split('\n').forEach((linha, i) => {
      const t = linha.trim();
      if (/\binsertAdjacentHTML\b|\.outerHTML\s*=|document\.write\s*\(|\beval\s*\(|new Function\s*\(|\.srcdoc\s*=/.test(t) && !t.startsWith('//') && !t.startsWith('*')) achados.push(f + ':' + (i + 1) + ' ' + t.slice(0, 90));
      if (!t.startsWith('//') && !t.startsWith('*')) for (const [re, nome] of OUTROS_PONTOS) if (re.test(t)) achados.push(f + ':' + (i + 1) + ' [' + nome + '] ' + t.slice(0, 90));
      for (const m of t.matchAll(/\.innerHTML\s*=\s*([^;]*);?/g)) {            // cada atribuição da linha; até innerHTML = '' é ponto de escrita para o Trusted Types: para limpar, use textContent = ''
        if (!ok.some((p) => p.includes(m[0].trim()) || m[0].trim().includes(p.replace(/;$/, '')))) achados.push(f + ':' + (i + 1) + ' ' + m[0].slice(0, 90));
      }
    });
  }
  assert.deepEqual(achados, [], 'HTML montado a partir de dados (use textContent): ' + achados.join(' | '));
});

test('cliente: os usos permitidos continuam existindo (a lista não pode ficar velha)', () => {
  const src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  for (const p of PERMITIDOS.get('game.js')) assert.ok(src.includes(p), 'não existe mais: ' + p);
});

test('botões de tamanho: o rótulo entra por textContent', () => {
  const src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  assert.ok(!src.includes("'<b>' + p.pieces"), 'voltou a montar HTML com p.pieces/p.label');
  assert.match(src, /nl\.textContent = String\(p\.label\)/);
});

test('Trusted Types: Worker e service worker só com a política; a política só libera o que o jogo usa', () => {
  const src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  assert.ok(!/new Worker\((?!scriptUrl\()/.test(src), 'new Worker com endereço solto (use scriptUrl)');
  assert.ok(!/serviceWorker\.register\((?!scriptUrl\()/.test(src), 'register com endereço solto (use scriptUrl)');
  assert.match(src, /createScriptURL: function \(u\) \{ if \(u === '\/sw\.js' \|\| u === 'crop-worker\.js'\) return u; throw/);
  assert.match(src, /createHTML: function \(h\) \{ if \(h === GIFT_HTML_OK \|\| \(PRIV_HTML_OK && h === PRIV_HTML_OK\)\) return h; throw/);
  assert.ok(!/createPolicy\('default'/.test(src), 'não crie política "default" (ela liberaria tudo)');
  const outros = fs.readdirSync(dir).filter((f) => f.endsWith('.js') && f !== 'game.js' && f !== 'sw.js');
  for (const f of outros) { const t = fs.readFileSync(path.join(dir, f), 'utf8'); assert.ok(!/new (Shared)?Worker\(|serviceWorker\.register\(/.test(t), f + ' cria worker sem passar pela política'); }
});

test('política de privacidade dentro do app: o texto passa pela política Trusted Types só na hora de abrir, vem do próprio site e é limpo', () => {
  const src = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  const fn = src.slice(src.indexOf('  function openPrivacy()'), src.indexOf("  document.addEventListener('click', function (e) {\n    var a = e.target.closest && e.target.closest('a[data-privacy]')"));
  assert.ok(fn.length > 100, 'openPrivacy encontrada');
  assert.match(fn, /PRIV_HTML_OK = t;\n      try \{ doc = new DOMParser\(\)\.parseFromString\(TT \? TT\.createHTML\(t\) : t, 'text\/html'\); \} finally \{ PRIV_HTML_OK = ''; \}/, 'aceita o texto uma vez só e esquece em seguida');
  assert.ok(!/parseFromString\(t,/.test(fn), 'DOMParser nunca recebe o texto cru (gerava relatório do Trusted Types)');
  assert.match(fn, /new URL\(r\.url, location\.href\)\.origin !== location\.origin/, 'só a política do próprio site');
  assert.match(fn, /querySelectorAll\('script, iframe, object, embed, link, meta, base, form'\)/, 'remove o que executa código');
  assert.match(fn, /nm\.indexOf\('on'\) === 0 \|\| nm === 'srcdoc'/, 'remove atributos de evento e srcdoc');
  assert.equal((src.match(/new DOMParser\(\)/g) || []).length, 1, 'DOMParser só neste lugar');
});
