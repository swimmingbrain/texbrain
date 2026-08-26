<script lang="ts">
  import '../app.css';
  import Toast from '$lib/ui/Toast.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { beforeNavigate } from '$app/navigation';
  import { updated } from '$app/state';
  import { preferences } from '$lib/stores/preferences';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  // after a deploy the chunks this tab knows about are gone from the server.
  // a full page load on the next navigation picks up the new build instead
  // of failing on a missing file
  beforeNavigate(({ willUnload, to }) => {
    if (updated.current && !willUnload && to?.url) {
      location.href = to.url.href;
    }
  });

  onMount(() => {
    if (browser && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});

      // keep the service worker's texlive mirror config in sync
      const unsubscribe = preferences.subscribe((prefs) => {
        navigator.serviceWorker.ready
          .then((reg) => reg.active?.postMessage({ type: 'texlive-config', mirror: prefs.texliveMirror }))
          .catch(() => {});
      });
      return () => unsubscribe();
    }
  });
</script>

{@render children()}
<Toast />
