<script lang="ts">
  import { t } from "@/utils/i18n";
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

<div class="field">
  <label class="field-label" for={id}>{label}</label>
  <div class="color-row">
    <span class="swatch" style:--swatch={value}>
      <input
        type="color"
        aria-label={label}
        value={rgb}
        oninput={(e) => onchange(compose(e.currentTarget.value, alpha))}
      />
    </span>
    <input
      {id}
      class="hex"
      type="text"
      maxlength="9"
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
    <input
      class="alpha"
      type="range"
      min="0"
      max="255"
      aria-label="{label} {t('Alpha')}"
      value={alpha}
      oninput={(e) => onchange(compose(rgb, Number(e.currentTarget.value)))}
    />
    <span class="alpha-value">{Math.round((alpha / 255) * 100)}%</span>
  </div>
</div>

<style>
  .color-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .swatch {
    position: relative;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    overflow: hidden;
    box-shadow: 0 2px 6px rgb(0 0 0 / 0.35);
    background:
      linear-gradient(var(--swatch), var(--swatch)),
      repeating-conic-gradient(#bbb 0 25%, #fff 0 50%) 0 0 / 10px 10px;
  }
  .swatch input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    border: 0;
    padding: 0;
  }
  .hex {
    width: 6.5em;
    font-family: ui-monospace, monospace;
  }
  .alpha {
    flex: 1;
    min-width: 60px;
    accent-color: var(--primary);
  }
  .alpha-value {
    width: 3em;
    text-align: end;
    font-size: 0.8125rem;
    opacity: 0.75;
  }
</style>
