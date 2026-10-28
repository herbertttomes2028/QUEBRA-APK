'use strict';
// Testes estáticos dos contratos da seção 5 do documento de continuidade. Não sobem servidor nem banco.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ROOT } = require('./helpers');

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const server = read('server.js'), challenge = read('challenge.js'), accounts = read('accounts.js');

test('migrações 001–003 são imutáveis (novas entram como 004 em diante)', () => {
  const lock = JSON.parse(read('tests/migrations.sha256.json'));
  for (const [file, hash] of Object.entries(lock)) {
    const h = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'migrations', file))).digest('hex');
    assert.equal(h, hash, file + ' foi alterada: crie uma migração nova (004+) em vez de editar a antiga');
  }
  const files = fs.readdirSync(path.join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const f of Object.keys(lock)) assert.ok(files.includes(f), f + ' sumiu');
});

function body(src, startRe) {                       // devolve o corpo da função que começa em startRe (conta chaves)
  const m = startRe.exec(src); assert.ok(m, 'função não encontrada: ' + startRe);
  let i = src.indexOf('{', m.index), depth = 0, j = i;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(i, j + 1);
}

test('regra de encaixe: as duas cópias de tryLock continuam iguais', () => {
  const a = body(server, /function tryLock\(room, p, idx\)/);
  const b = body(challenge, /function tryLock\(room, idx, board, p, socket\)/);
  const rule = (s) => ({
    tx: /const tx = cfg\.BOARD_X \+ p\.col \* cfg\.TILE \+ cfg\.TILE \/ 2;/.test(s),
    ty: /const ty = cfg\.BOARD_Y \+ p\.row \* cfg\.TILE \+ cfg\.TILE \/ 2;/.test(s),
    rot: /if \(p\.rot !== 0\) return false;/.test(s),
    dist: /if \(Math\.hypot\(p\.x - tx, p\.y - ty\) > cfg\.SNAP\) return false;/.test(s),
    pos: /p\.x = tx;\s*p\.y = ty;/.test(s) && /p\.locked = true;/.test(s) && /p\.lockedBy = idx;/.test(s) && /p\.heldBy = null;/.test(s)
  });
  const all = { tx: true, ty: true, rot: true, dist: true, pos: true };
  assert.deepEqual(rule(a), all, 'server.js tryLock mudou');
  assert.deepEqual(rule(b), all, 'challenge.js tryLock mudou');
});

test('SNAP = round(TILE × 0,33) nos dois layouts (cooperativo e Desafio)', () => {
  const n = (s) => (s.match(/SNAP: Math\.round\(tile \* 0\.33\)/g) || []).length;
  assert.equal(n(server), 1, 'layoutFor em server.js');
  assert.equal(n(challenge), 1, 'layoutQuebra em challenge.js');
});

test('eventos de socket do cooperativo, do Desafio e de contas existem', () => {
  const has = (src, ev) => new RegExp("socket\\.on\\('" + ev.replace(/[:*]/g, (c) => '\\' + c) + "'").test(src);
  const coop = ['create', 'join', 'grab', 'move', 'drop', 'rotate', 'hint', 'spot', 'chat', 'restart', 'rematch:answer', 'rematch:cancel', 'acc:continue', 'imgready', 'push:subscribe', 'push:unsubscribe'];
  const ch = ['ch:create', 'ch:join', 'ch:ready', 'ch:grab', 'ch:move', 'ch:drop', 'ch:rotate', 'ch:gift', 'ch:rematch', 'ch:leave', 'ch:chat', 'ch:hint', 'ch:spot', 'ch:imgready', 'ch:push:subscribe', 'ch:push:unsubscribe'];
  const acc = ['acc:auth', 'acc:logout', 'acc:blockPeer', 'inv:send', 'inv:respond'];
  for (const e of coop) assert.ok(has(server, e), 'server.js perdeu ' + e);
  for (const e of ch) assert.ok(has(challenge, e), 'challenge.js perdeu ' + e);
  for (const e of acc) assert.ok(has(accounts, e), 'accounts.js perdeu ' + e);
  for (const e of ['ch:progress', 'ch:end', 'ch:lobby', 'ch:countdown', 'ch:box', 'ch:cancel']) assert.ok(challenge.includes("'" + e + "'"), 'challenge.js perdeu emissão ' + e);
});

