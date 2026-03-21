import type { Snippet } from './index';

export const environmentSnippets: Snippet[] = [
  {
    name: 'Figure',
    trigger: 'fig',
    category: 'environment',
    code: '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=\\textwidth]{|}\n  \\caption{Caption}\n  \\label{fig:label}\n\\end{figure}'
  },
  {
    name: 'Table',
    trigger: 'tab',
    category: 'environment',
    code: '\\begin{table}[htbp]\n  \\centering\n  \\caption{Caption}\n  \\begin{tabular}{lcc}\n    \\hline\n    Header 1 & Header 2 & Header 3 \\\\\n    \\hline\n    |Cell 1 & Cell 2 & Cell 3 \\\\\n    \\hline\n  \\end{tabular}\n  \\label{tab:label}\n\\end{table}'
  },
  {
    name: 'Equation',
    trigger: 'eq',
    category: 'environment',
    code: '\\begin{equation}\n  |\n  \\label{eq:label}\n\\end{equation}'
  },
  {
    name: 'Align',
    trigger: 'ali',
    category: 'environment',
    code: '\\begin{align}\n  | &=  \\\\\n    &= \n\\end{align}'
  },
  {
    name: 'Itemize',
    trigger: 'item',
    category: 'environment',
    code: '\\begin{itemize}\n  \\item |\n  \\item \n\\end{itemize}'
  },
  {
    name: 'Enumerate',
    trigger: 'enum',
    category: 'environment',
    code: '\\begin{enumerate}\n  \\item |\n  \\item \n\\end{enumerate}'
  },
  {
    name: 'Minipage',
    trigger: 'mini',
    category: 'environment',
    code: '\\begin{minipage}{0.48\\textwidth}\n  |\n\\end{minipage}'
  },
  {
    name: 'Frame (Beamer)',
    trigger: 'frame',
    category: 'environment',
    code: '\\begin{frame}{|Title}\n  \n\\end{frame}'
  },
  {
    name: 'Code Listing',
    trigger: 'lst',
    category: 'environment',
    code: '\\begin{lstlisting}[language=|]\n\n\\end{lstlisting}'
  },
  {
    name: 'Abstract',
    trigger: 'abs',
    category: 'environment',
    code: '\\begin{abstract}\n  |\n\\end{abstract}'
  },
  {
    name: 'Center',
    trigger: 'cen',
    category: 'environment',
    code: '\\begin{center}\n  |\n\\end{center}'
  },
  {
    name: 'Quote',
    trigger: 'quo',
    category: 'environment',
    code: '\\begin{quote}\n  |\n\\end{quote}'
  }
];
