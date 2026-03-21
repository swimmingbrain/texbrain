import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { get } from 'svelte/store';
import {
  gitEnabled, gitCurrentBranch, gitBranches,
  gitStagedFiles, gitUnstagedFiles, gitFileStatuses,
  gitCommitLog, gitLoading,
  gitAuthorName, gitAuthorEmail, gitAuthToken, gitCorsProxy
} from './store';
import type { GitFileChange, GitCommitInfo, GitFileDiff, GitDiffLine, GitAuth, MergeResult } from './types';

const DIR = '/project';
let fs: LightningFS | null = null;
let currentProjectId: string | null = null;
let bufferPolyfilled = false;

async function ensureBuffer() {
  if (bufferPolyfilled) return;
  if (typeof globalThis.Buffer === 'undefined') {
    const { Buffer } = await import('buffer');
    (globalThis as any).Buffer = Buffer;
  }
  bufferPolyfilled = true;
}

function getFs(): LightningFS {
  if (!fs) {
    fs = new LightningFS('texbrain-git-default');
  }
  return fs;
}

export function initFs(projectId: string) {
  if (currentProjectId === projectId && fs) return;
  fs = new LightningFS('texbrain-git-' + projectId);
  currentProjectId = projectId;
}

async function ensureDir(path: string) {
  const parts = path.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    try {
      await getFs().promises.mkdir(current);
    } catch (e: any) {
      if (e.code !== 'EEXIST') throw e;
    }
  }
}

export async function syncFilesToGit(projectFiles: Map<string, string>) {
  const pfs = getFs().promises;
  await ensureDir(DIR);

  // remove old working tree files but keep .git
  try {
    const entries = await pfs.readdir(DIR);
    for (const entry of entries) {
      if (entry === '.git') continue;
      await removeRecursive(DIR + '/' + entry);
    }
  } catch { /* dir may not exist yet */ }

  for (const [path, content] of projectFiles) {
    const fullPath = DIR + '/' + path;
    const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
    if (dir && dir !== DIR) await ensureDir(dir);
    await pfs.writeFile(fullPath, content, 'utf8');
  }
}

async function removeRecursive(path: string) {
  const pfs = getFs().promises;
  try {
    const stat = await pfs.stat(path);
    if (stat.isDirectory()) {
      const entries = await pfs.readdir(path);
      for (const entry of entries) {
        await removeRecursive(path + '/' + entry);
      }
      await pfs.rmdir(path);
    } else {
      await pfs.unlink(path);
    }
  } catch { /* ignore */ }
}

export async function writeFileToGit(path: string, content: string) {
  const pfs = getFs().promises;
  const fullPath = DIR + '/' + path;
  const dir = fullPath.substring(0, fullPath.lastIndexOf('/'));
  if (dir && dir !== DIR) await ensureDir(dir);
  await pfs.writeFile(fullPath, content, 'utf8');
}

export async function deleteFileFromGit(path: string) {
  try {
    await getFs().promises.unlink(DIR + '/' + path);
  } catch { /* file may not exist */ }
}

export async function readAllFilesFromGit(): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const pfs = getFs().promises;

  async function walk(dirPath: string, prefix: string) {
    let entries: string[];
    try {
      entries = await pfs.readdir(dirPath);
    } catch { return; }
    for (const entry of entries) {
      if (entry === '.git') continue;
      const fullPath = dirPath + '/' + entry;
      try {
        const stat = await pfs.stat(fullPath);
        if (stat.isDirectory()) {
          await walk(fullPath, prefix ? prefix + '/' + entry : entry);
        } else {
          const content = await pfs.readFile(fullPath, 'utf8') as string;
          result.set(prefix ? prefix + '/' + entry : entry, content);
        }
      } catch { /* skip unreadable */ }
    }
  }

  await walk(DIR, '');
  return result;
}

export async function isGitRepo(): Promise<boolean> {
  try {
    await getFs().promises.stat(DIR + '/.git');
    return true;
  } catch {
    return false;
  }
}

export async function initRepo(): Promise<void> {
  await ensureBuffer();
  await ensureDir(DIR);
  await git.init({ fs: getFs(), dir: DIR, defaultBranch: 'main' });
  gitEnabled.set(true);
  gitCurrentBranch.set('main');
}

export async function checkAndLoadGit(): Promise<boolean> {
  if (await isGitRepo()) {
    gitEnabled.set(true);
    await refreshGitState();
    return true;
  }
  return false;
}

export async function getStatus(): Promise<{ staged: GitFileChange[]; unstaged: GitFileChange[] }> {
  const matrix = await git.statusMatrix({ fs: getFs(), dir: DIR });
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
    await getFs().promises.stat(DIR + '/' + filepath);
    await git.add({ fs: getFs(), dir: DIR, filepath });
  } catch {
    // file deleted, stage the deletion
    await git.remove({ fs: getFs(), dir: DIR, filepath });
  }
}

