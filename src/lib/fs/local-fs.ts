import type { TreeEntry } from '$lib/project/types';

export interface OpenFileResult {
  handle: FileSystemFileHandle;
  name: string;
  content: string;
}

export async function openLocalFile(): Promise<OpenFileResult | null> {
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'LaTeX Files',
        accept: { 'text/x-latex': ['.tex', '.bib', '.sty', '.cls', '.txt'] }
      }
    ],
    multiple: false
  });

  const file = await handle.getFile();
  const content = await file.text();
  return { handle, name: file.name, content };
}

export async function openDirectory(): Promise<{
  dirHandle: FileSystemDirectoryHandle;
  tree: TreeEntry[];
  name: string;
} | null> {
  const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  const tree = await readDirectoryTree(dirHandle, '');
  return { dirHandle, tree, name: dirHandle.name };
}

async function readDirectoryTree(
  dirHandle: FileSystemDirectoryHandle,
  basePath: string
): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];

  for await (const entry of dirHandle.values()) {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

    if (entry.kind === 'directory') {
      const subDir = entry as FileSystemDirectoryHandle;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const children = await readDirectoryTree(subDir, entryPath);
      entries.push({
        name: entry.name,
        path: entryPath,
        type: 'directory',
        children,
        dirHandle: subDir
      });
    } else {
      const fileHandle = entry as FileSystemFileHandle;
      entries.push({
        name: entry.name,
        path: entryPath,
        type: 'file',
        children: [],
        handle: fileHandle
      });
    }
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return entries;
}

export async function readFileFromHandle(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return file.text();
}

export async function saveLocalFile(handle: FileSystemFileHandle, content: string): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export async function saveLocalFileAs(content: string, suggestedName: string): Promise<FileSystemFileHandle | null> {
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [
      {
        description: 'LaTeX Files',
        accept: { 'text/x-latex': ['.tex'] }
      }
    ]
  });

  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
  return handle;
}
