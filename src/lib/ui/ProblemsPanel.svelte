<script lang="ts">
  import type { Problem } from '$lib/compiler/log';

  export let problems: Problem[] = [];
  // whether a compile happened at all, the empty state reads differently
  export let compiled = false;
  export let onJump: (p: Problem) => void = () => {};

  function canJump(p: Problem): boolean {
    return !!p.file && !!p.line && !p.inPackage;
  }

  const ORDER = { error: 0, warning: 1, info: 2 };
  const BADGE = { error: 'E', warning: 'W', info: 'N' };

  $: sorted = [...problems].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  $: errors = problems.filter(p => p.severity === 'error').length;
  $: warnings = problems.filter(p => p.severity === 'warning').length;
  $: notes = problems.filter(p => p.severity === 'info').length;

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
    <p class="summary">
      {[errors > 0 ? plural(errors, 'error') : '', warnings > 0 ? plural(warnings, 'warning') : '', notes > 0 ? plural(notes, 'note') : ''].filter(Boolean).join(', ')}
    </p>
    {#each sorted as p, i (i)}
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

  .summary { font-size: 10.5px; font-family: var(--font-editor); color: var(--text-muted); margin: 0 0 2px; padding: 0 2px; }

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
