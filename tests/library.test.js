'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lib = require('../library');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root,p),'utf8');
function webpDimensions(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii',0,4),'RIFF');
  assert.equal(b.toString('ascii',8,12),'WEBP');
  // Files are WEBP (VP8 lossy) or VP8X (extended).
  if (b.toString('ascii',12,16)==='VP8 ') return [b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff];
  if (b.toString('ascii',12,16)==='VP8X') return [b.readUIntLE(24,3)+1,b.readUIntLE(27,3)+1];
  throw Error('Formato WebP não suportado neste teste');
}
test('catálogo tem exatamente 5 categorias, 25 imagens individuais e preços equilibrados', () => {
  assert.deepEqual(lib.CATEGORIES.map(c=>c.id),['fauna','biomas','espaco','cultura','fantasia']);
  assert.equal(lib.ALL.length,25);
  assert.equal(new Set(lib.ALL.map(x=>x.file)).size,25);
  assert.equal(new Set(lib.ALL.map(x=>x.label)).size,25);
  assert.deepEqual(lib.CATEGORIES.map(c=>lib.ALL.filter(i=>i.categoryId===c.id).length),[5,5,5,5,5]);
  assert.deepEqual(lib.CATEGORIES.map(c=>c.price),[0,0,0,25,40]);
  assert.ok(lib.CATEGORIES[4].price>lib.CATEGORIES[3].price);
  assert.ok(lib.CATEGORIES[4].price<=50,'não exigir dezenas de partidas adicionais');
});
test('25 originais 768x1024 e 25 miniaturas 240x320, sem imagens ausentes', () => {
  for(const img of lib.ALL){
    const original = path.join(root,'public',img.url),thumb=path.join(root,'public',img.thumb);
    assert.deepEqual(webpDimensions(original),[768,1024],img.file);
    assert.deepEqual(webpDimensions(thumb),[240,320],img.file);
    assert.ok(fs.statSync(original).size<600000, 'imagem principal pesada: '+img.file);
    assert.ok(fs.statSync(thumb).size<65000, 'miniatura pesada: '+img.file);
    assert.ok(fs.statSync(original).size>10000, 'imagem principal vazia: '+img.file);
  }
});
test('progresso libera categorias 2 e 3 só com 5/5; premium independente', () => {
  const cat=lib.CATEGORIES;
  const all=(id)=>lib.ALL.filter(i=>i.categoryId===id).map(i=>i.file);
  assert.deepEqual(lib.unlocksFrom([],[]),{fauna:true,biomas:false,espaco:false,cultura:false,fantasia:false});
  assert.equal(lib.unlocksFrom(all('fauna').slice(0,4),[]).biomas,false);
  assert.equal(lib.unlocksFrom(all('fauna'),[]).biomas,true);
  assert.equal(lib.unlocksFrom(all('fauna'),[]).espaco,false);
  assert.equal(lib.unlocksFrom(all('fauna').concat(all('biomas').slice(0,4)),[]).espaco,false);
  assert.equal(lib.unlocksFrom(all('fauna').concat(all('biomas')),[]).espaco,true);
  assert.deepEqual(lib.unlocksFrom([],['fantasia']),{fauna:true,biomas:false,espaco:false,cultura:false,fantasia:true});
  assert.deepEqual(lib.unlocksFrom([],['cultura']),{fauna:true,biomas:false,espaco:false,cultura:true,fantasia:false});
});
test('HTML reutiliza tela de seleção, sem quebrar sala, controles ou conteúdo antigo', () => {
  const html=read('public/index.html'),js=read('public/game.js'),css=read('public/style.css');
  assert.match(html,/id="library-categories"/);assert.match(html,/id="library-nav"/);
  assert.match(html,/id="pick-grid"/);assert.match(html,/id="pick-sheet"/);assert.match(html,/id="file-input"/);
  assert.match(js,/state\.libraryCatalog/);assert.match(js,/function renderLibraryHome/);assert.match(js,/function renderLibraryCategory/);
  assert.match(js,/function localLibraryComplete/);assert.match(js,/store\.set\('libraryClears'/);
  assert.match(css,/\.library-category\s*\{/);assert.match(css,/\.library-photo\s*\{/);
  assert.doesNotMatch(read('server.js'),/library.*?payMatch/);
});
test('SQL: progresso e desbloqueio único por usuário/categoria; migração não destrutiva',()=>{
 const sql=read('migrations/006_biblioteca.sql');
 assert.match(sql,/PRIMARY KEY \(user_id, image_id\)/);
 assert.match(sql,/PRIMARY KEY \(user_id, category_id\)/);
 assert.doesNotMatch(sql,/\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i);
 const account=read('accounts.js');
 assert.match(account,/if \(rw\.earnedCompletion && o\.imageId\) await libraryService\.recordTx/);
 assert.match(account,/r\.post\('\/library\/unlock', needUser/);
 const server=read('server.js'),ch=read('challenge.js');
 assert.match(server,/socket\.on\('create', async/);
 assert.match(server,/socket\.on\('restart', async/);
 assert.match(ch,/socket\.on\('ch:create', async/);
 assert.match(server,/accounts\.libraryCanPlay/);
});
