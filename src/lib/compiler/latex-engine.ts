import { base } from '$app/paths';
import { patchBiblatexFiles } from './bibliography';
import { setCompileBusy, warmOfflineCache } from './offline-cache';

let engine: any = null;
let loadPromise: Promise<void> | null = null;

// texlive files are resolved on demand through the service worker
// (persistent cache -> bundled subset -> remote mirror). when no service
// worker controls the page, we fall back to preloading the bundled subset.
let onDemandAvailable = false;
let fallbackLoaded = false;

// directories already created in the engine's MEMFS (persist across compiles)
const createdDirs = new Set<string>();

function looksLikeHtml(first100: string): boolean {
  const l = first100.toLowerCase();
  return l.includes('<!doctype') || l.includes('<html');
}

async function loadManifest(path: string): Promise<string[]> {
  try {
    const resp = await fetch(path);
    if (!resp.ok) return [];
    const text = await resp.text();
    return text.split('\n').map(l => l.trim()).filter(Boolean);
  } catch { return []; }
}

async function fetchTextFile(name: string): Promise<string | null> {
  const resp = await fetch(`${base}/texlive/cache/${name}`);
  if (!resp.ok) return null;
  const text = await resp.text();
  if (looksLikeHtml(text.slice(0, 100))) return null;
  return text;
}

async function fetchBinaryFile(name: string): Promise<ArrayBuffer | null> {
  const resp = await fetch(`${base}/texlive/cache/${name}`);
  if (!resp.ok) return null;
  const buf = await resp.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(100, buf.byteLength)));
  if (looksLikeHtml(head)) return null;
  return buf;
}

// old behavior for browsers without service worker support: load the whole
// bundled subset into MEMFS before the first compile
async function preloadFallback(eng: any): Promise<void> {
  if (fallbackLoaded) return;

  const [textNames, binNames] = await Promise.all([
    loadManifest(`${base}/texlive/cache-manifest-text.txt`),
    loadManifest(`${base}/texlive/cache-manifest-binary.txt`)
  ]);

  const tasks: (() => Promise<void>)[] = [
    ...textNames.map(name => async () => {
      const content = await fetchTextFile(name).catch(() => null);
      if (content) eng.writeMemFSFile(`/tex/${name}`, content);
    }),
    ...binNames.map(name => async () => {
      const buf = await fetchBinaryFile(name).catch(() => null);
      if (buf) eng.writeBinaryMemFSFile(`/tex/${name}`, buf);
    })
  ];

  // batch size 50 to avoid ERR_INSUFFICIENT_RESOURCES
  for (let i = 0; i < tasks.length; i += 50) {
    await Promise.allSettled(tasks.slice(i, i + 50).map(fn => fn()));
  }

  fallbackLoaded = true;
}

// the engine worker inherits the page's service worker at creation time,
// so this must resolve before the worker is spawned
async function serviceWorkerActive(timeoutMs = 4000): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  if (navigator.serviceWorker.controller) return true;
  try {
    const reg = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>(resolve => setTimeout(() => resolve(null), timeoutMs))
    ]);
    if (!reg) return false;
    if (navigator.serviceWorker.controller) return true;
    // active registration but page not controlled: first visit, or a hard
    // reload which deliberately bypasses the service worker. ask it to
    // claim this page, otherwise every compile falls back to the slow
    // full-preload path
    reg.active?.postMessage({ type: 'claim' });
    await Promise.race([
      new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })),
      new Promise<void>(resolve => setTimeout(resolve, timeoutMs))
    ]);
    return !!navigator.serviceWorker.controller;
  } catch { return false; }
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function initEngine(): Promise<void> {
  onDemandAvailable = await serviceWorkerActive();

  // drop the old preload cache, files are cached per-request now
  try { indexedDB.deleteDatabase('texbrain-texlive'); } catch { /* non-critical */ }

  await loadScript(`${base}/swiftlatex/PdfTeXEngine.js`);
  const PdfTeXEngine = (globalThis as any).PdfTeXEngine;
  if (!PdfTeXEngine) throw new Error('PdfTeXEngine not found after loading script');
  engine = new PdfTeXEngine();
  await engine.loadEngine();
  engine.setTexliveEndpoint(`${base}/texlive/`);
  createdDirs.clear();
  fallbackLoaded = false;
}

export async function getEngine(): Promise<any> {
  if (engine?.isReady()) return engine;
  loadPromise = initEngine();
  await loadPromise;
  if (!engine?.isReady()) {
    loadPromise = null;
    throw new Error('Engine failed to initialize');
  }
  return engine;
}

export async function warmup(): Promise<void> {
  const eng = await getEngine();
  if (!onDemandAvailable) await preloadFallback(eng);
}

export interface CompileResult {
  pdf: Uint8Array | undefined;
  status: number;
  log: string;
}

export async function compileLaTeX(
  mainFile: string,
  files: Map<string, string>,
  binaryFiles?: Map<string, ArrayBuffer>
): Promise<CompileResult> {
  const eng = await getEngine();
  if (!onDemandAvailable) await preloadFallback(eng);

  setCompileBusy(true);
  try {
    const patchedFiles = patchBiblatexFiles(files);

    const allPaths = [...patchedFiles.keys(), ...(binaryFiles?.keys() || [])];
    for (const path of allPaths) {
      const parts = path.split('/');
      for (let i = 1; i < parts.length; i++) {
        const dir = parts.slice(0, i).join('/');
        if (!createdDirs.has(dir)) {
          eng.makeMemFSFolder(dir);
          createdDirs.add(dir);
        }
      }
    }

    for (const [path, content] of patchedFiles) {
      eng.writeMemFSFile(path, content);
    }

    if (binaryFiles) {
      for (const [path, data] of binaryFiles) {
        eng.writeBinaryMemFSFile(path, data);
      }
    }

    eng.setEngineMainFile(mainFile);
    const firstPass = await eng.compileLaTeX();

    if (firstPass.status !== 0) {
      return {
        pdf: firstPass.pdf,
        status: firstPass.status,
        log: firstPass.log
      };
    }

    // aux/toc files survive between compiles, so a second pass is only
    // needed when latex explicitly asks for one
    const needsRerun = /rerun|No file [^\s]+\.(aux|toc|lof|lot)/i.test(firstPass.log || '');
    const result = needsRerun ? await eng.compileLaTeX() : firstPass;

    if (result.status === 0) warmOfflineCache();

    return {
      pdf: result.pdf,
      status: result.status,
      log: result.log
    };
  } finally {
    setCompileBusy(false);
  }
}
