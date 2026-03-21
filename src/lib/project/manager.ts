import { get } from 'svelte/store';
import { openFileTab, activeFile, markFileSaved, projectTree, projectName, projectHandle, entryPoint, pendingTexFiles, files, closeFileTab } from './store';
import { openLocalFile, saveLocalFile, saveLocalFileAs, openDirectory, readFileFromHandle } from '../fs/local-fs';
import { openFileFallback, saveFileFallback } from '../fs/fallback-fs';
import { addToast } from '../stores/app';
import { initFs as gitInitFs, cloneRepo, readAllFilesFromGit, checkAndLoadGit } from '../git/engine';
import type { TreeEntry } from './types';

function supportsFileSystemAccess(): boolean {
  return 'showOpenFilePicker' in window;
}

const DEFAULT_TEX = `\\documentclass{article}

\\title{Untitled Document}
\\author{Author}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Introduction}
Hello, world!

\\end{document}
`;

export async function handleNewProject() {
  if (!supportsFileSystemAccess()) {
    addToast('This feature requires Chrome or Edge (File System Access API).', 'error');
    return;
  }
  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    const name = prompt('Project name:', 'my-document');
    if (!name) return;

    const projectDir = await dirHandle.getDirectoryHandle(name, { create: true });
    const mainFile = await projectDir.getFileHandle('main.tex', { create: true });
    const writable = await mainFile.createWritable();
    await writable.write(DEFAULT_TEX);
    await writable.close();

    const tree = await readTreeFromHandle(projectDir);
    projectTree.set(tree);
    projectName.set(name);
    projectHandle.set(projectDir);
    entryPoint.set('main.tex');
    await handleOpenFileFromTree(mainFile, 'main.tex');
    addToast(`Created project: ${name}`, 'success', 2000);
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      addToast(`Failed to create project: ${e.message}`, 'error');
    }
  }
}

