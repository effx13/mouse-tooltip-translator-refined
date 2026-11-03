<script lang="ts">
  let {
    id,
    label,
    checked,
    onchange,
  }: { id: string; label: string; checked: boolean; onchange: (value: boolean) => void } = $props();
</script>

<label class="toggle" for={id}>
  <span class="toggle-label">{label}</span>
  <input
    {id}
    type="checkbox"
    role="switch"
    {checked}
    onchange={(e) => onchange(e.currentTarget.checked)}
  />
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
</label>

<style>
  .toggle {
    display: flex;
    align-items: center;
    gap: 12px;
    cursor: pointer;
    min-height: 36px;
  }
  .toggle-label {
    flex: 1;
  }
  input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .track {
    position: relative;
    flex: none;
    width: 36px;
    height: 20px;
    border-radius: 10px;
    background: var(--track);
    transition: background 0.15s;
  }
  .thumb {
    position: absolute;
    top: 2px;
    inset-inline-start: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    transition: transform 0.15s;
  }
  input:checked + .track {
    background: var(--primary);
  }
  input:checked + .track .thumb {
    transform: translateX(16px);
  }
  :global([dir="rtl"]) input:checked + .track .thumb {
    transform: translateX(-16px);
  }
  input:focus-visible + .track {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }
</style>
