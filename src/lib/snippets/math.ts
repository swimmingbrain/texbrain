import type { Snippet } from './index';

export const mathSnippets: Snippet[] = [
  {
    name: 'Fraction',
    trigger: 'frac',
    category: 'math',
    code: '\\frac{|}{}'
  },
  {
    name: 'Summation',
    trigger: 'sum',
    category: 'math',
    code: '\\sum_{|i=0}^{n}'
  },
  {
    name: 'Integral',
    trigger: 'int',
    category: 'math',
    code: '\\int_{|a}^{b}'
  },
  {
    name: 'Limit',
    trigger: 'lim',
    category: 'math',
    code: '\\lim_{| \\to \\infty}'
  },
  {
    name: 'Matrix',
    trigger: 'mat',
    category: 'math',
    code: '\\begin{matrix}\n  | & \\\\\n    & \n\\end{matrix}'
  },
  {
    name: 'Bracket Matrix',
    trigger: 'bmat',
    category: 'math',
    code: '\\begin{bmatrix}\n  | & \\\\\n    & \n\\end{bmatrix}'
  },
  {
    name: 'Parenthesis Matrix',
    trigger: 'pmat',
    category: 'math',
    code: '\\begin{pmatrix}\n  | & \\\\\n    & \n\\end{pmatrix}'
  },
  {
    name: 'Square Root',
    trigger: 'sqrt',
    category: 'math',
    code: '\\sqrt{|}'
  },
  {
    name: 'Overline',
    trigger: 'ol',
    category: 'math',
    code: '\\overline{|}'
  },
  {
    name: 'Underbrace',
    trigger: 'ub',
    category: 'math',
    code: '\\underbrace{|}_{text}'
  },
  {
    name: 'Cases',
    trigger: 'cases',
    category: 'math',
    code: '\\begin{cases}\n  | & \\text{if } \\\\\n    & \\text{otherwise}\n\\end{cases}'
  },
  {
    name: 'Inline Math',
    trigger: '$',
    category: 'math',
    code: '$|$'
  },
  {
    name: 'Display Math',
    trigger: '$$',
    category: 'math',
    code: '\\[\n  |\n\\]'
  }
];
