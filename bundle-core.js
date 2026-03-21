import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const cacheDir = 'static/texlive/cache';
const outFile = 'static/texlive/core-bundle.json';

function readManifest(path) {
  return readFileSync(path, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
}

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
