// preprocess latex source before passing to latex.js
//
// latex.js only supports a small subset of latex. approach:
// - preamble: only keep commands latex.js understands
// - body: strip known-unsupported constructs, pass the rest through

export function preprocessForLatexJs(source: string): string {
  let s = source;

  // replace unsupported document classes with article
  s = s.replace(/\\documentclass(\[[^\]]*\])?\s*\{beamer\}/, '\\documentclass$1{article}');
  s = s.replace(/\\documentclass(\[[^\]]*\])?\s*\{letter\}/, '\\documentclass$1{article}');
  s = s.replace(/\\documentclass(\[[^\]]*\])?\s*\{scrartcl\}/, '\\documentclass$1{article}');
  s = s.replace(/\\documentclass(\[[^\]]*\])?\s*\{scrreprt\}/, '\\documentclass$1{report}');
  s = s.replace(/\\documentclass(\[[^\]]*\])?\s*\{scrbook\}/, '\\documentclass$1{book}');
  s = s.replace(/\\documentclass(\[[^\]]*\])?\s*\{memoir\}/, '\\documentclass$1{book}');

  const docBegin = s.indexOf('\\begin{document}');
  if (docBegin === -1) {
    return '\\documentclass{article}\n\\begin{document}\n' + s + '\n\\end{document}';
  }

  const preamble = s.slice(0, docBegin);
  const body = s.slice(docBegin);

  const cleanPreamble = cleanPreambleSection(preamble);
  const cleanBody = cleanBodySection(body);

  return cleanPreamble + '\n' + cleanBody;
}

function cleanPreambleSection(preamble: string): string {
  const lines = preamble.split('\n');
  const kept: string[] = [];

  const allowedPatterns = [
    /^\\documentclass/,
    /^\\title\{/,
    /^\\author\{/,
    /^\\date\{/,
    /^\s*$/,
  ];

  // track brace depth for multi-line \title, \author, \date
  let inAllowedBlock = false;
  let braceDepth = 0;

  for (const line of lines) {
    if (inAllowedBlock) {
      kept.push(line);
      braceDepth += countBraces(line);
      if (braceDepth <= 0) inAllowedBlock = false;
      continue;
    }

    const trimmed = line.trim();
    if (allowedPatterns.some(p => p.test(trimmed))) {
      kept.push(line);
      braceDepth = countBraces(line);
      if (braceDepth > 0) inAllowedBlock = true;
    }
  }

  return kept.join('\n');
}

function cleanBodySection(body: string): string {
  let s = body;

  // convert math environments to \[...\] which latex.js supports
  const mathEnvs = ['equation', 'equation\\*', 'align', 'align\\*', 'gather', 'gather\\*', 'multline', 'multline\\*', 'displaymath', 'eqnarray', 'eqnarray\\*'];
  for (const env of mathEnvs) {
    const re = new RegExp(`\\\\begin\\{${env}\\}([\\s\\S]*?)\\\\end\\{${env}\\}`, 'g');
    s = s.replace(re, (_, content) => {
      let math = content.trim();
      math = math.replace(/\\label\{[^}]*\}/g, '');
      math = math.replace(/&/g, ' ');
      const lines = math.split(/\\\\\s*/).map((l: string) => l.trim()).filter((l: string) => l);
      if (lines.length <= 1) {
        return `\\[${math}\\]`;
      }
      return lines.map((l: string) => `\\[${l}\\]`).join('\n');
    });
  }

  s = s.replace(/\\\(/g, '$');
  s = s.replace(/\\\)/g, '$');

  s = s.replace(/\\pagestyle\{[^}]*\}/g, '');
  s = s.replace(/\\thispagestyle\{[^}]*\}/g, '');
  s = s.replace(/\\pagenumbering\{[^}]*\}/g, '');

  s = s.replace(/\\setlength\{[^}]*\}\{[^}]*\}/g, '');
  s = s.replace(/\\addtolength\{[^}]*\}\{[^}]*\}/g, '');
  s = s.replace(/\\setcounter\{[^}]*\}\{[^}]*\}/g, '');

  s = s.replace(/\\listoffigures/g, '');
  s = s.replace(/\\listoftables/g, '');

  s = s.replace(/\\bibliographystyle\{[^}]*\}/g, '');
  s = s.replace(/\\bibliography\{[^}]*\}/g, '');
  s = s.replace(/\\printbibliography(\[[^\]]*\])?/g, '');

  s = s.replace(/\\includegraphics(\[[^\]]*\])?\{[^}]*\}/g, '[Image]');

  s = s.replace(/\\begin\{tikzpicture\}[\s\S]*?\\end\{tikzpicture\}/g, '\n[TikZ Figure]\n');

  s = s.replace(/\\color\{[^}]*\}/g, '');
  s = s.replace(/\\textcolor\{[^}]*\}\{([^}]*)\}/g, '$1');
  s = s.replace(/\\colorbox\{[^}]*\}\{([^}]*)\}/g, '$1');

  // replace booktabs with hline
  s = s.replace(/\\toprule(\[[^\]]*\])?/g, '\\hline');
  s = s.replace(/\\midrule(\[[^\]]*\])?/g, '\\hline');
  s = s.replace(/\\bottomrule(\[[^\]]*\])?/g, '\\hline');
  s = s.replace(/\\cmidrule(\[[^\]]*\])?\{[^}]*\}/g, '');

  // convert beamer frames to sections
  s = s.replace(/\\begin\{frame\}(\{([^}]*)\})?/g, (_, __, title) => {
    return title ? `\\subsection*{${title}}` : '';
  });
  s = s.replace(/\\end\{frame\}/g, '');
  s = s.replace(/\\titlepage/g, '\\maketitle');

  // convert beamer blocks to bold headings
  s = s.replace(/\\begin\{(block|alertblock|exampleblock)\}\{([^}]*)\}/g, '\\textbf{$2}\\\\');
  s = s.replace(/\\end\{(block|alertblock|exampleblock)\}/g, '');

  s = s.replace(/\\begin\{columns\}/g, '');
  s = s.replace(/\\end\{columns\}/g, '');
  s = s.replace(/\\column\{[^}]*\}/g, '');

  // remove letter-specific commands
  s = s.replace(/\\opening\{([^}]*)\}/g, '$1\\\\[1em]');
  s = s.replace(/\\closing\{([^}]*)\}/g, '\\\\[2em]$1');
  s = s.replace(/\\begin\{letter\}\{[^}]*\}/g, '');
  s = s.replace(/\\end\{letter\}/g, '');

  s = s.replace(/\\hypersetup\{[^}]*\}/g, '');

  s = s.replace(/^%[^\n]*\n/gm, '');

  s = s.replace(/\n{3,}/g, '\n\n');

  return s.trim();
}

function countBraces(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
  }
  return depth;
}
