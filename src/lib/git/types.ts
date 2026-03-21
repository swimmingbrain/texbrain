export type GitFileStatusType = 'modified' | 'added' | 'deleted' | 'untracked' | 'unmodified';

export interface GitFileChange {
  path: string;
  status: GitFileStatusType;
  staged: boolean;
}

export interface GitCommitInfo {
  sha: string;
  shortSha: string;
  message: string;
  author: { name: string; email: string; timestamp: number };
  parentShas: string[];
  refs: string[];
}

export interface GitDiffLine {
  type: 'context' | 'add' | 'remove';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

export interface GitFileDiff {
  path: string;
  lines: GitDiffLine[];
  additions: number;
  deletions: number;
}

export interface GitAuth {
  username: string;
  password: string;
}

export interface MergeResult {
  success: boolean;
  conflicts: string[];
  sha?: string;
}
