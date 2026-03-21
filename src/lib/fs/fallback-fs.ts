export function openFileFallback(): Promise<{ name: string; content: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.tex,.bib,.sty,.cls,.txt';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const content = await file.text();
      resolve({ name: file.name, content });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export function saveFileFallback(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/x-latex' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
