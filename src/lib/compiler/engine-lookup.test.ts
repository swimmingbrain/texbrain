import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// the engine's own cache lookup lives in the swiftlatex glue. this runs that
// very function against a fake file system, so what is tested is what ships
const glue = readFileSync(new URL('../../../static/swiftlatex/swiftlatexpdftex.js', import.meta.url), 'utf8');

function lookupCode(): string {
  const start = glue.indexOf('var KPSE_FORMAT_EXTENSIONS');
  const fn = glue.indexOf('function kpse_find_file_impl(');
  if (start < 0 || fn < 0) throw new Error('lookup code not in the glue');
  let depth = 0;
  for (let i = glue.indexOf('{', fn); i < glue.length; i++) {
    if (glue[i] === '{') depth++;
    else if (glue[i] === '}' && --depth === 0) return glue.slice(start, i + 1);
  }
  throw new Error('kpse_find_file_impl never closes');
}

// files: what sits in the engine's cache folder. returns the path the lookup
// settled on (0 means not found) and the urls it asked the service worker for
function lookup(files: string[], name: string, format: number) {
  const requested: string[] = [];
  class Xhr {
    status = 404;
    open(_method: string, url: string) { requested.push(url); }
    send() {}
    getResponseHeader() { return null; }
  }
  const stubs: Record<string, unknown> = {
    UTF8ToString: (s: string) => s,
    FS: { stat: (p: string) => { if (!files.includes(p)) throw new Error('ENOENT'); }, writeFile: () => {} },
    TEXCACHEROOT: '/tex',
    texlive200_cache: {},
    texlive404_cache: {},
    allocate: (s: string) => s,
    intArrayFromString: (s: string) => s,
    ALLOC_NORMAL: 0,
    self: { texlive_endpoint: '/texlive/' },
    XMLHttpRequest: Xhr,
    TextDecoder
  };
  const run = new Function(...Object.keys(stubs), `${lookupCode()}; return kpse_find_file_impl(${JSON.stringify(name)}, ${format}, 1);`);
  return { result: run(...Object.values(stubs)) as string | 0, requested };
}

describe('the engine looks in its cache by format', () => {
  test('\\input xkeyval does not find the xkeyval.sty that was just downloaded', () => {
    const { result, requested } = lookup(['/tex/xkeyval.sty'], 'xkeyval', 26);
    expect(result).toBe(0);
    expect(requested).toEqual(['/texlive/pdftex/26/xkeyval']);
  });

  test('the package itself is found when asked for by its full name', () => {
    expect(lookup(['/tex/xkeyval.sty'], 'xkeyval.sty', 26).result).toBe('/tex/xkeyval.sty');
  });

  test('a metric lookup does not find the pfb an earlier compile embedded', () => {
    const { result, requested } = lookup(['/tex/cmr10.pfb'], 'cmr10', 3);
    expect(result).toBe(0);
    expect(requested).toEqual(['/texlive/pdftex/3/cmr10']);
  });

  test('the metric is found once it is there, next to the pfb', () => {
    expect(lookup(['/tex/cmr10.pfb', '/tex/cmr10.tfm'], 'cmr10', 3).result).toBe('/tex/cmr10.tfm');
  });

  test('a lookup with a path in it is not ours', () => {
    expect(lookup(['/tex/cmr10.tfm'], 'fonts/cmr10', 3).result).toBe(0);
  });
});
