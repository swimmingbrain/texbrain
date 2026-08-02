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

// the message as tex wrote it, minus the prefixes nobody needs to read twice
function tidy(message: string): string {
  return message
    .replace(/^LaTeX Error:\s*/, '')
    .replace(/^Package ([\w.-]+) Error:\s*/, '$1: ')
    .replace(/^Class ([\w.-]+) Error:\s*/, '$1: ')
    .replace(/\s*\.$/, '')
    .trim();
}

export function explain(kind: Severity, message: string, where: Where): Explanation {
  return { title: tidy(message) };
}
