// Aplica as migrações do banco manualmente:  DATABASE_URL="postgres://..." npm run migrate
// (O servidor já faz isso sozinho ao ligar; este comando serve para conferir o banco antes de publicar.)
const { createDb } = require('../db');
const url = process.env.DATABASE_URL;
if (!url) { console.error('Defina a variável DATABASE_URL antes de rodar este comando.'); process.exit(1); }
const db = createDb(url);
if (!db) { console.error('O pacote "pg" não está instalado. Rode: npm install'); process.exit(1); }
db.migrate().then((a) => { console.log(a.length ? 'Migrações aplicadas: ' + a.join(', ') : 'O banco já está atualizado.'); return db.close(); })
  .catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
