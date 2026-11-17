'use strict';
// Anúncios recompensados: regras que não podem se perder (desligado por padrão, não personalizado, nunca para visitante nem pelo pet,
// valor decidido pelo servidor). O teste dinâmico (servidor real + banco local) fica em anuncios-postgres.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ads = require('../ads');

test('chave: desligada por padrão e com qualquer valor desconhecido; teste/real exigem ca-pub válido', () => {
  for (const env of [{}, { ADS_MODO: '' }, { ADS_MODO: 'sim' }, { ADS_MODO: 'ligado' }, { ADS_MODO: 'teste' }, { ADS_MODO: 'real', ADS_CLIENT: 'pub-1234567890123456' }, { ADS_MODO: 'real', ADS_CLIENT: 'ca-pub-12<script>' }]) {
    const c = ads.fromEnv(env); assert.equal(c.ligado, false, JSON.stringify(env)); assert.equal(c.rede, false); assert.equal(c.client, '');
    assert.deepEqual(ads.publicInfo(c), { modo: 'desligado' });
  }
  const sim = ads.fromEnv({ ADS_MODO: 'Simulado', ADS_CLIENT: 'ca-pub-1234567890123456' });
  assert.equal(sim.modo, 'simulado'); assert.equal(sim.rede, false); assert.equal(sim.client, '', 'simulado nunca chama o Google');
  const t = ads.fromEnv({ ADS_MODO: 'teste', ADS_CLIENT: ' ca-pub-1234567890123456 ' });
  assert.equal(t.rede, true); assert.equal(t.client, 'ca-pub-1234567890123456'); assert.equal(t.pub, 'pub-1234567890123456');
  // limites: padrão 2 gemas, 3 por dia, 120 s; e nunca fora das faixas
  assert.deepEqual([t.gemas, t.limite, t.intervalo], [2, 3, 120]);
  const x = ads.fromEnv({ ADS_MODO: 'simulado', ADS_GEMAS: '500', ADS_LIMITE_DIA: '0', ADS_INTERVALO_S: '1' });
  assert.deepEqual([x.gemas, x.limite, x.intervalo], [5, 1, 30]);
  assert.equal(ads.adsTxt(t), 'google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0\n'); assert.equal(ads.adsTxt(sim), '');
});

test('política de privacidade: com a chave desligada, o texto é o mesmo de antes; ligada, traz a seção de anúncios', () => {
  const html = read('public/privacidade.html'), off = ads.privacyHtml(html, false), on = ads.privacyHtml(html, true);
  assert.match(off, /Não há anúncios, compras com dinheiro real, bate-papo nem caixas de recompensa/);
  assert.match(off, /Não há propaganda e não usamos rastreadores de terceiros/);
  assert.doesNotMatch(off, /AdSense|id="anuncios"|anúncios opcionais/i);
  assert.match(on, /<h2 id="anuncios">Anúncios<\/h2>/); assert.match(on, /não personalizados/); assert.match(on, /Google \(AdSense\)/);
  assert.match(on, /Quem joga sem perfil \(visitante\) nunca vê anúncios/); assert.match(on, /nem pelo pet/);
  assert.doesNotMatch(on, /Não há anúncios, compras/);
  for (const v of [off, on]) assert.doesNotMatch(v, /(SEM|COM)-ANUNCIOS/, 'nenhuma marca sobra na página');
  assert.equal((html.match(/<!--SEM-ANUNCIOS-->/g) || []).length, (html.match(/<!--\/SEM-ANUNCIOS-->/g) || []).length);
  assert.equal((html.match(/<!--COM-ANUNCIOS-->/g) || []).length, (html.match(/<!--\/COM-ANUNCIOS-->/g) || []).length);
  const sv = read('server.js');
  assert.ok(sv.indexOf("app.get('/privacidade.html'") > 0 && sv.indexOf("app.get('/privacidade.html'") < sv.indexOf('express.static(PUBLIC_DIR'), 'a rota da política vem antes dos arquivos estáticos');
});

test('CSP: sem a chave nada muda; com teste/real entram só as origens do Google e Topics/grupos de interesse ficam bloqueados', () => {
  const run = (env) => JSON.parse(execFileSync(process.execPath, ['-e', "const s=require('./security');const h={};s.securityHeaders({get:()=> 'x.test',secure:false},{set:(o)=>Object.assign(h,o)},()=>{});console.log(JSON.stringify({csp:s.cspPolicy('x.test',true),pp:h['Permissions-Policy']}))"], { cwd: ROOT, env: Object.assign({}, process.env, { ADS_MODO: '', ADS_CLIENT: '' }, env) }).toString());
  const off = run({}), on = run({ ADS_MODO: 'real', ADS_CLIENT: 'ca-pub-1234567890123456' }), sim = run({ ADS_MODO: 'simulado' });
  for (const o of [off, sim]) { assert.match(o.csp, /script-src 'self';/); assert.match(o.csp, /frame-src 'none'/); assert.doesNotMatch(o.csp + o.pp, /google|browsing-topics/i); }
  assert.match(on.csp, /script-src 'self' https:\/\/pagead2\.googlesyndication\.com/); assert.doesNotMatch(on.csp, /'unsafe-eval'|'unsafe-inline' https/);
  assert.match(on.csp, /object-src 'none'/); assert.match(on.csp, /frame-ancestors 'none'/);
  assert.match(on.pp, /browsing-topics=\(\), join-ad-interest-group=\(\)$/);
});

