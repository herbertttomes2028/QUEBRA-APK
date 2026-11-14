"use strict";
// Conquistas: catálogo, regras, privacidade, permanência, categorias e equilíbrio do XP. Tudo puro (sem banco).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../achievements');
const xpm = require('../xp');
const { render } = require('../scripts/gerar-doc-conquistas');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const st = (o) => Object.assign({ games: 0, wins: 0, losses: 0, completed: 0, maxPieces: 0, fastest20: null, customGames: 0, totalMs: 0, friends: 0, soloGames: 0, duels: 0, coopDone: 0,
  c6: 0, c12: 0, c20: 0, c30: 0, c48: 0, f6: null, f12: null, f20: null, f30: null, f48: null, slow6: 0, piecesTotal: 0, days: 0, dayMax: 0, streak: 0, winStreak: 0, friendMatches: 0,
  partners: 0, invitesOk: 0, replayMax: 0, libImages: 0, libCats: 0, libCatsFull: 0, purchases: 0, catsInDay: 0, level: 1, playMin: 0, achCount: 0, cat: {} }, o || {});
const mkLib = (cats) => ({
  CATEGORIES: cats.map((c) => ({ id: c.id, name: c.name || c.id, icon: c.icon || '🗂️', gate: c.gate, unlock: c.unlock || 'free', price: c.price || 0, requires: c.requires || null, subtitle: '' })),
  ALL: cats.flatMap((c) => Array.from({ length: c.n }, (_, i) => ({ file: 'lib-' + c.id + '-' + String(i + 1).padStart(2, '0') + '.webp', categoryId: c.id })))
});
const CATS5 = mkLib(['fauna', 'biomas', 'espaco', 'cultura', 'fantasia'].map((id) => ({ id, n: 5, gate: 5 })));
const CATS_REAL = mkLib([{ id: 'fauna', n: 19, gate: 5 }, { id: 'biomas', n: 20, gate: 5, requires: 'fauna', unlock: 'after' }, { id: 'espaco', n: 11, gate: 5 }, { id: 'cultura', n: 15, gate: 5, unlock: 'gems', price: 25 }, { id: 'fantasia', n: 63, gate: 5, unlock: 'gems', price: 40 }]);
const row = (id, lib) => A.list(lib).find((a) => a.id === id);
const done = (id, s, lib) => A.isDone(row(id, lib), st(s));

test('catálogo íntegro: ids e títulos únicos, nível e grupo válidos, textos preenchidos e curtos', () => {
  for (const lib of [CATS5, CATS_REAL]) {
    const l = A.list(lib), grupos = new Set(A.GROUPS.map((g) => g.id));
    assert.ok(l.length >= 100, 'poucas conquistas: ' + l.length);
    assert.equal(new Set(l.map((a) => a.id)).size, l.length, 'ids repetidos');
    assert.equal(new Set(l.filter((a) => !a.retired).map((a) => a.title)).size, l.filter((a) => !a.retired).length, 'títulos repetidos');
    for (const a of l) {
      assert.ok(A.TIERS[a.tier], a.id + ': nível inválido'); assert.ok(grupos.has(a.g), a.id + ': grupo inválido');
      assert.ok(a.icon && a.title && a.desc, a.id + ': texto vazio'); assert.ok(a.title.length <= 28 && a.desc.length <= 120, a.id + ': texto longo demais');
      assert.ok(Number.isFinite(a.goal) && a.goal > 0, a.id + ': meta inválida'); assert.ok(a.xp > 0, a.id + ': sem XP');
    }
  }
  assert.equal(A.GROUPS.length, 9);
  assert.ok(A.list(CATS_REAL).length > A.list(CATS5).length, 'catálogo de imagens maior => mais conquistas por categoria');
});

test('todo "stat" do catálogo existe (guarda contra erro de digitação) e nada cita o pagamento de XP', () => {
  const ok = new Set(['games', 'wins', 'losses', 'completed', 'maxPieces', 'fastest20', 'customGames', 'totalMs', 'friends', 'soloGames', 'duels', 'coopDone', 'c6', 'c12', 'c20', 'c30', 'c48', 'f6', 'f12', 'f20', 'f30', 'f48',
    'slow6', 'piecesTotal', 'days', 'dayMax', 'streak', 'winStreak', 'friendMatches', 'partners', 'invitesOk', 'replayMax', 'libImages', 'libCats', 'libCatsFull', 'purchases', 'catsInDay', 'level', 'playMin', 'achCount', 'sizesDone', 'legend']);
  for (const a of A.list(CATS_REAL)) assert.ok(ok.has(a.stat) || /^cat\.[a-z]+$/.test(a.stat), a.id + ': estatística desconhecida ' + a.stat);
  const src = read('achievements.js');
  assert.ok(!/payMatch/.test(src), 'achievements.js não pode citar payMatch (o contrato diz que só accounts.js usa)');
  assert.ok(!/require\('\.\/accounts'\)/.test(src), 'módulo puro: não depende de accounts.js');
});

