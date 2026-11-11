'use strict';
/* Loja do jogo. Itens de personalização pagos SOMENTE com as gemas virtuais que já existem (users.gems; ver gems.js e library.js).
 * Nada de dinheiro real, nada de moeda nova. A compra é atômica (mesma receita da biblioteca): uma transação trava a linha do jogador
 * (SELECT ... FOR UPDATE), confere se já tem o item, confere o saldo, grava a compra e debita, tudo no mesmo COMMIT. */
const HEX = /^#[0-9a-f]{6}$/;
const DEFAULT_ITEM = 'classica';

// Estrutura pronta para novas categorias: é só acrescentar aqui (e itens com a mesma `category`).
const CATEGORIES = Object.freeze([
  Object.freeze({ id: 'bandejas', name: 'Bandejas', icon: '🧺' }),
  Object.freeze({ id: 'skins', name: 'Skins do pet', icon: '🎨' }),
  Object.freeze({ id: 'roupas', name: 'Roupas do pet', icon: '👕' })
]);
// Itens do PET: o id é skin-<aparência> ou roupa-<aparência> (a aparência é o id de public/mascot-looks.js). Preço 0 = grátis para todos (nem precisa comprar).
// A raridade vem do preço (rarityOf), então nunca fica diferente dele: comum até 150, rara até 300, épica até 450 e lendária acima disso.
const PET_SLOT = Object.freeze({ skins: 'pet_skin', roupas: 'pet_outfit' });        // categoria -> coluna de shop_prefs (nome fixo, nunca vem do cliente)
function rarityOf(price) { return price <= 0 ? null : price <= 150 ? 'comum' : price <= 300 ? 'rara' : price <= 450 ? 'epica' : 'lendaria'; }
const ITEMS = Object.freeze([
  { id: 'classica', category: 'bandejas', name: 'Bandeja Clássica', price: 0,   desc: 'Retangular, discreta e moderna. Já é sua!' },
  { id: 'nuvem',    category: 'bandejas', name: 'Bandeja Nuvem',    price: 150, desc: 'Bordas fofas de nuvem que flutuam devagarinho.' },
  { id: 'estrela',  category: 'bandejas', name: 'Bandeja Estrela',  price: 250, desc: 'Contorno de estrela com brilhos nas bordas.' },
  { id: 'gelatina', category: 'bandejas', name: 'Bandeja Gelatina', price: 350, desc: 'Ondulada e elástica: balança quando você mexe.' },
  { id: 'galaxia',  category: 'bandejas', name: 'Bandeja Galáxia',  price: 500, desc: 'Bordas futuristas, partículas e luz suave.' },
  // ---- skins do pet (as 5 primeiras são grátis; as outras se desbloqueiam com gemas) ----
  { id: 'skin-menta',        category: 'skins', look: 'menta',        name: 'Menta',        price: 0,   desc: 'Verde-água fresquinho, com pés cor de coral.' },
  { id: 'skin-por-do-sol',   category: 'skins', look: 'por-do-sol',   name: 'Pôr do sol',   price: 0,   desc: 'Laranja quente, com raios dourados na testa.' },
  { id: 'skin-uva',          category: 'skins', look: 'uva',          name: 'Uva',          price: 0,   desc: 'Roxo com bolinhas claras e pés rosa.' },
  { id: 'skin-algodao-doce', category: 'skins', look: 'algodao-doce', name: 'Algodão-doce', price: 0,   desc: 'Rosa docinho com pintinhas azuis e amarelas.' },
  { id: 'skin-luar',         category: 'skins', look: 'luar',         name: 'Luar',         price: 0,   desc: 'Prateado de luar, salpicado de estrelas douradas.' },
  { id: 'skin-limao',        category: 'skins', look: 'limao',        name: 'Limão',        price: 100, desc: 'Verde-limão cheio de energia.' },
  { id: 'skin-caramelo',     category: 'skins', look: 'caramelo',     name: 'Caramelo',     price: 100, desc: 'Marrom de caramelo, com pintas cor de creme.' },
  { id: 'skin-lavanda',      category: 'skins', look: 'lavanda',      name: 'Lavanda',      price: 180, desc: 'Lilás suave com detalhes em roxo.' },
  { id: 'skin-cereja',       category: 'skins', look: 'cereja',       name: 'Cereja',       price: 320, desc: 'Vermelho-cereja, com cabinho verde de verdade.' },
  { id: 'skin-ouro',         category: 'skins', look: 'ouro',         name: 'Ouro',         price: 500, desc: 'Dourado e brilhante: a mais rara de todas.' },
  // ---- roupas do pet ----
  { id: 'roupa-capa-heroi',  category: 'roupas', look: 'capa-heroi', name: 'Capa de herói',               price: 0,   desc: 'Capa ao vento com fechos dourados.' },
  { id: 'roupa-cachecol',    category: 'roupas', look: 'cachecol',   name: 'Cachecol de inverno',         price: 0,   desc: 'Listrado e quentinho, com a pontinha pendurada.' },
  { id: 'roupa-mago',        category: 'roupas', look: 'mago',       name: 'Chapéu de mago',              price: 0,   desc: 'Chapéu pontudo com estrelinhas douradas.' },
  { id: 'roupa-bailarina',   category: 'roupas', look: 'bailarina',  name: 'Saia de bailarina',           price: 0,   desc: 'Tutu em dois andares, com laço.' },
  { id: 'roupa-macacao',     category: 'roupas', look: 'macacao',    name: 'Macacão de jardineiro',       price: 0,   desc: 'Alças, botões e um bolsinho.' },
  { id: 'roupa-bandana',     category: 'roupas', look: 'bandana',    name: 'Bandana de pirata',           price: 150, desc: 'Com caveirinhas e um nó na lateral.' },
  { id: 'roupa-fones',       category: 'roupas', look: 'fones',      name: 'Fones de ouvido',             price: 250, desc: 'Para ouvir a música do jogo com estilo.' },
  { id: 'roupa-cartola',     category: 'roupas', look: 'cartola',    name: 'Cartola e gravata-borboleta', price: 350, desc: 'Elegante, para as grandes ocasiões.' },
  { id: 'roupa-asas-anjo',   category: 'roupas', look: 'asas-anjo',  name: 'Asas de anjo',                price: 450, desc: 'Asas macias e uma auréola brilhante.' },
  { id: 'roupa-coroa',       category: 'roupas', look: 'coroa',      name: 'Coroa real',                  price: 600, desc: 'Ouro e pedras preciosas: a mais rara de todas.' }
].map((i) => Object.freeze(i)));

