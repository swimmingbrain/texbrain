<script lang="ts">
  import { files, activeFileId, setActiveTab, projectTree, projectName, projectHandle } from '$lib/project/store';
  import { handleOpenFileFromTree, handleOpenDirectory, handleNewFileInProject, handleDeleteFileInProject, handleRenameFileInProject, refreshProjectTree, moveFileInProject } from '$lib/project/manager';
  import type { TreeEntry } from '$lib/project/types';
  import { gitFileStatuses, gitEnabled } from '$lib/git/store';

  function gitStatusLetter(path: string): string | null {
    if (!$gitEnabled) return null;
    const s = $gitFileStatuses.get(path);
    if (!s || s === 'unmodified') return null;
    switch (s) {
      case 'modified': return 'M';
      case 'added': return 'A';
      case 'deleted': return 'D';
      case 'untracked': return '?';
      default: return null;
    }
  }

  function gitStatusColor(path: string): string {
    const s = $gitFileStatuses.get(path);
    switch (s) {
      case 'modified': return 'var(--warning)';
      case 'added': case 'untracked': return 'var(--success)';
      case 'deleted': return 'var(--error)';
      default: return 'var(--text-muted)';
    }
  }

  let expandedDirs: Record<string, boolean> = {};

  function toggleDir(path: string) {
    expandedDirs[path] = !expandedDirs[path];
    expandedDirs = expandedDirs;
  }

  function isExpanded(path: string): boolean {
    return expandedDirs[path] !== false;
  }

  interface FlatEntry {
    entry: TreeEntry;
    depth: number;
  }

  function flattenTree(entries: TreeEntry[], depth: number, _expanded: Record<string, boolean>): FlatEntry[] {
    const result: FlatEntry[] = [];
    for (const entry of entries) {
      result.push({ entry, depth });
      if (entry.type === 'directory' && _expanded[entry.path] !== false) {
        result.push(...flattenTree(entry.children, depth + 1, _expanded));
      }
    }
    return result;
  }

  $: flatEntries = flattenTree($projectTree, 0, expandedDirs);

  function getFileIcon(name: string): string {
    if (name.endsWith('.tex')) return 'T';
    if (name.endsWith('.bib')) return 'B';
    if (name.endsWith('.sty') || name.endsWith('.cls')) return 'S';
    if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.pdf')) return 'I';
    if (name.endsWith('.log') || name.endsWith('.aux')) return 'L';
    return 'F';
  }

  function getFileColor(name: string): string {
    if (name.endsWith('.tex')) return 'var(--accent)';
    if (name.endsWith('.bib')) return 'var(--warning)';
    if (name.endsWith('.sty') || name.endsWith('.cls')) return 'var(--success)';
    return 'var(--text-muted)';
  }

  const TEXT_EXTS = ['.tex', '.bib', '.sty', '.cls', '.txt', '.md', '.log', '.aux', '.bbl', '.blg', '.cfg', '.def', '.dtx', '.ins', '.ltx', '.makefile', '.gitignore'];
  function isTextFile(name: string): boolean {
    const lower = name.toLowerCase();
    return TEXT_EXTS.some(ext => lower.endsWith(ext));
  }

  async function handleFileClick(entry: TreeEntry) {
    if (!isTextFile(entry.name)) return;
    const open = $files.find(f => f.path === entry.path);
    if (open) {
      setActiveTab(open.id);
      return;
    }
    if (entry.handle) {
      await handleOpenFileFromTree(entry.handle, entry.path);
    }
  }

  function isFileActive(path: string): boolean {
    const af = $files.find(f => f.id === $activeFileId);
    return af?.path === path;
  }

  function isFileDirty(path: string): boolean {
    const f = $files.find(f => f.path === path);
    return f?.dirty ?? false;
  }

  let contextMenu: { x: number; y: number; entry: TreeEntry | null } | null = null;

  function handleContextMenu(e: MouseEvent, entry: TreeEntry) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, entry };
  }

  function handleRootContextMenu(e: MouseEvent) {
    e.preventDefault();
    contextMenu = { x: e.clientX, y: e.clientY, entry: null };
  }

  function closeContextMenu() {
    contextMenu = null;
  }

  function handleContextNewFile() {
    if (!contextMenu) return;
    const entry = contextMenu.entry;
    if (entry && entry.type === 'directory') {
      handleNewFileInProject(entry.path, entry.dirHandle || null);
    } else {
      handleNewFileInProject('', null);
    }
    closeContextMenu();
  }

  function handleContextRename() {
    if (!contextMenu?.entry) return;
    handleRenameFileInProject(contextMenu.entry);
    closeContextMenu();
  }

  function handleContextDelete() {
    if (!contextMenu?.entry) return;
    handleDeleteFileInProject(contextMenu.entry);
    closeContextMenu();
  }

  function handleNewFileRoot() {
    handleNewFileInProject('', null);
  }

  let dragSourcePath: string | null = null;
  let dropTargetPath: string | null = null;

  function handleDragStart(e: DragEvent, entry: TreeEntry) {
    if (entry.type !== 'file') return;
    dragSourcePath = entry.path;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/x-texbrain-file', entry.path);
    }
  }

  function handleDirDragOver(e: DragEvent, entry: TreeEntry) {
    if (!dragSourcePath || entry.type !== 'directory') return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTargetPath = entry.path;
  }

  function handleRootDragOver(e: DragEvent) {
    if (!dragSourcePath) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    dropTargetPath = '__root__';
  }

  function handleDirDragLeave(e: DragEvent, entry: TreeEntry) {
    const related = e.relatedTarget as HTMLElement | null;
    const current = e.currentTarget as HTMLElement;
    if (related && current.contains(related)) return;
    if (dropTargetPath === entry.path) dropTargetPath = null;
  }

  function handleRootDragLeave(e: DragEvent) {
    const related = e.relatedTarget as HTMLElement | null;
    const current = e.currentTarget as HTMLElement;
    if (related && current.contains(related)) return;
    if (dropTargetPath === '__root__') dropTargetPath = null;
  }

  function handleDirDrop(e: DragEvent, targetEntry: TreeEntry) {
    e.preventDefault();
    e.stopPropagation();
    if (!dragSourcePath || targetEntry.type !== 'directory') { cleanup(); return; }
    const srcDir = dragSourcePath.includes('/') ? dragSourcePath.substring(0, dragSourcePath.lastIndexOf('/')) : '';
    if (srcDir === targetEntry.path) { cleanup(); return; }
    moveFileInProject(dragSourcePath, targetEntry.path);
    cleanup();
  }

  function handleRootDrop(e: DragEvent) {
    e.preventDefault();
    if (!dragSourcePath) { cleanup(); return; }
    const srcDir = dragSourcePath.includes('/') ? dragSourcePath.substring(0, dragSourcePath.lastIndexOf('/')) : '';
    if (srcDir === '') { cleanup(); return; }
    moveFileInProject(dragSourcePath, '');
    cleanup();
  }

  function handleDragEnd() {
    cleanup();
  }

  function cleanup() {
    dragSourcePath = null;
    dropTargetPath = null;
  }
