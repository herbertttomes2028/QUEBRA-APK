'use strict';
/* Biblioteca de imagens. IDs, regras de liberação e preços são decididos no SERVIDOR, nunca no cliente.
 *
 * O catálogo vem do banco (tabelas library_categories e library_images, migração 008) e é VALIDADO por inteiro ao carregar. Sem banco, com o
 * banco vazio ou com qualquer dado inválido, vale o catálogo embutido abaixo (o mesmo de sempre) e o erro vai para o log: o jogo nunca cai e
 * nunca usa meio catálogo. A troca em memória é atômica (objetos congelados). O banco guarda só nomes de arquivo; a URL é montada aqui,
 * a partir de MEDIA_BASE_URL (media.js) ou dos arquivos locais, de modo que ninguém consegue apontar uma imagem para outro endereço.
 *
 * Regras de liberação (por categoria):  free = sempre aberta;  after = abre quando TODAS as imagens da categoria "requires" estão concluídas;
 * gems = abre por compra permanente com gemas (preço fixo no servidor). */
const media = require('./media');

/* ---------- Catálogo embutido (reserva): idêntico ao que o jogo sempre teve ---------- */
const SEED_CATEGORIES = [
  { id: 'fauna', name: 'Fauna brasileira', subtitle: 'Encontros com os animais do Brasil', icon: '🐾', price: 0, order: 1, unlock: 'free', requires: null, gate: 5 },
  { id: 'biomas', name: 'Natureza e biomas', subtitle: 'Paisagens para descobrir', icon: '🌿', price: 0, order: 2, unlock: 'after', requires: 'fauna', gate: 5 },
  { id: 'espaco', name: 'Espaço e ciência', subtitle: 'Uma viagem pelo universo', icon: '🪐', price: 0, order: 3, unlock: 'after', requires: 'biomas', gate: 5 },
  { id: 'cultura', name: 'Cultura brasileira', subtitle: 'Nossa arte, nossa história', icon: '🎨', price: 25, order: 4, unlock: 'gems', requires: null, gate: 5 },
  { id: 'fantasia', name: 'Mundos fantásticos', subtitle: 'Aventuras de imaginação', icon: '✨', price: 40, order: 5, unlock: 'gems', requires: null, gate: 5 }
];
const SEED_NAMES = {
  fauna: ['Onça-pintada', 'Arara-azul', 'Tucano-toco', 'Capivara do Pantanal', 'Boto-cor-de-rosa'],
  biomas: ['Cachoeira amazônica', 'Dunas dos Lençóis', 'Cerrado florido', 'Reflexos do Pantanal', 'Araucárias na serra'],
  espaco: ['Saturno e seus anéis', 'Astronauta explorador', 'Paisagem lunar', 'Nebulosa colorida', 'Planeta Terra'],
  cultura: ['Frevo em movimento', 'Festa junina', 'Capoeira ao entardecer', 'Maracatu de cores', 'Renda do Nordeste'],
  fantasia: ['Dragão das montanhas', 'Castelo nas nuvens', 'Ilhas flutuantes', 'Bosque encantado', 'Baleia das estrelas']
};
const SEED_IMAGES = SEED_CATEGORIES.flatMap(c => SEED_NAMES[c.id].map((label, i) => ({
  file: 'lib-' + c.id + '-' + String(i + 1).padStart(2, '0') + '.webp', label, categoryId: c.id, order: i + 1, width: 768, height: 1024, sha: '', thumbSha: ''
})));

/* ---------- Validação (tudo que vem do banco passa por aqui) ---------- */
const LIMITS = Object.freeze({ categories: 100, images: 2000, perCategory: 200 });
const RE_ID = /^[a-z][a-z0-9-]{1,39}$/;
const RE_FILE = /^[a-z0-9][a-z0-9._-]{2,79}\.webp$/;
const RE_SHA = /^[a-f0-9]{64}$/;
const UNLOCKS = ['free', 'after', 'gems'];
const bad = (m) => { throw new Error('catálogo inválido: ' + m); };
function text(v, max, what, allowEmpty) {
  if (typeof v !== 'string') bad(what + ' não é texto');
  const s = v.replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim();      // sem quebras e sem caracteres de controle
  if ((!s && !allowEmpty) || s.length > max) bad(what + ' vazio ou maior que ' + max);
  return s;
}
function int(v, min, max, what) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) bad(what + ' fora de ' + min + '..' + max);
  return n;
}

