<script lang="ts">
  import { tick } from 'svelte';
  import * as pdfjsLib from 'pdfjs-dist';
  import 'pdfjs-dist/web/pdf_viewer.css';
  import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  export let pdfData: Uint8Array | undefined = undefined;

  let container: HTMLDivElement;
  let pageCount = 1;
  let pendingFraction = -1;
  let pendingSourceText = '';
  let scale = 1;
  let pdfDoc: any = null;
  let rendering = false;
  let userZoomed = false;

  let pageTextCache: Array<{
    text: string;
    items: Array<{ str: string; transform: number[] }>;
    viewportHeight: number;
  }> = [];

  $: if (pdfData) {
    handleNewPdf(pdfData);
  }

  async function handleNewPdf(data: Uint8Array) {
    if (rendering) return;
    rendering = true;

    try {
      const targetFraction = pendingFraction >= 0 ? pendingFraction : -1;
      const targetSourceText = pendingSourceText;
      pendingFraction = -1;
      pendingSourceText = '';

      const doc = await pdfjsLib.getDocument({ data: data.slice() }).promise;
      pdfDoc = doc;
      pageCount = doc.numPages;

      await tick();
      if (!container) { rendering = false; return; }

      await renderAllPages(doc);

      if (targetSourceText) {
        scrollToSourceText(targetSourceText, targetFraction >= 0 ? targetFraction : 0);
      } else if (targetFraction >= 0) {
        scrollToFractionImpl(targetFraction);
      }
    } catch (err) {
      console.error('[PDF] error:', err);
    } finally {
      rendering = false;
    }
  }

  async function renderAllPages(doc: any) {
    container.innerHTML = '';
    pageTextCache = [];
    const dpr = window.devicePixelRatio || 1;

    const page1 = await doc.getPage(1);
    const baseVp = page1.getViewport({ scale: 1 });
    const fitScale = (container.clientWidth - 32) / baseVp.width;
    if (!userZoomed) scale = Math.max(0.3, fitScale);

    for (let i = 1; i <= doc.numPages; i++) {
      const page = i === 1 ? page1 : await doc.getPage(i);
      const viewport = page.getViewport({ scale });

      const pageDiv = document.createElement('div');
      pageDiv.dataset.page = String(i);
      pageDiv.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;position:relative;background:white;margin-bottom:8px;box-shadow:0 2px 8px rgba(0,0,0,0.3);flex-shrink:0;`;

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.cssText = `width:${viewport.width}px;height:${viewport.height}px;display:block;`;
      pageDiv.appendChild(canvas);

      const textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      pageDiv.appendChild(textDiv);

      container.appendChild(pageDiv);

      const ctx = canvas.getContext('2d')!;
      ctx.scale(dpr, dpr);
      await page.render({ canvasContext: ctx, viewport }).promise;

      const textContent = await page.getTextContent();
      const tl = new pdfjsLib.TextLayer({
        textContentSource: textContent,
        container: textDiv,
        viewport
      });
      await tl.render();

      pageTextCache.push({
        text: textContent.items.map((it: any) => it.str || '').join(' '),
        items: textContent.items.filter((it: any) => it.str && it.transform),
        viewportHeight: viewport.height
      });
    }
  }

  // scroll to a fraction (0-1) of the document with sub-page precision
  function scrollToFractionImpl(fraction: number) {
    if (!container || pageCount === 0) return;
    const exactPage = 1 + fraction * (pageCount - 1);
    const pageNum = Math.max(1, Math.min(Math.floor(exactPage), pageCount));
    const withinPage = exactPage - pageNum;

    const pageEl = container.querySelector(`[data-page="${pageNum}"]`) as HTMLElement;
    if (!pageEl) return;
    container.scrollTop = Math.max(0, pageEl.offsetTop + withinPage * pageEl.offsetHeight - 40);
  }

  // search for source text in the pdf and scroll to match position
  export function scrollToSourceText(sourceText: string, hintFraction: number) {
    if (!container || pageTextCache.length === 0) {
      scrollToFractionImpl(hintFraction);
      return;
    }

    // strip latex commands and extract plain words
    const plain = sourceText
      .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])*(\{[^}]*\})?/g, (m) => {
        const inner = m.match(/\{([^}]*)\}$/);
        return inner ? inner[1] : '';
      })
      .replace(/[{}\\$%&~^_#]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    const words = plain.split(' ').filter(w => w.length >= 2);
    if (words.length < 2) {
      scrollToFractionImpl(hintFraction);
      return;
    }

    // try progressively shorter phrases until we find a match
    const hintPage = Math.max(1, Math.round(hintFraction * pageCount));

    for (let len = Math.min(words.length, 6); len >= 2; len--) {
      for (let start = 0; start <= words.length - len; start++) {
        const phrase = words.slice(start, start + len).join(' ').toLowerCase();
        if (phrase.length < 5) continue;

        const result = findPhraseInPages(phrase, hintPage);
        if (result) {
          scrollToPagePosition(result.page, result.yFromTop);
          return;
        }
      }
    }

    scrollToFractionImpl(hintFraction);
  }

  // find a phrase in the cached page texts, returns page (1-based) and y position
  function findPhraseInPages(phrase: string, hintPage: number): { page: number; yFromTop: number } | null {
    const order = Array.from({ length: pageCount }, (_, i) => i + 1)
      .sort((a, b) => Math.abs(a - hintPage) - Math.abs(b - hintPage));

    for (const pageNum of order) {
      const cached = pageTextCache[pageNum - 1];
      if (!cached) continue;

      const pageTextLower = cached.text.toLowerCase();
      const idx = pageTextLower.indexOf(phrase);
      if (idx < 0) continue;

      let cumLen = 0;
      for (const item of cached.items) {
        const itemLen = (item.str || '').length;
        if (cumLen + itemLen >= idx && item.transform) {
          const pdfY = item.transform[5];
          const yFromTop = cached.viewportHeight - pdfY * scale;
          return { page: pageNum, yFromTop: Math.max(0, yFromTop) };
        }
        cumLen += itemLen + 1;
      }

      return { page: pageNum, yFromTop: 0 };
    }
    return null;
  }

  function scrollToPagePosition(pageNum: number, yFromTop: number) {
    if (!container) return;
    const pageEl = container.querySelector(`[data-page="${pageNum}"]`) as HTMLElement;
    if (!pageEl) return;
    container.scrollTop = Math.max(0, pageEl.offsetTop + yFromTop - 50);
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      const newScale = Math.max(0.5, Math.min(4, scale + delta));
      if (newScale !== scale) {
        scale = newScale;
        userZoomed = true;
        if (pdfDoc && !rendering) rerender();
      }
    }
  }

  async function rerender() {
    if (!pdfDoc || rendering) return;
    rendering = true;
    try {
      const savedScroll = container ? container.scrollTop / container.scrollHeight : 0;
      await renderAllPages(pdfDoc);
      if (container) container.scrollTop = savedScroll * container.scrollHeight;
    } finally {
      rendering = false;
    }
  }

  export function setPageCount(n: number) { if (n > 0) pageCount = n; }
  export function setScrollTarget(fraction: number, sourceText?: string) {
    pendingFraction = Math.max(0, Math.min(1, fraction));
    pendingSourceText = sourceText || '';
  }
  export function scrollToPage(pageNum: number) {
    const p = Math.max(1, Math.min(pageNum, pageCount));
    scrollToPagePosition(p, 0);
  }
  export function scrollToFraction(fraction: number) {
    scrollToFractionImpl(Math.max(0, Math.min(1, fraction)));
  }
  export function getPageCount(): number { return pageCount; }
</script>

<div class="pdf-wrap">
  {#if pdfData}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div bind:this={container} class="pdf-container" on:wheel={handleWheel}></div>
  {:else}
    <div class="pdf-empty">
      <p>Press <kbd>Ctrl+Enter</kbd> or click <strong>Compile</strong> to build your document</p>
    </div>
  {/if}
</div>

<style>
  .pdf-wrap {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .pdf-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px;
    background: #3a3a3e;
    position: relative;
  }

  .pdf-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 40px;
    color: var(--text-muted);
    font-size: 12px;
    text-align: center;
    height: 100%;
    width: 100%;
  }

  .pdf-empty kbd {
    background: var(--bg-surface);
    padding: 1px 5px;
    border: 1px solid var(--border);
    font-family: var(--font-editor);
    font-size: 10px;
  }
</style>
