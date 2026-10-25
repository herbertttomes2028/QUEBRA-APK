'use strict';
/*
 * Acesso ao banco de dados (PostgreSQL). Só é usado quando a variável DATABASE_URL existe.
 * - Sem DATABASE_URL: o sistema de contas fica DESLIGADO e o jogo funciona como sempre (visitante).
 * - Com DATABASE_URL: as tabelas são criadas/atualizadas sozinhas ao ligar o servidor (pasta "migrations").
 */
const fs = require('fs');
const path = require('path');

function createDb(url) {
  let pg;
  try { pg = require('pg'); } catch (e) { console.error('[contas] o pacote "pg" não está instalado; contas desligadas.'); return null; }
  // Provedores na nuvem (Neon, Supabase...) exigem conexão segura; o banco local de testes não.
  const local = /@(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/.test(url);
  let conn = url;
  try { const u = new URL(url); u.searchParams.delete('sslmode'); conn = u.toString(); } catch (e) { /* mantém */ }
  const pool = new pg.Pool({
    connectionString: conn,
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.DB_POOL_MAX) || 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
  });
  pool.on('error', (e) => console.error('[db] conexão perdida (será refeita):', e.message));

  const q = (text, params) => pool.query(text, params);

  // aplica, em ordem, os arquivos migrations/*.sql que ainda não foram aplicados
  async function migrate(dir) {
    dir = dir || path.join(__dirname, 'migrations');
    const client = await pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock(727272)');          // evita duas instâncias migrando ao mesmo tempo
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
      const files = fs.readdirSync(dir).filter((f) => /\.sql$/.test(f)).sort();
      const applied = [];
      for (const f of files) {
        if (done.has(f)) continue;
        const sql = fs.readFileSync(path.join(dir, f), 'utf8');
        try {
          await client.query('BEGIN');
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
          await client.query('COMMIT');
          applied.push(f);
        } catch (e) { await client.query('ROLLBACK'); throw new Error('migração ' + f + ' falhou: ' + e.message); }
      }
      return applied;
    } finally {
      try { await client.query('SELECT pg_advisory_unlock(727272)'); } catch (e) { /* ignora */ }
      client.release();
    }
  }

  return { q, pool, migrate, close: () => pool.end() };
}

module.exports = { createDb };
