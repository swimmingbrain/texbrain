import { get as idbGet, set as idbSet } from 'idb-keyval';

export interface RecentFile {
  name: string;
  openedAt: number;
}

const KEY = 'texbrain-recent-files';
const MAX = 20;

export async function getRecentFiles(): Promise<RecentFile[]> {
  try {
    return (await idbGet(KEY)) ?? [];
  } catch {
    return [];
  }
}

export async function addRecentFile(name: string): Promise<void> {
  try {
    const files = await getRecentFiles();
    const filtered = files.filter((f) => f.name !== name);
    filtered.unshift({ name, openedAt: Date.now() });
    await idbSet(KEY, filtered.slice(0, MAX));
  } catch {}
}
