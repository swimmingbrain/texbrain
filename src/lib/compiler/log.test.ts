// the fixtures are real transcripts from the engine, one per kind of
// mistake, compiled through the app itself

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parseLog, locateByNeedle, problemText, problemsReport } from './log';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}.log`, import.meta.url), 'utf8');
}

function problemsOf(name: string) {
  return parseLog(fixture(name)).problems;
}

describe('parseLog', () => {
  test('a clean run has no problems', () => {
    expect(problemsOf('clean')).toEqual([]);
  });

  test('an unknown command names the command and the spot', () => {
    const [p, ...rest] = problemsOf('undefined-command');
    expect(rest).toEqual([]);
    expect(p.severity).toBe('error');
    expect(p.title).toBe('Unknown command \\foo');
    expect(p.file).toBe('welcome.tex');
    expect(p.inPackage).toBe(false);
    expect(p.line).toBe(4);
    expect(p.context).toEqual({ before: 'Hello \\foo', after: 'world.' });
    expect(p.excerpt[0]).toBe('! Undefined control sequence.');
  });

  test('the fatal summary and the emergency stop are not problems of their own', () => {
    const p = problemsOf('missing-package');
    expect(p).toHaveLength(1);
    expect(p[0].title).toBe('Package doesnotexist not found');
    expect(p[0].line).toBeUndefined();
    expect(p[0].needle).toBe('doesnotexist');
  });

  test('a missing package is placed by searching the sources', () => {
    const problems = problemsOf('missing-package');
    locateByNeedle(problems, new Map([['welcome.tex', '\\documentclass{article}\n\\usepackage{doesnotexist}\n\\begin{document}\nHello.\n\\end{document}\n']]));
    expect(problems[0].file).toBe('welcome.tex');
    expect(problems[0].line).toBe(2);
  });

  test('messages that wrap at 79 characters are glued back together', () => {
    const [p] = problemsOf('babel-unknown-option');
    expect(p.title).toBe('babel doesn\'t know the language brazilx');
    expect(p.message).toContain('brazilx.ldf was not found');
    expect(p.file).toBe('babel.sty');
    expect(p.inPackage).toBe(true);
    expect(p.line).toBe(543);
  });

  test('math outside math mode shows where tex stopped reading', () => {
    const [p] = problemsOf('missing-dollar');
    expect(p.title).toBe('Math outside math mode');
    expect(p.context).toEqual({ before: 'The value a_', after: 'b is small.' });
  });

  test('a runaway argument has no line but explains itself', () => {
    const [p] = problemsOf('runaway-argument');
    expect(p.title).toBe('Something was never closed');
    expect(p.line).toBeUndefined();
    expect(p.excerpt[0]).toBe('Runaway argument?');
    expect(p.explain).toContain('\\textbf');
  });

  test('undefined references become warnings, the summary line does not', () => {
    const p = problemsOf('undefined-reference');
    expect(p.map(x => [x.severity, x.title])).toEqual([
      ['warning', 'No label nope'],
      ['warning', 'No bibliography entry nokey']
    ]);
    expect(p[0].needle).toBe('{nope}');
    expect(p[0].line).toBe(4);
  });

  test('a missing image is one error, not an error and a warning', () => {
    const p = problemsOf('image-not-found');
    expect(p).toHaveLength(1);
    expect(p[0].severity).toBe('error');
    expect(p[0].title).toBe('Image nope.jpg not found');
    expect(p[0].line).toBe(4);
  });

  test('the same complaint about the same line collapses into one card', () => {
    const p = problemsOf('hyperref-token');
    expect(p).toHaveLength(1);
    expect(p[0].count).toBe(3);
    expect(p[0].title).toBe('A heading has something the PDF bookmarks can\'t show');
  });

  test('boxes are notes with the line they start on', () => {
    const [p] = problemsOf('overfull-hbox');
    expect(p.severity).toBe('info');
    expect(p.title).toBe('Text sticks 199pt into the margin');
    expect(p.line).toBe(4);
  });

  test('font substitutions are notes and the summary is dropped', () => {
    const p = problemsOf('font-shape');
    expect(p).toHaveLength(1);
    expect(p[0].severity).toBe('info');
    expect(p[0].title).toContain('OT1/xyz/m/n');
  });

  test.each([
    ['double-subscript', 'Two _ in a row'],
    ['misplaced-ampersand', '& outside a table'],
    ['missing-item', 'Missing \\item'],
    ['mismatched-environment', '\\begin{itemize} closed by \\end{enumerate}'],
    ['undefined-environment', 'Unknown environment tabularx'],
    ['text-before-document', 'Text before \\begin{document}'],
    ['too-many-braces', 'Braces don\'t add up']
  ])('%s reads as "%s"', (name, title) => {
    const p = problemsOf(name);
    expect(p).toHaveLength(1);
    expect(p[0].severity).toBe('error');
    expect(p[0].title).toBe(title);
    expect(p[0].line).toBeGreaterThan(0);
  });

  test('the unknown environment points at the package', () => {
    const [p] = problemsOf('undefined-environment');
    expect(p.fix).toContain('\\usepackage{tabularx}');
  });

  test('a problem as text has the headline, the advice, the spot and the log lines', () => {
    const [p] = problemsOf('undefined-command');
    const text = problemText(p);
    expect(text.split('\n')[0]).toBe('ERROR  welcome.tex, line 4: Unknown command \\foo');
    expect(text).toContain('Try: Check the spelling');
    expect(text).toContain('> Hello \\foo|world.');
    expect(text).toContain('! Undefined control sequence.');
  });

  test('the report counts what it contains', () => {
    const report = problemsReport(problemsOf('undefined-reference'), 'main.tex');
    expect(report.split('\n')[0]).toBe('TeXbrain problems for main.tex (2 warnings)');
    expect(report).toContain('WARNING  welcome.tex, line 4: No label nope');
  });

  test('the cleaned log drops file noise but keeps the errors', () => {
    const { cleanedLines } = parseLog(fixture('undefined-command'));
    expect(cleanedLines).toContain('! Undefined control sequence.');
    expect(cleanedLines.some(l => l.startsWith('(/tex/'))).toBe(false);
  });
});
