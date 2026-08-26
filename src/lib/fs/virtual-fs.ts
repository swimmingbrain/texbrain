let root: FileSystemDirectoryHandle | null = null;

// the origin private file system: a directory that lives inside the browser
// but hands out the same handle types as a real folder
export async function getVirtualRoot(): Promise<FileSystemDirectoryHandle> {
  if (!root) {
    root = await navigator.storage.getDirectory();
  }
  return root;
}

// the projects that live inside the browser, newest first is not known,
// so alphabetical
export async function listVirtualProjects(): Promise<string[]> {
  try {
    const root = await getVirtualRoot();
    const names: string[] = [];
    for await (const entry of root.values()) {
      if (entry.kind === 'directory') names.push(entry.name);
    }
    return names.sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
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
