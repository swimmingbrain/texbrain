<script lang="ts">
  import { base } from '$app/paths';
  import Logo from '$lib/ui/Logo.svelte';
</script>

<svelte:head>
  <title>Privacy Policy | TeXbrain</title>
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
    <h1>Privacy Policy</h1>
    <p class="updated">Last updated: March 24, 2026</p>

    <h2>Overview</h2>
    <p>
      TeXbrain is a browser-based LaTeX editor. Your documents are processed entirely on your device.
      We do not collect, store, or transmit your documents or personal data to any server.
    </p>

    <h2>Data Storage</h2>
    <p>
      TeXbrain uses your browser's local storage mechanisms (localStorage and IndexedDB) to cache
      TeX Live packages for faster compilation. This data never leaves your browser and can be cleared
      at any time through your browser settings.
    </p>

    <h2>Files</h2>
    <p>
      When you open a project folder, TeXbrain accesses files through the browser's File System Access API.
      Files are read into memory for editing and compilation. No file data is uploaded to external servers.
    </p>

    <h2>Collaboration</h2>
    <p>
      The real-time collaboration feature uses peer-to-peer WebRTC connections. Document content
      is transmitted directly between collaborators' browsers. No document data passes through our infrastructure.
    </p>

    <h2>Analytics</h2>
    <p>
      We do not use tracking scripts, analytics services, or advertising networks.
    </p>

    <h2>Third-Party Services</h2>
    <p>
      TeXbrain loads fonts from Google Fonts during page load. Google's privacy policy applies to
      that request. No other third-party services are used.
    </p>

    <h2>Cookies</h2>
    <p>
      TeXbrain does not use cookies. Theme and editor preferences are stored in localStorage.
    </p>

    <h2>Changes</h2>
    <p>
      We may update this policy from time to time. Changes will be reflected on this page with an updated date.
    </p>

    <h2>Contact</h2>
    <p>
      For questions about this policy, contact us via
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
