"use strict";
// Integridade das imagens da biblioteca: cada linha das migrações aponta para um arquivo REAL, íntegro, nas medidas do jogo e com fonte e licença.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { ROOT } = require('./helpers');
const { webpSize } = require(path.join(ROOT, 'scripts', 'gerar-lote-imagens'));
const dir = path.join(ROOT, 'public', 'biblioteca');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');

// linhas de library_images nas migrações 008 e 009: ('arquivo', 'categoria', 'rótulo', ordem, w, h, bytes, 'sha', 'sha-mini', 'fonte', 'licença')
function linhas() {
  const out = [];
  for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).filter((n) => /^(008_catalogo|\d{3}_imagens_)/.test(n))) {
    const sql = fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8'), bloco = sql.slice(sql.indexOf('INSERT INTO library_images'));
    const re = /\n\s*\('((?:[^']|'')*)', '((?:[^']|'')*)', '((?:[^']|'')*)', (\d+), (\d+), (\d+), (\d+), '([a-f0-9]{64})', '([a-f0-9]{64})', '((?:[^']|'')*)', '((?:[^']|'')*)'\)/g;
    let m; while ((m = re.exec(bloco))) out.push({ mig: f, file: m[1], cat: m[2], label: m[3].replace(/''/g, "'"), ordem: +m[4], w: +m[5], h: +m[6], bytes: +m[7], sha: m[8], thumb: m[9], fonte: m[10].replace(/''/g, "'"), lic: m[11].replace(/''/g, "'") });
  }
  return out;
}
const rows = linhas();

test('as migrações trazem as 25 imagens originais e as dos lotes (165), sem repetição', () => {
  assert.equal(rows.length, 165);
  assert.equal(new Set(rows.map((r) => r.file)).size, 165);
  const porCat = {}; for (const r of rows) (porCat[r.cat] = porCat[r.cat] || []).push(r);
  assert.deepEqual(Object.fromEntries(Object.entries(porCat).map(([c, l]) => [c, l.length])), { fauna: 27, biomas: 20, espaco: 11, cultura: 15, fantasia: 63, 'bau-maravilhas': 29 });
  for (const [c, l] of Object.entries(porCat)) assert.deepEqual(l.map((r) => r.ordem).sort((a, b) => a - b), l.map((_, i) => i + 1), 'ordem 1..N sem buracos em ' + c);
});

test('cada imagem existe, é WebP de verdade, tem as medidas e o peso do jogo e o sha256 confere (original e miniatura)', () => {
  for (const r of rows) {
    const o = fs.readFileSync(path.join(dir, r.file)), t = fs.readFileSync(path.join(dir, 'mini', r.file));
    assert.equal(sha(o), r.sha, r.file + ': sha256 do original diverge da migração');
    assert.equal(sha(t), r.thumb, r.file + ': sha256 da miniatura diverge');
    assert.equal(o.length, r.bytes, r.file + ': bytes');
    assert.deepEqual(webpSize(o), { w: 768, h: 1024 }, r.file); assert.deepEqual(webpSize(t), { w: 240, h: 320 }, 'mini/' + r.file);
    assert.ok(o.length <= 262144 && t.length <= 65536, r.file + ': peso acima do limite');
    assert.deepEqual([r.w, r.h], [768, 1024]);
  }
});

test('nenhum arquivo sobrando na pasta e nenhum arquivo do lote sem linha na migração', () => {
  const esperado = new Set(rows.map((r) => r.file));
  for (const sub of ['', 'mini']) {
    const reais = fs.readdirSync(path.join(dir, sub)).filter((n) => n.endsWith('.webp'));
    assert.deepEqual(new Set(reais), esperado, 'pasta ' + (sub || 'biblioteca') + ' difere das migrações');
    assert.ok(fs.readdirSync(path.join(dir, sub)).every((n) => n.endsWith('.webp') || n === 'mini'), 'só .webp (e a pasta mini): ' + sub);
  }
});

