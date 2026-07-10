const CACHE_NAME = 'texbrain-v1';
const TEXLIVE_CACHE = 'texbrain-texlive-v1';
const CONFIG_CACHE = 'texbrain-config-v1';
const CONFIG_URL = '/__texbrain-config';

// texlive 2020 texmf-dist mirror on jsdelivr, pinned to a commit. same era
// as the engine's format and the bundled subset, so versions stay coherent.
// addressed by path, so lookups go through its ls-R index (fetched lazily,
// cached).
const STATIC_MIRROR = 'https://cdn.jsdelivr.net/gh/SachaNevsky/latexdiff-texmf-dist@aca46fc00975feebf98e038976790805c3e932df';
const LSR_URL = STATIC_MIRROR + '/ls-R';

// swiftlatex-compatible texlive server, used when the static mirror can't
// help (pk fonts, odd lookups). can be overridden or disabled ('') via the
// texliveMirror preference.
const DEFAULT_MIRROR = 'https://texlive.texlyre.org/';

const STATIC_ASSETS = [
  '/',
  '/editor',
  '/favicon.svg',
  '/manifest.json'
];

// extensions kpathsea probes when a request comes without one,
// same order as the engine uses for its local lookups
const TEX_EXTENSIONS = ['', '.tfm', '.pfb', '.vf', '.sty', '.cls', '.fd', '.def', '.cfg', '.clo', '.tex', '.ltx', '.map', '.enc', '.dfu', '.ldf'];

let mirrorOverride = null; // null = not set, '' = disabled, string = url
let manifestPromise = null;
let lsrPromise = null;

// cache static assets on install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// clean old caches on activate
self.addEventListener('activate', (event) => {
  const keep = [CACHE_NAME, TEXLIVE_CACHE, CONFIG_CACHE];
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => !keep.includes(name)).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// receive config from the app (persisted so it survives worker restarts)
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'texlive-config') return;
  mirrorOverride = typeof data.mirror === 'string' ? data.mirror : null;
  event.waitUntil(
    caches.open(CONFIG_CACHE).then((cache) => {
      return cache.put(CONFIG_URL, new Response(JSON.stringify({ mirror: mirrorOverride })));
    })
  );
});

async function getMirror() {
  if (mirrorOverride !== null) return mirrorOverride;
  try {
    const cache = await caches.open(CONFIG_CACHE);
    const stored = await cache.match(CONFIG_URL);
    if (stored) {
      const cfg = await stored.json();
      if (typeof cfg.mirror === 'string') {
        mirrorOverride = cfg.mirror;
        return mirrorOverride;
      }
    }
  } catch { /* fall through */ }
  return DEFAULT_MIRROR;
}

function looksLikeHtml(buf) {
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(100, buf.byteLength))).toLowerCase();
  return head.includes('<!doctype') || head.includes('<html');
}

function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// set of filenames available in the bundled subset under /texlive/cache/
function loadManifest() {
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    const names = new Set();
    for (const file of ['/texlive/cache-manifest-text.txt', '/texlive/cache-manifest-binary.txt']) {
      try {
        const resp = (await caches.match(file)) || (await fetch(file));
        if (!resp || !resp.ok) continue;
        const text = await resp.text();
        for (const line of text.split('\n')) {
          const name = line.trim();
          if (name) names.add(name);
        }
      } catch { /* offline and not cached, skip */ }
    }
    if (names.size === 0) manifestPromise = null; // retry next time
    return names;
  })();
  return manifestPromise;
}

async function resolveBundled(name) {
  const names = await loadManifest();
  for (const ext of TEX_EXTENSIONS) {
    if (names.has(name + ext)) return name + ext;
  }
  return null;
}

