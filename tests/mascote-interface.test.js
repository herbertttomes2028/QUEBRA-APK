"use strict";
// Mascote 3D da tela inicial: estrutura da página, privacidade, ciclo de vida, desempenho e escopo (só a tela inicial, sem loja).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('public/index.html'), css = read('public/style.css'), sw = read('public/sw.js'), mas = read('public/mascot.js'), core = read('public/mascot-core.js');
const homeSec = html.slice(html.indexOf('<section id="screen-home"'), html.indexOf('<!-- ========== MEU ESPAÇO'));
const cssMas = css.slice(css.indexOf('/* ===================== Mascote da tela inicial ===================== */'));
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const masCode = strip(mas), coreCode = strip(core);

/* ---------------- a página ---------------- */
test('tela inicial: a subfrase saiu, ficam o nome, o mascote e os botões, na ordem certa', () => {
  assert.doesNotMatch(html, /Cada um no seu celular, montando a mesma imagem ao mesmo tempo/);
  assert.doesNotMatch(homeSec, /class="lead"/, 'a tela inicial não tem mais o parágrafo de subtítulo');
  const ordem = ['<h1>', 'id="mascot"', 'id="home-invite"', 'id="btn-continue"', 'id="cta-row"', 'class="join-card"', 'class="tabbar"'].map((t) => homeSec.indexOf(t));
  assert.ok(ordem.every((n) => n > 0), 'tudo continua presente: ' + ordem); assert.deepEqual(ordem.slice().sort((a, b) => a - b), ordem, 'ordem: título, mascote, convite, continuar, botões, código, barra de abas');
  for (const id of ['btn-play', 'btn-duel', 'input-code', 'btn-join', 'link-settings', 'link-help', 'btn-me', 'link-friends', 'logo']) assert.ok(homeSec.includes('id="' + id + '"'), id + ' continua na tela inicial');
});

test('o mascote só existe na tela inicial e é um botão acessível, com desenho de reserva escondido do leitor de tela', () => {
  assert.equal((html.match(/id="mascot"/g) || []).length, 1); assert.ok(homeSec.includes('id="mascot"'), 'dentro da tela inicial');
  const btn = html.match(/<button id="mascot"[^>]*>/)[0]; assert.match(btn, /type="button"/); assert.match(btn, /aria-label="Mascote do jogo\. Toque nele para brincar\."/);
  const svg = html.slice(html.indexOf('<svg class="mascot-fallback"'), html.indexOf('</svg>', html.indexOf('<svg class="mascot-fallback"')));
  assert.match(svg, /aria-hidden="true"/); assert.match(svg, /focusable="false"/); assert.doesNotMatch(svg, /<script|onload|onclick|href=/i);
  const resto = html.replace(homeSec, ''); assert.doesNotMatch(resto, /class="mascot/, 'nenhuma outra tela tem mascote');
});

test('scripts: o núcleo e o desenho vêm depois do jogo e da conta, locais e sem inline', () => {
  const tags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
  const i = (n) => tags.findIndex((t) => t.includes(n)); assert.ok(i('conta.js') > 0 && i('mascot-core.js') > i('conta.js') && i('mascot.js') > i('mascot-core.js'));
  assert.ok(i('mascot-looks.js') > i('mascot-core.js') && i('mascot-looks.js') < i('mascot.js'), 'as aparências (skins e roupas) vêm entre o núcleo e o desenho'); assert.ok(i('pet.js') > i('mascot.js'), 'a janela "Meu pet" vem depois do desenho');
  for (const t of tags.filter((t) => /mascot|pet\.js/.test(t))) { assert.doesNotMatch(t, /https?:|async|type="module"/); assert.match(t, /src="(mascot(-core|-looks)?|pet)\.js"/); }
  assert.doesNotMatch(html, /<script>[^<]/, 'sem script inline');
});

test('service worker: guarda os dois arquivos novos na abertura rápida e mantém a versão do cache', () => {
  const shell = sw.match(/const SHELL = \[([^\]]*)\]/)[1]; assert.ok(shell.includes("'/mascot-core.js'") && shell.includes("'/mascot.js'"));
  assert.match(sw, /const CACHE = 'quebra-cabeca-v21';/, 'a versão do cache não mudou (a interface se atualiza por trás)');
});

