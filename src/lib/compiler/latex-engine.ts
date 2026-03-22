import { base } from '$app/paths';

let engine: any = null;
let loadPromise: Promise<void> | null = null;
let texliveLoaded = false;

const IDB_NAME = 'texbrain-texlive';
const IDB_STORE = 'cache';
const IDB_VERSION = 1;

// directories already created in the engine's MEMFS (persist across compiles)
const createdDirs = new Set<string>();

interface TexliveCache {
  textFiles: Record<string, string>;
  binaryFiles: Record<string, string>;
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains(IDB_STORE)) db.deleteObjectStore(IDB_STORE);
      db.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db: IDBDatabase, key: string): Promise<TexliveCache | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, key: string, value: TexliveCache): Promise<void> {
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

async function fetchBinaryFile(name: string): Promise<string | null> {
  const resp = await fetch(`${base}/texlive/cache/${name}`);
  if (!resp.ok) return null;
  const buf = await resp.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(100, buf.byteLength)));
  if (looksLikeHtml(head)) return null;
  // store as base64 for IDB serialization
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

async function fetchAllFiles(textNames: string[], binNames: string[]): Promise<TexliveCache> {
  const cache: TexliveCache = { textFiles: {}, binaryFiles: {} };

  const tasks: (() => Promise<void>)[] = [
    ...textNames.map(name => async () => {
      const content = await fetchTextFile(name).catch(() => null);
      if (content) cache.textFiles[name] = content;
    }),
    ...binNames.map(name => async () => {
      const b64 = await fetchBinaryFile(name).catch(() => null);
      if (b64) cache.binaryFiles[name] = b64;
    })
  ];

  // batch size 50 to avoid ERR_INSUFFICIENT_RESOURCES
  for (let i = 0; i < tasks.length; i += 50) {
    await Promise.allSettled(tasks.slice(i, i + 50).map(fn => fn()));
  }

  return cache;
}

function writeToEngine(eng: any, cache: TexliveCache): void {
  for (const [name, content] of Object.entries(cache.textFiles)) {
    eng.writeMemFSFile(`/tex/${name}`, content);
  }
  for (const [name, b64] of Object.entries(cache.binaryFiles)) {
    eng.writeBinaryMemFSFile(`/tex/${name}`, base64ToArrayBuffer(b64));
  }
}

async function preloadTexliveCache(eng: any): Promise<void> {
  if (texliveLoaded) return;

  // try loading from IndexedDB first
  try {
    const db = await openIdb();
    const cached = await idbGet(db, 'texlive');
    if (cached) {
      writeToEngine(eng, cached);
      db.close();
      texliveLoaded = true;
      return;
    }
    db.close();
  } catch { /* fall through to network */ }

  const [textNames, binNames] = await Promise.all([
    loadManifest(`${base}/texlive/cache-manifest-text.txt`),
    loadManifest(`${base}/texlive/cache-manifest-binary.txt`)
  ]);

  const cache = await fetchAllFiles(textNames, binNames);
  writeToEngine(eng, cache);
  texliveLoaded = true;

  // persist for next visit
  try {
    const db = await openIdb();
    await idbPut(db, 'texlive', cache);
    db.close();
  } catch { /* non-critical */ }
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
  await preloadTexliveCache(eng);
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
  await preloadTexliveCache(eng);

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
