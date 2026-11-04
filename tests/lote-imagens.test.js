'use strict';
// Gerador de lotes de imagens: gera UMA migração numerada e REVISÁVEL; recusa tudo que for suspeito sem gravar nada.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT } = require('./helpers');
const { gerar, webpSize } = require(path.join(ROOT, 'scripts', 'gerar-lote-imagens'));
const ORIG = path.join(ROOT, 'public', 'biblioteca', 'lib-fauna-01.webp'), MINI = path.join(ROOT, 'public', 'biblioteca', 'mini', 'lib-fauna-01.webp');

function cenario(arquivos, extra) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-')), pasta = path.join(dir, 'lote'), migr = path.join(dir, 'migrations');
  fs.mkdirSync(path.join(pasta, 'mini'), { recursive: true }); fs.mkdirSync(migr);
  for (const n of ['001_a.sql', '007_b.sql', '008_c.sql']) fs.writeFileSync(path.join(migr, n), '-- x');
  const hashes = path.join(dir, 'hashes.json'); fs.writeFileSync(hashes, JSON.stringify({ '008_c.sql': 'x' }));
  for (const f of arquivos) { fs.copyFileSync(ORIG, path.join(pasta, f)); fs.copyFileSync(MINI, path.join(pasta, 'mini', f)); }
  const im = (n, o) => Object.assign({ arquivo: `lib-oceano-0${n}.webp`, categoria: 'oceano', rotulo: 'Tartaruga ' + n, ordem: n, fonte: 'acervo próprio', licenca: 'uso autorizado pelo autor' }, o);
  const man = Object.assign({ lote: '2026-11-a', categorias: [{ id: 'oceano', nome: 'Vida no mar', subtitulo: 'Águas azuis', icone: '🐠', ordem: 6, liberacao: 'free' }], imagens: [im(1), im(2)] }, extra);
  fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify(man));
  return { dir, pasta, migr, hashes, manifesto: path.join(dir, 'm.json'), run: () => gerar({ pasta, manifesto: path.join(dir, 'm.json'), migracoes: migr, hashes }), mexer: (f) => { const m = JSON.parse(fs.readFileSync(path.join(dir, 'm.json'), 'utf8')); f(m); fs.writeFileSync(path.join(dir, 'm.json'), JSON.stringify(m)); } };
}

test('lote válido: gera a migração 009 com hashes reais, SQL seguro e entrada no controle de imutabilidade', () => {
  const c = cenario(['lib-oceano-01.webp', 'lib-oceano-02.webp']);
  const r = c.run();
  assert.equal(r.ok, true, JSON.stringify(r.erros));
  assert.equal(r.nome, '009_imagens_2026-11-a.sql');
  const sql = fs.readFileSync(path.join(c.migr, r.nome), 'utf8');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(ORIG)).digest('hex');
  assert.match(sql, /INSERT INTO library_categories \(id, name, subtitle, icon, sort_order, unlock, requires, price\) VALUES\n  \('oceano', 'Vida no mar', 'Águas azuis', '🐠', 6, 'free', NULL, 0\)\nON CONFLICT \(id\) DO NOTHING;/);
  assert.ok(sql.includes(`'lib-oceano-01.webp', 'oceano', 'Tartaruga 1', 1, 768, 1024, ${fs.statSync(ORIG).size}, '${sha}'`), 'sha256 e tamanho reais do arquivo');
  assert.match(sql, /'acervo próprio', 'uso autorizado pelo autor'\)/);
  assert.match(sql, /ON CONFLICT \(file\) DO NOTHING;\n$/);
  assert.ok(!/DROP|DELETE|UPDATE|TRUNCATE|ALTER/i.test(sql), 'a migração só INSERE');
  assert.equal(JSON.parse(fs.readFileSync(c.hashes, 'utf8'))[r.nome], crypto.createHash('sha256').update(sql).digest('hex'), 'hash gravado para o teste de imutabilidade');
  assert.deepEqual(r.enviar, ['biblioteca/lib-oceano-01.webp', 'biblioteca/mini/lib-oceano-01.webp', 'biblioteca/lib-oceano-02.webp', 'biblioteca/mini/lib-oceano-02.webp']);
  const again = c.run();
  assert.match(again.erros[0], /o lote "2026-11-a" já foi gerado em 009_imagens_2026-11-a\.sql/, 'o mesmo lote não gera uma segunda migração');
  assert.deepEqual(fs.readdirSync(c.migr).filter((n) => /^0(09|10)/.test(n)), [r.nome], 'nenhuma migração extra');
});

