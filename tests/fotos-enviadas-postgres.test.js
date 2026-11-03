"use strict";
// PostgreSQL real somente no banco temporário qc_test (como os outros testes com banco).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';

test('migração 007: apaga as fotos já guardadas e as partidas salvas que dependiam delas; preserva o resto; é idempotente', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg'); const pool = new Pool({ connectionString: connection, ssl: false, max: 3 });
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '007_remover_fotos_enviadas.sql'), 'utf8');
  const uniq = crypto.randomBytes(6).toString('hex'), ids = [];
  try {
    for (const n of ['a', 'b', 'c']) ids.push((await pool.query("INSERT INTO users(google_sub,name,friend_code) VALUES($1,$2,$3) RETURNING id", ['lgpd-' + n + uniq, 'Teste ' + n, (n + uniq).toUpperCase().slice(0, 8)])).rows[0].id);
    const foto = Buffer.alloc(300000, 7);                                   // uma "foto" de 300 KB
    // a) partida com foto própria (como o jogo antigo gravava): image_id 'custom' + bytes
    await pool.query("INSERT INTO saves(user_id,image_id,image_label,pieces,locked,elapsed_ms,partner_name,custom_image) VALUES($1,'custom','Minha imagem',12,'[1,2]',5000,'Bia',$2)", [ids[0], foto]);
    // b) partida normal da biblioteca (sem foto): tem que sobreviver intacta
    await pool.query("INSERT INTO saves(user_id,image_id,image_label,pieces,locked,elapsed_ms,partner_name) VALUES($1,'lib-fauna-01.webp','Onça',20,'[3]',9000,'Caio')", [ids[1]]);
    // c) caso residual: id normal mas com bytes de foto guardados (não deve existir, mas a migração limpa)
    await pool.query("INSERT INTO saves(user_id,image_id,image_label,pieces,locked,elapsed_ms,partner_name,custom_image) VALUES($1,'lib-biomas-01.webp','Cachoeira',12,'[]',1000,'',$2)", [ids[2], foto]);
    assert.equal(Number((await pool.query('SELECT count(*) FROM saves WHERE user_id = ANY($1) AND custom_image IS NOT NULL', [ids])).rows[0].count), 2, 'antes: 2 fotos guardadas');
    await pool.query(sql);
    const depois = (await pool.query('SELECT user_id, image_id, pieces, locked, custom_image FROM saves WHERE user_id = ANY($1) ORDER BY image_id', [ids])).rows;
    assert.equal(depois.length, 2, "a partida salva com 'custom' foi apagada");
    assert.deepEqual(depois.map((r) => r.image_id), ['lib-biomas-01.webp', 'lib-fauna-01.webp']);
    assert.ok(depois.every((r) => r.custom_image === null), 'nenhuma foto sobrou');
    const normal = depois.find((r) => r.image_id === 'lib-fauna-01.webp');
    assert.equal(normal.pieces, 20); assert.deepEqual(normal.locked, [3], 'a partida normal ficou intacta');
    await pool.query(sql);                                                  // idempotente: rodar de novo não muda nada
    assert.equal((await pool.query('SELECT count(*) FROM saves WHERE user_id = ANY($1)', [ids])).rows[0].count, '2');
  } finally {
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids]).catch(() => {});
    await pool.end();
  }
});
