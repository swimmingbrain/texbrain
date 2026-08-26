let root: FileSystemDirectoryHandle | null = null;

// the origin private file system: a directory that lives inside the browser
// but hands out the same handle types as a real folder
export async function getVirtualRoot(): Promise<FileSystemDirectoryHandle> {
  if (!root) {
    root = await navigator.storage.getDirectory();
  }
  return root;
}

// whole projects can live there when the real file system is out of reach
// (firefox, safari). writing needs createWritable on file handles, which not
// every browser exposes on the main thread
export function supportsVirtualProjects(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.storage?.getDirectory === 'function'
    && typeof FileSystemFileHandle !== 'undefined'
    && 'createWritable' in FileSystemFileHandle.prototype;
}

export async function writeVirtualFile(path: string, content: string): Promise<void> {
  try {
    const dir = await getVirtualRoot();
    const fileHandle = await dir.getFileHandle(path, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  } catch {
    // opfs not supported
  }
}

export async function readVirtualFile(path: string): Promise<string | null> {
  try {
    const dir = await getVirtualRoot();
    const fileHandle = await dir.getFileHandle(path);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function listVirtualFiles(): Promise<string[]> {
  try {
    const dir = await getVirtualRoot();
    const names: string[] = [];
    for await (const entry of (dir as any).values()) {
      names.push(entry.name);
    }
    return names;
  } catch {
    return [];
  }
}

export async function deleteVirtualFile(path: string): Promise<void> {
  try {
    const dir = await getVirtualRoot();
    await dir.removeEntry(path);
  } catch {}
}