test('proveniência: toda imagem nova tem origem rastreável (Wikimedia em domínio público, ou as do proprietário na coleção própria); rótulos únicos por categoria', () => {
  const novas = rows.filter((r) => !r.mig.startsWith('008'));
  assert.equal(novas.length, 140);
  // 1) as 103 imagens da Wikimedia: fonte com o endereço da página e licença de domínio público (regra original, sem exceção)
  const dono8 = (r) => r.mig.startsWith('017'), wiki = novas.filter((r) => r.cat !== 'bau-maravilhas' && !dono8(r)); assert.equal(wiki.length, 103);
  for (const r of wiki) {
    assert.match(r.fonte, /^Wikimedia Commons: .+ commons\.wikimedia\.org\/wiki\/File:/, r.file + ': fonte sem a página de origem');
    assert.match(r.lic, /^Domínio público/, r.file);
    assert.ok(r.label.length >= 3 && r.label.length <= 60, r.file);
  }
  // 2) as 29 do "Baú das Maravilhas": enviadas pelo proprietário, com texto exato (não vira brecha para outra origem)
  const donas = novas.filter((r) => r.cat === 'bau-maravilhas'); assert.equal(donas.length, 29);
  for (const r of donas) {
    assert.match(r.fonte, /^Enviada pelo proprietário do jogo \(arquivo original: [0-9A-Za-z_]+_3x4_HD\.png\)$/, r.file);
    assert.equal(r.lic, 'Fornecida pelo proprietário do jogo, que responde pela autoria e pelos direitos de uso', r.file);
    assert.ok(r.label.length >= 3 && r.label.length <= 60, r.file);
  }
  // 3) as 8 de "Fauna brasileira" (lote 2026-11-e, migração 017): também enviadas pelo proprietário, com o MESMO texto exato de responsabilidade e o nome do arquivo original (lib-fauna-NN.png).
  //    A exceção vale SÓ para esse lote e essa categoria: qualquer outra imagem fora da Wikimedia continua reprovando.
  const fauna8 = novas.filter(dono8); assert.equal(fauna8.length, 8); assert.ok(fauna8.every((r) => r.cat === 'fauna'));
  for (const r of fauna8) {
    assert.equal(r.fonte, 'Enviada pelo proprietário do jogo (arquivo original: ' + r.file.replace(/\.webp$/, '.png') + ')', r.file);
    assert.equal(r.lic, 'Fornecida pelo proprietário do jogo, que responde pela autoria e pelos direitos de uso', r.file);
    assert.ok(r.label.length >= 3 && r.label.length <= 60, r.file);
  }
  const rot = new Set(); for (const r of rows) { const k = r.cat + '|' + r.label; assert.ok(!rot.has(k), 'rótulo repetido: ' + k); rot.add(k); }
  const manifestos = fs.readdirSync(path.join(ROOT, 'scripts', 'lotes')).filter((n) => n.endsWith('.json')).sort().flatMap((n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'lotes', n), 'utf8')).imagens);
  assert.deepEqual(manifestos.map((i) => i.arquivo), novas.map((r) => r.file), 'os manifestos versionados (em ordem) são os que geraram as migrações');
});

test('as migrações de lotes só INSERIR (nada de apagar/alterar) e são idempotentes', () => {
  for (const f of fs.readdirSync(path.join(ROOT, 'migrations')).filter((n) => /^\d{3}_imagens_/.test(n))) {
  const sql = fs.readFileSync(path.join(ROOT, 'migrations', f), 'utf8').replace(/--.*$/gm, '').replace(/'(?:[^']|'')*'/g, "''");     // sem comentários nem textos ("Walter" contém ALTER)
  assert.ok(!/\b(DROP|DELETE|UPDATE|TRUNCATE|ALTER)\b/i.test(sql));
  assert.match(sql, /ON CONFLICT \(file\) DO NOTHING;\s*$/, f);
  }
});
