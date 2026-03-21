import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

export const darkEditorTheme = EditorView.theme(
  {
    '&': {
      color: '#d4d4d8',
      backgroundColor: '#19191c',
      fontSize: '14px',
      fontFamily: "'JetBrains Mono', monospace",
      height: '100%'
    },
    '.cm-content': {
      caretColor: '#d19a66',
      lineHeight: '1.65',
      padding: '12px 0'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#d19a66',
      borderLeftWidth: '2px'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(209, 154, 102, 0.20)'
    },
    '.cm-panels': { backgroundColor: '#19191c', color: '#d4d4d8' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #2e2e33' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #2e2e33' },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(209, 154, 102, 0.18)',
      outline: '1px solid rgba(209, 154, 102, 0.35)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(209, 154, 102, 0.35)'
    },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.03)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(209, 154, 102, 0.12)' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(209, 154, 102, 0.18)',
      outline: '1px solid rgba(209, 154, 102, 0.4)'
    },
    '.cm-gutters': {
      backgroundColor: '#19191c',
      color: '#4a4a50',
      border: 'none',
      paddingRight: '8px'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#71717a'
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#2a2a2e',
      color: '#71717a',
      border: 'none',
      padding: '0 6px',
      borderRadius: '2px'
    },
    '.cm-tooltip': {
      border: '1px solid #2e2e33',
      backgroundColor: '#212124',
      color: '#d4d4d8',
      borderRadius: '2px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)'
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: '#2e2e33',
      borderBottomColor: '#2e2e33'
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: '#212124',
      borderBottomColor: '#212124'
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#2a2a2e',
        color: '#d4d4d8'
      }
    }
  },
  { dark: true }
);

export const lightEditorTheme = EditorView.theme(
  {
    '&': {
      color: '#1c1c1e',
      backgroundColor: '#fafaf9',
      fontSize: '14px',
      fontFamily: "'JetBrains Mono', monospace",
      height: '100%'
    },
    '.cm-content': {
      caretColor: '#b8843e',
      lineHeight: '1.65',
      padding: '12px 0'
    },
    '.cm-cursor, .cm-dropCursor': {
      borderLeftColor: '#b8843e',
      borderLeftWidth: '2px'
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(184, 132, 62, 0.15)'
    },
    '.cm-panels': { backgroundColor: '#fafaf9', color: '#1c1c1e' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid #d4d4d0' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid #d4d4d0' },
    '.cm-searchMatch': {
      backgroundColor: 'rgba(184, 132, 62, 0.15)',
      outline: '1px solid rgba(184, 132, 62, 0.3)'
    },
    '.cm-searchMatch.cm-searchMatch-selected': {
      backgroundColor: 'rgba(184, 132, 62, 0.3)'
    },
    '.cm-activeLine': { backgroundColor: 'rgba(0, 0, 0, 0.03)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(184, 132, 62, 0.10)' },
    '.cm-matchingBracket, .cm-nonmatchingBracket': {
      backgroundColor: 'rgba(184, 132, 62, 0.15)',
      outline: '1px solid rgba(184, 132, 62, 0.35)'
    },
    '.cm-gutters': {
      backgroundColor: '#fafaf9',
      color: '#94949c',
      border: 'none',
      paddingRight: '8px'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
      color: '#57575e'
    },
    '.cm-foldPlaceholder': {
      backgroundColor: '#eeeeec',
      color: '#57575e',
      border: 'none',
      padding: '0 6px',
      borderRadius: '2px'
    },
    '.cm-tooltip': {
      border: '1px solid #d4d4d0',
      backgroundColor: '#fafaf9',
      color: '#1c1c1e',
      borderRadius: '2px',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.1)'
    },
    '.cm-tooltip-autocomplete': {
      '& > ul > li[aria-selected]': {
        backgroundColor: '#eeeeec',
        color: '#1c1c1e'
      }
    }
  },
  { dark: false }
);

const darkHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#c678dd' },
  { tag: tags.tagName, color: '#61afef' },
  { tag: tags.typeName, color: '#c678dd' },
  { tag: tags.string, color: '#98c379' },
  { tag: tags.atom, color: '#61afef' },
  { tag: tags.number, color: '#d19a66' },
  { tag: tags.bracket, color: '#e5c07b' },
  { tag: tags.squareBracket, color: '#ce9178' },
  { tag: tags.escape, color: '#ce9178' }
]);

const lightHighlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: '#94949c', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#8839b0' },
  { tag: tags.tagName, color: '#2973b0' },
  { tag: tags.typeName, color: '#8839b0' },
  { tag: tags.string, color: '#3a7d44' },
  { tag: tags.atom, color: '#2973b0' },
  { tag: tags.number, color: '#a5742f' },
  { tag: tags.bracket, color: '#996b1f' },
  { tag: tags.squareBracket, color: '#b05a30' },
  { tag: tags.escape, color: '#b05a30' }
]);

export const darkHighlight = syntaxHighlighting(darkHighlightStyle);
export const lightHighlight = syntaxHighlighting(lightHighlightStyle);
