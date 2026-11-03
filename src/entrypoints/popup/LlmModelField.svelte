<script lang="ts">
  import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
  import TextField from "@/components/TextField.svelte";
  import { Button } from "@/components/ui/button";
  import { fetchLlmModels } from "@/translators/localLlm";
  import { t } from "@/utils/i18n";

  let {
    id,
    label,
    value,
    provider,
    endpoint,
    apiKey,
    oninput,
    onerror,
  }: {
    id: string;
    label: string;
    value: string;
    provider: string;
    endpoint: string;
    apiKey: string;
    oninput: (value: string) => void;
    onerror: (message: string) => void;
  } = $props();

  let fetched = $state<{ source: string; models: string[] }>({ source: "", models: [] });
  let loading = $state(false);

  // a different provider/endpoint has a different model list
  const source = $derived(`${provider}|${endpoint}`);
  const models = $derived(fetched.source === source ? fetched.models : []);

  async function refresh() {
    if (!endpoint) {
      onerror(t("API_endpoint_is_empty"));
      return;
    }
    loading = true;
    try {
      const requested = source;
      const list = await fetchLlmModels({ provider, endpoint, apiKey });
      fetched = { source: requested, models: list };
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

<TextField {id} {label} {value} list="{id}-models" {oninput}>
  {#snippet append()}
    <Button
      variant="ghost"
      size="icon"
      title={t("Fetch_models_from_endpoint")}
      aria-label={t("Fetch_models_from_endpoint")}
      disabled={loading}
      onclick={refresh}
    >
      <RefreshCwIcon class={loading ? "animate-spin" : ""} />
    </Button>
  {/snippet}
</TextField>
<datalist id="{id}-models">
  {#each models as model (model)}
    <option value={model}></option>
  {/each}
</datalist>
