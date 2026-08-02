// turns a pdftex transcript into problems a person can act on, plus a
// cleaned copy of the log for reading. the raw transcript is kept elsewhere

import { explain, type Explanation } from './explain';

export type Severity = 'error' | 'warning' | 'info';

export interface Problem {
  severity: Severity;
  // plain words, the headline of the card
  title: string;
  // what tex actually said, prefixes stripped
  message: string;
  explain?: string;
  fix?: string;
  // as printed by tex, with ./ and /tex/ stripped, so main.tex or babel.sty
  file?: string;
  // true when the file came out of the tex live tree, not the project
  inPackage: boolean;
  line?: number;
  // something to search the sources for when tex gave no line
  needle?: string;
  // the source line where tex stopped reading, split at that spot
  context?: { before: string; after: string };
  // the raw log lines this came from
  excerpt: string[];
  count: number;
}

export interface ParsedLog {
  problems: Problem[];
  cleanedLines: string[];
}

// tex breaks its lines at exactly this many characters and continues on the
// next one, mid word if it has to
const WRAP = 79;

const NOISE = [
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
  /^No file .*\.(aux|toc|lof|lot|out|nav|snm|bbl)\.$/,
  /^I found no \\(citation|bibdata|bibstyle) command/,
  /^\(There (was|were) \d+ error messages?\)$/,
  /^\(see the transcript file for additional information\)$/
];

// lines tex prints for an interactive user, meaningless in batch mode
const HELP_LINES = [
  /^See the .* for explanation\.$/,
  /^Type  H <return>  for immediate help\.$/,
  /^ \.\.\.\s*$/,
  /^Type X to quit or <RETURN> to proceed,$/,
  /^or enter new name\. \(Default extension: \w+\)$/,
  /^Enter file name:\s*$/
];

const SUPPRESSED_WARNINGS = [
  /shell escape.*disabled/i,
  /You have requested package/,
  /You have requested, on input line.*version/,
  /pdfTeX warning:.*PDF inclusion: found PDF/,
  /ABD: EveryShipout/
];

const IMAGE_EXT = /\.(png|jpe?g|pdf|eps|gif|bmp|tiff?|svg)$/i;

function isHelpLine(line: string): boolean {
  return HELP_LINES.some(p => p.test(line));
}

function stripPrefix(path: string): string {
  return path.replace(/^(\.\/|\/work\/|\/tex\/)/, '');
}

// the log panel renders one element per line, huge logs freeze the ui
export function capLogLines(lines: string[], max = 800): string[] {
  if (lines.length <= max) return lines;
  const half = max / 2;
  return [
    ...lines.slice(0, half),
    `... ${lines.length - max} lines omitted ...`,
    ...lines.slice(-half)
  ];
}

// fills in lines for problems tex could not place, by searching the
// sources for what the problem is about (a package name, a label, ...)
export function locateByNeedle(problems: Problem[], files: Map<string, string>): void {
  for (const p of problems) {
    if (p.line !== undefined || !p.needle) continue;
    for (const [path, content] of files) {
      if (!path.toLowerCase().endsWith('.tex')) continue;
      const lines = content.split('\n');
      const idx = lines.findIndex(l => l.includes(p.needle!));
      if (idx >= 0) {
        p.file = path;
        p.inPackage = false;
        p.line = idx + 1;
        break;
      }
    }
  }
}

