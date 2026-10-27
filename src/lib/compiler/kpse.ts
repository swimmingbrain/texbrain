// the engine asks for every file with a kpathsea format number, the same
// numbers pdftex uses: 3 is a font metric, 26 is anything for \input, 32 a
// type 1 font. a name that comes without an extension gets the one of its
// format and nothing else. before, the first file of any kind with that name
// won: \input xkeyval found the xkeyval.sty that was just downloaded (which
// inputs xkeyval again, until tex gives up), and cmr10 at 10.95pt found the
// cmr10.pfb an earlier 10pt compile had embedded instead of its metric
const FORMAT_EXTENSIONS: Record<number, string[]> = {
  3: ['.tfm'],
  4: ['.afm'],
  6: ['.bib'],
  7: ['.bst'],
  10: ['.fmt'],
  11: ['.map'],
  20: ['.ofm'],
  23: ['.ovf'],
  25: ['.eps', '.epsi'],
  26: ['.tex'],
  30: ['.pro'],
  32: ['.pfb', '.pfa'],
  33: ['.vf'],
  36: ['.ttf'],
  44: ['.enc'],
  45: ['.cmap'],
  46: ['.sfd'],
  47: ['.otf'],
  48: ['.cfg']
};

// what every lookup probed before the formats were told apart, kept for the
// few formats the table does not list
const ANY_EXTENSION = ['', '.tfm', '.pfb', '.vf', '.sty', '.cls', '.fd', '.def', '.cfg', '.clo', '.tex', '.ltx', '.map', '.enc', '.dfu', '.ldf'];

// the file names a lookup may resolve to, in the order to try them. a name
// that already has an extension is taken as it is first, the way kpathsea
// does it (keep the copy in static/swiftlatex/swiftlatexpdftex.js in sync)
export function candidateNames(name: string, format: number | string): string[] {
  const exts = FORMAT_EXTENSIONS[Number(format)];
  if (!exts) return ANY_EXTENSION.map(ext => name + ext);
  const withExt = exts.map(ext => name + ext);
  return /\.[^./]+$/.test(name) ? [name, ...withExt] : [...withExt, name];
}
