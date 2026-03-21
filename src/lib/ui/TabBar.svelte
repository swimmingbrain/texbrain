<script lang="ts">
  import { files, activeFileId, setActiveTab, closeFileTab } from '$lib/project/store';

  function handleClose(e: MouseEvent, id: string) {
    e.stopPropagation();
    const file = $files.find(f => f.id === id);
    if (file?.dirty) {
      if (!confirm(`"${file.name}" has unsaved changes. Close anyway?`)) return;
    }
    closeFileTab(id);
  }
</script>

{#if $files.length > 0}
  <div class="tab-bar">
    {#each $files as file (file.id)}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="tab"
        class:active={file.id === $activeFileId}
        on:click={() => setActiveTab(file.id)}
        on:keydown={(e) => { if (e.key === 'Enter') setActiveTab(file.id) }}
        title={file.name}
        role="tab"
        tabindex="0"
        aria-selected={file.id === $activeFileId}
      >
        <span class="tab-name">{file.name}</span>
        {#if file.dirty}
          <span class="dirty-dot"></span>
        {/if}
        <button
          class="tab-close"
          on:click={(e) => handleClose(e, file.id)}
          aria-label="Close tab"
        >&#xd7;</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .tab-bar {
    display: flex;
    align-items: stretch;
    height: 32px;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .tab-bar::-webkit-scrollbar {
    height: 0;
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 12px;
    font-size: 11.5px;
    color: var(--text-muted);
    border-right: 1px solid var(--border);
    white-space: nowrap;
    min-width: 0;
    max-width: 160px;
    position: relative;
    cursor: pointer;
  }

  .tab:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }

  .tab.active {
    background: var(--bg-surface);
    color: var(--text-primary);
  }

  .tab.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--accent);
  }

  .tab-name {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .dirty-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }

  .tab-close {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 1px;
    font-size: 13px;
    color: var(--text-muted);
    opacity: 0;
  }

  .tab:hover .tab-close {
    opacity: 1;
  }

  .tab-close:hover {
    background: var(--bg-elevated);
    color: var(--text-primary);
  }
</style>
