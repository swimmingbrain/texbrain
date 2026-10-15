import { describe, expect, test } from 'vitest';
import { projectPath, viewFromWorkDir, workDirOf } from './work-dir';

const text = (entries: Record<string, string>) => new Map(Object.entries(entries));
const binary = (...paths: string[]) => new Map(paths.map(p => [p, new ArrayBuffer(1)]));

describe('the compiler runs in the folder of the main file', () => {
  test('a main file at the top leaves the project as it is', () => {
    const files = text({ 'main.tex': '\\input{parts/a}', 'parts/a.tex': 'A' });
    const images = binary('figures/plot.png');
    const view = viewFromWorkDir('main.tex', files, images);
    expect(workDirOf('main.tex')).toBe('');
    expect(view.dir).toBe('');
    expect(view.mainFile).toBe('main.tex');
    expect(view.files).toBe(files);
    expect(view.binaryFiles).toBe(images);
  });

  test('a main file in a folder gets that folder as its root', () => {
    const files = text({
      'auftrag/master.tex': '\\input{0_setup/0x_setup}',
      'auftrag/0_setup/0x_setup.tex': '',
      'bericht/master.tex': '\\input{0_setup/0x_setup}',
      'bericht/0_setup/0x_setup.tex': '',
      'README.tex': ''
    });
    const images = binary('auftrag/2_media/logo.png', 'bericht/2_media/logo.png', 'auftrag.jpeg');
    const view = viewFromWorkDir('auftrag/master.tex', files, images);
    expect(view.dir).toBe('auftrag/');
    expect(view.mainFile).toBe('master.tex');
    expect([...view.files.keys()]).toEqual(['master.tex', '0_setup/0x_setup.tex']);
    expect([...view.binaryFiles.keys()]).toEqual(['2_media/logo.png']);
    expect(view.binaryFiles.get('2_media/logo.png')).toBe(images.get('auftrag/2_media/logo.png'));
  });

  test('a folder whose name starts like another is not mistaken for it', () => {
    const files = text({ 'doc/main.tex': '', 'docs/other.tex': '', 'doc2/x.tex': '' });
    const view = viewFromWorkDir('doc/main.tex', files, binary());
    expect([...view.files.keys()]).toEqual(['main.tex']);
  });

  test('nested folders keep their path below the main file', () => {
    const files = text({ 'a/b/main.tex': '', 'a/b/c/d.tex': '', 'a/x.tex': '' });
    const view = viewFromWorkDir('a/b/main.tex', files, binary());
    expect(view.dir).toBe('a/b/');
    expect([...view.files.keys()]).toEqual(['main.tex', 'c/d.tex']);
  });

  test('a name the compiler printed goes back to the project path', () => {
    expect(projectPath('auftrag/', '0_setup/0x_setup.tex')).toBe('auftrag/0_setup/0x_setup.tex');
    expect(projectPath('auftrag/', './master.tex')).toBe('auftrag/master.tex');
    expect(projectPath('', 'main.tex')).toBe('main.tex');
  });
});
