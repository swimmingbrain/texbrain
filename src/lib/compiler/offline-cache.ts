import { base } from '$app/paths';

// after the first successful compile, slowly pull the bundled texlive subset
// through the service worker so the base package set works offline. runs once
// per browser, and only while the editor is idle so it never slows compiles
// down (the cache writes compete with compile i/o otherwise).

const FLAG = 'texbrain-texlive-warmed';
// matches BUNDLE_VERSION in sw.js: when the bundle changes, the warm set
// is evicted and needs one fresh run
const WARMED_VERSION = '4';
const CONCURRENCY = 2;
const PAUSE_MS = 50;
const IDLE_MS = 15000;

let started = false;
let compileBusy = false;
let lastCompileEnd = 0;

// latex-engine reports compile activity so warming can stay out of the way
export function setCompileBusy(busy: boolean): void {
  compileBusy = busy;
  if (!busy) lastCompileEnd = Date.now();
}

export function warmOfflineCache(): void {
  if (started) return;
  started = true;

  if (import.meta.env.DEV) return; // pointless against the dev server
  if (typeof navigator === 'undefined') return;
  if (!navigator.serviceWorker?.controller) return; // nothing persists without the sw
  if ((navigator as any).connection?.saveData) return;
  try {
    if (localStorage.getItem(FLAG) === WARMED_VERSION) return;
  } catch { /* storage blocked, warm anyway */ }

  lastCompileEnd = Date.now();
  void run();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForIdle(): Promise<void> {
  while (compileBusy || Date.now() - lastCompileEnd < IDLE_MS) {
    await sleep(2000);
  }
}

async function run(): Promise<void> {
  await waitForIdle();

  const names: string[] = [];
  for (const manifest of ['cache-manifest-text.txt', 'cache-manifest-binary.txt']) {
    try {
      const resp = await fetch(`${base}/texlive/${manifest}`);
      if (!resp.ok) return;
      const text = await resp.text();
      for (const line of text.split('\n')) {
        const name = line.trim();
        if (name) names.push(name);
      }
    } catch { return; }
  }
  if (names.length === 0) return;

  let failed = 0;
  const queue = [...names];

  const worker = async () => {
    while (queue.length > 0) {
      await waitForIdle();
      const name = queue.shift()!;
      try {
        const resp = await fetch(`${base}/texlive/cache/${encodeURIComponent(name)}`);
        if (resp.ok) {
          await resp.arrayBuffer();
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
      await sleep(PAUSE_MS);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // only mark as done when the run wasn't cut off (e.g. going offline midway)
  if (failed < names.length / 100) {
    try { localStorage.setItem(FLAG, WARMED_VERSION); } catch { /* non-critical */ }
  }
}
