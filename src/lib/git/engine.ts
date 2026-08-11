import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { get } from 'svelte/store';
import { HandleFs } from './handle-fs';
import {
  gitEnabled, gitCurrentBranch, gitBranches,
  gitStagedFiles, gitUnstagedFiles, gitFileStatuses,
  gitCommitLog, gitLoading, gitSync, gitProgress,
  gitAuthorName, gitAuthorEmail, gitAuthUsername, gitAuthToken, gitCorsProxy
} from './store';
import type { GitFileChange, GitCommitInfo, GitFileDiff, GitDiffLine, GitAuth, MergeResult } from './types';

// git works straight on the project folder, the .git directory lives next
// to the tex files like it would with a terminal
const DIR = '/';

interface Repo {
  fs: HandleFs;
  handle: FileSystemDirectoryHandle;
}

let repo: Repo | null = null;
// isomorphic-git keeps parsed packfiles and the index in here, dropped
// whenever something outside a single command may have changed the repo
let cache: object = {};
let bufferPolyfilled = false;

async function ensureBuffer() {
  if (bufferPolyfilled) return;
  if (typeof globalThis.Buffer === 'undefined') {
    const { Buffer } = await import('buffer');
    (globalThis as any).Buffer = Buffer;
  }
  bufferPolyfilled = true;
}

function getFs(): HandleFs {
  if (!repo) throw new Error('No project folder is open');
  return repo.fs;
}

function base() {
  return { fs: getFs(), dir: DIR, cache };
}

function resetStores() {
  gitEnabled.set(false);
  gitCurrentBranch.set('main');
  gitBranches.set([]);
  gitStagedFiles.set([]);
  gitUnstagedFiles.set([]);
  gitFileStatuses.set(new Map());
  gitCommitLog.set([]);
  gitSync.set({ remoteBranch: null, ahead: 0, behind: 0, fetchedAt: null });
}

// bind git to a project folder. returns whether it already is a repository
export async function openRepo(handle: FileSystemDirectoryHandle): Promise<boolean> {
  await ensureBuffer();
  repo = { fs: new HandleFs(handle), handle };
  cache = {};
  resetStores();
  if (await isGitRepo()) {
    gitEnabled.set(true);
    await refreshGitState();
    return true;
  }
  return false;
}

export function closeRepo() {
  repo = null;
  cache = {};
  resetStores();
}

export async function isGitRepo(): Promise<boolean> {
  if (!repo) return false;
  try {
    const stat = await repo.fs.stat('/.git');
    return stat.isDirectory();
  } catch {
    return false;
  }
}

// the files latex leaves behind while compiling. the pdf is left out on
// purpose, plenty of people want it in the repository
export const LATEX_GITIGNORE = `# latex build files
*.aux
*.bbl
*.bcf
*.blg
*.fdb_latexmk
*.fls
*.lof
*.log
*.lot
*.nav
*.out
*.run.xml
*.snm
*.synctex.gz
*.toc
*.vrb
*.xdv

# uncomment to keep the pdf out as well
# *.pdf
`;

export async function initRepo(options: { gitignore?: boolean } = {}): Promise<void> {
  await ensureBuffer();
  await git.init({ ...base(), defaultBranch: 'main' });
  if (options.gitignore) {
    const fs = getFs();
    try {
      await fs.stat('/.gitignore');
    } catch {
      await fs.writeFile('/.gitignore', LATEX_GITIGNORE);
    }
  }
  cache = {};
  gitEnabled.set(true);
  gitCurrentBranch.set('main');
}

