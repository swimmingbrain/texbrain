<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher<{ resize: { delta: number } }>();

  let dragging = false;
  let startX = 0;

  function onMouseDown(e: MouseEvent) {
    dragging = true;
    startX = e.clientX;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startX;
      startX = e.clientX;
      dispatch('resize', { delta });
    }

    function onMouseUp() {
      dragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  class="resizer"
  class:active={dragging}
  on:mousedown={onMouseDown}
  role="separator"
  aria-orientation="vertical"
  tabindex="-1"
></div>

<style>
  .resizer {
    width: 3px;
    cursor: col-resize;
    background: var(--border);
    flex-shrink: 0;
    position: relative;
  }

  .resizer:hover,
  .resizer.active {
    background: var(--accent);
  }

  .resizer::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: -4px;
    right: -4px;
  }
</style>
