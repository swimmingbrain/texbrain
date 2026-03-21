export interface FileTab {
  id: string;
  name: string;
  path: string;
  content: string;
  originalContent: string;
  dirty: boolean;
  handle: FileSystemFileHandle | null;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: TreeEntry[];
  handle?: FileSystemFileHandle;
  dirHandle?: FileSystemDirectoryHandle;
}

export interface Project {
  id: string;
  name: string;
  files: FileTab[];
  activeFileId: string | null;
  createdAt: number;
  updatedAt: number;
}
