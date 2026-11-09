/* Mascote 3D da tela inicial: o desenho (WebGL, sem biblioteca) e o ciclo de vida.
 * Cuidados com o desempenho: só começa depois que a tela inicial já apareceu; 30 quadros por segundo (20 parado); para por completo
 * quando a tela inicial não está visível; devolve a memória depois de um tempo longe; baixa a qualidade sozinho em aparelho fraco;
 * com "movimento reduzido" ou sem WebGL mostra um desenho parado. Não há sombras projetadas. Nada daqui acessa a rede. */
(function () {
  'use strict';
  var Core = window.MascotCore, home = document.getElementById('screen-home'), btn = document.getElementById('mascot');
  if (!Core || !home || !btn) return;

  var CAPS = [[0, 83], [33, 125], [50, 166]], WORK_BUDGET_MS = 8, DUTY_MAX = 0.3, RELEASE_MS = 20000, OUTLINE = 0.032, FOV = 28 * Math.PI / 180, CAM_Y = 0.15, CAM_D = 5.2, GAZE_R = 190;
  var QUALITY_MAX = 3;                                  // 0 normal; 1 resolução 1x e menos quadros; 2 sem contorno e ainda menos; 3 desenho parado

  var brain = Core.createBrain({});
  var parts = Core.makeParts(), geoms = Core.makeGeometries();
  var canvas = null, gl = null, prog = null, loc = null, bufs = null, mouthPos = new Float32Array(Core.MOUTH_N * 6), tonguePos = new Float32Array(Core.MOUTH_N * 6), lashPosL = new Float32Array(Core.MOUTH_N * 6), lashPosR = new Float32Array(Core.MOUTH_N * 6);
  var vp = new Float32Array(16), proj = new Float32Array(16), view = new Float32Array(16);
  var raf = 0, timer = 0, lastTs = 0, lastDraw = 0, workAcc = 0, workN = 0, contEl = document.getElementById('btn-continue'), quality = 0, frames = 0, drawn = 0, inView = true, lastWork = 0, warm = 2, intervalMs = 0, lastNow = 0, ready = false, parallelExt = null, lost = false, released = false, releaseTimer = 0, failed = false, firstDrawn = false;
  var hidden = false, mode = 'fallback', frozen = false, lastPose = null;

  /* ---------------- shaders ---------------- */
  var VS = 'precision mediump float; attribute vec3 aPos; attribute vec3 aNor; uniform mat4 uVP; uniform mat4 uM; uniform mat3 uN; uniform float uOut; varying vec3 vN;' +
    'void main() { vec3 n = normalize(uN * aNor); vec4 w = uM * vec4(aPos, 1.0); w.xyz += n * uOut; vN = n; gl_Position = uVP * w; }';
  var FS = 'precision mediump float; varying vec3 vN; uniform vec3 uColor; uniform float uFlat;' +
    'void main() { if (uFlat > 0.5) { gl_FragColor = vec4(uColor, 1.0); return; }' +
    ' vec3 n = normalize(vN); float d = dot(n, normalize(vec3(-0.45, 0.75, 0.6)));' +
    ' float b = 0.66 + 0.18 * smoothstep(-0.1, 0.1, d) + 0.16 * smoothstep(0.5, 0.6, d);' +
    ' float rim = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0) * 0.16; gl_FragColor = vec4(uColor * b + rim, 1.0); }';

  function compile(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader'); return s; }
  function makeBuf(target, data, usage) { var b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, usage || gl.STATIC_DRAW); return b; }

  function initGL() {
    canvas = document.createElement('canvas'); canvas.className = 'mascot-canvas'; canvas.setAttribute('aria-hidden', 'true');
    gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, stencil: false, premultipliedAlpha: true, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) { canvas = null; throw new Error('sem WebGL'); }
    prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS));
    gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aNor'); gl.linkProgram(prog);     // (a compilação pode seguir em paralelo; finishGL espera)
    parallelExt = gl.getExtension('KHR_parallel_shader_compile');
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stopLoop(); gl = null; ready = false; lost = true; setMode('fallback'); });
    canvas.addEventListener('webglcontextrestored', function () { lost = false; destroyGL(); sync(); });
    btn.appendChild(canvas); warm = 2;      // as 2 primeiras janelas de medição (aquecimento) não contam para a qualidade
  }
  function programReady() { return !parallelExt || !!gl.getProgramParameter(prog, parallelExt.COMPLETION_STATUS_KHR); }
  function finishGL() {
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    loc = { vp: gl.getUniformLocation(prog, 'uVP'), m: gl.getUniformLocation(prog, 'uM'), n: gl.getUniformLocation(prog, 'uN'), out: gl.getUniformLocation(prog, 'uOut'), color: gl.getUniformLocation(prog, 'uColor'), flat: gl.getUniformLocation(prog, 'uFlat') };
    var flatNor = new Float32Array(Core.MOUTH_N * 6); for (var i = 2; i < flatNor.length; i += 3) flatNor[i] = 1;
    var mIdx = Core.mouthIndices();
    bufs = {
      body: { pos: makeBuf(gl.ARRAY_BUFFER, geoms.body.pos), nor: makeBuf(gl.ARRAY_BUFFER, geoms.body.nor), idx: makeBuf(gl.ELEMENT_ARRAY_BUFFER, geoms.body.idx), count: geoms.body.count },
      sph: { pos: makeBuf(gl.ARRAY_BUFFER, geoms.sph.pos), nor: makeBuf(gl.ARRAY_BUFFER, geoms.sph.nor), idx: makeBuf(gl.ELEMENT_ARRAY_BUFFER, geoms.sph.idx), count: geoms.sph.count },
      mouth: { pos: makeBuf(gl.ARRAY_BUFFER, mouthPos, gl.DYNAMIC_DRAW), nor: makeBuf(gl.ARRAY_BUFFER, flatNor), idx: makeBuf(gl.ELEMENT_ARRAY_BUFFER, mIdx), count: mIdx.length },
      tongue: { pos: makeBuf(gl.ARRAY_BUFFER, tonguePos, gl.DYNAMIC_DRAW), nor: bufsNor(flatNor), idx: null, count: mIdx.length },
      lashL: { pos: makeBuf(gl.ARRAY_BUFFER, lashPosL, gl.DYNAMIC_DRAW), nor: bufsNor(flatNor), idx: null, count: mIdx.length },
      lashR: { pos: makeBuf(gl.ARRAY_BUFFER, lashPosR, gl.DYNAMIC_DRAW), nor: bufsNor(flatNor), idx: null, count: mIdx.length }
    };
    bufs.tongue.idx = bufs.mouth.idx; bufs.lashL.idx = bufs.mouth.idx; bufs.lashR.idx = bufs.mouth.idx;
    gl.enableVertexAttribArray(0); gl.enableVertexAttribArray(1);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(0, 0, 0, 0);
    ready = true; resize();
  }
  function bufsNor(a) { return makeBuf(gl.ARRAY_BUFFER, a); }
  function destroyGL() {
    stopLoop();
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null; gl = null; prog = null; bufs = null; firstDrawn = false; ready = false; parallelExt = null; byGeo = null;
  }

  function resize() {
    if (!canvas) return;
    var r = btn.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, quality >= 1 ? 1 : 2);
    var w = Math.max(64, Math.min(640, Math.round(r.width * dpr))), h = Math.max(48, Math.min(480, Math.round(r.height * dpr)));
    var changed = canvas.width !== w || canvas.height !== h;
    if (changed) { canvas.width = w; canvas.height = h; }                       // mudar o tamanho apaga o canvas: por isso redesenha logo abaixo
    Core.mPerspective(proj, FOV, w / h, 1, 20); Core.mIdent(view); view[12] = 0; view[13] = -CAM_Y; view[14] = -CAM_D; Core.mMul(vp, proj, view);
    if (gl) { gl.viewport(0, 0, w, h); if (changed && lastPose) drawPose(lastPose); }
  }

  /* ---------------- desenho ---------------- */
  function bindGeo(g) {
    gl.bindBuffer(gl.ARRAY_BUFFER, g.pos); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.nor); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.idx);
  }
  // Menos chamadas ao WebGL (cada uma custa uma comunicação com a GPU): as peças são agrupadas por geometria (liga os buffers UMA vez por grupo)
  // e a cor e o "achatado" só são enviados quando mudam.
  var GROUPS = ['body', 'sph', 'mouth', 'tongue', 'lashL', 'lashR'], byGeo = null, lastColor = null, lastFlat = -1;
  function groupParts() { byGeo = {}; GROUPS.forEach(function (g) { byGeo[g] = parts.filter(function (p) { return p.geom === g; }); }); }
  function setMat(p) { gl.uniformMatrix4fv(loc.m, false, p.M); gl.uniformMatrix3fv(loc.n, false, p.N); }
  function drawPose(pose) {
    if (!gl || !ready) return;
    lastPose = pose;
    if (!byGeo) groupParts();
    Core.computeParts(parts, pose);
    var tongue = Core.buildMouth(mouthPos, tonguePos, pose);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.mouth.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, mouthPos);
    gl.bindBuffer(gl.ARRAY_BUFFER, bufs.tongue.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, tonguePos);
    parts.byId.tongue.vis = tongue;
    if (parts.byId.lashL.vis) { Core.buildLash(lashPosL, -1, pose); gl.bindBuffer(gl.ARRAY_BUFFER, bufs.lashL.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lashPosL); }
    if (parts.byId.lashR.vis) { Core.buildLash(lashPosR, 1, pose); gl.bindBuffer(gl.ARRAY_BUFFER, bufs.lashR.pos); gl.bufferSubData(gl.ARRAY_BUFFER, 0, lashPosR); }
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(loc.vp, false, vp);
    var g, k, p, list;
    if (quality < 2) {                                                         // contorno: o mesmo modelo, um pouco maior, só com as costas à mostra
      gl.cullFace(gl.FRONT); gl.uniform1f(loc.out, OUTLINE); gl.uniform1f(loc.flat, 1); gl.uniform3fv(loc.color, parts.byId.pupL.color);
      for (g = 0; g < 2; g++) {                                                // só 'body' e 'sph' têm contorno
        list = byGeo[GROUPS[g]]; var bound = false;
        for (k = 0; k < list.length; k++) { p = list[k]; if (!p.outline || !p.vis) continue; if (!bound) { bindGeo(bufs[GROUPS[g]]); bound = true; } setMat(p); gl.drawElements(gl.TRIANGLES, bufs[GROUPS[g]].count, gl.UNSIGNED_SHORT, 0); }
      }
    }
    gl.cullFace(gl.BACK); gl.uniform1f(loc.out, 0); lastColor = null; lastFlat = -1;
    for (g = 0; g < GROUPS.length; g++) {
      list = byGeo[GROUPS[g]]; var b = false;
      for (k = 0; k < list.length; k++) {
        p = list[k]; if (!p.vis) continue;
        if (!b) { bindGeo(bufs[GROUPS[g]]); b = true; }
        setMat(p);
        if (p.color !== lastColor) { gl.uniform3fv(loc.color, p.color); lastColor = p.color; }
        var f = p.flat ? 1 : 0; if (f !== lastFlat) { gl.uniform1f(loc.flat, f); lastFlat = f; }
        gl.drawElements(gl.TRIANGLES, bufs[GROUPS[g]].count, gl.UNSIGNED_SHORT, 0);
      }
    }
    drawn++;
    if (!firstDrawn) { firstDrawn = true; setMode(quality >= 3 ? 'static' : '3d'); }
  }

  /* ---------------- ciclo de vida ---------------- */
  function setMode(m) { mode = m; btn.classList.toggle('is-3d', m === '3d' || m === 'static'); btn.setAttribute('data-mode', m); }
  function homeActive() { return home.classList.contains('active') && !document.hidden && !hidden; }
  function isStatic() { return quality >= 3; }                                 // só em aparelho muito fraco (movimento reduzido ESCONDE o mascote, não o congela)
  function loopWanted() { return !!gl && ready && !frozen && homeActive() && inView && (!isStatic() || brain.busy() || brain.hasChanged()); }
  function startLoop() { if (!raf && !timer && loopWanted()) { lastTs = performance.now(); raf = requestAnimationFrame(frame); } }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } if (timer) { clearTimeout(timer); timer = 0; } }
  function kick() { startLoop(); }
  function capNow() { var c = CAPS[Math.min(quality, CAPS.length - 1)]; return brain.busy() ? c[0] : c[1]; }

  function frame(ts) {
    raf = 0;
    if (!loopWanted()) return;
    var t0 = performance.now(), cap = capNow();                                  // o relógio real, não o carimbo do rAF (que chega ~12 ms atrasado e encurtava a espera)
    var dt = Math.min(0.05, (t0 - (lastNow || t0 - cap)) / 1000);
    if (lastNow) intervalMs = intervalMs ? intervalMs * 0.9 + (t0 - lastNow) * 0.1 : t0 - lastNow;
    lastNow = t0; lastDraw = ts; frames++;
    if (contEl) brain.setContinueVisible(!contEl.hidden);
    var pose = brain.tick(dt);
    if (!isStatic() || brain.consumeChanged()) drawPose(pose);                 // no modo parado só redesenha quando a pose muda
    if (!isStatic()) {                                                          // mede o trabalho real de cada quadro; se for pesado demais, tira detalhe
      workAcc += performance.now() - t0; workN++;
      if (workN >= 45) { var avg = workAcc / workN; workAcc = 0; workN = 0; if (warm > 0) { warm--; } else { lastWork = avg; } var duty = avg / Math.max(intervalMs, 16.7); if (warm <= 0 && (avg > WORK_BUDGET_MS * (1 + quality * 0.4) || duty > DUTY_MAX * (1 + quality * 0.3)) && quality < QUALITY_MAX) degrade(); }
    }
    if (!loopWanted()) return;
    var wait = t0 + cap - performance.now() - 8;                                // dorme até perto do próximo quadro (o rAF ainda alinha com a tela) em vez de acordar a 60 Hz só para pular
    if (wait > 6) timer = setTimeout(function () { timer = 0; raf = requestAnimationFrame(frame); }, wait); else raf = requestAnimationFrame(frame);
  }
  function degrade() {                                                          // aparelho fraco: tira detalhe aos poucos, até ficar parado
    quality++; workAcc = 0; workN = 0; resize();
    if (quality >= 3) { setMode('static'); }
  }

  function sync() {
    hidden = hiddenNow(); btn.hidden = hidden;                                  // escondido pelo Ajuste ou por movimento reduzido: sai da tela e do WebGL por completo
    if (hidden) { brain.deactivate(); stopLoop(); if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = 0; } lost = false; if (canvas || gl) destroyGL(); setMode('fallback'); return; }
    var active = homeActive();
    brain.setReduced(quality >= 3);
    if (active) {
      if (!brain.isActive()) brain.activate();
      if (releaseTimer) { clearTimeout(releaseTimer); releaseTimer = 0; }
      if (lost) return;                                                                                                                                // contexto perdido: espera ser restaurado (não cria outro canvas)
      if (!gl && !failed) { try { initGL(); } catch (e) { failed = true; destroyGL(); setMode('fallback'); return; } setTimeout(sync, 20); return; }     // etapa 1: contexto e shaders
      if (gl && !ready) {                                                                                                                              // etapa 2: buffers, quando o programa estiver compilado
        if (!programReady()) { setTimeout(sync, 16); return; }
        try { finishGL(); } catch (e) { failed = true; destroyGL(); setMode('fallback'); return; } setTimeout(sync, 0); return;
      }
      if (gl) { resize(); if (!firstDrawn) { brain.tick(0.016); drawPose(brain.out); } workAcc = 0; workN = 0; startLoop(); }
    } else {
      brain.deactivate(); stopLoop();
      if (gl && !releaseTimer) releaseTimer = setTimeout(function () { releaseTimer = 0; if (!homeActive()) { destroyGL(); released = true; setMode('fallback'); } }, RELEASE_MS);
    }
  }

  /* ---------------- entradas (toque, olhar, teclado) ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function gazeOf(x, y) { var r = btn.getBoundingClientRect(); return { x: clamp((x - (r.left + r.width / 2)) / GAZE_R, -1, 1), y: clamp((y - (r.top + r.height * 0.45)) / GAZE_R, -1, 1) }; }
  function gazeOfEl(el) { var r = el.getBoundingClientRect(); return gazeOf(r.left + r.width / 2, r.top + r.height / 2); }
  var IDS = { 'btn-play': 'play', 'btn-duel': 'duel', 'btn-continue': 'continue', 'btn-join': 'join', 'link-friends': 'friends', 'link-settings': 'settings', 'link-help': 'help', 'btn-me': 'me' };
  function fallbackBump() { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }

  home.addEventListener('pointerdown', function (e) {
    if (!homeActive()) return;
    frozen = false;
    var el = e.target && e.target.closest ? e.target.closest('button, input') : null, g = gazeOf(e.clientX, e.clientY);
    if (el === btn) { brain.tapMascot(g.x, g.y); if (!gl || mode === 'fallback') fallbackBump(); kick(); return; }
    if (el && IDS[el.id]) {
      var inp = document.getElementById('input-code'), g2 = gazeOfEl(el);
      brain.press(IDS[el.id], g2.x, g2.y, { codeReady: !!inp && inp.value.length >= inp.maxLength });
      kick(); return;
    }
    brain.pointer(g.x, g.y, true); kick();
  }, true);
  home.addEventListener('pointermove', function (e) {
    if (!homeActive() || !gl) return;
    if (e.pointerType === 'mouse' || e.buttons) { var g = gazeOf(e.clientX, e.clientY); brain.pointer(g.x, g.y, e.buttons > 0); startLoop(); }
  }, { passive: true });
  function pointerUp() { brain.pointerEnd(); }
  home.addEventListener('pointerup', pointerUp, true); home.addEventListener('pointercancel', pointerUp, true);
  btn.addEventListener('click', function (e) { if (e.detail === 0) { brain.tapMascot(0, 0); if (!gl || mode === 'fallback') fallbackBump(); kick(); } });   // teclado: Enter ou Espaço
  var code = document.getElementById('input-code');
  if (code) {
    code.addEventListener('focus', function () { var g = gazeOfEl(code); brain.press('codeFocus', g.x, g.y); kick(); });
    code.addEventListener('input', function () { var g = gazeOfEl(code); brain.press(code.value.length >= code.maxLength ? 'codeFull' : 'codeType', g.x, g.y); kick(); });
  }

  /* ---------------- ligações com o resto do jogo (sem mexer em nada dele) ---------------- */
  if (window.QC && window.QC.onXp) {                                            // XP validado pelo servidor: comemora quando a pessoa voltar à tela inicial
    var origXp = window.QC.onXp;
    window.QC.onXp = function (ev) {
      try { if (ev) brain.note(ev.leveledUp ? 'levelup' : (ev.ach && ev.ach.length) ? 'achievement' : (ev.gained > 0 ? 'win' : '')); if (homeActive()) kick(); } catch (e) { /* nunca atrapalha o jogo */ }
      return origXp.apply(this, arguments);
    };
  }
  new MutationObserver(function () { sync(); }).observe(home, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('visibilitychange', function () { sync(); });
  // O mascote NÃO aparece com o movimento reduzido (nos Ajustes ou no celular) nem quando a pessoa o escondeu nos Ajustes. Os Ajustes avisam isso.
  function motionNow() { return document.documentElement.getAttribute('data-motion') === 'reduce' || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function userOff() { return document.documentElement.getAttribute('data-mascot') === 'off'; }
  function hiddenNow() { return userOff() || motionNow(); }
  hidden = hiddenNow(); btn.hidden = hidden;
  new MutationObserver(function () { if (hiddenNow() !== hidden) { sync(); startLoop(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion', 'data-mascot'] });
  if (window.matchMedia) { var mqm = window.matchMedia('(prefers-reduced-motion: reduce)'); var onMqm = function () { if (hiddenNow() !== hidden) sync(); }; if (mqm.addEventListener) mqm.addEventListener('change', onMqm); else if (mqm.addListener) mqm.addListener(onMqm); }
  if (window.IntersectionObserver) new IntersectionObserver(function (en) { inView = en[0].isIntersecting; if (inView) startLoop(); else stopLoop(); }).observe(btn);
  if (window.ResizeObserver) new ResizeObserver(function () { resize();  }).observe(btn);
  setMode('fallback');

  // Só começa depois que a tela já apareceu (não atrasa a abertura do jogo).
  function boot() { if (document.readyState !== 'complete') { window.addEventListener('load', function () { setTimeout(sync, 600); }); } else setTimeout(sync, 600); }
  boot();

  window.Mascot = {
    react: function (name) { if (hidden) return false; frozen = false; var ok = brain.react(name, { dirX: 1 }); kick(); return ok; },
    unfreeze: function () { frozen = false; startLoop(); },
    pose: function () { var o = {}; Core.PARAMS.forEach(function (n) { o[n] = brain.out[n]; }); return o; },
    preview: function (name, u) { frozen = true; stopLoop(); if (!gl) return false; resize(); drawPose(brain.snapshot(name, u == null ? 0.5 : u)); return true; },
    status: function () { return { mode: mode, quality: quality, frames: frames, drawn: drawn, running: !!(raf || timer), released: released, failed: failed, hasContext: !!gl, hidden: hidden, userOff: userOff(), reducedMotion: motionNow(), static: quality >= 3, workMs: +lastWork.toFixed(2), capMs: capNow(), intervalMs: Math.round(intervalMs), busy: brain.busy(), sleeping: brain.isSleeping(), current: brain.current(), expression: brain.expression() }; }
  };
})();
