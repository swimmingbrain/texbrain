import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const cacheDir = 'static/texlive/cache';
const outFile = 'static/texlive/core-bundle.json';
const pdftexDir = 'static/texlive/pdftex';

// kpathsea format codes used by the wasm engine
const FORMAT_MAP = {
  '.tfm': '6',
  '.pfb': '4',
  '.vf': '10',
  '.map': '33',
  '.enc': '34',
  '.sty': '3',
  '.cls': '3',
  '.fd': '3',
  '.def': '3',
  '.cfg': '3',
  '.clo': '3',
  '.tex': '3',
  '.ltx': '3',
  '.dfu': '3',
  '.ldf': '3',
  '.pfm': '4',
  '.lua': '3',
  '.code.tex': '3'
};

function readManifest(path) {
  return readFileSync(path, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
}

function formatForExt(name) {
  for (const [ext, fmt] of Object.entries(FORMAT_MAP)) {
    if (name.endsWith(ext)) return fmt;
  }
  return '3';
}

// --- core bundle ---

const textFiles = readManifest('static/texlive/core-manifest-text.txt');
const binFiles = readManifest('static/texlive/core-manifest-binary.txt');

const bundle = { text: {}, binary: {} };

for (const name of textFiles) {
  try {
    bundle.text[name] = readFileSync(join(cacheDir, name), 'utf-8');
  } catch {
    console.warn(`missing text file: ${name}`);
  }
}

for (const name of binFiles) {
  try {
    const buf = readFileSync(join(cacheDir, name));
    bundle.binary[name] = Buffer.from(buf).toString('base64');
  } catch {
    console.warn(`missing binary file: ${name}`);
  }
}

const textCount = Object.keys(bundle.text).length;
const binCount = Object.keys(bundle.binary).length;

writeFileSync(outFile, JSON.stringify(bundle));

const size = (readFileSync(outFile).length / 1024 / 1024).toFixed(2);
console.log(`bundled ${textCount} text + ${binCount} binary files (${size} MB)`);

// --- on-demand directory structure ---
// mirror cache files into pdftex/{format}/ so the wasm worker can fetch them

const allFiles = readdirSync(cacheDir);
let copied = 0;

for (const name of allFiles) {
  const src = join(cacheDir, name);
  if (!statSync(src).isFile()) continue;
  const fmt = formatForExt(name);
  const dir = join(pdftexDir, fmt);
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, join(dir, name));
  copied++;
}

console.log(`mirrored ${copied} files into pdftex/{format}/ for on-demand loading`);
