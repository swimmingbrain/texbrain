<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import { theme } from '$lib/stores/theme';
  import { sidebarOpen, snippetPickerOpen, commandPaletteOpen, compileStatus, compileLog, compileErrors, previewTab, addToast } from '$lib/stores/app';
  import { files, activeFile, activeFileId, updateFileContent, projectHandle, entryPoint, openFileTab } from '$lib/project/store';
  import { handleOpenFile, handleSaveFile, handleSaveFileAs, handleDroppedFiles, handleOpenDirectory, handleNewProject, cloneProject } from '$lib/project/manager';
  import { insertAtCursor, createEditor, replaceEditorContent } from '$lib/editor/setup';
  import type { EditorView } from '@codemirror/view';
  import type { Snippet as SnippetDef } from '$lib/snippets/index';
  import { compileLaTeX, warmup } from '$lib/compiler/latex-engine';
  import { yCollab } from 'y-codemirror.next';
  import { collabActive, collabPanelOpen, collabPeers, collabConnected } from '$lib/collab/store';
  import { createRoom, joinRoom, leaveRoom, getYTextWithUndo, getAwareness, setCurrentFile, getSharedFileList, getSharedEntryPoint, isHost, requestCompile, setCompileStatus, setCompileResult, observeCompileState, readCompileState, collectFilesFromYjs } from '$lib/collab/provider';
  import { collabRoom } from '$lib/collab/store';
  import { gitPanelOpen, gitEnabled, gitChangeCount } from '$lib/git/store';
  import {
    initFs as gitInitFs, initRepo as gitInitRepo, syncFilesToGit,
    writeFileToGit, checkAndLoadGit, refreshGitState,
    readAllFilesFromGit, stageAll as gitStageAll, commit as gitCommit
  } from '$lib/git/engine';

  import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
  import Logo from '$lib/ui/Logo.svelte';
  import TabBar from '$lib/ui/TabBar.svelte';
  import FileTree from '$lib/ui/FileTree.svelte';
  import StatusBar from '$lib/ui/StatusBar.svelte';
  import Resizer from '$lib/ui/Resizer.svelte';
  import CommandPalette from '$lib/ui/CommandPalette.svelte';
  import SnippetPicker from '$lib/ui/SnippetPicker.svelte';
  import EntryPointPicker from '$lib/ui/EntryPointPicker.svelte';
  import PdfViewer from '$lib/ui/PdfViewer.svelte';
  import CollabPanel from '$lib/ui/CollabPanel.svelte';
  import GitPanel from '$lib/ui/GitPanel.svelte';

  let editorView: EditorView | null = null;
  let pdfData: Uint8Array | undefined = undefined;
  let pdfViewer: PdfViewer;
  let compiling = false;
  let compileStuckTimer = 0;
  let pdfPageCount = 1;

  // multi-file document structure for synctex-like scrolling
  let includeOrder: { path: string; lines: number }[] = [];
  let totalDocLines = 0;

  let cursorLine = 1;
  let cursorCol = 1;
  let charCount = 0;
  let wordCount = 0;

  let editorWidth = 50;
  let windowWidth = 1200;
  let lastActiveFileId: string | null = null;
  let editorContainer: HTMLDivElement | null = null;

  let showCloneForm = false;
  let cloneUrl = '';
  let cloneName = '';
  let cloning = false;

  $: isMobile = windowWidth < 900;

  function buildEditor() {
    if (!editorContainer) return;
    editorView?.destroy();
    editorView = null;

    const file = get(activeFile);
    if (!file) return;

    const isCollab = get(collabActive);

    try {
      if (isCollab) {
        const data = getYTextWithUndo(file.path);
        const awareness = getAwareness();
        if (data && awareness) {
          const content = data.ytext.toString();
          updateFileContent(file.id, content);

          editorView = createEditor({
            doc: content,
            parent: editorContainer,
            dark: get(theme) === 'dark',
            onUpdate: handleEditorUpdate,
            collab: yCollab(data.ytext, awareness, { undoManager: data.undoManager })
          });
          setCurrentFile(file.path);
        }
      } else {
        editorView = createEditor({
          doc: file.content,
          parent: editorContainer,
          dark: get(theme) === 'dark',
          onUpdate: handleEditorUpdate
        });
      }
    } catch (err) {
      console.error('editor build:', err);
    }

    lastActiveFileId = file.id;
  }

  // svelte action: creates codemirror when the element enters the dom
  function initEditor(node: HTMLDivElement) {
    editorContainer = node;
    buildEditor();

    function captureSnippetShortcut(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        e.stopPropagation();
        snippetPickerOpen.update(v => !v);
      }
    }
    node.addEventListener('keydown', captureSnippetShortcut, true);

    return {
      destroy() {
        node.removeEventListener('keydown', captureSnippetShortcut, true);
        editorView?.destroy();
        editorView = null;
        editorContainer = null;
        lastActiveFileId = null;
      }
    };
  }

  // rebuild editor when active file changes
  $: if ($activeFile && $activeFile.id !== lastActiveFileId && editorContainer) {
    if (get(collabActive)) {
      buildEditor();
    } else if (editorView) {
      lastActiveFileId = $activeFile.id;
      replaceEditorContent(editorView, $activeFile.content);
    }
  }

  async function collectProjectFiles(): Promise<{
    projectFiles: Map<string, string>;
    binaryFiles: Map<string, ArrayBuffer>;
  }> {
    const projectFiles = new Map<string, string>();
    const binaryFiles = new Map<string, ArrayBuffer>();
    const handle = get(projectHandle);

    if (handle) {
      await readDirRecursive(handle, '', projectFiles, binaryFiles);
    }

    // override with open tab contents (may have unsaved edits)
    for (const tab of get(files)) {
      if (tab.content) {
        projectFiles.set(tab.path, tab.content);
      }
    }

    const af = get(activeFile);
    if (projectFiles.size === 0 && af) {
      projectFiles.set(af.path || af.name, af.content);
    }

    return { projectFiles, binaryFiles };
  }

  // build a flattened include map for multi-file fraction calculation
  function updateIncludeMap(projectFiles: Map<string, string>, entryPointPath: string) {
    const epContent = projectFiles.get(entryPointPath);
    if (!epContent) { includeOrder = []; totalDocLines = 0; return; }

    const docStart = epContent.indexOf('\\begin{document}');
    const contentPart = docStart >= 0 ? epContent.substring(docStart) : epContent;

    includeOrder = [];
    const visited = new Set<string>();
    const re = /\\(?:input|include)\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(contentPart)) !== null) {
      let name = m[1];
      if (!name.endsWith('.tex')) name += '.tex';
      collectLeafFiles(name, projectFiles, visited);
    }
    totalDocLines = includeOrder.reduce((s, f) => s + f.lines, 0);
  }

  function collectLeafFiles(filePath: string, projectFiles: Map<string, string>, visited: Set<string>) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const content = projectFiles.get(filePath);
    if (!content) { includeOrder.push({ path: filePath, lines: 100 }); return; }

    const re = /\\(?:input|include)\{([^}]+)\}/g;
    let m;
    let hasIncludes = false;
    while ((m = re.exec(content)) !== null) {
      hasIncludes = true;
      let name = m[1];
      if (!name.endsWith('.tex')) name += '.tex';
      collectLeafFiles(name, projectFiles, visited);
    }

    if (!hasIncludes) {
      includeOrder.push({ path: filePath, lines: content.split('\n').length });
    }
  }

  // map cursor position to a fraction of the overall document (0-1) for pdf scrolling
  function computeDocumentFraction(): number {
    if (!editorView) return 0.5;

    const pos = editorView.state.selection.main.head;
    const line = editorView.state.doc.lineAt(pos);
    const localFraction = line.number / Math.max(1, editorView.state.doc.lines);

    if (includeOrder.length === 0 || totalDocLines === 0) return localFraction;

    const af = get(activeFile);
    if (!af) return localFraction;
    const afPath = af.path || af.name;

    const afName = afPath.replace(/^.*[\\/]/, '');
    const idx = includeOrder.findIndex(inc => {
      const incName = inc.path.replace(/^.*[\\/]/, '');
      return incName === afName || inc.path === afPath;
    });
    if (idx === -1) return localFraction;

    let cumLines = 0;
    for (let i = 0; i < idx; i++) cumLines += includeOrder[i].lines;
    cumLines += Math.round(localFraction * includeOrder[idx].lines);
    return cumLines / totalDocLines;
  }

  async function doCompile() {
    const af = get(activeFile);
    if (!af) return;

    // safety valve: force-reset if stuck for >30s
    if (compiling) {
      if (compileStuckTimer && Date.now() - compileStuckTimer > 30_000) {
        compiling = false;
        compileStuckTimer = 0;
      } else {
        return;
      }
    }

    const isCollabMode = get(collabActive);

    // non-host in collab: delegate compilation to host
    if (isCollabMode && !isHost()) {
      compiling = true;
      compileStuckTimer = Date.now();
      compileStatus.set('compiling');
      compileLog.set([`[${ts()}] requesting compilation from host...`]);
      requestCompile();

      setTimeout(() => {
        if (compiling && get(collabActive) && !isHost()) {
          compiling = false;
          compileStuckTimer = 0;
          compileStatus.set('error');
          compileLog.set([`[${ts()}] host did not respond - try again or compile locally after leaving the session`]);
        }
      }, 15_000);
      return;
    }

    try {
      compiling = true;
      compileStuckTimer = Date.now();
      compileStatus.set('compiling');
      compileLog.set([`[${ts()}] compiling...`]);

      if (isCollabMode) {
        setCompileStatus('compiling');
      }

      let projectFiles: Map<string, string>;
      let binaryFiles = new Map<string, ArrayBuffer>();

      if (isCollabMode) {
        // read text files from yjs (authoritative source during collab)
        projectFiles = collectFilesFromYjs();
        const handle = get(projectHandle);
        if (handle) {
          try {
            await readDirRecursive(handle, '', new Map(), binaryFiles);
          } catch {}
        }
      } else {
        const collected = await collectProjectFiles();
        projectFiles = collected.projectFiles;
        binaryFiles = collected.binaryFiles;
      }

      const mainFile = get(entryPoint) || af.path || af.name;

      updateIncludeMap(projectFiles, mainFile);

      let compileContext = '';
      if (editorView) {
        const state = editorView.state;
        const pos = state.selection.main.head;
        const line = state.doc.lineAt(pos);
        const startLine = Math.max(1, line.number - 1);
        const endLine = Math.min(state.doc.lines, line.number + 1);
        for (let i = startLine; i <= endLine; i++) {
          compileContext += state.doc.line(i).text + ' ';
        }
        compileContext = compileContext.trim();
      }
      pdfViewer?.setScrollTarget(computeDocumentFraction(), compileContext);

      const result = await Promise.race([
        compileLaTeX(mainFile, projectFiles, binaryFiles),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('compilation timed out after 60s')), 60_000))
      ]);

      const { errors: parsedErrors, cleanedLines } = parseLog(result.log || '');
      compileErrors.set(parsedErrors);

      if (result.status === 0 && result.pdf) {
        const pageMatch = result.log?.match(/\((\d+)\s+pages?,/);
        if (pageMatch) {
          pdfPageCount = parseInt(pageMatch[1], 10);
          pdfViewer?.setPageCount(pdfPageCount);
        }

        pdfData = new Uint8Array(result.pdf);
        compileStatus.set('success');
        compileLog.set([`[${ts()}] compilation successful (${pdfPageCount} pages)`, ...cleanedLines]);

        if (parsedErrors.some(e => e.type === 'error')) {
          previewTab.set('errors');
        }

        if (isCollabMode) {
          setCompileResult({ status: 'success', pdf: pdfData, log: cleanedLines, errors: parsedErrors, pageCount: pdfPageCount });
        }
      } else {
        compileStatus.set('error');
        compileLog.set([`[${ts()}] compilation failed (status ${result.status})`, ...cleanedLines]);
        previewTab.set('errors');

        if (isCollabMode) {
          setCompileResult({ status: 'error', pdf: null, log: cleanedLines, errors: parsedErrors, pageCount: pdfPageCount });
        }
      }
    } catch (err: any) {
      compileStatus.set('error');
      compileLog.update(log => [...log, `[error] ${err.message || String(err)}`]);

      if (isCollabMode) {
        setCompileResult({ status: 'error', pdf: null, log: [`[error] ${err.message || String(err)}`], errors: [{ type: 'error', message: err.message || String(err) }], pageCount: 0 });
      }
    } finally {
      compiling = false;
      compileStuckTimer = 0;
    }
  }

  function compilePreview() { doCompile(); }

  function ts() { return new Date().toLocaleTimeString(); }

  // parse latex log into structured errors/warnings
  function parseLog(rawLog: string): {
    errors: Array<{ type: 'error' | 'warning'; message: string; line?: number; file?: string }>;
    cleanedLines: string[];
  } {
    const errors: Array<{ type: 'error' | 'warning'; message: string; line?: number; file?: string }> = [];
    const lines = rawLog.split('\n');
    const cleanedLines: string[] = [];

    const noisePatterns = [
      /^\s*\(\/tex\//,
      /^\s*\(\/tex\/[^)]*$/,
      /^\s*\)\s*$/,
      /^\s*\)+\s*$/,
      /^\s*\(\/?tex\//,
      /^pdfTeX warning:.*fontmap entry/,
      /^\s*exists, duplicates ignored$/,
      /^ABD: Every/,
      /^\*geometry\*/,
      /^1773\d+/,
      /^\s*$/,
    ];

    const suppressedWarningPatterns = [
      /shell escape.*disabled/i,
      /You have requested package/,
      /You have requested, on input line.*version/,
      /^(Underfull|Overfull)\s+\\[hv]box/,
      /pdfTeX warning:.*PDF inclusion: found PDF/,
      /ABD: EveryShipout/,
    ];

    function isSuppressedWarning(msg: string): boolean {
      return suppressedWarningPatterns.some(p => p.test(msg));
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('! ')) {
        const msg = trimmed.slice(2);
        let lineNum: number | undefined;
        let file: string | undefined;
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const m = lines[j].match(/^l\.(\d+)/);
          if (m) { lineNum = parseInt(m[1], 10); break; }
        }
        errors.push({ type: 'error', message: msg, line: lineNum, file });
        cleanedLines.push(line);
        continue;
      }

      if (/LaTeX Warning:/i.test(trimmed) || /Package \w+ Warning:/i.test(trimmed)) {
        const warnMatch = trimmed.match(/Warning:\s*(.+)/i);
        const msg = warnMatch ? warnMatch[1] : trimmed;
        if (!isSuppressedWarning(trimmed) && !isSuppressedWarning(msg)) {
          let lineNum: number | undefined;
          const lm = trimmed.match(/on input line (\d+)/);
          if (lm) lineNum = parseInt(lm[1], 10);
          errors.push({ type: 'warning', message: msg.replace(/\s+$/, ''), line: lineNum });
        }
        cleanedLines.push(line);
        continue;
      }

      if (/pdfTeX warning:/i.test(trimmed) && !/fontmap entry/.test(trimmed)) {
        if (!isSuppressedWarning(trimmed)) {
          errors.push({ type: 'warning', message: trimmed });
        }
        cleanedLines.push(line);
        continue;
      }

      if (/^(Underfull|Overfull)\s+\\[hv]box/.test(trimmed)) {
        cleanedLines.push(line);
        continue;
      }

      if (noisePatterns.some(p => p.test(trimmed))) continue;
      if (/^[\s()]*$/.test(trimmed)) continue;
      if (/^[\s()]*(\([^)]*\)[\s)]*)+[\s)]*$/.test(trimmed)) continue;

      cleanedLines.push(line);
    }

    return { errors, cleanedLines };
  }

  async function saveAndCompile() {
    await handleSaveFile();
    doCompile();
  }

  async function readDirRecursive(
    dirHandle: FileSystemDirectoryHandle,
    prefix: string,
    fileMap: Map<string, string>,
    binaryMap?: Map<string, ArrayBuffer>
  ): Promise<void> {
    const textExts = new Set([
      'tex', 'sty', 'cls', 'bib', 'bst', 'def', 'cfg', 'fd',
      'dtx', 'ins', 'ltx', 'txt', 'bbx', 'cbx', 'lbx'
    ]);
    const binaryExts = new Set([
      'png', 'jpg', 'jpeg', 'pdf', 'eps', 'svg', 'gif', 'bmp',
      'tfm', 'pfb', 'vf', 'map', 'enc', 'otf', 'ttf'
    ]);
    for await (const entry of (dirHandle as any).values()) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'file') {
        const ext = entry.name.split('.').pop()?.toLowerCase() || '';
        if (textExts.has(ext)) {
          try {
            const file = await entry.getFile();
            const content = await file.text();
            fileMap.set(path, content);
          } catch {}
        } else if (binaryMap && binaryExts.has(ext)) {
          try {
            const file = await entry.getFile();
            const data = await file.arrayBuffer();
            binaryMap.set(path, data);
          } catch {}
        }
      } else if (entry.kind === 'directory') {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules' && entry.name !== '__pycache__') {
          await readDirRecursive(entry, path, fileMap, binaryMap);
        }
      }
    }
  }

  function handleEditorUpdate(content: string) {
    if (!$activeFile) return;
    updateFileContent($activeFile.id, content);
    if (editorView) {
      const pos = editorView.state.selection.main.head;
      const line = editorView.state.doc.lineAt(pos);
      cursorLine = line.number;
      cursorCol = pos - line.from + 1;
      charCount = editorView.state.doc.length;
      const text = editorView.state.doc.toString();
      wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    }
    scheduleSyncToGit();
  }

  // double-click in editor jumps pdf to approximate cursor position
  function handleEditorDblClick() {
    if (!editorView || !pdfData) return;
    const state = editorView.state;
    const pos = state.selection.main.head;
    const line = state.doc.lineAt(pos);
    const startLine = Math.max(1, line.number - 1);
    const endLine = Math.min(state.doc.lines, line.number + 1);
    let context = '';
    for (let i = startLine; i <= endLine; i++) {
      context += state.doc.line(i).text + ' ';
    }
    const fraction = computeDocumentFraction();
    pdfViewer?.scrollToSourceText(context.trim(), fraction);
  }

  function handleSnippetInsert(snippet: SnippetDef) {
    if (editorView) insertAtCursor(editorView, snippet.code);
  }

  function handleResizeDelta(delta: number) {
    const cw = windowWidth - ($sidebarOpen ? 260 : 0);
    editorWidth = Math.max(25, Math.min(75, editorWidth + (delta / cw) * 100));
  }

  function savePdf() {
    if (!pdfData) return;
    const blob = new Blob([new Uint8Array(pdfData)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ep = get(entryPoint);
    const baseName = ep ? ep.replace(/^.*[\\/]/, '').replace(/\.tex$/, '') : 'document';
    a.href = url;
    a.download = baseName + '.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }

  let commands = [
    { id: 'newproject', label: 'New Project', shortcut: '', action: handleNewProject, category: 'file' },
    { id: 'opendir', label: 'Open Folder', shortcut: '', action: handleOpenDirectory, category: 'file' },
    { id: 'open', label: 'Open File', shortcut: 'Ctrl+O', action: handleOpenFile, category: 'file' },
    { id: 'save', label: 'Save + Compile', shortcut: 'Ctrl+S', action: saveAndCompile, category: 'file' },
    { id: 'saveas', label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: handleSaveFileAs, category: 'file' },
    { id: 'compile', label: 'Compile', shortcut: 'Ctrl+Enter', action: compilePreview, category: 'compile' },
    { id: 'sidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => sidebarOpen.update(v => !v), category: 'view' },
    { id: 'theme', label: 'Toggle Theme', shortcut: '', action: () => theme.toggle(), category: 'view' },
    { id: 'snippet', label: 'Insert Snippet', shortcut: 'Ctrl+/', action: () => snippetPickerOpen.set(true), category: 'edit' },
    { id: 'preview', label: 'Show Preview', shortcut: '', action: () => previewTab.set('preview'), category: 'view' },
    { id: 'log', label: 'Show Log', shortcut: '', action: () => previewTab.set('log'), category: 'view' },
    { id: 'git', label: 'Toggle Git Panel', shortcut: 'Ctrl+G', action: () => gitPanelOpen.update(v => !v), category: 'view' },
  ];

  function handleGlobalKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'k') { e.preventDefault(); commandPaletteOpen.update(v => !v); }
    else if (mod && e.key === 's' && !e.shiftKey) { e.preventDefault(); saveAndCompile(); }
    else if (mod && e.key === 's' && e.shiftKey) { e.preventDefault(); handleSaveFileAs(); }
    else if (mod && e.key === 'o') { e.preventDefault(); handleOpenFile(); }
    else if (mod && e.key === 'Enter') { e.preventDefault(); compilePreview(); }
    else if (mod && e.key === 'b') { e.preventDefault(); sidebarOpen.update(v => !v); }
    else if (mod && e.key === '/') { e.preventDefault(); snippetPickerOpen.update(v => !v); }
    else if (mod && e.key === 'g') { e.preventDefault(); if (get(projectHandle)) gitPanelOpen.update(v => !v); }
    else if (e.key === 'Escape') { commandPaletteOpen.set(false); snippetPickerOpen.set(false); }
  }

  function handleDragOver(e: DragEvent) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; }
  function handleDrop(e: DragEvent) { e.preventDefault(); if (e.dataTransfer) handleDroppedFiles(e.dataTransfer); }

  async function handleCreateCollabRoom(password: string | null) {
    let projectFiles = new Map<string, string>();
    try {
      const collected = await collectProjectFiles();
      projectFiles = collected.projectFiles;
    } catch (err) {
      console.warn('collectProjectFiles failed, using open tabs only:', err);
      for (const tab of get(files)) {
        if (tab.content) projectFiles.set(tab.path, tab.content);
      }
    }

    const ep = get(entryPoint);
    createRoom(password, projectFiles, ep);
    addToast('collaboration session started!', 'success');
    buildEditor();
  }

  async function handleJoinCollabRoom(shareCode: string, password: string | null) {
    await joinRoom(shareCode, password);

    const fileList = getSharedFileList();
    const ep = getSharedEntryPoint();

    for (const path of fileList) {
      const data = getYTextWithUndo(path);
      if (data) {
        const content = data.ytext.toString();
        const name = path.split('/').pop() || path;
        openFileTab(name, content, null, path);
      }
    }

    if (ep) {
      entryPoint.set(ep);
    }

    addToast('joined collaboration session!', 'success');
    buildEditor();
  }

  function handleLeaveCollab() {
    compiling = false;
    compileStuckTimer = 0;
    buildEditor();
  }

  async function handleGitInit() {
    let projectFiles = new Map<string, string>();
    try {
      const collected = await collectProjectFiles();
      projectFiles = collected.projectFiles;
    } catch {
      for (const tab of get(files)) {
        if (tab.content) projectFiles.set(tab.path, tab.content);
      }
    }

    const handle = get(projectHandle);
    const projectId = handle?.name || 'default';
    gitInitFs(projectId);

    await syncFilesToGit(projectFiles);
    await gitInitRepo();
    await gitStageAll();
    await gitCommit('initial commit');
    await refreshGitState();
  }

  async function handleGitBranchSwitch() {
    const gitFiles = await readAllFilesFromGit();
    const currentFiles = get(files);

    for (const tab of currentFiles) {
      const newContent = gitFiles.get(tab.path);
      if (newContent !== undefined) {
        updateFileContent(tab.id, newContent);
      }
    }

    buildEditor();
  }

  function handleShowCloneForm() {
    showCloneForm = true;
    cloneUrl = '';
    cloneName = '';
  }

  function handleCancelClone() {
    showCloneForm = false;
    cloneUrl = '';
    cloneName = '';
  }

  function onCloneUrlInput() {
    if (!cloneUrl.trim()) { cloneName = ''; return; }
    const parts = cloneUrl.replace(/\.git$/, '').split('/');
    const derived = parts[parts.length - 1] || '';
    cloneName = derived;
  }

  async function handleClone() {
    const url = cloneUrl.trim();
    const name = cloneName.trim();
    if (!url || !name) return;
    cloning = true;
    try {
      await cloneProject(url, name);
      showCloneForm = false;
      cloneUrl = '';
      cloneName = '';
      buildEditor();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        const msg = err?.message || String(err);
        if (msg.includes('CORS') || msg.includes('Failed to fetch')) {
          addToast('clone failed: CORS error - check proxy in git > remote after cloning', 'error');
        } else {
          addToast('clone failed: ' + msg, 'error');
        }
      }
    } finally {
      cloning = false;
    }
  }

  // sync editor content to lightning-fs for git operations
  async function syncEditorToGit() {
    if (!get(gitEnabled)) return;
    for (const tab of get(files)) {
      if (tab.content) {
        await writeFileToGit(tab.path, tab.content);
      }
    }
    await refreshGitState();
  }

  let gitSyncTimer: ReturnType<typeof setTimeout> | null = null;
  function scheduleSyncToGit() {
    if (!get(gitEnabled)) return;
    if (gitSyncTimer) clearTimeout(gitSyncTimer);
    gitSyncTimer = setTimeout(() => syncEditorToGit(), 1000);
  }

  // observe collab compile state for host/peer coordination
  let unobserveCompile: (() => void) | null = null;

  function setupCollabCompileObserver() {
    unobserveCompile?.();
    unobserveCompile = null;
    if (!get(collabActive)) return;

    unobserveCompile = observeCompileState((key, value) => {
      const room = get(collabRoom);

      if (key === 'requestedAt' && room?.isHost && !compiling) {
        doCompile();
        return;
      }

      if (!room?.isHost) {
        if (key === 'status' && value === 'compiling') {
          compiling = true;
          compileStatus.set('compiling');
          compileLog.set([`[${ts()}] host is compiling...`]);
        }

        if (key === 'compiledAt') {
          try {
            const snap = readCompileState();
            const log: string[] = JSON.parse(snap.log);
            const errors: any[] = JSON.parse(snap.errors);

            if (snap.status === 'success' && snap.pdf) {
              pdfData = new Uint8Array(snap.pdf);
              pdfPageCount = snap.pageCount;
              pdfViewer?.setPageCount(pdfPageCount);
              compileStatus.set('success');
              compileLog.set([`[${ts()}] compilation successful (${pdfPageCount} pages)`, ...log]);
              compileErrors.set(errors);
            } else {
              compileStatus.set('error');
              compileLog.set([`[${ts()}] compilation failed`, ...log]);
              compileErrors.set(errors);
              previewTab.set('errors');
            }
          } catch (err) {
            console.error('failed to read compile result:', err);
          } finally {
            compiling = false;
            compileStuckTimer = 0;
          }
        }
      }
    });
  }

  $: if (browser && $collabActive) {
    setupCollabCompileObserver();
  } else if (browser) {
    unobserveCompile?.();
    unobserveCompile = null;
  }

  // detect git repo when project handle changes
  let lastGitProjectHandle: FileSystemDirectoryHandle | null = null;
  $: if (browser && $projectHandle && $projectHandle !== lastGitProjectHandle) {
    lastGitProjectHandle = $projectHandle;
    gitInitFs($projectHandle.name);
    (async () => {
      try {
        let projectFiles = new Map<string, string>();
        try {
          const collected = await collectProjectFiles();
          projectFiles = collected.projectFiles;
        } catch {
          for (const tab of get(files)) {
            if (tab.content) projectFiles.set(tab.path, tab.content);
          }
        }
        await syncFilesToGit(projectFiles);
        await checkAndLoadGit();
      } catch (err) {
        console.error('git init check:', err);
      }
    })();
  }

  onMount(() => {
    warmup().catch(() => {});

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if ($files.some(f => f.dirty)) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      unobserveCompile?.();
      if (gitSyncTimer) clearTimeout(gitSyncTimer);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  });
