import { writable, derived } from 'svelte/store';
import type { GitFileChange, GitCommitInfo } from './types';

export const gitPanelOpen = writable(false);
export const gitPanelTab = writable<'changes' | 'history' | 'branches' | 'remote'>('changes');

export const gitEnabled = writable(false);
export const gitCurrentBranch = writable<string>('main');
export const gitBranches = writable<string[]>([]);

export const gitStagedFiles = writable<GitFileChange[]>([]);
export const gitUnstagedFiles = writable<GitFileChange[]>([]);
export const gitFileStatuses = writable<Map<string, string>>(new Map());

export const gitCommitLog = writable<GitCommitInfo[]>([]);

export const gitDiffFile = writable<string | null>(null);

export const gitLoading = writable(false);

// where the current branch stands compared to its copy on the remote,
// null remoteBranch means the remote has never been fetched
export interface GitSyncState {
  remoteBranch: string | null;
  ahead: number;
  behind: number;
  fetchedAt: number | null;
}
export const gitSync = writable<GitSyncState>({ remoteBranch: null, ahead: 0, behind: 0, fetchedAt: null });

export const gitChangeCount = derived(
  [gitStagedFiles, gitUnstagedFiles],
  ([$staged, $unstaged]) => $staged.length + $unstaged.length
);

const isBrowser = typeof localStorage !== 'undefined';

function persisted(key: string, fallback: string) {
  const stored = isBrowser ? localStorage.getItem(key) : null;
  const store = writable(stored || fallback);
  if (isBrowser) {
    store.subscribe((v) => localStorage.setItem(key, v));
  }
  return store;
}

export const gitAuthorName = persisted('texbrain-git-name', '');
export const gitAuthorEmail = persisted('texbrain-git-email', '');
// github takes the token as the username, most other hosts want a real
// username next to it, so it is optional
export const gitAuthUsername = persisted('texbrain-git-username', '');
export const gitAuthToken = persisted('texbrain-git-token', '');
export const gitCorsProxy = persisted('texbrain-git-proxy', 'https://cors.isomorphic-git.org');
