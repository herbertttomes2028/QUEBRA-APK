#!/usr/bin/env node
'use strict';
/* Gera UMA migração SQL numerada para um lote de imagens novas da biblioteca. Roda no SEU computador, sem dependências e sem credenciais.
 *
 *   node scripts/gerar-lote-imagens.js --pasta ./lote --manifesto ./lote/manifesto.json [--copiar-para public/biblioteca]
 *   (com --copiar-para, as imagens e miniaturas também são copiadas para a pasta do jogo: modo sem armazenamento externo)
 *
 * Por quê assim: o jogo nunca escreve no catálogo (só lê). Cada lote vira um arquivo em migrations/, revisado no Pull request e aplicado no
 * deploy; o banco recebe só NOMES de arquivo e impressões digitais (sha256), nunca URL. Os arquivos em si você envia ao armazenamento à mão.
 *
 * A pasta deve ter  <arquivo>.webp  (768x1024)  e  mini/<arquivo>.webp  (240x320). O manifesto é um JSON:
 *   { "lote": "2026-11-a",
 *     "categorias": [ { "id": "oceano", "nome": "Vida no mar", "subtitulo": "...", "icone": "🐠", "ordem": 6, "liberacao": "free" } ],
 *     "imagens":    [ { "arquivo": "lib-oceano-01.webp", "categoria": "oceano", "rotulo": "Tartaruga-marinha", "ordem": 1, "fonte": "...", "licenca": "..." } ] }
 * "liberacao": free | after (exige "requer": id da categoria) | gems (exige "preco"). TODA imagem exige "fonte" e "licenca" preenchidas.
 * Recusa tudo que não for WebP verdadeiro (confere os bytes, não a extensão), fora das medidas, pesado demais, repetido ou com nome suspeito. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RE_ID = /^[a-z][a-z0-9-]{1,39}$/;
const RE_FILE = /^[a-z0-9][a-z0-9._-]{2,79}\.webp$/;
const MAX_BYTES = 262144, MAX_THUMB = 65536, W = 768, H = 1024, TW = 240, TH = 320;
const erros = [];
const falha = (m) => erros.push(m);

function webpSize(buf) {                                   // WebP verdadeiro (RIFF....WEBP) e suas medidas, lidas do cabeçalho
  if (buf.length < 30 || buf.toString('latin1', 0, 4) !== 'RIFF' || buf.toString('latin1', 8, 12) !== 'WEBP') return null;
  const t = buf.toString('latin1', 12, 16);
  if (t === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (t === 'VP8L') { const v = buf.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  if (t === 'VP8X') return { w: (buf[24] | (buf[25] << 8) | (buf[26] << 16)) + 1, h: (buf[27] | (buf[28] << 8) | (buf[29] << 16)) + 1 };
  return null;
}
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lit = (s) => "'" + String(s).replace(/'/g, "''") + "'";
function txt(v, max, que, vazio) {
  if (typeof v !== 'string') { falha(que + ': não é texto'); return ''; }
  if (/[\u0000-\u001f\u007f\u2028\u2029\\]/.test(v)) { falha(que + ': tem caractere de controle ou barra invertida'); return ''; }
  const s = v.trim();
  if ((!s && !vazio) || s.length > max) falha(que + ': vazio ou maior que ' + max);
  return s;
}

function gerar(opts) {
  erros.length = 0;                                          // cada execução começa sem erros (a lista é do módulo)
  const pasta = path.resolve(opts.pasta), migr = path.resolve(opts.migracoes || path.join(__dirname, '..', 'migrations'));
  let man;
  try { man = JSON.parse(fs.readFileSync(path.resolve(opts.manifesto), 'utf8')); } catch (e) { return { erros: ['manifesto ilegível: ' + e.message] }; }
  const lote = String(man.lote || '');
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(lote)) falha('"lote" ausente ou inválido (letras minúsculas, números e hífen)');
  const cats = Array.isArray(man.categorias) ? man.categorias : [], imgs = Array.isArray(man.imagens) ? man.imagens : [];
  if (!imgs.length) falha('nenhuma imagem no manifesto');
  if (imgs.length > 600) falha('lote grande demais (máx. 600 imagens por migração)');

  const catIds = new Set(), catsSql = [];
  for (const c of cats) {
    if (!c || !RE_ID.test(c.id || '')) { falha('categoria com id inválido: ' + JSON.stringify(c && c.id)); continue; }
    if (catIds.has(c.id)) { falha('categoria repetida: ' + c.id); continue; }
    catIds.add(c.id);
    const un = c.liberacao, ordem = Number(c.ordem), preco = c.preco == null ? 0 : Number(c.preco);
    if (!['free', 'after', 'gems'].includes(un)) falha('liberacao de ' + c.id + ' deve ser free, after ou gems');
    if (!Number.isInteger(ordem) || ordem < 1 || ordem > 1000) falha('ordem de ' + c.id + ' fora de 1..1000');
    if ((un === 'after') !== (c.requer != null)) falha('"requer" só em categorias "after" (e obrigatório nelas): ' + c.id);
    if (c.requer != null && !RE_ID.test(String(c.requer))) falha('requer inválido em ' + c.id);
    if ((un === 'gems') !== (preco > 0) || !Number.isInteger(preco) || preco < 0 || preco > 1000) falha('preco só em "gems" (inteiro 1..1000): ' + c.id);
    catsSql.push(`  (${lit(c.id)}, ${lit(txt(c.nome, 60, 'nome de ' + c.id))}, ${lit(txt(c.subtitulo == null ? '' : c.subtitulo, 100, 'subtítulo de ' + c.id, true))}, ${lit(txt(c.icone == null ? '' : c.icone, 8, 'ícone de ' + c.id, true))}, ${ordem}, ${lit(un)}, ${c.requer != null ? lit(c.requer) : 'NULL'}, ${preco})`);
  }
  const arquivos = new Set(), vagas = new Set(), imgSql = [], enviar = [], pares = [];
  for (const im of imgs) {
    const f = im && im.arquivo;
    if (typeof f !== 'string' || !RE_FILE.test(f) || f.includes('..') || path.basename(f) !== f) { falha('nome de arquivo inválido: ' + JSON.stringify(f)); continue; }
    if (arquivos.has(f)) { falha('arquivo repetido: ' + f); continue; }
    arquivos.add(f);
    if (typeof im.categoria !== 'string' || !RE_ID.test(im.categoria)) { falha(f + ': categoria inválida'); continue; }
    const ordem = Number(im.ordem), vaga = im.categoria + '#' + ordem;
    if (!Number.isInteger(ordem) || ordem < 1 || ordem > 10000) falha(f + ': ordem fora de 1..10000');
    if (vagas.has(vaga)) falha(f + ': ordem ' + ordem + ' repetida em ' + im.categoria);
    vagas.add(vaga);
    const rotulo = txt(im.rotulo, 60, 'rótulo de ' + f), fonte = txt(im.fonte, 200, 'FONTE de ' + f), licenca = txt(im.licenca, 200, 'LICENÇA de ' + f);
    let bo, bt;
    try { bo = fs.readFileSync(path.join(pasta, f)); } catch (e) { falha(f + ': arquivo não encontrado na pasta'); continue; }
    try { bt = fs.readFileSync(path.join(pasta, 'mini', f)); } catch (e) { falha('mini/' + f + ': miniatura não encontrada'); continue; }
    const so = webpSize(bo), st = webpSize(bt);
    if (!so) { falha(f + ': não é um WebP verdadeiro'); continue; }
    if (!st) { falha('mini/' + f + ': não é um WebP verdadeiro'); continue; }
    if (so.w !== W || so.h !== H) falha(f + ': deve ter ' + W + 'x' + H + ' (tem ' + so.w + 'x' + so.h + ')');
    if (st.w !== TW || st.h !== TH) falha('mini/' + f + ': deve ter ' + TW + 'x' + TH + ' (tem ' + st.w + 'x' + st.h + ')');
    if (bo.length > MAX_BYTES) falha(f + ': pesado demais (' + bo.length + ' bytes; máx. ' + MAX_BYTES + ')');
    if (bt.length > MAX_THUMB) falha('mini/' + f + ': pesada demais (' + bt.length + ' bytes; máx. ' + MAX_THUMB + ')');
    imgSql.push(`  (${lit(f)}, ${lit(im.categoria)}, ${lit(rotulo)}, ${ordem}, ${so.w}, ${so.h}, ${bo.length}, ${lit(sha(bo))}, ${lit(sha(bt))}, ${lit(fonte)}, ${lit(licenca)})`);
    enviar.push('biblioteca/' + f, 'biblioteca/mini/' + f);
    pares.push([path.join(pasta, f), path.join(pasta, 'mini', f), f]);
  }
  if (erros.length) return { erros };
  const jaTem = fs.readdirSync(migr).find((n) => n.endsWith('_imagens_' + lote + '.sql'));
  if (jaTem) return { erros: ['o lote "' + lote + '" já foi gerado em ' + jaTem + ' (use outro nome de lote para novas imagens)'] };

  const numeros = fs.readdirSync(migr).map((n) => /^(\d{3})_/.exec(n)).filter(Boolean).map((m) => Number(m[1]));
  const prox = String(Math.max(0, ...numeros) + 1).padStart(3, '0');
  const nome = `${prox}_imagens_${lote}.sql`;
  let sql = `-- ${prox}: lote de imagens "${lote}" (${imgs.length} imagens, ${cats.length} categorias novas). Gerado por scripts/gerar-lote-imagens.js; REVISE antes do Merge.\n` +
    `-- Idempotente (ON CONFLICT DO NOTHING). Os arquivos precisam estar no armazenamento ANTES do deploy (lista no final do comando).\n\n`;
  if (catsSql.length) sql += `INSERT INTO library_categories (id, name, subtitle, icon, sort_order, unlock, requires, price) VALUES\n${catsSql.join(',\n')}\nON CONFLICT (id) DO NOTHING;\n\n`;
  sql += `INSERT INTO library_images (file, category_id, label, sort_order, width, height, bytes, sha256, thumb_sha256, source, license) VALUES\n${imgSql.join(',\n')}\nON CONFLICT (file) DO NOTHING;\n`;
  const destino = path.join(migr, nome);
  if (fs.existsSync(destino)) return { erros: ['já existe ' + nome] };      // (rede de segurança; o teste de lote repetido vem acima)
  fs.writeFileSync(destino, sql);
  const lockPath = path.resolve(opts.hashes || path.join(__dirname, '..', 'tests', 'migrations.sha256.json'));     // o teste de imutabilidade exige o hash
  if (fs.existsSync(lockPath)) { const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8')); lock[nome] = sha(Buffer.from(sql, 'utf8')); fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n'); }
  if (opts.copiarPara) {                                                  // modo "arquivos locais": copia para public/biblioteca (e mini/), sem sobrescrever
    const dest = path.resolve(opts.copiarPara); fs.mkdirSync(path.join(dest, 'mini'), { recursive: true });
    for (const [o, t, f] of pares) { for (const [de, para] of [[o, path.join(dest, f)], [t, path.join(dest, 'mini', f)]]) { if (fs.existsSync(para)) return { erros: ['já existe em ' + dest + ': ' + path.basename(para)] }; fs.copyFileSync(de, para); } }
  }
  return { ok: true, nome, destino, imagens: imgs.length, categorias: cats.length, enviar };
}

module.exports = { gerar, webpSize };

if (require.main === module) {
  const a = process.argv.slice(2), arg = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : undefined; };
  if (!arg('--pasta') || !arg('--manifesto')) { console.error('uso: node scripts/gerar-lote-imagens.js --pasta <pasta> --manifesto <manifesto.json>'); process.exit(2); }
  const r = gerar({ pasta: arg('--pasta'), manifesto: arg('--manifesto'), copiarPara: arg('--copiar-para') });
  if (r.erros) { console.error('LOTE RECUSADO (' + r.erros.length + ' problema(s)); nada foi gravado:\n - ' + r.erros.join('\n - ')); process.exit(1); }
  console.log(`OK: ${r.nome} (${r.imagens} imagens, ${r.categorias} categorias novas)\n\nENVIE ao armazenamento (mantendo estes caminhos) ANTES do deploy:\n${r.enviar.join('\n')}`);
}