test('aspas e textos com SQL dentro viram dado inofensivo (nunca execução)', () => {
  const c = cenario(['lib-oceano-01.webp', 'lib-oceano-02.webp'], {});
  c.mexer((m) => { m.imagens[0].rotulo = "Rei d'água'); DROP TABLE users;--"; });
  const r = c.run(); assert.equal(r.ok, true);
  const sql = fs.readFileSync(path.join(c.migr, r.nome), 'utf8');
  assert.ok(sql.includes("'Rei d''água''); DROP TABLE users;--'"), 'as aspas foram duplicadas: tudo fica dentro de um texto');
});

test('RECUSA e não grava nada: fonte/licença vazias, nomes suspeitos, arquivo falso, medidas e pesos fora, repetidos', () => {
  const casos = {
    'licença vazia': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[0].licenca = ''; }, /LICENÇA/],
    'fonte vazia': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[1].fonte = '  '; }, /FONTE/],
    'nome com ..': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[0].arquivo = '../../x.webp'; }, /nome de arquivo inválido/],
    'nome com barra': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[0].arquivo = 'a/b.webp'; }, /nome de arquivo inválido/],
    'extensão errada': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[0].arquivo = 'lib-oceano-01.png'; }, /nome de arquivo inválido/],
    'arquivo repetido': [['lib-oceano-01.webp'], (m) => { m.imagens[1].arquivo = 'lib-oceano-01.webp'; }, /arquivo repetido/],
    'ordem repetida': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[1].ordem = 1; }, /ordem 1 repetida/],
    'arquivo ausente': [['lib-oceano-01.webp'], () => {}, /não encontrado/],
    'categoria inválida': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[0].categoria = 'Mar Azul'; }, /categoria inválida/],
    'gems sem preço': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.categorias[0].liberacao = 'gems'; }, /preco/],
    'after sem requer': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.categorias[0].liberacao = 'after'; }, /requer/],
    'lote inválido': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.lote = '../x'; }, /lote/],
    'rótulo com controle': [['lib-oceano-01.webp', 'lib-oceano-02.webp'], (m) => { m.imagens[0].rotulo = 'a\u0000b'; }, /controle/],
    'sem imagens': [[], (m) => { m.imagens = []; }, /nenhuma imagem/]
  };
  for (const [nome, [arqs, mexe, re]] of Object.entries(casos)) {
    const c = cenario(arqs); c.mexer(mexe);
    const antes = fs.readdirSync(c.migr).sort().join(), hashAntes = fs.readFileSync(c.hashes, 'utf8');
    const r = c.run();
    assert.ok(r.erros && r.erros.some((e) => re.test(e)), nome + ': ' + JSON.stringify(r.erros || r));
    assert.equal(fs.readdirSync(c.migr).sort().join(), antes, nome + ': nada foi gravado em migrations/');
    assert.equal(fs.readFileSync(c.hashes, 'utf8'), hashAntes, nome + ': o controle de hashes não mudou');
  }
});

test('RECUSA arquivo que não é WebP de verdade (a extensão não basta), medidas erradas e peso excessivo', () => {
  let c = cenario(['lib-oceano-01.webp', 'lib-oceano-02.webp']);
  fs.writeFileSync(path.join(c.pasta, 'lib-oceano-01.webp'), Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2000)]));   // PNG disfarçado
  assert.ok(c.run().erros.some((e) => /não é um WebP verdadeiro/.test(e)), 'PNG com extensão .webp');
  c = cenario(['lib-oceano-01.webp', 'lib-oceano-02.webp']);
  fs.writeFileSync(path.join(c.pasta, 'lib-oceano-01.webp'), Buffer.from('<?php system($_GET["c"]); ?>'.padEnd(200, ' ')));
  assert.ok(c.run().erros.some((e) => /não é um WebP verdadeiro/.test(e)), 'script disfarçado');
  c = cenario(['lib-oceano-01.webp', 'lib-oceano-02.webp']);
  fs.copyFileSync(MINI, path.join(c.pasta, 'lib-oceano-01.webp'));                       // a miniatura (240x320) no lugar do original
  assert.ok(c.run().erros.some((e) => /deve ter 768x1024 \(tem 240x320\)/.test(e)), 'medidas erradas');
  c = cenario(['lib-oceano-01.webp', 'lib-oceano-02.webp']);
  fs.copyFileSync(ORIG, path.join(c.pasta, 'mini', 'lib-oceano-02.webp'));               // o original (768x1024, pesado) no lugar da miniatura
  const e = c.run().erros.join(' | ');
  assert.match(e, /mini\/lib-oceano-02\.webp: deve ter 240x320/); assert.match(e, /pesada demais/);
  assert.equal(webpSize(Buffer.from('RIFF....WEBPVP8 ' + 'x'.repeat(40))) !== null, true, 'cabeçalho mínimo é lido; o resto é validado por medidas');
  assert.equal(webpSize(Buffer.alloc(10)), null);
});