export async function getStatus(): Promise<{ staged: GitFileChange[]; unstaged: GitFileChange[] }> {
  const matrix = await git.statusMatrix(base());
  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];
  const statusMap = new Map<string, string>();

  for (const [filepath, head, workdir, stage] of matrix) {
    const path = filepath as string;
    const h = head as number;
    const w = workdir as number;
    const s = stage as number;

    if (h === 1 && w === 1 && s === 1) continue;

    // staged changes (HEAD -> index)
    if (h === 0 && (s === 2 || s === 3)) {
      staged.push({ path, status: 'added', staged: true });
    } else if (h === 1 && (s === 2 || s === 3)) {
      staged.push({ path, status: 'modified', staged: true });
    } else if (h === 1 && s === 0) {
      staged.push({ path, status: 'deleted', staged: true });
    }

    // unstaged changes (index -> workdir)
    if (h === 0 && w === 2 && s === 0) {
      unstaged.push({ path, status: 'untracked', staged: false });
      statusMap.set(path, 'untracked');
    } else if (w === 2 && s === 1) {
      unstaged.push({ path, status: 'modified', staged: false });
      statusMap.set(path, 'modified');
    } else if (w === 0 && s === 1 && h === 1) {
      unstaged.push({ path, status: 'deleted', staged: false });
      statusMap.set(path, 'deleted');
    } else if (w === 2 && (s === 2 || s === 3)) {
      // staged but also modified again in workdir
      unstaged.push({ path, status: 'modified', staged: false });
      statusMap.set(path, 'modified');
    }

    // file tree badge: show the most visible status
    if (!statusMap.has(path)) {
      if (h === 0) statusMap.set(path, 'added');
      else if (w === 0 || s === 0) statusMap.set(path, 'deleted');
      else statusMap.set(path, 'modified');
    }
  }

  gitStagedFiles.set(staged);
  gitUnstagedFiles.set(unstaged);
  gitFileStatuses.set(statusMap);

  return { staged, unstaged };
}

export async function stageFile(filepath: string): Promise<void> {
  try {
    await getFs().stat(DIR + filepath);
    await git.add({ ...base(), filepath });
  } catch {
    // file deleted, stage the deletion
    await git.remove({ ...base(), filepath });
  }
}

export async function unstageFile(filepath: string): Promise<void> {
  try {
    await git.resetIndex({ ...base(), filepath });
  } catch {
    // file is new (not in HEAD), remove from index
    await git.remove({ ...base(), filepath });
  }
}

// throw away the local edits to one file: tracked files go back to what is
// committed, files git never saw are deleted
export async function discardChanges(filepath: string, status: string): Promise<void> {
  if (status === 'untracked') {
    await getFs().unlink(DIR + filepath);
  } else {
    await git.checkout({ ...base(), ref: await getCurrentBranch(), filepaths: [filepath], force: true });
  }
  cache = {};
}

export async function stageAll(): Promise<void> {
  const { unstaged } = await getStatus();
  for (const file of unstaged) {
    await stageFile(file.path);
  }
}

export async function unstageAll(): Promise<void> {
  const staged = get(gitStagedFiles);
  for (const file of staged) {
    await unstageFile(file.path);
  }
}

export function hasAuthor(): boolean {
  return !!get(gitAuthorName).trim() && !!get(gitAuthorEmail).trim();
}

// every commit carries a name and an email, a made up placeholder would end
// up in the history of every repository forever
function author() {
  if (!hasAuthor()) {
    throw Object.assign(new Error('Git needs your name and email before it can commit'), { code: 'MissingNameError' });
  }
  return { name: get(gitAuthorName).trim(), email: get(gitAuthorEmail).trim() };
}

export async function commit(message: string): Promise<string> {
  await ensureBuffer();
  return git.commit({ ...base(), message, author: author() });
}

export async function getLog(depth: number = 50): Promise<GitCommitInfo[]> {
  try {
    const branches = await listBranches();

    const branchToSha = new Map<string, string[]>();
    for (const branch of branches) {
      try {
        const sha = await git.resolveRef({ ...base(), ref: branch });
        if (!branchToSha.has(sha)) branchToSha.set(sha, []);
        branchToSha.get(sha)!.push(branch);
      } catch { /* skip */ }
    }

    // fetch commits from all branches for complete graph
    const seen = new Set<string>();
    const allCommits: Array<{ oid: string; commit: any }> = [];
    for (const branch of branches) {
      try {
        const branchCommits = await git.log({ ...base(), ref: branch, depth });
        for (const c of branchCommits) {
          if (!seen.has(c.oid)) {
            seen.add(c.oid);
            allCommits.push(c);
          }
        }
      } catch { /* skip */ }
    }

    // fallback if no branches resolved
    if (allCommits.length === 0) {
      const commits = await git.log({ ...base(), depth });
      for (const c of commits) {
        if (!seen.has(c.oid)) {
          seen.add(c.oid);
          allCommits.push(c);
        }
      }
    }

    allCommits.sort((a, b) => b.commit.author.timestamp - a.commit.author.timestamp);

    return allCommits.map((c) => ({
      sha: c.oid,
      shortSha: c.oid.slice(0, 7),
      message: c.commit.message,
      author: {
        name: c.commit.author.name,
        email: c.commit.author.email,
        timestamp: c.commit.author.timestamp
      },
      parentShas: c.commit.parent,
      refs: branchToSha.get(c.oid) || []
    }));
  } catch {
    return [];
  }
}

