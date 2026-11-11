"use strict";
// Skins e roupas do pet na loja. Servidor (PostgreSQL real, só no qc_test, em schema temporário): catálogo, itens grátis para todos, itens pagos só com as gemas
// existentes (compra ATÔMICA, sem duplicar), equipar só o que é seu (ou grátis), tirar, e as rotas. Sem banco: catálogo e coerência com mascot-looks.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const shop = require('../shop');
const L = require('../public/mascot-looks.js');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';
const root = path.join(__dirname, '..');

const PET = shop.ITEMS.filter((i) => i.category === 'skins' || i.category === 'roupas');
const PAGOS = PET.filter((i) => i.price > 0), GRATIS = PET.filter((i) => i.price === 0);

test('catálogo: 3 categorias, 10 skins e 10 roupas, 20 itens do pet, metade grátis (as de antes) e metade paga (as novas)', () => {
  const cat = shop.catalog();
  assert.deepEqual(cat.categories.map((c) => [c.id, c.name, c.icon, c.items.length]), [['bandejas', 'Bandejas', '🧺', 5], ['skins', 'Skins do pet', '🎨', 10], ['roupas', 'Roupas do pet', '👕', 10]]);
  assert.equal(PET.length, 20); assert.equal(GRATIS.length, 10); assert.equal(PAGOS.length, 10);
  assert.deepEqual(PAGOS.map((i) => [i.id, i.price]), [['skin-limao', 100], ['skin-caramelo', 100], ['skin-lavanda', 180], ['skin-cereja', 320], ['skin-ouro', 500], ['roupa-bandana', 150], ['roupa-fones', 250], ['roupa-cartola', 350], ['roupa-asas-anjo', 450], ['roupa-coroa', 600]], 'preços aprovados');
  assert.equal(new Set(shop.ITEMS.map((i) => i.id)).size, shop.ITEMS.length, 'ids únicos'); for (const i of shop.ITEMS) assert.match(i.id, /^[a-z][a-z0-9-]{1,39}$/, 'o id passa na regra do banco: ' + i.id);
  for (const i of PET) { assert.ok(i.name && i.desc && i.look, i.id); assert.ok(i.id === (i.category === 'skins' ? 'skin-' : 'roupa-') + i.look, 'o id deriva da aparência: ' + i.id); }
});
test('raridade vem SEMPRE do preço (comum ≤ 150, rara ≤ 300, épica ≤ 450, lendária acima) e as mais raras são as mais caras', () => {
  assert.deepEqual([0, 1, 100, 150, 151, 180, 300, 301, 450, 451, 600].map(shop.rarityOf), [null, 'comum', 'comum', 'comum', 'rara', 'rara', 'rara', 'epica', 'epica', 'lendaria', 'lendaria']);
  const pub = (id) => shop.catalog().categories.flatMap((c) => c.items).find((i) => i.id === id);
  for (const i of GRATIS) assert.equal(pub(i.id).rarity, null, 'grátis não tem raridade'); for (const i of PAGOS) assert.equal(pub(i.id).rarity, shop.rarityOf(i.price));
  const ordem = ['comum', 'rara', 'epica', 'lendaria'];
  for (const cat of ['skins', 'roupas']) { const itens = PAGOS.filter((i) => i.category === cat).sort((a, b) => a.price - b.price); for (let k = 1; k < itens.length; k++) assert.ok(ordem.indexOf(shop.rarityOf(itens[k].price)) >= ordem.indexOf(shop.rarityOf(itens[k - 1].price))); assert.equal(shop.rarityOf(itens[itens.length - 1].price), 'lendaria', cat + ': a mais cara é lendária'); }
  assert.deepEqual(Object.keys(pub('nuvem')).sort(), ['desc', 'id', 'name', 'price'], 'as bandejas continuam com o mesmo formato público');
});
test('coerência com as aparências do mascote: cada skin/roupa do mascote está na loja UMA vez, grátis na loja ⇔ grátis no mascote, e os nomes batem', () => {
  for (const [cat, list] of [['skins', L.SKINS], ['roupas', L.OUTFITS]]) {
    const itens = PET.filter((i) => i.category === cat);
    assert.deepEqual(itens.map((i) => i.look).sort(), list.map((x) => x.id).sort(), cat + ': mesmas aparências');
    for (const x of list) { const it = itens.find((i) => i.look === x.id); assert.equal(it.price === 0, !!x.free, x.id + ': grátis na loja = grátis no mascote'); assert.equal(it.name, x.name, x.id + ': mesmo nome'); }
  }
});
test('a loja só mexe em cor de BANDEJA: skins e roupas não têm cor escolhida, e o que vem do banco passa pelo filtro', () => {
  assert.deepEqual(shop.cleanColors({ nuvem: '#aabbcc', 'skin-menta': '#112233', 'roupa-mago': '#ffffff', zzz: '#000000' }), { nuvem: '#aabbcc' });
  assert.deepEqual(shop.PET_SLOT, { skins: 'pet_skin', roupas: 'pet_outfit' });
});
test('migração 016: só ACRESCENTA duas colunas opcionais (com a mesma regra de id) em shop_prefs; nada existente muda', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations/016_loja_pet.sql'), 'utf8');
  assert.match(sql, /ALTER TABLE shop_prefs ADD COLUMN IF NOT EXISTS pet_skin text CHECK \(pet_skin IS NULL OR pet_skin ~ '\^\[a-z\]\[a-z0-9-\]\{1,39\}\$'\);/);
  assert.match(sql, /ALTER TABLE shop_prefs ADD COLUMN IF NOT EXISTS pet_outfit text CHECK \(pet_outfit IS NULL OR pet_outfit ~ '\^\[a-z\]\[a-z0-9-\]\{1,39\}\$'\);/);
  assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /DROP|DELETE|UPDATE|INSERT|ALTER COLUMN|RENAME|TRUNCATE/i);
});

