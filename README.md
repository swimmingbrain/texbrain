<p align="center">
  <img src="static/texbrain-logo-readme.svg" alt="texbrain logo" width="80" />
</p>

<h1 align="center">TeXbrain</h1>

<p align="center">
  A free, open-source LaTeX editor that runs entirely in your browser.<br/>
  No accounts. No installs. No servers. Just open a tab and write.
</p>

<p align="center">
  <a href="https://tex.swimmingbrain.dev"><strong>Try it now &rarr; tex.swimmingbrain.dev</strong></a>
</p>

I built this because I was tired of paying for features that should be free. I wrote my thesis last year in LaTeX and spent more time fighting tooling than actually writing. Online solutions lock git sync behind a paywall. Local setups break between machines. I wanted something that just works. Open a browser, write LaTeX, get a PDF.

So I built it.

## What it does

texbrain is a full LaTeX editor that compiles your `.tex` files to PDF directly in the browser. There is no backend. No server processing your files. Everything (the editor, the compiler, the git client) runs client-side.

You can open a local project folder, edit your files, see the PDF update, commit your changes, and push to GitHub. All from one tab.

## Features

- **LaTeX compilation in the browser.** Uses a WebAssembly port of pdfTeX (SwiftLaTeX). Your `.tex` files are compiled to PDF without ever leaving your machine. The first compilation takes up to a minute because the TexLive package cache needs to be loaded. After that, recompilations take 1 to 5 seconds depending on project complexity.
- **Live PDF preview.** Rendered with pdf.js. Multi-page, zoomable, with text selection.
- **Full git integration.** Clone repos, create branches, stage files, commit, push, pull, merge. All powered by isomorphic-git running in the browser. No CLI needed.
- **Local file system access.** Uses the File System Access API to read and write directly to your project folder on disk (Chrome/Edge).
- **Multi-file projects.** File tree, tabs, drag-and-drop. Supports `.tex`, `.bib`, `.sty`, `.cls` and more.
- **CodeMirror 6 editor.** Syntax highlighting, autocomplete for 70+ LaTeX commands, bracket matching, code folding, snippets, dark/light theme.
- **Command palette.** Quick access to actions via keyboard shortcut.
- **Snippet picker.** Math environments, document structures, Greek letters, common commands. Searchable and categorized.
- **Works offline.** Once loaded, the app works without an internet connection. Compilation is local, editing is local.
- **Project templates.** Start from scratch or pick a template (article, thesis, beamer, report, CV, letter, minimal).

## How it works under the hood

There's no magic and no backend.

**Editor.** Built on [CodeMirror 6](https://codemirror.net/) with a custom LaTeX grammar (Lezer parser), autocomplete provider, and theme system. The editor supports multiple open files via tabs and syncs content with both the local filesystem and the in-memory git working tree.

**Compiler.** LaTeX compilation uses [SwiftLaTeX](https://github.com/SwiftLaTeX/SwiftLaTeX)'s pdfTeX engine compiled to WebAssembly. The engine runs in a memory filesystem (MEMFS), where your project files are written before each compilation. A TexLive package cache is loaded from static assets on first compile. The preprocessor strips unsupported packages and converts certain environments so the WASM engine can handle them.

**Git.** All git operations use [isomorphic-git](https://isomorphic-git.org/), a pure JavaScript implementation of git. The repository lives in an in-memory filesystem ([LightningFS](https://github.com/isomorphic-git/lightning-fs)) backed by IndexedDB. Your project files are synced between the local filesystem and the git working tree. Remote operations (push/pull/clone) go through a CORS proxy since browsers can't speak the git protocol directly.

**PDF viewer.** Rendered with [pdf.js](https://mozilla.github.io/pdf.js/), Mozilla's PDF rendering library. Supports multi-page rendering with a text layer for selection and search.

**File system.** The app uses the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API) to read/write your actual files on disk. This requires a Chromium-based browser (Chrome, Edge, Arc, Brave). For other browsers, there's a fallback using the Origin Private File System (OPFS).

**Frontend.** [SvelteKit](https://kit.svelte.dev/) with the static adapter. The entire app is pre-built to static HTML/CSS/JS and deployed to GitHub Pages. No SSR, no API routes, no server. [Tailwind CSS](https://tailwindcss.com/) handles styling.

## Security and privacy

Everything runs in your browser. Your files never leave your machine unless you explicitly push to a remote.

- **No telemetry, no analytics, no tracking.**
- **No accounts, no cookies, no data collection.**
- Git authentication tokens are stored in your browser's localStorage. They never touch a server I control.
- LaTeX compilation happens in a WebAssembly sandbox. There are no shell commands being executed. No `pdflatex`, no `exec()`, no `spawn()`.
- Git operations use a JavaScript library, not CLI commands. No command injection is possible.
- The CORS proxy for git remotes is a known trade-off. By default it uses `cors.isomorphic-git.org` (the isomorphic-git project's public proxy). You can point it at your own if you prefer.
- LaTeX and TeX are free and open-source software. This project uses them. It doesn't redistribute or modify their source.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Svelte 5 + SvelteKit (static adapter) |
| Editor | CodeMirror 6 + custom LaTeX language support |
| Compiler | pdfTeX via WebAssembly (SwiftLaTeX) |
| Git | isomorphic-git + LightningFS |
| PDF | pdf.js |
| Styling | Tailwind CSS 4 |
| Language | TypeScript |
| Deployment | GitHub Pages |

## Running locally

```bash
git clone https://github.com/swimmingbrain/texbrain.git
cd texbrain
pnpm install
pnpm dev
```

Open `http://localhost:5173` in Chrome or Edge.

## Browser support

Full functionality requires the File System Access API, which is available in Chromium-based browsers (Chrome, Edge, Arc, Brave, Opera). Firefox and Safari can still use the editor with the virtual filesystem fallback, but won't be able to read/write directly to local folders.

## License

MIT

Built by [Braian Plaku](https://swimmingbrain.dev)