test('as 8 conquistas antigas que continuam: mesmo id, mesmo XP e mesma regra de antes ("amigo" e "turma" saíram junto com os amigos)', () => {
  const antigas = { primeira: [{ games: 1 }, { games: 0 }], dez: [{ games: 10 }, { games: 9 }], vitoria: [{ wins: 1 }, { wins: 0 }], campeao: [{ wins: 10 }, { wins: 9 }], montador: [{ completed: 5 }, { completed: 4 }],
    mestre: [{ maxPieces: 48 }, { maxPieces: 30 }], veloz: [{ fastest20: 299999 }, { fastest20: 300000 }], imagem: [{ customGames: 1 }, { customGames: 0 }], };
  assert.deepEqual(Object.keys(antigas).sort(), Object.keys(xpm.ACH_XP).filter((k) => k !== 'amigo' && k !== 'turma').sort(), 'o XP antigo dessas duas fica em xp.js (quem já ganhou não perde), mas elas não existem mais no catálogo');
  assert.ok(!A.list().some((x) => x.id === 'amigo' || x.id === 'turma' || x.g === 'amizade'), 'sem amigos, não há conquistas de amizade');
  for (const [id, [sim, nao]] of Object.entries(antigas)) {
    assert.equal(row(id).xp, xpm.ACH_XP[id], id + ': o XP antigo precisa continuar igual'); assert.equal(done(id, sim), true, id + ' deveria estar ganha'); assert.equal(done(id, nao), false, id + ' não deveria estar ganha');
  }
});

test('"Minha imagem" está aposentada: some para quem não tem, continua para quem já ganhou', () => {
  const linhas = (earned) => A.evaluate(A.list(), st(), new Set(earned));
  assert.ok(!linhas([]).some((r) => r.id === 'imagem'));
  assert.equal(linhas(['imagem']).find((r) => r.id === 'imagem').done, true);
});

test('tempos: "menos é melhor" com fronteira exata, sem tempo nunca ganha, e os limites estão acima do tempo mínimo anti-fantasma', () => {
  assert.equal(done('v6_45', { f6: 44999 }), true); assert.equal(done('v6_45', { f6: 45000 }), false); assert.equal(done('v6_45', { f6: null }), false);
  assert.equal(done('v48_300', { f48: 299999 }), true); assert.equal(done('v48_300', { f48: 300000 }), false);
  for (const a of A.list().filter((x) => x.lower && /^f\d+$/.test(x.stat))) assert.ok(a.goal > xpm.minMs(Number(a.stat.slice(1))), a.id + ': a meta tem de ser MAIOR que o tempo mínimo (senão só uma partida fantasma ganharia)');
});

test('metas dinâmicas acompanham o catálogo de imagens', () => {
  const g = (id, lib) => row(id, lib).goal;
  assert.equal(g('cats_all', CATS5), 5); assert.equal(g('full_all', CATS_REAL), 5); assert.equal(g('compra_all', CATS_REAL), 2);
  assert.equal(g('cats_all', mkLib([{ id: 'a', n: 3 }, { id: 'b', n: 3 }])), 2);
  assert.equal(g('cacador_tudo', CATS5), A.countable(A.list(CATS5)).length, 'o Completista pede todas as visíveis que não são "meta"');
  assert.ok(g('cacador_tudo', CATS_REAL) > g('cacador_tudo', CATS5));
});