test('XP: payMatch é a única entrada e só accounts.js o usa', () => {
  const donos = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js')).filter((f) => /payMatch/.test(read(f)));
  assert.deepEqual(donos, ['accounts.js']);
  const pay = body(accounts, /async function payMatch\(uid, o\)/);
  assert.ok(/ensureSeeded/.test(pay) && /awardMatch/.test(pay) && /awardAchievements/.test(pay));
  assert.ok(/FOR UPDATE/.test(body(accounts, /async function awardMatch\(/)), 'awardMatch precisa travar a linha do usuário');
  assert.ok(/xp_events/.test(body(accounts, /async function awardMatch\(/)), 'awardMatch precisa checar xp_events (ref única)');
  // nenhuma rota recebe XP do celular
  assert.ok(!/req\.(body|query)\.xp/.test(accounts + server), 'rota lendo XP do cliente');
});

test('exports de createAccounts e das fábricas permanecem', () => {
  const ret = accounts.slice(accounts.lastIndexOf('return {'));
  for (const k of ['enabled', 'config', 'noteCoop', 'flush', 'loadSave', 'deleteSave', 'finishCoop', 'finishDuel', 'levelOf', 'isOnline', 'expireInvites', 'allowedPhrases', 'blockedBetween', 'blockUser', 'verifyGoogleIdToken', 'close']) {
    assert.ok(new RegExp('\\b' + k + '\\b').test(ret), 'createAccounts deixou de devolver ' + k);
  }
  const xp = require('../xp');
  for (const k of ['matchReward', 'needFor', 'CUM']) assert.ok(k in xp, 'xp.js perdeu ' + k);
});

test('sessão: o token cru nunca é guardado (só sha256)', () => {
  assert.ok(/sha256/.test(accounts) && /token_hash/.test(accounts));
  assert.ok(!/INSERT INTO sessions\s*\([^)]*\btoken\b[^_]/.test(accounts), 'INSERT em sessions com coluna token crua');
});

test('frases só por código; nada de texto livre no bate-papo', () => {
  const ph = require('../phrases');
  assert.equal(ph.BASE.length, 10);
  assert.equal(ph.REACTIONS.length, 7);
  assert.equal(ph.UNLOCK.length, 14);
  assert.equal(ph.BASE.length + ph.REACTIONS.length + ph.UNLOCK.length, 31);
  assert.equal(typeof ph.byId, 'function');
  assert.equal(ph.byId('<script>alert(1)</script>'), null);
  assert.ok(ph.byId('oi'));
});

test('CSP: script-src estrito, sem script embutido, frame-ancestors none sempre', () => {
  const sec = require('../security');
  const pol = sec.cspPolicy('exemplo.com', true);
  assert.ok(/script-src 'self'/.test(pol));
  assert.ok(!/script-src[^;]*unsafe-inline/.test(pol), "script-src não pode ter 'unsafe-inline'");
  assert.ok(/frame-ancestors 'none'/.test(pol));
  const html = read('public/index.html');
  const scripts = html.match(/<script\b[^>]*>/g) || [];
  assert.ok(scripts.length > 0);
  for (const s of scripts) assert.ok(/\bsrc=/.test(s), 'script embutido no index.html: ' + s);
  assert.ok(fs.existsSync(path.join(ROOT, 'public/boot.js')));
});

test('tela inicial sem #input-name nem #avatar-grid', () => {
  const html = read('public/index.html');
  assert.ok(!/id=["']input-name["']/.test(html));
  assert.ok(!/id=["']avatar-grid["']/.test(html));
});

test('chaves do aparelho qc.* usadas pelo cliente', () => {
  // o cliente grava por store.get/set('<chave>'), que vira localStorage 'qc.<chave>' (ver "var store" em game.js)
  const game = read('public/game.js');
  assert.ok(/localStorage\.getItem\('qc\.' \+ k\)/.test(game) && /localStorage\.setItem\('qc\.' \+ k, s\)/.test(game), "prefixo 'qc.' do store mudou");
  const src = game + read('public/conta.js');
  for (const k of ['avatar', 'best', 'name', 'pieces', 'settings', 'token', 'tutorial']) assert.ok(src.includes("store.get('" + k + "'"), 'o cliente deixou de ler a chave qc.' + k);
});

test('package.json: start e Node >= 18', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts.start, 'node server.js');
  assert.equal(pkg.engines.node, '>=18');
});

/* ---------- higiene do repositório: render.yaml e .gitignore ---------- */

// Procura chaves repetidas no mesmo bloco de um YAML simples (sem biblioteca). Cada item de lista abre um bloco novo.
function chavesDuplicadas(texto) {
  const dups = [], pilha = [];
  texto.split('\n').forEach((bruta, i) => {
    const linha = bruta.replace(/\s+#.*$/, '');
    if (!linha.trim() || /^\s*#/.test(linha)) return;
    const m = /^(\s*)(-\s+)?([A-Za-z0-9_.-]+):(\s|$)/.exec(linha);
    if (!m) return;
    const recuo = m[1].length + (m[2] ? m[2].length : 0);
    if (m[2]) {
      while (pilha.length && pilha[pilha.length - 1].recuo >= recuo) pilha.pop();
      pilha.push({ recuo, chaves: new Set() });
    } else {
      while (pilha.length && pilha[pilha.length - 1].recuo > recuo) pilha.pop();
      if (!pilha.length || pilha[pilha.length - 1].recuo < recuo) pilha.push({ recuo, chaves: new Set() });
    }
    const topo = pilha[pilha.length - 1];
    if (topo.chaves.has(m[3])) dups.push(m[3] + ' (linha ' + (i + 1) + ')');
    topo.chaves.add(m[3]);
  });
  return dups;
}

test('o detector de chaves duplicadas funciona (pega o defeito antigo do render.yaml)', () => {
  const ruim = 'services:\n  - type: web\n    envVars:\n      - key: A\n        sync: false\n    envVars:\n      - key: A\n        sync: false\n';
  assert.deepEqual(chavesDuplicadas(ruim), ['envVars (linha 6)']);
  const bom = 'services:\n  - type: web\n    envVars:\n      - key: A\n        sync: false\n      - key: B\n        sync: false\n  - type: worker\n    envVars:\n      - key: A\n';
  assert.deepEqual(chavesDuplicadas(bom), []);
});

test('render.yaml: sem chaves duplicadas e com as 5 variáveis de ambiente, todas só no painel (sync: false)', () => {
  const yml = read('render.yaml');
  assert.deepEqual(chavesDuplicadas(yml), [], 'render.yaml tem chave repetida: o YAML é inválido ou perde variáveis');
  assert.equal((yml.match(/^\s+envVars:/gm) || []).length, 1, 'deve haver um único bloco envVars');
  for (const k of ['DATABASE_URL', 'GOOGLE_CLIENT_ID', 'BREVO_API_KEY', 'BREVO_SENDER_EMAIL', 'BREVO_SENDER_NAME']) {
    assert.equal((yml.match(new RegExp('- key: ' + k + '\\b', 'g')) || []).length, 1, k + ' deve aparecer uma vez');
    assert.ok(new RegExp('- key: ' + k + '\\s*\\n\\s+sync: false').test(yml), k + ' precisa de sync: false (segredo só no painel do Render)');
  }
  assert.ok(!/^\s+value:/m.test(yml), 'render.yaml não pode trazer valores de variáveis');
});

test('.gitignore protege node_modules, segredos e a chave do APK', () => {
  const gi = read('.gitignore').split('\n').map((l) => l.trim());
  for (const p of ['node_modules/', '.env', '.env.*', '*.keystore', '*.jks', 'signing-key-info.txt']) assert.ok(gi.includes(p), '.gitignore perdeu ' + p);
  assert.ok(gi.includes('!.env.example'), '.env.example deve continuar versionável');
});

test('tela da partida concluída: X (#res-close) liga ao mesmo caminho de sair, e o botão voltar continua perguntando', () => {
  const html = read('public/index.html'), game = read('public/game.js'), css = read('public/style.css');
  assert.ok(/<button id="res-close"[^>]*\bhidden\b/.test(html), '#res-close deve existir e nascer escondido');
  assert.ok(/addEventListener\('click', leaveNow\)/.test(game), 'o X deve chamar leaveNow');
  assert.ok(/function leaveNow\(\)\s*\{\s*if \(state\.duel\) leaveDuel\(\); else \{ socket\.disconnect\(\); reloadClean\(\); \}/.test(game), 'leaveNow mudou');
  const ask = body(game, /function askLeave\(\)/);
  assert.ok(/leaveNow\(\)/.test(ask), 'askLeave deve usar o mesmo caminho (leaveNow)');
  assert.ok(/if \(scr === 'lobby' \|\| scr === 'game'\) \{ askLeave\(\); return true; \}/.test(game), 'o botão voltar na tela da partida deve continuar perguntando (askLeave)');
  assert.ok(/\.hud \.hud-x\s*\{[^}]*width: 44px; height: 44px;/.test(css), 'o X deve ter 44×44');
  assert.ok(/#screen-game\.done #btn-hint\s*\{\s*display: none;/.test(css));
});
