'use strict';
/* Loja do jogo. Itens de personalização pagos SOMENTE com as gemas virtuais que já existem (users.gems; ver gems.js e library.js).
 * Nada de dinheiro real, nada de moeda nova. A compra é atômica (mesma receita da biblioteca): uma transação trava a linha do jogador
 * (SELECT ... FOR UPDATE), confere se já tem o item, confere o saldo, grava a compra e debita, tudo no mesmo COMMIT. */
const HEX = /^#[0-9a-f]{6}$/;
const DEFAULT_ITEM = 'classica';

// Estrutura pronta para novas categorias: é só acrescentar aqui (e itens com a mesma `category`).
const CATEGORIES = Object.freeze([Object.freeze({ id: 'bandejas', name: 'Bandejas', icon: '🧺' })]);
const ITEMS = Object.freeze([
  { id: 'classica', category: 'bandejas', name: 'Bandeja Clássica', price: 0,   desc: 'Retangular, discreta e moderna. Já é sua!' },
  { id: 'nuvem',    category: 'bandejas', name: 'Bandeja Nuvem',    price: 150, desc: 'Bordas fofas de nuvem que flutuam devagarinho.' },
  { id: 'estrela',  category: 'bandejas', name: 'Bandeja Estrela',  price: 250, desc: 'Contorno de estrela com brilhos nas bordas.' },
  { id: 'gelatina', category: 'bandejas', name: 'Bandeja Gelatina', price: 350, desc: 'Ondulada e elástica: balança quando você mexe.' },
  { id: 'galaxia',  category: 'bandejas', name: 'Bandeja Galáxia',  price: 500, desc: 'Bordas futuristas, partículas e luz suave.' }
].map((i) => Object.freeze(i)));

const item = (id) => ITEMS.find((i) => i.id === id) || null;
const publicItem = (i) => ({ id: i.id, name: i.name, price: i.price, desc: i.desc });
function catalog() { return { categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon, items: ITEMS.filter((i) => i.category === c.id).map(publicItem) })) }; }
const normHex = (v) => (typeof v === 'string' && HEX.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);
// só modelos que existem no catálogo e cores #rrggbb válidas (o que vem do banco também passa por aqui)
function cleanColors(obj) {
  const out = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const i of ITEMS) { const c = normHex(obj[i.id]); if (c) out[i.id] = c; }
  return out;
}

