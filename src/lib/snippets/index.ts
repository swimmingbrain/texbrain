import { environmentSnippets } from './environments';
import { commandSnippets } from './commands';
import { mathSnippets } from './math';

export interface Snippet {
  name: string;
  trigger: string;
  category: 'environment' | 'command' | 'math';
  code: string;
}

export const allSnippets: Snippet[] = [
  ...environmentSnippets,
  ...commandSnippets,
  ...mathSnippets
];

export function searchSnippets(query: string): Snippet[] {
  if (!query) return allSnippets;
  const lower = query.toLowerCase();
  return allSnippets.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.trigger.toLowerCase().includes(lower) ||
      s.category.toLowerCase().includes(lower)
  );
}

export { environmentSnippets, commandSnippets, mathSnippets };
