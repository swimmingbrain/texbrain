<script lang="ts">
  import { toasts } from '$lib/stores/app';

  const typeColors: Record<string, string> = {
    info: 'var(--accent)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    error: 'var(--error)'
  };
</script>

{#if $toasts.length > 0}
  <div class="toast-container">
    {#each $toasts as toast (toast.id)}
      <div class="toast" style="border-left-color: {typeColors[toast.type]}">
        <span>{toast.message}</span>
        <button
          class="close-btn"
          on:click={() => toasts.update(t => t.filter(x => x.id !== toast.id))}
          aria-label="Close"
        >&#xd7;</button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 52px;
    right: 12px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 4px;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-left: 2px solid var(--accent);
    color: var(--text-primary);
    font-size: 12px;
    animation: slide-in-right 150ms ease;
    min-width: 180px;
    max-width: 320px;
  }

  .toast span {
    flex: 1;
  }

  .close-btn {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1;
  }

  .close-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }
</style>
