// what a tex message means in plain words, and what to do about it

import type { Severity } from './log';

export interface Explanation {
  title: string;
  explain?: string;
  fix?: string;
  // something to search the sources for when tex gave no line
  needle?: string;
  // a warning that is really just a note, or the other way round
  severity?: Severity;
}

export interface Where {
  // the source text before the spot where tex stopped reading
  before?: string;
  file?: string;
  inPackage: boolean;
}

interface Rule {
  kind: Severity;
  test: RegExp;
  make: (m: RegExpMatchArray, where: Where) => Explanation;
}

// the message as tex wrote it, minus the prefixes nobody needs to read twice
function tidy(message: string): string {
  return message
    .replace(/^LaTeX Error:\s*/, '')
    .replace(/^Package ([\w.-]+) Error:\s*/, '$1: ')
    .replace(/^Class ([\w.-]+) Error:\s*/, '$1: ')
    .replace(/\s*\.$/, '')
    .trim();
}

// tex stops reading right after the thing it stumbled over, so the last
// command in the context is usually the culprit
function lastCommand(before?: string): string | undefined {
  if (!before) return undefined;
  const m = before.match(/(\\(?:[A-Za-z@]+|[^A-Za-z@\s]))\s*$/) || before.match(/(\\[A-Za-z@]+)(?!.*\\[A-Za-z@]+)/);
  return m ? m[1] : undefined;
}

const ENV_PACKAGES: Record<string, string> = {
  'align': 'amsmath', 'align*': 'amsmath', 'gather': 'amsmath', 'gather*': 'amsmath', 'multline': 'amsmath',
  'split': 'amsmath', 'cases': 'amsmath', 'subequations': 'amsmath', 'alignat': 'amsmath',
  'tabularx': 'tabularx', 'longtable': 'longtable', 'tikzpicture': 'tikz', 'subfigure': 'subcaption',
  'lstlisting': 'listings', 'algorithm': 'algorithm', 'algorithmic': 'algorithmic', 'multicols': 'multicol',
  'wrapfigure': 'wrapfig', 'framed': 'framed', 'tcolorbox': 'tcolorbox', 'proof': 'amsthm',
  'comment': 'comment', 'landscape': 'lscape', 'minipage*': 'the LaTeX kernel, check the spelling'
};

