<script lang="ts">
  import { base } from '$app/paths';
  import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
  import Logo from '$lib/ui/Logo.svelte';
  import { theme } from '$lib/stores/theme';

  const features = [
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      title: 'No account needed',
      desc: 'No sign-up, no login, no tracking. Open the editor and start writing immediately.'
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
      title: 'Runs in your browser',
      desc: 'Zero installation. The entire LaTeX engine runs locally via WebAssembly.'
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>',
      title: 'Your files stay local',
      desc: 'Edit .tex files directly on your disk. Nothing ever leaves your machine.'
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
      title: 'Live PDF preview',
      desc: 'Compile to PDF and see results in real-time. Syntax highlighting included.'
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="3"/><path d="M1 13c0-2.8 2.2-5 5-5s5 2.2 5 5"/><circle cx="18" cy="8" r="2.5"/><path d="M14 15c0-2.2 1.8-4 4-4s4 1.8 4 4"/></svg>',
      title: 'Real-time collaboration',
      desc: 'Work together with peers over WebRTC. End-to-end encrypted sessions.'
    },
    {
      icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5z"/></svg>',
      title: 'Built-in Git',
      desc: 'Version control your LaTeX projects without leaving the editor.'
    }
  ];
</script>

<svelte:head>
  <title>TeXbrain | LaTeX in your browser</title>
</svelte:head>