export async function unstageFile(filepath: string): Promise<void> {
  try {
    await git.resetIndex({ fs: getFs(), dir: DIR, filepath });
  } catch {
    // file is new (not in HEAD), remove from index
    await git.remove({ fs: getFs(), dir: DIR, filepath });
  }
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

export async function commit(message: string): Promise<string> {
  await ensureBuffer();
  const name = get(gitAuthorName) || 'TeXbrain User';
  const email = get(gitAuthorEmail) || 'user@texbrain.local';

  const sha = await git.commit({
    fs: getFs(),
    dir: DIR,
    message,
    author: { name, email }
  });

  return sha;
}

export async function getLog(depth: number = 50): Promise<GitCommitInfo[]> {
  try {
    const branches = await listBranches();

    const branchToSha = new Map<string, string[]>();
    for (const branch of branches) {
      try {
        const sha = await git.resolveRef({ fs: getFs(), dir: DIR, ref: branch });
        if (!branchToSha.has(sha)) branchToSha.set(sha, []);
        branchToSha.get(sha)!.push(branch);
      } catch { /* skip */ }
    }

    // fetch commits from all branches for complete graph
    const seen = new Set<string>();
    const allCommits: Array<{ oid: string; commit: any }> = [];
    for (const branch of branches) {
      try {
        const branchCommits = await git.log({ fs: getFs(), dir: DIR, ref: branch, depth });
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
      const commits = await git.log({ fs: getFs(), dir: DIR, depth });
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
        const commits = await git.log({ fs: getFs(), dir: DIR, ref: branch, depth: 1 });
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
    const branch = await git.currentBranch({ fs: getFs(), dir: DIR });
    return branch || 'HEAD';
  } catch {
    return 'main';
  }
}

export async function listBranches(): Promise<string[]> {
  try {
    return await git.listBranches({ fs: getFs(), dir: DIR });
  } catch {
    return [];
  }
}

export async function createBranch(name: string): Promise<void> {
  await git.branch({ fs: getFs(), dir: DIR, ref: name });
}

export async function switchBranch(name: string): Promise<void> {
  await git.checkout({ fs: getFs(), dir: DIR, ref: name });
}

export async function deleteBranch(name: string): Promise<void> {
  await git.deleteBranch({ fs: getFs(), dir: DIR, ref: name });
}

export async function merge(branchName: string): Promise<MergeResult> {
  const name = get(gitAuthorName) || 'TeXbrain User';
  const email = get(gitAuthorEmail) || 'user@texbrain.local';

  try {
    const result = await git.merge({
      fs: getFs(),
      dir: DIR,
      ours: await getCurrentBranch(),
      theirs: branchName,
      author: { name, email }
    });
    await git.checkout({ fs: getFs(), dir: DIR, ref: await getCurrentBranch() });
    return { success: true, conflicts: [], sha: result.oid };
  } catch (err: any) {
    if (err.code === 'MergeConflictError' || err.code === 'MergeNotSupportedError') {
      return { success: false, conflicts: err.data?.filepaths || [err.message] };
    }
    throw err;
  }
}

export async function addRemote(name: string, url: string): Promise<void> {
  await git.addRemote({ fs: getFs(), dir: DIR, remote: name, url });
}

export async function listRemotes(): Promise<Array<{ remote: string; url: string }>> {
  try {
    return await git.listRemotes({ fs: getFs(), dir: DIR });
  } catch {
    return [];
  }
}

export async function removeRemote(name: string): Promise<void> {
  await git.deleteRemote({ fs: getFs(), dir: DIR, remote: name });
}

function getAuth(): GitAuth {
  const token = get(gitAuthToken);
  if (token) {
    return { username: token, password: 'x-oauth-basic' };
  }
  return { username: '', password: '' };
}

function getCorsProxy(): string | undefined {
  const proxy = get(gitCorsProxy);
  return proxy || undefined;
}

export async function push(remoteName: string = 'origin', branch?: string): Promise<void> {
  await ensureBuffer();
  const ref = branch || await getCurrentBranch();
  const auth = getAuth();
  await git.push({
    fs: getFs(),
    http,
    dir: DIR,
    remote: remoteName,
    ref,
    corsProxy: getCorsProxy(),
    onAuth: () => auth
  });
}

export async function pull(remoteName: string = 'origin', branch?: string): Promise<void> {
  await ensureBuffer();
  const ref = branch || await getCurrentBranch();
  const auth = getAuth();
  const name = get(gitAuthorName) || 'TeXbrain User';
  const email = get(gitAuthorEmail) || 'user@texbrain.local';

  await git.pull({
    fs: getFs(),
    http,
    dir: DIR,
    remote: remoteName,
    ref,
    corsProxy: getCorsProxy(),
    onAuth: () => auth,
    author: { name, email }
  });
}

export async function cloneRepo(url: string): Promise<void> {
  await ensureBuffer();
  await ensureDir(DIR);
  const auth = getAuth();
  await git.clone({
    fs: getFs(),
    http,
    dir: DIR,
    url,
    corsProxy: getCorsProxy(),
    onAuth: () => auth,
    singleBranch: false
  });
}

export async function getFileDiff(filepath: string): Promise<GitFileDiff> {
  const pfs = getFs().promises;

  let newContent = '';
  try {
    newContent = await pfs.readFile(DIR + '/' + filepath, 'utf8') as string;
  } catch { /* file deleted */ }

  let oldContent = '';
  try {
    const sha = await git.resolveRef({ fs: getFs(), dir: DIR, ref: 'HEAD' });
    const { blob } = await git.readBlob({
      fs: getFs(),
      dir: DIR,
      oid: sha,
      filepath
    });
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

export async function refreshGitState(): Promise<void> {
  await ensureBuffer();
  gitLoading.set(true);
  try {
    const branch = await getCurrentBranch();
    gitCurrentBranch.set(branch);

    const branches = await listBranches();
    gitBranches.set(branches);

    await getStatus();

    const log = await getLog();
    gitCommitLog.set(log);
  } catch (err) {
    console.error('refreshGitState:', err);
  } finally {
    gitLoading.set(false);
  }
}

export function destroyGitFs() {
  fs = null;
  currentProjectId = null;
  gitEnabled.set(false);
  gitCurrentBranch.set('main');
  gitBranches.set([]);
  gitStagedFiles.set([]);
  gitUnstagedFiles.set([]);
  gitFileStatuses.set(new Map());
  gitCommitLog.set([]);
}
