<script lang="ts">
  import { gitAuthorName, gitAuthorEmail, gitAuthUsername, gitAuthToken, gitCorsProxy } from '$lib/git/store';

  const DEFAULT_PROXY = 'https://cors.isomorphic-git.org';
  let showToken = false;
</script>

<div class="settings">
  <div class="section-header"><span>You</span></div>
  <p class="hint">Every commit carries this name and email. Use the same ones as on GitHub so your commits count there.</p>
  <div class="field">
    <label for="git-name">Name</label>
    <input id="git-name" type="text" bind:value={$gitAuthorName} placeholder="Your name" class="field-input" autocomplete="name" />
  </div>
  <div class="field">
    <label for="git-email">Email</label>
    <input id="git-email" type="email" bind:value={$gitAuthorEmail} placeholder="your@email.com" class="field-input" autocomplete="email" />
  </div>

  <div class="section-header" style="margin-top:14px"><span>Login for push and pull</span></div>
  <p class="hint">
    Hosts want a personal access token, not your password. On GitHub: Settings, Developer settings, Fine grained tokens,
    Generate new token. Pick the repository and give it Contents: read and write. Copy the token, it only shows once.
    <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Open the token page &#8599;</a>
  </p>
  <div class="field">
    <label for="git-token">Token</label>
    <div class="inline-form">
      <input id="git-token" type={showToken ? 'text' : 'password'} bind:value={$gitAuthToken} placeholder="github_pat_..." class="field-input" autocomplete="off" />
      <button class="btn secondary small" on:click={() => (showToken = !showToken)} aria-pressed={showToken}>{showToken ? 'Hide' : 'Show'}</button>
    </div>
    <p class="hint">Stored in this browser only, never on a server. Remove it here when you are on a shared computer.</p>
  </div>
  <div class="field">
    <label for="git-username">Username</label>
    <input id="git-username" type="text" bind:value={$gitAuthUsername} placeholder="only for GitLab, Bitbucket, ..." class="field-input" autocomplete="off" />
    <p class="hint">GitHub doesn't need one, leave it empty there.</p>
  </div>

  <div class="section-header" style="margin-top:14px"><span>Proxy</span></div>
  <p class="hint">
    Browsers can't talk to git servers directly, so push, pull and clone go through a small relay. The default one is run
    by the isomorphic-git project. Your token and repository data pass through it. If you'd rather not, run your own
    (<a href="https://github.com/isomorphic-git/cors-proxy" target="_blank" rel="noopener">it is a tiny node app &#8599;</a>) and put its address here.
  </p>
  <div class="field">
    <label for="git-proxy">Proxy address</label>
    <div class="inline-form">
      <input id="git-proxy" type="text" bind:value={$gitCorsProxy} placeholder={DEFAULT_PROXY} class="field-input" />
      {#if $gitCorsProxy !== DEFAULT_PROXY}
        <button class="btn secondary small" on:click={() => gitCorsProxy.set(DEFAULT_PROXY)}>Reset</button>
      {/if}
    </div>
  </div>
</div>

<style>
  .settings { display: flex; flex-direction: column; gap: 8px; }
</style>