export async function getBranchTips(): Promise<Map<string, GitCommitInfo>> {
  const result = new Map<string, GitCommitInfo>();
  try {
    const branches = await listBranches();
    for (const branch of branches) {
      try {
        const commits = await git.log({ ...base(), ref: branch, depth: 1 });
        if (commits.length > 0) {
          const c = commits[0];
          result.set(branch, {
            sha: c.oid,
            shortSha: c.oid.slice(0, 7),
            message: c.commit.message,
            author: {
              name: c.commit.author.name,
              email: c.commit.author.email,
              timestamp: c.commit.author.timestamp
            },
            parentShas: c.commit.parent,
            refs: [branch]
          });
        }
      } catch { /* skip */ }
    }
  } catch { /* ignore */ }
  return result;
}

export async function getCurrentBranch(): Promise<string> {
  try {
    const branch = await git.currentBranch(base());
    return branch || 'HEAD';
  } catch {
    return 'main';
  }
}

export async function listBranches(): Promise<string[]> {
  try {
    return await git.listBranches(base());
  } catch {
    return [];
  }
}

export async function createBranch(name: string): Promise<void> {
  await git.branch({ ...base(), ref: name });
}

export async function switchBranch(name: string): Promise<void> {
  await git.checkout({ ...base(), ref: name });
  cache = {};
}

export async function deleteBranch(name: string): Promise<void> {
  await git.deleteBranch({ ...base(), ref: name });
}

export async function merge(branchName: string): Promise<MergeResult> {
  try {
    const current = await getCurrentBranch();
    const result = await git.merge({ ...base(), ours: current, theirs: branchName, author: author() });
    await git.checkout({ ...base(), ref: current });
    cache = {};
    return { success: true, conflicts: [], sha: result.oid };
  } catch (err: any) {
    if (err.code === 'MergeConflictError' || err.code === 'MergeNotSupportedError') {
      return { success: false, conflicts: err.data?.filepaths || [err.message] };
    }
    throw err;
  }
}

export async function addRemote(name: string, url: string): Promise<void> {
  await git.addRemote({ ...base(), remote: name, url });
}

export async function listRemotes(): Promise<Array<{ remote: string; url: string }>> {
  try {
    return await git.listRemotes(base());
  } catch {
    return [];
  }
}

export async function removeRemote(name: string): Promise<void> {
  await git.deleteRemote({ ...base(), remote: name });
}

function getAuth(): GitAuth {
  const token = get(gitAuthToken);
  const username = get(gitAuthUsername);
  if (!token) return { username: '', password: '' };
  // github accepts the token in the username slot, gitlab, bitbucket and
  // friends want it as the password next to a username
  if (username) return { username, password: token };
  return { username: token, password: 'x-oauth-basic' };
}

function getCorsProxy(): string | undefined {
  const proxy = get(gitCorsProxy);
  return proxy || undefined;
}

// everything that talks to a remote shares these. a refused login is not
// retried, it comes back as one clear error instead of a loop
function remoteOptions() {
  const auth = getAuth();
  return {
    http,
    corsProxy: getCorsProxy(),
    onAuth: () => auth,
    onAuthFailure: () => ({ cancel: true }),
    onProgress: (p: { phase: string; loaded: number; total?: number }) => {
      gitProgress.set({ phase: p.phase, loaded: p.loaded, total: p.total || 0 });
    }
  };
}

