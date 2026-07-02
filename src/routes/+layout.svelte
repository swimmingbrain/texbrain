<script lang="ts">
  import '../app.css';
  import Toast from '$lib/ui/Toast.svelte';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { preferences } from '$lib/stores/preferences';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    if (browser && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});

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
