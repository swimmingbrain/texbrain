import minimalTex from './minimal.tex?raw';
import articleTex from './article.tex?raw';
import thesisTex from './thesis.tex?raw';
import beamerTex from './beamer.tex?raw';
import letterTex from './letter.tex?raw';
import reportTex from './report.tex?raw';
import cvTex from './cv.tex?raw';

export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  content: string;
}

export const templates: Template[] = [
  {
    id: 'article',
    name: 'Article',
    description: 'Standard academic article with sections, equations, and references.',
    icon: '📄',
    content: articleTex
  },
  {
    id: 'thesis',
    name: 'Thesis',
    description: 'Full thesis/dissertation structure with chapters and front matter.',
    icon: '🎓',
    content: thesisTex
  },
  {
    id: 'beamer',
    name: 'Presentation',
    description: 'Beamer slides with frames, blocks, and two-column layouts.',
    icon: '📊',
    content: beamerTex
  },
  {
    id: 'letter',
    name: 'Letter',
    description: 'Formal letter with sender/recipient and standard closings.',
    icon: '✉️',
    content: letterTex
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Chapter-based technical report with tables and appendices.',
    icon: '📋',
    content: reportTex
  },
  {
    id: 'cv',
    name: 'Curriculum Vitae',
    description: 'Clean, professional CV with sections for education, experience, and skills.',
    icon: '👤',
    content: cvTex
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Bare minimum LaTeX document. Start from scratch.',
    icon: '⚡',
    content: minimalTex
  }
];
