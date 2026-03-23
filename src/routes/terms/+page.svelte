<script lang="ts">
  import { base } from '$app/paths';
  import Logo from '$lib/ui/Logo.svelte';
</script>

<svelte:head>
  <title>Terms of Service | TeXbrain</title>
</svelte:head>

<div class="legal">
  <nav class="nav">
    <div class="nav-inner">
      <a href="{base}/" class="logo">
        <span class="logo-mark"><Logo size={24} /></span>
        <span class="logo-name">TeXbrain</span>
      </a>
    </div>
  </nav>

  <div class="content">
    <h1>Terms of Service</h1>
    <p class="updated">Last updated: March 24, 2026</p>

    <h2>Acceptance</h2>
    <p>
      By using TeXbrain you agree to these terms. If you do not agree, please do not use the service.
    </p>

    <h2>Description of Service</h2>
    <p>
      TeXbrain is a free, browser-based LaTeX editor that compiles documents locally on your device.
      The service is provided as-is without guarantees of availability or uptime.
    </p>

    <h2>User Responsibilities</h2>
    <p>
      You are solely responsible for the content you create, edit, or share using TeXbrain.
      You agree not to use the service for any unlawful purpose.
    </p>

    <h2>Intellectual Property</h2>
    <p>
      You retain full ownership of all documents and content you create with TeXbrain.
      The TeXbrain software is open source and available under its respective license on
      <a href="https://github.com/swimmingbrain/texbrain" target="_blank" rel="noopener">GitHub</a>.
    </p>

    <h2>Disclaimer of Warranties</h2>
    <p>
      TeXbrain is provided "as is" and "as available" without warranties of any kind, whether express
      or implied, including but not limited to implied warranties of merchantability, fitness for a
      particular purpose, or non-infringement.
    </p>

    <h2>Limitation of Liability</h2>
    <p>
      To the fullest extent permitted by law, TeXbrain and its contributors shall not be liable for
      any indirect, incidental, special, consequential, or punitive damages, or any loss of data,
      profits, or revenue, whether incurred directly or indirectly, arising from your use of the service.
    </p>

    <h2>Data Loss</h2>
    <p>
      Since TeXbrain operates entirely in your browser, you are responsible for saving and backing up
      your work. We are not liable for any data loss resulting from browser crashes, cache clearing,
      or other local issues.
    </p>

    <h2>Changes</h2>
    <p>
      We reserve the right to modify these terms at any time. Continued use of TeXbrain after changes
      constitutes acceptance of the updated terms.
    </p>

    <h2>Contact</h2>
    <p>
      For questions about these terms, contact us via
      <a href="https://github.com/swimmingbrain/texbrain" target="_blank" rel="noopener">GitHub</a>.
    </p>
  </div>

  <footer class="footer">
    <a href="{base}/">&larr; Back to TeXbrain</a>
  </footer>
</div>

<style>
  .legal {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
  }

  .nav {
    flex-shrink: 0;
    border-bottom: 1px solid var(--border);
  }

  .nav-inner {
    max-width: 720px;
    margin: 0 auto;
    padding: 0 32px;
    height: 48px;
    display: flex;
    align-items: center;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }

  .logo-mark {
    display: flex;
    align-items: center;
    color: var(--accent);
  }

  .logo-name {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 18px;
    color: var(--text-primary);
  }

  .content {
    flex: 1;
    max-width: 720px;
    margin: 0 auto;
    padding: 48px 32px;
    width: 100%;
  }

  h1 {
    font-size: 28px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .updated {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-editor);
    margin-bottom: 32px;
  }

  h2 {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 24px 0 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  p a {
    color: var(--accent);
    text-decoration: none;
  }

  p a:hover {
    color: var(--accent-hover);
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 16px 32px;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
  }

  .footer a {
    font-size: 12px;
    font-family: var(--font-editor);
    color: var(--text-muted);
    text-decoration: none;
  }

  .footer a:hover {
    color: var(--accent);
  }
</style>
