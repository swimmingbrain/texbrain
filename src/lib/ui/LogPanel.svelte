<script lang="ts">
  import { addToast } from '$lib/stores/app';

  // everything the engine printed
  export let raw = '';
  // the same without the file noise, one entry per line
  export let cleaned: string[] = [];
  export let fileName = 'document.log';

  // the panel renders one element per line, so very long logs are cut and
  // the download has the rest
  const MAX = 3000;

  let full = false;
  let query = '';

  $: lines = full ? raw.replace(/\r/g, '').split('\n') : cleaned;
  $: numbered = lines.map((text, i) => ({ n: i + 1, text }));
  $: shown = query.trim()
    ? numbered.filter(l => l.text.toLowerCase().includes(query.trim().toLowerCase()))
    : numbered;

  type Kind = 'error' | 'warning' | 'context' | 'box' | 'file' | 'page' | 'ok' | 'meta' | '';

  // a little color goes a long way in a wall of text
  function kind(text: string): Kind {
    if (/^\[\d{1,2}:\d{2}:\d{2}/.test(text)) return 'meta';
    if (text.startsWith('!')) return 'error';
    if (/Warning:/.test(text) || /^\([\w.-]+\)\s{2,}/.test(text)) return 'warning';
    if (/^l\.\d+/.test(text) || /^<(inserted text|to be read again|\*|argument)>/.test(text)) return 'context';
    if (/^(Overfull|Underfull) \\[hv]box/.test(text)) return 'box';
    if (/^\s*[()]/.test(text) || /\(\/tex\//.test(text) || /^\s*<\/tex\//.test(text)) return 'file';
    if (/^\[\d+/.test(text)) return 'page';
    if (/^Output written|compilation successful/.test(text)) return 'ok';
    return '';
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(raw);
      addToast('Log copied', 'success', 1500);
    } catch {
      addToast('Could not copy, use download instead', 'error');
    }
  }

  function download() {
    const blob = new Blob([raw], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="log">
  <div class="toolbar">
    <button class="log-btn" class:active={full} on:click={() => (full = !full)} aria-pressed={full} title="Everything the engine printed, nothing filtered">Full log</button>
    <input class="search" type="search" placeholder="Search" bind:value={query} aria-label="Search the log" spellcheck="false" />
    <span class="meta" aria-live="polite">{query.trim() ? `${shown.length} of ${lines.length}` : `${lines.length}`} lines</span>
    <button class="log-btn" on:click={copy} disabled={!raw} title="Copy the full log to the clipboard">Copy</button>
    <button class="log-btn" on:click={download} disabled={!raw} title="Download the full log as a file">Download</button>
  </div>
  {#if lines.length === 0}
    <div class="empty"><p>No compilation log yet</p></div>
  {:else if shown.length === 0}
    <div class="empty"><p>Nothing in the log matches</p></div>
  {:else}
    <div class="lines">
      {#each shown.slice(0, MAX) as l (l.n)}
        <div class="line {kind(l.text)}"><span class="ln" aria-hidden="true">{l.n}</span><span class="text">{l.text}</span></div>
      {/each}
      {#if shown.length > MAX}
        <div class="more">{shown.length - MAX} more lines. Download the log for all of it.</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .log { flex: 1; overflow-y: auto; font-family: var(--font-editor); font-size: 11px; display: flex; flex-direction: column; }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    background: var(--bg-elevated);
    flex-shrink: 0;
  }
  .log-btn { font-size: 10.5px; padding: 2px 8px; color: var(--text-secondary); border: 1px solid var(--border); white-space: nowrap; }
  .log-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
  .log-btn:disabled { opacity: 0.4; cursor: default; }
  .log-btn.active { color: var(--accent); border-color: var(--accent); }
  .search {
    flex: 1;
    min-width: 60px;
    font-size: 10.5px;
    font-family: var(--font-editor);
    padding: 2px 8px;
    background: var(--bg-deep);
    border: 1px solid var(--border);
    color: var(--text-primary);
    outline: none;
  }
  .search:focus { border-color: var(--accent); }
  .search::placeholder { color: var(--text-muted); }
  .meta { font-size: 10px; color: var(--text-muted); white-space: nowrap; }

  .lines { padding: 6px 0; }
  .line { display: flex; gap: 8px; padding: 1px 8px; line-height: 1.5; color: var(--text-secondary); }
  .line:hover { background: var(--bg-hover); }
  .ln { flex-shrink: 0; width: 34px; text-align: right; color: var(--text-muted); opacity: 0.5; user-select: none; font-size: 10px; }
  .text { white-space: pre-wrap; word-break: break-all; min-width: 0; }
  .line.error { color: var(--error); }
  .line.error .text { font-weight: 600; }
  .line.warning { color: var(--warning); }
  .line.context { color: var(--text-primary); }
  .line.box { color: var(--text-muted); font-style: italic; }
  .line.file { color: var(--text-muted); opacity: 0.7; }
  .line.page { color: var(--accent); opacity: 0.8; }
  .line.ok { color: var(--success); }
  .line.meta { color: var(--text-muted); }
  .more { padding: 6px 8px; color: var(--text-muted); font-style: italic; }
  .empty { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--text-muted); font-size: 12px; }
</style>
