# Store listing

Text for the Chrome Web Store, Edge Add-ons and Firefox Add-ons. Screenshots are in [screenshots/](screenshots) (1280×800).

## Name

Mouse Tooltip Translator Refined

## Short description (≤ 132 characters)

Hover or select text to translate it in a tooltip. Also works in PDF and ebook files.

## Description

Translate any text on the web by pointing at it.

Hover over a word, a sentence or a paragraph, or select what you want, and the translation shows up in a small tooltip right next to it. Nothing else on the page changes.

Features
- Translate on hover or on selection
- Translate what you type in a text field with one key
- Translate a whole page with a shortcut
- Built-in PDF viewer and ebook reader (EPUB, MOBI, FB2, CBZ) with the same tooltips
- Google, Bing, DeepL, Papago, Yandex, Baidu, Kakao, LibreTranslate, the browser's built-in translator, or any OpenAI-compatible LLM
- Use your own API keys, and let engines fall back to the next one in your order
- Per-site target language, site and language exclusions, keyboard shortcuts
- Available in English, Korean, Japanese, Chinese, Spanish, French, German, Portuguese and Russian

About this extension
This is an independent fork of Mouse Tooltip Translator by ttop32, rewritten from scratch. It is not affiliated with or endorsed by the original project. Source code: https://github.com/effx13/mouse-tooltip-translator-refined

Privacy
The text you translate is sent only to the translation engines you enable. Settings and the translation cache stay in your browser. Privacy policy: https://github.com/effx13/mouse-tooltip-translator-refined/blob/main/docs/privacy.md

## 설명 (한국어)

웹에서 텍스트를 가리키기만 하면 번역합니다.

단어나 문장, 문단에 마우스를 올리거나 원하는 부분을 선택하면 바로 옆에 작은 툴팁으로 번역이 나옵니다. 페이지의 다른 부분은 바뀌지 않습니다.

기능
- 마우스오버 또는 선택으로 번역
- 입력창에 쓴 글을 키 하나로 번역
- 단축키로 페이지 전체 번역
- 같은 툴팁이 동작하는 내장 PDF 뷰어와 이북 리더(EPUB, MOBI, FB2, CBZ)
- Google, Bing, DeepL, 파파고, Yandex, Baidu, 카카오, LibreTranslate, 브라우저 내장 번역, OpenAI 호환 LLM
- 직접 발급한 API 키 사용, 정한 순서대로 다음 엔진으로 자동 전환
- 사이트별 번역 언어, 사이트·언어 제외, 단축키
- 영어, 한국어, 일본어, 중국어, 스페인어, 프랑스어, 독일어, 포르투갈어, 러시아어 지원

이 확장에 대해
ttop32의 Mouse Tooltip Translator를 기반으로 처음부터 다시 만든 독립 포크입니다. 원작 프로젝트와는 관련이 없으며 원작자의 보증을 받지 않았습니다. 소스 코드: https://github.com/effx13/mouse-tooltip-translator-refined

## Single purpose (Chrome)

Translate text that the user points at or selects on web pages, PDFs and ebooks, and show the translation in a tooltip.

## Permission justifications

| Permission | Why |
| --- | --- |
| Host access to all sites | The tooltip has to read the text under the cursor on whatever page the user is reading, and translation requests go to the engine the user picked. |
| `storage` | Saves the user's settings and engine order. |
| `tabs` | Finds the active tab to copy the last translation with the keyboard shortcut and to inject the tooltip into already open tabs after install. |
| `scripting` | Injects the tooltip into tabs that were open before the extension was installed or updated. |
| `contextMenus` | Adds the "Copy translation" item to the right-click menu. |
| `search` | Runs a search with the translated text from the address bar shortcut (`/` + text). |
| `fontSettings` (Chrome) | Lists installed fonts so the user can choose the tooltip font. |
| `webRequest`, `webRequestBlocking` (Firefox) | Opens web PDFs in the built-in viewer instead of Firefox's own viewer, where the tooltip can't run. |

Remote code: none. All code is bundled with the extension; translation requests only exchange text.

## Data usage (Chrome privacy practices)

- Collects: website content (the text the user hovers, selects or types for translation).
- Use: sent to the translation service the user enabled, only to produce the translation.
- Not sold, not used for anything unrelated to translation, not used for creditworthiness or lending.

## Firefox source code

AMO needs the source because the build is minified. Upload `.output/*-sources.zip` with these build steps:

```sh
pnpm install
pnpm build:firefox   # output: .output/firefox-mv2
```

Requires Node 22.18+ and pnpm (version pinned in package.json).