// keeps the progress store honest around a remote operation
async function withProgress<T>(phase: string, fn: () => Promise<T>): Promise<T> {
  gitProgress.set({ phase, loaded: 0, total: 0 });
  try {
    return await fn();
  } finally {
    gitProgress.set(null);
  }
}

export async function push(remoteName: string = 'origin', branch?: string): Promise<void> {
  await ensureBuffer();
  const ref = branch || await getCurrentBranch();
  await withProgress('Pushing', () => git.push({ ...base(), ...remoteOptions(), remote: remoteName, ref }));
  cache = {};
}

export async function fetchRemote(remoteName: string = 'origin'): Promise<void> {
  await ensureBuffer();
  await withProgress('Fetching', () => git.fetch({ ...base(), ...remoteOptions(), remote: remoteName, prune: true }));
  cache = {};
  gitSync.update(s => ({ ...s, fetchedAt: Date.now() }));
  await getSyncStatus(remoteName);
}

// where the branch stands compared to its copy on the remote. the counts
// stop at 100 either way, enough to say "you are behind"
export async function getSyncStatus(remoteName: string = 'origin'): Promise<void> {
  const branch = await getCurrentBranch();
  const remoteRef = `refs/remotes/${remoteName}/${branch}`;
  let local: Array<{ oid: string }> = [];
  let remote: Array<{ oid: string }> = [];
  try {
    remote = await git.log({ ...base(), ref: remoteRef, depth: 100 });
  } catch {
    gitSync.update(s => ({ ...s, remoteBranch: null, ahead: 0, behind: 0 }));
    return;
  }
  try {
    local = await git.log({ ...base(), ref: branch, depth: 100 });
  } catch { /* branch without commits */ }

  const localSet = new Set(local.map(c => c.oid));
  const remoteSet = new Set(remote.map(c => c.oid));
  gitSync.update(s => ({
    ...s,
    remoteBranch: `${remoteName}/${branch}`,
    ahead: local.filter(c => !remoteSet.has(c.oid)).length,
    behind: remote.filter(c => !localSet.has(c.oid)).length
  }));
}

export async function pull(remoteName: string = 'origin', branch?: string): Promise<void> {
  await ensureBuffer();
  const ref = branch || await getCurrentBranch();
  await withProgress('Pulling', () => git.pull({ ...base(), ...remoteOptions(), remote: remoteName, ref, author: author() }));
  cache = {};
}

// clone into a folder that is not the open project (yet)
export async function cloneInto(handle: FileSystemDirectoryHandle, url: string): Promise<void> {
  await ensureBuffer();
  const fs = new HandleFs(handle);
  const entries = await fs.readdir('/');
  if (entries.length > 0) {
    throw new Error('That folder is not empty. Pick a new name or an empty folder.');
  }
  await withProgress('Cloning', () => git.clone({ fs, dir: DIR, ...remoteOptions(), url, singleBranch: false }));
}

export async function getFileDiff(filepath: string): Promise<GitFileDiff> {
  let newContent = '';
  try {
    newContent = await getFs().readFile(DIR + filepath, 'utf8') as string;
  } catch { /* file deleted */ }

  let oldContent = '';
  try {
    const sha = await git.resolveRef({ ...base(), ref: 'HEAD' });
    const { blob } = await git.readBlob({ ...base(), oid: sha, filepath });
    oldContent = new TextDecoder().decode(blob);
  } catch { /* new file, no HEAD version */ }

  const lines = computeLineDiff(oldContent, newContent);
  const additions = lines.filter(l => l.type === 'add').length;
  const deletions = lines.filter(l => l.type === 'remove').length;

  return { path: filepath, lines, additions, deletions };
}

// lcs-based line diff
function computeLineDiff(oldText: string, newText: string): GitDiffLine[] {
  if (oldText === newText) return [];

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;

  // fall back to simplified diff for very large files
  if (m * n > 1_000_000) {
    return simpleDiff(oldLines, newLines);
  }

  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: GitDiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: 'context', content: oldLines[i - 1], oldLineNum: i, newLineNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'add', content: newLines[j - 1], newLineNum: j });
      j--;
    } else {
      result.push({ type: 'remove', content: oldLines[i - 1], oldLineNum: i });
      i--;
    }
  }

  return result.reverse();
}