test('miniaturas da loja: uma por item do pet (20), WebP com fundo transparente de 240×180, leves, e nenhum arquivo sobrando', () => {
  const dir = path.join(root, 'public/pet'), files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, PET.map((i) => i.id + '.webp').sort(), 'exatamente um arquivo por item do pet');
  let total = 0;
  for (const f of files) {
    const b = fs.readFileSync(path.join(dir, f)); total += b.length;
    assert.equal(b.toString('latin1', 0, 4), 'RIFF'); assert.equal(b.toString('latin1', 8, 12), 'WEBP'); assert.ok(b.length >= 2000 && b.length <= 20000, f + ': tamanho ' + b.length);
    assert.equal(b.toString('latin1', 12, 16), 'VP8X', f + ': formato estendido (com transparência)'); assert.ok(b[20] & 0x10, f + ': tem canal alfa');
    const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16)); assert.deepEqual([w, h], [240, 180], f + ': tamanho');
  }
  assert.ok(total < 200000, 'todas juntas pesam pouco: ' + total);
});
test('cliente da loja: categorias, cartões do pet e compra seguem as regras (só o servidor decide; visitante só usa o grátis; texto nunca vira HTML)', () => {
  const js = fs.readFileSync(path.join(root, 'public/loja.js'), 'utf8'), pet = fs.readFileSync(path.join(root, 'public/pet.js'), 'utf8');
  assert.match(js, /\[\['bandejas', '🧺 BANDEJAS'\], \['skins', '🎨 SKINS'\], \['roupas', '👕 ROUPAS'\]\]/);
  assert.match(js, /function petUsable\(it\) \{ return !!it && \(it\.price <= 0 \|\| S\.owned\.indexOf\(it\.id\) >= 0\); \}/, 'usável = grátis ou comprado');
  assert.match(js, /img\.src = '\/pet\/' \+ it\.id \+ '\.webp'/); assert.match(js, /img\.addEventListener\('error'/, 'foto que não carrega vira um ícone, nunca um quadro quebrado');
  assert.match(js, /api\('POST', '\/shop\/buy', \{ itemId: it\.id \}\)/, 'a compra é um pedido ao servidor (o mesmo das bandejas)'); assert.match(js, /\{ itemId: it\.id \} : \{ category: cat, itemId: null \}/);
  assert.match(js, /rarity/); assert.doesNotMatch(js.slice(js.indexOf('function petCard')), /innerHTML/);
  assert.match(pet, /if \(it && !it\.usable\) \{ closeModal\(\); if \(window\.QC\.openShop\) window\.QC\.openShop\('loja', cat\); return; \}/, 'bloqueado: leva à loja');
  assert.match(js, /function openShop\(tab, cat\)/);
});

test('PostgreSQL: loja do pet (compra, posse, equipar, tirar, bloqueios, concorrência e rotas)', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg'); const { createAccounts } = require('../accounts');
  const schema = 't_pet_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 }); await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: connection, ssl: false, max: 8, options: `-c search_path=${schema}` });
  const db = { q: (s, p) => pool.query(s, p), pool }; const q = (s, p) => pool.query(s, p); const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  try {
    const dir = path.join(root, 'migrations');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await q(fs.readFileSync(path.join(dir, f), 'utf8'));
    await q(fs.readFileSync(path.join(dir, '016_loja_pet.sql'), 'utf8'));                                          // idempotente
    let n = 0;
    const mk = async (gems) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded, gems) VALUES ($1,$2,$3,0,true,$4) RETURNING id', ['p' + (++n) + '@t.test', 'Pet' + n, 'P' + String(n).padStart(2, '0') + crypto.randomBytes(3).toString('hex').toUpperCase().replace(/[01ILO]/g, '2') + '2', gems])).rows[0].id;
    const gemas = async (uid) => Number((await q('SELECT gems FROM users WHERE id = $1', [uid])).rows[0].gems);
    const svc = shop.makeService(db);

    /* ---- estado inicial: nada equipado; itens grátis valem sem comprar ---- */
    const ana = await mk(1000); let st = await svc.status(ana);
    assert.deepEqual(st.pet, { skin: null, outfit: null }, 'começa com o pet de fábrica'); assert.deepEqual(st.owned, ['classica'], 'o que é "comprado" continua sendo só o das bandejas');
    for (const i of GRATIS) { const r = await svc.equip(ana, i.id); assert.deepEqual([r.ok, r.category, r.equipped], [true, i.category, i.id], 'grátis equipa sem comprar: ' + i.id); }
    st = await svc.status(ana); assert.deepEqual(st.pet, { skin: 'skin-luar', outfit: 'roupa-macacao' }, 'uma skin e uma roupa ao mesmo tempo (a última de cada categoria)'); assert.equal(await gemas(ana), 1000, 'grátis não gasta nada');
    const b0 = await svc.buy(ana, 'skin-menta'); assert.deepEqual([b0.ok, b0.already, b0.price, b0.gems], [true, true, 0, 1000], 'comprar um item grátis não cobra nada');
    assert.equal((await q('SELECT count(*)::int AS n FROM shop_purchases WHERE user_id = $1', [ana])).rows[0].n, 0, 'e não cria compra');

    /* ---- pagos: bloqueados até comprar ---- */
    for (const i of PAGOS) { const r = await svc.equip(ana, i.id); assert.deepEqual([r.ok, r.error], [false, 'locked'], 'bloqueado: ' + i.id); }
    st = await svc.status(ana); assert.deepEqual(st.pet, { skin: 'skin-luar', outfit: 'roupa-macacao' }, 'tentar equipar o que não é seu não muda nada');
    const pobre = await mk(99); const rp = await svc.buy(pobre, 'skin-limao'); assert.deepEqual([rp.ok, rp.error, rp.missing, rp.gems], [false, 'gems', 1, 99], 'saldo curto: recusa e diz quanto falta'); assert.equal(await gemas(pobre), 99); assert.equal((await q('SELECT count(*)::int AS n FROM shop_purchases WHERE user_id = $1', [pobre])).rows[0].n, 0);
    const b1 = await svc.buy(ana, 'skin-ouro'); assert.deepEqual([b1.ok, b1.already, b1.price, b1.gems], [true, false, 500, 500]); assert.ok(b1.owned.includes('skin-ouro'));
    const b2 = await svc.buy(ana, 'skin-ouro'); assert.deepEqual([b2.ok, b2.already, b2.gems], [true, true, 500], 'segunda compra do mesmo item: não cobra de novo');
    const e1 = await svc.equip(ana, 'skin-ouro'); assert.deepEqual([e1.ok, e1.equipped], [true, 'skin-ouro']); st = await svc.status(ana); assert.deepEqual(st.pet, { skin: 'skin-ouro', outfit: 'roupa-macacao' }); assert.ok(st.owned.includes('skin-ouro') && !st.owned.includes('skin-menta'), 'owned lista só o comprado');
    assert.deepEqual(st.history.map((h) => [h.item, h.price]), [['skin-ouro', 500]], 'histórico com o preço pago');

    /* ---- categoria errada, ids inválidos, tirar ---- */
    for (const [id, cat] of [['skin-ouro', 'roupas'], ['roupa-mago', 'skins'], ['nuvem', 'skins'], ['skin-menta', 'bandejas']]) { const r = await svc.equip(ana, id, cat); assert.deepEqual([r.ok, r.error], [false, 'invalid'], 'categoria que não é a do item: ' + id + ' em ' + cat); }
    for (const id of ['', 'skin-nao-existe', '../x', 7, null, undefined, {}, 'SKIN-OURO']) { const r = await svc.equip(ana, id); assert.equal(r.ok, false, 'id inválido: ' + JSON.stringify(id)); }
    assert.deepEqual((await svc.equip(ana, null, 'bandejas')).ok, false, 'tirar só existe para skins e roupas'); assert.deepEqual((await svc.equip(ana, '', 'zzz')).ok, false);
    const t1 = await svc.equip(ana, null, 'skins'); assert.deepEqual([t1.ok, t1.category, t1.equipped], [true, 'skins', null]); st = await svc.status(ana); assert.deepEqual(st.pet, { skin: null, outfit: 'roupa-macacao' }, 'tirar a skin não tira a roupa');
    const t2 = await svc.equip(ana, '', 'roupas'); assert.equal(t2.ok, true); st = await svc.status(ana); assert.deepEqual(st.pet, { skin: null, outfit: null });
    const novo = await mk(0); assert.equal((await svc.equip(novo, null, 'skins')).ok, true, 'tirar funciona até sem linha de preferências'); assert.equal((await svc.equip(novo, 'skin-uva')).ok, true, 'e equipar grátis cria a linha');

    /* ---- o que está salvo só vale se ainda for do jogador ---- */
    await q("UPDATE shop_prefs SET pet_skin = 'skin-coroa-inexistente', pet_outfit = 'skin-menta' WHERE user_id = $1", [ana]); st = await svc.status(ana); assert.deepEqual(st.pet, { skin: null, outfit: null }, 'id desconhecido ou de outra categoria volta ao pet de fábrica');
    await q("UPDATE shop_prefs SET pet_skin = 'skin-limao' WHERE user_id = $1", [ana]); st = await svc.status(ana); assert.equal(st.pet.skin, null, 'pago que o jogador não tem (banco adulterado) não vale');
    await assert.rejects(q("UPDATE shop_prefs SET pet_skin = 'Skin Ruim!' WHERE user_id = $1", [ana]), /check|violates/i, 'o banco recusa id fora do padrão');
    // as preferências de bandeja não pisam nas do pet (e vice-versa)
    await svc.equip(ana, 'skin-ouro'); await svc.buy(ana, 'nuvem'); await svc.equip(ana, 'nuvem'); await svc.setPrefs(ana, { itemId: 'nuvem', color: '#aabbcc' }); await svc.setPrefs(ana, { anim: false });
    st = await svc.status(ana); assert.deepEqual([st.equipped, st.pet.skin, st.colors, st.anim], ['nuvem', 'skin-ouro', { nuvem: '#aabbcc' }, false], 'bandeja, cor, animação e pet convivem');
    assert.deepEqual(await svc.setPrefs(ana, { itemId: 'skin-ouro', color: '#aabbcc' }), { ok: false, error: 'invalid' }, 'não existe cor de skin');

    /* ---- concorrência: duas compras ao mesmo tempo ---- */
    const duda = await mk(600); const par = await Promise.all([svc.buy(duda, 'roupa-coroa'), svc.buy(duda, 'roupa-coroa'), svc.buy(duda, 'roupa-coroa')]);
    assert.equal(par.filter((x) => x.ok && !x.already).length, 1, 'só uma compra de verdade'); assert.ok(par.every((x) => x.ok)); assert.equal(await gemas(duda), 0, 'cobrou uma vez só');
    const gui = await mk(700); const dois = await Promise.all([svc.buy(gui, 'roupa-coroa'), svc.buy(gui, 'skin-ouro')]);
    assert.equal(dois.filter((x) => x.ok).length, 1, 'só uma cabe no saldo'); assert.ok((await gemas(gui)) >= 0, 'saldo nunca fica negativo'); assert.equal(await gemas(gui), 700 - dois.find((x) => x.ok).price);

    /* ---- as rotas ---- */
    const routes = {}; const router = { get(p, ...hh) { routes['GET ' + p] = hh; return router; }, post(p, ...hh) { routes['POST ' + p] = hh; return router; }, use() { return router; } };
    const io = Object.assign(new EventEmitter(), { sockets: { sockets: new Map() }, to: () => ({ emit() {} }) });
    createAccounts({ app: { use() {} }, express: { Router: () => router, json: () => (_, __, next) => next() }, io, db, cleanName: (x) => String(x || '').slice(0, 12), cleanAvatar: (a) => a, roomInfo: () => null, roomOfSocket: () => null,
      imageLabel: () => 'Capivara', getUpload: () => null, putUpload: () => null, onAuth: () => {}, mailer: null, peerOf: () => null, elapsedOf: () => 0 });
    const call = (method, route, token, body) => new Promise((resolve) => {
      const req = { get: (h) => (h.toLowerCase() === 'authorization' && token ? 'Bearer ' + token : ''), query: {}, body: body || {}, method, path: route, ip: '127.0.0.1' };
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, set() {}, json(x) { resolve({ status: this.statusCode, body: JSON.parse(JSON.stringify(x)) }); } };
      const hh = routes[method + ' ' + route]; let i = 0; const next = () => hh[++i](req, res, next); hh[0](req, res, next);
    });
    const mkSess = async (uid) => { const t = 'tok-' + crypto.randomBytes(8).toString('hex'); await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1,$2,now() + interval '1 day')", [sha(t), uid]); return t; };
    const eva = await mk(400), tE = await mkSess(eva);
    let r = await call('GET', '/shop', tE); assert.equal(r.status, 200); assert.deepEqual(r.body.categories.map((c) => c.id), ['bandejas', 'skins', 'roupas']); assert.deepEqual(r.body.pet, { skin: null, outfit: null });
    r = await call('POST', '/shop/equip', tE, { itemId: 'roupa-coroa' }); assert.deepEqual([r.status, r.body.ok, r.body.error], [403, false, 'locked'], 'item pago que não é seu: 403');
    r = await call('POST', '/shop/buy', tE, { itemId: 'roupa-coroa' }); assert.deepEqual([r.status, r.body.ok, r.body.error, r.body.missing], [409, false, 'gems', 200], 'faltam 200 das 600: 409 com o que falta');
    r = await call('POST', '/shop/buy', tE, { itemId: 'roupa-bandana' }); assert.deepEqual([r.body.ok, r.body.price, r.body.gems], [true, 150, 250]);
    r = await call('POST', '/shop/equip', tE, { itemId: 'roupa-bandana' }); assert.deepEqual([r.body.ok, r.body.category, r.body.equipped], [true, 'roupas', 'roupa-bandana']);
    r = await call('POST', '/shop/equip', tE, { itemId: 'skin-uva', category: 'skins' }); assert.equal(r.body.ok, true, 'grátis pela rota');
    r = await call('GET', '/shop', tE); assert.deepEqual(r.body.pet, { skin: 'skin-uva', outfit: 'roupa-bandana' }); assert.ok(r.body.owned.includes('roupa-bandana'));
    r = await call('POST', '/shop/equip', tE, { category: 'roupas', itemId: null }); assert.equal(r.body.ok, true); r = await call('GET', '/shop', tE); assert.deepEqual(r.body.pet, { skin: 'skin-uva', outfit: null }, 'tirar pela rota');
    for (const body of [{ itemId: 'roupa-mago', category: 'skins' }, { itemId: { $ne: 1 } }, { itemId: ['skin-uva'] }, {}, { category: 'skins' }]) { r = await call('POST', '/shop/equip', tE, body); assert.equal(r.body.ok, false, 'recusa ' + JSON.stringify(body)); assert.ok(r.status < 500); }
    // excluir a conta apaga tudo do pet (cascata)
    await q('DELETE FROM users WHERE id = $1', [eva]); assert.deepEqual([(await q('SELECT count(*)::int AS n FROM shop_purchases WHERE user_id = $1', [eva])).rows[0].n, (await q('SELECT count(*)::int AS n FROM shop_prefs WHERE user_id = $1', [eva])).rows[0].n], [0, 0], 'cascata');
  } finally { await pool.end().catch(() => {}); await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {}); await admin.end().catch(() => {}); }
});
