# MouseTooltipTranslator

Hover or select text to translate it in a tooltip. A lightweight rewrite (WXT + Svelte 5 + TypeScript) of [ttop32/MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator).

![result](doc/result1532.gif)

## Features

- Mouseover (word / sentence / paragraph) and selection translation in a tooltip isolated from the page (Shadow DOM)
- Translate what you are typing in an input box (right Alt by default)
- Translate a whole page with a hotkey
- Built-in PDF viewer (PDF.js) and EPUB reader with tooltips; web PDFs can open in it automatically
- Engines: Google, Bing, DeepL, Yandex, Baidu, Papago, browser built-in API, Google variants, and any OpenAI-compatible LLM (OpenAI, Claude, Gemini, Groq, OpenRouter, Ollama, LM Studio, ...)
- Per-site target language, site/language exclusion, keyboard shortcuts, settings sync

[How to use](https://github.com/effx13/MouseTooltipTranslator/blob/main/doc/intro.md#how-to-use) · [Privacy policy](https://github.com/effx13/MouseTooltipTranslator/blob/main/doc/privacy_policy.md)

## Build

Requires Node 22.18+ and pnpm.

```console
git clone https://github.com/effx13/MouseTooltipTranslator.git
cd MouseTooltipTranslator
pnpm install
pnpm build            # Chrome/Edge -> .output/chrome-mv3
pnpm build:firefox    # Firefox     -> .output/firefox-mv2
pnpm dev              # dev mode with auto reload
```

Load `.output/chrome-mv3` as an unpacked extension (`chrome://extensions` → Developer mode → Load unpacked).

## Credits

Based on [MouseTooltipTranslator](https://github.com/ttop32/MouseTooltipTranslator) by ttop32 and its [contributors](https://github.com/ttop32/MouseTooltipTranslator/graphs/contributors). Translations by the project's Crowdin contributors.

## License

[MIT](LICENSE)
