<script lang="ts">
  import { get } from 'svelte/store';
  import { gitCurrentBranch, gitSync, gitPanelOpen } from '$lib/git/store';
  import { addRemote, listRemotes, removeRemote, push, pull, fetchRemote, refreshGitState } from '$lib/git/engine';
  import { reportGitError } from '$lib/git/errors';
  import { addToast } from '$lib/stores/app';

  export let onReload: () => Promise<void>;

  let remotes: Array<{ remote: string; url: string }> = [];
  let remoteUrl = '';
  let remoteName = 'origin';
  let operating = false;

  $: if ($gitPanelOpen) loadRemotes();

  async function loadRemotes() {
    remotes = await listRemotes();
  }

  async function handleAddRemote() {
    const url = remoteUrl.trim();
    const name = remoteName.trim() || 'origin';
    if (!url) return;
    try {
      await addRemote(name, url);
      await loadRemotes();
      remoteUrl = '';
      addToast(`Remote ${name} added`, 'success');
    } catch (err) {
      reportGitError(err, 'Add remote');
    }
  }

  async function handleRemoveRemote(name: string) {
    try {
      await removeRemote(name);
      await loadRemotes();
      addToast(`Remote ${name} removed`, 'success');
    } catch (err) {
      reportGitError(err, 'Remove remote');
    }
  }

  async function handleFetch() {
    operating = true;
    try {
      await fetchRemote();
      const s = get(gitSync);
      addToast(s.behind > 0 ? `${s.behind} new commit${s.behind === 1 ? '' : 's'} on the remote, pull to get them` : 'Nothing new on the remote', 'info', 4000);
    } catch (err) {
      reportGitError(err, 'Fetch');
    } finally {
      operating = false;
    }
  }

  async function handlePush() {
    operating = true;
    try {
      await push();
      await refreshGitState();
      addToast('Pushed', 'success');
    } catch (err) {
      reportGitError(err, 'Push');
    } finally {
      operating = false;
    }
  }

  async function handlePull() {
    operating = true;
    try {
      await pull();
      await onReload();
      await refreshGitState();
      addToast('Pulled', 'success');
    } catch (err) {
      reportGitError(err, 'Pull');
    } finally {
      operating = false;
    }
  }
</script>

<div class="sync">
  <div class="section-header"><span>Remotes</span></div>
  {#if remotes.length > 0}
    <div class="remote-list">
      {#each remotes as r (r.remote)}
        <div class="remote-item">
          <span class="remote-name">{r.remote}</span>
          <span class="remote-url">{r.url}</span>
          <button class="link-btn small danger" on:click={() => handleRemoveRemote(r.remote)} aria-label="Remove remote {r.remote}">Remove</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="empty-msg">No remotes configured</p>
  {/if}

  <div class="inline-form" style="margin-top:6px">
    <label for="remote-name" class="visually-hidden">Remote name</label>
    <input id="remote-name" type="text" bind:value={remoteName} placeholder="origin" class="field-input" style="width:70px;flex:0 0 auto" />
    <label for="remote-url" class="visually-hidden">Remote url</label>
    <input id="remote-url" type="text" bind:value={remoteUrl} placeholder="https://github.com/..." class="field-input" />
    <button class="btn primary small" on:click={handleAddRemote} disabled={!remoteUrl.trim()}>Add</button>
  </div>

  {#if remotes.length > 0}
    <p class="sync-line">
      {#if $gitSync.remoteBranch}
        {$gitCurrentBranch} is {$gitSync.ahead} ahead and {$gitSync.behind} behind {$gitSync.remoteBranch}
      {:else}
        Not fetched yet, so nothing is known about the remote
      {/if}
    </p>
  {/if}

  <div class="push-pull-row">
    <button class="btn secondary" on:click={handleFetch} disabled={operating || remotes.length === 0}>
      {operating ? 'Working...' : 'Fetch'}
    </button>
    <button class="btn primary" on:click={handlePush} disabled={operating || remotes.length === 0}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 12V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {operating ? 'Working...' : 'Push'}
    </button>
    <button class="btn secondary" on:click={handlePull} disabled={operating || remotes.length === 0}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v9M4 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
      {operating ? 'Working...' : 'Pull'}
    </button>
  </div>
</div>

<style>
  .sync { display: flex; flex-direction: column; gap: 8px; }
  .remote-list { display: flex; flex-direction: column; gap: 3px; }
  .remote-item { display: flex; align-items: center; gap: 6px; padding: 5px 7px; background: var(--bg-deep); font-size: 11.5px; }
  .remote-name { font-weight: 600; color: var(--text-primary); font-family: var(--font-editor); }
  .remote-url { flex: 1; color: var(--text-muted); font-family: var(--font-editor); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sync-line { font-size: 11px; color: var(--text-secondary); font-family: var(--font-editor); margin: 6px 0 0; }
  .push-pull-row { display: flex; gap: 6px; margin-top: 8px; }
  .push-pull-row :global(.btn) { flex: 1; }
</style>
