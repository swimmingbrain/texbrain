<script lang="ts">
  import { snippetPickerOpen } from '$lib/stores/app';
  import { allSnippets, searchSnippets, type Snippet } from '$lib/snippets/index';

  export let onInsert: (snippet: Snippet) => void = () => {};

  let query = '';
  let selectedIndex = 0;
  let inputEl: HTMLInputElement;

  $: results = searchSnippets(query);
  $: selectedIndex = Math.min(selectedIndex, Math.max(0, results.length - 1));

  function close() {
    snippetPickerOpen.set(false);
    query = '';
    selectedIndex = 0;
  }

  function insert(snippet: Snippet) {
    onInsert(snippet);
    close();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedIndex = (selectedIndex + 1) % results.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedIndex = (selectedIndex - 1 + results.length) % results.length;
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        insert(results[selectedIndex]);
      }
    }
  }

  const categoryLabels: Record<string, string> = {
    environment: 'ENV',
    command: 'CMD',
    math: 'MATH'
  };

  const categoryColors: Record<string, string> = {
    environment: 'var(--syntax-environment)',
    command: 'var(--syntax-command)',
    math: 'var(--syntax-math)'
  };

  $: if ($snippetPickerOpen) {
    setTimeout(() => inputEl?.focus(), 50);
  }
</script>

{#if $snippetPickerOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" on:click={close} on:keydown={handleKeydown}>
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="panel" on:click|stopPropagation>
      <div class="search-row">
        <input
          bind:this={inputEl}
          bind:value={query}
          placeholder="Search snippets..."
          class="search-input"
          on:keydown={handleKeydown}
        />
      </div>

      <div class="results">
        {#each results as snippet, i (snippet.trigger + snippet.name)}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="snippet-item"
            class:selected={i === selectedIndex}
            on:click={() => insert(snippet)}
            on:mouseenter={() => (selectedIndex = i)}
          >
            <div class="snippet-info">
              <span class="snippet-name">{snippet.name}</span>
              <span class="snippet-trigger">{snippet.trigger}</span>
            </div>
            <span
              class="snippet-badge"
              style="color: {categoryColors[snippet.category]}"
            >
              {categoryLabels[snippet.category]}
            </span>
          </div>
        {/each}
        {#if results.length === 0}
          <div class="no-results">No matching snippets</div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    background: rgba(0, 0, 0, 0.5);
  }

  .panel {
    width: 420px;
    max-height: 360px;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: fade-in 100ms ease;
    align-self: flex-start;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .search-row {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }

  .search-input {
    width: 100%;
    background: none;
    border: none;
    outline: none;
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-ui);
  }

  .search-input::placeholder {
    color: var(--text-muted);
  }

  .results {
    overflow-y: auto;
    padding: 4px;
  }

  .snippet-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 7px 10px;
    cursor: pointer;
  }

  .snippet-item.selected {
    background: var(--bg-hover);
  }

  .snippet-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .snippet-name {
    font-size: 12.5px;
    color: var(--text-primary);
  }

  .snippet-trigger {
    font-size: 10.5px;
    font-family: var(--font-editor);
    color: var(--text-muted);
  }

  .snippet-badge {
    font-size: 9px;
    font-weight: 600;
    font-family: var(--font-editor);
    letter-spacing: 0.04em;
  }

  .no-results {
    padding: 14px;
    text-align: center;
    color: var(--text-muted);
    font-size: 12px;
  }
</style>