test('cliente: só na Loja, só com perfil, não personalizado, valor nunca enviado pelo celular; nada pelo pet', () => {
  const js = read('public/anuncios.js'), html = read('public/index.html');
  assert.match(html, /<div id="shop-ads" class="shop-ads" hidden>/, 'escondido até o servidor dizer que está ligado');
  assert.ok(html.indexOf('id="shop-ads"') > html.indexOf('id="modal-shop"') && html.indexOf('id="shop-ads"') < html.indexOf('id="shop-body"'), 'o botão mora dentro da Loja');
  const tags = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]); assert.equal(tags[tags.length - 1], 'anuncios.js', 'carrega por último (precisa de QC.api e QC.account)');
  assert.doesNotMatch(html, /googlesyndication|adsbygoogle/, 'o index.html nunca carrega o Google por conta própria');
  assert.match(read('public/sw.js'), /'\/loja\.css', '\/anuncios\.js'/);
  assert.match(js, /requestNonPersonalizedAds = 1/); assert.match(js, /'data-tag-for-child-directed-treatment', '1'/); assert.match(js, /'data-tag-for-under-age-of-consent', '1'/);
  assert.match(js, /if \(info\.modo === 'teste'\) s\.setAttribute\('data-adbreak-test', 'on'\)/);
  assert.match(js, /function logged\(\) \{ return !!\(QC\.account && QC\.account\(\)\); \}/);
  assert.match(js, /if \(!info \|\| info\.modo === 'desligado' \|\| !logged\(\)\) return hide\(\);/);
  assert.doesNotMatch(js, /type: '(start|pause|next|browse|preroll)'/, 'só anúncio recompensado, nunca intersticial');
  assert.match(js, /type: 'reward'/);
  assert.match(js, /api\('POST', '\/ads\/reward', \{ nonce: n \}\)/, 'o celular só manda a ficha');
  assert.doesNotMatch(js, /localStorage|sessionStorage|document\.cookie|innerHTML/);
  assert.match(js, /new MutationObserver\(function \(\) \{ if \(!modal\.hidden\) refresh\(\); \}\)/, 'só olha anúncios quando a Loja abre');
  for (const f of ['public/pet.js', 'public/mascot.js', 'public/mascot-core.js', 'public/game.js', 'public/conta.js', 'public/loja.js']) assert.doesNotMatch(read(f), /adBreak|adConfig|adsbygoogle|googlesyndication|'\/ads(\/|')|anuncios\.js/, f + ' não mexe com anúncio');
});

test('servidor: rotas com perfil, ficha de uso único, transação com trava e o tipo novo só pela migração 020', () => {
  const acc = read('accounts.js'), gems = read('gems.js'), sql = read('migrations/020_gemas_anuncio.sql');
  for (const r of ["r.get('/ads', needUser", "r.post('/ads/start', needUser", "r.post('/ads/reward', needUser"]) assert.ok(acc.includes(r), r);
  assert.match(acc, /adTickets\.delete\(uid\);\s+\/\/ uso único/);
  assert.match(acc, /crypto\.timingSafeEqual\(Buffer\.from\(nonce\), Buffer\.from\(t\.nonce\)\)/);
  assert.match(acc, /SELECT gems FROM users WHERE id = \$1 FOR UPDATE/);
  assert.match(acc, /await gemm\.creditAd\(q, uid, 'ad:' \+ t\.nonce, ADS\.gemas\)/, 'o valor vem da configuração do servidor');
  assert.doesNotMatch(acc.slice(acc.indexOf("r.post('/ads/reward'"), acc.indexOf("r.get('/save'")), /req\.body[^\n]*(gems|ganhou|amount)/);
  assert.match(gems, /VALUES \(\$1,\$2,'ad',\$3,'\{\}'::jsonb\) ON CONFLICT \(user_id, ref\) DO NOTHING RETURNING amount/);
  assert.match(sql, /CHECK \(kind IN \('match', 'level', 'ad'\)\)/); assert.match(sql, /DROP CONSTRAINT %I/);
  assert.ok(!/\b(UPDATE|DELETE\s+FROM|DROP\s+TABLE|TRUNCATE|DROP\s+COLUMN)\b/i.test(sql.replace(/--.*$/gm, '')), 'a migração não mexe em dados');
});

test('documentação: Play Store e continuidade explicam como ligar e o que declarar', () => {
  const ps = read('PLAY-STORE.md'), cont = read('CONTINUIDADE.md');
  assert.match(ps, /ADS_MODO/); assert.match(ps, /Contém anúncios/i);
  assert.match(cont, /anuncios-teste/); assert.match(cont, /ADS_MODO/);
});
