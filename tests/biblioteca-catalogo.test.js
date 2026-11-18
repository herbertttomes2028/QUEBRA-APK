'use strict';
// Catálogo da biblioteca dirigido por banco: TUDO que vem do banco é validado; dado inválido nunca vira meio catálogo.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { ROOT } = require('./helpers');
const lib = require(path.join(ROOT, 'library'));
const cat = (o) => Object.assign({ id: 'a1', name: 'A', subtitle: '', icon: '', order: 1, unlock: 'free', requires: null, price: 0 }, o);
const img = (o) => Object.assign({ file: 'a1-01.webp', label: 'Imagem', categoryId: 'a1', order: 1, width: 768, height: 1024, sha: '', thumbSha: '' }, o);
const quebra = (cats, imgs, msg) => assert.throws(() => lib.build(cats, imgs, null), /catálogo inválido/, msg);

test('o catálogo embutido (reserva) é o de sempre: 5 categorias, 25 imagens, regras e preços iguais', () => {
  assert.deepEqual(lib.CATEGORIES.map((c) => [c.id, c.unlock, c.requires, c.price]), [['fauna', 'free', null, 0], ['biomas', 'after', 'fauna', 0], ['espaco', 'after', 'biomas', 0], ['cultura', 'gems', null, 25], ['fantasia', 'gems', null, 40]]);
  assert.equal(lib.ALL.length, 25);
  assert.deepEqual(lib.unlocksFrom([], []), { fauna: true, biomas: false, espaco: false, cultura: false, fantasia: false });
  assert.deepEqual(lib.unlocksFrom([], ['cultura']), { fauna: true, biomas: false, espaco: false, cultura: true, fantasia: false });
});

test('catálogo válido: ordena, congela e monta as regras de liberação genéricas (free / after / gems)', () => {
  const c = lib.build([cat({ id: 'b2', order: 3, unlock: 'after', requires: 'a1' }), cat({ id: 'a1', order: 1 }), cat({ id: 'c3', order: 2, unlock: 'gems', price: 10 })],
    [img({ file: 'b2-01.webp', categoryId: 'b2' }), img(), img({ file: 'a1-02.webp', order: 2 }), img({ file: 'c3-01.webp', categoryId: 'c3' })], null);
  assert.deepEqual(c.CATEGORIES.map((x) => x.id), ['a1', 'c3', 'b2']);
  assert.deepEqual(c.ALL.map((x) => x.file), ['a1-01.webp', 'a1-02.webp', 'c3-01.webp', 'b2-01.webp']);
  assert.ok(Object.isFrozen(c.CATEGORIES) && Object.isFrozen(c.ALL) && Object.isFrozen(c.ALL[0]));
});

test('dado inválido é RECUSADO por inteiro (nunca meio catálogo)', () => {
  const ok = () => [[cat()], [img()]];
  const v = (f) => { const [c, i] = ok(); f(c, i); return [c, i]; };
  for (const [msg, args] of [
    ['id com maiúscula/espaço', v((c) => { c[0].id = 'Ruim id'; })], ['id muito curto', v((c) => { c[0].id = 'a'; })],
    ['arquivo com ..', v((c, i) => { i[0].file = '../x.webp'; })], ['arquivo com barra', v((c, i) => { i[0].file = 'a/b.webp'; })], ['extensão errada', v((c, i) => { i[0].file = 'x1.png'; })],
    ['categoria da imagem inexistente', v((c, i) => { i[0].categoryId = 'zz'; })], ['liberação desconhecida', v((c) => { c[0].unlock = 'pago'; })],
    ['gems sem preço', v((c) => { c[0].unlock = 'gems'; c[0].price = 0; })], ['preço em categoria free', v((c) => { c[0].price = 5; })], ['preço negativo', v((c) => { c[0].unlock = 'gems'; c[0].price = -1; })],
    ['preço absurdo', v((c) => { c[0].unlock = 'gems'; c[0].price = 100000; })], ['after sem requires', v((c) => { c[0].unlock = 'after'; })], ['requires em categoria free', v((c) => { c[0].requires = 'a1'; })],
    ['requires para si mesma', v((c) => { c[0].unlock = 'after'; c[0].requires = 'a1'; })], ['requires inexistente', v((c) => { c[0].unlock = 'after'; c[0].requires = 'nada'; })],
    ['nome vazio', v((c) => { c[0].name = '   '; })], ['nome gigante', v((c) => { c[0].name = 'x'.repeat(61); })], ['rótulo não é texto', v((c, i) => { i[0].label = { a: 1 }; })],
    ['sha256 inválido', v((c, i) => { i[0].sha = 'zzz'; })], ['largura absurda', v((c, i) => { i[0].width = 999999; })], ['categoria sem imagem', v((c) => { c.push(cat({ id: 'vazia', order: 2 })); })]]) quebra(args[0], args[1], msg);
  quebra([cat(), cat()], [img()], 'categoria repetida'); quebra([cat(), cat({ id: 'b2', order: 1 })], [img(), img({ file: 'b2-01.webp', categoryId: 'b2' })], 'ordem repetida');
  quebra([cat()], [img(), img()], 'arquivo repetido'); quebra([cat()], [img(), img({ file: 'a1-02.webp' })], 'ordem de imagem repetida na categoria');
  quebra([], [img()], 'sem categorias'); quebra([cat()], [], 'sem imagens'); quebra('x', [], 'formato');
  quebra(Array.from({ length: 101 }, (_, n) => cat({ id: 'k' + (n + 10), order: n + 1 })), [img()], 'categorias demais');
  quebra([cat({ id: 'a1', order: 1, unlock: 'after', requires: 'b2' }), cat({ id: 'b2', order: 2, unlock: 'after', requires: 'a1' })], [img(), img({ file: 'b2-01.webp', categoryId: 'b2' })], 'ciclo');
});

