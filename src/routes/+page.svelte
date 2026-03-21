<script lang="ts">
  import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
  import Logo from '$lib/ui/Logo.svelte';
  import { theme } from '$lib/stores/theme';

  const features = [
    { tag: 'auth', title: 'No Account', desc: 'No sign-up, no login. Open and start writing.' },
    { tag: 'env', title: 'No Install', desc: 'Runs entirely in your browser. Zero setup.' },
    { tag: 'fs', title: 'Local Files', desc: 'Your files never leave your machine. Edit .tex directly on disk.' },
    { tag: 'view', title: 'Live Preview', desc: 'See your LaTeX rendered in real-time as you type.' },
    { tag: 'pwa', title: 'Works Offline', desc: 'Install as a PWA. Full functionality without internet.' },
    { tag: 'ui', title: 'Dark & Light', desc: 'Themes designed for long writing sessions.' }
  ];
</script>

<svelte:head>
  <title>TeXbrain — LaTeX without the baggage</title>
</svelte:head>

<div class="landing">
  <nav class="nav">
    <div class="nav-inner">
      <a href="/" class="logo">
        <span class="logo-mark"><Logo size={26} /></span>
        <span class="logo-name">TeXbrain</span>
      </a>
      <div class="nav-actions">
        <ThemeToggle />
        <a href="/editor" class="nav-link">Open Editor</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <p class="hero-tagline">LaTeX without the baggage</p>
    <h1 class="hero-title">
      LaTeX in your browser.<br />
      Files on your machine.
    </h1>
    <p class="hero-desc">
      A professional LaTeX editor that runs entirely in your browser.
      No account, no installation, no server-side processing.
      Open your .tex files, edit with syntax highlighting and live preview,
      compile to PDF — all locally.
    </p>
    <div class="hero-actions">
      <a href="/editor" class="cta-primary">
        Start Writing
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </a>
      <a href="/editor" class="cta-ghost">Open Editor</a>
    </div>
  </section>

  <section class="demo-section">
    <div class="demo-window">
      <div class="demo-bar">
        <span class="demo-label">article.tex</span>
        <span class="demo-label dim">preview</span>
      </div>
      <div class="demo-content">
        <div class="demo-editor">
          <code>
            <span class="c-cmd">\documentclass</span><span class="c-brace">{'{'}article{'}'}</span>{'\n\n'}
            <span class="c-cmd">\title</span><span class="c-brace">{'{'}My First Document{'}'}</span>{'\n'}
            <span class="c-cmd">\author</span><span class="c-brace">{'{'}Your Name{'}'}</span>{'\n'}
            <span class="c-cmd">\date</span><span class="c-brace">{'{'}</span><span class="c-cmd">\today</span><span class="c-brace">{'}'}</span>{'\n\n'}
            <span class="c-env">\begin</span><span class="c-brace">{'{'}document{'}'}</span>{'\n'}
            <span class="c-cmd">\maketitle</span>{'\n\n'}
            <span class="c-cmd">\section</span><span class="c-brace">{'{'}Introduction{'}'}</span>{'\n'}
            Hello, world! This is <span class="c-math">$E = mc^2$</span>.{'\n\n'}
            <span class="c-env">\end</span><span class="c-brace">{'{'}document{'}'}</span>
          </code>
        </div>
        <div class="demo-divider"></div>
        <div class="demo-preview">
          <div class="preview-paper">
            <h2 style="text-align:center;margin-bottom:4px;font-size:15px;font-weight:600;">My First Document</h2>
            <p style="text-align:center;color:var(--text-secondary);font-size:11px;margin-bottom:14px;">Your Name — March 2026</p>
            <p style="font-weight:600;margin-bottom:5px;font-size:13px;">1 Introduction</p>
            <p style="font-size:12px;line-height:1.6;">Hello, world! This is <em>E = mc²</em>.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="features">
    <h2 class="section-title">Everything you need, nothing you don't</h2>
    <div class="feature-grid">
      {#each features as feature}
        <div class="feature-card">
          <div class="feature-head">
            <span class="feature-tag">{feature.tag}</span>
            <span class="feature-name">{feature.title}</span>
          </div>
          <p class="feature-desc">{feature.desc}</p>
        </div>
      {/each}
    </div>
  </section>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="logo-mark small"><Logo size={20} /></span>
        <span class="footer-name">TeXbrain</span>
      </div>
      <p class="footer-copy">Built for writers, researchers, and students. Open source coming soon.</p>
    </div>
  </footer>
</div>

<style>
  .landing {
    min-height: 100vh;
    overflow-y: auto;
    background: var(--bg-deep);
  }

  /* Nav */
  .nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
  }

  .nav-inner {
    max-width: 960px;
    margin: 0 auto;
    padding: 0 24px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  .logo-mark.small {
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

  .nav-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .nav-link {
    padding: 5px 12px;
    font-size: 12px;
    font-weight: 500;
    color: #111;
    background: var(--accent);
    border-radius: var(--radius-sm);
    text-decoration: none;
  }

  .nav-link:hover {
    background: var(--accent-hover);
    color: #111;
  }

  /* Hero */
  .hero {
    max-width: 620px;
    margin: 0 auto;
    padding: 72px 24px 32px;
    text-align: center;
  }

  .hero-tagline {
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-editor);
    color: var(--accent);
    letter-spacing: 0.02em;
    margin-bottom: 16px;
  }

  .hero-title {
    font-size: 40px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.025em;
    color: var(--text-primary);
    margin-bottom: 16px;
  }

  .hero-desc {
    font-size: 15px;
    line-height: 1.65;
    color: var(--text-secondary);
    max-width: 480px;
    margin: 0 auto 28px;
  }

  .hero-actions {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .cta-primary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 20px;
    font-size: 13px;
    font-weight: 600;
    color: #111;
    background: var(--accent);
    border-radius: var(--radius-sm);
    text-decoration: none;
  }

  .cta-primary:hover {
    background: var(--accent-hover);
    color: #111;
  }

  .cta-ghost {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 20px;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    text-decoration: none;
  }

  .cta-ghost:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  /* Demo */
  .demo-section {
    max-width: 820px;
    margin: 0 auto;
    padding: 12px 24px 48px;
  }

  .demo-window {
    border: 1px solid var(--border);
    overflow: hidden;
  }

  .demo-bar {
    display: flex;
    align-items: center;
    gap: 0;
    height: 30px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
  }

  .demo-label {
    padding: 0 14px;
    font-size: 11px;
    font-family: var(--font-editor);
    color: var(--text-secondary);
    border-right: 1px solid var(--border);
    height: 100%;
    display: flex;
    align-items: center;
  }

  .demo-label.dim {
    color: var(--text-muted);
  }

  .demo-content {
    display: flex;
    min-height: 260px;
  }

  .demo-editor {
    flex: 1;
    padding: 16px;
    background: var(--bg-surface);
    font-family: var(--font-editor);
    font-size: 12.5px;
    line-height: 1.7;
    overflow: hidden;
  }

  .demo-editor code {
    white-space: pre-wrap;
    color: var(--text-primary);
  }

  .c-cmd { color: var(--syntax-command); }
  .c-env { color: var(--syntax-environment); }
  .c-brace { color: var(--syntax-brace); }
  .c-math { color: var(--syntax-math); }

  .demo-divider {
    width: 1px;
    background: var(--border);
  }

  .demo-preview {
    flex: 1;
    padding: 16px;
    background: var(--bg-elevated);
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  .preview-paper {
    background: white;
    color: #1a1a1a;
    padding: 20px;
    width: 100%;
    max-width: 280px;
    font-family: 'Georgia', serif;
    font-size: 13px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15);
  }

  /* Features */
  .features {
    max-width: 900px;
    margin: 0 auto;
    padding: 32px 24px 64px;
  }

  .section-title {
    font-size: 22px;
    font-weight: 600;
    text-align: center;
    color: var(--text-primary);
    margin-bottom: 32px;
    letter-spacing: -0.01em;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
  }

  .feature-card {
    padding: 20px;
    background: var(--bg-surface);
  }

  .feature-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  .feature-tag {
    font-size: 9px;
    font-weight: 600;
    font-family: var(--font-editor);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--accent);
    padding: 1px 5px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
  }

  .feature-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .feature-desc {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  /* Footer */
  .footer {
    border-top: 1px solid var(--border);
    padding: 24px;
  }

  .footer-inner {
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .footer-name {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 15px;
    color: var(--text-primary);
  }

  .footer-copy {
    font-size: 11px;
    color: var(--text-muted);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .hero-title {
      font-size: 28px;
    }

    .hero-desc {
      font-size: 14px;
    }

    .demo-content {
      flex-direction: column;
    }

    .demo-divider {
      width: 100%;
      height: 1px;
    }
  }
</style>
