// isomorphic-git wants a node style file system. this one is backed by a
// FileSystemDirectoryHandle, so git works on the real project folder (or the
// browser's private file system) and shares its .git directory with whatever
// else touches that folder, a terminal for example

interface Stat {
  type: 'file' | 'dir';
  mode: number;
  size: number;
  ino: number;
  mtimeMs: number;
  ctimeMs: number;
  uid: number;
  gid: number;
  dev: number;
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

const MESSAGES: Record<string, string> = {
  ENOENT: 'no such file or directory',
  EEXIST: 'file already exists',
  ENOTDIR: 'not a directory',
  EISDIR: 'illegal operation on a directory',
  ENOTEMPTY: 'directory not empty',
  ENOSYS: 'not supported'
};

function fsError(code: string, path: string): Error & { code: string } {
  return Object.assign(new Error(`${code}: ${MESSAGES[code] || code}, '${path}'`), { code });
}

// the file system access api throws DOMExceptions, git expects errno codes
function translate(e: any, path: string): Error {
  switch (e?.name) {
    case 'NotFoundError': return fsError('ENOENT', path);
    case 'TypeMismatchError': return fsError('ENOTDIR', path);
    case 'InvalidModificationError': return fsError('ENOTEMPTY', path);
    default: return e;
  }
}

function makeStat(type: 'file' | 'dir', size: number, mtimeMs: number): Stat {
  return {
    type,
    mode: type === 'dir' ? 0o40000 : 0o100644,
    size,
    ino: 0,
    mtimeMs,
    ctimeMs: mtimeMs,
    uid: 0,
    gid: 0,
    dev: 0,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir',
    isSymbolicLink: () => false
  };
}

function normalize(path: string): string[] {
  return path.split('/').filter(p => p && p !== '.');
}

export class HandleFs {
  readonly promises: {
    readFile(path: string, options?: any): Promise<Uint8Array | string>;
    writeFile(path: string, data: Uint8Array | string, options?: any): Promise<void>;
    unlink(path: string): Promise<void>;
    readdir(path: string): Promise<string[]>;
    mkdir(path: string): Promise<void>;
    rmdir(path: string): Promise<void>;
    rm(path: string, options?: { recursive?: boolean }): Promise<void>;
    stat(path: string): Promise<Stat>;
    lstat(path: string): Promise<Stat>;
    readlink(path: string): Promise<never>;
    symlink(target: string, path: string): Promise<never>;
  };

  private dirs = new Map<string, FileSystemDirectoryHandle>();

  constructor(private root: FileSystemDirectoryHandle) {
    this.dirs.set('', root);
    this.promises = {
      readFile: (p, o) => this.readFile(p, o),
      writeFile: (p, d) => this.writeFile(p, d),
      unlink: (p) => this.unlink(p),
      readdir: (p) => this.readdir(p),
      mkdir: (p) => this.mkdir(p),
      rmdir: (p) => this.rmdir(p),
      rm: (p, o) => this.rm(p, o),
      stat: (p) => this.stat(p),
      lstat: (p) => this.stat(p),
      readlink: (p) => Promise.reject(fsError('ENOSYS', p)),
      symlink: (_t, p) => Promise.reject(fsError('ENOSYS', p))
    };
  }

  // directory handles are cached by path. anything else may have changed the
  // folder in the meantime (a terminal, the editor), so callers drop the
  // cache before a fresh look at the working tree
  invalidate() {
    this.dirs.clear();
    this.dirs.set('', this.root);
  }

  private async getDir(parts: string[]): Promise<FileSystemDirectoryHandle> {
    const key = parts.join('/');
    const cached = this.dirs.get(key);
    if (cached) return cached;

    let dir = this.root;
    let prefix = '';
    for (const part of parts) {
      prefix = prefix ? `${prefix}/${part}` : part;
      const known = this.dirs.get(prefix);
      if (known) { dir = known; continue; }
      try {
        dir = await dir.getDirectoryHandle(part);
      } catch (e) {
        throw translate(e, '/' + prefix);
      }
      this.dirs.set(prefix, dir);
    }
    return dir;
  }

  private async locate(path: string): Promise<{ parent: FileSystemDirectoryHandle; name: string }> {
    const parts = normalize(path);
    const name = parts.pop();
    if (name === undefined) throw fsError('EISDIR', path);
    return { parent: await this.getDir(parts), name };
  }

  async readFile(path: string, options?: any): Promise<Uint8Array | string> {
    const { parent, name } = await this.locate(path);
    let file: File;
    try {
      file = await (await parent.getFileHandle(name)).getFile();
    } catch (e: any) {
      throw e?.name === 'TypeMismatchError' ? fsError('EISDIR', path) : translate(e, path);
    }
    const encoding = typeof options === 'string' ? options : options?.encoding;
    if (encoding === 'utf8' || encoding === 'utf-8') return file.text();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeFile(path: string, data: Uint8Array | string): Promise<void> {
    const { parent, name } = await this.locate(path);
    try {
      const handle = await parent.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(data as unknown as FileSystemWriteChunkType);
      await writable.close();
    } catch (e) {
      throw translate(e, path);
    }
  }

  async unlink(path: string): Promise<void> {
    const { parent, name } = await this.locate(path);
    try {
      await parent.removeEntry(name);
    } catch (e) {
      throw translate(e, path);
    }
  }

  async readdir(path: string): Promise<string[]> {
    const dir = await this.getDir(normalize(path));
    const names: string[] = [];
    for await (const name of dir.keys()) names.push(name);
    return names;
  }

  async mkdir(path: string): Promise<void> {
    const { parent, name } = await this.locate(path);
    if (await this.exists(parent, name)) throw fsError('EEXIST', path);
    try {
      const dir = await parent.getDirectoryHandle(name, { create: true });
      this.dirs.set(normalize(path).join('/'), dir);
    } catch (e) {
      throw translate(e, path);
    }
  }

  async rmdir(path: string): Promise<void> {
    await this.unlink(path);
    this.forget(path);
  }

  async rm(path: string, options?: { recursive?: boolean }): Promise<void> {
    const { parent, name } = await this.locate(path);
    try {
      await parent.removeEntry(name, { recursive: !!options?.recursive });
    } catch (e) {
      throw translate(e, path);
    }
    this.forget(path);
  }

  async stat(path: string): Promise<Stat> {
    const parts = normalize(path);
    if (parts.length === 0) return makeStat('dir', 0, 0);
    const name = parts.pop()!;
    const parent = await this.getDir(parts);
    try {
      const file = await (await parent.getFileHandle(name)).getFile();
      return makeStat('file', file.size, file.lastModified);
    } catch (e: any) {
      if (e?.name !== 'TypeMismatchError') throw translate(e, path);
    }
    try {
      await parent.getDirectoryHandle(name);
      return makeStat('dir', 0, 0);
    } catch (e) {
      throw translate(e, path);
    }
  }

  private async exists(parent: FileSystemDirectoryHandle, name: string): Promise<boolean> {
    try {
      await parent.getFileHandle(name);
      return true;
    } catch (e: any) {
      if (e?.name === 'TypeMismatchError') return true;
      return false;
    }
  }

  private forget(path: string) {
    const key = normalize(path).join('/');
    for (const k of [...this.dirs.keys()]) {
      if (k === key || k.startsWith(key + '/')) this.dirs.delete(k);
    }
  }
}
