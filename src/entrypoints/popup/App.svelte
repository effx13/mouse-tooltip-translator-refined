<script lang="ts">
  import { Toaster } from "@/components/ui/sonner";
  import AboutView from "./AboutView.svelte";
  import SettingsView from "./SettingsView.svelte";

  let hash = $state(location.hash);
  const route = $derived(hash.replace(/^#/, "") || "/");
  const dir = document.documentElement.dir === "rtl" ? "rtl" : "ltr";

  function back() {
    if (history.length > 1) history.back();
    else location.hash = "";
  }
</script>

<svelte:window onhashchange={() => (hash = location.hash)} />

<div class="min-[600px]:min-h-screen min-[600px]:bg-page min-[600px]:py-6">
  <div
    class="mx-auto flex h-[600px] flex-col overflow-hidden bg-background min-[600px]:h-[calc(100vh-3rem)] min-[600px]:max-w-3xl min-[600px]:rounded-xl min-[600px]:border min-[600px]:shadow-sm"
  >
    {#key route}
      <div class="flex min-h-0 flex-1 flex-col animate-in duration-150 fade-in-0">
        {#if route === "/about"}
          <AboutView onback={back} />
        {:else}
          <SettingsView onabout={() => (location.hash = "#/about")} />
        {/if}
      </div>
    {/key}
  </div>
</div>

<Toaster position="bottom-center" {dir} />
