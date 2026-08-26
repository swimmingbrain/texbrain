<script lang="ts">
  import { gitCommitLog, gitBranches, gitCurrentBranch } from '$lib/git/store';
  import { getCommitChangedFiles, getCommitFileDiff } from '$lib/git/engine';
  import { reportGitError } from '$lib/git/errors';
  import type { GitCommitInfo, GitFileDiff } from '$lib/git/types';
  import { formatDate, fileName, fileDir, statusLetter, statusWord, statusColor, GRAPH_COLORS } from './format';
  import DiffView from './DiffView.svelte';

  let inspectCommit: GitCommitInfo | null = null;
  let inspectFiles: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }> = [];
  let inspectLoading = false;
  let inspectDiff: GitFileDiff | null = null;
  let inspectDiffFile: string | null = null;

  async function handleInspectCommit(c: GitCommitInfo) {
    if (inspectCommit?.sha === c.sha) {
      inspectCommit = null;
      inspectFiles = [];
      inspectDiff = null;
      return;
    }
    inspectCommit = c;
    inspectDiff = null;
    inspectDiffFile = null;
    inspectLoading = true;
    try {
      inspectFiles = await getCommitChangedFiles(c.sha);
    } catch {
      inspectFiles = [];
    } finally {
      inspectLoading = false;
    }
  }

  async function handleInspectFileDiff(sha: string, path: string) {
    if (inspectDiffFile === path) {
      inspectDiff = null;
      inspectDiffFile = null;
      return;
    }
    inspectDiffFile = path;
    try {
      inspectDiff = await getCommitFileDiff(sha, path);
    } catch (err) {
      reportGitError(err, 'Diff');
      inspectDiff = null;
      inspectDiffFile = null;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (inspectDiff) { e.stopPropagation(); inspectDiff = null; inspectDiffFile = null; }
    else if (inspectCommit) { e.stopPropagation(); inspectCommit = null; inspectFiles = []; }
  }

  interface GraphRow {
    commit: GitCommitInfo;
    col: number;
    numCols: number;
    edges: GraphEdge[];
  }

  interface GraphEdge {
    fromCol: number;
    toCol: number;
    toRow: number;
    color: string;
    isMerge: boolean;
  }

  function computeGraph(commits: GitCommitInfo[]): GraphRow[] {
    if (commits.length === 0) return [];

    const shaToRow = new Map<string, number>();
    commits.forEach((c, i) => shaToRow.set(c.sha, i));

    let columns: (string | null)[] = [];
    const rows: GraphRow[] = [];

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      const edges: GraphEdge[] = [];

      let col = columns.indexOf(c.sha);
      if (col === -1) {
        col = columns.indexOf(null);
        if (col === -1) { col = columns.length; columns.push(null); }
      }

      // passthrough lines for other active columns
      for (let k = 0; k < columns.length; k++) {
        if (k !== col && columns[k] !== null) {
          const targetRow = shaToRow.get(columns[k]!);
          if (targetRow !== undefined && targetRow > i) {
            edges.push({ fromCol: k, toCol: k, toRow: targetRow, color: GRAPH_COLORS[k % GRAPH_COLORS.length], isMerge: false });
          }
        }
      }

      const parents = c.parentShas;
      if (parents.length === 0) {
        columns[col] = null;
      } else {
        const p0 = parents[0];
        const p0Row = shaToRow.get(p0);
        if (p0Row !== undefined) {
          const existingCol = columns.indexOf(p0);
          if (existingCol !== -1 && existingCol !== col) {
            edges.push({ fromCol: col, toCol: existingCol, toRow: p0Row, color: GRAPH_COLORS[col % GRAPH_COLORS.length], isMerge: false });
            columns[col] = null;
          } else {
            columns[col] = p0;
            edges.push({ fromCol: col, toCol: col, toRow: p0Row, color: GRAPH_COLORS[col % GRAPH_COLORS.length], isMerge: false });
          }
        } else {
          columns[col] = p0;
        }

        for (let pi = 1; pi < parents.length; pi++) {
          const pSha = parents[pi];
          const pRow = shaToRow.get(pSha);
          if (pRow === undefined) continue;

          const existingCol = columns.indexOf(pSha);
          if (existingCol !== -1) {
            edges.push({ fromCol: col, toCol: existingCol, toRow: pRow, color: GRAPH_COLORS[existingCol % GRAPH_COLORS.length], isMerge: true });
          } else {
            let newCol = columns.indexOf(null);
            if (newCol === -1) { newCol = columns.length; columns.push(null); }
            columns[newCol] = pSha;
            edges.push({ fromCol: col, toCol: newCol, toRow: pRow, color: GRAPH_COLORS[newCol % GRAPH_COLORS.length], isMerge: true });
          }
        }
      }

      while (columns.length > 0 && columns[columns.length - 1] === null) columns.pop();

      rows.push({ commit: c, col, numCols: Math.max(columns.length, 1), edges });
    }

    const maxCols = Math.max(1, ...rows.map(r => r.numCols));
    for (const r of rows) r.numCols = maxCols;

    return rows;
  }

  $: graphRows = computeGraph($gitCommitLog);

  const ROW_HEIGHT = 40;
  const COL_WIDTH = 18;
  const DOT_R = 3.5;

  function graphSvgWidth(rows: GraphRow[]): number {
    if (rows.length === 0) return 24;
    return Math.max(24, rows[0].numCols * COL_WIDTH + 8);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="history" on:keydown={handleKeydown}>
  {#if $gitCommitLog.length === 0}
    <p class="empty-msg">No commits yet. Stage your files in the changes tab and commit them, the history starts there.</p>
  {:else}
    <div class="history-scroll">
      <div class="history-graph">
        <div class="graph-canvas" style="width:{graphSvgWidth(graphRows)}px" aria-hidden="true">
          <svg width="{graphSvgWidth(graphRows)}" height="{graphRows.length * ROW_HEIGHT}" class="graph-svg">
            {#each graphRows as row, i}
              {#each row.edges as edge}
                {@const x1 = edge.fromCol * COL_WIDTH + COL_WIDTH / 2 + 4}
                {@const y1 = i * ROW_HEIGHT + ROW_HEIGHT / 2}
                {@const x2 = edge.toCol * COL_WIDTH + COL_WIDTH / 2 + 4}
                {@const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2}
                {#if edge.fromCol === edge.toCol}
                  <line {x1} {y1} {x2} {y2} stroke="{edge.color}" stroke-width="2" stroke-opacity="0.6" />
                {:else}
                  {@const midY = y1 + (y2 - y1) * 0.4}
                  <path d="M{x1},{y1} C{x1},{midY} {x2},{midY} {x2},{y2}" stroke="{edge.color}" stroke-width="2" fill="none" stroke-opacity="0.5" stroke-dasharray={edge.isMerge ? '4 2' : 'none'} />
                {/if}
              {/each}
            {/each}
            {#each graphRows as row, i}
              {@const cx = row.col * COL_WIDTH + COL_WIDTH / 2 + 4}
              {@const cy = i * ROW_HEIGHT + ROW_HEIGHT / 2}
              {@const color = GRAPH_COLORS[row.col % GRAPH_COLORS.length]}
              {@const isMerge = row.commit.parentShas.length > 1}
              {@const isActive = inspectCommit?.sha === row.commit.sha}
              <circle {cx} {cy} r="{isActive ? DOT_R + 3 : DOT_R + 1}" fill="{color}" fill-opacity="{isActive ? 0.25 : 0.12}" />
              <circle {cx} {cy} r="{isMerge ? DOT_R + 1 : DOT_R}" fill="{color}" stroke="{isActive ? '#fff' : 'none'}" stroke-width="1" />
            {/each}
          </svg>
        </div>
        <div class="commit-list">
          {#each graphRows as row}
            {@const isOpen = inspectCommit?.sha === row.commit.sha}
            <div class="commit-entry" class:commit-open={isOpen}>
              <button class="commit-row" style="height:{ROW_HEIGHT}px" on:click={() => handleInspectCommit(row.commit)} aria-expanded={isOpen}>
                <div class="commit-row-inner">
                  <div class="commit-top-row">
                    <span class="commit-sha">{row.commit.shortSha}</span>
                    {#each row.commit.refs as ref}
                      {@const refIdx = $gitBranches.indexOf(ref)}
                      {@const tagColor = GRAPH_COLORS[(refIdx >= 0 ? refIdx : row.commit.refs.indexOf(ref)) % GRAPH_COLORS.length]}
                      <span class="branch-tag" style="background:{tagColor}18;color:{tagColor};border-color:{tagColor}40">
                        {#if ref === $gitCurrentBranch}<span class="tag-dot" style="background:{tagColor}"></span>{/if}
                        {ref}
                      </span>
                    {/each}
                    {#if row.commit.parentShas.length > 1}
                      <span class="merge-badge">merge</span>
                    {/if}
                    <span class="commit-date">{formatDate(row.commit.author.timestamp)}</span>
                  </div>
                  <div class="commit-msg">{row.commit.message.split('\n')[0]}</div>
                </div>
                <svg class="expand-icon" class:expanded={isOpen} width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>

              {#if isOpen}
                <div class="commit-detail">
                  <div class="detail-meta">
                    <span class="detail-author">{inspectCommit?.author.name}</span>
                    <span class="detail-email">&lt;{inspectCommit?.author.email}&gt;</span>
                    <span class="detail-sha">{inspectCommit?.sha.slice(0, 12)}</span>
                  </div>
                  {#if inspectCommit?.message && inspectCommit.message.includes('\n')}
                    <div class="detail-body">{inspectCommit.message.split('\n').slice(1).join('\n').trim()}</div>
                  {/if}

                  {#if inspectLoading}
                    <div class="detail-loading">loading files...</div>
                  {:else if inspectFiles.length === 0}
                    <div class="empty-msg">No file changes found</div>
                  {:else}
                    <div class="detail-section-header">
                      <span>Changed files ({inspectFiles.length})</span>
                      <span class="detail-stats">
                        <span style="color:var(--success)">{inspectFiles.filter(f => f.status === 'added').length} added</span>
                        <span style="color:var(--warning)">{inspectFiles.filter(f => f.status === 'modified').length} modified</span>
                        <span style="color:var(--error)">{inspectFiles.filter(f => f.status === 'deleted').length} deleted</span>
                      </span>
                    </div>
                    <div class="detail-file-list">
                      {#each inspectFiles as file}
                        {@const isDiffOpen = inspectDiffFile === file.path}
                        <div class="detail-file-entry">
                          <button class="detail-file-row" on:click={() => handleInspectFileDiff(inspectCommit?.sha || '', file.path)} aria-expanded={isDiffOpen}>
                            <span class="file-status" style="color:{statusColor(file.status)}" title={statusWord(file.status)}>{statusLetter(file.status)}</span>
                            <span class="detail-file-path">
                              <span class="fname-dir">{fileDir(file.path)}</span><span class="fname-name">{fileName(file.path)}</span>
                            </span>
                            <svg class="expand-icon small" class:expanded={isDiffOpen} width="8" height="8" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                          </button>
                          {#if isDiffOpen && inspectDiff}
                            <div class="inline-diff">
                              <div class="inline-diff-header">
                                <span class="diff-add">+{inspectDiff.additions}</span>
                                <span class="diff-del">-{inspectDiff.deletions}</span>
                              </div>
                              <DiffView diff={inspectDiff} compact />
                            </div>
                          {/if}
                        </div>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .history { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .history-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    margin: -10px -14px;
  }
  .history-graph { display: flex; }
  .graph-canvas { flex-shrink: 0; position: relative; }
  .graph-svg { display: block; }
  .commit-list { flex: 1; min-width: 0; }
  .commit-entry { border-bottom: 1px solid var(--border); }
  .commit-entry:last-child { border-bottom: none; }
  .commit-open { background: var(--bg-deep); }
  .commit-row {
    display: flex;
    align-items: center;
    width: 100%;
    text-align: left;
    cursor: pointer;
    padding: 0 8px 0 0;
    box-sizing: border-box;
  }
  .commit-row:hover { background: var(--bg-hover); }
  .commit-row-inner { flex: 1; padding: 4px 6px 4px 3px; min-width: 0; }
  .commit-top-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
  .commit-sha {
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--accent);
    font-weight: 600;
    flex-shrink: 0;
  }
  .branch-tag {
    font-size: 8px;
    font-weight: 600;
    padding: 0 4px;
    font-family: var(--font-editor);
    border: 1px solid;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    line-height: 14px;
  }
  .tag-dot { width: 4px; height: 4px; border-radius: 50%; display: inline-block; }
  .merge-badge {
    font-size: 8px;
    color: var(--text-muted);
    padding: 0 3px;
    border: 1px solid var(--border);
    font-family: var(--font-editor);
    line-height: 14px;
  }
  .commit-msg {
    font-size: 11px;
    color: var(--text-primary);
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }
  .commit-date {
    font-size: 9px;
    color: var(--text-muted);
    margin-left: auto;
    flex-shrink: 0;
    font-family: var(--font-editor);
  }
  .expand-icon { color: var(--text-muted); flex-shrink: 0; transition: transform 0.15s; }
  .expand-icon.expanded { transform: rotate(180deg); }
  .expand-icon.small { margin-left: auto; }

  .commit-detail { padding: 6px 10px 10px; border-top: 1px solid var(--border); }
  .detail-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    color: var(--text-muted);
    font-family: var(--font-editor);
    margin-bottom: 6px;
    flex-wrap: wrap;
  }
  .detail-author { font-weight: 600; color: var(--text-secondary); }
  .detail-email { opacity: 0.7; }
  .detail-sha { margin-left: auto; color: var(--accent); font-weight: 500; user-select: all; }
  .detail-body {
    font-size: 10.5px;
    color: var(--text-secondary);
    line-height: 1.4;
    margin-bottom: 8px;
    padding: 4px 6px;
    background: var(--bg-surface);
    border-left: 2px solid var(--border);
    white-space: pre-wrap;
  }
  .detail-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 3px 0;
    font-family: var(--font-editor);
    margin-bottom: 2px;
  }
  .detail-stats { display: flex; gap: 6px; font-size: 9px; font-weight: 500; }
  .detail-loading { font-size: 10.5px; color: var(--text-muted); font-style: italic; padding: 6px 0; }
  .detail-file-list { display: flex; flex-direction: column; }
  .detail-file-entry { border-bottom: 1px solid var(--border); }
  .detail-file-entry:last-child { border-bottom: none; }
  .detail-file-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 4px;
    width: 100%;
    text-align: left;
    font-family: var(--font-editor);
    font-size: 11px;
    cursor: pointer;
  }
  .detail-file-row:hover { background: var(--bg-hover); }
  .detail-file-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
  }
  .inline-diff {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    margin: 2px 0 4px 16px;
  }
  .inline-diff-header {
    padding: 3px 8px;
    border-bottom: 1px solid var(--border);
    font-size: 10px;
    font-family: var(--font-editor);
    display: flex;
    gap: 6px;
  }
</style>
