import { writable, derived } from 'svelte/store';
import type { Problem } from '$lib/compiler/log';

export const sidebarOpen = writable(true);
export const previewOpen = writable(true);
export const snippetPickerOpen = writable(false);
export const commandPaletteOpen = writable(false);
export const cloneDialogOpen = writable(false);
export const previewTab = writable<'preview' | 'problems' | 'log'>('preview');
export const compileStatus = writable<'idle' | 'compiling' | 'success' | 'error'>('idle');
export const compileLog = writable<string[]>([]);
// everything the engine printed, untouched, for the people who want it all
export const compileRawLog = writable('');
export const compileProblems = writable<Problem[]>([]);
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
