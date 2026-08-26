export function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
  if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
  const month = d.toLocaleString('default', { month: 'short' });
  const day = d.getDate();
  const year = d.getFullYear();
  return year === now.getFullYear() ? `${month} ${day}` : `${month} ${day}, ${year}`;
}

export function fileName(path: string): string {
  return path.split('/').pop() || path;
}

export function fileDir(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 1) return '';
  return parts.slice(0, -1).join('/') + '/';
}

export function statusLetter(status: string): string {
  switch (status) {
    case 'modified': return 'M';
    case 'added': return 'A';
    case 'deleted': return 'D';
    case 'untracked': return '?';
    default: return ' ';
  }
}

export function statusWord(status: string): string {
  switch (status) {
    case 'modified': return 'modified';
    case 'added': return 'added';
    case 'deleted': return 'deleted';
    case 'untracked': return 'new';
    default: return '';
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case 'modified': return 'var(--warning)';
    case 'added': case 'untracked': return 'var(--success)';
    case 'deleted': return 'var(--error)';
    default: return 'var(--text-muted)';
  }
}

// the same colors the history graph uses, so branches match everywhere
export const GRAPH_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#f97316'];

// "github.com/you/project" out of a remote url
export function shortRemote(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\.git$/, '').replace(/^git@([^:]+):/, '$1/');
}
