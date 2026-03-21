import { base } from '$app/paths';

let engine: any = null;
let loadPromise: Promise<void> | null = null;
let coreLoaded = false;

const IDB_NAME = 'texbrain-texlive';
const IDB_STORE = 'cache';
const IDB_VERSION = 1;

// directories already created in the engine's MEMFS (persist across compiles)
const createdDirs = new Set<string>();

interface CoreBundle {
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

function idbGet(db: IDBDatabase, key: string): Promise<CoreBundle | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: CoreBundle): Promise<void> {
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

async function fetchCoreBundle(): Promise<CoreBundle> {
  // try IndexedDB first
  try {
    const db = await openIdb();
    const cached = await idbGet(db, 'core');
    if (cached) {
      db.close();
      return cached;
    }
    db.close();
  } catch { /* fall through to network */ }

  const resp = await fetch(`${base}/texlive/core-bundle.json`);
  const bundle: CoreBundle = await resp.json();

  // persist for next visit
  try {
    const db = await openIdb();
    await idbPut(db, 'core', bundle);
    db.close();
  } catch { /* non-critical */ }

  return bundle;
}

async function loadCoreBundle(eng: any): Promise<void> {
  if (coreLoaded) return;

  const bundle = await fetchCoreBundle();

  for (const [name, content] of Object.entries(bundle.text)) {
    eng.writeMemFSFile(`/tex/${name}`, content);
  }

  for (const [name, b64] of Object.entries(bundle.binary)) {
    eng.writeBinaryMemFSFile(`/tex/${name}`, base64ToArrayBuffer(b64));
  }

  coreLoaded = true;
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
  await loadCoreBundle(eng);
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
  await loadCoreBundle(eng);

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