function makeService(db) {
  async function ownedIds(q, uid) {
    const r = await q('SELECT item_id FROM shop_purchases WHERE user_id = $1', [uid]);
    return [DEFAULT_ITEM, ...r.rows.map((x) => x.item_id).filter((id) => id !== DEFAULT_ITEM && item(id))];
  }
  async function status(uid) {
    const q = (s, p) => db.q(s, p);
    const u = (await q('SELECT gems FROM users WHERE id = $1', [uid])).rows[0];
    if (!u) return null;
    const owned = await ownedIds(q, uid);
    const pr = (await q('SELECT equipped, colors, anim FROM shop_prefs WHERE user_id = $1', [uid])).rows[0];
    const hist = (await q('SELECT item_id, gems_spent, created_at FROM shop_purchases WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50', [uid])).rows;
    const equipped = pr && owned.includes(pr.equipped) && item(pr.equipped) ? pr.equipped : DEFAULT_ITEM;
    return {
      gems: Number(u.gems), owned, equipped, colors: cleanColors(pr && pr.colors), anim: pr && typeof pr.anim === 'boolean' ? pr.anim : null,
      history: hist.filter((h) => item(h.item_id)).map((h) => ({ item: h.item_id, name: item(h.item_id).name, price: Number(h.gems_spent), at: new Date(h.created_at).toISOString() }))
    };
  }

  async function withUserLock(uid, fn) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      const q = (sql, args) => client.query(sql, args);
      const row = (await q('SELECT gems FROM users WHERE id = $1 FOR UPDATE', [uid])).rows[0];      // trava o jogador: compras, equipar e cores dele não se atropelam
      if (!row) { await client.query('ROLLBACK'); return { ok: false, error: 'auth' }; }
      const out = await fn(q, Number(row.gems));
      if (out && out.ok === false) await client.query('ROLLBACK'); else await client.query('COMMIT');
      return out;
    } catch (e) { try { await client.query('ROLLBACK'); } catch (_) { /* ignora */ } throw e; }
    finally { client.release(); }
  }

  async function buy(uid, itemId) {
    const it = typeof itemId === 'string' ? item(itemId) : null;
    if (!it) return { ok: false, error: 'invalid' };
    return withUserLock(uid, async (q, gems) => {
      if (it.id === DEFAULT_ITEM || it.price <= 0) return { ok: true, already: true, gems, price: 0, owned: await ownedIds(q, uid) };       // a Clássica já é de todos
      if ((await q('SELECT 1 FROM shop_purchases WHERE user_id = $1 AND item_id = $2', [uid, it.id])).rowCount) return { ok: true, already: true, gems, price: it.price, owned: await ownedIds(q, uid) };
      if (gems < it.price) return { ok: false, error: 'gems', gems, price: it.price, missing: it.price - gems };
      await q('INSERT INTO shop_purchases (user_id, category, item_id, gems_spent) VALUES ($1,$2,$3,$4)', [uid, it.category, it.id, it.price]);
      const next = (await q('UPDATE users SET gems = gems - $1 WHERE id = $2 RETURNING gems', [it.price, uid])).rows[0];
      return { ok: true, already: false, gems: Number(next.gems), price: it.price, owned: await ownedIds(q, uid) };
    });
  }

  async function equip(uid, itemId) {
    const it = typeof itemId === 'string' ? item(itemId) : null;
    if (!it) return { ok: false, error: 'invalid' };
    return withUserLock(uid, async (q) => {
      if (!(await ownedIds(q, uid)).includes(it.id)) return { ok: false, error: 'locked' };
      await q(`INSERT INTO shop_prefs (user_id, equipped) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET equipped = EXCLUDED.equipped, updated_at = now()`, [uid, it.id]);
      return { ok: true, equipped: it.id };
    });
  }

  // cor de UM modelo (color = '#rrggbb', ou null para restaurar a original) e/ou a preferência de animação. Cores são GRÁTIS: só exigem ter o modelo.
  async function setPrefs(uid, p) {
    p = p || {};
    const hasColor = Object.prototype.hasOwnProperty.call(p, 'color'), hasAnim = Object.prototype.hasOwnProperty.call(p, 'anim');
    if (!hasColor && !hasAnim) return { ok: false, error: 'invalid' };
    let color = null, it = null;
    if (hasColor) {
      it = typeof p.itemId === 'string' ? item(p.itemId) : null;
      if (!it) return { ok: false, error: 'invalid' };
      if (p.color !== null) { color = normHex(p.color); if (!color) return { ok: false, error: 'color' }; }
    }
    if (hasAnim && typeof p.anim !== 'boolean') return { ok: false, error: 'anim' };
    return withUserLock(uid, async (q) => {
      if (it && !(await ownedIds(q, uid)).includes(it.id)) return { ok: false, error: 'locked' };
      const cur = (await q('SELECT equipped, colors, anim FROM shop_prefs WHERE user_id = $1', [uid])).rows[0];
      const colors = cleanColors(cur && cur.colors);
      if (hasColor) { if (color === null) delete colors[it.id]; else colors[it.id] = color; }
      const anim = hasAnim ? p.anim : (cur && typeof cur.anim === 'boolean' ? cur.anim : null);
      await q(`INSERT INTO shop_prefs (user_id, colors, anim) VALUES ($1,$2::jsonb,$3)
               ON CONFLICT (user_id) DO UPDATE SET colors = EXCLUDED.colors, anim = EXCLUDED.anim, updated_at = now()`, [uid, JSON.stringify(colors), anim]);
      return { ok: true, colors, anim };
    });
  }
  return { status, buy, equip, setPrefs };
}

module.exports = { CATEGORIES, ITEMS, DEFAULT_ITEM, HEX, item, catalog, normHex, cleanColors, makeService };
