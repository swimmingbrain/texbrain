let root: FileSystemDirectoryHandle | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!root) {
    root = await navigator.storage.getDirectory();
  }
  return root;
}

export async function writeVirtualFile(path: string, content: string): Promise<void> {
  try {
    const dir = await getRoot();
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
    const dir = await getRoot();
    const fileHandle = await dir.getFileHandle(path);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch {
    return null;
  }
}

export async function listVirtualFiles(): Promise<string[]> {
  try {
    const dir = await getRoot();
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
    const dir = await getRoot();
    await dir.removeEntry(path);
  } catch {}
}