</script>

<svelte:head>
  <title>{$activeFile ? `${$activeFile.name}${$activeFile.dirty ? ' *' : ''} | TeXbrain` : 'TeXbrain Editor'}</title>
</svelte:head>

<svelte:window on:keydown={handleGlobalKeydown} bind:innerWidth={windowWidth} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="editor-app" on:dragover={handleDragOver} on:drop={handleDrop} role="application">
  <header class="topbar">
    <div class="topbar-left">
      <a href="{base}/" class="logo">
        <span class="logo-icon"><Logo size={24} /></span>
        <span class="logo-text">TeXbrain</span>
      </a>
      {#if $activeFile}
        <div class="file-info">
          <span class="filename">{$activeFile.name}</span>
          {#if $activeFile.dirty}
            <span class="save-dot unsaved" title="Unsaved changes"></span>
          {:else}
            <span class="save-dot saved" title="Saved"></span>
          {/if}
        </div>
      {/if}
    </div>
    <div class="topbar-actions">
      <button class="action-btn" on:click={handleOpenDirectory} title="Open Folder">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 13V3a1 1 0 011-1h4l2 2h4a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Open Folder</span>
      </button>
      <button class="action-btn" on:click={handleOpenFile} title="Open File (Ctrl+O)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 1h5l4 4v9a1 1 0 01-1 1H4a1 1 0 01-1-1V2a1 1 0 011-1z" stroke="currentColor" stroke-width="1.3"/><path d="M9 1v4h4" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Open File</span>
      </button>
      <button class="action-btn" on:click={handleSaveFile} title="Save (Ctrl+S)" disabled={!$activeFile}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M12.5 14H3.5a1 1 0 01-1-1V3a1 1 0 011-1h7l3 3v8a1 1 0 01-1 1z" stroke="currentColor" stroke-width="1.3"/><path d="M11.5 14v-4h-7v4" stroke="currentColor" stroke-width="1.3"/><path d="M5.5 2v3h4" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Save</span>
      </button>
      <button class="action-btn accent" on:click={compilePreview} title="Compile (Ctrl+Enter)" disabled={!$activeFile || compiling}>
        {#if compiling}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" stroke-dasharray="8 4" class="spin"/></svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5 3l8 5-8 5V3z" fill="currentColor"/></svg>
        {/if}
        <span>{compiling ? 'Compiling...' : 'Compile'}</span>
      </button>
      {#if $entryPoint}
        <span class="entry-point-label" title="Entry point for compilation">{$entryPoint}</span>
      {/if}
      <div class="separator"></div>
      <button class="action-btn" class:git-active={$gitEnabled} on:click={() => gitPanelOpen.update(v => !v)} title="Git (Ctrl+G)" disabled={!$projectHandle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5zm-2 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/></svg>
        <span>Git</span>
        {#if $gitChangeCount > 0}<span class="git-change-badge">{$gitChangeCount}</span>{/if}
      </button>
      <button class="action-btn" class:collab-active={$collabActive} on:click={() => collabPanelOpen.update(v => !v)} title="Collaborate">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M1 13c0-2.2 2.2-4 5-4s5 1.8 5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="11.5" cy="5" r="2" stroke="currentColor" stroke-width="1.1"/><path d="M14.5 12c0-1.7-1.3-3-3-3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
        <span>{$collabActive ? `Live (${$collabPeers.length + 1})` : 'Collaborate'}</span>
        {#if $collabActive}<span class="collab-live-dot"></span>{/if}
      </button>
      <div class="separator"></div>
      <ThemeToggle />
    </div>
  </header>

  <div class="toolbar">
    <div class="toolbar-group">
      <button class="tool-btn" class:active={$sidebarOpen} on:click={() => sidebarOpen.update(v => !v)} title="Toggle Sidebar (Ctrl+B)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M5.5 2.5v11" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
      <div class="tool-sep"></div>
      <button class="tool-btn" on:click={() => { if (editorView) insertAtCursor(editorView, '\\textbf{|}') }} title="Bold"><strong style="font-size:13px">B</strong></button>
      <button class="tool-btn" on:click={() => { if (editorView) insertAtCursor(editorView, '\\textit{|}') }} title="Italic"><em style="font-size:13px">I</em></button>
      <button class="tool-btn" on:click={() => { if (editorView) insertAtCursor(editorView, '\\underline{|}') }} title="Underline"><span style="font-size:13px;text-decoration:underline">U</span></button>
      <div class="tool-sep"></div>
      <button class="tool-btn" on:click={() => snippetPickerOpen.set(true)} title="Insert Snippet (Ctrl+/)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span style="font-size:11px;margin-left:2px">Snippets</span>
      </button>
    </div>
    <div class="toolbar-group">
      <button class="tool-btn" on:click={() => commandPaletteOpen.set(true)} title="Command Palette (Ctrl+K)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
        <kbd style="margin-left:4px">Ctrl+K</kbd>
      </button>
    </div>
  </div>

  <div class="main-area">
    {#if $sidebarOpen && !isMobile}
      <aside class="sidebar">
        <FileTree />
      </aside>
    {/if}

    <div class="workspace">
      <TabBar />
      <div class="editor-area">
        {#if $activeFile}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="editor-pane" style={!isMobile ? `width:${editorWidth}%` : ''} on:dblclick={handleEditorDblClick}>
            <div class="cm-wrapper" use:initEditor></div>
          </div>
        {/if}

        {#if $activeFile && !isMobile}
          <Resizer on:resize={(e) => handleResizeDelta(e.detail.delta)} />
          <div class="preview-pane" style="width:{100 - editorWidth}%">
            <div class="preview-header">
              <button class="preview-tab" class:active={$previewTab === 'preview'} on:click={() => previewTab.set('preview')}>Preview</button>
              <button class="preview-tab" class:active={$previewTab === 'errors'} on:click={() => previewTab.set('errors')}>
                Errors
                {#if $compileErrors.filter(e => e.type === 'error').length > 0}
                  <span class="error-badge has-errors">{$compileErrors.filter(e => e.type === 'error').length}</span>
                {/if}
              </button>
              <button class="preview-tab" class:active={$previewTab === 'warnings'} on:click={() => previewTab.set('warnings')}>
                Warnings
                {#if $compileErrors.filter(e => e.type === 'warning').length > 0}
                  <span class="error-badge">{$compileErrors.filter(e => e.type === 'warning').length}</span>
                {/if}
              </button>
              <button class="preview-tab" class:active={$previewTab === 'log'} on:click={() => previewTab.set('log')}>Log</button>
              <div style="flex:1"></div>
              {#if pdfData}
                <button class="preview-tab save-pdf" on:click={savePdf} title="Save PDF">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8M4 7l4 4 4-4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12v2h12v-2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  <span style="font-size:11px;margin-left:3px">Save PDF</span>
                </button>
              {/if}
            </div>
            {#if $previewTab === 'preview'}
              <div class="preview-content">
                <PdfViewer bind:this={pdfViewer} {pdfData} />
              </div>
            {:else if $previewTab === 'errors'}
              <div class="errors-content">
                {#if $compileErrors.filter(e => e.type === 'error').length === 0}
                  <div class="preview-empty"><p>No errors</p></div>
                {:else}
                  {#each $compileErrors.filter(e => e.type === 'error') as err}
                    <div class="error-item is-error">
                      <span class="error-type-badge err-badge">E</span>
                      <span class="error-msg">{err.message}</span>
                      {#if err.line}
                        <span class="error-line">line {err.line}</span>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            {:else if $previewTab === 'warnings'}
              <div class="errors-content">
                {#if $compileErrors.filter(e => e.type === 'warning').length === 0}
                  <div class="preview-empty"><p>No warnings</p></div>
                {:else}
                  {#each $compileErrors.filter(e => e.type === 'warning') as warn}
                    <div class="error-item is-warning">
                      <span class="error-type-badge warn-badge">W</span>
                      <span class="error-msg">{warn.message}</span>
                      {#if warn.line}
                        <span class="error-line">line {warn.line}</span>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            {:else}
              <div class="log-content">
                {#each $compileLog as entry}
                  <div class="log-entry" class:error={entry.includes('[Error]') || entry.includes('!')} class:success={entry.includes('successful')}>{entry}</div>
                {/each}
                {#if $compileLog.length === 0}
                  <div class="preview-empty"><p>No compilation log yet</p></div>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if !$activeFile}
          <div class="welcome-state">
            <div class="welcome-content">
              {#if showCloneForm}
                <div class="welcome-icon"><Logo size={44} /></div>
                <h2 class="welcome-title">Clone Repository</h2>
                <p class="welcome-desc">Clone a Git repository and open it as a project</p>
                <div class="clone-form">
                  <div class="clone-field">
                    <label for="clone-url">Repository URL</label>
                    <input id="clone-url" type="text" bind:value={cloneUrl} on:input={onCloneUrlInput} placeholder="https://github.com/user/repo" class="clone-input" />
                  </div>
                  <div class="clone-field">
                    <label for="clone-name">Project Name</label>
                    <input id="clone-name" type="text" bind:value={cloneName} placeholder="my-project" class="clone-input" />
                  </div>
                  <div class="clone-actions">
                    <button class="welcome-btn primary" on:click={handleClone} disabled={cloning || !cloneUrl.trim() || !cloneName.trim()}>
                      {#if cloning}
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" stroke-dasharray="8 4" class="spin"/></svg>
                        Cloning...
                      {:else}
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 12V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        Choose Location & Clone
                      {/if}
                    </button>
                    <button class="welcome-btn secondary" on:click={handleCancelClone} disabled={cloning}>Back</button>
                  </div>
                  <p class="clone-hint">You'll pick a folder where the project will be saved. Auth and CORS proxy can be configured in Git > Remote after cloning.</p>
                </div>
              {:else}
                <div class="welcome-icon"><Logo size={44} /></div>
                <h2 class="welcome-title">Welcome to TeXbrain</h2>
                <p class="welcome-desc">Open a project folder or create a new one to get started</p>
                <div class="welcome-actions">
                  <button class="welcome-btn primary" on:click={handleNewProject}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                    New Project
                  </button>
                  <button class="welcome-btn secondary" on:click={handleOpenDirectory}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 13V3a1 1 0 011-1h4l2 2h4a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1z" stroke="currentColor" stroke-width="1.3"/></svg>
                    Open Folder
                  </button>
                  <button class="welcome-btn secondary" on:click={handleShowCloneForm}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5zm-2 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/></svg>
                    Clone Repository
                  </button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <StatusBar {cursorLine} {cursorCol} {charCount} {wordCount} />

  <CommandPalette {commands} />
  <SnippetPicker onInsert={handleSnippetInsert} />
  <EntryPointPicker />
  <CollabPanel onCreateRoom={handleCreateCollabRoom} onJoinRoom={handleJoinCollabRoom} onLeaveRoom={handleLeaveCollab} />
  <GitPanel onBranchSwitch={handleGitBranchSwitch} onInitRepo={handleGitInit} />
</div>

<style>
  .editor-app { height: 100vh; display: flex; flex-direction: column; background: var(--bg-deep); overflow: hidden; }

  .topbar { height: var(--topbar-h); background: var(--bg-surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 10px; flex-shrink: 0; gap: 10px; }
  .topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .logo { display: flex; align-items: center; gap: 6px; text-decoration: none; flex-shrink: 0; }
  .logo-icon { display: flex; align-items: center; color: var(--accent); }
  .logo-text { font-family: var(--font-brand); font-style: italic; font-size: 16px; color: var(--text-primary); }
  .file-info { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .filename { font-size: 12px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-editor); }
  .save-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
  .save-dot.saved { background: var(--success); }
  .save-dot.unsaved { background: var(--accent); }

  .topbar-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .action-btn { display: flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 11.5px; font-weight: 500; color: var(--text-muted); }
  .action-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
  .action-btn:disabled { opacity: 0.35; cursor: default; }
  .action-btn.accent { background: var(--accent); color: #111; }
  .action-btn.accent:hover:not(:disabled) { background: var(--accent-hover); color: #111; }
  .action-btn span { display: none; }
  @media (min-width: 768px) { .action-btn span { display: inline; } }
  .entry-point-label { font-size: 10px; color: var(--text-muted); font-family: var(--font-editor); padding: 1px 5px; background: var(--bg-hover); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .separator { width: 1px; height: 16px; background: var(--border); margin: 0 3px; }

  .toolbar { height: var(--toolbar-h); background: var(--bg-surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 10px; flex-shrink: 0; gap: 6px; }
  .toolbar-group { display: flex; align-items: center; gap: 1px; }
  .tool-btn { display: flex; align-items: center; gap: 3px; padding: 4px 7px; color: var(--text-muted); font-size: 11.5px; }
  .tool-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .tool-btn.active { background: var(--accent-dim); color: var(--accent); }
  .tool-sep { width: 1px; height: 14px; background: var(--border); margin: 0 3px; }

  .main-area { flex: 1; display: flex; overflow: hidden; min-height: 0; }
  .sidebar { width: var(--sidebar-w); background: var(--bg-surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; flex-shrink: 0; }
  .workspace { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  .editor-area { flex: 1; display: flex; overflow: hidden; min-height: 0; position: relative; }
  .editor-pane { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  .cm-wrapper { flex: 1; overflow: hidden; }
  .cm-wrapper :global(.cm-editor) { height: 100%; }

  .preview-pane { display: flex; flex-direction: column; min-width: 280px; overflow: hidden; background: var(--bg-elevated); }
  .preview-header { display: flex; align-items: center; height: 32px; border-bottom: 1px solid var(--border); padding: 0 3px; flex-shrink: 0; }
  .preview-tab { padding: 5px 12px; font-size: 11px; font-weight: 500; color: var(--text-muted); }
  .preview-tab:hover { color: var(--text-secondary); }
  .preview-tab.active { color: var(--text-primary); background: var(--bg-hover); }
  .preview-content { flex: 1; overflow: hidden; display: flex; }

  .log-content { flex: 1; overflow-y: auto; padding: 8px; font-family: var(--font-editor); font-size: 11px; }
  .log-entry { padding: 2px 6px; color: var(--text-secondary); margin-bottom: 1px; white-space: pre-wrap; word-break: break-all; }
  .log-entry.error { color: var(--error); }
  .log-entry.success { color: var(--success); }

  .welcome-state { flex: 1; display: flex; align-items: center; justify-content: center; overflow-y: auto; padding: 32px 20px; }
  .welcome-content { text-align: center; max-width: 560px; }
  .welcome-icon { margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: var(--accent); }
  .welcome-title { font-size: 20px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
  .welcome-desc { color: var(--text-secondary); font-size: 13px; margin-bottom: 24px; }
  .welcome-actions { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
  .welcome-btn { display: flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 13px; font-weight: 500; }
  .welcome-btn.primary { background: var(--accent); color: #111; }
  .welcome-btn.primary:hover { background: var(--accent-hover); }
  .welcome-btn.secondary { background: var(--bg-surface); color: var(--text-secondary); border: 1px solid var(--border); }
  .welcome-btn.secondary:hover { background: var(--bg-hover); color: var(--text-primary); }

  .clone-form { width: 100%; max-width: 380px; display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .clone-field { display: flex; flex-direction: column; gap: 3px; }
  .clone-field label { font-size: 11px; font-weight: 500; color: var(--text-secondary); font-family: var(--font-editor); }
  .clone-input { width: 100%; padding: 7px 10px; font-size: 12.5px; font-family: var(--font-editor); background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); outline: none; }
  .clone-input:focus { border-color: var(--accent); }
  .clone-actions { display: flex; gap: 6px; margin-top: 4px; }
  .clone-actions .welcome-btn { flex: 1; justify-content: center; }
  .clone-hint { font-size: 10.5px; color: var(--text-muted); line-height: 1.5; text-align: center; margin-top: 4px; }
  .save-pdf { display: flex; align-items: center; gap: 2px; }

  .error-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    margin-left: 3px;
    font-size: 9px;
    font-weight: 700;
    font-family: var(--font-editor);
    background: var(--warning);
    color: #000;
  }
  .error-badge.has-errors {
    background: var(--error);
    color: white;
  }

  .errors-content { flex: 1; overflow-y: auto; padding: 6px; }
  .error-item {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 6px 8px;
    margin-bottom: 2px;
    font-size: 11.5px;
    font-family: var(--font-editor);
    line-height: 1.5;
  }
  .error-item.is-error { background: rgba(224, 108, 117, 0.06); }
  .error-item.is-warning { background: rgba(229, 192, 123, 0.06); }
  .error-type-badge {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
  }
  .err-badge { background: var(--error); color: white; }
  .warn-badge { background: var(--warning); color: #000; }
  .error-msg { flex: 1; color: var(--text-primary); word-break: break-word; }
  .error-line {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-muted);
    padding: 0 4px;
    background: var(--bg-hover);
  }
  .preview-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--text-muted); font-size: 12px; }

  @media (max-width: 600px) { .logo-text { display: none; } }

  .action-btn.git-active { color: var(--accent); }
  .action-btn.git-active:hover { color: var(--accent); }
  .git-change-badge {
    font-size: 9px;
    font-weight: 700;
    font-family: var(--font-editor);
    background: var(--accent);
    color: #111;
    padding: 0 4px;
    min-width: 14px;
    text-align: center;
    line-height: 14px;
    flex-shrink: 0;
  }

  .action-btn.collab-active { color: var(--success); }
  .action-btn.collab-active:hover { color: var(--success); }
  .collab-live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--success);
    animation: pulse 1.5s infinite;
    flex-shrink: 0;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  :global(.spin) { animation: spin 1s linear infinite; transform-origin: center; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
