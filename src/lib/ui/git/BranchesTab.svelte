<script lang="ts">
  import { gitBranches, gitCurrentBranch, gitPanelOpen } from '$lib/git/store';
  import { createBranch, switchBranch, deleteBranch, merge, refreshGitState, getBranchTips } from '$lib/git/engine';
  import { reportGitError } from '$lib/git/errors';
  import { addToast } from '$lib/stores/app';
  import type { GitCommitInfo } from '$lib/git/types';
  import { formatDate, GRAPH_COLORS } from './format';

  export let onReload: () => Promise<void>;

  let newBranchName = '';
  let mergeBranch = '';
  let operating = false;
  let branchTips: Map<string, GitCommitInfo> = new Map();

  $: if ($gitPanelOpen && $gitBranches) {
    getBranchTips().then(tips => { branchTips = tips; });
  }

  async function handleCreateBranch() {
    const name = newBranchName.trim();
    if (!name) return;
    operating = true;
    try {
      await createBranch(name);
      newBranchName = '';
      await refreshGitState();
      addToast(`Branch ${name} created. Switch to it to work there.`, 'success', 4000);
    } catch (err) {
      reportGitError(err, 'Create branch');
    } finally {
      operating = false;
    }
  }

  async function handleSwitchBranch(name: string) {
    if (name === $gitCurrentBranch) return;
    operating = true;
    try {
      await switchBranch(name);
      await onReload();
      await refreshGitState();
      addToast(`Now on ${name}`, 'success');
    } catch (err) {
      reportGitError(err, 'Switch');
    } finally {
      operating = false;
    }
  }

  async function handleDeleteBranch(name: string) {
    if (name === $gitCurrentBranch) { addToast('Switch to another branch first', 'warning'); return; }
    if (!confirm(`Delete the branch ${name}? Commits only on that branch are lost.`)) return;
    operating = true;
    try {
      await deleteBranch(name);
      await refreshGitState();
      addToast(`Branch ${name} deleted`, 'success');
    } catch (err) {
      reportGitError(err, 'Delete');
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
        await onReload();
        await refreshGitState();
        addToast(`Merged ${mergeBranch} into ${$gitCurrentBranch}`, 'success');
        mergeBranch = '';
      } else {
        addToast(`Both branches changed the same lines in ${result.conflicts.join(', ')}. Nothing was touched, resolve it in a terminal or merge the other way round.`, 'error', 8000);
      }
    } catch (err) {
      reportGitError(err, 'Merge');
    } finally {
      operating = false;
    }
  }
</script>

<div class="branches">
  <p class="hint">
    A branch is a separate line of work. Try a rewrite of a chapter on its own branch, and merge it back once you are happy.
  </p>

  <div class="section-header"><span>Branches ({$gitBranches.length})</span></div>
  <div class="branch-list">
    {#each $gitBranches as branch, bi (branch)}
      {@const tip = branchTips.get(branch)}
      {@const branchColor = GRAPH_COLORS[bi % GRAPH_COLORS.length]}
      <div class="branch-card" class:current={branch === $gitCurrentBranch}>
        <div class="branch-card-header">
          <span class="branch-color-dot" style="background:{branchColor}" aria-hidden="true"></span>
          <span class="branch-name">{branch}</span>
          {#if branch === $gitCurrentBranch}
            <span class="current-badge">you are here</span>
          {:else}
            <button class="link-btn small" on:click={() => handleSwitchBranch(branch)} disabled={operating}>Switch</button>
            <button class="link-btn small danger" on:click={() => handleDeleteBranch(branch)} disabled={operating} aria-label="Delete branch {branch}">Delete</button>
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

  <div class="section-header" style="margin-top:14px"><span>New branch</span></div>
  <div class="inline-form">
    <label for="new-branch" class="visually-hidden">Branch name</label>
    <input id="new-branch" type="text" bind:value={newBranchName} placeholder="for example: rewrite-intro" class="field-input"
      on:keydown={(e) => { if (e.key === 'Enter') handleCreateBranch(); }} />
    <button class="btn primary small" on:click={handleCreateBranch} disabled={!newBranchName.trim() || operating}>Create</button>
  </div>
  <p class="hint">Starts from where you are now ({$gitCurrentBranch}).</p>

  {#if $gitBranches.length > 1}
    <div class="section-header" style="margin-top:14px"><span>Merge into {$gitCurrentBranch}</span></div>
    <div class="inline-form">
      <label for="merge-branch" class="visually-hidden">Branch to merge</label>
      <select id="merge-branch" bind:value={mergeBranch} class="field-input">
        <option value="">Pick a branch...</option>
        {#each $gitBranches.filter(b => b !== $gitCurrentBranch) as b}
          <option value={b}>{b}</option>
        {/each}
      </select>
      <button class="btn primary small" on:click={handleMerge} disabled={!mergeBranch || operating}>Merge</button>
    </div>
    <p class="hint">Brings the commits of that branch into {$gitCurrentBranch}. The other branch stays as it is.</p>
  {/if}
</div>

<style>
  .branches { display: flex; flex-direction: column; gap: 8px; }
  .branch-list { display: flex; flex-direction: column; gap: 4px; }
  .branch-card { padding: 7px 8px; border: 1px solid var(--border); background: var(--bg-deep); }
  .branch-card:hover { border-color: var(--text-muted); }
  .branch-card.current { border-color: var(--success); border-left: 2px solid var(--success); }
  .branch-card-header { display: flex; align-items: center; gap: 6px; }
  .branch-color-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
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
  .branch-tip-info { display: flex; align-items: center; gap: 5px; margin-top: 4px; padding-left: 12px; }
  .tip-sha { font-family: var(--font-editor); font-size: 10px; color: var(--accent); font-weight: 500; flex-shrink: 0; }
  .tip-msg { font-size: 10.5px; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .branch-tip-meta { display: flex; align-items: center; gap: 5px; margin-top: 2px; padding-left: 12px; font-size: 10px; color: var(--text-muted); }
  .tip-author { font-weight: 500; }
  .tip-date { opacity: 0.8; }
</style>
