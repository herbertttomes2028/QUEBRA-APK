/*
 * Service worker do Quebra-Cabeça a Dois.
 * - Deixa o jogo instalável (tela inicial / APK).
 * - NUNCA guarda o que é do jogo em tempo real (/socket.io, /api): isso vai sempre pela rede.
 * - Páginas, scripts e estilos: "rede primeiro" (você sempre recebe a versão mais nova;
 *   o que foi guardado só serve se a internet cair).
 * - Imagens: usa a guardada e atualiza em segundo plano.
 * - Avisos (push): mostra "fulano entrou" / "nova mensagem" quando o aplicativo está fechado.
 * O jogo em si precisa de internet: sem ela aparece um aviso simples.
 */
const CACHE = 'quebra-cabeca-v4';
const SHELL = ['/', '/style.css', '/game.js', '/conta.js', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
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
  if (p.startsWith('/socket.io') || p.startsWith('/api') || p === '/health' || p.startsWith('/.well-known')) return;  // sempre rede

  // imagens: usa a guardada e atualiza em segundo plano
  if (p.startsWith('/imagens/') || p.startsWith('/icons/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      const net = fetch(req).then((res) => { if (res && res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
      return hit || (await net) || Response.error();
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
      const hit = (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('/') : null);
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
