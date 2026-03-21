<script lang="ts">
  import '../app.css';
  import Toast from '$lib/ui/Toast.svelte';
  import { theme } from '$lib/stores/theme';
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();

  onMount(() => {
    document.documentElement.setAttribute('data-theme', get(theme));

    if (browser && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  });
</script>

{@render children()}
<Toast />
