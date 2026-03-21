import type { HandleClientError } from '@sveltejs/kit';

export const handleError: HandleClientError = ({ error, status, message }) => {
  const err = error as Error;
  console.error('client error:', err);

  // display error overlay on the page
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;padding:20px;background:#1a0000;color:#f87171;font-family:monospace;font-size:13px;white-space:pre-wrap;border-bottom:2px solid #f87171;max-height:50vh;overflow:auto;';
  el.textContent = `[texbrain error] ${status}: ${message}\n\n${err?.stack || err}`;
  document.body.prepend(el);

  return { message: err?.message || message };
};
