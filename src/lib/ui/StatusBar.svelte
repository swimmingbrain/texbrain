<script lang="ts">
  import { compileStatus } from '$lib/stores/app';
  import { activeFile } from '$lib/project/store';
  import { collabActive, collabPeers, collabConnected } from '$lib/collab/store';
  import { gitEnabled, gitCurrentBranch } from '$lib/git/store';

  export let cursorLine = 1;
  export let cursorCol = 1;
  export let charCount = 0;
  export let wordCount = 0;
</script>

<div class="status-bar">
  <div class="left">
    <span class="status-item">
      {#if $compileStatus === 'compiling'}
        <span class="dot pulse" style="background: var(--warning)"></span>
        Compiling
      {:else if $compileStatus === 'success'}
        <span class="dot" style="background: var(--success)"></span>
        Ready
      {:else if $compileStatus === 'error'}
        <span class="dot" style="background: var(--error)"></span>
        Error
      {:else}
        <span class="dot" style="background: var(--text-muted)"></span>
        Idle
      {/if}
    </span>
    {#if $gitEnabled}
      <span class="sep"></span>
      <span class="status-item">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><circle cx="5" cy="4" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="12" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="6" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M5 6v4M7 5l3.5 1" stroke="currentColor" stroke-width="1.3"/></svg>
        {$gitCurrentBranch}
      </span>
    {/if}
    {#if $collabActive}
      <span class="sep"></span>
      <span class="status-item live">
        <span class="dot" style="background: var(--success)"></span>
        Live ({$collabPeers.length + 1})
      </span>
    {/if}
  </div>

  <div class="right">
    {#if $activeFile}
      <span class="status-item">Ln {cursorLine}, Col {cursorCol}</span>
      <span class="sep"></span>
      <span class="status-item">{charCount} chars</span>
      <span class="sep"></span>
      <span class="status-item">{wordCount} words</span>
      <span class="sep"></span>
      <span class="status-item">UTF-8</span>
      <span class="sep"></span>
      <span class="status-item">LaTeX</span>
    {/if}
  </div>
</div>

<style>
  .status-bar {
    height: var(--statusbar-h);
    background: var(--bg-surface);
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    font-size: 10.5px;
    color: var(--text-muted);
    flex-shrink: 0;
    user-select: none;
    font-family: var(--font-editor);
  }

  .left, .right {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .status-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .sep {
    width: 1px;
    height: 10px;
    background: var(--border);
    margin: 0 4px;
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
  }

  .pulse {
    animation: pulse 1.5s infinite;
  }
</style>
