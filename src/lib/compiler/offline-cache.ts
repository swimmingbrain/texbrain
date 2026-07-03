import { base } from '$app/paths';

// after the first successful compile, slowly pull the bundled texlive subset
// through the service worker so the base package set works offline. runs once
// per browser, throttled so it never competes with the editor.

const FLAG = 'texbrain-texlive-warmed';
const CONCURRENCY = 4;
const PAUSE_MS = 25;

let started = false;

export function warmOfflineCache(): void {
  if (started) return;
  started = true;

  if (typeof navigator === 'undefined') return;
  if (!navigator.serviceWorker?.controller) return; // nothing persists without the sw
  if ((navigator as any).connection?.saveData) return;
  try {
    if (localStorage.getItem(FLAG)) return;
  } catch { /* storage blocked, warm anyway */ }

  void run();
}

async function run(): Promise<void> {
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
      await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // only mark as done when the run wasn't cut off (e.g. going offline midway)
  if (failed < names.length / 100) {
    try { localStorage.setItem(FLAG, '1'); } catch { /* non-critical */ }
  }
}
