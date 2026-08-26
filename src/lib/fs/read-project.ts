// reads a project folder into memory for the compiler. re-reading every
// file on each compile is wasteful, especially for images, so a copy of
// each file is kept and only replaced when its size or modification time
// changed. reusing the same objects also lets the compiler skip uploading
// unchanged files to the engine

const TEXT_EXTS = new Set([
  'tex', 'sty', 'cls', 'bib', 'bst', 'def', 'cfg', 'fd',
  'dtx', 'ins', 'ltx', 'txt', 'bbx', 'cbx', 'lbx'
]);
const BINARY_EXTS = new Set([
  'png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg', 'gif', 'bmp',
  'tfm', 'pfb', 'vf', 'map', 'enc', 'otf', 'ttf'
]);
const SKIPPED_DIRS = new Set(['node_modules', '__pycache__']);

interface Cached {
  lastModified: number;
  size: number;
  text?: string;
  buffer?: ArrayBuffer;
}

let cache = new Map<string, Cached>();
let cacheHandle: FileSystemDirectoryHandle | null = null;

export async function readProjectFiles(
  handle: FileSystemDirectoryHandle,
  textFiles: Map<string, string>,
  binaryFiles?: Map<string, ArrayBuffer>
): Promise<void> {
  if (handle !== cacheHandle) {
    cache = new Map();
    cacheHandle = handle;
  }
  await readDir(handle, '', textFiles, binaryFiles);
}

async function readDir(
  dirHandle: FileSystemDirectoryHandle,
  prefix: string,
  textFiles: Map<string, string>,
  binaryFiles?: Map<string, ArrayBuffer>
): Promise<void> {
  for await (const entry of dirHandle.values()) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') {
      const ext = entry.name.split('.').pop()?.toLowerCase() || '';
      if (TEXT_EXTS.has(ext)) {
        try {
          const file = await entry.getFile();
          const cached = cache.get(path);
          if (cached && cached.lastModified === file.lastModified && cached.size === file.size && cached.text !== undefined) {
            textFiles.set(path, cached.text);
          } else {
            const content = await file.text();
            cache.set(path, { lastModified: file.lastModified, size: file.size, text: content });
            textFiles.set(path, content);
          }
        } catch { /* unreadable, skip */ }
      } else if (binaryFiles && BINARY_EXTS.has(ext)) {
        try {
          const file = await entry.getFile();
          const cached = cache.get(path);
          if (cached && cached.lastModified === file.lastModified && cached.size === file.size && cached.buffer !== undefined) {
            binaryFiles.set(path, cached.buffer);
          } else {
            const data = await file.arrayBuffer();
            cache.set(path, { lastModified: file.lastModified, size: file.size, buffer: data });
            binaryFiles.set(path, data);
          }
        } catch { /* unreadable, skip */ }
      }
    } else if (!entry.name.startsWith('.') && !SKIPPED_DIRS.has(entry.name)) {
      await readDir(entry, path, textFiles, binaryFiles);
    }
  }
}