const item = (id) => ITEMS.find((i) => i.id === id) || null;
const publicItem = (i) => { const o = { id: i.id, name: i.name, price: i.price, desc: i.desc }; if (i.look) { o.look = i.look; o.rarity = rarityOf(i.price); } return o; };
function catalog() { return { categories: CATEGORIES.map((c) => ({ id: c.id, name: c.name, icon: c.icon, items: ITEMS.filter((i) => i.category === c.id).map(publicItem) })) }; }
const normHex = (v) => (typeof v === 'string' && HEX.test(v.trim().toLowerCase()) ? v.trim().toLowerCase() : null);
// só modelos que existem no catálogo e cores #rrggbb válidas (o que vem do banco também passa por aqui)
function cleanColors(obj) {
  const out = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) for (const i of ITEMS) { if (i.category !== 'bandejas') continue; const c = normHex(obj[i.id]); if (c) out[i.id] = c; }
  return out;
}

// o que o banco guardou como skin/roupa só vale se o item existe, é da categoria certa e ainda é do jogador (grátis ou comprado); senão volta ao pet de fábrica (null)
function usablePet(id, category, owned) { const it = typeof id === 'string' ? item(id) : null; return it && it.category === category && (it.price <= 0 || owned.includes(it.id)) ? it.id : null; }

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
    const pr = (await q('SELECT equipped, colors, anim, pet_skin, pet_outfit FROM shop_prefs WHERE user_id = $1', [uid])).rows[0];
    const hist = (await q('SELECT item_id, gems_spent, created_at FROM shop_purchases WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50', [uid])).rows;
    const equipped = pr && owned.includes(pr.equipped) && item(pr.equipped) ? pr.equipped : DEFAULT_ITEM;
    return {
      gems: Number(u.gems), owned, equipped, pet: { skin: usablePet(pr && pr.pet_skin, 'skins', owned), outfit: usablePet(pr && pr.pet_outfit, 'roupas', owned) }, colors: cleanColors(pr && pr.colors), anim: pr && typeof pr.anim === 'boolean' ? pr.anim : null,
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

  async function equip(uid, itemId, category) {
    if (typeof category === 'string' && PET_SLOT[category] && (itemId === null || itemId === '')) {        // tirar a skin/roupa: volta ao pet de fábrica (não exige nada)
      const col = PET_SLOT[category];
      return withUserLock(uid, async (q) => {
        await q(`INSERT INTO shop_prefs (user_id, ${col}) VALUES ($1, NULL) ON CONFLICT (user_id) DO UPDATE SET ${col} = NULL, updated_at = now()`, [uid]);
        return { ok: true, category, equipped: null };
      });
    }
    const it = typeof itemId === 'string' ? item(itemId) : null;
    if (!it || (typeof category === 'string' && category !== it.category)) return { ok: false, error: 'invalid' };
    return withUserLock(uid, async (q) => {
      const owned = await ownedIds(q, uid);
      if (PET_SLOT[it.category]) {                                                                           // skin/roupa do pet: grátis ou já comprada
        if (it.price > 0 && !owned.includes(it.id)) return { ok: false, error: 'locked' };
        const col = PET_SLOT[it.category];
        await q(`INSERT INTO shop_prefs (user_id, ${col}) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET ${col} = EXCLUDED.${col}, updated_at = now()`, [uid, it.id]);
        return { ok: true, category: it.category, equipped: it.id };
      }
      if (!owned.includes(it.id)) return { ok: false, error: 'locked' };
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
      if (!it || it.category !== 'bandejas') return { ok: false, error: 'invalid' };
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

module.exports = { CATEGORIES, ITEMS, DEFAULT_ITEM, HEX, PET_SLOT, item, catalog, rarityOf, normHex, cleanColors, makeService };
