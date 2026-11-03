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

빌드 결과는 `build/<name>.js`이고, 아래 이름은 **바꾸면 안 된다**. 매니페스트, `public/*.html`, 번들된 pdfjs/foliate HTML, 런타임 `getURL()`/`executeScript()`가 이 이름을 그대로 참조한다.

| 출력 | 소스 | 로드 방식 | 형식 제약 |
|---|---|---|---|
| `background.js` | `src/background.js` | manifest `background.service_worker`(MV3) / `background.scripts`(FF MV2) | classic script(`type: module` 아님) |
| `contentScript.js` | `src/contentScript.js` | manifest `content_scripts`(all_frames, document_start), 설치 시 `scripting.executeScript`로 재주입 | classic script |
| `popup.js` + `popup.css` | `src/popup.js` | `popup.html` (`<link href="popup.css">`, `<script type=module>`) | CSS 파일명이 `popup.css`여야 함 |
| `subtitle.js` | `src/subtitle/subtitle.js` | content script가 `<script src>`로 page world에 주입 (web_accessible) | classic script, 확장 API 없음 |
| `googleDocInject.js` | `src/googleDoc/googleDocInject.js` | content script가 `<script src>`로 주입 (web_accessible) | classic script, 확장 API 없음 |
| `pdfInject.js` | `src/pdf/pdfInject.js` | `pdfjs/web/viewer.html`의 `<script src="../../pdfInject.js">` | classic script |
| `ebookEventInject.js` | `src/ebook/ebookEventInject.js` | `foliate-js/reader.html`의 `<script src="/ebookEventInject.js">` | classic script |
| `ocrIframe.js` | `src/ocr/ocrIframe.js` | `ocr.html` | |
| `offscreen.js` | `src/tts/offscreen.js` | `offscreen.html` (offscreen document, FF은 iframe) | |
| `opencvHandler.js` | `src/ocr/opencvHandler.js` | `opencvHandler.html` (manifest `sandbox` 페이지) | |

이외 `public/`의 정적 리소스(`tippy.css`, `_locales`, `icons`, `pdfjs`, `foliate-js`, `doq`, `tesseract`, `opencv`, `injectRightPan.js`, html들)는 그대로 `build/`로 복사된다(`.md`, `.map`, PDF.js 데모 PDF는 제외).

### 빌드 도구 (현행)

- 패키지 매니저: **pnpm** (`packageManager` 고정, `pnpm-workspace.yaml`의 `allowBuilds`로 install script 차단)
- 번들러: **Vite 8 (rolldown)**. `scripts/build.ts`가 위 10개 엔트리를 각각 독립 빌드한다(IIFE, 코드 스플리팅 없음). `public/`은 한 번만 필터 복사한다. `--firefox`이면 `manifest.firefox.json`을 `manifest.json`으로 교체한다. 엔트리 목록은 `vite.config.ts`의 `ENTRIES`에 있다.
- 테스트: **Vitest** (`__tests__/`). 네트워크 엔진 테스트는 CI에서 skip한다.
- 린트/포맷: **oxlint** (`.oxlintrc.json`), **oxfmt** (`.oxfmtrc.json`)
- 타입: `tsconfig.json` (`allowJs`, 점진 전환)

```bash
pnpm build          # build/ (Chrome/Edge MV3)
pnpm build-firefox  # build/ (Firefox MV2 manifest)
pnpm watch          # 개발 watch 빌드 (sourcemap, console 유지)
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