/* ---------------- privacidade: nada sai do aparelho ---------------- */
test('privacidade: o mascote não usa rede, armazenamento, cookies, eval nem HTML dinâmico', () => {
  for (const [nome, src] of [['mascot.js', masCode], ['mascot-core.js', coreCode]]) {
    for (const proibido of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /sendBeacon/, /localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\beval\s*\(/, /new Function/, /innerHTML/, /outerHTML/, /insertAdjacentHTML/, /document\.write/, /importScripts/, /\bimport\s*\(/, /https?:\/\//, /navigator\.(geolocation|mediaDevices|clipboard)/, /getUserMedia/])
      assert.doesNotMatch(src, proibido, nome + ' não pode conter ' + proibido);
  }
  assert.doesNotMatch(coreCode, /\bdocument\b|\bwindow\b/, 'o núcleo não toca em página nenhuma');
});

test('não atrapalha o jogo: nenhum preventDefault (só o obrigatório da perda de contexto) e a ligação com o XP é protegida', () => {
  assert.equal((masCode.match(/preventDefault\(\)/g) || []).length, 1, 'único preventDefault: o da perda de contexto WebGL');
  assert.match(masCode, /webglcontextlost', function \(e\) \{ e\.preventDefault\(\);/);
  const xp = masCode.slice(masCode.indexOf('window.QC.onXp = function'), masCode.indexOf('new MutationObserver(function () { sync(); })'));
  assert.match(xp, /try \{[\s\S]*\} catch \(e\) \{[^}]*\}/, 'erro do mascote nunca derruba a comemoração do jogo'); assert.match(xp, /return origXp\.apply\(this, arguments\);/);
  assert.doesNotMatch(xp, /ev\.[a-z]+\s*=[^=]/, 'não altera o evento recebido');
  assert.match(masCode, /home\.addEventListener\('pointerdown', function \(e\) \{[\s\S]*?\}, true\);/, 'escuta em captura sem bloquear');
  assert.doesNotMatch(masCode, /stopPropagation|stopImmediatePropagation/);
});

/* ---------------- desempenho e ciclo de vida ---------------- */
test('desempenho: só começa depois da abertura, para fora da tela inicial, devolve memória, e o laço não acorda a 60 Hz à toa', () => {
  assert.match(masCode, /document\.readyState !== 'complete'[\s\S]*setTimeout\(sync, 600\)/, 'espera a página carregar e mais 0,6 s');
  assert.match(masCode, /function homeActive\(\) \{ return home\.classList\.contains\('active'\) && !document\.hidden && !hidden; \}/, 'só desenha com a tela inicial visível, a aba à vista e o mascote não escondido');
  assert.match(masCode, /function frame\(ts\) \{\s*\n\s*raf = 0;\s*\n\s*if \(!loopWanted\(\)\) return;/, 'o laço começa checando se ainda deve rodar');
  assert.match(masCode, /RELEASE_MS = 20000/); assert.match(masCode, /releaseTimer = setTimeout\(function \(\) \{[^}]*destroyGL\(\)/);
  assert.match(masCode, /function stopLoop\(\) \{ if \(raf\) \{ cancelAnimationFrame\(raf\); raf = 0; \} if \(timer\) \{ clearTimeout\(timer\); timer = 0; \} \}/, 'parar cancela o quadro E o temporizador');
  assert.match(masCode, /timer = setTimeout\(function \(\) \{ timer = 0; raf = requestAnimationFrame\(frame\); \}, wait\)/, 'dorme até perto do próximo quadro');
  assert.match(masCode, /var wait = t0 \+ cap - performance\.now\(\) - 8;/, 'a espera sai do relógio real (o carimbo do rAF chega atrasado e fazia o laço correr mais que o limite)');
  for (const ev of ['visibilitychange', 'webglcontextlost', 'webglcontextrestored']) assert.ok(masCode.includes("'" + ev + "'"), ev);
  assert.match(masCode, /new IntersectionObserver/); assert.match(masCode, /new ResizeObserver/);
  assert.match(masCode, /if \(canvas\.width !== w \|\| canvas\.height !== h\)|var changed = canvas\.width !== w/, 'só realoca o canvas quando o tamanho muda');
  assert.match(masCode, /if \(changed && lastPose\) drawPose\(lastPose\)/, 'redesenha depois de redimensionar (senão o canvas fica em branco)');
});

test('suavidade e desempenho: ao reagir acompanha a tela (sem teto), parado 12 quadros/s, e cada nível de qualidade só reduz; qualidade adaptativa pelo trabalho real', () => {
  const caps = masCode.match(/var CAPS = \[\[(\d+), (\d+)\], \[(\d+), (\d+)\], \[(\d+), (\d+)\]\]/); assert.ok(caps); const n = caps.slice(1).map(Number);
  assert.equal(n[0], 0, 'qualidade 0, reagindo: sem teto, no ritmo da tela (suave)'); assert.ok(n[1] >= 83, 'parado: no máximo 12 quadros/s (medido: a 20/s o custo parado era 3x maior; ele só respira)');
  assert.ok(n[2] >= 30 && n[4] >= n[2], 'qualidade 1 e 2: cada nível reduz o ritmo'); assert.ok(n[3] >= n[1] && n[5] >= n[3], 'e o ritmo parado também');
  const bud = Number(masCode.match(/WORK_BUDGET_MS = (\d+(?:\.\d+)?)/)[1]); assert.ok(bud >= 5 && bud <= 12, 'orçamento de trabalho por quadro: ' + bud + ' ms');
  const duty = Number(masCode.match(/DUTY_MAX = (\d+(?:\.\d+)?)/)[1]); assert.ok(duty >= 0.2 && duty <= 0.4, 'fração máxima de CPU por quadro: ' + duty + ' (importa agora que ele pode rodar a 60 quadros/s)');
  assert.match(masCode, /var duty = avg \/ Math\.max\(intervalMs, 16\.7\);/); assert.match(masCode, /avg > WORK_BUDGET_MS \* \(1 \+ quality \* 0\.4\) \|\| duty > DUTY_MAX \* \(1 \+ quality \* 0\.3\)/);
  assert.match(masCode, /var QUALITY_MAX = 3;/); assert.match(masCode, /workN >= 45/); assert.match(masCode, /warm > 0\) \{ warm--; \}/, 'o aquecimento (compilar shaders) não conta');
  assert.match(masCode, /if \(!isStatic\(\) \|\| brain\.consumeChanged\(\)\) drawPose\(pose\);/);
  assert.match(masCode, /function isStatic\(\) \{ return quality >= 3; \}/, 'parado só em aparelho muito fraco: movimento reduzido ESCONDE o mascote, não o congela');
  assert.match(masCode, /function loopWanted\(\) \{ return !!gl && ready && !frozen && homeActive\(\) && inView && \(!isStatic\(\) \|\| brain\.busy\(\) \|\| brain\.hasChanged\(\)\); \}/);
  assert.doesNotMatch(masCode, /kickUntil/, 'sem temporizador fixo que mantinha o laço vivo à toa');
  const wait = masCode.match(/var wait = t0 \+ cap - performance\.now\(\) - 8;[^\n]*\n\s*if \(wait > 6\) timer = setTimeout[^\n]*else raf = requestAnimationFrame\(frame\);/); assert.ok(wait, 'com teto dorme num temporizador; sem teto (cap 0) segue direto no rAF, a cada quadro da tela');
});

test('desempenho do WebGL: poucas chamadas por quadro (peças agrupadas por geometria, uniformes só quando mudam), sem sombra, sem transparência', () => {
  assert.match(masCode, /var GROUPS_BASE = \['body', 'sph', 'mouth', 'tongue', 'lashL', 'lashR'\], GROUPS = GROUPS_BASE\.slice\(\)/, 'os 6 grupos de sempre; as malhas da roupa entram como grupos extras');
  assert.equal((masCode.match(/GROUPS = GROUPS_BASE\.concat\(names\)/g) || []).length, 1, 'os grupos extras só são montados em um lugar (uploadLook)');
  assert.match(masCode, /if \(!b\) \{ bindGeo\(bufs\[GROUPS\[g\]\]\); b = true; \}/, 'liga os buffers UMA vez por grupo');
  assert.match(masCode, /if \(p\.color !== lastColor\)/); assert.match(masCode, /if \(f !== lastFlat\)/);
  assert.equal((masCode.match(/bindGeo\(/g) || []).length, 3, 'definição + contorno + desenho principal');
  assert.doesNotMatch(masCode, /gl\.enable\(gl\.BLEND\)|shadow|DEPTH_TEXTURE|getExtension\('WEBGL_depth_texture|framebuffer|createTexture|readPixels/i, 'sem sombra projetada, sem transparência, sem texturas');
  assert.match(masCode, /powerPreference: 'low-power'/); assert.match(masCode, /preserveDrawingBuffer: false/); assert.doesNotMatch(masCode, /failIfMajorPerformanceCaveat/, 'celular sem GPU potente ainda mostra o 3D (a qualidade adaptativa cuida)');
  assert.match(masCode, /Math\.min\(window\.devicePixelRatio \|\| 1, quality >= 1 \? 1 : 2\)/, 'resolução limitada a 2x (1x se o aparelho for fraco)');
  assert.match(masCode, /Math\.min\(640,[^)]*\)/, 'tamanho máximo do canvas'); assert.ok(core.length + mas.length < 60000, 'pouco código: ' + (core.length + mas.length) + ' bytes');
});

test('falhas do WebGL nunca derrubam o jogo: sem suporte, shader com erro e contexto perdido caem no desenho de reserva', () => {
  assert.match(masCode, /try \{ initGL\(\); \} catch \(e\) \{ failed = true; destroyGL\(\); setMode\('fallback'\); return; \}/);
  assert.match(masCode, /if \(!gl\) \{ canvas = null; throw new Error\('sem WebGL'\); \}/); assert.match(masCode, /throw new Error\('shader'\)/); assert.match(masCode, /throw new Error\('link'\)/);
  assert.match(masCode, /function fallbackBump\(\)/); assert.match(masCode, /if \(!gl \|\| mode === 'fallback'\) fallbackBump\(\)/);
  assert.match(masCode, /webglcontextrestored', function \(\) \{ lost = false; destroyGL\(\); sync\(\); \}/);
  assert.match(masCode, /if \(lost\) return;/, 'com o contexto perdido não cria outro canvas até ele ser restaurado');
  assert.match(masCode, /KHR_parallel_shader_compile/, 'a compilação dos shaders pode seguir fora da thread principal');
  assert.match(masCode, /if \(!programReady\(\)\) \{ setTimeout\(sync, 16\); return; \}/, 'a inicialização é dividida em etapas, em tarefas separadas');
  assert.match(masCode, /try \{ finishGL\(\); \} catch \(e\) \{ failed = true; destroyGL\(\); setMode\('fallback'\); return; \}/);
});

test('movimento reduzido ou Ajuste desligado: o mascote some por completo (sai da tela, do laço e do WebGL), e muda ao vivo', () => {
  assert.match(masCode, /function motionNow\(\) \{ return document\.documentElement\.getAttribute\('data-motion'\) === 'reduce' \|\| !!\(window\.matchMedia && window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\); \}/);
  assert.match(masCode, /function userOff\(\) \{ return document\.documentElement\.getAttribute\('data-mascot'\) === 'off'; \}/);
  assert.match(masCode, /function hiddenNow\(\) \{ return userOff\(\) \|\| motionNow\(\); \}/);
  assert.match(masCode, /attributeFilter: \['data-motion', 'data-mascot'\]/); assert.match(masCode, /mqm\.addEventListener\('change', onMqm\)/, 'e quando o celular muda "reduzir movimento"');
  const sync = masCode.slice(masCode.indexOf('function sync() {'), masCode.indexOf('/* ---------------- entradas'));
  assert.match(sync, /hidden = hiddenNow\(\); btn\.hidden = hidden;/); assert.match(sync, /if \(hidden\) \{ brain\.deactivate\(\); stopLoop\(\);[\s\S]{0,160}?if \(canvas \|\| gl\) destroyGL\(\); setMode\('fallback'\); return; \}/, 'escondido: para o laço e DEVOLVE o WebGL (na própria ramificação, não em outro lugar)');
  assert.match(masCode, /brain\.setReduced\(quality >= 3\)/, 'o "cérebro" só vira parado em aparelho fraco'); assert.doesNotMatch(masCode, /\bvar reduced\b|\breduced = |\|\| reduced\b|\breduced \|\|/, 'não existe mais mascote "congelado" por movimento reduzido');
  assert.match(masCode, /react: function \(name\) \{ if \(hidden\) return false;/, 'escondido não reage a nada');
  assert.match(masCode, /hidden: hidden, userOff: userOff\(\), reducedMotion: motionNow\(\)/);
});

/* ---------------- CSS ---------------- */
test('CSS do mascote: tamanho adaptado, alvo de toque grande, foco visível, sem filtro/sombra, e ESCONDIDO só com CSS (nada pisca na abertura)', () => {
  assert.match(cssMas, /\.mascot \{ --mh: clamp\(104px, 18\.5vh, 168px\);/); assert.match(cssMas, /@media \(max-height: 700px\) \{ \.mascot \{ --mh: clamp\(96px, 16vh, 118px\);/);
  assert.match(cssMas, /width: calc\(var\(--mh\) \* 1\.333\)/); assert.match(cssMas, /\.mascot:focus-visible \{ outline: 3px solid/);
  assert.match(cssMas, /touch-action: manipulation/); assert.match(cssMas, /-webkit-tap-highlight-color: transparent/);
  assert.doesNotMatch(cssMas, /filter\s*:|box-shadow|drop-shadow|backdrop|text-shadow/, 'sem efeitos caros (decisão do projeto: sem sombras)');
  assert.match(cssMas, /\.mascot-canvas, \.mascot-fallback \{ position: absolute; inset: 0;[^}]*pointer-events: none;/, 'só o botão recebe o toque');
  assert.match(cssMas, /\.mascot\[hidden\], html\[data-mascot="off"\] \.mascot, html\[data-motion="reduce"\] \.mascot \{ display: none; \}/, 'escondido pelo atributo, pelo Ajuste ou pelo movimento reduzido dos Ajustes');
  assert.match(cssMas, /@media \(prefers-reduced-motion: reduce\) \{ \.mascot \{ display: none; \} \}/, 'e pelo movimento reduzido do celular');
  assert.match(cssMas, /\.mascot\.is-3d \.mascot-fallback \{ opacity: 0; animation: none; \}/, 'com o 3D no ar, o desenho de reserva não gasta CPU');
  for (const k of ['mascot-bob', 'mascot-bump']) { const m = cssMas.match(new RegExp('@keyframes ' + k + ' \\{[^\\n]*\\}')); assert.ok(m, k); assert.deepEqual([...m[0].matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]).filter((p) => p !== 'transform'), [], k + ' só anima transform'); }
});

/* ---------------- escopo ---------------- */
test('escopo desta rodada: só um mascote, só na tela inicial, sem loja e sem mexer em XP, gemas, servidor ou banco', () => {
  for (const src of [masCode, coreCode]) assert.doesNotMatch(src, /\b(gems|gemas|loja|store|purchase|comprar|price|preço)\b/i, 'nada de loja neste pacote');
  assert.doesNotMatch(masCode, /QC\.(state|socket|openModal|showScreen|join|enterRoom)\b/, 'não controla telas nem salas do jogo');
  assert.match(masCode, /window\.QC\.onXp = function \(ev\)/, 'a única ligação com o jogo é ouvir o XP validado pelo servidor');
  assert.equal((core.match(/Math\.random/g) || []).length, 1, 'aleatoriedade só como padrão do cérebro (e injetável nos testes)');
  assert.match(core, /\(function \(root, factory\)/); assert.match(core, /module\.exports = api/);
});

/* ---------------- Ajustes: esconder o mascote e o aviso do movimento reduzido ---------------- */
const game = read('public/game.js'), boot = read('public/boot.js');
const settingsSec = html.slice(html.indexOf('id="modal-settings"'), html.indexOf('id="victory-flight"'));
test('Ajustes: há um botão (interruptor) para esconder o mascote, acessível, e o aviso do movimento reduzido logo abaixo do Movimento', () => {
  const sw = settingsSec.match(/<button type="button" class="switch"[^>]*data-setting="mascot"><i><\/i><\/button>/); assert.ok(sw, 'interruptor do mascote');
  assert.match(sw[0], /role="switch"/); assert.match(sw[0], /aria-labelledby="lbl-mascot"/); assert.match(sw[0], /aria-describedby="mascot-note"/); assert.match(sw[0], /aria-checked="true"/, 'ligado por padrão');
  assert.match(settingsSec, /<span id="lbl-mascot" class="set-label">Mascote na tela inicial<\/span>/); assert.match(settingsSec, /<p id="mascot-note" class="set-note"><\/p>/);
  const ordem = ['data-setting="motion"', 'id="motion-note"', 'id="lbl-mascot"', 'id="mascot-note"', 'id="lbl-sound"'].map((x) => settingsSec.indexOf(x)); assert.ok(ordem.every((n) => n > 0) && ordem.slice().sort((a, b) => a - b).join() === ordem.join(), 'ordem: Movimento, aviso, Mascote, aviso do mascote, Sons: ' + ordem);
  assert.match(settingsSec, /<p id="motion-note" class="set-note">Com o movimento reduzido, o mascote da tela inicial fica escondido\.<\/p>/, 'o aviso está SEMPRE visível junto do ajuste de Movimento');
});
test('Ajustes: o padrão é mostrar, a escolha é guardada, e o aviso muda com o movimento reduzido (do aparelho ou dos Ajustes)', () => {
  assert.match(game, /var DEFAULT_SETTINGS = \{[^}]*mascot: true(, trayAnim: true)? \};/); assert.match(game, /h\.setAttribute\('data-mascot', s\.mascot === false \? 'off' : 'on'\);/);
  const f = game.slice(game.indexOf('function updateMascotNote() {'), game.indexOf('function saveSettings()'));
  assert.match(f, /var reduced = reducedMotion\(\), off = state\.settings\.mascot === false;/); assert.match(f, /sw\.disabled = reduced;/, 'com movimento reduzido o interruptor fica desligado (não dá para ligar)');
  assert.match(f, /sw\.setAttribute\('aria-checked', \(!reduced && !off\) \? 'true' : 'false'\);/, 'e mostra "desligado" para não enganar');
  assert.match(f, /⚠️ Escondido agora: o movimento está reduzido \(nos Ajustes ou no seu celular\)\. O mascote precisa de animação para aparecer\./); assert.match(f, /O mascote está escondido\. Ligue para ele voltar à tela inicial\./);
  assert.match(game, /var mqr = window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\);/); assert.match(game, /mqr\.addEventListener\('change', function \(\) \{ updateMascotNote\(\); \}\)/, 'o aviso acompanha o celular mudando "reduzir movimento" (ouvinte de verdade)');
  assert.match(game, /if \(sw && !sw\.disabled\) toggleSetting\(sw\.getAttribute\('data-setting'\)\);/, 'interruptor desligado não responde ao toque');
  assert.match(boot, /if \(s\.mascot === false\) d\.setAttribute\('data-mascot', 'off'\);/, 'o atributo vai antes da primeira pintura (o mascote escondido não pisca)');
  assert.doesNotMatch(game + masCode, /mascot[^\n]*(localStorage|store\.set)\([^)]*mascot/i, 'só a chave "mascot" dentro dos ajustes que já existem');
});