export async function cloneProject(url: string, name: string): Promise<void> {
  if (!supportsFileSystemAccess()) {
    throw new Error('This feature requires Chrome or Edge (File System Access API).');
  }

  const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  const projectDir = await dirHandle.getDirectoryHandle(name, { create: true });

  addToast('Cloning repository...', 'info', 3000);

  gitInitFs(name);
  await cloneRepo(url);

  // write cloned files to real filesystem
  const gitFiles = await readAllFilesFromGit();
  for (const [path, content] of gitFiles) {
    const parts = path.split('/');
    const fileName = parts.pop()!;
    let currentDir = projectDir;
    for (const part of parts) {
      currentDir = await currentDir.getDirectoryHandle(part, { create: true });
    }
    const fileHandle = await currentDir.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  const tree = await readTreeFromHandle(projectDir);
  projectTree.set(tree);
  projectName.set(name);
  projectHandle.set(projectDir);

  await checkAndLoadGit();

  const texPaths = collectTexPaths(tree);
  if (texPaths.length === 1) {
    entryPoint.set(texPaths[0]);
    const entry = findFileInTree(tree, texPaths[0].split('/').pop()!);
    if (entry?.handle) {
      await handleOpenFileFromTree(entry.handle, entry.path);
    }
  } else if (texPaths.length > 1) {
    pendingTexFiles.set(texPaths);
  }

  addToast(`Cloned: ${name}`, 'success', 2000);
}

export async function handleOpenFile() {
  try {
    if (supportsFileSystemAccess()) {
      const result = await openLocalFile();
      if (result) {
        openFileTab(result.name, result.content, result.handle);
      }
    } else {
      const result = await openFileFallback();
      if (result) {
        openFileTab(result.name, result.content, null);
      }
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      addToast(`Failed to open file: ${e.message}`, 'error');
    }
  }
}

export async function handleOpenDirectory() {
  if (!supportsFileSystemAccess()) {
    addToast('This feature requires Chrome or Edge (File System Access API).', 'error');
    return;
  }
  try {
    const result = await openDirectory();
    if (result) {
      projectTree.set(result.tree);
      projectName.set(result.name);
      projectHandle.set(result.dirHandle);
      addToast(`Opened project: ${result.name}`, 'success', 2000);

      const texPaths = collectTexPaths(result.tree);
      if (texPaths.length === 1) {
        entryPoint.set(texPaths[0]);
        const entry = findFileInTree(result.tree, texPaths[0].split('/').pop()!);
        if (entry?.handle) {
          await handleOpenFileFromTree(entry.handle, entry.path);
        }
      } else if (texPaths.length > 1) {
        pendingTexFiles.set(texPaths);
      }
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      addToast(`Failed to open directory: ${e.message}`, 'error');
    }
  }
}

export async function selectEntryPoint(path: string) {
  entryPoint.set(path);
  pendingTexFiles.set([]);

  const tree = get(projectTree);
  const entry = findFileByPath(tree, path);
  if (entry?.handle) {
    await handleOpenFileFromTree(entry.handle, entry.path);
  }
}

export async function handleOpenFileFromTree(handle: FileSystemFileHandle, path: string) {
  try {
    const content = await readFileFromHandle(handle);
    openFileTab(handle.name, content, handle, path);
  } catch (e: any) {
    addToast(`Failed to read file: ${e.message}`, 'error');
  }
}

export async function handleNewFileInProject(parentPath: string, parentDirHandle: FileSystemDirectoryHandle | null) {
  const name = prompt('File name:', 'new-file.tex');
  if (!name) return;

  const handle = get(projectHandle);
  const dirHandle = parentDirHandle || handle;
  if (!dirHandle) {
    addToast('No project open. Open a folder first.', 'error');
    return;
  }

  try {
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write('');
    await writable.close();

    await refreshProjectTree();

    const filePath = parentPath ? `${parentPath}/${name}` : name;
    await handleOpenFileFromTree(fileHandle, filePath);
    addToast(`Created ${name}`, 'success', 1500);
  } catch (e: any) {
    addToast(`Failed to create file: ${e.message}`, 'error');
  }
}

export async function handleDeleteFileInProject(entry: TreeEntry) {
  if (!confirm(`Delete "${entry.name}"?`)) return;

  const handle = get(projectHandle);
  if (!handle) return;

  try {
    const parts = entry.path.split('/');
    const fileName = parts.pop()!;
    let dirHandle: FileSystemDirectoryHandle = handle;
    for (const part of parts) {
      dirHandle = await dirHandle.getDirectoryHandle(part);
    }

    if (entry.type === 'directory') {
      await dirHandle.removeEntry(fileName, { recursive: true });
    } else {
      await dirHandle.removeEntry(fileName);
    }

    closeTabIfOpen(entry.path);
    await refreshProjectTree();
    addToast(`Deleted ${entry.name}`, 'success', 1500);
  } catch (e: any) {
    addToast(`Failed to delete: ${e.message}`, 'error');
  }
}

export async function handleRenameFileInProject(entry: TreeEntry) {
  const newName = prompt('New name:', entry.name);
  if (!newName || newName === entry.name) return;

  const handle = get(projectHandle);
  if (!handle) return;

  try {
    const parts = entry.path.split('/');
    const oldName = parts.pop()!;
    let dirHandle: FileSystemDirectoryHandle = handle;
    for (const part of parts) {
      dirHandle = await dirHandle.getDirectoryHandle(part);
    }

    if (entry.type === 'file') {
      const oldHandle = await dirHandle.getFileHandle(oldName);
      const file = await oldHandle.getFile();
      const content = await file.arrayBuffer();

      const newHandle = await dirHandle.getFileHandle(newName, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(content);
      await writable.close();

      await dirHandle.removeEntry(oldName);

      const newPath = parts.length > 0 ? `${parts.join('/')}/${newName}` : newName;
      const openFile = get(files).find(f => f.path === entry.path);
      if (openFile) {
        files.update(fs => fs.map(f =>
          f.id === openFile.id ? { ...f, name: newName, path: newPath, handle: newHandle } : f
        ));
      }
    }

    await refreshProjectTree();
    addToast(`Renamed to ${newName}`, 'success', 1500);
  } catch (e: any) {
    addToast(`Failed to rename: ${e.message}`, 'error');
  }
}

export async function handleSaveFile() {
  const file = get(activeFile);
  if (!file) return;

  try {
    if (file.handle) {
      await saveLocalFile(file.handle, file.content);
      markFileSaved(file.id);
      addToast('File saved', 'success', 1500);
    } else if (supportsFileSystemAccess()) {
      const handle = await saveLocalFileAs(file.content, file.name);
      if (handle) {
        markFileSaved(file.id);
        addToast('File saved', 'success', 1500);
      }
    } else {
      saveFileFallback(file.content, file.name);
      markFileSaved(file.id);
      addToast('File downloaded', 'success', 1500);
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      addToast(`Failed to save: ${e.message}`, 'error');
    }
  }
}

export async function handleSaveFileAs() {
  const file = get(activeFile);
  if (!file) return;

  try {
    if (supportsFileSystemAccess()) {
      const handle = await saveLocalFileAs(file.content, file.name);
      if (handle) {
        markFileSaved(file.id);
        addToast('File saved', 'success', 1500);
      }
    } else {
      saveFileFallback(file.content, file.name);
      markFileSaved(file.id);
      addToast('File downloaded', 'success', 1500);
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      addToast(`Failed to save: ${e.message}`, 'error');
    }
  }
}

export function handleDroppedFiles(dataTransfer: DataTransfer) {
  const items = Array.from(dataTransfer.files);
  for (const file of items) {
    if (file.name.endsWith('.tex') || file.name.endsWith('.bib') || file.name.endsWith('.sty') || file.name.endsWith('.cls') || file.name.endsWith('.txt')) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          openFileTab(file.name, reader.result, null);
        }
      };
      reader.readAsText(file);
    }
  }
}

