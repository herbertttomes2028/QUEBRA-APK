/*
 * Service worker do Quebra-Cabeça a Dois.
 * - Deixa o jogo instalável (tela inicial / APK).
 * - ABERTURA INSTANTÂNEA: a tela do jogo (página, estilos e scripts) vem do próprio celular na hora, mesmo que o servidor
 *   esteja dormindo (o plano gratuito do Render pode levar mais de 20 s para acordar). A internet só atualiza essa cópia
 *   por trás, de uma vez só (todos os arquivos juntos, para nunca misturar versões) e avisa o jogo quando houver novidade.
 * - NUNCA guarda o que é do jogo em tempo real (conexão /socket.io, /api): isso vai sempre pela rede.
 * - Imagens: usa a guardada e atualiza em segundo plano.
 * - Avisos (push): mostra "fulano entrou" / "nova mensagem" quando o aplicativo está fechado.
 * O jogo em si precisa de internet; sem ela aparece um aviso simples (e o app mostra "Conectando…").
 */
const CACHE = 'quebra-cabeca-v17';
// (o cliente do Socket.IO é um arquivo estático que o index.html carrega ANTES do jogo: precisa vir do celular também, senão um servidor dormindo trava o início)
const SHELL = ['/', '/style.css', '/boot.js', '/socket.io/socket.io.js', '/game.js', '/conta.js', '/manifest.webmanifest', '/privacidade.html', '/icons/icon-192.png'];
const SHELL_SET = new Set(SHELL);
const REFRESH_EVERY = 5 * 60 * 1000;
let lastRefresh = 0;

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(SHELL.map(async (u) => {
    try { const r = await fetch(new Request(u, { cache: 'reload' })); if (r && r.ok) await cache.put(u, r); } catch (e) { /* tenta de novo no próximo refresh */ }
  }));
}

// busca TODOS os arquivos novos; só troca a cópia se todos vierem bem (assim nunca mistura versão nova com velha)
async function refreshShell() {
  const now = Date.now();
  if (now - lastRefresh < REFRESH_EVERY) return;
  lastRefresh = now;
  try {
    const cache = await caches.open(CACHE);
    const fresh = [];
    for (const u of SHELL) {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (!r || !r.ok) { lastRefresh = 0; return; }
      fresh.push([u, r]);
    }
    let changed = false;
    for (const [u, r] of fresh) {
      const old = await cache.match(u);
      if (!old) changed = true;
      else {
        const [a, b] = await Promise.all([old.clone().arrayBuffer(), r.clone().arrayBuffer()]);
        if (a.byteLength !== b.byteLength || new Uint8Array(a).some((v, i) => v !== new Uint8Array(b)[i])) changed = true;
      }
    }
    for (const [u, r] of fresh) await cache.put(u, r);
    if (changed) {
      const wins = await self.clients.matchAll({ type: 'window' });
      wins.forEach((w) => w.postMessage({ type: 'shell-updated' }));
    }
  } catch (e) { lastRefresh = 0; }
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

const OFFLINE_HTML = '<!doctype html><html lang="pt-BR"><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Sem internet</title><body style="margin:0;min-height:100vh;display:grid;place-items:center;' +
  'background:#eaeeff;color:#1b2559;font-family:system-ui,sans-serif;text-align:center;padding:24px">' +
  '<div><div style="font-size:3rem">🧩</div><h1 style="margin:.4em 0">Sem internet</h1>' +
  '<p>O quebra-cabeça a dois precisa de internet para conectar vocês.<br>Conecte-se e abra de novo.</p>' +
  '<button onclick="location.reload()" style="font:inherit;font-weight:800;padding:14px 28px;border:0;' +
  'border-radius:999px;background:#ffcf33;color:#1b2559">Tentar de novo</button></div></body></html>';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const p = url.pathname;
  if ((p.startsWith('/socket.io') && p !== '/socket.io/socket.io.js') || p.startsWith('/api') || p === '/health' || p === '/diagnostico' || p.startsWith('/.well-known')) return;  // sempre rede

  // imagens: usa a guardada e atualiza em segundo plano
  if (p.startsWith('/imagens/') || p.startsWith('/biblioteca/') || p.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
    })());
    return;
  }

  // abrir o aplicativo: a tela vem do celular NA HORA (o servidor só atualiza por trás)
  if (req.mode === 'navigate' && (p === '/' || p === '/index.html')) {
    event.waitUntil(refreshShell());
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match('/');
      if (hit) return hit;
      try { const res = await fetch(req); if (res && res.ok && !url.search) cache.put('/', res.clone()); return res; }
      catch (e) { return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }); }
    })());
    return;
  }

  // scripts, estilos e manifesto do jogo: também da cópia do celular
  if (SHELL_SET.has(p)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(p);
      if (hit) return hit;
      try { const res = await fetch(req); if (res && res.ok) cache.put(p, res.clone()); return res; } catch (e) { return Response.error(); }
    })());
    return;
  }

  // o resto: rede primeiro; se cair a internet, usa o que foi guardado
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req);
      if (hit) return hit;
      if (req.mode === 'navigate') return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      return Response.error();
    }
  })());
});

/* ---------- Avisos com o aplicativo fechado ---------- */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Quebra-Cabeça a Dois', body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    // se a pessoa já está olhando o jogo, não precisa de aviso
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(data.title || 'Quebra-Cabeça a Dois', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/favicon-48.png',
      tag: data.tag || 'quebra-cabeca',
      renotify: true,
      data: { url: data.url || '/' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); return; }     // o jogo já está aberto: só traz para a frente
    }
    if (self.clients.openWindow) await self.clients.openWindow(url);
  })());
});
