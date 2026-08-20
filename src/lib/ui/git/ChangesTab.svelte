<script lang="ts">
  import { gitStagedFiles, gitUnstagedFiles, gitCurrentBranch, gitAuthorName, gitAuthorEmail } from '$lib/git/store';
  import { stageFile, unstageFile, stageAll, unstageAll, discardChanges, commit, refreshGitState, getFileDiff, addLatexGitignore } from '$lib/git/engine';
  import { reportGitError } from '$lib/git/errors';
  import { addToast } from '$lib/stores/app';
  import type { GitFileDiff } from '$lib/git/types';
  import { fileName, fileDir, statusLetter, statusWord, statusColor } from './format';
  import DiffView from './DiffView.svelte';

  // called after the working tree changed underneath the editor
  export let onReload: () => Promise<void>;

  let commitMsg = '';
  let operating = false;
  let diff: GitFileDiff | null = null;

  $: authorMissing = !$gitAuthorName.trim() || !$gitAuthorEmail.trim();

  // files latex writes on every compile. they show up as new files when a
  // folder was compiled locally before, and nobody wants them in a repository
  const BUILD_FILE = /\.(aux|log|toc|out|bbl|blg|bcf|fls|fdb_latexmk|synctex\.gz|lof|lot|nav|snm|vrb|run\.xml|xdv)$/i;
  $: buildFiles = $gitUnstagedFiles.filter(f => f.status === 'untracked' && BUILD_FILE.test(f.path));

  async function handleIgnoreBuildFiles() {
    operating = true;
    try {
      await addLatexGitignore();
      await onReload();
      await refreshGitState();
      addToast('Added a .gitignore, the build files are out of the way', 'success', 4000);
    } catch (err) {
      reportGitError(err, 'Gitignore');
    } finally {
      operating = false;
    }
  }

  async function handleStage(path: string) {
    await stageFile(path);
    await refreshGitState();
  }

  async function handleUnstage(path: string) {
    await unstageFile(path);
    await refreshGitState();
  }

  async function handleStageAll() {
    await stageAll();
    await refreshGitState();
  }

  async function handleUnstageAll() {
    await unstageAll();
    await refreshGitState();
  }

  async function handleDiscard(path: string, status: string) {
    const what = status === 'untracked' ? `Delete ${path}?` : `Throw away your changes to ${path}?`;
    if (!confirm(`${what} This can't be undone.`)) return;
    operating = true;
    try {
      await discardChanges(path, status);
      await onReload();
      await refreshGitState();
      addToast(status === 'untracked' ? `Deleted ${path}` : `Restored ${path}`, 'success', 2000);
    } catch (err) {
      reportGitError(err, 'Discard');
    } finally {
      operating = false;
    }
  }

  async function handleCommit() {
    const msg = commitMsg.trim();
    if (!msg) { addToast('Enter a commit message', 'warning'); return; }
    if ($gitStagedFiles.length === 0) { addToast('Stage something first', 'warning'); return; }

    operating = true;
    try {
      const sha = await commit(msg);
      commitMsg = '';
      await refreshGitState();
      addToast(`Committed ${sha.slice(0, 7)}`, 'success');
    } catch (err) {
      reportGitError(err, 'Commit');
    } finally {
      operating = false;
    }
  }

  async function handleViewDiff(path: string) {
    try {
      diff = await getFileDiff(path);
    } catch (err) {
      reportGitError(err, 'Diff');
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && diff) {
      e.stopPropagation();
      diff = null;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="changes" on:keydown={handleKeydown}>
  {#if diff}
    <div class="diff-header">
      <button class="back-btn" on:click={() => (diff = null)}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        Back
      </button>
      <span class="diff-path">{diff.path}</span>
      <span class="diff-stats">
        <span class="diff-add">+{diff.additions}</span>
        <span class="diff-del">-{diff.deletions}</span>
      </span>
    </div>
    <DiffView {diff} />
  {:else}
    {#if $gitStagedFiles.length > 0}
      <div class="section-header">
        <span>Ready to commit ({$gitStagedFiles.length})</span>
        <button class="link-btn" on:click={handleUnstageAll}>Unstage all</button>
      </div>
      <div class="file-list">
        {#each $gitStagedFiles as file (file.path)}
          <div class="file-item">
            <span class="file-status" style="color:{statusColor(file.status)}" title={statusWord(file.status)}>{statusLetter(file.status)}</span>
            <button class="file-name" on:click={() => handleViewDiff(file.path)} title="Show what changed">
              <span class="fname-dir">{fileDir(file.path)}</span><span class="fname-name">{fileName(file.path)}</span>
            </button>
            <button class="file-action" on:click={() => handleUnstage(file.path)} title="Unstage" aria-label="Unstage {file.path}">&#x2212;</button>
          </div>
        {/each}
      </div>
    {/if}

    {#if buildFiles.length > 0}
      <div class="notice">
        <p class="notice-title">Build files are showing up</p>
        <p class="hint">{buildFiles.length} file{buildFiles.length === 1 ? '' : 's'} like {fileName(buildFiles[0].path)} change on every compile and don't belong in a repository.</p>
        <button class="btn secondary small" on:click={handleIgnoreBuildFiles} disabled={operating}>Add a .gitignore for them</button>
      </div>
    {/if}

    <div class="section-header">
      <span>Changes ({$gitUnstagedFiles.length})</span>
      {#if $gitUnstagedFiles.length > 0}
        <button class="link-btn" on:click={handleStageAll}>Stage all</button>
      {/if}
    </div>
    {#if $gitUnstagedFiles.length > 0}
      <div class="file-list">
        {#each $gitUnstagedFiles as file (file.path)}
          <div class="file-item">
            <span class="file-status" style="color:{statusColor(file.status)}" title={statusWord(file.status)}>{statusLetter(file.status)}</span>
            <button class="file-name" on:click={() => handleViewDiff(file.path)} title="Show what changed">
              <span class="fname-dir">{fileDir(file.path)}</span><span class="fname-name">{fileName(file.path)}</span>
            </button>
            <button class="file-action discard" on:click={() => handleDiscard(file.path, file.status)} title="Discard changes" aria-label="Discard changes to {file.path}" disabled={operating}>&#x21A9;</button>
            <button class="file-action add" on:click={() => handleStage(file.path)} title="Stage" aria-label="Stage {file.path}">+</button>
          </div>
        {/each}
      </div>
    {:else if $gitStagedFiles.length === 0}
      <p class="empty-msg">Nothing changed since the last commit. Edit and save a file and it shows up here.</p>
    {/if}

    {#if authorMissing}
      <div class="notice">
        <p class="notice-title">First, who are you?</p>
        <p class="hint">Every commit is signed with a name and an email. They are saved in this browser, so this is a one time thing.</p>
        <div class="field">
          <label for="author-name">Name</label>
          <input id="author-name" type="text" bind:value={$gitAuthorName} placeholder="Your name" class="field-input" autocomplete="name" />
        </div>
        <div class="field">
          <label for="author-email">Email</label>
          <input id="author-email" type="email" bind:value={$gitAuthorEmail} placeholder="your@email.com" class="field-input" autocomplete="email" />
        </div>
      </div>
    {/if}

    <div class="commit-form">
      <label for="commit-message" class="visually-hidden">Commit message</label>
      <textarea
        id="commit-message"
        class="commit-input"
        bind:value={commitMsg}
        placeholder="What did you change? (Ctrl+Enter to commit)"
        rows="3"
        on:keydown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); handleCommit(); } }}
      ></textarea>
      <button class="btn primary wide" on:click={handleCommit} disabled={operating || authorMissing || $gitStagedFiles.length === 0 || !commitMsg.trim()}>
        {operating ? 'Committing...' : `Commit to ${$gitCurrentBranch} (${$gitStagedFiles.length} file${$gitStagedFiles.length !== 1 ? 's' : ''})`}
      </button>
      {#if $gitStagedFiles.length === 0 && $gitUnstagedFiles.length > 0}
        <p class="hint">Stage the files you want in this commit with the + button, or stage all.</p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .changes { display: flex; flex-direction: column; gap: 8px; flex: 1; min-height: 0; }
  .commit-form {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .commit-input {
    padding: 6px 8px;
    font-size: 11.5px;
    font-family: var(--font-editor);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: var(--text-primary);
    outline: none;
    resize: vertical;
    min-height: 52px;
  }
  .commit-input:focus { border-color: var(--accent); }
  .commit-input::placeholder { color: var(--text-muted); }
  .diff-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }
  .back-btn {
    display: flex;
    align-items: center;
    gap: 3px;
    font-size: 11px;
    color: var(--accent);
    padding: 3px 6px;
  }
  .back-btn:hover { background: var(--bg-hover); }
  .diff-path {
    font-family: var(--font-editor);
    font-size: 11.5px;
    color: var(--text-primary);
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