test('por categoria: quais conquistas existem para cada tamanho de categoria, sem repetir nem sobrepor', () => {
  const ids = (n, gate) => A.categoryDefs(mkLib([{ id: 'x', n, gate }])).map((a) => a.id.replace('cat_x_', '') + ':' + a.goal);
  assert.deepEqual(ids(0, 5), []);
  assert.deepEqual(ids(1, 5), ['1:1']);
  assert.deepEqual(ids(2, 5), ['1:1', 'all:2']);
  assert.deepEqual(ids(5, 5), ['1:1', 'all:5'], 'gate == N: o "Explorador" seria igual ao "Mestre"');
  assert.deepEqual(ids(6, 5), ['1:1', 'g:5', 'all:6'], 'metade (3) fica abaixo do gate: não vira conquista');
  assert.deepEqual(ids(19, 5), ['1:1', 'g:5', 'h:10', 'all:19']);
  assert.deepEqual(ids(63, 5), ['1:1', 'g:5', 'h:32', 'all:63']);
  const tier = (n) => A.categoryDefs(mkLib([{ id: 'x', n, gate: 5 }])).find((a) => a.id.endsWith('_all')).tier;
  assert.equal(tier(9), 'ouro'); assert.equal(tier(10), 'diamante');
  const nova = A.categoryDefs(mkLib([{ id: 'historia', n: 12, gate: 5, name: 'História do Brasil' }]));
  assert.equal(nova[0].title, 'Primeiro passo: História do Brasil', 'categoria nova ganha título genérico');
  assert.ok(nova.every((a) => a.cat === 'historia' && a.pub), 'por categoria é público');
  assert.equal(A.categoryDefs(CATS_REAL).filter((a) => a.cat === 'fantasia').length, 4);
});

test('avaliação: ganhar é permanente (earned), o progresso nunca passa da meta e o dono vê os segredos mascarados', () => {
  const s = st({ games: 3, cat: {} });
  const l = A.list();
  const r1 = A.evaluate(l, s, new Set());
  assert.equal(r1.find((r) => r.id === 'primeira').done, true); assert.equal(r1.find((r) => r.id === 'dez').done, false);
  assert.equal(r1.find((r) => r.id === 'dez').now, 3);
  const r2 = A.evaluate(l, st({ games: 3 }), new Set(['dez']));
  assert.equal(r2.find((r) => r.id === 'dez').done, true, 'já paga => continua ganha mesmo que a estatística de hoje seja menor (ex.: removeu amigos)');
  assert.equal(A.evaluate(l, st({ games: 999 }), new Set()).find((r) => r.id === 'dez').now, 10, 'progresso limitado à meta');
  assert.equal(A.evaluate(l, st({ f6: 52000 }), new Set()).find((r) => r.id === 'v6_45').now, 52000, 'tempo mostra o seu melhor, sem limitar');
  const me = A.meView(r1), seg = me.find((r) => r.id === 'seg_devagar');
  assert.deepEqual([seg.title, seg.icon, seg.done, seg.goal, seg.now], ['???', '❔', false, null, null]);
  assert.equal(A.meView(A.evaluate(l, st({ slow6: 700000 }), new Set())).find((r) => r.id === 'seg_devagar').title, 'Sem pressa', 'segredo ganho se revela');
});

test('privacidade: o amigo só recebe as públicas, sem progresso, tempos, XP, segredos nem conquistas que revelam amigos/hábitos', () => {
  const rows = A.evaluate(A.list(CATS_REAL), st({ games: 80, friends: 7, f6: 15000, streak: 9, slow6: 800000 }), new Set());
  const fv = A.friendView(rows);
  assert.ok(fv.length > 60);
  for (const r of fv) assert.deepEqual(Object.keys(r).sort(), ['desc', 'done', 'g', 'icon', 'id', 'tier', 'title']);
  const ids = new Set(fv.map((r) => r.id));
  for (const privada of ['amigo', 'turma', 'amigos_10', 'convite_1', 'junto_5', 'parceiros_3', 'dias_3', 'seq_7', 'hora_1', 'dia_5', 'v6_45', 'v6_20', 'v48_300', 'seg_devagar', 'seg_teimoso', 'seg_dia', 'seg_lenda', 'imagem']) assert.ok(!ids.has(privada), privada + ' vazaria para o amigo');
  for (const g of ['velocidade', 'constancia', 'segredos']) for (const a of A.list().filter((x) => x.g === g && x.id !== 'veloz')) assert.equal(a.pub, false, a.id + ' (' + g + ') deveria ser privada');
  for (const publica of ['veloz', 'vitoria', 'campeao', 'nivel_10', 'cat_fauna_1', 'img_10', 'mestre', 'primeira']) assert.ok(ids.has(publica), publica + ' deveria aparecer no perfil do amigo');
  assert.equal(A.friendSummary(rows).total, fv.length);
});

test('resumo: segredos ainda não ganhos ficam fora da conta (ninguém vê "de 121" com surpresas escondidas)', () => {
  const rows = A.evaluate(A.list(CATS_REAL), st(), new Set());
  const s = A.summary(A.meView(rows));
  assert.equal(s.total, rows.length - A.list(CATS_REAL).filter((a) => a.secret).length);
  assert.equal(A.summary(A.meView(A.evaluate(A.list(CATS_REAL), st({ slow6: 700000 }), new Set()))).total, s.total + 1, 'ao ganhar o segredo ele entra na conta');
  assert.deepEqual(Object.keys(s.tiers).sort(), ['bronze', 'diamante', 'ouro', 'prata']);
  assert.equal(Object.values(s.tiers).reduce((n, t) => n + t.total, 0), s.total);
});