<div class="landing">
  <nav class="nav">
    <div class="nav-inner">
      <a href="{base}/" class="logo">
        <span class="logo-mark"><Logo size={26} /></span>
        <span class="logo-name">TeXbrain</span>
      </a>
      <div class="nav-actions">
        <ThemeToggle />
        <a href="{base}/editor" class="nav-cta">Open Editor</a>
      </div>
    </div>
  </nav>

  <section class="hero">
    <div class="hero-badge">open source latex editor</div>
    <h1 class="hero-title">
      Write LaTeX<br />
      <span class="hero-accent">without the baggage.</span>
    </h1>
    <p class="hero-desc">
      A professional LaTeX editor that compiles to PDF entirely in your browser.
      No accounts, no installs, no servers. Your files never leave your machine.
    </p>
    <a href="{base}/editor" class="hero-cta">
      Open Editor
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </a>
  </section>

  <section class="demo-section">
    <div class="demo-window">
      <div class="demo-bar">
        <div class="demo-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
        <span class="demo-filename">article.tex</span>
        <div style="flex:1"></div>
        <span class="demo-label">preview</span>
      </div>
      <div class="demo-content">
        <div class="demo-editor">
          <div class="line-numbers">
            {#each Array(11) as _, i}
              <span>{i + 1}</span>
            {/each}
          </div>
          <code>
            <span class="c-cmd">\documentclass</span><span class="c-brace">{'{'}article{'}'}</span>{'\n\n'}
            <span class="c-cmd">\title</span><span class="c-brace">{'{'}My First Document{'}'}</span>{'\n'}
            <span class="c-cmd">\author</span><span class="c-brace">{'{'}Braian Plaku{'}'}</span>{'\n'}
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
            <p style="text-align:center;color:#666;font-size:10px;margin-bottom:14px;">Braian Plaku</p>
            <p style="font-weight:600;margin-bottom:5px;font-size:13px;">1 Introduction</p>
            <p style="font-size:12px;line-height:1.6;">Hello, world! This is <em>E = mc&sup2;</em>.</p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="features">
    <div class="feature-grid">
      {#each features as feature}
        <div class="feature-card">
          <div class="feature-icon">{@html feature.icon}</div>
          <h3 class="feature-title">{feature.title}</h3>
          <p class="feature-desc">{feature.desc}</p>
        </div>
      {/each}
    </div>
  </section>

  <section class="bottom-cta">
    <p class="bottom-cta-text">ready to write?</p>
    <a href="{base}/editor" class="hero-cta">
      Open Editor
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </a>
  </section>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="logo-mark"><Logo size={18} /></span>
        <span class="footer-name">TeXbrain</span>
      </div>
      <p class="footer-credit">
        made with <span class="heart">&hearts;</span> by
        <a href="https://swimmingbrain.dev" target="_blank" rel="noopener">Braian Plaku</a>
      </p>
    </div>
  </footer>
</div>

<style>
  .landing {
    min-height: 100vh;
    overflow-y: auto;
    background: var(--bg-deep);
  }

  .nav {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
    backdrop-filter: blur(12px);
  }

  .nav-inner {
    max-width: 1000px;
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

  .nav-cta {
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 500;
    color: #111;
    background: var(--accent);
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: background 0.15s;
  }

  .nav-cta:hover {
    background: var(--accent-hover);
    color: #111;
  }

  .hero {
    max-width: 640px;
    margin: 0 auto;
    padding: 80px 24px 40px;
    text-align: center;
  }

  .hero-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-editor);
    color: var(--accent);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 3px 10px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    margin-bottom: 24px;
  }

  .hero-title {
    font-size: 48px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin-bottom: 20px;
  }

  .hero-accent {
    color: var(--accent);
  }

  .hero-desc {
    font-size: 16px;
    line-height: 1.65;
    color: var(--text-secondary);
    max-width: 460px;
    margin: 0 auto 32px;
  }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 11px 24px;
    font-size: 14px;
    font-weight: 600;
    color: #111;
    background: var(--accent);
    border-radius: var(--radius-sm);
    text-decoration: none;
    transition: background 0.15s, transform 0.1s;
  }

  .hero-cta:hover {
    background: var(--accent-hover);
    color: #111;
    transform: translateY(-1px);
  }

  .demo-section {
    max-width: 860px;
    margin: 0 auto;
    padding: 8px 24px 56px;
  }

  .demo-window {
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  }

  .demo-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 34px;
    padding: 0 12px;
    background: var(--bg-surface);
    border-bottom: 1px solid var(--border);
  }

  .demo-dots {
    display: flex;
    gap: 5px;
  }

  .demo-dots .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--border);
  }

  .demo-filename {
    font-size: 11px;
    font-family: var(--font-editor);
    color: var(--text-primary);
  }

  .demo-label {
    font-size: 10px;
    font-family: var(--font-editor);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .demo-content {
    display: flex;
    min-height: 280px;
  }

  .demo-editor {
    flex: 1;
    padding: 16px 16px 16px 0;
    background: var(--bg-surface);
    font-family: var(--font-editor);
    font-size: 12.5px;
    line-height: 1.7;
    overflow: hidden;
    display: flex;
  }

  .line-numbers {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 0 12px 0 16px;
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.7;
    user-select: none;
    opacity: 0.5;
  }

  .demo-editor code {
    white-space: pre-wrap;
    color: var(--text-primary);
    flex: 1;
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
    padding: 20px;
    background: var(--bg-elevated);
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  .preview-paper {
    background: white;
    color: #1a1a1a;
    padding: 24px;
    width: 100%;
    max-width: 280px;
    font-family: 'Georgia', serif;
    font-size: 13px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
    border-radius: 2px;
  }

  .features {
    max-width: 960px;
    margin: 0 auto;
    padding: 16px 24px 64px;
  }

  .feature-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: var(--border);
    border: 1px solid var(--border);
  }

  .feature-card {
    padding: 28px 24px;
    background: var(--bg-surface);
  }

  .feature-icon {
    color: var(--accent);
    margin-bottom: 12px;
    display: flex;
    align-items: center;
  }

  .feature-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 6px;
  }

  .feature-desc {
    font-size: 12.5px;
    line-height: 1.55;
    color: var(--text-secondary);
  }

  .bottom-cta {
    text-align: center;
    padding: 0 24px 64px;
  }

  .bottom-cta-text {
    font-size: 14px;
    font-family: var(--font-editor);
    color: var(--text-muted);
    margin-bottom: 16px;
  }

  .footer {
    border-top: 1px solid var(--border);
    padding: 20px 24px;
  }

  .footer-inner {
    max-width: 1000px;
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

  .footer-credit {
    font-size: 11px;
    color: var(--text-muted);
    font-family: var(--font-editor);
  }

  .footer-credit a {
    color: var(--accent);
    text-decoration: none;
  }

  .footer-credit a:hover {
    color: var(--accent-hover);
  }

  .heart {
    color: var(--error);
    font-size: 12px;
  }

  @media (max-width: 768px) {
    .hero-title { font-size: 34px; }
    .hero-desc { font-size: 14px; }
    .feature-grid { grid-template-columns: 1fr; }
    .demo-content { flex-direction: column; }
    .demo-divider { width: 100%; height: 1px; }
    .line-numbers { display: none; }
  }

  @media (max-width: 480px) {
    .hero-title { font-size: 28px; }
    .hero { padding: 56px 20px 32px; }
  }
</style>
