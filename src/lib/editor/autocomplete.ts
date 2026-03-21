import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';

const latexCommands = [
  { label: '\\textbf', detail: 'Bold text', apply: '\\textbf{$}' },
  { label: '\\textit', detail: 'Italic text', apply: '\\textit{$}' },
  { label: '\\underline', detail: 'Underline text', apply: '\\underline{$}' },
  { label: '\\emph', detail: 'Emphasis', apply: '\\emph{$}' },
  { label: '\\section', detail: 'Section heading', apply: '\\section{$}' },
  { label: '\\subsection', detail: 'Subsection heading', apply: '\\subsection{$}' },
  { label: '\\subsubsection', detail: 'Sub-subsection', apply: '\\subsubsection{$}' },
  { label: '\\chapter', detail: 'Chapter heading', apply: '\\chapter{$}' },
  { label: '\\paragraph', detail: 'Paragraph heading', apply: '\\paragraph{$}' },
  { label: '\\cite', detail: 'Citation', apply: '\\cite{$}' },
  { label: '\\ref', detail: 'Reference', apply: '\\ref{$}' },
  { label: '\\label', detail: 'Label', apply: '\\label{$}' },
  { label: '\\footnote', detail: 'Footnote', apply: '\\footnote{$}' },
  { label: '\\href', detail: 'Hyperlink', apply: '\\href{$}{}' },
  { label: '\\url', detail: 'URL', apply: '\\url{$}' },
  { label: '\\includegraphics', detail: 'Include image', apply: '\\includegraphics[width=\\textwidth]{$}' },
  { label: '\\usepackage', detail: 'Import package', apply: '\\usepackage{$}' },
  { label: '\\documentclass', detail: 'Document class', apply: '\\documentclass{$}' },
  { label: '\\frac', detail: 'Fraction', apply: '\\frac{$}{}' },
  { label: '\\sqrt', detail: 'Square root', apply: '\\sqrt{$}' },
  { label: '\\sum', detail: 'Summation', apply: '\\sum_{$}^{}' },
  { label: '\\int', detail: 'Integral', apply: '\\int_{$}^{}' },
  { label: '\\lim', detail: 'Limit', apply: '\\lim_{$ \\to }' },
  { label: '\\alpha', detail: 'Greek: alpha' },
  { label: '\\beta', detail: 'Greek: beta' },
  { label: '\\gamma', detail: 'Greek: gamma' },
  { label: '\\delta', detail: 'Greek: delta' },
  { label: '\\epsilon', detail: 'Greek: epsilon' },
  { label: '\\theta', detail: 'Greek: theta' },
  { label: '\\lambda', detail: 'Greek: lambda' },
  { label: '\\mu', detail: 'Greek: mu' },
  { label: '\\pi', detail: 'Greek: pi' },
  { label: '\\sigma', detail: 'Greek: sigma' },
  { label: '\\phi', detail: 'Greek: phi' },
  { label: '\\omega', detail: 'Greek: omega' },
  { label: '\\infty', detail: 'Infinity symbol' },
  { label: '\\partial', detail: 'Partial derivative' },
  { label: '\\nabla', detail: 'Nabla/del' },
  { label: '\\cdot', detail: 'Center dot' },
  { label: '\\times', detail: 'Multiplication' },
  { label: '\\leq', detail: 'Less than or equal' },
  { label: '\\geq', detail: 'Greater than or equal' },
  { label: '\\neq', detail: 'Not equal' },
  { label: '\\approx', detail: 'Approximately' },
  { label: '\\rightarrow', detail: 'Right arrow' },
  { label: '\\leftarrow', detail: 'Left arrow' },
  { label: '\\Rightarrow', detail: 'Double right arrow' },
  { label: '\\overline', detail: 'Overline', apply: '\\overline{$}' },
  { label: '\\underbrace', detail: 'Underbrace', apply: '\\underbrace{$}_{}' },
  { label: '\\overbrace', detail: 'Overbrace', apply: '\\overbrace{$}^{}' },
  { label: '\\mathbb', detail: 'Blackboard bold', apply: '\\mathbb{$}' },
  { label: '\\mathcal', detail: 'Calligraphic', apply: '\\mathcal{$}' },
  { label: '\\mathrm', detail: 'Roman math', apply: '\\mathrm{$}' },
  { label: '\\text', detail: 'Text in math', apply: '\\text{$}' },
  { label: '\\item', detail: 'List item' },
  { label: '\\hspace', detail: 'Horizontal space', apply: '\\hspace{$}' },
  { label: '\\vspace', detail: 'Vertical space', apply: '\\vspace{$}' },
  { label: '\\newcommand', detail: 'New command', apply: '\\newcommand{\\$}{}' },
  { label: '\\renewcommand', detail: 'Renew command', apply: '\\renewcommand{\\$}{}' },
  { label: '\\newpage', detail: 'New page' },
  { label: '\\clearpage', detail: 'Clear page' },
  { label: '\\tableofcontents', detail: 'Table of contents' },
  { label: '\\maketitle', detail: 'Make title' },
  { label: '\\title', detail: 'Document title', apply: '\\title{$}' },
  { label: '\\author', detail: 'Author', apply: '\\author{$}' },
  { label: '\\date', detail: 'Date', apply: '\\date{$}' },
];

const environments = [
  'document', 'figure', 'table', 'tabular', 'equation', 'equation*',
  'align', 'align*', 'gather', 'gather*', 'itemize', 'enumerate',
  'description', 'abstract', 'center', 'flushleft', 'flushright',
  'minipage', 'frame', 'lstlisting', 'verbatim', 'quote',
  'theorem', 'proof', 'lemma', 'definition', 'example', 'array', 'matrix',
  'bmatrix', 'pmatrix', 'cases', 'split', 'multline'
];

function latexCompletions(context: CompletionContext): CompletionResult | null {
  const commandMatch = context.matchBefore(/\\[a-zA-Z]*/);
  if (commandMatch) {
    return {
      from: commandMatch.from,
      options: latexCommands.map((cmd) => ({
        label: cmd.label,
        detail: cmd.detail,
        type: 'keyword',
        apply: cmd.apply || cmd.label
      })),
      validFor: /^\\[a-zA-Z]*$/
    };
  }

  const envMatch = context.matchBefore(/\\(begin|end)\{[a-zA-Z*]*/);
  if (envMatch) {
    const prefix = envMatch.text;
    const braceIdx = prefix.indexOf('{');
    return {
      from: envMatch.from + braceIdx + 1,
      options: environments.map((env) => ({
        label: env,
        type: 'type'
      })),
      validFor: /^[a-zA-Z*]*$/
    };
  }

  return null;
}

export const latexAutocomplete = autocompletion({
  override: [latexCompletions],
  icons: false,
  activateOnTyping: true
});
