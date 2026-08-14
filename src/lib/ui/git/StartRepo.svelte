<script lang="ts">
  import { gitAuthorName, gitAuthorEmail } from '$lib/git/store';
  import { reportGitError } from '$lib/git/errors';
  import { addToast } from '$lib/stores/app';

  export let onStart: (options: { gitignore: boolean }) => Promise<void>;

  let gitignore = true;
  let operating = false;

  $: authorMissing = !$gitAuthorName.trim() || !$gitAuthorEmail.trim();

  async function start() {
    operating = true;
    try {
      await onStart({ gitignore });
      addToast(authorMissing ? 'Repository started. Stage your files and make the first commit.' : 'Repository started with a first commit', 'success', 4000);
    } catch (err) {
      reportGitError(err, 'Start');
    } finally {
      operating = false;
    }
  }
</script>

<div class="start">
  <svg width="40" height="40" viewBox="0 0 16 16" fill="none" class="start-icon" aria-hidden="true"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5zm-2 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/></svg>
  <p class="start-title">This folder is not tracked by git yet</p>
  <p class="hint">
    Starting creates a hidden <code>.git</code> folder inside your project. From then on every change can be
    saved as a commit, you can try things on a branch, and push everything to GitHub or another host.
    Nothing leaves your machine until you push.
  </p>

  <div class="steps">
    <div class="step" class:done={!authorMissing}>
      <span class="step-no" aria-hidden="true">1</span>
      <div class="step-body">
        <p class="step-title">Who signs the commits?</p>
        <div class="field">
          <label for="init-name">Name</label>
          <input id="init-name" type="text" bind:value={$gitAuthorName} placeholder="Your name" class="field-input" autocomplete="name" />
        </div>
        <div class="field">
          <label for="init-email">Email</label>
          <input id="init-email" type="email" bind:value={$gitAuthorEmail} placeholder="your@email.com" class="field-input" autocomplete="email" />
        </div>
      </div>
    </div>
    <div class="step">
      <span class="step-no" aria-hidden="true">2</span>
      <div class="step-body">
        <p class="step-title">Keep build files out</p>
        <label class="check">
          <input type="checkbox" bind:checked={gitignore} />
          Add a .gitignore for .aux, .log, .toc and the other files latex leaves behind
        </label>
      </div>
    </div>
    <div class="step">
      <span class="step-no" aria-hidden="true">3</span>
      <div class="step-body">
        <p class="step-title">Start</p>
        <button class="btn primary wide" on:click={start} disabled={operating}>
          {operating ? 'Starting...' : authorMissing ? 'Start tracking' : 'Start tracking and make a first commit'}
        </button>
      </div>
    </div>
  </div>
</div>

<style>
  .start {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    text-align: center;
    padding-top: 8px;
  }
  .start-icon { color: var(--text-muted); }
  .start-title { font-size: 13px; color: var(--text-primary); margin: 0; font-weight: 500; }
  .start .steps { margin-top: 10px; }
</style>
