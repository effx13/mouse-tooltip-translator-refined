# Engine icons

Most engine icons come from the [`simple-icons`](https://simpleicons.org) npm package (CC0-1.0), imported per icon in each engine's `meta.ts`. The brand logos remain trademarks of their owners and are shown only to identify the service.

| Engine | Icon |
| --- | --- |
| google, googleGTX, googleV2 | simple-icons `siGoogletranslate` |
| googleWeb, googleWebImage | simple-icons `siGoogle` |
| deepl | simple-icons `siDeepl` |
| papago | simple-icons `siNaver` (no Papago logo in simple-icons or on Wikimedia Commons) |
| baidu | simple-icons `siBaidu` |
| browserAPI | simple-icons `siGooglechrome` |
| kakao | simple-icons `siKakaotalk` |
| libreTranslate | simple-icons `siLibretranslate` |
| localLlm | letter tile "AI" (a generic OpenAI-compatible endpoint has no single brand) |

Files stored in this repository:

| File | Source | License |
| --- | --- | --- |
| `bing/icon.svg` | [File:Bing Fluent Logo.svg](https://commons.wikimedia.org/wiki/File:Bing_Fluent_Logo.svg) (Microsoft) | Public domain (Wikimedia Commons: below the threshold of originality), trademark of Microsoft |
| `yandex/icon.svg` | [File:Yandex Translate icon.svg](https://commons.wikimedia.org/wiki/File:Yandex_Translate_icon.svg) (Yandex LLC) | Public domain (Wikimedia Commons), trademark of Yandex |

Both files are unmodified apart from dropping `xml:space` (Bing) and replacing the fixed `width`/`height` with a `viewBox` (Yandex). They contain no scripts or external references and are rendered through `<img>`, so their gradient ids cannot clash with the page.
