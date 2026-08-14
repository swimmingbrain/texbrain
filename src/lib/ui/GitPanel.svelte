<script lang="ts">
  import { gitPanelOpen, gitPanelTab, gitEnabled, gitCurrentBranch, gitChangeCount, gitLoading, gitProgress, gitSync } from '$lib/git/store';
  import { refreshGitState } from '$lib/git/engine';
  import StartRepo from './git/StartRepo.svelte';
  import ChangesTab from './git/ChangesTab.svelte';
  import HistoryTab from './git/HistoryTab.svelte';
  import BranchesTab from './git/BranchesTab.svelte';
  import SyncTab from './git/SyncTab.svelte';
  import SettingsTab from './git/SettingsTab.svelte';
  import './git/git.css';

  export let onBranchSwitch: () => Promise<void> = async () => {};
  export let onInitRepo: (options: { gitignore: boolean }) => Promise<void> = async () => {};

  const tabs = [
    { id: 'changes', label: 'Changes' },
    { id: 'history', label: 'History' },
    { id: 'branches', label: 'Branches' },
    { id: 'sync', label: 'Sync' },
    { id: 'settings', label: 'Settings' }
  ] as const;

  // opening the panel is a natural moment to look at the folder again
  $: if ($gitPanelOpen && $gitEnabled) {
    refreshGitState();
  }

  function close() {
    gitPanelOpen.set(false);
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

{#if $gitPanelOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="git-overlay" on:click={handleOverlayClick} on:keydown={handleKeydown}>
    <div class="git-panel">
      <div class="panel-header">
        <h3>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style="margin-right:6px;vertical-align:-2px" aria-hidden="true"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5zm-2 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/></svg>
          Git
        </h3>
        {#if $gitEnabled}
          <span class="branch-chip" title="Current branch">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="5" cy="4" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="5" cy="12" r="2" stroke="currentColor" stroke-width="1.2"/><circle cx="12" cy="6" r="2" stroke="currentColor" stroke-width="1.2"/><path d="M5 6v4M7 5l3.5 1" stroke="currentColor" stroke-width="1.2"/></svg>
            {$gitCurrentBranch}
            {#if $gitSync.remoteBranch && ($gitSync.ahead > 0 || $gitSync.behind > 0)}
              <span class="chip-counts">{#if $gitSync.ahead > 0}&uarr;{$gitSync.ahead}{/if}{#if $gitSync.behind > 0} &darr;{$gitSync.behind}{/if}</span>
            {/if}
          </span>
        {/if}
        <button class="close-btn" on:click={close} aria-label="Close git panel" title="Close (Esc)">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>

      {#if !$gitEnabled}
        <div class="panel-body">
          <StartRepo onStart={onInitRepo} />
        </div>
      {:else}
        <div class="tab-bar" role="tablist" aria-label="Git">
          {#each tabs as tab (tab.id)}
            <button
              class="tab"
              class:active={$gitPanelTab === tab.id}
              role="tab"
              aria-selected={$gitPanelTab === tab.id}
              on:click={() => gitPanelTab.set(tab.id)}
            >
              {tab.label}
              {#if tab.id === 'changes' && $gitChangeCount > 0}<span class="tab-badge">{$gitChangeCount}</span>{/if}
            </button>
          {/each}
        </div>

        <div class="panel-body" role="tabpanel">
          {#if $gitPanelTab === 'changes'}
            <ChangesTab onReload={onBranchSwitch} />
          {:else if $gitPanelTab === 'history'}
            <HistoryTab />
          {:else if $gitPanelTab === 'branches'}
            <BranchesTab onReload={onBranchSwitch} />
          {:else if $gitPanelTab === 'sync'}
            <SyncTab onReload={onBranchSwitch} />
          {:else}
            <SettingsTab />
          {/if}
        </div>

        {#if $gitProgress}
          <div class="progress" role="status" aria-live="polite">
            <span>{$gitProgress.phase}{$gitProgress.total > 0 ? ` ${Math.round(($gitProgress.loaded / $gitProgress.total) * 100)}%` : '...'}</span>
            <div class="progress-track"><div class="progress-fill" style="width:{$gitProgress.total > 0 ? Math.round(($gitProgress.loaded / $gitProgress.total) * 100) : 100}%" class:indeterminate={$gitProgress.total === 0}></div></div>
          </div>
        {:else if $gitLoading}
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
    gap: 10px;
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
  .branch-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-family: var(--font-editor);
    color: var(--text-primary);
    padding: 2px 7px;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip-counts { color: var(--accent); font-weight: 600; }
  .close-btn {
    margin-left: auto;
    padding: 4px;
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

  .progress {
    padding: 6px 14px 8px;
    border-top: 1px solid var(--border);
    font-size: 11px;
    font-family: var(--font-editor);
    color: var(--text-secondary);
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex-shrink: 0;
  }
  .progress-track { height: 3px; background: var(--bg-hover); overflow: hidden; }
  .progress-fill { height: 100%; background: var(--accent); transition: width 0.2s; }
  .progress-fill.indeterminate { width: 40% !important; animation: slide 1.2s ease-in-out infinite; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }

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
