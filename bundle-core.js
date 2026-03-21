import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const cacheDir = 'static/texlive/cache';

function readManifest(path) {
  return readFileSync(path, 'utf-8').split('\n').map(l => l.trim()).filter(Boolean);
}

function bundleFiles(textNames, binNames) {
  const bundle = { text: {}, binary: {} };

  for (const name of textNames) {
    try {
      bundle.text[name] = readFileSync(join(cacheDir, name), 'utf-8');
    } catch {
      console.warn(`  missing: ${name}`);
    }
  }

  for (const name of binNames) {
    try {
      const buf = readFileSync(join(cacheDir, name));
      bundle.binary[name] = Buffer.from(buf).toString('base64');
    } catch {
      console.warn(`  missing: ${name}`);
    }
  }

  return bundle;
}

function writeBundle(path, bundle, label) {
  writeFileSync(path, JSON.stringify(bundle));
  const textCount = Object.keys(bundle.text).length;
  const binCount = Object.keys(bundle.binary).length;
  const size = (readFileSync(path).length / 1024 / 1024).toFixed(2);
  console.log(`${label}: ${textCount} text + ${binCount} binary (${size} MB)`);
}

// --- core bundle: essential packages for fast first compile ---

const coreText = new Set(readManifest('static/texlive/core-manifest-text.txt'));
const coreBin = new Set(readManifest('static/texlive/core-manifest-binary.txt'));

const coreBundle = bundleFiles([...coreText], [...coreBin]);
writeBundle('static/texlive/core-bundle.json', coreBundle, 'core');

// --- rest bundle: everything else in the cache ---

const allText = readManifest('static/texlive/cache-manifest-text.txt');
const allBin = readManifest('static/texlive/cache-manifest-binary.txt');

const restText = allText.filter(f => !coreText.has(f));
const restBin = allBin.filter(f => !coreBin.has(f));

const restBundle = bundleFiles(restText, restBin);
writeBundle('static/texlive/rest-bundle.json', restBundle, 'rest');
