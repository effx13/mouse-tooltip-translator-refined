# MouseTooltipTranslator — 기존 동작 명세 (재작성 기준 문서)

이 폴더는 **현재 구현이 무엇을 어떻게 하는지**를 정리한 문서다. 다음 재작성의 기준(스펙 겸 회귀 체크리스트)으로 쓴다.

- 팝업/설정 UI: Vue 3 + Vuetify + Pinia → **Svelte 5**(UI 프레임워크 없음)
- 전 코드: JS → **TypeScript**, `var` 같은 옛 문법 제거, jQuery·폴리필 제거
- 무거운/낡은 의존성은 모던하고 가벼운 것으로 교체
- 페이지에 주입하는 DOM(툴팁 등)은 **Shadow DOM**으로 옮겨 웹페이지 CSS와 격리

> 원칙: 재작성 결과는 이 문서에 적힌 **사용자 기능과 동작이 같아야 한다**. 동작을 바꾸려면 의도적으로, 이 문서에도 함께 반영한다.
> 각 문서의 "관찰된 버그/데드코드" 항목은 기록만 해 둔 것이다. 재작성 중에 조용히 고치지 말고, 고칠 때는 따로 결정한다.

## 문서 목록

| 문서 | 범위 |
|---|---|
| [content-script.md](content-script.md) | 페이지 주입 메인: 마우스오버/드래그 번역, 툴팁 lifecycle, 단축키, 페이지 번역, 하이라이트, Google Docs |
| [background-translation-tts.md](background-translation-tts.md) | 서비스워커 메시지 프로토콜, 컨텍스트 메뉴/옴니박스/커맨드, 번역 엔진·파이프라인, TTS, 음성 인식 |
| [subtitles.md](subtitles.md) | 이중 자막(YouTube/Netflix/SVT): 주입 모델, 요청 인터셉트, 병합, 캐시·실패 처리 |
| [pdf-ebook-ocr.md](pdf-ebook-ocr.md) | 번들 PDF.js 뷰어, foliate-js 이북 리더, 이미지 OCR(tesseract + opencv) |
| [popup-settings-ui.md](popup-settings-ui.md) | 팝업/설정 UI, 설정 스키마 전체 표, i18n, 기록/저장 단어, 플래시카드 |

## 아키텍처 한눈에 보기

```
┌────────────── 확장 페이지 ──────────────┐     ┌──────────── 웹페이지(모든 프레임) ────────────┐
│ popup.html → popup.js (설정/팝업 UI)     │     │ contentScript.js  (content script, 격리 world) │
│ offscreen.html → offscreen.js (오디오)   │     │   ├─ 툴팁(tippy), 마우스/선택/키 이벤트        │
│ ocr.html → ocrIframe.js (tesseract)      │     │   ├─ <script> 주입 → subtitle.js (page world)  │
│ opencvHandler.html (sandbox) → opencv…js │     │   ├─ <script> 주입 → googleDocInject.js        │
│ pdfjs/web/viewer.html → pdfInject.js     │     │   └─ iframe: ocr.html / opencvHandler.html     │
│ foliate-js/reader.html → ebookEvent…js   │     └────────────────────────────────────────────────┘
└──────────────────────────────────────────┘                    │ runtime.sendMessage
                     │ runtime.sendMessage                       ▼
                     └──────────────► background.js (MV3 service worker / FF MV2 background page)
                                        번역·TTS·기록·컨텍스트 메뉴·옴니박스·PDF 리다이렉트
```

### 진입점과 파일명 계약

빌드 도구는 **WXT**다. 진입점은 `src/entrypoints/`에 있다. 아래 출력 이름은 **바꾸면 안 된다**. 런타임 `getURL()`/`executeScript()`, 번들된 pdfjs/foliate HTML이 이 이름을 그대로 참조한다.

