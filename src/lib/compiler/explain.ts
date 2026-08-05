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

const IMAGE = /\.(png|jpe?g|pdf|eps|gif|bmp|tiff?|svg)$/i;

function fileNotFound(name: string): Explanation {
  const base = name.replace(/\.[^.]+$/, '');
  if (/\.(sty|cls)$/.test(name)) {
    const isClass = name.endsWith('.cls');
    return {
      title: `${isClass ? 'Class' : 'Package'} ${base} not found`,
      explain: `${name} isn't bundled with the app and the TeX Live mirror doesn't have it either, or the name is misspelled.`,
      fix: `Check the spelling in \\${isClass ? 'documentclass' : 'usepackage'}. If it exists on CTAN and still fails here, open an issue with the name.`,
      needle: base
    };
  }
  if (IMAGE.test(name)) {
    return {
      title: `Image ${name} not found`,
      explain: 'The file isn\'t in the project, at least not under that name and path.',
      fix: 'Check the name, the extension and the folder. Open the whole project folder so every file reaches the compiler.',
      needle: name
    };
  }
  return {
    title: `File ${name} not found`,
    explain: 'Nothing with that name is in the project.',
    fix: 'Check the name and the path. Open the whole project folder so every file reaches the compiler.',
    needle: base
  };
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
  // ---- files, packages, images, fonts -------------------------------------
  {
    kind: 'error',
    test: /^LaTeX Error: File `([^']+)' not found/,
    make: (m) => fileNotFound(m[1])
  },
  {
    kind: 'error',
    test: /^Package pdftex\.def Error: File `([^']+)' not found/,
    make: (m) => fileNotFound(m[1])
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Unknown graphics extension: (\S+)/,
    make: (m) => ({
      title: `Image format ${m[1]} isn't supported`,
      explain: 'pdfTeX reads PNG, JPG and PDF, nothing else.',
      fix: `Convert the ${m[1]} file to PNG or PDF and include that.`
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Cannot determine size of graphic in (\S+)/,
    make: (m) => ({
      title: `Can't read the size of ${m[1]}`,
      explain: 'The image is broken, or in a format pdfTeX can\'t measure.',
      fix: 'Export it again as PNG or PDF, or give width and height explicitly.',
      needle: m[1]
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Option clash for package (\S+)/,
    make: (m) => ({
      title: `Package ${m[1]} loaded twice with different options`,
      explain: 'Another package already loaded it, with other options, and LaTeX can\'t load a package twice.',
      fix: `Put \\PassOptionsToPackage{...}{${m[1]}} before the first \\usepackage, or move the options into \\documentclass.`,
      needle: m[1]
    })
  },
  {
    kind: 'error',
    test: /^Package babel Error: Unknown option `([^']+)'/,
    make: (m) => ({
      title: `babel doesn't know the language ${m[1]}`,
      explain: 'The option isn\'t a language this babel ships, or its name changed between versions.',
      fix: 'Check the spelling in \\usepackage[...]{babel}. brazil and brazilian are the same language, ngerman is the modern german.',
      needle: m[1]
    })
  },
  {
    kind: 'error',
    test: /^Package inputenc Error: (?:Invalid UTF-8 byte|Unicode character)/,
    make: () => ({
      title: 'The file isn\'t valid UTF-8',
      explain: 'A character on this line can\'t be read as UTF-8, often after a copy from another program.',
      fix: 'Delete and retype the character, or save the file as UTF-8.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: Unicode character (.+?) (?:\(U\+\w+\) )?not set up for use with LaTeX/,
    make: (m) => ({
      title: `The character ${m[1]} isn't available`,
      explain: 'The font encoding in use has no glyph for it.',
      fix: 'Use the LaTeX command for it, or add \\usepackage[T1]{fontenc} for accented letters.'
    })
  },
  {
    kind: 'error',
    test: /^Font \S+=(\S+) .*not loadable: (?:Bad metric \(TFM\) file|Metric \(TFM\) file not found)/,
    make: (m) => ({
      title: `Font ${m[1]} couldn't be loaded`,
      explain: 'The metric file for this font is missing or broken. In TeXbrain that usually means a download went wrong and got cached.',
      fix: 'Reload the page and compile again. If it keeps happening, clear the site data for tex.swimmingbrain.dev and open an issue with the full log.'
    })
  },
  {
    kind: 'error',
    test: /^Package ([\w.-]+) Error: (.*)/,
    make: (m) => ({
      title: `${m[1]}: ${tidy(m[2])}`,
      explain: `This comes from the ${m[1]} package, in its own words.`,
      fix: 'The package documentation explains its messages. Search for the sentence above together with the package name.'
    })
  },
  {
    kind: 'error',
    test: /^LaTeX Error: (.*)/,
    make: (m) => ({ title: tidy(m[1]) })
  },

  // ---- warnings ----------------------------------------------------------
  {
    kind: 'warning',
    test: /Reference `([^']+)' on page \d+ undefined/,
    make: (m) => ({
      title: `No label ${m[1]}`,
      explain: `Nothing has \\label{${m[1]}}, or it was added after the last run.`,
      fix: 'Check the spelling, or compile once more so the references settle.',
      needle: `{${m[1]}}`
    })
  },
  {
    kind: 'warning',
    test: /Citation `([^']+)' on page \d+ undefined/,
    make: (m) => ({
      title: `No bibliography entry ${m[1]}`,
      explain: 'No entry with this key was found, or the bibliography wasn\'t processed.',
      fix: 'Check the key in the .bib file. TeXbrain has no bibtex yet: biblatex documents get a simple bibliography built from the .bib file, classic bibtex needs a .bbl file in the project.',
      needle: m[1]
    })
  },
  {
    kind: 'warning',
    test: /There were undefined (references|citations)/,
    make: (m) => ({
      title: `Some ${m[1]} are undefined`,
      fix: 'Compile once more. If it stays, a \\ref or \\cite points to something that doesn\'t exist.',
      severity: 'info'
    })
  },
  {
    kind: 'warning',
    test: /Label\(s\) may have changed/,
    make: () => ({
      title: 'Compile once more',
      explain: 'Page numbers or references moved during this run, so the numbers in the text are one step behind.',
      fix: 'Compile again and this goes away.',
      severity: 'info'
    })
  },
  {
    kind: 'warning',
    test: /Label `([^']+)' multiply defined/,
    make: (m) => ({
      title: `Label ${m[1]} used twice`,
      fix: 'Labels have to be unique. Rename one of them.',
      needle: `\\label{${m[1]}}`
    })
  },
  {
    kind: 'warning',
    test: /Font shape `([^']+)' undefined/,
    make: (m) => ({
      title: `Font shape ${m[1]} isn't available, a substitute was used`,
      explain: 'The font family, series or shape doesn\'t exist in this encoding, so LaTeX picked the closest thing.',
      fix: 'Harmless most of the time. Load the package that provides the font, or use another one.',
      severity: 'info'
    })
  },
  {
    kind: 'warning',
    test: /Some font shapes were not available/,
    make: () => ({ title: 'Some font shapes were substituted', severity: 'info' })
  },
  {
    kind: 'warning',
    test: /Token not allowed in a PDF string.*removing `([^']+)'/,
    make: (m) => ({
      title: 'A heading has something the PDF bookmarks can\'t show',
      explain: `hyperref copies headings into the PDF outline, where only plain text works. It dropped the ${m[1]}.`,
      fix: 'Wrap it: \\texorpdfstring{$x^2$}{x squared}. The first part goes into the document, the second into the bookmarks.'
    })
  },
  {
    kind: 'warning',
    test: /File `([^']+)' not found/,
    make: (m) => fileNotFound(m[1])
  },
  {
    kind: 'warning',
    test: /Float too large for page/,
    make: () => ({ title: 'A figure or table is taller than the page', fix: 'Scale it down, or split it.', severity: 'info' })
  },
  {
    kind: 'warning',
    test: /`!?h' float specifier changed to `!?ht'/,
    make: () => ({
      title: 'Float placement relaxed',
      explain: 'LaTeX couldn\'t put it exactly here and will use the top of a page when it has to.',
      fix: 'Fine as it is. Use [H] from the float package to force the spot.',
      severity: 'info'
    })
  },
  {
    kind: 'warning',
    test: /Unused global option\(s\):\s*\[([^\]]+)\]/,
    make: (m) => ({
      title: `Option ${m[1]} unknown to the class and every package`,
      fix: 'Check the spelling in \\documentclass[...]. Options are case sensitive.'
    })
  },
  {
    kind: 'warning',
    test: /Command (\\\S+) invalid in math mode/,
    make: (m) => ({
      title: `${m[1]} doesn't work in math mode`,
      fix: 'Use the math version, \\mathbf instead of \\bf for example, or leave math mode first.'
    })
  },
  {
    kind: 'warning',
    test: /destination with the same identifier \(name\{([^}]+)\}\) has been already used/,
    make: (m) => ({
      title: `Two places share the link target ${m[1]}`,
      explain: 'hyperref links point at identifiers, and this one exists twice, usually a page number that restarts.',
      fix: 'Use \\frontmatter and \\mainmatter so page numbers don\'t repeat, or \\hypersetup{pageanchor=false} for the pages before the main text.',
      severity: 'info'
    })
  },

  // ---- typesetting notes -------------------------------------------------
  {
    kind: 'info',
    test: /^Overfull \\hbox \(([\d.]+)pt too wide\) in paragraph at lines (\d+)--(\d+)/,
    make: (m) => ({
      title: `Text sticks ${Math.round(parseFloat(m[1]))}pt into the margin`,
      explain: `A word, formula or url on lines ${m[2]} to ${m[3]} is too long to fit and LaTeX found no place to break it.`,
      fix: 'Add a break hint with \\-, reword the sentence, or wrap urls in \\url. \\sloppy before the paragraph lets LaTeX stretch spaces instead.'
    })
  },
  {
    kind: 'info',
    test: /^Overfull \\hbox \(([\d.]+)pt too wide\)/,
    make: (m) => ({
      title: `Something sticks ${Math.round(parseFloat(m[1]))}pt into the margin`,
      fix: 'Usually a table or an image wider than the text. Scale it, or give it a smaller width.'
    })
  },
  {
    kind: 'info',
    test: /^Underfull \\hbox \(badness \d+\) in paragraph at lines (\d+)--(\d+)/,
    make: (m) => ({
      title: 'A line with stretched spaces',
      explain: `LaTeX had to pull the spaces on lines ${m[1]} to ${m[2]} apart more than it likes, usually because of a forced line break or a very long word.`,
      fix: 'Remove a \\\\ or \\newline, or let it be, it only looks a little airy.'
    })
  },
  {
    kind: 'info',
    test: /^Underfull \\hbox/,
    make: () => ({ title: 'A line with stretched spaces', fix: 'Usually a \\\\ in a line that isn\'t full. Harmless.' })
  },
  {
    kind: 'info',
    test: /^Overfull \\vbox \(([\d.]+)pt too high\)/,
    make: (m) => ({
      title: `Content ${Math.round(parseFloat(m[1]))}pt taller than the page`,
      fix: 'A figure, table or minipage doesn\'t fit the page height. Scale it, or let it float.'
    })
  },
  {
    kind: 'info',
    test: /^Underfull \\vbox/,
    make: () => ({
      title: 'A page with stretched space',
      explain: 'LaTeX spread the content of a page to fill it, usually before a forced page break or a large float.',
      fix: 'Harmless. \\raggedbottom in the preamble stops the stretching.'
    })
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