test('texto vindo do banco é limpo: sem quebras de linha nem caracteres de controle (o cliente ainda só usa textContent)', () => {
  const c = lib.build([cat({ name: 'Linha1\nLinha2\u0007  ruim' })], [img({ label: '  <b>x</b>\r\n' })], null);
  assert.equal(c.CATEGORIES[0].name, 'Linha1 Linha2 ruim');
  assert.equal(c.ALL[0].label, '<b>x</b>');                       // o HTML não é "executado": nenhum innerHTML usa esses campos
});

test('loadFromDb: troca o catálogo de uma vez; banco vazio ou inválido MANTÉM o atual e não derruba nada', async () => {
  const antes = JSON.stringify(lib.catalog());
  const rows = (c, i) => ({ q: async (sql) => ({ rows: /library_categories/.test(sql) ? c : i }) });
  const log = { warn() {}, error() {} };
  assert.equal(await lib.loadFromDb(rows([], []), log), false);
  assert.equal(JSON.stringify(lib.catalog()), antes, 'banco vazio: catálogo atual mantido');
  const c1 = [{ id: 'x1', name: 'Nova', subtitle: '', icon: '', sort_order: 1, unlock: 'free', requires: null, price: 0 }];
  const i1 = [{ file: 'x1-01.webp', category_id: 'x1', label: 'Uma', sort_order: 1, width: 768, height: 1024, sha256: 'a'.repeat(64), thumb_sha256: null }];
  await assert.rejects(lib.loadFromDb(rows(c1, [{ ...i1[0], file: '../x.webp' }]), log), /catálogo inválido/);
  assert.equal(JSON.stringify(lib.catalog()), antes, 'dado inválido: NADA mudou');
  assert.equal(await lib.loadFromDb(rows(c1, i1), log), true);
  assert.deepEqual(lib.catalog().map((c) => c.id), ['x1']);
  assert.equal(lib.image('x1-01.webp').url, 'biblioteca/mini/x1-01.webp'.replace('mini/', ''));
  assert.equal(lib.image('lib-fauna-01.webp'), null, 'a imagem antiga saiu do catálogo carregado');
  // volta ao embutido para não afetar nenhum outro teste deste processo
  lib.build(lib.SEED_CATEGORIES, lib.SEED_IMAGES, null);
});

