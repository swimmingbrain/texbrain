import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface Preferences {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  lineNumbers: boolean;
  vimMode: boolean;
  emacsMode: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
  previewDelay: number;
}

const defaults: Preferences = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: true,
  lineNumbers: true,
  vimMode: false,
  emacsMode: false,
  autoSave: true,
  autoSaveDelay: 2000,
  previewDelay: 500
};

function createPreferencesStore() {
  let initial = defaults;
  if (browser) {
    try {
      const stored = localStorage.getItem('texbrain-preferences');
      if (stored) initial = { ...defaults, ...JSON.parse(stored) };
    } catch {}
  }

  const { subscribe, set, update } = writable<Preferences>(initial);

  return {
    subscribe,
    set(value: Preferences) {
      set(value);
      if (browser) {
        localStorage.setItem('texbrain-preferences', JSON.stringify(value));
      }
    },
    update(fn: (prefs: Preferences) => Preferences) {
      update((current) => {
        const next = fn(current);
        if (browser) {
          localStorage.setItem('texbrain-preferences', JSON.stringify(next));
        }
        return next;
      });
    }
  };
}

export const preferences = createPreferencesStore();
