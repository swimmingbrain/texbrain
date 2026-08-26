import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html',
      precompress: false,
      strict: true
    }),
    paths: {
      base: ''
    },
    // the layout registers the worker itself, it also has to talk to it.
    // the tex live subset and the engine stay out of the worker's file
    // list, that is thousands of names it fetches on demand anyway
    serviceWorker: {
      register: false,
      files: (filepath) => !/(^|\/)(texlive|swiftlatex)\//.test(filepath)
    },
    // lets an open tab notice a new deploy, so the next navigation loads
    // the new build instead of asking for chunks that no longer exist
    version: {
      pollInterval: 60000
    }
  }
};

export default config;
