<script lang="ts">
  import { problemText, problemsReport, type Problem } from '$lib/compiler/log';
  import { addToast } from '$lib/stores/app';

  export let problems: Problem[] = [];
  // whether a compile happened at all, the empty state reads differently
  export let compiled = false;
  export let mainFile = 'document';
  export let onJump: (p: Problem) => void = () => {};

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      addToast(`${what} copied`, 'success', 1500);
    } catch {
      addToast('Could not copy. Select the text and copy it by hand.', 'error');
    }
  }

  function canJump(p: Problem): boolean {
    return !!p.file && !!p.line && !p.inPackage;
  }

  const ORDER = { error: 0, warning: 1, info: 2 };
  const BADGE = { error: 'E', warning: 'W', info: 'N' };

  // notes are about margins and spacing, most people never want them in
  // the way, so they start hidden
  let showErrors = true;
  let showWarnings = true;
  let showNotes = false;

  $: sorted = [...problems].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  $: errors = problems.filter(p => p.severity === 'error').length;
  $: warnings = problems.filter(p => p.severity === 'warning').length;
  $: notes = problems.filter(p => p.severity === 'info').length;
  $: visible = sorted.filter(p =>
    (p.severity === 'error' && showErrors) ||
    (p.severity === 'warning' && showWarnings) ||
    (p.severity === 'info' && showNotes)
  );

  function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  function where(p: Problem): string {
    const file = p.file ? (p.inPackage ? `${p.file} (a package)` : p.file) : '';
    return [file, p.line ? `line ${p.line}` : ''].filter(Boolean).join(', ');
  }
</script>

