'use strict';
// Rodada biblioteca livre: todas as imagens públicas e ativas são gratuitas,
// sem alterar migrações, recompensas, compras históricas ou a loja de cosméticos.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const library = require('../library');
const root = path.join(__dirname, '..');

function verificaAcessoLivre(ids) {
  const catalog = library.catalog();
  assert.deepEqual(catalog.map(c => c.id), ids);
  for (const c of catalog) {
    assert.equal(c.unlock, 'free', `${c.id} não tem bloqueio`);
    assert.equal(c.price, 0, `${c.id} não custa gemas`);
    assert.equal(c.requires, null, `${c.id} não depende de outra coleção`);
    assert.equal(c.gate, null, `${c.id} não depende de concluir imagens`);
    assert.ok(c.images.length > 0);
    assert.equal(library.cat(c.id).price, 0, `${c.id} também é livre para o servidor sem contas`);
    assert.equal(library.cat(c.id).unlock, 'free');
    for (const i of c.images) assert.equal(library.canOpen(i.file, [], []), true, i.file);
  }
  assert.deepEqual(library.unlocksFrom([], []), Object.fromEntries(ids.map(id => [id, true])), 'não exige progresso, compras ou conta');
}

test('reserva local: 5 categorias completamente liberadas, incluindo Cultura e Fantasia', () => {
  verificaAcessoLivre(['fauna', 'biomas', 'espaco', 'cultura', 'fantasia']);
});

test('215 imagens no catálogo do banco: acesso gratuito com conta ou como visitante, sem consultar saldo', async () => {
  // Mesma contagem validada em tests/imagens-biblioteca.test.js (não lê nem altera o Neon).
  const counts = { fauna: 55, biomas: 20, espaco: 33, cultura: 15, fantasia: 63, 'bau-maravilhas': 29 };
  const ids = Object.keys(counts);
  const cats = ids.map((id, k) => ({
    id, name: 'Categoria ' + id, subtitle: '', icon: '', sort_order: k + 1,
    unlock: k === 0 ? 'free' : k < 3 ? 'after' : 'gems',
    requires: k === 1 ? ids[0] : k === 2 ? ids[1] : null,
    price: k < 3 ? 0 : 25 + k, unlock_gate: 5
  }));
  const imgs = ids.flatMap((id) => Array.from({ length: counts[id] }, (_, k) => ({
    file: 'lib-' + id + '-' + String(k + 1).padStart(2, '0') + '.webp', category_id: id,
    label: 'Imagem ' + (k + 1), sort_order: k + 1, width: 768, height: 1024, sha256: '', thumb_sha256: ''
  })));
  const dbCatalog = { q: async sql => ({ rows: /FROM library_categories/.test(sql) ? cats : imgs }) };
  assert.equal(await library.loadFromDb(dbCatalog), true);
  assert.equal(library.ALL.length, 215);
  verificaAcessoLivre(ids);
  const db = {
    q: async (sql) => {
      if (/library_clears/.test(sql)) return { rows: [] };
      if (/library_unlocks/.test(sql)) return { rows: [] };
      if (/SELECT gems/.test(sql)) return { rows: [{ gems: 0 }] };
      throw Error('Consulta inesperada: ' + sql);
    },
    pool: { connect: () => { throw Error('a biblioteca gratuita não deve abrir transações de compras'); } }
  };
  const service = library.makeService(db);
  for (const i of library.ALL) {
    assert.equal(await service.canPlay(null, i.file), true, 'visitante: ' + i.file);
    assert.equal(await service.canPlay('usuario-de-teste', i.file), true, 'conta: ' + i.file);
  }
  const st = await service.status('usuario-de-teste');
  assert.equal(st.gems, 0);
  assert.deepEqual(st.unlocked, Object.fromEntries(ids.map(id => [id, true])));
  for (const id of ids) {
    assert.deepEqual(await service.buy('usuario-de-teste', id), { ok: false, error: 'invalid' }, id + ': rota antiga não cobra');
  }
});

test('regras de segurança, de encaixe, de XP e os contratos do Socket.IO não foram alterados', () => {
  // A correção toca somente library.js e testes da biblioteca; jamais os módulos da partida.
  const sv = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const ch = fs.readFileSync(path.join(root, 'challenge.js'), 'utf8');
  const acc = fs.readFileSync(path.join(root, 'accounts.js'), 'utf8');
  const front = fs.readFileSync(path.join(root, 'public/game.js'), 'utf8');
  assert.match(sv, /accounts\.libraryCanPlay/);
  assert.match(sv, /library\.cat\(library\.image\(imageId\)\.categoryId\)\.price/);
  assert.match(ch, /imageAllowed/);
  assert.match(front, /function libraryFree\(c\)/);
  assert.match(acc, /libraryService\.recordTx/);
  assert.match(acc, /payMatch/);
});
