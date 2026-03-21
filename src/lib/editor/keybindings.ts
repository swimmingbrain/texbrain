import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';

export const tabKeymap = keymap.of([indentWithTab]);
