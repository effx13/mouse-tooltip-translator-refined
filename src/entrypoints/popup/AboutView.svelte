<script lang="ts">
  import { browser } from "wxt/browser";
  import Icon, { type IconName } from "@/components/Icon.svelte";
  import { t } from "@/utils/i18n";

  let { onback }: { onback: () => void } = $props();

  const REPO = "https://github.com/effx13/MouseTooltipTranslator";

  interface Entry {
    name: string;
    sub: string;
    icon: IconName;
    color: string;
    url: string;
  }

  const entries: Entry[] = [
    {
      name: "How_to_use",
      sub: "Check_how_to_use_this_extension",
      icon: "info",
      color: "#43a047",
      url: `${REPO}/blob/main/doc/intro.md#how-to-use`,
    },
    {
      name: "PDF_Viewer",
      sub: "Translate_local_PDF_file",
      icon: "pdf",
      color: "#e53935",
      url: `${browser.runtime.getURL("/pdfjs/web/viewer.html")}?file=/pdf_demo.pdf`,
    },
    {
      name: "Ebook_Reader",
      sub: "Translate_local_ebook_file",
      icon: "book",
      color: "#fb8c00",
      url: browser.runtime.getURL("/foliate-js/reader.html"),
    },
    {
      name: "Source_code",
      sub: "Check_source_code_in_github",
      icon: "code",
      color: "#424242",
      url: REPO,
    },
    {
      name: "Privacy_Policy",
      sub: "User_privacy_policy",
      icon: "shield",
      color: "#d32f2f",
      url: `${REPO}/blob/main/doc/privacy_policy.md`,
    },
  ];

  const version = browser.runtime.getManifest().version;
</script>

<header class="hero" style:--hero="url({browser.runtime.getURL('/floating-maple-leaf.jpg')})">
  <button type="button" class="icon-btn" aria-label={t("Back")} onclick={onback}>
    <Icon name="back" size={24} />
  </button>
  <h1>Mouse Tooltip Translator</h1>
</header>

<main class="content">
  <ul>
    {#each entries as entry (entry.name)}
      <li>
        <button
          type="button"
          class="entry"
          onclick={() => void browser.tabs.create({ url: entry.url })}
        >
          <span class="avatar" style:background={entry.color}><Icon name={entry.icon} /></span>
          <span class="text">
            <span class="name">{t(entry.name)}</span>
            <span class="sub">{t(entry.sub)}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
  <p class="version">v{version}</p>
</main>

<style>
  .hero {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 160px;
    padding: 8px 16px 16px 8px;
    background:
      linear-gradient(rgb(0 0 0 / 0.15), rgb(0 0 0 / 0.55)),
      var(--hero) center / cover;
    color: #fff;
  }
  .hero .icon-btn {
    color: inherit;
  }
  :global([dir="rtl"]) .hero .icon-btn :global(svg) {
    transform: scaleX(-1);
  }
  h1 {
    margin: 0 0 0 8px;
    font-size: 1.5rem;
    font-weight: 500;
  }
  .content {
    flex: 1;
    overflow-y: auto;
  }
  ul {
    margin: 0;
    padding: 8px 0;
    list-style: none;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    padding: 10px 16px;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: pointer;
  }
  .entry:hover,
  .entry:focus-visible {
    background: var(--hover);
  }
  .avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    color: #fff;
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .sub {
    font-size: 0.8125rem;
    opacity: 0.7;
  }
  .version {
    margin: 8px 16px 16px;
    font-size: 0.8125rem;
    opacity: 0.6;
  }
</style>
