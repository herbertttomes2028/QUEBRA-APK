"use strict";
// PostgreSQL real somente no qc_test, em schema temporário. Loja de bandejas: compra ATÔMICA só com as gemas existentes, sem compra duplicada,
// equipar só o que é seu, cor grátis por modelo (e restaurar), histórico, exclusão em cascata e as rotas /api/acc/shop/*.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const enabled = process.env.GEMAS_TEST_DB === '1';
const connection = process.env.DATABASE_URL || '';
const root = path.join(__dirname, '..');

test('PostgreSQL: loja de bandejas (serviço e rotas)', { skip: !enabled }, async () => {
  const url = new URL(connection);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/qc_test') throw Error('PROTEÇÃO: só qc_test em localhost; nunca Neon/produção');
  const { Pool } = require('pg'); const { createAccounts } = require('../accounts'); const shop = require('../shop');
  const schema = 't_loja_' + crypto.randomBytes(5).toString('hex');
  const admin = new Pool({ connectionString: connection, ssl: false, max: 1 }); await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({ connectionString: connection, ssl: false, max: 8, options: `-c search_path=${schema}` });
  const db = { q: (s, p) => pool.query(s, p), pool }; const q = (s, p) => pool.query(s, p); const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
  try {
    const dir = path.join(root, 'migrations');
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) await q(fs.readFileSync(path.join(dir, f), 'utf8'));
    await q(fs.readFileSync(path.join(dir, '015_loja_bandejas.sql'), 'utf8'));                                   // idempotente: rodar de novo não quebra
    let n = 0;
    const mk = async (gems) => (await q('INSERT INTO users (email, name, friend_code, xp, xp_seeded, gems) VALUES ($1,$2,$3,0,true,$4) RETURNING id', ['l' + (++n) + '@t.test', 'Loja' + n, 'K' + String(n).padStart(2, '0') + crypto.randomBytes(3).toString('hex').toUpperCase().replace(/[01ILO]/g, '2') + '2', gems])).rows[0].id;
    const gemas = async (uid) => Number((await q('SELECT gems FROM users WHERE id = $1', [uid])).rows[0].gems);
    const svc = shop.makeService(db);

    /* ================= catálogo ================= */
    const cat = shop.catalog(); assert.deepEqual(cat.categories.map((c) => c.id), ['bandejas', 'skins', 'roupas'], 'bandejas continua em primeiro; skins e roupas do pet vêm depois (ver tests/pet-loja.test.js)'); assert.equal(cat.categories[0].id, 'bandejas'); assert.equal(cat.categories[0].name, 'Bandejas');
    assert.deepEqual(cat.categories[0].items.map((i) => [i.id, i.price]), [['classica', 0], ['nuvem', 150], ['estrela', 250], ['gelatina', 350], ['galaxia', 500]], 'cinco bandejas, preços do pedido');
    assert.ok(cat.categories[0].items.every((i) => i.name && i.desc), 'nome e descrição');

    /* ================= estado inicial ================= */
    const ana = await mk(600); let st = await svc.status(ana);
    assert.deepEqual([st.gems, st.owned, st.equipped, st.colors, st.anim, st.history], [600, ['classica'], 'classica', {}, null, []], 'quem chega já tem a Clássica equipada');
    assert.equal(await svc.status('00000000-0000-0000-0000-000000000000'), null, 'conta inexistente');

    /* ================= comprar ================= */
    let r = await svc.buy(ana, 'nuvem'); assert.deepEqual([r.ok, r.already, r.gems, r.price, r.owned], [true, false, 450, 150, ['classica', 'nuvem']]);
    assert.equal(await gemas(ana), 450, 'saldo debitado uma vez');
    r = await svc.buy(ana, 'nuvem'); assert.deepEqual([r.ok, r.already, r.gems], [true, true, 450], 'comprar de novo não cobra');
    r = await svc.buy(ana, 'classica'); assert.deepEqual([r.ok, r.already, r.gems, r.price], [true, true, 450, 0], 'a Clássica é de todos e grátis');
    for (const ruim of ['nao-existe', '', null, undefined, 7, {}, ['nuvem'], 'NUVEM', 'nuvem ', '../x']) { const x = await svc.buy(ana, ruim); assert.deepEqual([x.ok, x.error], [false, 'invalid'], 'inválido: ' + JSON.stringify(ruim)); }
    assert.equal(await gemas(ana), 450, 'pedidos inválidos não cobram');
    st = await svc.status(ana); assert.deepEqual(st.owned, ['classica', 'nuvem']); assert.deepEqual(st.history.map((h) => [h.item, h.price]), [['nuvem', 150]], 'histórico com o preço PAGO');

    /* ================= saldo curto: informa quanto falta, nada muda ================= */
    const bia = await mk(149); r = await svc.buy(bia, 'nuvem');
    assert.deepEqual([r.ok, r.error, r.gems, r.price, r.missing], [false, 'gems', 149, 150, 1], 'falta 1 gema'); assert.equal(await gemas(bia), 149);
    assert.equal((await q('SELECT count(*)::int AS n FROM shop_purchases WHERE user_id = $1', [bia])).rows[0].n, 0);
    const exata = await mk(150); r = await svc.buy(exata, 'nuvem'); assert.deepEqual([r.ok, r.gems], [true, 0], 'com o saldo exato compra e fica com 0'); assert.equal(await gemas(exata), 0);

    /* ================= dois ou mais toques ao mesmo tempo: uma cobrança só ================= */
    const cris = await mk(1000); const par = await Promise.all([svc.buy(cris, 'galaxia'), svc.buy(cris, 'galaxia'), svc.buy(cris, 'galaxia'), svc.buy(cris, 'galaxia')]);
    assert.equal(par.filter((x) => x.ok && !x.already).length, 1, 'só uma compra de verdade'); assert.ok(par.every((x) => x.ok));
    assert.equal(await gemas(cris), 500, 'debitou 500 uma vez'); assert.equal((await q('SELECT count(*)::int AS n FROM shop_purchases WHERE user_id = $1', [cris])).rows[0].n, 1);
    // compras DIFERENTES ao mesmo tempo com saldo para uma só: nunca fica negativo
    const duda = await mk(300); const dois = await Promise.all([svc.buy(duda, 'estrela'), svc.buy(duda, 'gelatina')]);   // 250 e 350
    assert.equal(dois.filter((x) => x.ok).length, 1, 'só uma cabe no saldo'); assert.ok((await gemas(duda)) >= 0, 'saldo nunca negativo'); assert.equal(await gemas(duda), dois.find((x) => x.ok).gems);

    /* ================= equipar: só o que é seu ================= */
    r = await svc.equip(ana, 'estrela'); assert.deepEqual([r.ok, r.error], [false, 'locked'], 'não equipa o que não comprou');
    r = await svc.equip(ana, 'nuvem'); assert.deepEqual([r.ok, r.equipped], [true, 'nuvem']); assert.equal((await svc.status(ana)).equipped, 'nuvem');
    r = await svc.equip(ana, 'classica'); assert.equal(r.ok, true, 'volta para a Clássica quando quiser'); assert.equal((await svc.status(ana)).equipped, 'classica');
    r = await svc.equip(ana, 'xyz'); assert.deepEqual([r.ok, r.error], [false, 'invalid']);
    await svc.equip(ana, 'nuvem'); assert.equal((await svc.status(ana)).equipped, 'nuvem', 'fica salvo');

    /* ================= cores: grátis, por modelo, só dos modelos que tem; restaurar ================= */
    r = await svc.setPrefs(ana, { itemId: 'nuvem', color: '#AABBCC' }); assert.deepEqual([r.ok, r.colors], [true, { nuvem: '#aabbcc' }], 'normaliza para minúsculas');
    r = await svc.setPrefs(ana, { itemId: 'classica', color: '#112233' }); assert.deepEqual(r.colors, { nuvem: '#aabbcc', classica: '#112233' }, 'uma cor por modelo, independentes');
    assert.equal(await gemas(ana), 450, 'trocar de cor NÃO custa gemas');
    for (const ruim of ['#abc', 'aabbcc', '#gggggg', 'red', '', '#12345', '#1234567', null === 1, 12, {}, ['#aabbcc'], 'javascript:1', '#aabbcc;x']) { if (ruim === false) continue; const x = await svc.setPrefs(ana, { itemId: 'nuvem', color: ruim }); assert.deepEqual([x.ok, x.error], [false, 'color'], 'cor inválida: ' + JSON.stringify(ruim)); }
    r = await svc.setPrefs(ana, { itemId: 'estrela', color: '#112233' }); assert.deepEqual([r.ok, r.error], [false, 'locked'], 'cor de modelo que não tem');
    r = await svc.setPrefs(ana, { itemId: 'xyz', color: '#112233' }); assert.deepEqual([r.ok, r.error], [false, 'invalid']);
    r = await svc.setPrefs(ana, { color: '#112233' }); assert.deepEqual([r.ok, r.error], [false, 'invalid'], 'sem modelo');
    r = await svc.setPrefs(ana, { itemId: 'nuvem', color: null }); assert.deepEqual([r.ok, r.colors], [true, { classica: '#112233' }], 'restaurar a cor original remove só aquele modelo');
    r = await svc.setPrefs(ana, { anim: false }); assert.deepEqual([r.ok, r.anim, r.colors], [true, false, { classica: '#112233' }], 'animação sem mexer nas cores');
    r = await svc.setPrefs(ana, { anim: 'sim' }); assert.deepEqual([r.ok, r.error], [false, 'anim']); r = await svc.setPrefs(ana, {}); assert.deepEqual([r.ok, r.error], [false, 'invalid']);
    st = await svc.status(ana); assert.deepEqual([st.equipped, st.colors, st.anim], ['nuvem', { classica: '#112233' }, false], 'tudo persistido junto');
    // sujeira no banco (modelo que não existe, cor torta) nunca chega ao jogador
    await q("UPDATE shop_prefs SET colors = '{\"nuvem\":\"vermelho\",\"fantasma\":\"#ffffff\",\"classica\":\"#AA00BB\"}'::jsonb, equipped = 'fantasma' WHERE user_id = $1", [ana]);
    st = await svc.status(ana); assert.deepEqual([st.equipped, st.colors], ['classica', { classica: '#aa00bb' }], 'status limpa o que é inválido');
    // concorrência de cores: duas trocas ao mesmo tempo não perdem nenhuma
    await svc.equip(ana, 'nuvem'); await Promise.all([svc.setPrefs(ana, { itemId: 'nuvem', color: '#010203' }), svc.setPrefs(ana, { itemId: 'classica', color: '#040506' })]);
    assert.deepEqual((await svc.status(ana)).colors, { nuvem: '#010203', classica: '#040506' }, 'as duas cores ficaram');

    /* ================= o banco é a última defesa ================= */
    await assert.rejects(q("INSERT INTO shop_purchases (user_id, item_id, gems_spent) VALUES ($1, 'nuvem', 150)", [ana]), /unique|duplicate/i, 'compra duplicada');
    await assert.rejects(q("INSERT INTO shop_purchases (user_id, item_id, gems_spent) VALUES ($1, 'Item Ruim', 10)", [ana]), /check|violates/i);
    await assert.rejects(q("INSERT INTO shop_purchases (user_id, item_id, gems_spent) VALUES ($1, 'x1', 0)", [ana]), /check|violates/i, 'gems_spent > 0');
    await assert.rejects(q("INSERT INTO shop_prefs (user_id, colors) VALUES ($1, '[]'::jsonb) ON CONFLICT (user_id) DO UPDATE SET colors = '[]'::jsonb", [ana]), /check|violates/i, 'colors tem de ser objeto');

    /* ================= preço pago fica no histórico mesmo se o catálogo mudar; excluir a conta apaga tudo ================= */
    await q("UPDATE shop_purchases SET gems_spent = 99 WHERE user_id = $1 AND item_id = 'nuvem'", [ana]); assert.equal((await svc.status(ana)).history[0].price, 99, 'o histórico mostra o que foi gravado');
    await q('DELETE FROM users WHERE id = $1', [ana]);
    assert.deepEqual([(await q('SELECT count(*)::int AS n FROM shop_purchases WHERE user_id = $1', [ana])).rows[0].n, (await q('SELECT count(*)::int AS n FROM shop_prefs WHERE user_id = $1', [ana])).rows[0].n], [0, 0], 'cascata');

    /* ================= as rotas /api/acc/shop/* ================= */
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
    for (const [m, rt] of [['GET', '/shop'], ['POST', '/shop/buy'], ['POST', '/shop/equip'], ['POST', '/shop/prefs']]) { const x = await call(m, rt, null, {}); assert.equal(x.status, 401, 'sem login: ' + rt); }
    let h = await call('GET', '/shop', tE); assert.equal(h.status, 200); assert.deepEqual([h.body.ok, h.body.gems, h.body.owned, h.body.equipped], [true, 400, ['classica'], 'classica']); assert.equal(h.body.categories[0].items.length, 5, 'a rota traz o catálogo');
    assert.ok(!JSON.stringify(h.body).includes('@t.test') && !('email' in h.body), 'nunca devolve e-mail');
    h = await call('POST', '/shop/buy', tE, { itemId: 'galaxia' }); assert.deepEqual([h.status, h.body.error, h.body.missing], [409, 'gems', 100], 'falta 100');
    h = await call('POST', '/shop/buy', tE, { itemId: 'nope' }); assert.deepEqual([h.status, h.body.error], [400, 'invalid']);
    h = await call('POST', '/shop/buy', tE, { itemId: 'estrela' }); assert.deepEqual([h.status, h.body.ok, h.body.gems], [200, true, 150]);
    h = await call('POST', '/shop/equip', tE, { itemId: 'gelatina' }); assert.deepEqual([h.status, h.body.error], [403, 'locked']);
    h = await call('POST', '/shop/equip', tE, { itemId: 'estrela' }); assert.deepEqual([h.status, h.body.equipped], [200, 'estrela']);
    h = await call('POST', '/shop/prefs', tE, { itemId: 'estrela', color: '#FF8800' }); assert.deepEqual([h.status, h.body.colors], [200, { estrela: '#ff8800' }]);
    h = await call('POST', '/shop/prefs', tE, { itemId: 'estrela', color: 'laranja' }); assert.deepEqual([h.status, h.body.error], [400, 'color']);
    h = await call('POST', '/shop/prefs', tE, { itemId: 'galaxia', color: '#ff8800' }); assert.deepEqual([h.status, h.body.error], [403, 'locked']);
    h = await call('POST', '/shop/prefs', tE, { anim: true }); assert.deepEqual([h.status, h.body.anim], [200, true]);
    h = await call('POST', '/shop/prefs', tE, {}); assert.deepEqual([h.status, h.body.error], [400, 'invalid']);
    h = await call('GET', '/shop', tE); assert.deepEqual([h.body.gems, h.body.owned, h.body.equipped, h.body.colors, h.body.anim, h.body.history.map((x) => x.item)], [150, ['classica', 'estrela'], 'estrela', { estrela: '#ff8800' }, true, ['estrela']]);
    // um jogador nunca mexe na loja de outro (a conta vem SEMPRE do login, nunca do corpo do pedido)
    const fabio = await mk(900), tF = await mkSess(fabio);
    h = await call('POST', '/shop/buy', tF, { itemId: 'nuvem', userId: eva, user_id: eva }); assert.equal(h.status, 200);
    assert.deepEqual([await gemas(eva), await gemas(fabio)], [150, 750], 'cobrou só de quem pediu'); assert.deepEqual((await svc.status(eva)).owned, ['classica', 'estrela'], 'a outra conta não ganhou nada');
    // limite de compras por minuto (15)
    const gil = await mk(100000), tG = await mkSess(gil); let ultimo; for (let i = 0; i < 15; i++) ultimo = await call('POST', '/shop/buy', tG, { itemId: 'classica' });
    assert.equal(ultimo.status, 200); ultimo = await call('POST', '/shop/buy', tG, { itemId: 'classica' }); assert.deepEqual([ultimo.status, ultimo.body.error], [429, 'rate'], 'a 16ª compra no minuto é barrada');
  } finally { await pool.end().catch(() => {}); await admin.query(`DROP SCHEMA ${schema} CASCADE`).catch(() => {}); await admin.end().catch(() => {}); }
});

test('estático: a loja não cria moeda nova, não toca em dinheiro real e as tabelas apagam em cascata', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations', '015_loja_bandejas.sql'), 'utf8'), js = fs.readFileSync(path.join(root, 'shop.js'), 'utf8');
  assert.equal((sql.match(/REFERENCES users\(id\) ON DELETE CASCADE/g) || []).length, 2, 'as duas tabelas apagam com a conta'); assert.match(sql, /UNIQUE \(user_id, item_id\)/);
  assert.doesNotMatch(sql + js, /\b(stripe|paypal|mercadopago|pix|cartao|credit_card|price_cents|brl|usd)\b/i, 'nenhum dinheiro real');
  assert.match(js, /SELECT gems FROM users WHERE id = \$1 FOR UPDATE/, 'trava a linha do jogador'); assert.match(js, /UPDATE users SET gems = gems - \$1 WHERE id = \$2 RETURNING gems/, 'debita as gemas existentes');
  assert.doesNotMatch(js, /INSERT INTO gem_events/, 'não mexe no livro de ganhos de gemas');
});
