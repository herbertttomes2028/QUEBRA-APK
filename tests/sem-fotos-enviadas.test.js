"use strict";
// LGPD (art. 14, público infantil): o jogo NÃO aceita nem guarda imagens enviadas pelos jogadores.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ROOT, startServer, client } = require('./helpers');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

let srv;
test.before(async () => { srv = await startServer(); });
test.after(async () => { await srv.stop(); });

test('a rota de envio responde 410 (Gone) e nada é guardado: aplicativo antigo em cache falha com clareza', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
  for (const body of [jpeg, Buffer.alloc(4000, 1)]) {
    const r = await fetch(srv.url + '/api/upload', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body });
    assert.equal(r.status, 410);
    assert.deepEqual(await r.json(), { ok: false, error: 'gone' });
    assert.equal(r.headers.get('cache-control'), 'no-store');
  }
  const g = await fetch(srv.url + '/api/up/' + 'a'.repeat(32));
  assert.equal(g.status, 410);
  const cfg = await (await fetch(srv.url + '/api/config')).json();
  assert.ok(!('upload' in cfg), '/api/config não anuncia mais envio de imagem');
});

test('uma sala criada com identificador antigo "custom:..." nunca usa imagem de jogador: cai numa imagem do catálogo', async () => {
  const cfg = await (await fetch(srv.url + '/api/config')).json();
  const catalogo = new Set(cfg.images.map((i) => i.file).concat(cfg.library.flatMap((c) => c.images.map((i) => i.file))));
  const a = await client(srv.url);
  const r = await a.emitAck('create', { pid: 'pid-lgpd-' + Math.random().toString(36).slice(2, 10), imageId: 'custom:' + 'a'.repeat(32), pieces: 12, name: 'Ana' });
  assert.ok(r.ok);
  assert.ok(!String(r.snapshot.imageId).startsWith('custom'), 'imageId: ' + r.snapshot.imageId);
  assert.ok(catalogo.has(r.snapshot.imageId), 'a imagem da sala é do catálogo');
  a.close();
});

test('cliente e HTML não têm mais envio de foto, recorte nem o cartão "Adicionar minha imagem"', () => {
  const js = read('public/game.js'), html = read('public/index.html'), css = read('public/style.css');
  for (const proibido of ['chooseFile', 'openCrop', 'closeCrop', 'useCrop', 'sendImage', 'state.custom', "'api/upload'", 'api/up/', 'localUrl', 'Minha imagem', 'minha imagem']) assert.ok(!js.includes(proibido), 'game.js ainda tem: ' + proibido);
  for (const proibido of ['file-input', 'modal-crop', 'crop-canvas', 'accept="image/*"', 'Minha imagem']) assert.ok(!html.includes(proibido), 'index.html ainda tem: ' + proibido);
  assert.ok(!/\.add-card|\.add-plus|\.crop-sheet|#crop-canvas/.test(css), 'style.css ainda tem estilos do envio de foto');
  assert.match(js, /'🖼 Imagens clássicas'/);
});

test('contas: o salvamento nunca grava nem lê foto (custom_image) e a migração 007 apaga o que já existia', () => {
  const acc = read('accounts.js'), srvjs = read('server.js'), sql = read('migrations/007_remover_fotos_enviadas.sql'), priv = read('public/privacidade.html');
  assert.ok(!/custom_image/.test(acc.replace(/\/\/.*$/gm, '')), 'accounts.js não usa mais a coluna custom_image');
  assert.match(acc, /SELECT image_id, pieces, locked, elapsed_ms, partner_name FROM saves/, 'lê só colunas conhecidas (nunca SELECT *)');
  assert.match(acc, /if \(\/\^custom:\/\.test\(s\.imageId\)\) return;/, 'guarda: id antigo "custom:" nunca é salvo');
  for (const proibido of ['uploads', 'UPLOAD_', 'jpegSize', 'restoreUpload', 'getUpload', 'express.raw']) assert.ok(!srvjs.includes(proibido), 'server.js ainda tem: ' + proibido);
  assert.match(sql, /UPDATE saves SET custom_image = NULL WHERE custom_image IS NOT NULL;/);
  assert.match(sql, /DELETE FROM saves WHERE image_id = 'custom';/);
  assert.ok(!/DROP|TRUNCATE/i.test(sql.replace(/--.*$/gm, '')), 'a migração não remove coluna nem tabela');
  assert.match(priv, /não aceita fotos nem imagens enviadas pelos jogadores/);
  assert.ok(!priv.includes('Minha imagem'));
});
