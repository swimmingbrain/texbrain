let engine: any = null;
let loadPromise: Promise<void> | null = null;
let texliveLoaded = false;

// directories already created in the engine's MEMFS (persist across compiles)
const createdDirs = new Set<string>();

async function loadManifest(path: string): Promise<string[]> {
  try {
    const resp = await fetch(path);
    if (!resp.ok) return [];
    const text = await resp.text();
    return text.split('\n').map(l => l.trim()).filter(Boolean);
  } catch { return []; }
}

function looksLikeHtml(first100: string): boolean {
  const l = first100.toLowerCase();
  return l.includes('<!doctype') || l.includes('<html');
}

async function loadTextFile(eng: any, name: string): Promise<void> {
  const resp = await fetch(`/texlive/cache/${name}`);
  if (!resp.ok) return;
  const text = await resp.text();
  if (looksLikeHtml(text.slice(0, 100))) return;
  eng.writeMemFSFile(`/tex/${name}`, text);
}

async function loadBinaryFile(eng: any, name: string): Promise<void> {
  const resp = await fetch(`/texlive/cache/${name}`);
  if (!resp.ok) return;
  const buf = await resp.arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(100, buf.byteLength)));
  if (looksLikeHtml(head)) return;
  eng.writeBinaryMemFSFile(`/tex/${name}`, buf);
}

async function loadBatch(tasks: (() => Promise<void>)[], batchSize: number): Promise<void> {
  for (let i = 0; i < tasks.length; i += batchSize) {
    await Promise.allSettled(tasks.slice(i, i + batchSize).map(fn => fn()));
  }
}

async function preloadTexliveCache(eng: any): Promise<void> {
  if (texliveLoaded) return;

  const [textFiles, binFiles] = await Promise.all([
    loadManifest('/texlive/cache-manifest-text.txt'),
    loadManifest('/texlive/cache-manifest-binary.txt')
  ]);

  // batch size 50 to avoid ERR_INSUFFICIENT_RESOURCES
  const tasks: (() => Promise<void>)[] = [
    ...textFiles.map(name => () => loadTextFile(eng, name).catch(() => {})),
    ...binFiles.map(name => () => loadBinaryFile(eng, name).catch(() => {}))
  ];

  await loadBatch(tasks, 50);
  texliveLoaded = true;
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
  await loadScript('/swiftlatex/PdfTeXEngine.js');
  const PdfTeXEngine = (globalThis as any).PdfTeXEngine;
  if (!PdfTeXEngine) throw new Error('PdfTeXEngine not found after loading script');
  engine = new PdfTeXEngine();
  await engine.loadEngine();
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

// eagerly load engine + texlive cache so first compile is fast
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