</script>

<svelte:window on:click={closeContextMenu} />

<div class="file-tree" on:contextmenu={handleRootContextMenu}>
  {#if $projectTree.length > 0}
    <div class="tree-header">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
        <path d="M2 13V3a1 1 0 011-1h4l2 2h4a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <span class="project-name">{$projectName}</span>
      <button class="header-action" on:click={handleNewFileRoot} title="New File">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      </button>
      <button class="header-action" on:click={refreshProjectTree} title="Refresh">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M13.5 2.5v4h-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2.5 8a5.5 5.5 0 019.3-3.9L13.5 6.5M2.5 13.5v-4h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.5 8a5.5 5.5 0 01-9.3 3.9L2.5 9.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="tree-entries" class:root-drop-target={dropTargetPath === '__root__'} on:dragover={handleRootDragOver} on:drop={handleRootDrop} on:dragleave={handleRootDragLeave}>
      {#each flatEntries as { entry, depth } (entry.path)}
        {#if entry.type === 'directory'}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="tree-item dir"
            class:drop-target={dropTargetPath === entry.path}
            style="padding-left: {8 + depth * 16}px"
            on:click={() => toggleDir(entry.path)}
            on:contextmenu|stopPropagation={(e) => handleContextMenu(e, entry)}
            on:dragover={(e) => handleDirDragOver(e, entry)}
            on:dragleave={(e) => handleDirDragLeave(e, entry)}
            on:drop={(e) => handleDirDrop(e, entry)}
            role="button"
            tabindex="0"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" class="chevron" class:open={isExpanded(entry.path)}>
              <path d="M3 2l4 3-4 3" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" class="folder-icon">
              <path d="M2 13V3a1 1 0 011-1h4l2 2h4a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" stroke-width="1.2"/>
            </svg>
            <span class="entry-name">{entry.name}</span>
          </div>
        {:else}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="tree-item file"
            class:active={isFileActive(entry.path)}
            class:non-text={!isTextFile(entry.name)}
            class:dragging={dragSourcePath === entry.path}
            style="padding-left: {22 + depth * 16}px"
            draggable="true"
            on:click={() => handleFileClick(entry)}
            on:contextmenu|stopPropagation={(e) => handleContextMenu(e, entry)}
            on:dragstart={(e) => handleDragStart(e, entry)}
            on:dragend={handleDragEnd}
            title={entry.path}
            role="button"
            tabindex="0"
          >
            <span class="file-badge" style="color: {getFileColor(entry.name)}">{getFileIcon(entry.name)}</span>
            <span class="entry-name">{entry.name}</span>
            {#if isFileDirty(entry.path)}
              <span class="dirty-dot"></span>
            {/if}
            {#if gitStatusLetter(entry.path)}
              <span class="git-status-badge" style="color: {gitStatusColor(entry.path)}">{gitStatusLetter(entry.path)}</span>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {:else}
    <div class="section-label">FILES</div>
    {#if $files.length === 0}
      <div class="empty">
        <span class="empty-text">No project open</span>
        <button class="open-folder-btn" on:click={handleOpenDirectory}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 13V3a1 1 0 011-1h4l2 2h4a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" stroke-width="1.2"/>
          </svg>
          Open Folder
        </button>
      </div>
    {:else}
      {#each $files as file (file.id)}
        <button
          class="tree-item file"
          class:active={file.id === $activeFileId}
          on:click={() => setActiveTab(file.id)}
          title={file.name}
          style="padding-left: 12px"
        >
          <span class="file-badge" style="color: {getFileColor(file.name)}">{getFileIcon(file.name)}</span>
          <span class="entry-name">{file.name}</span>
          {#if file.dirty}
            <span class="dirty-dot"></span>
          {/if}
        </button>
      {/each}
    {/if}
  {/if}
</div>

{#if contextMenu}
  <div class="ctx-menu" style="left:{contextMenu.x}px;top:{contextMenu.y}px">
    <button class="ctx-item" on:click={handleContextNewFile}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
      New File
    </button>
    {#if contextMenu.entry}
      <button class="ctx-item" on:click={handleContextRename}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 1.5l3 3-9 9H2.5v-3l9-9z" stroke="currentColor" stroke-width="1.2"/></svg>
        Rename
      </button>
      <div class="ctx-sep"></div>
      <button class="ctx-item danger" on:click={handleContextDelete}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M4 4l1 10h6l1-10" stroke="currentColor" stroke-width="1.2"/></svg>
        Delete
      </button>
    {/if}
  </div>
{/if}

<style>
  .file-tree {
    overflow-y: auto;
    flex: 1;
    font-size: 12.5px;
  }

  .tree-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    text-transform: uppercase;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-editor);
  }

  .project-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .header-action {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .header-action:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .section-label {
    padding: 8px 10px 6px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-muted);
    text-transform: uppercase;
    font-family: var(--font-editor);
  }

  .tree-entries {
    padding: 2px 0;
  }

  .tree-entries.root-drop-target {
    background: var(--accent-dim);
  }

  .tree-item {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    padding: 2px 10px;
    font-size: 12.5px;
    color: var(--text-secondary);
    text-align: left;
    border-left: 2px solid transparent;
    cursor: pointer;
    line-height: 1.4;
  }

  .tree-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .tree-item.active {
    background: var(--accent-dim);
    color: var(--text-primary);
    border-left-color: var(--accent);
  }

  .tree-item.drop-target {
    background: var(--accent-dim);
    outline: 1px solid var(--accent);
    outline-offset: -1px;
  }

  .tree-item.dragging {
    opacity: 0.4;
  }

  .tree-item.non-text {
    opacity: 0.35;
    cursor: default;
  }

  .tree-item.non-text:hover {
    background: transparent;
    color: var(--text-secondary);
  }

  .chevron {
    flex-shrink: 0;
    transition: transform 100ms ease;
    color: var(--text-muted);
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .folder-icon {
    flex-shrink: 0;
    color: var(--accent);
  }

  .file-badge {
    flex-shrink: 0;
    width: 14px;
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-editor);
    text-align: center;
  }

  .entry-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .dirty-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }

  .git-status-badge {
    font-size: 10px;
    font-weight: 700;
    font-family: var(--font-editor);
    flex-shrink: 0;
    margin-left: auto;
    padding-right: 4px;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 14px;
    color: var(--text-muted);
    font-size: 12px;
  }

  .empty-text {
    opacity: 0.7;
  }

  .open-folder-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }

  .open-folder-btn:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
    border-color: var(--accent);
  }

  .ctx-menu {
    position: fixed;
    z-index: 9999;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    padding: 3px 0;
    min-width: 150px;
  }

  .ctx-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 10px;
    font-size: 12px;
    color: var(--text-secondary);
    text-align: left;
  }

  .ctx-item:hover {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  .ctx-item.danger:hover {
    background: rgba(224, 108, 117, 0.1);
    color: var(--error);
  }

  .ctx-sep {
    height: 1px;
    background: var(--border);
    margin: 3px 0;
  }
</style>
