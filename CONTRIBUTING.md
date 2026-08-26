# Contributing

There is no formal process. Fork the repo, make your change, open a pull request. Small and focused beats big and sweeping, so if you plan something larger, open an issue first and we can talk it through before you spend time on it.

## Running locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173` in Chrome or Edge. Firefox and Safari work too, they just don't get direct folder access and keep projects inside the browser instead.

`pnpm build` produces the static site in `build/`, which is exactly what gets deployed to GitHub Pages.

## Where things live

- `src/lib/compiler` talks to the pdfTeX engine (SwiftLaTeX) and handles the bibliography fallback.
- `src/lib/editor` is the CodeMirror setup: the LaTeX grammar, autocomplete, keybindings and theme.
- `src/lib/fs` reads and writes files through the File System Access API, the origin private file system for browsers without it, and plain downloads as a last resort.
- `src/lib/git` wraps isomorphic-git and LightningFS.
- `src/lib/project` holds the open files, the project tree and everything the toolbar calls.
- `src/lib/ui` are the Svelte components, `src/routes/editor` is the editor page itself.
- `static/sw.js` is the service worker that resolves TeX Live files on demand: cache first, then the bundled subset, then the jsDelivr mirror, then the fallback server.
- `static/texlive/cache` is the bundled package subset. If you change anything in there, bump `BUNDLE_VERSION` in `static/sw.js` and `WARMED_VERSION` in `src/lib/compiler/offline-cache.ts`, otherwise users keep the old files in their cache.
- `static/swiftlatex` is the engine. It is a build artifact, not something to edit by hand.

## What helps most

- Documents that don't compile. An issue with the package name or a minimal example is the most useful thing you can send.
- Anything from the known limitations list in the README. Bibtex in WASM is the big one.
- Bugs you hit while using it. Fix them if you like, or just report them.

## Style

There is no linter and no formatter, so keep the style of the file you are in: two spaces, single quotes, semicolons, and lowercase comments that explain why rather than what.

Commit messages are short and lowercase with a type prefix, like `fix: reset the work directory after failed compiles` or `feat: set the main file from the file tree`. The types in use are `feat`, `fix`, `perf`, `docs` and `chore`.

## License

By contributing you agree that your work is released under the MIT license, like the rest of the project.