export function parseLog(rawLog: string): ParsedLog {
  const lines = rawLog.replace(/\r/g, '').split('\n');
  const cleanedLines: string[] = [];
  const problems: Problem[] = [];

  // pdftex prints "(<path>" when it opens a file and ")" when it closes it
  // again. following that gives every problem the file it happened in. long
  // lines wrap, so this stays a best effort
  const openFiles: string[] = [];
  function trackOpenFiles(text: string) {
    let skipped = 0;
    const re = /\(([^\s()]*)|\)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === ')') {
        if (skipped > 0) skipped--;
        else openFiles.pop();
      } else if (/^(\.{1,2}\/|\/)?[^\s()]*\.[a-z0-9]{1,5}$/i.test(m[1])) {
        openFiles.push(m[1]);
      } else {
        skipped++; // parenthesised prose, not a file
      }
    }
  }
  function currentFile(): { file?: string; inPackage: boolean } {
    const path = openFiles[openFiles.length - 1];
    if (!path) return { inPackage: false };
    return { file: stripPrefix(path), inPackage: path.startsWith('/tex/') };
  }

  // reads one logical line starting at i, gluing wrapped continuations back
  // together. returns the text and the index of the last physical line used
  function unwrap(i: number): { text: string; end: number } {
    let text = lines[i];
    let end = i;
    while (lines[end].length === WRAP && end + 1 < lines.length && lines[end + 1].length > 0) {
      end++;
      text += lines[end];
    }
    return { text, end };
  }

  // "(babel)        the rest of the message" continuation lines
  function continuation(i: number): { text: string; end: number } | null {
    const m = lines[i]?.match(/^\(([\w.-]+)\)\s{2,}(.*)$/);
    if (!m) return null;
    const u = unwrap(i);
    return { text: u.text.replace(/^\([\w.-]+\)\s{2,}/, ''), end: u.end };
  }

  function push(p: Omit<Problem, 'count'>) {
    const same = problems.find(q =>
      q.severity === p.severity && q.title === p.title && q.message === p.message &&
      q.file === p.file && q.line === p.line
    );
    if (same) { same.count++; return; }
    problems.push({ ...p, count: 1 });
  }

  function decorate(base: Omit<Problem, 'count' | 'title'>, ex: Explanation): Omit<Problem, 'count'> {
    return { ...base, title: ex.title, explain: ex.explain, fix: ex.fix, needle: ex.needle };
  }

  let sawRealError = false;
  let stopExcerpt: string[] | null = null;
  let stopLocation: { file?: string; inPackage: boolean; line?: number } = { inPackage: false };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ---- errors --------------------------------------------------------
    if (trimmed.startsWith('! ')) {
      const head = unwrap(i);
      let message = head.text.trim().slice(2).trim();
      let end = head.end;
      const excerpt: string[] = [];

      // "Runaway argument?" and the runaway text sit right above the error
      if (i >= 2 && lines[i - 2] === 'Runaway argument?') {
        excerpt.push(lines[i - 2], lines[i - 1]);
      } else if (i >= 1 && lines[i - 1] === 'Runaway argument?') {
        excerpt.push(lines[i - 1]);
      }
      for (let k = i; k <= end; k++) excerpt.push(lines[k]);

      // message lines that continue with a (package) prefix
      let j = end + 1;
      while (j < lines.length) {
        const c = continuation(j);
        if (!c) break;
        message += ' ' + c.text.trim();
        for (let k = j; k <= c.end; k++) excerpt.push(lines[k]);
        j = c.end + 1;
      }

      // the fatal summary is a consequence of the errors above, not a problem
      if (/^==> Fatal error occurred/.test(message)) {
        cleanedLines.push(line);
        i = end + 1;
        continue;
      }

      // where tex stopped reading: "l.12 before" and the rest on the next line
      let lineNum: number | undefined;
      let context: Problem['context'];
      let k = j;
      while (k < lines.length && k < j + 14 && !lines[k].trim().startsWith('! ')) {
        const lm = lines[k].match(/^l\.(\d+) ?(.*)$/);
        if (lm) {
          lineNum = parseInt(lm[1], 10);
          const before = lm[2];
          const after = (lines[k + 1] ?? '').replace(/^\s+/, '');
          context = { before, after };
          for (let x = j; x <= k + 1 && x < lines.length; x++) {
            if (!isHelpLine(lines[x]) && lines[x].trim() !== '') excerpt.push(lines[x]);
          }
          k = k + 1;
          break;
        }
        if (/^<\*> /.test(lines[k])) {
          for (let x = j; x <= k; x++) {
            if (!isHelpLine(lines[x]) && lines[x].trim() !== '') excerpt.push(lines[x]);
          }
          break;
        }
        k++;
      }
      const consumedTo = lineNum !== undefined ? k : end;

      const where = currentFile();
      if (/^Emergency stop\.?$/.test(message)) {
        // only worth a card when nothing else explains the stop
        stopExcerpt = excerpt;
        stopLocation = { ...where, line: lineNum };
      } else {
        sawRealError = true;
        const base = { severity: 'error' as const, message, file: where.file, inPackage: where.inPackage, line: lineNum, context, excerpt };
        push(decorate(base, explain('error', message, { before: context?.before, file: where.file, inPackage: where.inPackage })));
      }

      for (let x = i; x <= consumedTo && x < lines.length; x++) {
        if (!isHelpLine(lines[x]) && lines[x].trim() !== '') cleanedLines.push(lines[x]);
      }
      i = consumedTo + 1;
      continue;
    }

    // ---- warnings ------------------------------------------------------
    const warnHead = trimmed.match(/^(LaTeX Warning|LaTeX Font Warning|Package [\w.-]+ Warning|Class [\w.-]+ Warning):\s*(.*)$/);
    if (warnHead) {
      const head = unwrap(i);
      let message = head.text.trim().replace(/^[^:]+:\s*/, '');
      let end = head.end;
      const excerpt: string[] = [];
      for (let k = i; k <= end; k++) excerpt.push(lines[k]);
      let j = end + 1;
      while (j < lines.length) {
        const c = continuation(j);
        if (!c) break;
        message += ' ' + c.text.trim();
        for (let k = j; k <= c.end; k++) excerpt.push(lines[k]);
        j = c.end + 1;
      }
      message = message.replace(/\s+/g, ' ').trim();

      if (!SUPPRESSED_WARNINGS.some(p => p.test(message))) {
        const lm = message.match(/on input line (\d+)/);
        const where = currentFile();
        const ex = explain('warning', message, { file: where.file, inPackage: where.inPackage });
        push(decorate({
          severity: ex.severity ?? 'warning',
          message,
          file: where.file,
          inPackage: where.inPackage,
          line: lm ? parseInt(lm[1], 10) : undefined,
          excerpt
        }, ex));
      }
      for (let x = i; x < j; x++) cleanedLines.push(lines[x]);
      i = j;
      continue;
    }

    if (/pdfTeX warning/i.test(trimmed) && !/fontmap entry/.test(trimmed)) {
      const head = unwrap(i);
      const message = head.text.trim();
      if (!SUPPRESSED_WARNINGS.some(p => p.test(message))) {
        const where = currentFile();
        const ex = explain('warning', message, { file: where.file, inPackage: where.inPackage });
        push(decorate({ severity: ex.severity ?? 'warning', message, file: where.file, inPackage: where.inPackage, excerpt: [message] }, ex));
      }
      for (let x = i; x <= head.end; x++) cleanedLines.push(lines[x]);
      i = head.end + 1;
      continue;
    }

    // ---- boxes: layout notes, not mistakes ------------------------------
    const box = trimmed.match(/^(Overfull|Underfull) \\[hv]box .*(?:at lines (\d+)--(\d+)|detected at line (\d+)|while \\output is active)/);
    if (box) {
      const excerpt = [line];
      let j = i + 1;
      // the box contents follow until a blank line or a page marker
      while (j < lines.length && lines[j].trim() !== '' && !/^\[/.test(lines[j]) && !/^(Overfull|Underfull)/.test(lines[j]) && !lines[j].startsWith('! ') && !/Warning:/.test(lines[j])) {
        excerpt.push(lines[j]);
        j++;
      }
      const where = currentFile();
      const ex = explain('info', trimmed, { file: where.file, inPackage: where.inPackage });
      const at = box[2] ?? box[4];
      push(decorate({
        severity: 'info',
        message: trimmed,
        file: where.file,
        inPackage: where.inPackage,
        line: at ? parseInt(at, 10) : undefined,
        excerpt
      }, ex));
      for (let x = i; x < j; x++) cleanedLines.push(lines[x]);
      i = j;
      continue;
    }

    // the "l.39 ..." context after an error quotes source, which can
    // contain parentheses of its own, so it stays out of the tracking
    if (!/^l\.\d+/.test(trimmed) && !/^Runaway argument\?/.test(trimmed)) trackOpenFiles(line);

    if (NOISE.some(p => p.test(trimmed))) { i++; continue; }
    if (/^[\s()]*$/.test(trimmed)) { i++; continue; }
    if (/^[\s()]*(\([^)]*\)[\s)]*)+[\s)]*$/.test(trimmed)) { i++; continue; }

    cleanedLines.push(line);
    i++;
  }

  // an emergency stop only says something when no error explains it
  if (!sawRealError && stopExcerpt) {
    const base = { severity: 'error' as const, message: 'Emergency stop.', file: stopLocation.file, inPackage: stopLocation.inPackage, line: stopLocation.line, excerpt: stopExcerpt };
    push(decorate(base, explain('error', 'Emergency stop.', { file: stopLocation.file, inPackage: stopLocation.inPackage })));
  }

  // summaries that repeat what the individual problems already say
  const hasUndefinedRef = problems.some(p => /Reference `|Citation `/.test(p.message));
  const hasFontShape = problems.some(p => /Font shape `/.test(p.message));
  const notFoundErrors = new Set(problems.filter(p => p.severity === 'error').map(p => p.message.match(/File `([^']+)' not found/)?.[1]).filter(Boolean));
  const kept = problems.filter(p => {
    if (hasUndefinedRef && /There were undefined (references|citations)/.test(p.message)) return false;
    if (hasFontShape && /Some font shapes were not available/.test(p.message)) return false;
    if (p.severity === 'warning') {
      const f = p.message.match(/File `([^']+)' not found/)?.[1];
      if (f && notFoundErrors.has(f)) return false;
    }
    return true;
  });

  return { problems: kept, cleanedLines };
}

export function isImageFile(name: string): boolean {
  return IMAGE_EXT.test(name);
}