// simplified diff for very large files: all old as removed, all new as added
function simpleDiff(oldLines: string[], newLines: string[]): GitDiffLine[] {
  const result: GitDiffLine[] = [];
  for (let i = 0; i < oldLines.length; i++) {
    result.push({ type: 'remove', content: oldLines[i], oldLineNum: i + 1 });
  }
  for (let j = 0; j < newLines.length; j++) {
    result.push({ type: 'add', content: newLines[j], newLineNum: j + 1 });
  }
  return result;
}

// get all files in a tree as map of path -> blob oid
async function listTreeFiles(commitSha: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  try {
    await git.walk({
      ...base(),
      trees: [git.TREE({ ref: commitSha })],
      map: async (filepath, [entry]) => {
        if (!entry || filepath === '.') return;
        const type = await entry.type();
        if (type === 'blob') {
          const oid = await entry.oid();
          files.set(filepath, oid);
        }
      }
    });
  } catch { /* ignore */ }
  return files;
}

// list all files changed in a commit compared to its parent
export async function getCommitChangedFiles(sha: string): Promise<Array<{ path: string; status: 'added' | 'modified' | 'deleted' }>> {
  try {
    const commit = await git.readCommit({ ...base(), oid: sha });
    const parentSha = commit.commit.parent.length > 0 ? commit.commit.parent[0] : null;

    const currentFiles = await listTreeFiles(sha);
    const parentFiles = parentSha ? await listTreeFiles(parentSha) : new Map<string, string>();

    const changes: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }> = [];

    for (const [path, oid] of currentFiles) {
      const parentOid = parentFiles.get(path);
      if (!parentOid) {
        changes.push({ path, status: 'added' });
      } else if (parentOid !== oid) {
        changes.push({ path, status: 'modified' });
      }
    }

    for (const [path] of parentFiles) {
      if (!currentFiles.has(path)) {
        changes.push({ path, status: 'deleted' });
      }
    }

    return changes.sort((a, b) => a.path.localeCompare(b.path));
  } catch {
    return [];
  }
}

// read file content at a specific commit
export async function readFileAtCommit(sha: string, filepath: string): Promise<string> {
  const { blob } = await git.readBlob({ ...base(), oid: sha, filepath });
  return new TextDecoder().decode(blob);
}

// diff a specific file between a commit and its parent
export async function getCommitFileDiff(sha: string, filepath: string): Promise<GitFileDiff> {
  const commit = await git.readCommit({ ...base(), oid: sha });
  const parentSha = commit.commit.parent.length > 0 ? commit.commit.parent[0] : null;

  let newContent = '';
  try {
    newContent = await readFileAtCommit(sha, filepath);
  } catch { /* deleted or doesn't exist */ }

  let oldContent = '';
  if (parentSha) {
    try {
      oldContent = await readFileAtCommit(parentSha, filepath);
    } catch { /* new file */ }
  }

  const lines = computeLineDiff(oldContent, newContent);
  const additions = lines.filter(l => l.type === 'add').length;
  const deletions = lines.filter(l => l.type === 'remove').length;

  return { path: filepath, lines, additions, deletions };
}

// the editor and the file tree call this after writing to the folder, and
// the window when it regains focus, so the status keeps up without polling
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
export function notifyFilesChanged(delay = 400) {
  if (!repo || !get(gitEnabled)) return;
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    refreshGitState();
  }, delay);
}

export async function refreshGitState(): Promise<void> {
  if (!repo) return;
  await ensureBuffer();
  gitLoading.set(true);
  try {
    // something else may have touched the folder since the last look
    repo.fs.invalidate();

    const branch = await getCurrentBranch();
    gitCurrentBranch.set(branch);

    const branches = await listBranches();
    gitBranches.set(branches);

    await getStatus();

    const log = await getLog();
    gitCommitLog.set(log);

    await getSyncStatus();
  } catch (err) {
    console.error('refreshGitState:', err);
  } finally {
    gitLoading.set(false);
  }
}
