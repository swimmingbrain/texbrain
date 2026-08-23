// static looks at the tex sources before a compile: which files are
// included, which of them are missing, which images need a stand in

import { placeholderImage } from './placeholder-image';

export interface IncludeMap {
  order: { path: string; lines: number }[];
  totalLines: number;
}

const IMAGE_EXTS = ['.png', '.pdf', '.jpg', '.jpeg', '.eps'];

// scan all tex files for \includegraphics targets no project file satisfies
// and inject a placeholder image so the compile behaves like overleaf:
// the pdf still builds, the missing image shows as a gray box
export function injectImagePlaceholders(projectFiles: Map<string, string>, binaryFiles: Map<string, ArrayBuffer>): string[] {
  const known = [...projectFiles.keys(), ...binaryFiles.keys()];
  const satisfied = (candidate: string) =>
    known.some(k => k === candidate || k.endsWith('/' + candidate));

  const missing: string[] = [];
  const re = /^[^%\n]*?\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/gm;
  for (const [path, content] of projectFiles) {
    if (!path.toLowerCase().endsWith('.tex')) continue;
    let m;
    while ((m = re.exec(content)) !== null) {
      const name = m[1].trim().replace(/^\.\//, '');
      if (!name || name.includes('\\')) continue; // built from a macro
      const hasExt = IMAGE_EXTS.some(e => name.toLowerCase().endsWith(e));
      const candidates = hasExt ? [name] : IMAGE_EXTS.map(e => name + e);
      if (candidates.some(satisfied)) continue;
      if (!missing.includes(name)) missing.push(name);
      // pdftex picks the decoder by extension, so the png placeholder can
      // only stand in for png and extension-less references
      const target = hasExt ? name : `${name}.png`;
      if (target.toLowerCase().endsWith('.png') && !binaryFiles.has(target)) {
        binaryFiles.set(target, placeholderImage());
      }
    }
  }
  return missing;
}

// \include/\input targets in the entry file that no project file satisfies
export function findMissingIncludes(projectFiles: Map<string, string>, entryPointPath: string): string[] {
  const epContent = projectFiles.get(entryPointPath);
  if (!epContent) return [];

  const missing: string[] = [];
  const re = /^[^%\n]*?\\(?:input|include)\{([^}]+)\}/gm;
  let m;
  while ((m = re.exec(epContent)) !== null) {
    let name = m[1].trim();
    if (name.includes('\\')) continue; // built from a macro, can't check statically
    if (!name.toLowerCase().endsWith('.tex')) name += '.tex';
    name = name.replace(/^\.\//, '');
    if (!projectFiles.has(name) && !missing.includes(name)) missing.push(name);
  }
  return missing;
}

// flattened include order of the document, used to map a cursor position
// in one of many files to a rough position in the pdf
export function buildIncludeMap(projectFiles: Map<string, string>, entryPointPath: string): IncludeMap {
  const epContent = projectFiles.get(entryPointPath);
  if (!epContent) return { order: [], totalLines: 0 };

  const docStart = epContent.indexOf('\\begin{document}');
  const contentPart = docStart >= 0 ? epContent.substring(docStart) : epContent;

  const order: { path: string; lines: number }[] = [];
  const visited = new Set<string>();

  function collectLeafFiles(filePath: string) {
    if (visited.has(filePath)) return;
    visited.add(filePath);

    const content = projectFiles.get(filePath);
    if (!content) { order.push({ path: filePath, lines: 100 }); return; }

    const re = /\\(?:input|include)\{([^}]+)\}/g;
    let m;
    let hasIncludes = false;
    while ((m = re.exec(content)) !== null) {
      hasIncludes = true;
      let name = m[1];
      if (!name.endsWith('.tex')) name += '.tex';
      collectLeafFiles(name);
    }

    if (!hasIncludes) {
      order.push({ path: filePath, lines: content.split('\n').length });
    }
  }

  const re = /\\(?:input|include)\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(contentPart)) !== null) {
    let name = m[1];
    if (!name.endsWith('.tex')) name += '.tex';
    collectLeafFiles(name);
  }

  return { order, totalLines: order.reduce((s, f) => s + f.lines, 0) };
}
