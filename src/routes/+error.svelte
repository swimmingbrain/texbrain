<script lang="ts">
  import { page } from '$app/stores';
</script>

<div style="padding: 40px; text-align: center; font-family: system-ui; color: #e8eaf2; background: #0c0d12; min-height: 100vh;">
  <h1 style="font-size: 48px; margin-bottom: 16px;">error</h1>
  <p style="font-size: 18px; color: #858a9e; margin-bottom: 8px;">status: {$page.status}</p>
  <p style="font-size: 16px; color: #f87171; margin-bottom: 32px;">{$page.error?.message}</p>
  <a href="/" style="color: #4a6cf7; font-size: 14px;">go back home</a>
</div>
