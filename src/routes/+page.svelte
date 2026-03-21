<script lang="ts">
  import { base } from '$app/paths';
  import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
  import Logo from '$lib/ui/Logo.svelte';
  import { theme } from '$lib/stores/theme';
</script>

<svelte:head>
  <title>TeXbrain | LaTeX in your browser</title>
</svelte:head>

<div class="landing">
  <nav class="nav">
    <div class="nav-inner">
      <a href="{base}/" class="logo">
        <span class="logo-mark"><Logo size={24} /></span>
        <span class="logo-name">TeXbrain</span>
      </a>
      <div class="nav-actions">
        <ThemeToggle />
        <a href="{base}/editor" class="nav-cta">Open Editor</a>
      </div>
    </div>
  </nav>

  <div class="content">
    <div class="split">
      <div class="left">
        <h1 class="hero-title">
          Write LaTeX<br />
          <span class="hero-accent">without the baggage.</span>
        </h1>
        <p class="hero-desc">
          A LaTeX editor that compiles to PDF entirely in your browser.
          No accounts, no installs, no servers.
        </p>
        <a href="{base}/editor" class="hero-cta">
          Open Editor
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
        <div class="feature-pills">
          <span class="pill">local files</span>
          <span class="pill">live preview</span>
          <span class="pill">collaboration</span>
          <span class="pill">built-in git</span>
          <span class="pill">works offline</span>
        </div>
      </div>

      <div class="right">
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
                <h2 style="text-align:center;margin-bottom:3px;font-size:14px;font-weight:600;">My First Document</h2>
                <p style="text-align:center;color:#666;font-size:9px;margin-bottom:12px;">Braian Plaku</p>
                <p style="font-weight:600;margin-bottom:4px;font-size:12px;">1 Introduction</p>
                <p style="font-size:11px;line-height:1.6;">Hello, world! This is <em>E = mc&sup2;</em>.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <footer class="footer">
    <div class="footer-inner">
      <div class="footer-brand">
        <span class="logo-mark"><Logo size={16} /></span>
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
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-deep);
    overflow: hidden;
  }

  .nav {
    flex-shrink: 0;
    background: var(--bg-deep);
    border-bottom: 1px solid var(--border);
  }

  .nav-inner {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 32px;
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

  .content {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    padding: 0 32px;
  }

  .split {
    max-width: 1200px;
    width: 100%;
    display: flex;
    align-items: center;
    gap: 56px;
  }

  .left {
    flex: 0 0 380px;
  }

  .hero-title {
    font-size: 42px;
    font-weight: 700;
    line-height: 1.1;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    margin-bottom: 16px;
  }

  .hero-accent {
    color: var(--accent);
  }

  .hero-desc {
    font-size: 15px;
    line-height: 1.6;
    color: var(--text-secondary);
    margin-bottom: 24px;
  }

  .hero-cta {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 22px;
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

  .feature-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 24px;
  }

  .pill {
    font-size: 10px;
    font-weight: 500;
    font-family: var(--font-editor);
    color: var(--text-muted);
    padding: 3px 8px;
    border: 1px solid var(--border);
    background: var(--bg-surface);
    letter-spacing: 0.02em;
  }

  .right {
    flex: 1;
    min-width: 0;
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
    height: 32px;
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
    min-height: 240px;
  }

  .demo-editor {
    flex: 1;
    padding: 12px 12px 12px 0;
    background: var(--bg-surface);
    font-family: var(--font-editor);
    font-size: 11.5px;
    line-height: 1.65;
    overflow: hidden;
    display: flex;
  }

  .line-numbers {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    padding: 0 10px 0 12px;
    color: var(--text-muted);
    font-size: 11px;
    line-height: 1.65;
    user-select: none;
    opacity: 0.4;
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
    flex: 0 0 42%;
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
    font-family: 'Georgia', serif;
    font-size: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    border-radius: 2px;
  }

  .footer {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    padding: 12px 32px;
  }

  .footer-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .footer-brand {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .footer-name {
    font-family: var(--font-brand);
    font-style: italic;
    font-size: 14px;
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

  /* mobile: stack and allow scroll */
  @media (max-width: 900px) {
    .landing {
      height: auto;
      min-height: 100vh;
      overflow-y: auto;
    }

    .content {
      padding: 40px 20px;
    }

    .split {
      flex-direction: column;
      gap: 32px;
    }

    .left {
      flex: none;
      text-align: center;
    }

    .hero-title { font-size: 34px; }
    .hero-desc { font-size: 14px; }

    .feature-pills {
      justify-content: center;
    }

    .right {
      width: 100%;
    }

    .demo-content {
      flex-direction: column;
    }

    .demo-divider {
      width: 100%;
      height: 1px;
    }

    .demo-preview {
      flex: none;
    }

    .line-numbers { display: none; }

    .footer {
      padding: 16px 20px;
    }
  }

  @media (max-width: 480px) {
    .hero-title { font-size: 28px; }
    .content { padding: 32px 16px; }
  }
</style>