| 출력 | 진입점 → 실제 모듈 | 로드 방식 | 형식 제약 |
|---|---|---|---|
| `background.js` | `entrypoints/background.ts` → `src/background.js` | MV3 `background.service_worker` / FF MV2 `background.scripts` | IIFE |
| `content-scripts/content.js` + `.css` | `entrypoints/content.ts` → `src/contentScript.js` + `src/styles/tippy.css` | manifest `content_scripts`(all_frames, document_start, match_about_blank). 설치 시 background가 manifest를 읽어 `scripting.executeScript`/`insertCSS`로 재주입 | IIFE |
| `popup.html` | `entrypoints/popup.html` → `src/popup.js` | action popup + options_ui(`open_in_tab`) | ESM 청크 |
| `subtitle.js` | `entrypoints/subtitle.ts` → `src/subtitle/subtitle.js` | content script가 `<script src>`로 page world에 주입 (web_accessible) | IIFE, 확장 API 없음 |
| `googleDocInject.js` | `entrypoints/googleDocInject.ts` | content script가 `<script src>`로 주입 (web_accessible) | IIFE, 확장 API 없음 |
| `pdfInject.js` | `entrypoints/pdfInject.ts` | `pdfjs/web/viewer.html`의 `<script src="../../pdfInject.js">` | IIFE |
| `ebookEventInject.js` | `entrypoints/ebookEventInject.ts` | `foliate-js/reader.html`의 `<script src="/ebookEventInject.js">` | IIFE |
| `ocrFeature.js` | `entrypoints/ocrFeature.ts` → `src/ocr/ocrView.js` | **필요 시 주입**: OCR 키를 누른 채 이미지 위에 있을 때 `src/util/feature.js`가 background(`injectFeature` → `scripting.executeScript`, 해당 frame)에 요청. 확장 페이지(PDF 뷰어 등)에선 `<script>` 태그 | IIFE, content script와 같은 isolated world |
| `subtitleFeature.js` | `entrypoints/subtitleFeature.ts` → `src/subtitle/subtitle.js` | **필요 시 주입**: 영상 사이트(YouTube/nocookie/Netflix/SVT)이고 `detectSubtitle != "null"`일 때 | IIFE, content script와 같은 isolated world |
| `ocr.html` | `entrypoints/ocr.html` → `src/ocr/ocrIframe.js` | content script의 iframe (web_accessible) | ESM |
| `offscreen.html` | `entrypoints/offscreen.html` → `src/tts/offscreen.js` | offscreen document(FF은 iframe) | ESM |
| `opencvHandler.html` | `entrypoints/opencvHandler.sandbox.html` → `src/ocr/opencvHandler.js` | manifest `sandbox` 페이지, content script의 iframe | ESM + 클래식 `/opencv/opencv.js` |

매니페스트는 `wxt.config.ts`에서 브라우저별로 생성된다. `public/`의 정적 리소스(`_locales`, `icons`, `pdfjs`, `foliate-js`, `doq`, `tesseract`, `opencv`, `injectRightPan.js`)는 그대로 복사된다(`.md`, `.map`, PDF.js 데모 PDF는 제외).

### 빌드 도구 (현행)

- 패키지 매니저: **pnpm** (`packageManager` 고정, `pnpm-workspace.yaml`의 `allowBuilds`로 install script 차단)
- 프레임워크: **WXT 0.21** (Vite 8 / rolldown). 출력은 `.output/chrome-mv3`, `.output/firefox-mv2`
- 테스트: **Vitest** (`__tests__/`, `WxtVitest`). 네트워크 엔진 테스트는 CI에서 skip한다.
- 린트/포맷: **oxlint** (`.oxlintrc.json`, `no-undef` 포함), **oxfmt** (`.oxfmtrc.json`)
- 타입: `tsconfig.json` (`.wxt/tsconfig.json` 상속, `allowJs`, 점진 전환)

```bash
pnpm dev | pnpm build | pnpm build:firefox | pnpm zip | pnpm zip:firefox
pnpm test | pnpm lint | pnpm typecheck | pnpm format
```

### 메시지/컨텍스트 경계 요약

- content script, popup, 각 확장 페이지 → background: `runtime.sendMessage({type, data})`. 메시지 타입별 상세는 [background-translation-tts.md](background-translation-tts.md)에 있다.
- page world 스크립트(subtitle/googleDoc)에는 확장 API가 없다. content script와는 `window.postMessage` 계열로 통신한다([subtitles.md](subtitles.md) 참고).
- 프레임 간(OCR iframe, PDF 뷰어 등): `window-post-message-proxy`([pdf-ebook-ocr.md](pdf-ebook-ocr.md) 참고).
- 설정: `storage.local`(전체) + `storage.sync`(작은 키 미러). 변경은 `storage.onChanged`로 각 컨텍스트에 전파된다([popup-settings-ui.md](popup-settings-ui.md) 참고).

### 재작성 시 지켜야 할 기존 함정 (CLAUDE.md 요약)

- 로케일 `public/_locales/*/messages.json`은 직접 편집 금지 → `doc/insertLocale.py`의 `i18List`로만 추가한다.
- 설정 화면은 `setting_default.js` 스키마로 **자동 렌더**한다. 하드코딩하면 이후 설정 추가가 깨진다.
- 자막 인터셉트 핸들러 안에서는 `rawFetch`를 쓴다(재귀 방지). 병합 시 seg를 in-place로 변형하지 않는다.
- 주입 CSS는 확장 전용으로 스코프한다(#345). Shadow DOM으로 옮기면 이 문제가 근본적으로 사라진다.
- YouTube timedtext는 브라우저 세션 밖 요청을 차단한다. 반복 요청은 IP rate-limit을 유발한다.
