import { StreamLanguage } from '@codemirror/language';

const latexStreamParser = {
  startState() {
    return { inMath: false, mathDelim: '' as string };
  },
  token(stream: any, state: any): string | null {
    if (stream.match('%')) {
      stream.skipToEnd();
      return 'comment';
    }

    // display math $$
    if (!state.inMath && stream.match('$$')) {
      state.inMath = true;
      state.mathDelim = '$$';
      return 'keyword';
    }
    if (state.inMath && state.mathDelim === '$$' && stream.match('$$')) {
      state.inMath = false;
      state.mathDelim = '';
      return 'keyword';
    }

    // inline math $
    if (!state.inMath && stream.peek() === '$' && !stream.match('$$', false)) {
      stream.next();
      state.inMath = true;
      state.mathDelim = '$';
      return 'keyword';
    }
    if (state.inMath && state.mathDelim === '$' && stream.peek() === '$') {
      stream.next();
      state.inMath = false;
      state.mathDelim = '';
      return 'keyword';
    }

    // \[ and \]
    if (!state.inMath && stream.match('\\[')) {
      state.inMath = true;
      state.mathDelim = '\\[';
      return 'keyword';
    }
    if (state.inMath && state.mathDelim === '\\[' && stream.match('\\]')) {
      state.inMath = false;
      state.mathDelim = '';
      return 'keyword';
    }

    if (state.inMath) {
      if (stream.match(/^\\[a-zA-Z@]+/)) return 'atom';
      if (stream.match(/^[{}]/)) return 'bracket';
      if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return 'number';
      stream.next();
      return 'string';
    }

    if (stream.match(/^\\(begin|end)\b/)) {
      return 'keyword';
    }

    // environment name in braces after \begin or \end
    if (stream.match(/^\{[a-zA-Z*]+\}/)) {
      return 'typeName';
    }

    if (stream.match(/^\\[a-zA-Z@]+\*?/)) {
      return 'tagName';
    }

    if (stream.match(/^\\./)) {
      return 'escape';
    }

    if (stream.match(/^[{}]/)) {
      return 'bracket';
    }

    if (stream.match(/^[\[\]]/)) {
      return 'squareBracket';
    }

    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) {
      return 'number';
    }

    stream.next();
    return null;
  }
};

export const latexLanguage = StreamLanguage.define(latexStreamParser);
