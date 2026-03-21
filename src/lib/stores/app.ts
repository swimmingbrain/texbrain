import { writable, derived } from 'svelte/store';

export const sidebarOpen = writable(true);
export const snippetPickerOpen = writable(false);
export const commandPaletteOpen = writable(false);
export const previewTab = writable<'preview' | 'errors' | 'warnings' | 'log'>('preview');
export const compileStatus = writable<'idle' | 'compiling' | 'success' | 'error'>('idle');
export const compileLog = writable<string[]>([]);
export const compileErrors = writable<Array<{ type: 'error' | 'warning'; message: string; line?: number; file?: string }>>([]);
export const toasts = writable<Array<{ id: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }>>([]);

let toastId = 0;
export function addToast(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3000) {
  const id = String(++toastId);
  toasts.update((t) => [...t, { id, message, type }]);
  if (duration > 0) {
    setTimeout(() => {
      toasts.update((t) => t.filter((toast) => toast.id !== id));
    }, duration);
  }
  return id;
}
