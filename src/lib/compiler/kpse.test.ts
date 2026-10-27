import { describe, expect, test } from 'vitest';
import { candidateNames } from './kpse';

describe('a name without an extension is looked up by its format', () => {
  test('an \\input looks for the .tex and never for a .sty of the same name', () => {
    expect(candidateNames('xkeyval', 26)).toEqual(['xkeyval.tex', 'xkeyval']);
  });

  test('a font metric looks for the .tfm and never for the .pfb', () => {
    expect(candidateNames('cmr10', 3)).toEqual(['cmr10.tfm', 'cmr10']);
  });

  test('a type 1 font lookup gets the font, not the metric', () => {
    expect(candidateNames('cmr10', 32)).toEqual(['cmr10.pfb', 'cmr10.pfa', 'cmr10']);
  });

  test('a name with its extension is taken as it is first', () => {
    expect(candidateNames('xkeyval.sty', 26)[0]).toBe('xkeyval.sty');
    expect(candidateNames('article.cls', 26)[0]).toBe('article.cls');
    expect(candidateNames('swiftlatexpdftex.fmt', 10)[0]).toBe('swiftlatexpdftex.fmt');
  });

  test('a dot in a folder name is not an extension', () => {
    expect(candidateNames('v1.2/notes', 26)).toEqual(['v1.2/notes.tex', 'v1.2/notes']);
  });

  test('the format comes as the string from the url as well', () => {
    expect(candidateNames('cmr10', '3')).toEqual(['cmr10.tfm', 'cmr10']);
  });

  test('a format the table does not know keeps the broad probe', () => {
    const names = candidateNames('foo', 99);
    expect(names[0]).toBe('foo');
    expect(names).toContain('foo.tex');
    expect(names).toContain('foo.sty');
  });
});