<div class="problems">
  {#if problems.length === 0}
    <div class="empty">
      {#if compiled}
        <p class="empty-title">No problems</p>
        <p class="empty-hint">LaTeX had nothing to complain about.</p>
      {:else}
        <p class="empty-title">Nothing compiled yet</p>
        <p class="empty-hint">Press Compile, and anything LaTeX complains about shows up here in plain words.</p>
      {/if}
    </div>
  {:else}
    <div class="chips" role="group" aria-label="Which problems to show">
      <button class="chip error" class:on={showErrors} aria-pressed={showErrors} on:click={() => (showErrors = !showErrors)} disabled={errors === 0}>{plural(errors, 'error')}</button>
      <button class="chip warning" class:on={showWarnings} aria-pressed={showWarnings} on:click={() => (showWarnings = !showWarnings)} disabled={warnings === 0}>{plural(warnings, 'warning')}</button>
      <button class="chip info" class:on={showNotes} aria-pressed={showNotes} on:click={() => (showNotes = !showNotes)} disabled={notes === 0} title="Overfull lines, stretched spaces, substituted fonts">{plural(notes, 'note')}</button>
      <div style="flex:1"></div>
      <button class="chip" on:click={() => copy(problemsReport(visible, mainFile), 'All problems')} disabled={visible.length === 0} title="Everything shown here as plain text, ready to paste">Copy all</button>
    </div>
    {#if visible.length === 0}
      <div class="empty">
        {#if errors === 0 && warnings === 0}
          <p class="empty-title">No errors, no warnings</p>
          <p class="empty-hint">{plural(notes, 'note')} about margins and spacing {notes === 1 ? 'is' : 'are'} hidden. Turn them on above if the layout matters right now.</p>
        {:else}
          <p class="empty-title">Everything is filtered out</p>
          <p class="empty-hint">Turn a kind back on above.</p>
        {/if}
      </div>
    {/if}
    {#each visible as p, i (i)}
      <article class="card {p.severity}">
        <header class="card-head">
          <span class="badge" aria-label={p.severity}>{BADGE[p.severity]}</span>
          {#if canJump(p)}
            <button class="title jump" on:click={() => onJump(p)} title="Go to {where(p)}">{p.title}</button>
          {:else}
            <h4 class="title">{p.title}</h4>
          {/if}
          {#if p.count > 1}<span class="count" title="Reported {p.count} times">&times;{p.count}</span>{/if}
          {#if canJump(p)}
            <button class="where jump" on:click={() => onJump(p)}>{where(p)} &rarr;</button>
          {:else if where(p)}
            <span class="where">{where(p)}</span>
          {/if}
          <button class="icon-btn" on:click={() => copy(problemText(p), 'Problem')} title="Copy this problem as text" aria-label="Copy this problem as text">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5" y="5" width="9" height="9" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" stroke="currentColor" stroke-width="1.2"/></svg>
          </button>
        </header>
        {#if p.explain}
          <p class="explain">{p.explain}</p>
        {/if}
        {#if p.fix}
          <p class="fix"><span class="fix-label">Try</span>{p.fix}</p>
        {/if}
        {#if p.context && (p.context.before || p.context.after)}
          <div class="spot">
            <code class="spot-code"><span>{p.context.before}</span><span class="spot-mark" role="img" aria-label="TeX stopped reading here"></span><span class="spot-after">{p.context.after}</span></code>
            <span class="spot-label">the line as TeX read it, the bar is where it stopped</span>
          </div>
        {/if}
        {#if p.message !== p.title}
          <p class="said"><span class="said-label">LaTeX said</span><code>{p.message}</code></p>
        {/if}
        {#if p.excerpt.length > 1}
          <details class="raw">
            <summary>What the log says</summary>
            <pre>{p.excerpt.join('\n')}</pre>
          </details>
        {/if}
      </article>
    {/each}
  {/if}
</div>

<style>
  .problems { flex: 1; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 6px; }

  .empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 4px; padding: 24px; }
  .empty-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin: 0; }
  .empty-hint { font-size: 12px; color: var(--text-muted); margin: 0; max-width: 320px; line-height: 1.5; }

  .chips { display: flex; gap: 6px; flex-wrap: wrap; padding: 0 2px 2px; }
  .chip {
    font-size: 10.5px;
    font-family: var(--font-editor);
    padding: 2px 8px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    background: transparent;
    cursor: pointer;
  }
  .chip:hover:not(:disabled) { background: var(--bg-hover); }
  .chip:disabled { opacity: 0.4; cursor: default; }
  .chip.on { color: var(--text-primary); border-color: currentColor; }
  .chip.error.on { color: var(--error); }
  .chip.warning.on { color: var(--warning); }
  .chip.info.on { color: var(--text-secondary); }
  .chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  .card {
    border: 1px solid var(--border);
    border-left: 3px solid var(--text-muted);
    background: var(--bg-surface);
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .card.error { border-left-color: var(--error); }
  .card.warning { border-left-color: var(--warning); }
  .card.info { border-left-color: var(--text-muted); }

  .card-head { display: flex; align-items: baseline; gap: 7px; flex-wrap: wrap; }
  .badge {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
    font-family: var(--font-editor);
    color: #111;
    background: var(--text-muted);
    align-self: center;
  }
  .error .badge { background: var(--error); color: #fff; }
  .warning .badge { background: var(--warning); }
  .title { font-size: 12.5px; font-weight: 600; color: var(--text-primary); margin: 0; flex: 1; min-width: 0; text-align: left; }
  .count { font-size: 10px; font-family: var(--font-editor); color: var(--text-muted); }
  .where { font-size: 10.5px; font-family: var(--font-editor); color: var(--text-muted); white-space: nowrap; }
  .icon-btn { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-muted); align-self: center; flex-shrink: 0; }
  .icon-btn:hover { color: var(--text-primary); background: var(--bg-hover); }
  .icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  .jump { cursor: pointer; }
  .title.jump:hover { text-decoration: underline; }
  .where.jump { color: var(--accent); }
  .where.jump:hover { color: var(--accent-hover); text-decoration: underline; }
  .jump:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

  .explain { font-size: 12px; line-height: 1.5; color: var(--text-secondary); margin: 0; }
  .fix { font-size: 12px; line-height: 1.5; color: var(--text-secondary); margin: 0; display: flex; gap: 8px; align-items: baseline; }
  .fix-label {
    flex-shrink: 0;
    font-size: 9.5px;
    font-weight: 700;
    font-family: var(--font-editor);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--accent);
    padding-top: 2px;
  }
  .spot { display: flex; flex-direction: column; gap: 3px; }
  .spot-code {
    display: block;
    font-family: var(--font-editor);
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-primary);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    padding: 5px 8px;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .spot-mark {
    display: inline-block;
    width: 2px;
    height: 1.1em;
    margin: 0 1px;
    vertical-align: text-bottom;
    background: var(--error);
  }
  .warning .spot-mark { background: var(--warning); }
  .spot-after { color: var(--text-muted); }
  .spot-label { font-size: 9.5px; font-family: var(--font-editor); color: var(--text-muted); }
  .raw summary { font-size: 10.5px; color: var(--accent); cursor: pointer; }
  .raw summary:hover { color: var(--accent-hover); }
  .raw pre {
    margin: 4px 0 0;
    padding: 6px 8px;
    font-family: var(--font-editor);
    font-size: 10.5px;
    line-height: 1.45;
    color: var(--text-muted);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .said { font-size: 11px; color: var(--text-muted); margin: 0; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .said-label { font-size: 9.5px; font-family: var(--font-editor); text-transform: uppercase; letter-spacing: 0.04em; flex-shrink: 0; padding-top: 2px; }
  .said code { font-family: var(--font-editor); font-size: 10.5px; color: var(--text-secondary); word-break: break-word; }
</style>
