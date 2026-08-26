// turns a pdftex log into something the errors and warnings tabs can show,
// and a cleaned copy for the log tab without the file open/close noise

export interface LogEntry {
  type: 'error' | 'warning';
  message: string;
  line?: number;
  file?: string;
}

export interface ParsedLog {
  errors: LogEntry[];
  cleanedLines: string[];
}

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
  /^\s*$/
];

const SUPPRESSED_WARNINGS = [
  /shell escape.*disabled/i,
  /You have requested package/,
  /You have requested, on input line.*version/,
  /^(Underfull|Overfull)\s+\\[hv]box/,
  /pdfTeX warning:.*PDF inclusion: found PDF/,
  /ABD: EveryShipout/
];

function isSuppressedWarning(msg: string): boolean {
  return SUPPRESSED_WARNINGS.some(p => p.test(msg));
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

export function parseLog(rawLog: string): ParsedLog {
  const errors: LogEntry[] = [];
  const lines = rawLog.split('\n');
  const cleanedLines: string[] = [];

  // pdftex prints "(<path>" when it opens a file and ")" when it closes it
  // again. following that gives every error the file it happened in, which
  // is the difference between "line 39" and "line 39 of hyperref.sty". the
  // log wraps long lines, so this stays a best effort
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
  function currentFile(): string | undefined {
    const path = openFiles[openFiles.length - 1];
    return path?.replace(/^(\.\/|\/work\/|\/tex\/)/, '');
  }
  let afterContext = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('! ')) {
      const msg = trimmed.slice(2);
      let lineNum: number | undefined;
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const m = lines[j].match(/^l\.(\d+)/);
        if (m) { lineNum = parseInt(m[1], 10); break; }
      }
      errors.push({ type: 'error', message: msg, line: lineNum, file: currentFile() });
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
        errors.push({ type: 'warning', message: msg.replace(/\s+$/, ''), line: lineNum, file: currentFile() });
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

    // the "l.39 ..." context after an error quotes source, which can
    // contain parentheses of its own, so it is left out of the tracking
    const isContext = /^l\.\d+/.test(trimmed);
    if (!isContext && !afterContext) trackOpenFiles(line);
    afterContext = isContext;

    if (NOISE.some(p => p.test(trimmed))) continue;
    if (/^[\s()]*$/.test(trimmed)) continue;
    if (/^[\s()]*(\([^)]*\)[\s)]*)+[\s)]*$/.test(trimmed)) continue;

    cleanedLines.push(line);
  }

  return { errors, cleanedLines };
}
