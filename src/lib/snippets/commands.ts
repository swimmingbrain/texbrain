import type { Snippet } from './index';

export const commandSnippets: Snippet[] = [
  {
    name: 'Section',
    trigger: 'sec',
    category: 'command',
    code: '\\section{|}'
  },
  {
    name: 'Subsection',
    trigger: 'sub',
    category: 'command',
    code: '\\subsection{|}'
  },
  {
    name: 'Subsubsection',
    trigger: 'ssub',
    category: 'command',
    code: '\\subsubsection{|}'
  },
  {
    name: 'Citation',
    trigger: 'cite',
    category: 'command',
    code: '\\cite{|}'
  },
  {
    name: 'Reference',
    trigger: 'ref',
    category: 'command',
    code: '\\ref{|}'
  },
  {
    name: 'Label',
    trigger: 'lab',
    category: 'command',
    code: '\\label{|}'
  },
  {
    name: 'Footnote',
    trigger: 'fn',
    category: 'command',
    code: '\\footnote{|}'
  },
  {
    name: 'Hyperlink',
    trigger: 'href',
    category: 'command',
    code: '\\href{|}{link text}'
  },
  {
    name: 'Bold Text',
    trigger: 'bf',
    category: 'command',
    code: '\\textbf{|}'
  },
  {
    name: 'Italic Text',
    trigger: 'it',
    category: 'command',
    code: '\\textit{|}'
  },
  {
    name: 'Include Graphics',
    trigger: 'img',
    category: 'command',
    code: '\\includegraphics[width=\\textwidth]{|}'
  },
  {
    name: 'Use Package',
    trigger: 'pkg',
    category: 'command',
    code: '\\usepackage{|}'
  }
];
