# Mouse Tooltip Translator Refined

Hover or select text on any page to see its translation in a tooltip.

![Tooltip over an article](docs/screenshots/tooltip-hover.png)

## Features

- Translate a word, sentence or paragraph on hover, or whatever you select
- Translate what you type in a text field (Right Alt)
- Translate the whole page with a shortcut
- Built-in PDF viewer and ebook reader (EPUB, MOBI, FB2, CBZ) with the same tooltips
- Google, Bing, DeepL, Yandex, Baidu, Papago, the browser's built-in translator, or any OpenAI-compatible LLM
- Per-site target language, site and language exclusions, settings sync

| Settings | PDF viewer |
| --- | --- |
| ![Settings](docs/screenshots/settings-light.png) | ![PDF viewer](docs/screenshots/pdf-viewer.png) |

## Usage

| Action | Default |
| --- | --- |
| Translate | Hover or select text |
| Translate the text you're typing | <kbd>Right Alt</kbd> |
| Translate the page | Off (set a key in Settings → Keyboard) |
| Copy translated / source text | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>6</kbd> / <kbd>7</kbd> |
| Translate from the address bar | Type `/`, a space, then your text |

See [docs/intro.md](docs/intro.md) for details.

## Development

Requires Node 22.18+ and pnpm.

```sh
pnpm install
pnpm dev              # Chrome with the extension loaded, auto-reload
pnpm build            # .output/chrome-mv3
pnpm build:firefox    # .output/firefox-mv2
pnpm test             # unit tests
pnpm test:e2e         # end-to-end tests (headless Chromium)
pnpm screenshots      # regenerate docs/screenshots
```

Load `.output/chrome-mv3` from `chrome://extensions` with Developer mode on.

## Credits

Based on [MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator) by ttop32 and its contributors.

## License

[MIT](LICENSE)
