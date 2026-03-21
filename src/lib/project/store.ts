import { writable, derived, get } from 'svelte/store';
import type { FileTab, TreeEntry } from './types';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const files = writable<FileTab[]>([]);
export const activeFileId = writable<string | null>(null);

export const projectTree = writable<TreeEntry[]>([]);
export const projectName = writable<string>('');
export const projectHandle = writable<FileSystemDirectoryHandle | null>(null);

export const entryPoint = writable<string | null>(null);
export const pendingTexFiles = writable<string[]>([]);

export const activeFile = derived([files, activeFileId], ([$files, $activeFileId]) => {
  return $files.find((f) => f.id === $activeFileId) ?? null;
});

export const hasUnsavedFiles = derived(files, ($files) => {
  return $files.some((f) => f.dirty);
});

export function openFileTab(
  name: string,
  content: string,
  handle: FileSystemFileHandle | null = null,
  path?: string
): string {
  if (path) {
    const existing = get(files).find((f) => f.path === path);
    if (existing) {
      activeFileId.set(existing.id);
      return existing.id;
    }
  }

  const id = uid();
  const tab: FileTab = {
    id,
    name,
    path: path || name,
    content,
    originalContent: content,
    dirty: false,
    handle
  };
  files.update((f) => [...f, tab]);
  activeFileId.set(id);
  return id;
}

export function updateFileContent(id: string, content: string) {
  files.update((f) =>
    f.map((file) =>
      file.id === id ? { ...file, content, dirty: content !== file.originalContent } : file
    )
  );
}

export function markFileSaved(id: string, newContent?: string) {
  files.update((f) =>
    f.map((file) => {
      if (file.id !== id) return file;
      const content = newContent ?? file.content;
      return { ...file, content, originalContent: content, dirty: false };
    })
  );
}

export function closeFileTab(id: string) {
  const $files = get(files);
  const $activeFileId = get(activeFileId);
  const idx = $files.findIndex((f) => f.id === id);
  if (idx === -1) return;

  const newFiles = $files.filter((f) => f.id !== id);
  files.set(newFiles);

  if ($activeFileId === id) {
    if (newFiles.length === 0) {
      activeFileId.set(null);
    } else {
      const newIdx = Math.min(idx, newFiles.length - 1);
      activeFileId.set(newFiles[newIdx].id);
    }
  }
}

export function setActiveTab(id: string) {
  activeFileId.set(id);
}
