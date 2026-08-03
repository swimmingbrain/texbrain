<script lang="ts">
  import { get } from 'svelte/store';
  import {
    gitPanelOpen, gitPanelTab, gitEnabled, gitCurrentBranch, gitBranches,
    gitStagedFiles, gitUnstagedFiles, gitCommitLog, gitLoading, gitChangeCount,
    gitAuthorName, gitAuthorEmail, gitAuthToken, gitCorsProxy, gitDiffFile, gitFileStatuses
  } from '$lib/git/store';
  import {
    stageFile, unstageFile, stageAll, unstageAll,
    commit, createBranch, switchBranch, deleteBranch, merge,
    addRemote, listRemotes, removeRemote, push, pull,
    refreshGitState, getFileDiff,
    getBranchTips, getCommitChangedFiles, getCommitFileDiff
  } from '$lib/git/engine';
  import type { GitFileDiff, GitCommitInfo } from '$lib/git/types';
  import { addToast } from '$lib/stores/app';

  export let onBranchSwitch: () => Promise<void> = async () => {};
  export let onInitRepo: () => Promise<void> = async () => {};

  let commitMsg = '';
  let newBranchName = '';
  let mergeBranch = '';
  let remoteUrl = '';
  let remoteName = 'origin';
  let remotes: Array<{ remote: string; url: string }> = [];
  let diffResult: GitFileDiff | null = null;
  let showingDiff = false;
  let operating = false;

  // commit detail view
  let inspectCommit: GitCommitInfo | null = null;
  let inspectFiles: Array<{ path: string; status: 'added' | 'modified' | 'deleted' }> = [];
  let inspectLoading = false;
  let inspectDiff: GitFileDiff | null = null;
  let inspectDiffFile: string | null = null;

  $: if ($gitPanelOpen && $gitPanelTab === 'remote' && $gitEnabled) {
    loadRemotes();
  }

  // opening the panel is a natural moment to look at the folder again
  $: if ($gitPanelOpen && $gitEnabled) {
    refreshGitState();
  }

  async function loadRemotes() {
    remotes = await listRemotes();
  }

  function close() {
    gitPanelOpen.set(false);
    showingDiff = false;
    diffResult = null;
    inspectCommit = null;
    inspectDiff = null;
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (inspectDiff) { inspectDiff = null; inspectDiffFile = null; }
      else if (inspectCommit) { inspectCommit = null; inspectFiles = []; }
      else if (showingDiff) { showingDiff = false; diffResult = null; }
      else close();
    }
  }

  async function handleInit() {
    operating = true;
    try {
      await onInitRepo();
      addToast('Git repository initialized', 'success');
    } catch (err: any) {
      addToast('Failed to initialize: ' + (err?.message || err), 'error');
    } finally {
      operating = false;
    }
  }

  async function handleStage(path: string) {
    await stageFile(path);
    await refreshGitState();
  }

  async function handleUnstage(path: string) {
    await unstageFile(path);
    await refreshGitState();
  }

  async function handleStageAll() {
    await stageAll();
    await refreshGitState();
  }

  async function handleUnstageAll() {
    await unstageAll();
    await refreshGitState();
  }

  async function handleCommit() {
    const msg = commitMsg.trim();
    if (!msg) { addToast('Enter a commit message', 'warning'); return; }
    if ($gitStagedFiles.length === 0) { addToast('No staged changes to commit', 'warning'); return; }

    operating = true;
    try {
      const sha = await commit(msg);
      commitMsg = '';
      await refreshGitState();
      addToast(`Committed ${sha.slice(0, 7)}`, 'success');
    } catch (err: any) {
      addToast('Commit failed: ' + (err?.message || err), 'error');
    } finally {
      operating = false;
    }
  }

  async function handleViewDiff(path: string) {
    try {
      diffResult = await getFileDiff(path);
      showingDiff = true;
    } catch (err: any) {
      addToast('Failed to load diff: ' + (err?.message || err), 'error');
    }
  }

  async function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    operating = true;
    try {
      await createBranch(name);
      newBranchName = '';
      await refreshGitState();
      addToast(`Branch '${name}' created`, 'success');
    } catch (err: any) {
      addToast('Failed: ' + (err?.message || err), 'error');
    } finally {
      operating = false;
    }
  }

  async function handleSwitchBranch(name: string) {
    if (name === $gitCurrentBranch) return;
    operating = true;
    try {
      await switchBranch(name);
      await onBranchSwitch();
      await refreshGitState();
      addToast(`Switched to '${name}'`, 'success');
    } catch (err: any) {
      addToast('Switch failed: ' + (err?.message || err), 'error');
    } finally {
      operating = false;
    }
  }

  async function handleDeleteBranch(name: string) {
    if (name === $gitCurrentBranch) { addToast('Cannot delete current branch', 'warning'); return; }
    operating = true;
    try {
      await deleteBranch(name);
      await refreshGitState();
      addToast(`Branch '${name}' deleted`, 'success');
    } catch (err: any) {
      addToast('Delete failed: ' + (err?.message || err), 'error');
    } finally {
      operating = false;
    }
  }

  async function handleMerge() {
    if (!mergeBranch || mergeBranch === $gitCurrentBranch) return;
    operating = true;
    try {
      const result = await merge(mergeBranch);
      if (result.success) {
        await onBranchSwitch();
        await refreshGitState();
        addToast(`Merged '${mergeBranch}' into '${$gitCurrentBranch}'`, 'success');
        mergeBranch = '';
      } else {
        addToast('Merge conflicts: ' + result.conflicts.join(', '), 'error');
      }
    } catch (err: any) {
      addToast('Merge failed: ' + (err?.message || err), 'error');
    } finally {
      operating = false;
    }
  }

  async function handleAddRemote() {
    const url = remoteUrl.trim();
    const name = remoteName.trim() || 'origin';
    if (!url) return;
    try {
      await addRemote(name, url);
      await loadRemotes();
      remoteUrl = '';
      addToast(`Remote '${name}' added`, 'success');
    } catch (err: any) {
      addToast('Failed: ' + (err?.message || err), 'error');
    }
  }

  async function handleRemoveRemote(name: string) {
    try {
      await removeRemote(name);
      await loadRemotes();
      addToast(`Remote '${name}' removed`, 'success');
    } catch (err: any) {
      addToast('Failed: ' + (err?.message || err), 'error');
    }
  }

  async function handlePush() {
    operating = true;
    try {
      await push();
      addToast('Pushed successfully', 'success');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('CORS') || msg.includes('Failed to fetch')) {
        addToast('Push failed: CORS error. Check your CORS proxy setting in the Remote tab', 'error');
      } else {
        addToast('Push failed: ' + msg, 'error');
      }
    } finally {
      operating = false;
    }
  }

  async function handlePull() {
    operating = true;
    try {
      await pull();
      await onBranchSwitch();
      await refreshGitState();
      addToast('Pulled successfully', 'success');
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('CORS') || msg.includes('Failed to fetch')) {
        addToast('Pull failed: CORS error. Check your CORS proxy setting in the Remote tab', 'error');
      } else {
        addToast('Pull failed: ' + msg, 'error');
      }
    } finally {
      operating = false;
    }
  }

  // open commit detail view
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

  // view diff for a file in a specific commit
  async function handleInspectFileDiff(sha: string, path: string) {
    if (inspectDiffFile === path) {
      inspectDiff = null;
      inspectDiffFile = null;
      return;
    }
    inspectDiffFile = path;
    try {
      inspectDiff = await getCommitFileDiff(sha, path);
    } catch (err: any) {
      addToast('Failed to load diff: ' + (err?.message || err), 'error');
      inspectDiff = null;
      inspectDiffFile = null;
    }
  }

  function statusLetter(status: string): string {
    switch (status) {
      case 'modified': return 'M';
      case 'added': return 'A';
      case 'deleted': return 'D';
      case 'untracked': return '?';
      default: return ' ';
    }
  }

  function statusColor(status: string): string {
    switch (status) {
      case 'modified': return 'var(--warning)';
      case 'added': case 'untracked': return 'var(--success)';
      case 'deleted': return 'var(--error)';
      default: return 'var(--text-muted)';
    }
  }

  const GRAPH_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#f97316'];

  let branchTips: Map<string, GitCommitInfo> = new Map();
  $: if ($gitPanelOpen && $gitPanelTab === 'branches' && $gitEnabled) {
    getBranchTips().then(tips => { branchTips = tips; });
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

  function formatDate(ts: number): string {
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

  function fileName(path: string): string {
    return path.split('/').pop() || path;
  }

  function fileDir(path: string): string {
    const parts = path.split('/');
    if (parts.length <= 1) return '';
    return parts.slice(0, -1).join('/') + '/';
  }
</script>

{#if $gitPanelOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="git-overlay" on:click={handleOverlayClick} on:keydown={handleKeydown}>
    <div class="git-panel">
      <div class="panel-header">
        <h3>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right:6px;vertical-align:-2px"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5zm-2 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/></svg>
          Git
        </h3>
        <button class="close-btn" on:click={close}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>

      {#if !$gitEnabled}
        <div class="panel-body center-content">
          <div class="init-prompt">
            <svg width="40" height="40" viewBox="0 0 16 16" fill="none" style="color:var(--text-muted);margin-bottom:12px"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5zm-2 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/></svg>
            <p class="init-text">This project is not a Git repository.</p>
            <p class="init-hint">Initialize version control to track changes, create branches, and sync with a remote.</p>
            <button class="btn primary" on:click={handleInit} disabled={operating} style="width:100%">
              {operating ? 'Initializing...' : 'Initialize Repository'}
            </button>
          </div>
        </div>
      {:else}
        <div class="tab-bar">
          <button class="tab" class:active={$gitPanelTab === 'changes'} on:click={() => gitPanelTab.set('changes')}>
            Changes
            {#if $gitChangeCount > 0}<span class="tab-badge">{$gitChangeCount}</span>{/if}
          </button>
          <button class="tab" class:active={$gitPanelTab === 'history'} on:click={() => { gitPanelTab.set('history'); inspectCommit = null; inspectDiff = null; }}>History</button>
          <button class="tab" class:active={$gitPanelTab === 'branches'} on:click={() => gitPanelTab.set('branches')}>Branches</button>
          <button class="tab" class:active={$gitPanelTab === 'remote'} on:click={() => gitPanelTab.set('remote')}>Remote</button>
        </div>

        <div class="panel-body">
          {#if showingDiff && diffResult}
            <div class="diff-header">
              <button class="back-btn" on:click={() => { showingDiff = false; diffResult = null; }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                Back
              </button>
              <span class="diff-path">{diffResult.path}</span>
              <span class="diff-stats">
                <span class="diff-add">+{diffResult.additions}</span>
                <span class="diff-del">-{diffResult.deletions}</span>
              </span>
            </div>
            <div class="diff-content">
              {#if diffResult.lines.length === 0}
                <div class="empty-msg">No changes</div>
              {:else}
                {#each diffResult.lines as line}
                  <div class="diff-line" class:diff-line-add={line.type === 'add'} class:diff-line-remove={line.type === 'remove'} class:diff-line-ctx={line.type === 'context'}>
                    <span class="diff-ln old">{line.oldLineNum ?? ''}</span>
                    <span class="diff-ln new">{line.newLineNum ?? ''}</span>
                    <span class="diff-sign">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
                    <span class="diff-text">{line.content}</span>
                  </div>
                {/each}
              {/if}
            </div>

          {:else if $gitPanelTab === 'changes'}
            <div class="branch-badge">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><circle cx="5" cy="4" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="12" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="6" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M5 6v4M7 5l3.5 1" stroke="currentColor" stroke-width="1.2"/></svg>
              {$gitCurrentBranch}
            </div>

            {#if $gitStagedFiles.length > 0}
              <div class="section-header">
                <span>Staged ({$gitStagedFiles.length})</span>
                <button class="link-btn" on:click={handleUnstageAll}>Unstage All</button>
              </div>
              <div class="file-list">
                {#each $gitStagedFiles as file}
                  <div class="file-item">
                    <span class="file-status" style="color:{statusColor(file.status)}">{statusLetter(file.status)}</span>
                    <button class="file-name" on:click={() => handleViewDiff(file.path)} title="View diff">
                      <span class="fname-dir">{fileDir(file.path)}</span><span class="fname-name">{fileName(file.path)}</span>
                    </button>
                    <button class="file-action" on:click={() => handleUnstage(file.path)} title="Unstage">&#x2212;</button>
                  </div>
                {/each}
              </div>
            {/if}

            <div class="section-header">
              <span>Changes ({$gitUnstagedFiles.length})</span>
              {#if $gitUnstagedFiles.length > 0}
                <button class="link-btn" on:click={handleStageAll}>Stage All</button>
              {/if}
            </div>
            {#if $gitUnstagedFiles.length > 0}
              <div class="file-list">
                {#each $gitUnstagedFiles as file}
                  <div class="file-item">
                    <span class="file-status" style="color:{statusColor(file.status)}">{statusLetter(file.status)}</span>
                    <button class="file-name" on:click={() => handleViewDiff(file.path)} title="View diff">
                      <span class="fname-dir">{fileDir(file.path)}</span><span class="fname-name">{fileName(file.path)}</span>
                    </button>
                    <button class="file-action add" on:click={() => handleStage(file.path)} title="Stage">+</button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="empty-msg">No unstaged changes</p>
            {/if}

            <div class="commit-form">
              <textarea
                class="commit-input"
                bind:value={commitMsg}
                placeholder="Commit message..."
                rows="3"
                on:keydown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCommit(); } }}
              ></textarea>
              <button class="btn primary commit-btn" on:click={handleCommit} disabled={operating || $gitStagedFiles.length === 0 || !commitMsg.trim()}>
                {operating ? 'Committing...' : `Commit (${$gitStagedFiles.length} file${$gitStagedFiles.length !== 1 ? 's' : ''})`}
              </button>
            </div>

          {:else if $gitPanelTab === 'history'}
            {#if $gitCommitLog.length === 0}
              <p class="empty-msg">No commits yet</p>
            {:else}
              <div class="history-scroll">
                <div class="history-graph">
                  <div class="graph-canvas" style="width:{graphSvgWidth(graphRows)}px">
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
                        <circle {cx} {cy} r="{isMerge ? DOT_R + 1 : DOT_R}" fill="{isActive ? color : color}" stroke="{isActive ? '#fff' : 'none'}" stroke-width="1" />
                      {/each}
                    </svg>
                  </div>
                  <div class="commit-list">
                    {#each graphRows as row, i}
                      {@const isOpen = inspectCommit?.sha === row.commit.sha}
                      <div class="commit-entry" class:commit-open={isOpen}>
                        <button class="commit-row" style="height:{ROW_HEIGHT}px" on:click={() => handleInspectCommit(row.commit)}>
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
                          <svg class="expand-icon" class:expanded={isOpen} width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
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
                                    <button class="detail-file-row" on:click={() => handleInspectFileDiff(inspectCommit?.sha || '', file.path)}>
                                      <span class="file-status" style="color:{statusColor(file.status)}">{statusLetter(file.status)}</span>
                                      <span class="detail-file-path">
                                        <span class="fname-dir">{fileDir(file.path)}</span><span class="fname-name">{fileName(file.path)}</span>
                                      </span>
                                      <svg class="expand-icon small" class:expanded={isDiffOpen} width="8" height="8" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                                    </button>
                                    {#if isDiffOpen && inspectDiff}
                                      <div class="inline-diff">
                                        <div class="inline-diff-header">
                                          <span class="diff-add">+{inspectDiff.additions}</span>
                                          <span class="diff-del">-{inspectDiff.deletions}</span>
                                        </div>
                                        <div class="inline-diff-body">
                                          {#if inspectDiff.lines.length === 0}
                                            <div class="empty-msg" style="padding:4px 8px">No changes</div>
                                          {:else}
                                            {#each inspectDiff.lines as line}
                                              <div class="diff-line" class:diff-line-add={line.type === 'add'} class:diff-line-remove={line.type === 'remove'} class:diff-line-ctx={line.type === 'context'}>
                                                <span class="diff-ln old">{line.oldLineNum ?? ''}</span>
                                                <span class="diff-ln new">{line.newLineNum ?? ''}</span>
                                                <span class="diff-sign">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
                                                <span class="diff-text">{line.content}</span>
                                              </div>
                                            {/each}
                                          {/if}
                                        </div>
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

          {:else if $gitPanelTab === 'branches'}
            <div class="section-header"><span>Branches ({$gitBranches.length})</span></div>
            <div class="branch-list">
              {#each $gitBranches as branch, bi}
                {@const tip = branchTips.get(branch)}
                {@const branchColor = GRAPH_COLORS[bi % GRAPH_COLORS.length]}
                <div class="branch-card" class:current={branch === $gitCurrentBranch}>
                  <div class="branch-card-header">
                    <span class="branch-color-dot" style="background:{branchColor}"></span>
                    <span class="branch-name">{branch}</span>
                    {#if branch === $gitCurrentBranch}
                      <span class="current-badge">current</span>
                    {:else}
                      <button class="link-btn small" on:click={() => handleSwitchBranch(branch)}>Switch</button>
                      <button class="link-btn small danger" on:click={() => handleDeleteBranch(branch)}>Delete</button>
                    {/if}
                  </div>
                  {#if tip}
                    <div class="branch-tip-info">
                      <span class="tip-sha">{tip.shortSha}</span>
                      <span class="tip-msg">{tip.message.split('\n')[0]}</span>
                    </div>
                    <div class="branch-tip-meta">
                      <span class="tip-author">{tip.author.name}</span>
                      <span class="tip-date">{formatDate(tip.author.timestamp)}</span>
                    </div>
                  {/if}
                </div>
              {/each}
            </div>

            <div class="section-header" style="margin-top:14px"><span>New Branch</span></div>
            <div class="inline-form">
              <input type="text" bind:value={newBranchName} placeholder="Branch name" class="field-input"
                on:keydown={(e) => { if (e.key === 'Enter') handleCreateBranch(); }} />
              <button class="btn primary small" on:click={handleCreateBranch} disabled={!newBranchName.trim() || operating}>Create</button>
            </div>

            <div class="section-header" style="margin-top:14px"><span>Merge into {$gitCurrentBranch}</span></div>
            <div class="inline-form">
              <select bind:value={mergeBranch} class="field-input">
                <option value="">Select branch...</option>
                {#each $gitBranches.filter(b => b !== $gitCurrentBranch) as b}
                  <option value={b}>{b}</option>
                {/each}
              </select>
              <button class="btn primary small" on:click={handleMerge} disabled={!mergeBranch || operating}>Merge</button>
            </div>

          {:else if $gitPanelTab === 'remote'}
            <div class="section-header"><span>Author</span></div>
            <div class="field">
              <label for="git-name">Name</label>
              <input id="git-name" type="text" bind:value={$gitAuthorName} placeholder="Your name" class="field-input" />
            </div>
            <div class="field">
              <label for="git-email">Email</label>
              <input id="git-email" type="text" bind:value={$gitAuthorEmail} placeholder="your@email.com" class="field-input" />
            </div>

            <div class="section-header" style="margin-top:14px"><span>Remotes</span></div>
            {#if remotes.length > 0}
              <div class="remote-list">
                {#each remotes as r}
                  <div class="remote-item">
                    <span class="remote-name">{r.remote}</span>
                    <span class="remote-url">{r.url}</span>
                    <button class="link-btn small danger" on:click={() => handleRemoveRemote(r.remote)}>Remove</button>
                  </div>
                {/each}
              </div>
            {:else}
              <p class="empty-msg">No remotes configured</p>
            {/if}

            <div class="inline-form" style="margin-top:6px">
              <input type="text" bind:value={remoteName} placeholder="origin" class="field-input" style="width:70px;flex:0 0 auto" />
              <input type="text" bind:value={remoteUrl} placeholder="https://github.com/..." class="field-input" />
              <button class="btn primary small" on:click={handleAddRemote} disabled={!remoteUrl.trim()}>Add</button>
            </div>

            <div class="section-header" style="margin-top:14px"><span>Authentication</span></div>
            <div class="field">
              <label for="git-token">Personal Access Token</label>
              <input id="git-token" type="password" bind:value={$gitAuthToken} placeholder="ghp_..." class="field-input" />
              <p class="hint">Required for push/pull to private repos</p>
            </div>

            <div class="field">
              <label for="git-proxy">CORS Proxy</label>
              <input id="git-proxy" type="text" bind:value={$gitCorsProxy} placeholder="https://cors.isomorphic-git.org" class="field-input" />
              <p class="hint">Required for browser-based push/pull. Leave empty if self-hosting.</p>
            </div>

            <div class="push-pull-row">
              <button class="btn primary" on:click={handlePush} disabled={operating || remotes.length === 0}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="margin-right:4px"><path d="M8 12V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {operating ? 'Pushing...' : 'Push'}
              </button>
              <button class="btn secondary" on:click={handlePull} disabled={operating || remotes.length === 0}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style="margin-right:4px"><path d="M8 3v9M4 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {operating ? 'Pulling...' : 'Pull'}
              </button>
            </div>
          {/if}
        </div>

        {#if $gitLoading}
          <div class="loading-bar"></div>
        {/if}
      {/if}
    </div>
  </div>
{/if}

<style>
  .git-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.4);
  }
  .git-panel {
    width: 440px;
    max-width: 90vw;
    height: 100%;
    background: var(--bg-surface);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    box-shadow: -4px 0 16px rgba(0, 0, 0, 0.2);
    animation: slideIn 120ms ease;
    position: relative;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .panel-header h3 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
    display: flex;
    align-items: center;
  }
  .close-btn {
    padding: 3px;
    color: var(--text-muted);
  }
  .close-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    padding: 0 6px;
  }
  .tab {
    padding: 6px 10px;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--text-muted);
    border-bottom: 1px solid transparent;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .tab:hover { color: var(--text-secondary); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-badge {
    font-size: 9px;
    font-family: var(--font-editor);
    background: var(--accent);
    color: #111;
    padding: 0 4px;
    min-width: 14px;
    text-align: center;
    line-height: 14px;
  }

  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 10px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .panel-body.center-content {
    align-items: center;
    justify-content: center;
  }

  .init-prompt {
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .init-text { font-size: 13px; color: var(--text-primary); margin: 0; font-weight: 500; }
  .init-hint { font-size: 11.5px; color: var(--text-muted); margin: 0; line-height: 1.5; }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 4px 0;
    font-family: var(--font-editor);
  }

  .file-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .file-item {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 5px;
    font-size: 11.5px;
    font-family: var(--font-editor);
  }
  .file-item:hover { background: var(--bg-hover); }
  .file-status {
    font-weight: 700;
    font-size: 10px;
    width: 12px;
    text-align: center;
    flex-shrink: 0;
  }
  .file-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-primary);
    text-align: left;
    font-family: var(--font-editor);
    font-size: 11.5px;
    cursor: pointer;
    display: flex;
  }
  .file-name:hover { text-decoration: underline; }
  .fname-dir { color: var(--text-muted); }
  .fname-name { color: var(--text-primary); }
  .file-action {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    color: var(--error);
    flex-shrink: 0;
  }
  .file-action:hover { background: var(--bg-hover); }
  .file-action.add { color: var(--success); }

  .commit-form {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .commit-input {
    padding: 6px 8px;
    font-size: 11.5px;
    font-family: var(--font-editor);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: var(--text-primary);
    outline: none;
    resize: vertical;
    min-height: 52px;
  }
  .commit-input:focus { border-color: var(--accent); }
  .commit-input::placeholder { color: var(--text-muted); }

  .branch-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11.5px;
    font-weight: 500;
    color: var(--text-primary);
    padding: 5px 8px;
    background: var(--bg-deep);
    border: 1px solid var(--border);
  }

  /* history */
  .history-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    margin: -10px -14px;
  }
  .history-graph {
    display: flex;
  }
  .graph-canvas {
    flex-shrink: 0;
    position: relative;
  }
  .graph-svg {
    display: block;
  }
  .commit-list {
    flex: 1;
    min-width: 0;
  }
  .commit-entry {
    border-bottom: 1px solid var(--border);
  }
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
  .commit-row-inner {
    flex: 1;
    padding: 4px 6px 4px 3px;
    min-width: 0;
  }
  .commit-top-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
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
  .tag-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    display: inline-block;
  }
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
  .expand-icon {
    color: var(--text-muted);
    flex-shrink: 0;
    transition: transform 0.15s;
  }
  .expand-icon.expanded { transform: rotate(180deg); }
  .expand-icon.small { margin-left: auto; }

  /* commit detail */
  .commit-detail {
    padding: 6px 10px 10px;
    border-top: 1px solid var(--border);
  }
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
  .detail-sha {
    margin-left: auto;
    color: var(--accent);
    font-weight: 500;
    user-select: all;
  }
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
  .detail-stats {
    display: flex;
    gap: 6px;
    font-size: 9px;
    font-weight: 500;
  }
  .detail-loading {
    font-size: 10.5px;
    color: var(--text-muted);
    font-style: italic;
    padding: 6px 0;
  }
  .detail-file-list {
    display: flex;
    flex-direction: column;
  }
  .detail-file-entry {
    border-bottom: 1px solid var(--border);
  }
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

  /* inline diff inside commit detail */
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
  .inline-diff-body {
    max-height: 300px;
    overflow-y: auto;
    font-family: var(--font-editor);
    font-size: 10.5px;
    line-height: 1.5;
  }

  /* branches */
  .branch-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .branch-card {
    padding: 7px 8px;
    border: 1px solid var(--border);
    background: var(--bg-deep);
  }
  .branch-card:hover { border-color: var(--text-muted); }
  .branch-card.current { border-color: var(--success); border-left: 2px solid var(--success); }
  .branch-card-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .branch-color-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .branch-name {
    flex: 1;
    font-family: var(--font-editor);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--text-primary);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .current-badge {
    font-size: 9px;
    color: var(--success);
    padding: 0 5px;
    background: rgba(115, 201, 145, 0.1);
    font-weight: 500;
    font-family: var(--font-editor);
  }
  .branch-tip-info {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    padding-left: 12px;
  }
  .tip-sha {
    font-family: var(--font-editor);
    font-size: 10px;
    color: var(--accent);
    font-weight: 500;
    flex-shrink: 0;
  }
  .tip-msg {
    font-size: 10.5px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .branch-tip-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 2px;
    padding-left: 12px;
    font-size: 10px;
    color: var(--text-muted);
  }
  .tip-author { font-weight: 500; }
  .tip-date { opacity: 0.8; }

  /* remote */
  .remote-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .remote-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 7px;
    background: var(--bg-deep);
    font-size: 11.5px;
  }
  .remote-name {
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-editor);
  }
  .remote-url {
    flex: 1;
    color: var(--text-muted);
    font-family: var(--font-editor);
    font-size: 10.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .push-pull-row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .push-pull-row .btn { flex: 1; display: flex; align-items: center; justify-content: center; }

  /* diff viewer */
  .diff-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .back-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--accent);
    padding: 3px 6px;
  }
  .back-btn:hover { background: var(--bg-hover); }
  .diff-path {
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-primary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .diff-stats { font-size: 10.5px; font-family: var(--font-editor); }
  .diff-add { color: var(--success); }
  .diff-del { color: var(--error); margin-left: 3px; }
  .diff-content {
    flex: 1;
    overflow: auto;
    font-family: var(--font-editor);
    font-size: 11px;
    line-height: 1.5;
  }
  .diff-line {
    display: flex;
    white-space: pre;
    min-height: 17px;
  }
  .diff-line-add { background: rgba(115, 201, 145, 0.08); }
  .diff-line-remove { background: rgba(224, 108, 117, 0.08); }
  .diff-line-ctx { }
  .diff-ln {
    width: 28px;
    text-align: right;
    color: var(--text-muted);
    padding-right: 4px;
    flex-shrink: 0;
    user-select: none;
    opacity: 0.5;
    font-size: 10px;
  }
  .diff-sign {
    width: 12px;
    text-align: center;
    flex-shrink: 0;
    color: var(--text-muted);
  }
  .diff-line-add .diff-sign { color: var(--success); font-weight: 700; }
  .diff-line-remove .diff-sign { color: var(--error); font-weight: 700; }
  .diff-text {
    flex: 1;
    color: var(--text-primary);
  }
  .diff-line-add .diff-text { color: var(--success); }
  .diff-line-remove .diff-text { color: var(--error); opacity: 0.8; }

  /* shared form elements */
  .field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .field label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-muted);
    font-family: var(--font-editor);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .field-input {
    padding: 6px 8px;
    font-size: 12px;
    font-family: var(--font-editor);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: var(--text-primary);
    outline: none;
    flex: 1;
    min-width: 0;
  }
  .field-input:focus { border-color: var(--accent); }
  .field-input::placeholder { color: var(--text-muted); }
  select.field-input { cursor: pointer; }
  .hint {
    font-size: 10.5px;
    color: var(--text-muted);
    line-height: 1.3;
  }
  .inline-form {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .btn {
    padding: 7px 12px;
    font-size: 12px;
    font-weight: 500;
    text-align: center;
    cursor: pointer;
  }
  .btn.primary { background: var(--accent); color: #111; }
  .btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
  .btn.primary:disabled { opacity: 0.5; cursor: default; }
  .btn.secondary { background: var(--bg-deep); color: var(--text-primary); border: 1px solid var(--border); }
  .btn.secondary:hover:not(:disabled) { background: var(--bg-hover); }
  .btn.small { padding: 4px 8px; font-size: 10.5px; }
  .commit-btn { width: 100%; }

  .link-btn {
    font-size: 10.5px;
    color: var(--accent);
    cursor: pointer;
  }
  .link-btn:hover { color: var(--accent-hover); text-decoration: underline; }
  .link-btn.small { font-size: 10px; }
  .link-btn.danger { color: var(--error); }
  .link-btn.danger:hover { color: var(--error); }

  .empty-msg {
    font-size: 11.5px;
    color: var(--text-muted);
    font-style: italic;
    padding: 4px 0;
  }

  .loading-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    animation: loadPulse 1.5s ease infinite;
  }
  @keyframes loadPulse {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
</style>
