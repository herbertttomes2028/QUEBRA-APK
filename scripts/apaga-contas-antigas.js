// Apaga as contas ANTIGAS (criadas com e-mail ou Google; coluna kind = 'legado'). Eram contas de teste.
//   Só LISTAR (não apaga nada):  DATABASE_URL="postgres://..." node scripts/apaga-contas-antigas.js
//   APAGAR de verdade:           DATABASE_URL="postgres://..." node scripts/apaga-contas-antigas.js --apagar --confirmo
// Perfis gerados pelo jogo (kind = 'gerado') NUNCA são tocados por este script.
const { createDb } = require('../db');
const url = process.env.DATABASE_URL;
if (!url) { console.error('Defina a variável DATABASE_URL antes de rodar este comando.'); process.exit(1); }
const db = createDb(url);
if (!db) { console.error('O pacote "pg" não está instalado. Rode: npm install'); process.exit(1); }
const apagar = process.argv.includes('--apagar') && process.argv.includes('--confirmo');
const mask = (e) => { const [u, d] = String(e || '').split('@'); return u ? u.slice(0, 1) + '***@' + d : '(conta Google)'; };
(async () => {
  const rows = (await db.q("SELECT id, email, created_at, last_seen, (SELECT count(*) FROM matches m WHERE m.user_id = users.id)::int AS partidas FROM users WHERE kind = 'legado' ORDER BY created_at")).rows;
  console.log('Contas antigas encontradas: ' + rows.length);
  for (const r of rows) console.log(' - ' + mask(r.email) + ' | criada em ' + new Date(r.created_at).toISOString().slice(0, 10) + ' | partidas: ' + r.partidas);
  const novos = (await db.q("SELECT count(*)::int AS n FROM users WHERE kind = 'gerado'")).rows[0].n;
  console.log('Perfis gerados pelo jogo (não serão tocados): ' + novos);
  if (!rows.length) { console.log('Nada a apagar.'); return; }
  if (!apagar) { console.log('\nNada foi apagado. Para apagar essas contas e TODOS os dados ligados a elas: acrescente  --apagar --confirmo'); return; }
  const r = await db.q("DELETE FROM users WHERE kind = 'legado'");
  console.log('\nApagadas: ' + r.rowCount + ' conta(s) antiga(s), com sessões, partidas, saves, denúncias e itens (em cascata).');
})().then(() => db.close()).catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
