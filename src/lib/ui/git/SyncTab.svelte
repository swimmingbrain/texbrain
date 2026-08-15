<script lang="ts">
  import { get } from 'svelte/store';
  import { gitCurrentBranch, gitSync, gitPanelOpen, gitPanelTab, gitAuthToken, gitAuthUsername, gitCommitLog, gitChangeCount } from '$lib/git/store';
  import { addRemote, listRemotes, removeRemote, push, pull, fetchRemote, refreshGitState } from '$lib/git/engine';
  import { reportGitError } from '$lib/git/errors';
  import { addToast } from '$lib/stores/app';
  import { shortRemote } from './format';

  export let onReload: () => Promise<void>;

  let remotes: Array<{ remote: string; url: string }> = [];
  let remoteUrl = '';
  let remoteName = 'origin';
  let operating = false;
  let managing = false;
  let showToken = false;

  $: if ($gitPanelOpen) loadRemotes();
  $: origin = remotes.find(r => r.remote === 'origin') || remotes[0];
  $: urlOk = /^https?:\/\/\S+\/\S+/.test(remoteUrl.trim());
  $: urlIsSsh = /^(git@|ssh:\/\/)/.test(remoteUrl.trim());
  $: hasToken = $gitAuthToken.trim().length > 0;
  $: hasCommits = $gitCommitLog.length > 0;

  async function loadRemotes() {
    remotes = await listRemotes();
  }

  // the guided path: remote first, then straight to the first push
  async function handleConnect(andPush: boolean) {
    const url = remoteUrl.trim();
    if (!urlOk) return;
    operating = true;
    try {
      await addRemote('origin', url);
      await loadRemotes();
      remoteUrl = '';
      if (andPush) {
        await push();
        await refreshGitState();
        addToast('Your project is online now', 'success', 4000);
      } else {
        addToast('Connected. Push whenever you are ready.', 'success', 4000);
      }
    } catch (err) {
      reportGitError(err, andPush ? 'Push' : 'Connect');
    } finally {
      operating = false;
    }
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
    if (!confirm(`Forget the remote ${name}? Nothing online is deleted, the project just isn't connected to it anymore.`)) return;
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

  function fetchedAgo(ts: number | null): string {
    if (!ts) return 'never';
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
  }
</script>

<div class="sync">
  {#if !origin}
    <p class="guide-title">Put this project online</p>
    <p class="hint">
      Push once and every commit after that is a backup and something you can share. Works with GitHub, GitLab,
      Codeberg or any other host that speaks https.
    </p>

    <div class="steps">
      <div class="step">
        <span class="step-no" aria-hidden="true">1</span>
        <div class="step-body">
          <p class="step-title">Create an empty repository on your host</p>
          <p class="hint">
            On GitHub that is the plus at the top right, then New repository. Give it a name and leave README,
            .gitignore and license unchecked. It has to be really empty, this project brings its own history.
            <a href="https://github.com/new" target="_blank" rel="noopener">Open github.com/new &#8599;</a>
          </p>
        </div>
      </div>

      <div class="step" class:done={urlOk}>
        <span class="step-no" aria-hidden="true">2</span>
        <div class="step-body">
          <p class="step-title">Paste its address</p>
          <label for="connect-url" class="visually-hidden">Repository address</label>
          <input id="connect-url" type="url" bind:value={remoteUrl} placeholder="https://github.com/you/project.git" class="field-input" autocomplete="off" spellcheck="false" />
          {#if urlIsSsh}
            <p class="hint warn">That is an ssh address. Browsers can only use https, pick the HTTPS one on the repository page.</p>
          {:else}
            <p class="hint">It is on the repository page under Code, the HTTPS one.</p>
          {/if}
        </div>
      </div>

      <div class="step" class:done={hasToken}>
        <span class="step-no" aria-hidden="true">3</span>
        <div class="step-body">
          <p class="step-title">Allow TeXbrain to push</p>
          <p class="hint">
            Hosts want a personal access token instead of your password. On GitHub: Settings, Developer settings,
            Fine grained tokens, Generate new token. Pick the repository and give it Contents: read and write.
            Copy the token, it only shows once.
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Open the token page &#8599;</a>
          </p>
          <label for="connect-token" class="visually-hidden">Token</label>
          <div class="inline-form">
            <input id="connect-token" type={showToken ? 'text' : 'password'} bind:value={$gitAuthToken} placeholder="github_pat_..." class="field-input" autocomplete="off" />
            <button class="btn secondary small" on:click={() => (showToken = !showToken)} aria-pressed={showToken}>{showToken ? 'Hide' : 'Show'}</button>
          </div>
          <details class="more">
            <summary>Not on GitHub?</summary>
            <label for="connect-username" class="visually-hidden">Username</label>
            <input id="connect-username" type="text" bind:value={$gitAuthUsername} placeholder="username, for GitLab, Bitbucket, ..." class="field-input" autocomplete="off" />
            <p class="hint">GitLab and Bitbucket want your username next to the token. GitHub does not, leave it empty there.</p>
          </details>
          <p class="hint">Stored in this browser only, never on a server.</p>
        </div>
      </div>

      <div class="step">
        <span class="step-no" aria-hidden="true">4</span>
        <div class="step-body">
          <p class="step-title">Push</p>
          {#if !hasCommits}
            <p class="hint warn">There is nothing to send yet. Make a first commit in the changes tab, then come back here.</p>
          {/if}
          <button class="btn primary wide" on:click={() => handleConnect(true)} disabled={operating || !urlOk || !hasToken || !hasCommits}>
            {operating ? 'Working...' : 'Connect and push'}
          </button>
          <button class="link-btn" on:click={() => handleConnect(false)} disabled={operating || !urlOk}>Just connect, push later</button>
        </div>
      </div>
    </div>
  {:else}
    <div class="remote-card">
      <div class="remote-line">
        <span class="remote-name">{origin.remote}</span>
        <a class="remote-link" href={origin.url} target="_blank" rel="noopener" title={origin.url}>{shortRemote(origin.url)} &#8599;</a>
        <button class="link-btn small" on:click={() => (managing = !managing)} aria-expanded={managing}>{managing ? 'done' : 'change'}</button>
      </div>

      <div class="status-line" role="status">
        {#if $gitSync.remoteBranch}
          {#if $gitSync.ahead === 0 && $gitSync.behind === 0}
            <span class="ok">{$gitCurrentBranch} is up to date with {$gitSync.remoteBranch}</span>
          {:else}
            <span>
              {#if $gitSync.ahead > 0}{$gitSync.ahead} commit{$gitSync.ahead === 1 ? '' : 's'} to push{/if}
              {#if $gitSync.ahead > 0 && $gitSync.behind > 0}, {/if}
              {#if $gitSync.behind > 0}{$gitSync.behind} commit{$gitSync.behind === 1 ? '' : 's'} to pull{/if}
            </span>
          {/if}
        {:else}
          <span>Nothing known about {origin.remote} yet, fetch to find out</span>
        {/if}
        <span class="checked">checked {fetchedAgo($gitSync.fetchedAt)}</span>
      </div>

      <div class="push-pull-row">
        <button class="btn secondary" on:click={handleFetch} disabled={operating} title="Ask the remote what is new without changing anything here">
          {operating ? 'Working...' : 'Fetch'}
        </button>
        <button class="btn secondary" on:click={handlePull} disabled={operating} title="Bring the remote's commits into your folder">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v9M4 8l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {operating ? 'Working...' : 'Pull'}
        </button>
        <button class="btn primary" on:click={handlePush} disabled={operating} title="Send your commits to the remote">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 12V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          {operating ? 'Working...' : 'Push'}
        </button>
      </div>

      {#if !hasToken}
        <div class="notice">
          <p class="notice-title">Pushing needs a token</p>
          <p class="hint">Public repositories can be fetched and pulled without one, but every push and every private repository needs it.</p>
          <button class="link-btn" on:click={() => gitPanelTab.set('settings')}>Add a token in the settings</button>
        </div>
      {:else if $gitSync.behind > 0 && $gitChangeCount > 0}
        <p class="hint">You have uncommitted changes and the remote has new commits. Commit (or discard) your changes before pulling, so they can't get in the way.</p>
      {:else if $gitChangeCount > 0}
        <p class="hint">Push only sends commits. Your {$gitChangeCount} uncommitted change{$gitChangeCount === 1 ? '' : 's'} stay local until you commit them.</p>
      {/if}
    </div>

    {#if managing}
      <div class="section-header" style="margin-top:8px"><span>Remotes</span></div>
      <div class="remote-list">
        {#each remotes as r (r.remote)}
          <div class="remote-item">
            <span class="remote-name">{r.remote}</span>
            <span class="remote-url">{r.url}</span>
            <button class="link-btn small danger" on:click={() => handleRemoveRemote(r.remote)} aria-label="Remove remote {r.remote}">Remove</button>
          </div>
        {/each}
      </div>
      <div class="inline-form" style="margin-top:6px">
        <label for="remote-name" class="visually-hidden">Remote name</label>
        <input id="remote-name" type="text" bind:value={remoteName} placeholder="origin" class="field-input" style="width:70px;flex:0 0 auto" />
        <label for="remote-url" class="visually-hidden">Remote address</label>
        <input id="remote-url" type="url" bind:value={remoteUrl} placeholder="https://github.com/..." class="field-input" />
        <button class="btn primary small" on:click={handleAddRemote} disabled={!remoteUrl.trim()}>Add</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .sync { display: flex; flex-direction: column; gap: 8px; }
  .guide-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin: 0; }
  .hint.warn { color: var(--warning); }
  .more { margin-top: 2px; }
  .more summary { cursor: pointer; font-size: 11px; color: var(--accent); margin-bottom: 4px; }
  .more :global(.field-input) { width: 100%; margin-bottom: 4px; }

  .remote-card {
    border: 1px solid var(--border);
    background: var(--bg-deep);
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .remote-line { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .remote-name { font-weight: 600; color: var(--text-primary); font-family: var(--font-editor); font-size: 11.5px; }
  .remote-link {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-editor);
    font-size: 11px;
    color: var(--accent);
    text-decoration: none;
  }
  .remote-link:hover { color: var(--accent-hover); text-decoration: underline; }
  .status-line {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    font-size: 11px;
    font-family: var(--font-editor);
    color: var(--text-secondary);
  }
  .status-line .ok { color: var(--success); }
  .checked { color: var(--text-muted); flex-shrink: 0; }
  .push-pull-row { display: flex; gap: 6px; }
  .push-pull-row :global(.btn) { flex: 1; }

  .remote-list { display: flex; flex-direction: column; gap: 3px; }
  .remote-item { display: flex; align-items: center; gap: 6px; padding: 5px 7px; background: var(--bg-deep); font-size: 11.5px; }
  .remote-url { flex: 1; color: var(--text-muted); font-family: var(--font-editor); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
