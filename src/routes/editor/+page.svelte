<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import { sidebarOpen, previewOpen, snippetPickerOpen, commandPaletteOpen, cloneDialogOpen, compileStatus, compileLog, compileRawLog, compileProblems, previewTab, addToast } from '$lib/stores/app';
  import { files, activeFile, activeFileId, updateFileContent, markFileSaved, projectHandle, entryPoint, openFileTab, closeFileTab, setActiveTab } from '$lib/project/store';
  import { readFileFromHandle } from '$lib/fs/local-fs';
  import { handleOpenFile, handleSaveFile, handleSaveFileAs, handleDroppedFiles, handleOpenDirectory, handleNewProject, cloneProject, reopenEntryPointPicker, refreshProjectTree, supportsFileSystemAccess, findProjectFile, handleOpenFileFromTree } from '$lib/project/manager';
  import { insertAtCursor, createEditor, replaceEditorContent, gotoLine } from '$lib/editor/setup';
  import { tick } from 'svelte';
  import { locateByNeedle, type Problem } from '$lib/compiler/log';
  import type { EditorView } from '@codemirror/view';
  import type { Snippet as SnippetDef } from '$lib/snippets/index';
  import { compileLaTeX, warmup } from '$lib/compiler/latex-engine';
  import { injectImagePlaceholders, findMissingIncludes, buildIncludeMap } from '$lib/compiler/scan';
  import { readProjectFiles } from '$lib/fs/read-project';
  import { parseLog, capLogLines } from '$lib/compiler/log';
  import welcomeTex from '$lib/templates/welcome.tex?raw';
  import { yCollab } from 'y-codemirror.next';
  import { collabActive, collabPanelOpen, collabPeers, collabConnected } from '$lib/collab/store';
  import { createRoom, joinRoom, leaveRoom, getYTextWithUndo, getAwareness, setCurrentFile, getSharedFileList, getSharedEntryPoint, isHost, requestCompile, setCompileStatus, setCompileResult, observeCompileState, readCompileState, collectFilesFromYjs } from '$lib/collab/provider';
  import { collabRoom } from '$lib/collab/store';
  import { gitPanelOpen, gitEnabled, gitChangeCount, gitAuthToken, gitAuthUsername, gitProgress } from '$lib/git/store';
  import { describeGitError, troubleText } from '$lib/git/errors';
  import {
    openRepo as gitOpenRepo, initRepo as gitInitRepo, refreshGitState, notifyFilesChanged,
    stageAll as gitStageAll, commit as gitCommit, hasAuthor as gitHasAuthor
  } from '$lib/git/engine';

  import Logo from '$lib/ui/Logo.svelte';
  import TabBar from '$lib/ui/TabBar.svelte';
  import FileTree from '$lib/ui/FileTree.svelte';
  import StatusBar from '$lib/ui/StatusBar.svelte';
  import Resizer from '$lib/ui/Resizer.svelte';
  import CommandPalette from '$lib/ui/CommandPalette.svelte';
  import SnippetPicker from '$lib/ui/SnippetPicker.svelte';
  import EntryPointPicker from '$lib/ui/EntryPointPicker.svelte';
  import PdfViewer from '$lib/ui/PdfViewer.svelte';
  import ProblemsPanel from '$lib/ui/ProblemsPanel.svelte';
  import LogPanel from '$lib/ui/LogPanel.svelte';
  import CollabPanel from '$lib/ui/CollabPanel.svelte';
  import GitPanel from '$lib/ui/GitPanel.svelte';
  import DrawioEditor from '$lib/ui/DrawioEditor.svelte';

  let editorView: EditorView | null = null;
  let pdfData: Uint8Array | undefined = undefined;
  let pdfViewer: PdfViewer;
  let compiling = false;
  let compileStuckTimer = 0;
  let pdfPageCount = 1;
  let drawioEditor: DrawioEditor;

  function isDrawioFile(name: string): boolean {
    return name.toLowerCase().endsWith('.drawio');
  }

  $: activeIsDrawio = $activeFile ? isDrawioFile($activeFile.name) : false;

  async function handleDrawioSave(xml: string) {
    if (!$activeFile) return;
    updateFileContent($activeFile.id, xml);
    await handleSaveFile();
  }

  async function handleDrawioExport(data: string, format: string) {
    if (!$activeFile) { addToast('Export: no active file', 'error'); return; }
    const handle = get(projectHandle);
    if (!handle) { addToast('Export: no project handle', 'error'); return; }

    const baseName = $activeFile.name.replace(/\.drawio$/i, '');
    const ext = format === 'svg' ? '.svg' : '.png';
    const exportName = baseName + ext;

    try {
      const parts = $activeFile.path.split('/');
      parts.pop();
      let dirHandle: FileSystemDirectoryHandle = handle;
      for (const part of parts) {
        if (part) dirHandle = await dirHandle.getDirectoryHandle(part);
      }

      const fileHandle = await dirHandle.getFileHandle(exportName, { create: true });
      const writable = await fileHandle.createWritable();

      if (format === 'png') {
        const raw = data;
        const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        await writable.write(bytes);
      } else {
        await writable.write(data);
      }
      await writable.close();
      notifyFilesChanged();
      addToast(`Exported ${exportName}`, 'success', 1500);
    } catch (err: any) {
      addToast(`Export failed: ${err.message}`, 'error');
    }
  }

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
  const fileScrollPositions = new Map<string, number>();

  let cloneUrl = '';
  let cloneName = '';
  let cloning = false;
  const hasFolderAccess = browser && supportsFileSystemAccess();

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
            dark: true,
            onUpdate: handleEditorUpdate,
            collab: yCollab(data.ytext, awareness, { undoManager: data.undoManager })
          });
          setCurrentFile(file.path);
        }
      } else {
        editorView = createEditor({
          doc: file.content,
          parent: editorContainer,
          dark: true,
          onUpdate: handleEditorUpdate
        });
      }
    } catch (err) {
      console.error('editor build:', err);
    }

    restoreScrollPosition(file.id);

    lastActiveFileId = file.id;
  }

  function restoreScrollPosition(fileId: string) {
    if (!editorView) return;
    const saved = fileScrollPositions.get(fileId);
    if (saved !== undefined) {
      editorView.scrollDOM.scrollTop = saved;
    }
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

  // drop scroll positions of files that are no longer open
  $: {
    const openIds = new Set($files.map((f) => f.id));
    for (const id of fileScrollPositions.keys()) {
      if (!openIds.has(id)) fileScrollPositions.delete(id);
    }
  }

  // rebuild editor when active file changes (skip drawio files)
  $: if ($activeFile && $activeFile.id !== lastActiveFileId && editorContainer && !isDrawioFile($activeFile.name)) {
    if (editorView && lastActiveFileId) {
      fileScrollPositions.set(lastActiveFileId, editorView.scrollDOM.scrollTop);
    }

    if (get(collabActive)) {
      buildEditor();
    } else if (editorView) {
      lastActiveFileId = $activeFile.id;
      replaceEditorContent(editorView, $activeFile.content);
      restoreScrollPosition($activeFile.id);
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
      await readProjectFiles(handle, projectFiles, binaryFiles);
    }

    // override with open tab contents (may have unsaved edits), skip non-tex files
    for (const tab of get(files)) {
      if (tab.content && !tab.name.toLowerCase().endsWith('.drawio')) {
        projectFiles.set(tab.path, tab.content);
      }
    }

    const af = get(activeFile);
    if (projectFiles.size === 0 && af) {
      projectFiles.set(af.path || af.name, af.content);
    }

    return { projectFiles, binaryFiles };
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
            await readProjectFiles(handle, new Map(), binaryFiles);
          } catch {}
        }
      } else {
        const collected = await collectProjectFiles();
        projectFiles = collected.projectFiles;
        binaryFiles = collected.binaryFiles;
      }

      const mainFile = get(entryPoint) || af.path || af.name;

      const includeMap = buildIncludeMap(projectFiles, mainFile);
      includeOrder = includeMap.order;
      totalDocLines = includeMap.totalLines;

      // included files that aren't part of the project would silently drop
      // content (or worse, resolve against texlive), so warn upfront
      const missingIncludes = findMissingIncludes(projectFiles, mainFile);
      if (missingIncludes.length > 0) {
        const hint = get(projectHandle) ? '' : ' Open the project folder so all files can be compiled.';
        addToast(`Referenced but not found: ${missingIncludes.join(', ')}.${hint}`, 'warning', 8000);
      }

      // missing images get a gray placeholder so the compile still succeeds
      const missingImages = injectImagePlaceholders(projectFiles, binaryFiles);
      if (missingImages.length > 0) {
        addToast(`Missing images (compiled with placeholders): ${missingImages.join(', ')}`, 'warning', 8000);
      }

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
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('compilation timed out after 180s')), 180_000))
      ]);

      const { problems, cleanedLines } = parseLog(result.log || '');
      // tex gives no line for a missing package or a runaway argument, the
      // sources usually do
      locateByNeedle(problems, projectFiles);
      for (const p of problems) if (!p.file) { p.file = mainFile; p.inPackage = false; }
      compileProblems.set(problems);
      compileRawLog.set(result.log || '');

      if (result.status === 0 && result.pdf) {
        const pageMatch = result.log?.match(/\((\d+)\s+pages?,/);
        if (pageMatch) {
          pdfPageCount = parseInt(pageMatch[1], 10);
          pdfViewer?.setPageCount(pdfPageCount);
        }

        pdfData = new Uint8Array(result.pdf);
        compileStatus.set('success');
        compileLog.set([`[${ts()}] compilation successful (${pdfPageCount} pages)`, ...capLogLines(cleanedLines)]);

        if (problems.some(p => p.severity === 'error')) {
          previewTab.set('problems');
        }

        if (isCollabMode) {
          setCompileResult({ status: 'success', pdf: pdfData, log: cleanedLines, errors: problems, pageCount: pdfPageCount });
        }
      } else {
        compileStatus.set('error');
        compileLog.set([`[${ts()}] compilation failed (status ${result.status})`, ...capLogLines(cleanedLines)]);
        previewTab.set('problems');

        if (isCollabMode) {
          setCompileResult({ status: 'error', pdf: null, log: cleanedLines, errors: problems, pageCount: pdfPageCount });
        }
      }
    } catch (err: any) {
      compileStatus.set('error');
      compileLog.update(log => [...log, `[error] ${err.message || String(err)}`]);

      if (isCollabMode) {
        setCompileResult({ status: 'error', pdf: null, log: [`[error] ${err.message || String(err)}`], errors: [{ severity: 'error', title: err.message || String(err), message: err.message || String(err), inPackage: false, excerpt: [], count: 1 }], pageCount: 0 });
      }
    } finally {
      compiling = false;
      compileStuckTimer = 0;
    }
  }

  function compilePreview() { doCompile(); }

  function ts() { return new Date().toLocaleTimeString(); }

  async function saveAndCompile() {
    await handleSaveFile();
    doCompile();
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

  let resizing = false;

  function handleResizeStart() { resizing = true; }
  function handleResizeEnd() { resizing = false; }

  function handleResizeDelta(delta: number) {
    const cw = windowWidth - ($sidebarOpen ? 260 : 0);
    editorWidth = Math.max(25, Math.min(75, editorWidth + (delta / cw) * 100));
  }

  // a problem points at a file and a line, the editor goes there, opening
  // the file from the project when it isn't open yet
  async function jumpToProblem(p: Problem) {
    if (!p.file || !p.line || p.inPackage) return;
    const matches = (t: { path: string; name: string }) => t.path === p.file || t.name === p.file || t.path.endsWith('/' + p.file);
    let tab = get(files).find(matches);
    if (!tab) {
      const entry = findProjectFile(p.file);
      if (entry?.handle) {
        await handleOpenFileFromTree(entry.handle, entry.path);
        tab = get(files).find(matches);
      }
    }
    if (!tab) { addToast(`${p.file} isn't open, and it isn't in the project folder either`, 'info', 4000); return; }
    if (get(activeFileId) !== tab.id) setActiveTab(tab.id);
    await tick();
    if (editorView) gotoLine(editorView, p.line);
  }

  $: errorCount = $compileProblems.filter(p => p.severity === 'error').length;
  $: warningCount = $compileProblems.filter(p => p.severity === 'warning').length;

  function logFileName(): string {
    const ep = get(entryPoint);
    return (ep ? ep.replace(/^.*[\\/]/, '').replace(/\.tex$/, '') : 'document') + '.log';
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
    { id: 'clone', label: 'Clone Repository', shortcut: '', action: handleShowCloneForm, category: 'file' },
    { id: 'open', label: 'Open File', shortcut: 'Ctrl+O', action: handleOpenFile, category: 'file' },
    { id: 'save', label: 'Save + Compile', shortcut: 'Ctrl+S', action: saveAndCompile, category: 'file' },
    { id: 'saveas', label: 'Save As...', shortcut: 'Ctrl+Shift+S', action: handleSaveFileAs, category: 'file' },
    { id: 'compile', label: 'Compile', shortcut: 'Ctrl+Enter', action: compilePreview, category: 'compile' },
    { id: 'sidebar', label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: () => sidebarOpen.update(v => !v), category: 'view' },
    { id: 'togglepreview', label: 'Toggle Preview', shortcut: 'Ctrl+P', action: () => previewOpen.update(v => !v), category: 'view' },
    { id: 'snippet', label: 'Insert Snippet', shortcut: 'Ctrl+/', action: () => snippetPickerOpen.set(true), category: 'edit' },
    { id: 'preview', label: 'Show Preview', shortcut: '', action: () => previewTab.set('preview'), category: 'view' },
    { id: 'log', label: 'Show Log', shortcut: '', action: () => previewTab.set('log'), category: 'view' },
    { id: 'git', label: 'Toggle Git Panel', shortcut: 'Ctrl+G', action: toggleGitPanel, category: 'view' },
  ];

  // git works on the project folder, single files have nothing to track
  function toggleGitPanel() {
    if (get(projectHandle)) gitPanelOpen.update(v => !v);
    else addToast('Git needs a project folder. Open one, or create a new project, and the git button wakes up.', 'info', 5000);
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === 'k') { e.preventDefault(); commandPaletteOpen.update(v => !v); }
    else if (mod && e.key === 's' && !e.shiftKey) { e.preventDefault(); saveAndCompile(); }
    else if (mod && e.key === 's' && e.shiftKey) { e.preventDefault(); handleSaveFileAs(); }
    else if (mod && e.key === 'o') { e.preventDefault(); handleOpenFile(); }
    else if (mod && e.key === 'Enter') { e.preventDefault(); compilePreview(); }
    else if (mod && e.key === 'b') { e.preventDefault(); sidebarOpen.update(v => !v); }
    else if (mod && e.key === '/') { e.preventDefault(); snippetPickerOpen.update(v => !v); }
    else if (mod && e.key === 'g') { e.preventDefault(); toggleGitPanel(); }
    else if (mod && e.key === 'p') { e.preventDefault(); previewOpen.update(v => !v); }
    else if (e.key === 'Escape') { commandPaletteOpen.set(false); snippetPickerOpen.set(false); if (!cloning) cloneDialogOpen.set(false); }
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

  // a first commit right away when we know who to sign it with, otherwise
  // the files wait in the changes tab
  async function handleGitInit(options: { gitignore: boolean }) {
    await gitInitRepo(options);
    await refreshProjectTree();
    if (gitHasAuthor()) {
      await gitStageAll();
      await gitCommit('initial commit');
    }
    await refreshGitState();
  }

  // checkouts, pulls and merges write to the folder, so the tree and the
  // open tabs are read again. tabs with unsaved edits keep them
  async function handleGitBranchSwitch() {
    await refreshProjectTree();
    const kept: string[] = [];
    for (const tab of get(files)) {
      if (!tab.handle) continue;
      if (tab.dirty) { kept.push(tab.name); continue; }
      try {
        const content = await readFileFromHandle(tab.handle);
        if (content !== tab.content) {
          markFileSaved(tab.id, content);
          if (tab.id === get(activeFileId) && editorView) replaceEditorContent(editorView, content);
        }
      } catch {
        // the file does not exist on this branch
        closeFileTab(tab.id);
      }
    }
    if (kept.length > 0) {
      addToast(`Kept your unsaved changes in ${kept.join(', ')}. Save or discard them to see the checked out version.`, 'warning', 8000);
    }
  }

  function handleShowCloneForm() {
    cloneDialogOpen.set(true);
    cloneUrl = '';
    cloneName = '';
  }

  function handleCancelClone() {
    if (cloning) return;
    cloneDialogOpen.set(false);
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
      cloneDialogOpen.set(false);
      cloneUrl = '';
      cloneName = '';
      buildEditor();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        addToast(troubleText(describeGitError(err, 'Clone')), 'error', 8000);
      }
    } finally {
      cloning = false;
    }
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
              compileProblems.set(errors);
            } else {
              compileStatus.set('error');
              compileLog.set([`[${ts()}] compilation failed`, ...log]);
              compileProblems.set(errors);
              previewTab.set('problems');
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

  // a folder that already has a .git directory is picked up as is
  let lastGitProjectHandle: FileSystemDirectoryHandle | null = null;
  $: if (browser && $projectHandle && $projectHandle !== lastGitProjectHandle) {
    lastGitProjectHandle = $projectHandle;
    gitOpenRepo($projectHandle).catch((err) => console.error('git open:', err));
  }

  // an empty editor is a poor first impression, so a small document is opened
  // and compiled right away. it makes way for whatever gets opened next
  // unless it was edited
  let welcomeId: string | null = null;

  $: if (welcomeId && ($files.length > 1 || $projectHandle)) {
    const welcome = $files.find(f => f.id === welcomeId);
    if (welcome && !welcome.dirty) closeFileTab(welcomeId);
    welcomeId = null;
  }

  onMount(() => {
    if (get(files).length === 0) {
      welcomeId = openFileTab('welcome.tex', welcomeTex, null);
    }

    warmup()
      .then(() => {
        if (welcomeId && get(activeFileId) === welcomeId && get(compileStatus) === 'idle') doCompile();
      })
      .catch(() => {});

    function onBeforeUnload(e: BeforeUnloadEvent) {
      if ($files.some(f => f.dirty)) { e.preventDefault(); e.returnValue = ''; }
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    // a terminal or another editor may have touched the folder meanwhile
    function onFocus() { notifyFilesChanged(0); }
    window.addEventListener('focus', onFocus);

    return () => {
      unobserveCompile?.();
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('focus', onFocus);
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
        <button class="entry-point-label" title="Main file for compilation - click to change" on:click={reopenEntryPointPicker}>{$entryPoint}</button>
      {/if}
      <div class="separator"></div>
      <button class="action-btn" class:git-active={$gitEnabled} on:click={toggleGitPanel} title={$projectHandle ? ($gitEnabled ? 'Git (Ctrl+G)' : 'Git (Ctrl+G), this folder is not tracked yet') : 'Git needs a project folder, open one first'} aria-disabled={!$projectHandle}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M15 5.5a3.5 3.5 0 01-5.55 2.83L6.83 11H5v1.5H3.5V14H1v-2.5l5.17-5.17A3.5 3.5 0 1115 5.5zm-2 0a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z" fill="currentColor"/></svg>
        <span>Git</span>
        {#if $gitChangeCount > 0}<span class="git-change-badge">{$gitChangeCount}</span>{/if}
      </button>
      <button class="action-btn collab-soon" disabled title="Collaboration coming soon">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="6" cy="6" r="2.5" stroke="currentColor" stroke-width="1.2"/><path d="M1 13c0-2.2 2.2-4 5-4s5 1.8 5 4" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/><circle cx="11.5" cy="5" r="2" stroke="currentColor" stroke-width="1.1"/><path d="M14.5 12c0-1.7-1.3-3-3-3" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>
        <span>Collab</span>
        <span class="soon-badge">soon</span>
      </button>
      <div class="separator"></div>
      <a href="https://github.com/swimmingbrain/texbrain" target="_blank" rel="noopener" class="action-btn" title="GitHub">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
      </a>
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
      <div class="tool-sep"></div>
      <button class="tool-btn" class:active={$previewOpen} on:click={() => previewOpen.update(v => !v)} title="Toggle Preview (Ctrl+P)">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1.5" y="2.5" width="13" height="11" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 2.5v11" stroke="currentColor" stroke-width="1.2"/></svg>
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
        {#if $activeFile && activeIsDrawio}
          <div class="editor-pane" style={!isMobile && $previewOpen ? `width:${editorWidth}%` : ''}>
            <DrawioEditor
              bind:this={drawioEditor}
              content={$activeFile.content}
              fileName={$activeFile.name}
              fileId={$activeFile.id}
              onSave={handleDrawioSave}
              onExported={handleDrawioExport}
            />
          </div>
        {:else if $activeFile}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="editor-pane" style={!isMobile && $previewOpen ? `width:${editorWidth}%` : ''} on:dblclick={handleEditorDblClick}>
            <div class="cm-wrapper" use:initEditor></div>
          </div>
        {/if}

        {#if $activeFile && $previewOpen && !isMobile}
          <Resizer on:resize={(e) => handleResizeDelta(e.detail.delta)} on:resizestart={handleResizeStart} on:resizeend={handleResizeEnd} />
          <div class="preview-pane" style="width:{100 - editorWidth}%">
            <div class="preview-header">
              <button class="preview-tab" class:active={$previewTab === 'preview'} on:click={() => previewTab.set('preview')}>Preview</button>
              <button class="preview-tab" class:active={$previewTab === 'problems'} on:click={() => previewTab.set('problems')}>
                Problems
                {#if errorCount > 0}
                  <span class="error-badge has-errors">{errorCount}</span>
                {:else if warningCount > 0}
                  <span class="error-badge">{warningCount}</span>
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
            {:else if $previewTab === 'problems'}
              <ProblemsPanel problems={$compileProblems} compiled={$compileStatus !== 'idle'} mainFile={$entryPoint || $activeFile?.name || 'document'} onJump={jumpToProblem} />
            {:else}
              <LogPanel raw={$compileRawLog} cleaned={$compileLog} fileName={logFileName()} />
            {/if}
          </div>
        {/if}

        {#if resizing}
          <div class="resize-overlay"></div>
        {/if}

        {#if !$activeFile}
          <div class="welcome-state">
            <div class="welcome-content">
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
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <StatusBar {cursorLine} {cursorCol} {charCount} {wordCount} />

  {#if $cloneDialogOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="dialog-backdrop" on:click={handleCancelClone}>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dialog" on:click|stopPropagation>
        <h2 class="dialog-title">Clone Repository</h2>
        <p class="dialog-desc">Clone a git repository and open it as a project</p>
        <div class="clone-form">
          <div class="clone-field">
            <label for="clone-url">Repository URL</label>
            <input id="clone-url" type="text" bind:value={cloneUrl} on:input={onCloneUrlInput} placeholder="https://github.com/user/repo" class="clone-input" />
          </div>
          <div class="clone-field">
            <label for="clone-name">Project Name</label>
            <input id="clone-name" type="text" bind:value={cloneName} placeholder="my-project" class="clone-input" />
          </div>
          <details class="clone-private">
            <summary>Private repository? Add a token</summary>
            <p class="clone-hint left">
              GitHub: Settings, Developer settings, Fine grained tokens, Generate new token. Pick the repository and give it
              Contents: read and write. Copy the token, it only shows once.
              <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Open the token page &#8599;</a>
            </p>
            <div class="clone-field">
              <label for="clone-token">Token</label>
              <input id="clone-token" type="password" bind:value={$gitAuthToken} placeholder="github_pat_..." class="clone-input" autocomplete="off" />
            </div>
            <div class="clone-field">
              <label for="clone-username">Username (GitLab, Bitbucket, ...)</label>
              <input id="clone-username" type="text" bind:value={$gitAuthUsername} placeholder="not needed for GitHub" class="clone-input" autocomplete="off" />
            </div>
            <p class="clone-hint left">Stored in this browser only, never on a server.</p>
          </details>
          <div class="clone-actions">
            <button class="welcome-btn primary" on:click={handleClone} disabled={cloning || !cloneUrl.trim() || !cloneName.trim()}>
              {#if cloning}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3" stroke-dasharray="8 4" class="spin"/></svg>
                {$gitProgress && $gitProgress.total > 0 ? `${$gitProgress.phase} ${Math.round(($gitProgress.loaded / $gitProgress.total) * 100)}%` : 'Cloning...'}
              {:else}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 12V3M4 7l4-4 4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {hasFolderAccess ? 'Choose Location & Clone' : 'Clone'}
              {/if}
            </button>
            <button class="welcome-btn secondary" on:click={handleCancelClone} disabled={cloning}>Cancel</button>
          </div>
          <p class="clone-hint">{hasFolderAccess ? 'You\'ll pick a folder where the project will be saved.' : 'The project is stored inside your browser.'} The proxy can be changed in the git settings afterwards.</p>
        </div>
      </div>
    </div>
  {/if}

  <CommandPalette {commands} />
  <SnippetPicker onInsert={handleSnippetInsert} />
  <EntryPointPicker />
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
  .action-btn { display: flex; align-items: center; gap: 5px; padding: 5px 10px; font-size: 11.5px; font-weight: 500; color: var(--text-secondary); }
  .action-btn:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-primary); }
  .action-btn:disabled { opacity: 0.35; cursor: default; }
  .action-btn.accent { background: var(--accent); color: #111; }
  .action-btn.accent:hover:not(:disabled) { background: var(--accent-hover); color: #111; }
  .action-btn span { display: none; }
  @media (min-width: 768px) { .action-btn span { display: inline; } }
  .entry-point-label { font-size: 10px; color: var(--text-muted); font-family: var(--font-editor); padding: 1px 5px; background: var(--bg-hover); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .entry-point-label:hover { color: var(--text-primary); }
  .separator { width: 1px; height: 16px; background: var(--border); margin: 0 3px; }

  .toolbar { height: var(--toolbar-h); background: var(--bg-surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 10px; flex-shrink: 0; gap: 6px; }
  .toolbar-group { display: flex; align-items: center; gap: 1px; }
  .tool-btn { display: flex; align-items: center; gap: 3px; padding: 4px 7px; color: var(--text-secondary); font-size: 11.5px; }
  .tool-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .tool-btn.active { background: var(--accent-dim); color: var(--accent); }
  .tool-sep { width: 1px; height: 14px; background: var(--border); margin: 0 3px; }

  .main-area { flex: 1; display: flex; overflow: hidden; min-height: 0; }
  .sidebar { width: var(--sidebar-w); background: var(--bg-surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; overflow-y: auto; flex-shrink: 0; }
  .workspace { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  .editor-area { flex: 1; display: flex; overflow: hidden; min-height: 0; position: relative; }
  .editor-pane { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
  .resize-overlay { position: absolute; inset: 0; z-index: 10; cursor: col-resize; }
  .cm-wrapper { flex: 1; overflow: hidden; }
  .cm-wrapper :global(.cm-editor) { height: 100%; }

  .preview-pane { display: flex; flex-direction: column; min-width: 280px; overflow: hidden; background: var(--bg-elevated); }
  .preview-header { display: flex; align-items: center; height: 32px; border-bottom: 1px solid var(--border); padding: 0 3px; flex-shrink: 0; }
  .preview-tab { padding: 5px 12px; font-size: 11px; font-weight: 500; color: var(--text-muted); }
  .preview-tab:hover { color: var(--text-secondary); }
  .preview-tab.active { color: var(--text-primary); background: var(--bg-hover); }
  .preview-content { flex: 1; overflow: hidden; display: flex; }


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

  .dialog-backdrop { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, 0.5); }
  .dialog { width: 420px; max-width: 100%; padding: 20px; background: var(--bg-surface); border: 1px solid var(--border); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); }
  .dialog-title { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
  .dialog-desc { font-size: 12px; color: var(--text-secondary); margin-bottom: 16px; }
  .clone-form { width: 100%; display: flex; flex-direction: column; gap: 10px; text-align: left; }
  .clone-field { display: flex; flex-direction: column; gap: 3px; }
  .clone-field label { font-size: 11px; font-weight: 500; color: var(--text-secondary); font-family: var(--font-editor); }
  .clone-input { width: 100%; padding: 7px 10px; font-size: 12.5px; font-family: var(--font-editor); background: var(--bg-elevated); color: var(--text-primary); border: 1px solid var(--border); outline: none; }
  .clone-input:focus { border-color: var(--accent); }
  .clone-actions { display: flex; gap: 6px; margin-top: 4px; }
  .clone-actions .welcome-btn { flex: 1; justify-content: center; }
  .clone-hint { font-size: 10.5px; color: var(--text-muted); line-height: 1.5; text-align: center; margin-top: 4px; }
  .clone-hint.left { text-align: left; margin: 6px 0; }
  .clone-hint a { color: var(--accent); text-decoration: none; }
  .clone-hint a:hover { color: var(--accent-hover); }
  .clone-private summary { cursor: pointer; font-size: 11.5px; color: var(--accent); }
  .clone-private[open] summary { margin-bottom: 4px; }
  .clone-private .clone-field { margin-bottom: 8px; }
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


  @media (max-width: 600px) { .logo-text { display: none; } }

  .action-btn.git-active { color: var(--accent); }
  .action-btn.git-active:hover { color: var(--accent); }
  .action-btn[aria-disabled="true"] { opacity: 0.35; }
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

  .collab-soon { opacity: 0.5; cursor: default !important; }
  .collab-soon:hover { background: transparent !important; }
  .soon-badge {
    font-size: 8px;
    font-weight: 600;
    font-family: var(--font-editor);
    color: var(--text-muted);
    background: var(--bg-deep);
    border: 1px solid var(--border);
    padding: 0 3px;
    line-height: 13px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  :global(.spin) { animation: spin 1s linear infinite; transform-origin: center; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