test('o catálogo é lido do banco UMA vez (sem consulta periódica que manteria o Neon acordado e gastaria a cota)', () => {
  const fs = require('node:fs');
  const src = fs.readFileSync(path.join(ROOT, 'library.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''), srv = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
  assert.ok(!/setInterval|startRefresh/.test(src), 'library.js não agenda recargas');
  assert.ok(!/startRefresh/.test(srv));
  assert.equal((srv.match(/library\.loadFromDb\(/g) || []).length, 1, 'uma única carga, ao ligar');
});

test('/api/config comprime (gzip, sem dependência nova) quando o catálogo é grande e responde igual com e sem compressão', async () => {
  const { startServer } = require('./helpers'); const zlib = require('node:zlib');
  const srv = await startServer();
  try {
    const http = require('node:http'), u = new URL(srv.url + '/api/config');
    const pega = (enc) => new Promise((res, rej) => http.get({ hostname: u.hostname, port: u.port, path: u.pathname, headers: enc ? { 'Accept-Encoding': enc } : {} }, (r) => { const b = []; r.on('data', (d) => b.push(d)); r.on('end', () => res({ h: r.headers, b: Buffer.concat(b) })); }).on('error', rej));
    const plano = await pega(''), gz = await pega('gzip');
    assert.equal(plano.h['content-encoding'], undefined);
    assert.equal(plano.h['vary'], 'Accept-Encoding');
    assert.match(plano.h['content-type'], /application\/json/);
    const json = JSON.parse(plano.b.toString('utf8'));
    assert.equal(json.library.length, 5);
    if (plano.b.length > 1024) {                          // acima de 1 KB, quem aceita gzip recebe comprimido e o conteúdo é IDÊNTICO
      assert.equal(gz.h['content-encoding'], 'gzip');
      assert.equal(zlib.gunzipSync(gz.b).toString('utf8'), plano.b.toString('utf8'));
      assert.ok(gz.b.length < plano.b.length / 2, 'comprimiu: ' + plano.b.length + ' -> ' + gz.b.length);
    }
  } finally { await srv.stop(); }
});

test('unlock_gate: acrescentar imagens a uma categoria NÃO trava de novo a categoria seguinte (só as N primeiras contam)', () => {
  const cats = [cat({ id: 'a1', order: 1, gate: 2 }), cat({ id: 'b2', order: 2, unlock: 'after', requires: 'a1' })];
  const imgs = ['a1-01', 'a1-02', 'a1-03', 'a1-04'].map((f, i) => img({ file: f + '.webp', order: i + 1 })).concat([img({ file: 'b2-01.webp', categoryId: 'b2' })]);
  const c = lib.build(cats, imgs, null);
  assert.equal(c.CATEGORIES[0].gate, 2);
  // o catálogo atual do módulo é o embutido: valida a regra pelo próprio build via uma carga simulada
  const rows = (cc, ii) => ({ q: async (sql) => ({ rows: /library_categories/.test(sql) ? cc : ii }) });
  const log = { warn() {}, error() {} };
  return lib.loadFromDb(rows(cats.map((x) => ({ id: x.id, name: 'N', subtitle: '', icon: '', sort_order: x.order, unlock: x.unlock, requires: x.requires, price: 0, unlock_gate: x.gate == null ? null : x.gate })),
    imgs.map((x) => ({ file: x.file, category_id: x.categoryId, label: 'L', sort_order: x.order, width: 768, height: 1024, sha256: '', thumb_sha256: null }))), log).then(() => {
    try {
      assert.equal(lib.unlocksFrom([], []).b2, false);
      assert.equal(lib.unlocksFrom(['a1-01.webp'], []).b2, false, 'só 1 de 2 do gate');
      assert.equal(lib.unlocksFrom(['a1-01.webp', 'a1-02.webp'], []).b2, true, 'as 2 primeiras abrem a próxima, mesmo havendo 4 imagens');
      assert.equal(lib.unlocksFrom(['a1-03.webp', 'a1-04.webp'], []).b2, false, 'imagens extras não substituem as do gate');
    } finally { lib.build(lib.SEED_CATEGORIES, lib.SEED_IMAGES, null); }
  });
});

test('unlock_gate inválido é recusado (maior que o número de imagens, zero, texto)', () => {
  const ok = [img(), img({ file: 'a1-02.webp', order: 2 })];
  quebra([cat({ gate: 3 })], ok, 'gate > imagens'); quebra([cat({ gate: 0 })], ok, 'gate 0'); quebra([cat({ gate: 'x' })], ok, 'gate texto'); quebra([cat({ gate: 999 })], ok, 'gate absurdo');
  assert.equal(lib.build([cat({ gate: 2 })], ok, null).CATEGORIES[0].gate, 2);
});
