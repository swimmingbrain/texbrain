import { EditorState, type Extension } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, rectangularSelection, crosshairCursor, keymap } from '@codemirror/view';
import { defaultKeymap as _defaultKeymap, history, historyKeymap } from '@codemirror/commands';

// filter out Mod-/ (toggleComment), reserved for the snippet picker
const defaultKeymap = _defaultKeymap.filter(k => k.key !== 'Mod-/');

import { foldGutter, foldKeymap, bracketMatching, indentOnInput } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap as _searchKeymap, highlightSelectionMatches } from '@codemirror/search';

// Mod-g is "find next" in codemirror and the git panel in the app, the app wins
const searchKeymap = _searchKeymap.filter(k => k.key !== 'Mod-g');
import { latexLanguage } from './latex-language';
import { darkEditorTheme, lightEditorTheme, darkHighlight, lightHighlight } from './theme';
import { tabKeymap } from './keybindings';
import { latexAutocomplete } from './autocomplete';

export interface EditorConfig {
  doc: string;
  parent: HTMLElement;
  dark: boolean;
  onUpdate?: (content: string) => void;
  // fires on every cursor move, edits included
  onCursor?: (line: number, col: number) => void;
  // pass the result of yCollab(...) here to enable collaborative editing
  collab?: Extension;
}

function autoCloseEnvironment(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text !== '\n') return false;

    const state = view.state;
    const line = state.doc.lineAt(from);
    const lineText = line.text;

    const match = lineText.match(/^(\s*)\\begin\{([^}]+)\}\s*$/);
    if (!match) return false;

    const indent = match[1];
    const envName = match[2];
    const insertion = `\n${indent}  \n${indent}\\end{${envName}}`;

    view.dispatch({
      changes: { from, to, insert: insertion },
      selection: { anchor: from + 1 + indent.length + 2 }
    });
    return true;
  });
}

export function createEditor(config: EditorConfig): EditorView {
  const themeExtension = config.dark ? darkEditorTheme : lightEditorTheme;
  const highlightExtension = config.dark ? darkHighlight : lightHighlight;

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && config.onUpdate) {
      config.onUpdate(update.state.doc.toString());
    }
    if ((update.selectionSet || update.docChanged) && config.onCursor) {
      const pos = update.state.selection.main.head;
      const line = update.state.doc.lineAt(pos);
      config.onCursor(line.number, pos - line.from + 1);
    }
  });

  const extensions: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
  ];

  // history only in solo mode; yCollab provides its own undo manager
  if (!config.collab) {
    extensions.push(history());
  }

  extensions.push(
    foldGutter(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    rectangularSelection(),
    crosshairCursor(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    EditorState.tabSize.of(2),
  );

  // collab extension (yCollab) includes remote cursors and undo keybindings
  if (config.collab) {
    extensions.push(
      config.collab,
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...foldKeymap
      ])
    );
  } else {
    extensions.push(
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap
      ])
    );
  }

  extensions.push(
    tabKeymap,
    latexLanguage,
    themeExtension,
    highlightExtension,
    latexAutocomplete,
    autoCloseEnvironment(),
    updateListener
  );

  const state = EditorState.create({
    doc: config.doc,
    extensions
  });

  return new EditorView({ state, parent: config.parent });
}

export function replaceEditorContent(view: EditorView, content: string) {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: content }
  });
}

// puts the cursor at the start of a line and scrolls it into the middle
export function gotoLine(view: EditorView, line: number) {
  const n = Math.max(1, Math.min(line, view.state.doc.lines));
  const pos = view.state.doc.line(n).from;
  view.dispatch({
    selection: { anchor: pos },
    effects: EditorView.scrollIntoView(pos, { y: 'center' })
  });
  view.focus();
}

export function insertAtCursor(view: EditorView, text: string) {
  const cursor = view.state.selection.main.head;
  const cursorPlaceholder = text.indexOf('|');

  if (cursorPlaceholder !== -1) {
    const before = text.slice(0, cursorPlaceholder);
    const after = text.slice(cursorPlaceholder + 1);
    view.dispatch({
      changes: { from: cursor, insert: before + after },
      selection: { anchor: cursor + before.length }
    });
  } else {
    view.dispatch({
      changes: { from: cursor, insert: text },
      selection: { anchor: cursor + text.length }
    });
  }
  view.focus();
}
