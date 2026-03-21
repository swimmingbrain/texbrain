<script lang="ts">
  import { pendingTexFiles } from '$lib/project/store';
  import { selectEntryPoint } from '$lib/project/manager';

  function pick(path: string) {
    selectEntryPoint(path);
  }
</script>

{#if $pendingTexFiles.length > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" on:keydown={(e) => e.key === 'Escape' && pendingTexFiles.set([])}>
    <div class="picker">
      <h3>Select entry point</h3>
      <p class="hint">Choose the main .tex file to compile:</p>
      <ul class="file-list">
        {#each $pendingTexFiles as path}
          <li>
            <button class="file-btn" on:click={() => pick(path)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3"/><path d="M9 1v4h4" stroke="currentColor" stroke-width="1.3"/></svg>
              {path}
            </button>
          </li>
        {/each}
      </ul>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 1000;
    background: rgba(0,0,0,0.5);
    display: flex; align-items: center; justify-content: center;
  }
  .picker {
    background: var(--bg-surface);
    border: 1px solid var(--border);
    padding: 20px;
    min-width: 340px;
    max-width: 480px;
    max-height: 70vh;
    display: flex; flex-direction: column;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  h3 {
    margin: 0 0 4px;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
  }
  .hint {
    margin: 0 0 14px;
    font-size: 12px;
    color: var(--text-muted);
  }
  .file-list {
    list-style: none;
    margin: 0; padding: 0;
    overflow-y: auto;
  }
  .file-btn {
    display: flex; align-items: center; gap: 6px;
    width: 100%;
    padding: 6px 10px;
    font-size: 12.5px;
    font-family: var(--font-editor);
    color: var(--text-secondary);
    text-align: left;
  }
  .file-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