const RULES: Rule[] = [
  // ---- commands and math -------------------------------------------------
  {
    kind: 'error',
    test: /^Undefined control sequence/,
    make: (_m, where) => {
      const cmd = lastCommand(where.before);
      return {
        title: cmd ? `Unknown command ${cmd}` : 'Unknown command',
        explain: `LaTeX doesn't know ${cmd ?? 'this command'}. Either it is misspelled, or the package that defines it isn't loaded.`,
        fix: 'Check the spelling, or add the \\usepackage that provides it. Common ones: \\toprule needs booktabs, \\includegraphics needs graphicx, \\url needs url or hyperref, \\SI needs siunitx, \\textcolor needs xcolor.'
      };
    }
  },
  {
    kind: 'error',
    test: /^Missing \$ inserted/,
    make: () => ({
      title: 'Math outside math mode',
      explain: 'Something on this line only works in math mode: _ and ^, or a command like \\frac or \\alpha.',
      fix: 'Put it between $ and $. If you mean the characters themselves, write \\_ and \\^{}.'
    })
  },
  {
    kind: 'error',
    test: /^Display math should end with \$\$|^Bad math environment delimiter/,
    make: () => ({
      title: 'Math delimiters don\'t match',
      explain: 'What opens math has to close it too.',
      fix: '$ closes what $ opened, \\] closes \\[, and \\end{equation} closes \\begin{equation}. Check the pairs on this line.'
    })
  },
  {
    kind: 'error',
    test: /^Missing \} inserted|^Missing \{ inserted|^Too many \}'s|^Extra \}, or forgotten (\$|\\endgroup|\\right)|^Argument of \\\S+ has an extra \}/,
    make: () => ({
      title: 'Braces don\'t add up',
      explain: 'A { or } is missing, or there is one too many.',
      fix: 'Count the braces on this line and the ones above it. The editor highlights the matching brace when the cursor is next to one.'
    })
  },
  {
    kind: 'error',
    test: /^Double (subscript|superscript)/,
    make: (m) => ({
      title: `Two ${m[1] === 'subscript' ? '_' : '^'} in a row`,
      explain: 'TeX can\'t tell what belongs to what.',
      fix: 'Group the inner one: a_{b_c} instead of a_b_c.'
    })
  },
  {
    kind: 'error',
    test: /^Missing \\right\. inserted|^Extra \\right/,
    make: () => ({
      title: '\\left and \\right don\'t match',
      fix: 'Every \\left( needs a \\right) in the same formula. Use \\right. when you want no bracket on that side.'
    })
  },
  {
    kind: 'error',
    test: /^Please use \\mathaccent for accents in math mode/,
    make: () => ({
      title: 'Text accent inside math',
      fix: 'In math mode use \\hat{a}, \\bar{a}, \\vec{a} instead of \\^ and friends.'
    })
  },
  {
    kind: 'error',
    test: /^Missing number, treated as zero/,
    make: () => ({
      title: 'A number was expected',
      explain: 'A length, a counter or an option got text where a number belongs.',
      fix: 'Look at the last command on this line, one of its arguments needs a number, often with a unit like 2cm.'
    })
  },
  {
    kind: 'error',
    test: /^Illegal unit of measure/,
    make: () => ({
      title: 'Missing unit',
      fix: 'Lengths need a unit: 2cm, 10pt, 0.5\\textwidth.'
    })
  },
  {
    kind: 'error',
    test: /^Missing control sequence inserted/,
    make: () => ({
      title: '\\newcommand needs a command name',
      fix: 'The first argument is the command itself, backslash included: \\newcommand{\\name}{...}.'
    })
  },
  {
    kind: 'error',
    test: /^Use of (\\\S+) doesn't match its definition|^Missing \\endcsname inserted/,
    make: (m) => ({
      title: m[1] ? `${m[1]} used the wrong way` : 'A command was used the wrong way',
      fix: 'Compare the arguments on this line with what the command expects. Optional arguments go in [ ], required ones in { }.'
    })
  },

  // ---- structure ---------------------------------------------------------
  {
    kind: 'error',
    test: /^Paragraph ended before (\\\S+) was complete/,
    make: (m) => ({
      title: 'Blank line inside an argument',
      explain: `There is an empty line inside the argument of ${m[1]}, and most commands can't take one.`,
      fix: 'Remove the blank line, or end the paragraph with \\par instead.'
    })
  },
  {
    kind: 'error',
    test: /^File ended while scanning (?:use|text|definition) of (\\\S+)/,
    make: (m) => ({
      title: 'Something was never closed',
      explain: `${m[1]} was still waiting for its closing brace when the file ended. The runaway text below shows what it swallowed.`,
      fix: `Look for a { without its } after the last ${m[1]}, or a \\begin without its \\end.`
    })
  },
  {
    kind: 'error',
    test: /^File ended while scanning/,
    make: () => ({
      title: 'Something was never closed',
      fix: 'A brace, a bracket or an environment is still open at the end of the file.'
    })
  },
  {
    kind: 'error',
    test: /^(?:LaTeX Error: )?Missing \\begin\{document\}/,
    make: () => ({
      title: 'Text before \\begin{document}',
      explain: 'Something in the preamble prints text. Only definitions, \\usepackage and settings belong before \\begin{document}.',
      fix: 'Look for a stray character or a misspelled command above \\begin{document}. A typo in a package name or an option does this too.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Environment (\S+) undefined/,
    make: (m) => {
      const pkg = ENV_PACKAGES[m[1]];
      return {
        title: `Unknown environment ${m[1]}`,
        explain: `\\begin{${m[1]}} needs a package that defines it, or the name is misspelled.`,
        fix: pkg ? `Add \\usepackage{${pkg}} to the preamble.` : 'Load the package that provides it, or check the spelling.'
      };
    }
  },
  {
    kind: 'error',
    test: /^LaTeX Error: \\begin\{(\S+)\}(?: on input line (\d+))? ended by \\end\{(\S+)\}/,
    make: (m) => ({
      title: `\\begin{${m[1]}} closed by \\end{${m[3]}}`,
      explain: 'Environments close in the reverse order they were opened, each with its own name.',
      fix: m[2] ? `The \\begin{${m[1]}} is on line ${m[2]}. Give it its own \\end{${m[1]}}, or fix the name.` : `Give \\begin{${m[1]}} its own \\end{${m[1]}}, or fix the name.`
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Something's wrong--perhaps a missing \\item/,
    make: () => ({
      title: 'Missing \\item',
      explain: 'Inside itemize, enumerate and description every entry starts with \\item. Text without one, or an empty list, trips this.',
      fix: 'Add \\item in front of the text, or remove the empty list.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Lonely \\item/,
    make: () => ({
      title: '\\item outside a list',
      fix: 'Wrap it in \\begin{itemize} ... \\end{itemize} or \\begin{enumerate} ... \\end{enumerate}.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: There's no line here to end/,
    make: () => ({
      title: '\\\\ with nothing to break',
      explain: '\\\\ ends a line of text. On an empty line, or right after a heading, there is no line to end.',
      fix: 'Remove it. Use an empty line for a new paragraph and \\vspace{...} for extra space.'
    })
  },
  {
    kind: 'error',
    test: /^Misplaced alignment tab character &/,
    make: () => ({
      title: '& outside a table',
      explain: '& separates columns in tabular, align and friends. Anywhere else it is an error.',
      fix: 'Write \\& for a literal ampersand.'
    })
  },
  {
    kind: 'error',
    test: /^Extra alignment tab has been changed to \\cr/,
    make: () => ({
      title: 'Too many columns in a row',
      explain: 'A row of this table has more & than the column definition allows.',
      fix: 'Remove the extra &, or add a column to the tabular definition.'
    })
  },
  {
    kind: 'error',
    test: /^Misplaced (\\noalign|\\omit|\\cr)/,
    make: () => ({
      title: 'Table command in the wrong place',
      fix: '\\hline and \\cline only work at the start of a row, right after \\\\. Outside a table they don\'t work at all.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Not in outer par mode/,
    make: () => ({
      title: 'Float inside something else',
      explain: 'figure and table can\'t live inside another float, a minipage, a box or a footnote.',
      fix: 'Move it out, or drop the figure environment and place the image directly.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Too many unprocessed floats/,
    make: () => ({
      title: 'Too many floats waiting',
      explain: 'LaTeX has more figures and tables in the queue than it can hold.',
      fix: 'Add \\clearpage somewhere before this point, or give the floats more freedom with [htbp].'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Command (\\\S+) already defined/,
    make: (m) => ({
      title: `${m[1]} is defined twice`,
      fix: 'Use \\renewcommand to change an existing command, or pick another name.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: (?:Command )?(\\\S+) undefined/,
    make: (m) => ({
      title: `${m[1]} isn't defined yet`,
      fix: '\\renewcommand only changes commands that exist. Use \\newcommand for a new one.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Can be used only in preamble/,
    make: () => ({
      title: 'Belongs before \\begin{document}',
      fix: 'Move this line up into the preamble, \\usepackage and \\documentclass settings can\'t come later.'
    })
  },
  {
    kind: 'error',
    test: /^Text line contains an invalid character/,
    make: () => ({
      title: 'Invalid character on this line',
      explain: 'An invisible control character is hiding in the text, usually from a copy and paste.',
      fix: 'Delete the line and type it again.'
    })
  },
  {
    kind: 'error',
    test: /^TeX capacity exceeded, sorry \[text input levels/,
    make: () => ({
      title: 'Files include each other in a loop',
      explain: 'A file \\inputs itself, or two files include each other, until TeX gives up.',
      fix: 'Check the \\input and \\include lines. A file named like a package it loads does this too.'
    })
  },
  {
    kind: 'error',
    test: /^TeX capacity exceeded, sorry \[(.+)\]/,
    make: (m) => ({
      title: `TeX ran out of room (${m[1]})`,
      explain: 'Almost always a loop: a command that calls itself, or an environment that never ends.',
      fix: 'Look at what you changed last, and at any \\newcommand that uses its own name.'
    })
  },
  {
    kind: 'error',
    test: /^Emergency stop/,
    make: () => ({
      title: 'The compile stopped here',
      explain: 'TeX gave up without a specific complaint. The log above the stop usually has the reason.',
      fix: 'Check the full log for the last thing that happened before the stop.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: (.*)/,
    make: (m) => ({ title: tidy(m[1]) })
  }
];

export function explain(kind: Severity, message: string, where: Where): Explanation {
  for (const rule of RULES) {
    if (rule.kind !== kind) continue;
    const m = message.match(rule.test);
    if (m) return rule.make(m, where);
  }
  return { title: tidy(message) };
}
