"use strict";
// PostgreSQL real somente no banco temporário qc_test, e num SCHEMA TEMPORÁRIO isolado (não toca nas tabelas reais nem nos outros testes).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';

test('PostgreSQL: migração 008, carga do catálogo, lote gerado pelo script, regras do banco, RLS e recusa de ciclo', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg'); const pool = new Pool({ connectionString: connection, ssl: false, max: 2 });
  const lib = require('../library'); const { gerar } = require('../scripts/gerar-lote-imagens');
  const schema = 't_cat_' + crypto.randomBytes(5).toString('hex');
  const client = await pool.connect(); const log = { warn() {}, error() {} };
  const db = { q: (s, p) => client.query(s, p) };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'catpg-'));
  try {
    await client.query(`CREATE SCHEMA ${schema}`); await client.query(`SET search_path TO ${schema}`);
    await client.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', '008_catalogo_biblioteca.sql'), 'utf8'));
    const embutido = JSON.stringify(lib.catalog().map((c) => ({ ...c, images: c.images.map((i) => ({ file: i.file, label: i.label, categoryId: i.categoryId })) })));

    // 0) GATE: acrescentar imagens a uma categoria NÃO trava de novo a seguinte (14 linhas sintéticas em fauna, sem depender dos lotes reais)
    for (let n = 6; n <= 19; n++) await client.query("INSERT INTO library_images (file, category_id, label, sort_order, width, height, bytes, sha256, thumb_sha256, source, license) VALUES ($1, 'fauna', $2, $3, 768, 1024, 1000, repeat('a', 64), repeat('b', 64), 'teste', 'teste')", ['lib-fauna-' + String(n).padStart(2, '0') + '.webp', 'Teste ' + n, n]);
    assert.equal(await lib.loadFromDb(db, log), true);
    const fauna5 = lib.ALL.filter((i) => i.categoryId === 'fauna').slice(0, 5).map((i) => i.file);
    assert.equal(lib.ALL.filter((i) => i.categoryId === 'fauna').length, 19);
    assert.equal(lib.unlocksFrom(fauna5, []).biomas, true, 'as 5 primeiras de fauna (o gate) liberam biomas, mesmo havendo 19');
    assert.equal(lib.unlocksFrom(fauna5.slice(0, 4), []).biomas, false);
    assert.equal(lib.unlocksFrom(lib.ALL.filter((i) => i.categoryId === 'fauna').slice(5).map((i) => i.file), []).biomas, false, 'só as extras não liberam');
    await client.query("DELETE FROM library_images WHERE source = 'teste'");        // volta ao estado só-008 para a comparação com o embutido abaixo

    // 1) a carga do banco entrega o MESMO catálogo do embutido (mesmos ids, rótulos, ordem, regras e preços)
    assert.equal(await lib.loadFromDb(db, log), true);
    const doBanco = JSON.stringify(lib.catalog().map((c) => ({ ...c, images: c.images.map((i) => ({ file: i.file, label: i.label, categoryId: i.categoryId })) })));
    assert.equal(doBanco, embutido, 'catálogo do banco == catálogo embutido');
    assert.ok(lib.ALL.every((i) => /^biblioteca\/lib-[a-z]+-0\d\.webp$/.test(i.url)), 'sem MEDIA_BASE_URL: arquivos locais');
    assert.deepEqual(lib.unlocksFrom([], []), { fauna: true, biomas: false, espaco: false, cultura: false, fantasia: false });

    // 2) RLS ligado nas duas tabelas e as regras do próprio banco recusam dado ruim
    const rls = (await client.query("SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('library_categories','library_images') AND relnamespace = $1::regnamespace", [schema])).rows;
    assert.deepEqual(rls.map((r) => r.relrowsecurity), [true, true]);
    for (const sql of ["INSERT INTO library_images(file,category_id,label,sort_order,width,height,bytes,sha256) VALUES('../x.webp','fauna','x',99,768,1024,10,repeat('a',64))",
      "INSERT INTO library_images(file,category_id,label,sort_order,width,height,bytes,sha256) VALUES('ok-01.webp','inexistente','x',99,768,1024,10,repeat('a',64))",
      "INSERT INTO library_categories(id,name,sort_order,unlock,price) VALUES('pago','P',9,'gems',0)", "INSERT INTO library_categories(id,name,sort_order,unlock) VALUES('Ruim Id','P',9,'free')"]) {
      await client.query('BEGIN'); await assert.rejects(client.query(sql), /violates (check|foreign key)/); await client.query('ROLLBACK');
    }

    // 3) um lote gerado pelo script entra no banco e vira catálogo (6 categorias), com a URL montada pelo servidor
    const pasta = path.join(tmp, 'lote'), migr = path.join(tmp, 'migrations'); fs.mkdirSync(path.join(pasta, 'mini'), { recursive: true }); fs.mkdirSync(migr); fs.writeFileSync(path.join(migr, '008_x.sql'), '--');
    for (const f of ['lib-oceano-01.webp', 'lib-oceano-02.webp']) { fs.copyFileSync(path.join(__dirname, '..', 'public', 'biblioteca', 'lib-fauna-01.webp'), path.join(pasta, f)); fs.copyFileSync(path.join(__dirname, '..', 'public', 'biblioteca', 'mini', 'lib-fauna-01.webp'), path.join(pasta, 'mini', f)); }
    fs.writeFileSync(path.join(tmp, 'm.json'), JSON.stringify({ lote: 'teste-pg', categorias: [{ id: 'oceano', nome: 'Vida no mar', icone: '🐠', ordem: 6, liberacao: 'after', requer: 'espaco' }],
      imagens: [1, 2].map((n) => ({ arquivo: `lib-oceano-0${n}.webp`, categoria: 'oceano', rotulo: 'Tartaruga ' + n, ordem: n, fonte: 'acervo próprio', licenca: 'uso autorizado' })) }));
    const g = gerar({ pasta, manifesto: path.join(tmp, 'm.json'), migracoes: migr, hashes: path.join(tmp, 'h.json') });
    assert.equal(g.ok, true, JSON.stringify(g.erros));
    const sql = fs.readFileSync(path.join(migr, g.nome), 'utf8');
    await client.query(sql); await client.query(sql);                                   // aplica duas vezes: idempotente
    assert.equal(Number((await client.query('SELECT count(*) FROM library_images')).rows[0].count), 27);
    assert.equal(await lib.loadFromDb(db, log), true);
    assert.deepEqual(lib.CATEGORIES.map((c) => c.id), ['fauna', 'biomas', 'espaco', 'cultura', 'fantasia', 'oceano']);
    assert.equal(lib.image('lib-oceano-01.webp').label, 'Tartaruga 1');
    assert.equal(lib.unlocksFrom([], []).oceano, false, 'nova categoria "after espaco" começa fechada');
    const espaco = lib.ALL.filter((i) => i.categoryId === 'espaco').map((i) => i.file);
    assert.equal(lib.unlocksFrom(espaco, []).oceano, true, '…e abre quando "espaco" está toda concluída');
    assert.ok(lib.image('lib-oceano-01.webp').thumb.startsWith('biblioteca/mini/'));

    // 4) um ciclo de liberação inserido por fora (o banco permite; o código recusa) NÃO troca nem derruba o catálogo
    const antes = JSON.stringify(lib.catalog());
    await client.query("UPDATE library_categories SET unlock = 'after', requires = 'oceano' WHERE id = 'espaco'");   // espaco -> oceano -> espaco
    await assert.rejects(lib.loadFromDb(db, log), /ciclo de liberação/);
    assert.equal(JSON.stringify(lib.catalog()), antes, 'catálogo anterior mantido');
    await client.query("UPDATE library_categories SET unlock = 'after', requires = 'biomas' WHERE id = 'espaco'");
    // 5) desativar uma imagem a tira do catálogo sem apagar nada
    await client.query("UPDATE library_images SET active = false WHERE file = 'lib-oceano-02.webp'");
    await lib.loadFromDb(db, log);
    assert.equal(lib.image('lib-oceano-02.webp'), null); assert.ok(lib.image('lib-oceano-01.webp'));
  } finally {
    lib.build(lib.SEED_CATEGORIES, lib.SEED_IMAGES, null);
    await client.query('RESET search_path').catch(() => {}); await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    client.release(); await pool.end(); fs.rmSync(tmp, { recursive: true, force: true });
  }
});
