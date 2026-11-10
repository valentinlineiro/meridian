// App-shell service worker. It stores the Angular index and the hashed bundle files, so an installed app opens offline.
// It NEVER stores /api/* (private data), the login page, or a redirected response (an expired session answers with the login page).
const CACHE = 'meridian-shell';
const SHELL = '/'; // the index: the same document for every client route
const HASHED = /^\/[a-z]+-[\w-]{8}\.(?:js|css)$/i; // Angular's content-hashed files: immutable, safe to serve from cache

// One build at a time: a new index (new main-*.js) drops the previous build's files, so deploys do not pile up.
async function rememberShell(res) {
  const build = (await res.clone().text()).match(/main-[\w-]+\.js/)?.[0] ?? '';
  const old = await (await caches.open(CACHE)).match('/__build');
  if (old && (await old.text()) !== build) await caches.delete(CACHE);
  const cache = await caches.open(CACHE);
  await cache.put(SHELL, res);
  await cache.put('/__build', new Response(build));
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    if (url.pathname === '/login') return;
    e.respondWith(
      fetch(req).then(
        (res) => { if (res.ok && !res.redirected) e.waitUntil(rememberShell(res.clone())); return res; },
        async () => (await (await caches.open(CACHE)).match(SHELL)) ?? Response.error(),
      ),
    );
  } else if (HASHED.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone());
      return res;
    }));
  }
});
