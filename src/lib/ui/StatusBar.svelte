<script lang="ts">
  import { compileStatus, compileProblems, previewTab, previewOpen } from '$lib/stores/app';
  import { activeFile } from '$lib/project/store';
  import { gitEnabled, gitCurrentBranch } from '$lib/git/store';

  export let cursorLine = 1;
  export let cursorCol = 1;
  export let charCount = 0;
  export let wordCount = 0;

  $: errors = $compileProblems.filter(p => p.severity === 'error').length;
  $: warnings = $compileProblems.filter(p => p.severity === 'warning').length;

  function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  // one click from the status bar to the problems, even when the preview
  // pane is closed
  function showProblems() {
    previewOpen.set(true);
    previewTab.set('problems');
  }
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
    {#if $compileStatus !== 'compiling' && (errors > 0 || warnings > 0)}
      <span class="sep"></span>
      <button class="status-item problems" class:has-errors={errors > 0} on:click={showProblems} title="Show the problems">
        {[errors > 0 ? plural(errors, 'error') : '', warnings > 0 ? plural(warnings, 'warning') : ''].filter(Boolean).join(', ')}
      </button>
    {/if}
    {#if $gitEnabled}
      <span class="sep"></span>
      <span class="status-item">
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" style="flex-shrink:0"><circle cx="5" cy="4" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="5" cy="12" r="2" stroke="currentColor" stroke-width="1.3"/><circle cx="12" cy="6" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M5 6v4M7 5l3.5 1" stroke="currentColor" stroke-width="1.3"/></svg>
        {$gitCurrentBranch}
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
    <span class="sep"></span>
    <span class="status-item credit">
      made with <span class="heart">&hearts;</span> by
      <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">Braian Plaku</a>
    </span>
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

  .problems { color: var(--warning); cursor: pointer; font-family: inherit; font-size: inherit; padding: 0 2px; }
  .problems.has-errors { color: var(--error); }
  .problems:hover { text-decoration: underline; }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
  }

  .pulse {
    animation: pulse 1.5s infinite;
  }

  .credit a {
    color: var(--accent);
    text-decoration: none;
  }

  .credit a:hover {
    color: var(--accent-hover);
  }

  .heart {
    color: var(--error);
    font-size: 11px;
  }
</style>