function collectTexPaths(tree: TreeEntry[]): string[] {
  const paths: string[] = [];
  for (const entry of tree) {
    if (entry.type === 'file' && entry.name.endsWith('.tex')) {
      paths.push(entry.path);
    }
    if (entry.type === 'directory') {
      paths.push(...collectTexPaths(entry.children));
    }
  }
  return paths;
}

function findFileByPath(tree: TreeEntry[], path: string): TreeEntry | null {
  for (const entry of tree) {
    if (entry.type === 'file' && entry.path === path) return entry;
    if (entry.type === 'directory') {
      const found = findFileByPath(entry.children, path);
      if (found) return found;
    }
  }
  return null;
}

function findFileInTree(tree: TreeEntry[], name: string): TreeEntry | null {
  for (const entry of tree) {
    if (entry.type === 'file' && entry.name === name) return entry;
    if (entry.type === 'directory') {
      const found = findFileInTree(entry.children, name);
      if (found) return found;
    }
  }
  return null;
}

function closeTabIfOpen(path: string) {
  const openFile = get(files).find(f => f.path === path);
  if (openFile) {
    closeFileTab(openFile.id);
  }
}

export async function moveFileInProject(sourcePath: string, targetDirPath: string): Promise<void> {
  const handle = get(projectHandle);
  if (!handle) return;

  try {
    // resolve source parent dir + file name
    const srcParts = sourcePath.split('/');
    const fileName = srcParts.pop()!;
    let srcDir: FileSystemDirectoryHandle = handle;
    for (const part of srcParts) {
      srcDir = await srcDir.getDirectoryHandle(part);
    }

    // resolve target dir
    let destDir: FileSystemDirectoryHandle = handle;
    if (targetDirPath) {
      for (const part of targetDirPath.split('/')) {
        destDir = await destDir.getDirectoryHandle(part);
      }
    }

    const srcHandle = await srcDir.getFileHandle(fileName);
    const file = await srcHandle.getFile();
    const content = await file.arrayBuffer();

    const destHandle = await destDir.getFileHandle(fileName, { create: true });
    const writable = await destHandle.createWritable();
    await writable.write(content);
    await writable.close();

    await srcDir.removeEntry(fileName);

    const newPath = targetDirPath ? `${targetDirPath}/${fileName}` : fileName;
    files.update(fs => fs.map(f =>
      f.path === sourcePath ? { ...f, path: newPath, handle: destHandle } : f
    ));

    await refreshProjectTree();
    addToast(`Moved ${fileName}`, 'success', 1500);
  } catch (e: any) {
    addToast(`Failed to move file: ${e.message}`, 'error');
  }
}

export async function refreshProjectTree() {
  const handle = get(projectHandle);
  if (!handle) return;
  const tree = await readTreeFromHandle(handle);
  projectTree.set(tree);
}

async function readTreeFromHandle(dirHandle: FileSystemDirectoryHandle): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];
  for await (const entry of (dirHandle as any).values()) {
    const entryPath = entry.name;
    if (entry.kind === 'directory') {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const subDir = entry as FileSystemDirectoryHandle;
      const children = await readSubTree(subDir, entryPath);
      entries.push({ name: entry.name, path: entryPath, type: 'directory', children, dirHandle: subDir });
    } else {
      entries.push({ name: entry.name, path: entryPath, type: 'file', children: [], handle: entry as FileSystemFileHandle });
    }
  }
  entries.sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
  return entries;
}

async function readSubTree(dirHandle: FileSystemDirectoryHandle, basePath: string): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];
  for await (const entry of (dirHandle as any).values()) {
    const entryPath = `${basePath}/${entry.name}`;
    if (entry.kind === 'directory') {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const subDir = entry as FileSystemDirectoryHandle;
      const children = await readSubTree(subDir, entryPath);
      entries.push({ name: entry.name, path: entryPath, type: 'directory', children, dirHandle: subDir });
    } else {
      entries.push({ name: entry.name, path: entryPath, type: 'file', children: [], handle: entry as FileSystemFileHandle });
    }
  }
  entries.sort((a, b) => { if (a.type !== b.type) return a.type === 'directory' ? -1 : 1; return a.name.localeCompare(b.name); });
  return entries;
}
