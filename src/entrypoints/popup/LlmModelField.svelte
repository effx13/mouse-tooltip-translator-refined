<script lang="ts">
  import { t } from "@/utils/i18n";
  import Icon from "@/components/Icon.svelte";
  import TextField from "@/components/TextField.svelte";
  import { fetchLlmModels } from "@/translators/localLlm";
  import { store } from "./state.svelte";

  let {
    id,
    label,
    oninput,
    onerror,
  }: {
    id: string;
    label: string;
    oninput: (value: string) => void;
    onerror: (message: string) => void;
  } = $props();

  let models = $state<string[]>([]);
  let loading = $state(false);

  // a different provider/endpoint has a different model list
  const source = $derived(`${store.settings.llmProvider}|${store.settings.llmApiEndpoint}`);
  $effect(() => {
    void source;
    models = [];
  });

  async function refresh() {
    const { llmProvider: provider, llmApiEndpoint: endpoint, llmApiKey: apiKey } = store.settings;
    if (!endpoint) {
      onerror(t("API_endpoint_is_empty"));
      return;
    }
    loading = true;
    try {
      const list = await fetchLlmModels({ provider, endpoint, apiKey });
      models = list;
      if (!list.length) onerror(t("No_models_returned_by_endpoint"));
    } catch (error) {
      onerror(
        `${t("Failed_to_fetch_LLM_models")}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      loading = false;
    }
  }
</script>

<TextField {id} {label} value={store.settings.llmModel ?? ""} list="{id}-models" {oninput}>
  {#snippet append()}
    <button
      type="button"
      class="icon-btn"
      class:spin={loading}
      title={t("Fetch_models_from_endpoint")}
      aria-label={t("Fetch_models_from_endpoint")}
      disabled={loading}
      onclick={refresh}
    >
      <Icon name="refresh" />
    </button>
  {/snippet}
</TextField>
<datalist id="{id}-models">
  {#each models as model (model)}
    <option value={model}></option>
  {/each}
</datalist>

<style>
  .spin :global(svg) {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
