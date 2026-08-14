<script lang="ts">
  import type { GitFileDiff } from '$lib/git/types';

  export let diff: GitFileDiff;
  export let compact = false;
</script>

<div class="diff-content" class:compact>
  {#if diff.lines.length === 0}
    <div class="empty-msg" style="padding:4px 8px">No changes</div>
  {:else}
    {#each diff.lines as line}
      <div class="diff-line" class:diff-line-add={line.type === 'add'} class:diff-line-remove={line.type === 'remove'}>
        <span class="diff-ln">{line.oldLineNum ?? ''}</span>
        <span class="diff-ln">{line.newLineNum ?? ''}</span>
        <span class="diff-sign">{line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}</span>
        <span class="diff-text">{line.content}</span>
      </div>
    {/each}
  {/if}
</div>
