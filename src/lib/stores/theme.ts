import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'dark' | 'light';

function createThemeStore() {
  const stored = browser ? localStorage.getItem('texbrain-theme') as Theme : null;
  const initial: Theme = stored || 'dark';
  const { subscribe, set, update } = writable<Theme>(initial);

  if (browser) {
    document.documentElement.setAttribute('data-theme', initial);
  }

  return {
    subscribe,
    set(value: Theme) {
      set(value);
      if (browser) {
        localStorage.setItem('texbrain-theme', value);
        document.documentElement.setAttribute('data-theme', value);
      }
    },
    toggle() {
      update((current) => {
        const next = current === 'dark' ? 'light' : 'dark';
        if (browser) {
          localStorage.setItem('texbrain-theme', next);
          document.documentElement.setAttribute('data-theme', next);
        }
        return next;
      });
    }
  };
}

export const theme = createThemeStore();
