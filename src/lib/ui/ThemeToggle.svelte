<script lang="ts">
  import { theme } from '$lib/stores/theme';

  function toggle() {
    theme.toggle();
  }
</script>

<button
  class="theme-toggle"
  on:click={toggle}
  title={$theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
  aria-label="Toggle theme"
>
  {#if $theme === 'dark'}
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="3.5" stroke="currentColor" stroke-width="1.5"/>
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
  {:else}
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <path d="M14 9.5A6.5 6.5 0 016.5 2 5.5 5.5 0 1014 9.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--text-muted);
  }

  .theme-toggle:hover {
    background: var(--bg-hover);
    color: var(--text-secondary);
  }
</style>