// filename -> directory map built from the mirror's ls-R index
function loadLsr() {
  if (lsrPromise) return lsrPromise;
  lsrPromise = (async () => {
    const map = new Map();
    try {
      const cache = await caches.open(TEXLIVE_CACHE);
      let resp = await cache.match(LSR_URL);
      if (!resp) {
        resp = await fetchWithTimeout(LSR_URL, 60000);
        if (resp.ok) await cache.put(LSR_URL, resp.clone());
      }
      if (!resp.ok) throw new Error('ls-R unavailable');
      const text = await resp.text();

      let dir = null;
      for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('%')) continue;
        if (line.endsWith(':')) {
          dir = line.slice(0, -1).replace(/^\.\/?/, '');
          // documentation and package sources are not useful for compiles
          if (dir.startsWith('doc') || dir.startsWith('source')) dir = null;
          continue;
        }
        if (dir === null || dir === '') continue;
        if (!map.has(line)) map.set(line, dir);
      }
    } catch {
      lsrPromise = null; // retry next time
    }
    return map;
  })();
  return lsrPromise;
}

async function resolveStatic(name) {
  const map = await loadLsr();
  for (const ext of TEX_EXTENSIONS) {
    const dir = map.get(name + ext);
    if (dir) return { path: dir + '/' + name + ext, filename: name + ext };
  }
  return null;
}

function texliveResponse(buf, id, isPk) {
  const headers = {
    'Content-Type': 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=86400'
  };
  headers[isPk ? 'pkid' : 'fileid'] = id;
  return new Response(buf, { status: 200, headers });
}

// resolve /texlive/pdftex/<fmt>/<name> and /texlive/pdftex/pk/<dpi>/<name>:
// 1. previously fetched files (persistent cache)
// 2. bundled subset shipped with the app
// 3. static texlive mirror (jsdelivr)
// 4. swiftlatex-compatible texlive server
async function handleTexlive(request, url) {
  const cache = await caches.open(TEXLIVE_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;

  const isPk = url.pathname.includes('/pdftex/pk/');
  const name = decodeURIComponent(url.pathname.split('/').pop() || '');

  // format files exist as real static assets under /texlive/pdftex/
  if (name.endsWith('.fmt')) {
    try {
      const resp = await fetch(request);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (!looksLikeHtml(buf)) {
          await cache.put(request, texliveResponse(buf.slice(0), name, false));
          return texliveResponse(buf, name, false);
        }
      }
    } catch { /* fall through */ }
  }

  // bundled subset (pk fonts are never bundled)
  if (!isPk) {
    const resolved = await resolveBundled(name);
    if (resolved) {
      try {
        const bundledUrl = `/texlive/cache/${encodeURIComponent(resolved)}`;
        const resp = (await caches.match(bundledUrl)) || (await fetch(bundledUrl));
        if (resp && resp.ok) {
          const buf = await resp.arrayBuffer();
          if (!looksLikeHtml(buf)) {
            await cache.put(request, texliveResponse(buf.slice(0), resolved, false));
            return texliveResponse(buf, resolved, false);
          }
        }
      } catch { /* fall through */ }
    }
  }

  // static mirror, matches the texlive version of the bundled subset
  if (!isPk) {
    const resolved = await resolveStatic(name);
    if (resolved) {
      try {
        const resp = await fetchWithTimeout(encodeURI(`${STATIC_MIRROR}/${resolved.path}`), 30000);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          if (buf.byteLength > 0 && !looksLikeHtml(buf)) {
            await cache.put(request, texliveResponse(buf.slice(0), resolved.filename, false));
            return texliveResponse(buf, resolved.filename, false);
          }
        }
      } catch { /* fall through */ }
    }
  }

  // kpathsea-aware server, also generates pk fonts
  const mirror = await getMirror();
  if (mirror) {
    try {
      const remoteUrl = mirror.replace(/\/$/, '') + url.pathname.replace(/^\/texlive/, '');
      const resp = await fetchWithTimeout(remoteUrl, 30000);
      if (resp.ok) {
        const buf = await resp.arrayBuffer();
        if (buf.byteLength > 0 && !looksLikeHtml(buf)) {
          const id = resp.headers.get(isPk ? 'pkid' : 'fileid') || name;
          await cache.put(request, texliveResponse(buf.slice(0), id, isPk));
          return texliveResponse(buf, id, isPk);
        }
      }
    } catch { /* not found or offline */ }
  }

  return new Response('', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
}

// network-first with cache fallback
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/texlive/pdftex/')) {
    event.respondWith(handleTexlive(event.request, url));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // navigation requests fall back to shell
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
