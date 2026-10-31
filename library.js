'use strict';
/* Biblioteca independente. IDs e preços são fixos no servidor, nunca no cliente. */
const CATEGORIES = Object.freeze([
  { id: 'fauna', name: 'Fauna brasileira', subtitle: 'Encontros com os animais do Brasil', icon: '🐾', price: 0, order: 1 },
  { id: 'biomas', name: 'Natureza e biomas', subtitle: 'Paisagens para descobrir', icon: '🌿', price: 0, order: 2 },
  { id: 'espaco', name: 'Espaço e ciência', subtitle: 'Uma viagem pelo universo', icon: '🪐', price: 0, order: 3 },
  { id: 'cultura', name: 'Cultura brasileira', subtitle: 'Nossa arte, nossa história', icon: '🎨', price: 25, order: 4 },
  { id: 'fantasia', name: 'Mundos fantásticos', subtitle: 'Aventuras de imaginação', icon: '✨', price: 40, order: 5 }
]);
const NAMES = Object.freeze({
  fauna: ['Onça-pintada', 'Arara-azul', 'Tucano-toco', 'Capivara do Pantanal', 'Boto-cor-de-rosa'],
  biomas: ['Cachoeira amazônica', 'Dunas dos Lençóis', 'Cerrado florido', 'Reflexos do Pantanal', 'Araucárias na serra'],
  espaco: ['Saturno e seus anéis', 'Astronauta explorador', 'Paisagem lunar', 'Nebulosa colorida', 'Planeta Terra'],
  cultura: ['Frevo em movimento', 'Festa junina', 'Capoeira ao entardecer', 'Maracatu de cores', 'Renda do Nordeste'],
  fantasia: ['Dragão das montanhas', 'Castelo nas nuvens', 'Ilhas flutuantes', 'Bosque encantado', 'Baleia das estrelas']
});
const ALL = Object.freeze(CATEGORIES.flatMap(c => NAMES[c.id].map((name, i) => {
  const id = 'lib-' + c.id + '-' + String(i + 1).padStart(2, '0');
  return Object.freeze({ id, file: id + '.webp', label: name, categoryId: c.id, url: 'biblioteca/' + id + '.webp', thumb: 'biblioteca/mini/' + id + '.webp', width: 768, height: 1024 });
})));
const IMAGE_BY_FILE = new Map(ALL.map(i => [i.file, i]));
const CAT_BY_ID = new Map(CATEGORIES.map(c => [c.id, c]));

function image(file) { return IMAGE_BY_FILE.get(file) || null; }
function cat(id) { return CAT_BY_ID.get(id) || null; }
function assets() { return ALL.map(i => ({ ...i })); }
function catalog() { return CATEGORIES.map(c => ({ ...c, images: ALL.filter(i => i.categoryId === c.id).map(i => ({ file: i.file, label: i.label, url: i.url, thumb: i.thumb, categoryId: c.id })) })); }
function unlocksFrom(clears, purchases) {
  const done = new Set(clears);
  const bought = new Set(purchases);
  return { fauna: true, biomas: NAMES.fauna.every((_, i) => done.has('lib-fauna-' + String(i + 1).padStart(2, '0') + '.webp')),
    espaco: NAMES.biomas.every((_, i) => done.has('lib-biomas-' + String(i + 1).padStart(2, '0') + '.webp')),
    cultura: bought.has('cultura'), fantasia: bought.has('fantasia') };
}
function canOpen(file, clears, purchases) {
  const i = image(file);
  return !i || !!unlocksFrom(clears, purchases)[i.categoryId];
}
function makeService(db) {
  async function status(uid) {
    const [a, b, u] = await Promise.all([
      db.q('SELECT image_id FROM library_clears WHERE user_id = $1 ORDER BY image_id', [uid]),
      db.q('SELECT category_id FROM library_unlocks WHERE user_id = $1', [uid]),
      db.q('SELECT gems FROM users WHERE id = $1', [uid])
    ]);
    const clears = a.rows.map(x => x.image_id), purchases = b.rows.map(x => x.category_id);
    return { clears, purchases, unlocked: unlocksFrom(clears, purchases), gems: Number(u.rows[0] && u.rows[0].gems || 0) };
  }
  async function canPlay(uid, file) {
    const i = image(file);
    if (!i) return true; // imagens clássicas, do próprio celular e convites antigos
    if (!uid) return ['fauna', 'biomas', 'espaco'].includes(i.categoryId); // visitante: progressão local das categorias grátis, jamais compras
    const s = await status(uid);
    return !!s.unlocked[i.categoryId];
  }
  // Chamar somente na MESMA transação do crédito da partida e após rw.earnedCompletion.
  async function recordTx(q, uid, file) {
    if (!image(file)) return false;
    const r = await q('INSERT INTO library_clears (user_id,image_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING image_id', [uid, file]);
    return !!r.rowCount;
  }
  async function buy(uid, categoryId) {
    const c = cat(categoryId);
    if (!c || !c.price) return { ok: false, error: 'invalid' };
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const q = (sql, args) => client.query(sql, args);
      const row = (await q('SELECT gems FROM users WHERE id = $1 FOR UPDATE', [uid])).rows[0];
      if (!row) { await client.query('ROLLBACK'); return { ok: false, error: 'auth' }; }
      const existing = await q('SELECT 1 FROM library_unlocks WHERE user_id=$1 AND category_id=$2', [uid, c.id]);
      if (existing.rowCount) { await client.query('COMMIT'); return { ok: true, already: true, gems: Number(row.gems) }; }
      if (Number(row.gems) < c.price) { await client.query('ROLLBACK'); return { ok: false, error: 'gems', gems: Number(row.gems), price: c.price }; }
      await q('INSERT INTO library_unlocks (user_id, category_id, gems_spent) VALUES ($1,$2,$3)', [uid, c.id, c.price]);
      const next = (await q('UPDATE users SET gems = gems - $1 WHERE id = $2 RETURNING gems', [c.price, uid])).rows[0];
      await client.query('COMMIT');
      return { ok: true, already: false, gems: Number(next.gems), price: c.price };
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) {} throw e; }
    finally { client.release(); }
  }
  return { status, canPlay, recordTx, buy };
}
module.exports = { CATEGORIES, ALL, image, cat, assets, catalog, unlocksFrom, canOpen, makeService };
