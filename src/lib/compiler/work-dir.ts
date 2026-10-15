// pdftex resolves \input and \includegraphics against the folder it was
// started in. on a desktop that is the folder of the main file, as in
// cd auftrag && pdflatex master.tex, which is how a repository that holds
// several documents keeps the paths inside each one short. the engine
// always starts in the same folder, so the project is handed over relative
// to the main file's folder instead, and the names the compiler prints get
// the folder put back afterwards

export interface WorkDirView {
  // auftrag/ for auftrag/master.tex, empty when the main file is at the top
  dir: string;
  // the main file as the compiler sees it, master.tex
  mainFile: string;
  files: Map<string, string>;
  binaryFiles: Map<string, ArrayBuffer>;
}

export function workDirOf(mainFile: string): string {
  const slash = mainFile.lastIndexOf('/');
  return slash === -1 ? '' : mainFile.slice(0, slash + 1);
}

// everything inside the main file's folder, with the folder taken off the
// front. files beside that folder stay out: pdftex could reach them through
// ../ on a desktop, but the engine's folder has no parent to put them in
export function viewFromWorkDir(
  mainFile: string,
  files: Map<string, string>,
  binaryFiles: Map<string, ArrayBuffer>
): WorkDirView {
  const dir = workDirOf(mainFile);
  return {
    dir,
    mainFile: mainFile.slice(dir.length),
    files: inside(dir, files),
    binaryFiles: inside(dir, binaryFiles)
  };
}

function inside<T>(dir: string, files: Map<string, T>): Map<string, T> {
  if (!dir) return files;
  const out = new Map<string, T>();
  for (const [path, content] of files) {
    if (path.startsWith(dir)) out.set(path.slice(dir.length), content);
  }
  return out;
}

// a path the way the compiler printed it, back to the path in the project
export function projectPath(dir: string, path: string): string {
  return dir + path.replace(/^\.\//, '');
}
