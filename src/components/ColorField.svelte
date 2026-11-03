<script lang="ts">
  import { Input } from "@/components/ui/input";
  import { Slider } from "@/components/ui/slider";
  import { t } from "@/utils/i18n";
  import FieldLabel from "./FieldLabel.svelte";

  let {
    id,
    label,
    value,
    onchange,
  }: { id: string; label: string; value: string; onchange: (value: string) => void } = $props();

  const HEX = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i;

  const rgb = $derived(HEX.test(value) ? value.slice(0, 7).toLowerCase() : "#000000");
  const alpha = $derived(
    HEX.test(value) && value.length === 9 ? Number.parseInt(value.slice(7), 16) : 255,
  );
  const dir = document.documentElement.dir === "rtl" ? "rtl" : "ltr";

  let focused = $state(false);
  let draft = $state("");
  $effect(() => {
    if (!focused) draft = value;
  });

  // opaque colors are stored as #RRGGBB, translucent ones as #RRGGBBAA
  function compose(nextRgb: string, nextAlpha: number) {
    const a = Math.round(Math.min(255, Math.max(0, nextAlpha)));
    return a === 255 ? nextRgb : nextRgb + a.toString(16).padStart(2, "0");
  }
</script>

<div class="grid gap-1.5">
  <FieldLabel {id} {label} />
  <div class="flex items-center gap-3">
    <span
      class="swatch relative size-9 shrink-0 overflow-hidden rounded-md border shadow-xs"
      style:--swatch={value}
    >
      <input
        type="color"
        class="absolute inset-0 size-full cursor-pointer opacity-0"
        aria-label={label}
        value={rgb}
        oninput={(e) => onchange(compose(e.currentTarget.value, alpha))}
      />
    </span>
    <Input
      {id}
      class="w-28 shrink-0 font-mono"
      maxlength={9}
      spellcheck="false"
      autocomplete="off"
      value={draft}
      onfocus={() => (focused = true)}
      onblur={() => (focused = false)}
      oninput={(e) => {
        const text = e.currentTarget.value.replace(/[^#0-9a-f]/gi, "");
        draft = text.startsWith("#") ? text : `#${text}`;
        e.currentTarget.value = draft;
        if (HEX.test(draft)) onchange(draft.toLowerCase());
      }}
    />
    <Slider
      type="single"
      class="min-w-16 flex-1"
      min={0}
      max={255}
      step={1}
      {dir}
      aria-label="{label} {t('Alpha')}"
      value={alpha}
      onValueChange={(next) => onchange(compose(rgb, next))}
    />
    <span class="w-10 shrink-0 text-end text-xs text-muted-foreground tabular-nums">
      {Math.round((alpha / 255) * 100)}%
    </span>
  </div>
</div>

<style>
  .swatch {
    background:
      linear-gradient(var(--swatch), var(--swatch)),
      repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 10px 10px;
  }
</style>
