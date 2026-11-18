"use strict";
// PostgreSQL real somente no qc_test, em schema temporário. O desbloqueio por gemas aceitava só 'cultura' e 'fantasia' (CHECK da migração 006):
// uma categoria paga nova falhava com erro 500. A migração 013 troca isso por uma chave estrangeira com o catálogo.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';
const root = path.join(__dirname, '..');

test('PostgreSQL: catálogo antigo, compras históricas preservadas e todas as imagens agora livres sem débito', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg'); const library = require('../library');
  const schema = 't_unl_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 }); await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: connection, ssl: false, max: 6, options: `-c search_path=${schema}` });
  const db = { q: (s, p) => pool.query(s, p), pool }; const q = (s, p) => pool.query(s, p);
  try {
    const dir = path.join(root, 'migrations'); const arqs = fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort();
    const ate012 = arqs.filter((n) => n < '013'); const depois = arqs.filter((n) => n >= '013');
    assert.deepEqual(depois.slice(0, 2), ['013_desbloqueio_categorias_novas.sql', '014_imagens_2026-11-d.sql'], 'as duas migrações desta correção, na ordem (as seguintes podem existir)');
    for (const f of ate012) await q(fs.readFileSync(path.join(dir, f), 'utf8'));

    /* ---- quem já tinha comprado "Cultura" ANTES da migração: nada se perde, nada quebra ---- */
    const mk = async (nome, gems) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded, gems) VALUES ($1,$2,$3,0,true,$4) RETURNING id', [nome.toLowerCase() + '@u.test', nome, 'K' + crypto.randomBytes(4).toString('hex').toUpperCase().replace(/[01ILO]/g, '2').slice(0, 7), gems])).rows[0].id;
    const antigo = await mk('Antigo', 10);
    await q("INSERT INTO library_unlocks (user_id, category_id, gems_spent) VALUES ($1, 'cultura', 25), ($1, 'fantasia', 40)", [antigo]);
    await assert.rejects(q("INSERT INTO library_unlocks (user_id, category_id, gems_spent) VALUES ($1, 'bau-maravilhas', 30)", [antigo]), /check|violates/i, 'ANTES da 013 a categoria nova era recusada pelo banco (o defeito)');
    for (const f of depois) await q(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.deepEqual((await q('SELECT category_id FROM library_unlocks WHERE user_id = $1 ORDER BY category_id', [antigo])).rows.map((r) => r.category_id), ['cultura', 'fantasia'], 'as compras antigas continuam lá');
    await q(fs.readFileSync(path.join(dir, depois[0]), 'utf8'));                                        // idempotente: rodar de novo não quebra
    const cons = (await q("SELECT conname FROM pg_constraint WHERE conrelid = 'library_unlocks'::regclass AND contype IN ('c', 'f') ORDER BY conname")).rows.map((r) => r.conname);
    assert.ok(cons.includes('library_unlocks_category_fk') && !cons.includes('library_unlocks_category_id_check'), 'trava velha saiu, chave estrangeira entrou: ' + cons.join(','));

    /* ---- o catálogo traz a categoria nova ---- */
    assert.equal(await library.loadFromDb(db, () => {}), true);
    const cat = library.CATEGORIES.find((c) => c.id === 'bau-maravilhas');
    assert.ok(cat, 'categoria no catálogo'); assert.deepEqual([cat.name, cat.unlock, cat.price, cat.order || cat.sortOrder], ['Baú das Maravilhas', 'gems', 30, 6]);
    assert.equal(library.ALL.filter((i) => i.categoryId === 'bau-maravilhas').length, 29, '29 imagens na categoria');
    assert.equal(library.CATEGORIES.length, 6);
    const api = library.makeService(db); const imagem = library.ALL.find((i) => i.categoryId === 'bau-maravilhas').file;

    /* ---- acesso público gratuito sem comprometer as compras históricas ---- */
    assert.deepEqual([library.cat('bau-maravilhas').unlock, library.cat('bau-maravilhas').price], ['free', 0]);
    assert.deepEqual([library.catalog().find(c => c.id === 'bau-maravilhas').unlock,
      library.catalog().find(c => c.id === 'bau-maravilhas').price], ['free', 0]);
    const ana = await mk('Ana', 100);
    for (const id of ['fauna', 'biomas', 'espaco', 'cultura', 'fantasia', 'bau-maravilhas']) {
      const f = library.ALL.find(i => i.categoryId === id).file;
      assert.equal(await api.canPlay(ana, f), true, id + ' aberto com conta sem progresso');
      assert.equal(await api.canPlay(null, f), true, id + ' aberto como visitante');
      assert.equal((await api.status(ana)).unlocked[id], true, 'API não pede sessão concluída');
    }
    const antes = await q('SELECT gems FROM users WHERE id = $1', [ana]);
    const paralelo = await Promise.all(Array.from({ length: 3 }, () => api.buy(ana, 'bau-maravilhas')));
    assert.ok(paralelo.every(r => r.ok === false && r.error === 'invalid'), 'API antiga não cobra por imagem livre');
    assert.equal(Number((await q('SELECT gems FROM users WHERE id = $1', [ana])).rows[0].gems), Number(antes.rows[0].gems));
    assert.equal((await q('SELECT count(*)::int AS n FROM library_unlocks WHERE user_id=$1', [ana])).rows[0].n, 0);
    const edu = await mk('Edu', 200);
    for (const id of ['fauna', 'biomas', 'espaco', 'cultura', 'fantasia', 'bau-maravilhas', 'nao-existe']) {
      assert.deepEqual([ (await api.buy(edu, id)).ok, (await api.buy(edu, id)).error ], [false, 'invalid'], id);
    }
    assert.equal(Number((await q('SELECT gems FROM users WHERE id = $1', [edu])).rows[0].gems), 200);
    assert.deepEqual((await q('SELECT category_id FROM library_unlocks WHERE user_id=$1 ORDER BY category_id', [antigo])).rows.map(r => r.category_id), ['cultura', 'fantasia'], 'compras anteriores não apagadas');

    /* ---- o banco é a última defesa ---- */
    await assert.rejects(q("INSERT INTO library_unlocks (user_id, category_id, gems_spent) VALUES ($1, 'categoria-que-nao-existe', 5)", [edu]), /foreign key|violates/i);
    await assert.rejects(q("INSERT INTO library_unlocks (user_id, category_id, gems_spent) VALUES ($1, 'bau-maravilhas', 0)", [edu]), /check|violates/i, 'gems_spent > 0 continua valendo');
    await q('DELETE FROM users WHERE id = $1', [ana]); assert.equal((await q('SELECT count(*)::int AS n FROM library_unlocks WHERE user_id = $1', [ana])).rows[0].n, 0, 'excluir a conta apaga as compras (cascata)');
  } finally { await pool.end().catch(() => {}); await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {}); await admin.end().catch(() => {}); }
});

test('estático: a 006 não foi alterada (continua imutável) e a 013 só mexe na trava do desbloqueio', () => {
  const sql013 = fs.readFileSync(path.join(root, 'migrations', '013_desbloqueio_categorias_novas.sql'), 'utf8').replace(/--.*$/gm, '');
  assert.match(sql013, /DROP CONSTRAINT IF EXISTS library_unlocks_category_id_check/); assert.match(sql013, /FOREIGN KEY \(category_id\) REFERENCES library_categories\(id\)/);
  assert.doesNotMatch(sql013, /\b(DROP TABLE|DELETE|TRUNCATE|UPDATE)\b/i, 'nenhum dado é apagado nem alterado');
  assert.match(fs.readFileSync(path.join(root, 'migrations', '006_biblioteca.sql'), 'utf8'), /CHECK \(category_id IN \('cultura', 'fantasia'\)\)/, 'a 006 segue como estava (imutável)');
});
