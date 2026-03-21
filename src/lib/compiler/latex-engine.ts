import { base } from '$app/paths';

let engine: any = null;
let loadPromise: Promise<void> | null = null;
let coreLoaded = false;
let restLoaded = false;
let restLoadingPromise: Promise<void> | null = null;

const IDB_NAME = 'texbrain-texlive';
const IDB_STORE = 'cache';
const IDB_VERSION = 1;

const createdDirs = new Set<string>();

interface CacheBundle {
  text: Record<string, string>;
  binary: Record<string, string>;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<CacheBundle | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: CacheBundle): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf.buffer;
}

function writeBundleToEngine(eng: any, bundle: CacheBundle): void {
  for (const [name, content] of Object.entries(bundle.text)) {
    eng.writeMemFSFile(`/tex/${name}`, content);
  }
  for (const [name, b64] of Object.entries(bundle.binary)) {
    eng.writeBinaryMemFSFile(`/tex/${name}`, base64ToArrayBuffer(b64));
  }
}

async function fetchBundle(url: string, idbKey: string): Promise<CacheBundle> {
  try {
    const db = await openIdb();
    const cached = await idbGet(db, idbKey);
    if (cached) {
      db.close();
      return cached;
    }
    db.close();
  } catch { /* fall through to network */ }

  const resp = await fetch(url);
  const bundle: CacheBundle = await resp.json();

  try {
    const db = await openIdb();
    await idbPut(db, idbKey, bundle);
    db.close();
  } catch { /* non-critical */ }

  return bundle;
}

async function loadCore(eng: any): Promise<void> {
  if (coreLoaded) return;
  const bundle = await fetchBundle(`${base}/texlive/core-bundle.json`, 'core');
  writeBundleToEngine(eng, bundle);
  coreLoaded = true;
}

async function loadRest(eng: any): Promise<void> {
  if (restLoaded) return;
  const bundle = await fetchBundle(`${base}/texlive/rest-bundle.json`, 'rest');
  writeBundleToEngine(eng, bundle);
  restLoaded = true;
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
  await loadScript(`${base}/swiftlatex/PdfTeXEngine.js`);
  const PdfTeXEngine = (globalThis as any).PdfTeXEngine;
  if (!PdfTeXEngine) throw new Error('PdfTeXEngine not found after loading script');
  engine = new PdfTeXEngine();
  await engine.loadEngine();
  engine.setTexliveEndpoint(`${base}/texlive/`);
}

export async function getEngine(): Promise<any> {
  if (engine?.isReady()) return engine;
  if (!loadPromise) {
    loadPromise = initEngine();
  }
  await loadPromise;
  if (!engine?.isReady()) {
    loadPromise = null;
    throw new Error('Engine failed to initialize');
  }
  return engine;
}

export async function warmup(): Promise<void> {
  const eng = await getEngine();
  await loadCore(eng);

  // start loading the rest in the background
  if (!restLoadingPromise) {
    restLoadingPromise = loadRest(eng).catch(() => {});
  }
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
  await loadCore(eng);

  // wait for the rest if still loading, so all packages are available
  if (restLoadingPromise) await restLoadingPromise;

  const allPaths = [...files.keys(), ...(binaryFiles?.keys() || [])];
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

  for (const [path, content] of files) {
    eng.writeMemFSFile(path, content);
  }

  if (binaryFiles) {
    for (const [path, data] of binaryFiles) {
      eng.writeBinaryMemFSFile(path, data);
    }
  }

  eng.setEngineMainFile(mainFile);
  const result = await eng.compileLaTeX();

  return {
    pdf: result.pdf,
    status: result.status,
    log: result.log
  };
}
