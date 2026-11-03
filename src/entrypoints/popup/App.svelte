<script lang="ts">
  import AboutView from "./AboutView.svelte";
  import SettingsView from "./SettingsView.svelte";

  let hash = $state(location.hash);
  const route = $derived(hash.replace(/^#/, "") || "/");

  function back() {
    if (history.length > 1) history.back();
    else location.hash = "";
  }
</script>

<svelte:window onhashchange={() => (hash = location.hash)} />

<div class="shell">
  {#key route}
    <div class="view">
      {#if route === "/about"}
        <AboutView onback={back} />
      {:else}
        <SettingsView onabout={() => (location.hash = "#/about")} />
      {/if}
    </div>
  {/key}
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: var(--app-height);
    max-width: var(--app-max-width);
    margin: 0 auto;
    background: var(--surface);
    box-shadow: var(--app-shadow);
  }
  .view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    animation: fade 0.15s ease-out;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
</style>