test('áreas das categorias: progresso, gate, aberta/bloqueada e coleção completa', () => {
  const lib = CATS_REAL, files = (id) => A.index(lib).byCat.get(id).map((i) => i.file);
  const clears = files('fauna').slice(0, 12).concat(files('biomas').slice(0, 3));
  const unlocked = { fauna: true, biomas: true, espaco: false, cultura: true, fantasia: false };
  const rows = A.evaluate(A.list(lib), st({ cat: { fauna: 12, biomas: 3 } }), new Set());
  const cols = A.collectionsOf(lib, clears, new Set(['cultura']), unlocked, rows), by = (id) => cols.find((c) => c.id === id);
  assert.equal(cols.length, 5);
  assert.deepEqual([by('fauna').done, by('fauna').total, by('fauna').open, by('fauna').gate], [12, 19, true, { done: 5, total: 5 }]);
  assert.deepEqual([by('biomas').done, by('biomas').gate.done, by('biomas').needs], [3, 3, 'fauna'], 'neste catálogo de teste o nome é igual ao id');
  assert.equal(by('espaco').open, false); assert.equal(by('cultura').purchased, true); assert.equal(by('fantasia').price, 40);
  assert.deepEqual(by('fauna').ach, { done: 3, total: 4 }, '1ª imagem, explorador e metade (10 de 19) ganhas; a de todas falta');
  const full = A.collectionsOf(mkLib([{ id: 'a', n: 3, gate: 3 }]), A.index(mkLib([{ id: 'a', n: 3 }])).ALL.map((i) => i.file), new Set(), { a: true }, []);
  assert.equal(full[0].last, true);
});

test('sequências: dias seguidos e vitórias seguidas', () => {
  assert.equal(A.streakOf([]), 0); assert.equal(A.streakOf(['2026-10-01']), 1);
  assert.equal(A.streakOf(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-05', '2026-10-06']), 3);
  assert.equal(A.streakOf(['2026-02-27', '2026-02-28', '2026-03-01']), 3, 'vira o mês');
  assert.equal(A.streakOf(['2026-12-31', '2027-01-01']), 2, 'vira o ano');
  assert.equal(A.winStreakOf(['win', 'win', 'loss', 'win', 'win', 'win']), 3); assert.equal(A.winStreakOf(['loss', 'loss']), 0); assert.equal(A.winStreakOf([]), 0);
});

test('"complete" junta as estatísticas e conta as conquistas ganhas (menos as de "meta" e os segredos)', () => {
  const l = A.list(CATS5), earned = new Set(['primeira', 'dez', 'cacador_10', 'seg_devagar', 'imagem']);
  const s = A.complete({ totalMs: 125 * 60000 }, st({ earned }), l);
  assert.equal(s.playMin, 125);
  assert.equal(s.achCount, 2, 'só "primeira" e "dez" contam: meta, segredo e aposentada ficam de fora');
});

test('equilíbrio do XP: o total fica pequeno de propósito (XP vira nível e nível vira gemas)', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(A.TIERS).map(([k, t]) => [k, t.xp])), { bronze: 5, prata: 15, ouro: 40, diamante: 100 }, 'mudar estes valores muda a economia de gemas: decisão consciente');
  const l = A.list(CATS_REAL).filter((a) => !a.retired);
  const total = l.reduce((s, a) => s + a.xp, 0), bronze = l.filter((a) => a.tier === 'bronze').reduce((s, a) => s + a.xp, 0);
  assert.ok(total >= 3000 && total <= 5000, 'XP total das conquistas fora do esperado: ' + total);
  assert.ok(bronze <= 250, 'XP só das de bronze (as primeiras de todas) alto demais: ' + bronze);
  assert.ok(xpm.levelFromXp(total) <= 12, 'ganhar TODAS as conquistas não pode, sozinho, passar do nível 12');
  for (const a of l) if (!xpm.ACH_XP[a.id]) assert.equal(a.xp, A.TIERS[a.tier].xp, a.id + ': as novas pagam o XP do nível');
});

test('documentação CONQUISTAS.md é exatamente o que o catálogo gera', () => {
  assert.equal(read('CONQUISTAS.md'), render(), 'rode: node scripts/gerar-doc-conquistas.js');
});