function build(rawCats, rawImgs, mediaCfg) {
  if (!Array.isArray(rawCats) || !Array.isArray(rawImgs)) bad('formato');
  if (rawCats.length < 1 || rawCats.length > LIMITS.categories) bad('quantidade de categorias');
  if (rawImgs.length < 1 || rawImgs.length > LIMITS.images) bad('quantidade de imagens');
  const ids = new Set(), orders = new Set();
  const cats = rawCats.map((c) => {
    if (!c || typeof c.id !== 'string' || !RE_ID.test(c.id)) bad('id de categoria');
    if (ids.has(c.id)) bad('categoria repetida ' + c.id);
    ids.add(c.id);
    const order = int(c.order, 1, 1000, 'ordem de ' + c.id);
    if (orders.has(order)) bad('ordem repetida ' + order);
    orders.add(order);
    if (!UNLOCKS.includes(c.unlock)) bad('regra de liberação de ' + c.id);
    const price = int(c.price, 0, 1000, 'preço de ' + c.id);
    const requires = c.requires == null ? null : String(c.requires);
    const gate = c.gate == null ? null : int(c.gate, 1, LIMITS.perCategory, 'unlock_gate de ' + c.id);
    if ((c.unlock === 'after') !== (requires !== null)) bad('"after" exige "requires" (e só ele) em ' + c.id);
    if ((c.unlock === 'gems') !== (price > 0)) bad('preço só em categorias "gems" (e obrigatório nelas) em ' + c.id);
    return { id: c.id, name: text(c.name, 60, 'nome de ' + c.id), subtitle: text(c.subtitle == null ? '' : c.subtitle, 100, 'subtítulo de ' + c.id, true),
      icon: text(c.icon == null ? '' : c.icon, 8, 'ícone de ' + c.id, true), price, order, unlock: c.unlock, requires, gate };
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  for (const c of cats) {                                  // "after" aponta para uma categoria que existe, diferente dela, sem ciclo
    if (c.unlock !== 'after') continue;
    if (!byId.has(c.requires) || c.requires === c.id) bad('requires inválido em ' + c.id);
    const seen = new Set([c.id]);
    for (let n = byId.get(c.requires); n && n.unlock === 'after'; n = byId.get(n.requires)) { if (seen.has(n.id)) bad('ciclo de liberação em ' + c.id); seen.add(n.id); }
  }
  cats.sort((a, b) => a.order - b.order);
  const files = new Set(), slots = new Set(), perCat = new Map();
  const imgs = rawImgs.map((i) => {
    if (!i || typeof i.file !== 'string' || !RE_FILE.test(i.file)) bad('nome de arquivo');
    if (files.has(i.file)) bad('arquivo repetido ' + i.file);
    files.add(i.file);
    if (!byId.has(i.categoryId)) bad('imagem ' + i.file + ' numa categoria que não existe');
    const order = int(i.order, 1, 10000, 'ordem de ' + i.file), slot = i.categoryId + '#' + order;
    if (slots.has(slot)) bad('ordem repetida em ' + i.categoryId);
    slots.add(slot);
    perCat.set(i.categoryId, (perCat.get(i.categoryId) || 0) + 1);
    const sha = i.sha || '', thumbSha = i.thumbSha || '';
    if ((sha && !RE_SHA.test(sha)) || (thumbSha && !RE_SHA.test(thumbSha))) bad('sha256 de ' + i.file);
    return { file: i.file, label: text(i.label, 60, 'rótulo de ' + i.file), categoryId: i.categoryId, order,
      width: int(i.width == null ? 768 : i.width, 64, 4096, 'largura de ' + i.file), height: int(i.height == null ? 1024 : i.height, 64, 4096, 'altura de ' + i.file), sha, thumbSha };
  });
  for (const c of cats) { const n = perCat.get(c.id) || 0; if (n < 1 || n > LIMITS.perCategory) bad('imagens em ' + c.id + ': ' + n); if (c.gate !== null && c.gate > n) bad('unlock_gate maior que o número de imagens em ' + c.id); }
  const catOrder = new Map(cats.map((c) => [c.id, c.order]));
  imgs.sort((a, b) => catOrder.get(a.categoryId) - catOrder.get(b.categoryId) || a.order - b.order);
  const url = (rel, sha) => mediaCfg ? mediaCfg.base + '/' + rel + (sha ? '?v=' + sha.slice(0, 8) : '') : rel;      // local: o cliente acrescenta a revisão
  const CATEGORIES = Object.freeze(cats.map((c) => Object.freeze(c)));
  const ALL = Object.freeze(imgs.map((i) => {
    const id = i.file.replace(/\.webp$/, '');
    return Object.freeze({ id, file: i.file, label: i.label, categoryId: i.categoryId, url: url('biblioteca/' + i.file, i.sha), thumb: url('biblioteca/mini/' + i.file, i.thumbSha || i.sha), width: i.width, height: i.height });
  }));
  return { CATEGORIES, ALL, byFile: new Map(ALL.map((i) => [i.file, i])), byCat: new Map(CATEGORIES.map((c) => [c.id, ALL.filter((i) => i.categoryId === c.id)])),
    catById: new Map(CATEGORIES.map((c) => [c.id, c])), raw: { cats: rawCats, imgs: rawImgs } };
}

let mediaCfg = null;
let cur = build(SEED_CATEGORIES, SEED_IMAGES, null);

function configureMedia(raw) {                  // chamado uma vez ao ligar o servidor; valor inválido = ignorado (arquivos locais)
  mediaCfg = media.parseMediaBase(raw);
  cur = build(cur.raw.cats, cur.raw.imgs, mediaCfg);
  return mediaCfg;
}

function image(file) { return cur.byFile.get(file) || null; }
function cat(id) { return cur.catById.get(id) || null; }
function assets() { return cur.ALL.map(i => ({ ...i })); }
function catalog() {
  return cur.CATEGORIES.map(c => ({ ...c, images: cur.byCat.get(c.id).map(i => ({ file: i.file, label: i.label, url: i.url, thumb: i.thumb, categoryId: c.id })) }));
}
// imagens de uma categoria que precisam estar concluídas para liberar as que dependem dela: as N primeiras (unlock_gate), ou todas
function gateImages(catId) { const c = cur.catById.get(catId), imgs = cur.byCat.get(catId); return c.gate ? imgs.slice(0, c.gate) : imgs; }
function unlocksFrom(clears, purchases) {
  const done = new Set(clears), bought = new Set(purchases), out = {};
  for (const c of cur.CATEGORIES) {
    out[c.id] = c.unlock === 'free' ? true :
      c.unlock === 'after' ? gateImages(c.requires).every(i => done.has(i.file)) :
      bought.has(c.id);
  }
  return out;
}
function canOpen(file, clears, purchases) {
  const i = image(file);
  return !i || !!unlocksFrom(clears, purchases)[i.categoryId];
}

/* ---------- Carga do banco (leitura somente; nenhum caminho do jogo escreve nessas tabelas) ----------
 * Lida UMA vez ao ligar o servidor (o catálogo só muda por migração, que roda no deploy e reinicia o servidor). Nada de consulta periódica:
 * com o Neon gratuito ela manteria o banco acordado e gastaria a cota de computação. */
async function loadFromDb(db, log) {
  log = log || console;
  const cats = (await db.q('SELECT id, name, subtitle, icon, sort_order, unlock, requires, price, unlock_gate FROM library_categories WHERE active ORDER BY sort_order')).rows;
  const imgs = (await db.q('SELECT file, category_id, label, sort_order, width, height, sha256, thumb_sha256 FROM library_images WHERE active ORDER BY category_id, sort_order')).rows;
  if (!cats.length || !imgs.length) { log.warn('[biblioteca] catálogo do banco vazio: usando o catálogo embutido'); return false; }
  cur = build(cats.map(r => ({ id: r.id, name: r.name, subtitle: r.subtitle, icon: r.icon, order: r.sort_order, unlock: r.unlock, requires: r.requires, price: r.price, gate: r.unlock_gate })),
    imgs.map(r => ({ file: r.file, label: r.label, categoryId: r.category_id, order: r.sort_order, width: r.width, height: r.height, sha: r.sha256 || '', thumbSha: r.thumb_sha256 || '' })), mediaCfg);
  return true;
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
    if (!i) return true; // imagens clássicas e convites antigos
    if (!uid) return cat(i.categoryId).unlock !== 'gems'; // visitante: progressão local das categorias grátis, jamais compras
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
    if (!c || c.unlock !== 'gems' || !c.price) return { ok: false, error: 'invalid' };
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

module.exports = { image, cat, assets, catalog, unlocksFrom, canOpen, makeService, loadFromDb, configureMedia, build, LIMITS, SEED_CATEGORIES, SEED_IMAGES };
// CATEGORIES e ALL são sempre o catálogo ATUAL (podem mudar depois de uma carga do banco)
Object.defineProperty(module.exports, 'CATEGORIES', { enumerable: true, get: () => cur.CATEGORIES });
Object.defineProperty(module.exports, 'ALL', { enumerable: true, get: () => cur.ALL });
