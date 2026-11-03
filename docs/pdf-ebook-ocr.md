# PDF 뷰어 · 이북 리더 · OCR — 현행 동작 명세 (재작성용 회귀 체크리스트)

> 범위: `src/pdf/pdfInject.js`, `public/pdfjs/web/viewer.html`(우리 수정분), `public/doq`, `public/injectRightPan.js`,
> `src/ebook/ebookEventInject.js`, `public/foliate-js/reader.html`·`reader.js`(통합 지점), `src/ocr/ocrView.js`,
> `src/ocr/ocrIframe.js`, `src/ocr/opencvHandler.js`, `public/ocr.html`, `public/opencvHandler.html`,
> `public/tesseract/*`, `public/opencv/*`, 그리고 이들로 라우팅하는 `contentScript.js` / `background.js` /
> `src/pages/about.vue` / `src/util/index.js` / `src/util/setting_default.js`.
>
> 기준: 현재 워킹 트리(브랜치 `chore/modernize-tooling`). `pdfInject.js`·`ocrView.js`의 미커밋 diff는
> 정규식 표기만 바뀐 것(`/^file:\/\//.test(url)` → `String(url).startsWith("file://")`, 문자 클래스 이스케이프 정리)으로 의미상 동일하다.
> 단, `startsWith`는 `url`이 `null`일 때 `"null"`로 문자열화되어 false — 기존 정규식도 `null`→`"null"`로 false라 동일.
>
> 표기: **[관찰]** = 현존 버그/데드코드로 보이는 것(수정 제안 아님, 관찰만). **[추정]/[미검증]** = 소스만으로 확정 못 한 런타임 동작.

---

## 0. 빌드 산출물 / 파일 이름 불변식

`vite.config.ts`의 `ENTRIES`가 모든 엔트리를 **IIFE 단일 파일**로 `build/<name>.js`에 낸다. 이름이 HTML/manifest/런타임에 하드코딩되어 있으므로 바꾸면 안 된다.

| 엔트리 | 소스 | 출력 | 참조하는 곳 |
|---|---|---|---|
| `pdfInject` | `src/pdf/pdfInject.js` | `build/pdfInject.js` | `pdfjs/web/viewer.html` `<script src="../../pdfInject.js">` |
| `ebookEventInject` | `src/ebook/ebookEventInject.js` | `build/ebookEventInject.js` | `foliate-js/reader.html` `<script src="/ebookEventInject.js">` |
| `ocrIframe` | `src/ocr/ocrIframe.js` | `build/ocrIframe.js` | `ocr.html` `<script type="module" src="ocrIframe.js">` (IIFE지만 module 태그로 로드됨 — 동작에 문제 없음) |
| `opencvHandler` | `src/ocr/opencvHandler.js` | `build/opencvHandler.js` | `opencvHandler.html` `<script type="module" src="opencvHandler.js">` |
| `contentScript` | `src/contentScript.js` | `build/contentScript.js` | manifest content_scripts + viewer.html + reader.html 에서 **직접 `<script>`로도** 로드 |

`scripts/build.ts`가 `public/`을 `build/`로 복사하며 `PUBLIC_EXCLUDE = ["compressed.tracemonkey-pldi-09.pdf", ".md", ".map"]`를 제외한다.
→ PDF.js 기본 문서(`defaultUrl = "compressed.tracemonkey-pldi-09.pdf"`)는 **빌드에 없다**(아래 §2.7 참고). `.md` 제외로 `public/doq/README.md` 등도 빠진다.

---

## 1. 진입 경로 / 라우팅

### 1.1 Chrome — 웹 PDF 하이재킹 (`contentScript.detectPDF`)
- 콘텐츠 스크립트(`run_at: document_start`, `all_frames: true`, `match_about_blank: true`) 초기화 순서:
  `injectGoogleDocAnnotation` → `bindBookFusionIframe` → `loadDestructor` → `await getSetting()` → `checkExcludeUrl()`(제외 URL이면 종료) → `await dom_util.waitJquery()` → **`if (detectPDF()) return;`** → (이하 일반 툴팁 초기화).
- `detectPDF()`:
  - 조건: `setting["detectPDF"] == "true"` **그리고** `util.isPDF()`.
  - `isPDF()` = `document.contentType == "application/pdf"` **또는** `document.body.children[0].type == "application/pdf"`(옛 Chrome의 `<embed>` 폴백). 최신 Chrome은 body가 비어 있고 내부 viewer guest로 그리므로 contentType이 신뢰 신호(주석의 `#pdf-hijack`).
  - 참이면 `openPdfIframe(window.location.href)` 후 `util.addFrameListener("pdfErrorLoadDocument", openPdfIframeBlob)` 등록, `true` 반환 → 이 래퍼 문서에는 툴팁 스택을 **설치하지 않는다**(뷰어가 자체 contentScript.js를 로드하므로).
  - `all_frames: true` 때문에 **iframe 안에 임베드된 PDF도** 같은 방식으로 하이재킹된다.
- `openPdfIframe(url)`:
  - `viewer = util.getPDFUrl(url)` = `browser.runtime.getURL("/pdfjs/web/viewer.html?file=" + encodeURIComponent(url))` (#11: `&` 잘림 방지용 인코딩).
  - `document.open(); document.write(...); document.close();` 로 문서 전체를 교체:
    ```html
    <!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;height:100%;background:#fff;overflow:hidden}#mttPdfIframe{border:0;display:block;width:100vw;height:100vh}</style></head><body><iframe id="mttPdfIframe" allow="clipboard-write; clipboard-read"></iframe></body></html>
    ```
  - `src`는 write 이후 `document.getElementById("mttPdfIframe").src = viewer`로 설정(HTML 이스케이프 회피).
  - 효과: Chrome 네이티브 PDF guest가 제거되고, **주소창은 원래 .pdf URL 그대로**, 뷰어는 자식 frame.
  - `allow="clipboard-write; clipboard-read"`는 "Copy PDF URL"(§2.4)이 iframe 안에서 `navigator.clipboard.writeText`를 쓰기 위해 필요.
- 블롭 폴백 `openPdfIframeBlob()`: 뷰어에서 `documenterror` → `pdfErrorLoadDocument` postMessage(§2.2) 수신 시
  `util.getBlobUrl(location.href)`(래퍼 페이지 = PDF 원 출처에서 `fetch` → `URL.createObjectURL`) → `openPdfIframe(blobUrl)`로 재마운트. CORS/인증 걸린 PDF용.
  - 주석: 리스너는 `openPdfIframe` **뒤에** 등록해야 함(`document.open`이 리스너를 날릴 수 있음).
  - [추정] 블롭 폴백 재마운트 시 다시 `document.open`이 호출되므로 이후 두 번째 실패는 잡히지 않을 가능성이 높다(무한 루프는 없음). 래퍼 출처의 `blob:` URL을 확장 출처 뷰어가 fetch할 수 있는지는 [미검증].
  - [관찰] `pdfErrorLoadDocument`는 type 문자열만 검사 — 페이지의 아무 스크립트나 같은 메시지를 보내 블롭 재마운트를 유발할 수 있다.

### 1.2 Chrome — 로컬 PDF (`background.addPdfFileTabListener`)
- `browser.tabs.onUpdated`에서 `changeInfo.status == "loading"` 이고 `setting.detectPDF != "false"`일 때 `openPDFViewer(changeInfo.url, tabId)`.
- `checkIsLocalPdfUrl(url)` = `/^(file:\/\/).*(\.pdf)$/.test(url?.toLowerCase())` → 참이면 `browser.tabs.update(tabId, { url: util.getPDFUrl(url) })`.
- 드래그&드롭으로 PDF를 탭에 떨어뜨리는 경우도 여기서 잡힌다(주석 "listen drag and drop pdf").
- `?query`가 붙은 file URL(`...pdf?x`)은 `\.pdf$`에 안 걸려 리다이렉트되지 않는다.

### 1.3 Firefox — 웹 PDF 리다이렉트 (`background.addFirefoxPdfRedirectListener`)
- `util.isFirefox()` 이고 `browser.webRequest.onBeforeRequest` 존재 시에만 등록(MV2 manifest에 `webRequest`, `webRequestBlocking` 권한).
- 필터 `{ urls: ["*://*/*.pdf", "*://*/*.pdf?*"], types: ["main_frame"] }`, `["blocking"]`.
- `detectPDF === "false"`면 `{}`; URL에 `/pdfjs/web/viewer.html` 포함이면 `{}`(루프 방지); 아니면 `{ redirectUrl: util.getPDFUrl(details.url) }`.
- 이유(주석): Firefox 내장 pdf.js 뷰어는 특권 페이지라 주입 불가(bugzilla 1454760). 한계: Firefox webRequest는 `file://`을 못 잡으므로 로컬 PDF는 내장 뷰어로 열린다. 확장자가 `.pdf`가 아닌 PDF(Content-Type만 PDF)도 못 잡는다.
- Firefox에서는 뷰어가 top-level이라 `pdfErrorLoadDocument` 블롭 폴백이 **없다**(리스너를 등록하는 래퍼 문서가 없음).

### 1.4 팝업 메뉴 (`src/pages/about.vue` `aboutPageList`)
| 키 | 라벨 i18n | 서브 라벨 | URL | 아이콘/색 |
|---|---|---|---|---|
| `pdfViewer` | `PDF_Viewer` | `Translate_local_PDF_file` | `browser.runtime.getURL("/pdfjs/web/viewer.html") + "?file=/pdf_demo.pdf"` | `mdi-file-pdf-box` / red |
| `epub` | `Ebook_Reader` | `Translate_local_ebook_file` | `browser.runtime.getURL("/foliate-js/reader.html")` | `mdi-book-open-blank-variant` / orange |

- 클릭 → `openUrl(url)` → `isPanelOpen`이 없으므로 `window.open(url)`(새 탭).
- `public/pdf_demo.pdf`가 데모 문서. 뷰어의 "Open File"(PDF.js 기본 기능)로 로컬 파일을 열 수 있다.

### 1.5 file:// 권한 처리 (`pdfInject.checkLocalFileUrl`)
- `getFileParam()`(= `new URLSearchParams(location.search).get("file")`, 이미 1회 디코드됨)이 `file://`로 시작하면 `await util.hasFilePermission()` = `browser.extension.isAllowedFileSchemeAccess()`.
- `false`면 아래 원문 그대로 `alert` 후 `util.openSettingPage()` = `browser.tabs.create({ url: "chrome://extensions/?id=" + runtime.id })`:
  ```
      ------------------------------------------------------------------
      Mouse tooltip translator require permission for local pdf file.
      User need to turn on 'Allow access to file URLs' from setting.
      This page will be redirected to setting page after confirm.
      -------------------------------------------------------------------
  ```
  (실제 문자열은 템플릿 리터럴이라 앞쪽 들여쓰기·개행 포함. 문구 자체는 i18n 안 됨.)
- 이 코드는 확장 페이지(viewer.html) 안에서 돌기 때문에 `browser.extension.*`/`browser.tabs.*`를 직접 쓸 수 있다(일반 콘텐츠 스크립트에서는 불가).
- 원래 탭은 그대로 남는다(이동이 아니라 새 탭 생성). 관련 이슈: #45, #174(권한 프롬프트/가로채기 계열, 회피책 `detectPDF` off), #79(확장 없이 PDF 열기 = detectPDF off).
- [미검증] Firefox: `isAllowedFileSchemeAccess()`는 Firefox에서 항상 false를 반환하는 것으로 알려져 있고 `chrome://` URL은 `tabs.create`가 거부할 것 — 사용자가 Firefox에서 `?file=file://...`로 뷰어를 직접 열면 alert 후 실패할 수 있다.

---

## 2. PDF 뷰어 (`public/pdfjs` + `pdfInject.js`)

### 2.1 번들 PDF.js와 우리 수정분
- PDF.js 버전: `pdfjsVersion = "4.8.69"`, build `3634dab10` (`public/pdfjs/build/pdf.mjs`).
- `viewer.html` `<head>`에 우리가 추가한 태그(순서 중요):
  ```html
  <script src="viewer.mjs" type="module"></script>          <!-- 원본 -->
  <script type="module" src="../../doq/addon/doq.js"></script>
  <link rel="stylesheet" href="../../tippy.css" />
  <script src="../../contentScript.js"></script>
  <script src="../../pdfInject.js"></script>
  <script src="../../injectRightPan.js"></script>
  ```
  - classic `<script>` 3개는 파싱 중 **즉시 동기 실행**, module 스크립트(pdf.mjs, viewer.mjs, doq.js)는 defer → classic 스크립트가 먼저 실행되어 `webviewerloaded` 리스너를 PDF.js가 이벤트를 쏘기 **전에** 등록할 수 있다.
  - doq.js는 viewer.mjs 다음에 실행되므로 `window.PDFViewerApplication`이 이미 존재.
- `viewer.mjs`의 `PDFViewerApplication.run()`에서 **`validateFileURL(file)` 호출을 주석 처리**(`// validateFileURL(file);`, 13426행). 원본은 HOSTED_VIEWER_ORIGINS 외 출처의 `file=`을 거부 → 임의 웹 PDF URL을 열기 위해 제거. (pdfInject.js 상단 주석에도 기록됨.)
- `viewer.html`/`viewer.mjs`는 확장 페이지이므로 manifest CSP `script-src 'self' 'wasm-unsafe-eval'; object-src 'none'` 적용.
- viewer.html은 `web_accessible_resources`(Chrome MV3·Firefox MV2 모두)에 등록 — 웹 페이지 iframe(`#mttPdfIframe`)에서 로드하기 위해.
- 뷰어 안에서 contentScript.js가 일반 툴팁 기능 전체를 제공한다(마우스오버/선택 번역, TTS 등). 뷰어 의존 분기:
  - `util.isPDFViewer()` = `document.location.href.includes("pdfjs/web/viewer.html")`.
  - `mouseover.js shouldUseSegmentation()` = `isFirefox() || isPDFViewer()` → PDF 뷰어에선 단어/문장 확장에 Intl segmentation 사용.
  - 자동 읽기(`keyDownAutoReader`, #165) 스크롤 대상이 `#viewerContainer`(`scrollTop() + rect.top - height/2`).
  - 선택 텍스트는 `selectedText.replace(/\s+/g, " ").trim()`로 줄바꿈을 접는다(PDF의 줄/스팬 경계 개행 대응, contentScript 주석).
  - 뷰어 안 contentScript의 `detectPDF()`는 `contentType`이 `text/html`이라 false → 정상 초기화.

### 2.2 `pdfInject.js` 초기화 흐름
모듈 로드 즉시:
1. `setPdfViewerLocale()` (비동기, §2.3)
2. `initPdf()`:
   1. `checkPdfError()` — `webviewerloaded` → `PDFViewerApplication.initializedPromise.then` → `eventBus.on("documenterror", () => util.postFrame({ type: "pdfErrorLoadDocument" }))`.
      - `postFrame(data)`: top이면 `window.postMessage(data,"*")`, iframe이면 자기 window **와** `window.parent`에 `postMessage(data,"*")`.
   2. `await dom_util.waitJquery()` (= jQuery `$(fn)` → DOMContentLoaded 대기)
   3. `checkLocalFileUrl()` (async, await 안 함 — §1.5)
   4. `checkLocalFileType()` (§2.7)
   5. `addCustomKeystroke()` (§2.5)
   6. `addCopyUrlButton()` (§2.4, #28)
   7. `addCallbackForPdfTextLoad(addSpaceBetweenPdfText)` — `webviewerloaded` → `initializedPromise` → `documentloaded` → 이후 매 `textlayerrendered` 마다 콜백.
      - [관찰] **사실상 데드 훅**: `viewer.mjs` 끝부분은 `document.readyState`가 `interactive`/`complete`이면 즉시 `webViewerLoad()`를 호출하는데, deferred module 실행 시점은 이미 `interactive`라 `webviewerloaded`가 **viewer.mjs 실행 중(DOMContentLoaded 이전)** 에 발생한다. 이 리스너는 `await waitJquery()`(DOMContentLoaded) 뒤에 등록되므로 이벤트를 놓친다 → `textlayerrendered` 훅은 작동하지 않고 **실제 보정은 아래 `waitCount` 타이머만** 수행한다. (반면 `checkPdfError`와 `setPdfViewerLocale`의 리스너는 await 이전에 동기 등록되어 정상 동작.) 재작성 시 훅을 "제대로" 연결하면 보정 타이밍이 현행과 달라진다.
      - `webViewerLoad()`는 먼저 `parent.document.dispatchEvent`를 시도하고 예외 시 `console.error` 후 자기 `document`에 dispatch한다. Chrome 하이재킹(iframe, 부모가 웹 출처) 경우 cross-origin 예외 → 자기 document로 폴백; top-level(about 페이지/Firefox 리다이렉트)에서는 `parent === window`.
   8. `waitCount = [1000,5000,10000,15000,20000,30000,60000]`(ms)에 따라 **순차** `await delay(wait)` 후 `addSpaceBetweenPdfText()` — 누적 약 141초까지 재시도.
   9. `// initButton();` 주석(데드).

### 2.3 PDF.js UI 언어 (#153)
- `PDF_LOCALE = { fil: "tl", no: "nb-NO" }`. 그 외는 확장 로케일 코드의 `_`→`-` (`zh_CN`→`zh-CN`). PDF.js가 언어 범위 협상(`es`→지역 변형). am/sw/ml은 PDF.js 로케일 없음 → 영어.
- `apply()` = `lang`이 있고 `"auto"`가 아니면 `window.PDFViewerApplicationOptions?.set("localeProperties", { lang })`(try/catch).
- `document.addEventListener("webviewerloaded", apply)` 등록 후 `SettingUtil.loadSetting()`으로 `uiLanguage`를 읽고 즉시 `apply()` 한 번 더(설정 로딩이 이벤트보다 늦은 경우 대비). `"auto"`면 PDF.js가 `navigator.language` 사용.

### 2.4 "Copy PDF URL" 버튼 (#28)
- 조건: `getFileParam()`이 `^https?://`(대소문자 무시)일 때만(로컬/blob/상대경로 `/pdf_demo.pdf` 제외).
- `#secondaryToolbarButtonContainer`(PDF.js Tools 메뉴)가 있고 `#mttCopyPdfUrl`이 아직 없을 때 **맨 앞에 prepend**("Open File" 바로 위).
- 요소: `<button id="mttCopyPdfUrl" class="toolbarButton labeled" type="button" title="Copy PDF URL"><span>Copy PDF URL</span></button>`.
- 클릭: `navigator.clipboard.writeText(url)` → 성공 시 span 텍스트 `"Copied!"`, 실패 시 `"Copy failed"`(console.log), 1200ms 후 `"Copy PDF URL"` 복원. 문자열 i18n 없음.
- URL은 `URLSearchParams`가 이미 디코드한 값 → 다시 디코드하지 않는다(주석).

### 2.5 단축키
- `document` `keydown`: 포커스가 입력 박스(`dom_util.getFocusedWritingBox()` — `util.writingField` 매치)면 무시, Alt/Ctrl/Meta/Shift 중 하나라도 눌렸으면 무시.
- `evt.code == "KeyT"` → `#editorFreeText` click(텍스트 주석 도구), `"KeyD"` → `#editorInk` click(그리기 도구). (`?.click()` — 요소 없으면 무시.)
- 하이라이트 에디터(#145)는 PDF.js 4.8.69 내장 기능(`editorHighlightButton`)이며 우리 코드 없음.

### 2.6 텍스트 레이어 공백/줄바꿈 보정 (`addSpaceBetweenPdfText` / `insertLineBreak`)
툴팁의 단어/문장 추출이 PDF.js 텍스트 레이어의 스팬 경계를 넘을 수 있도록 공백/개행을 넣는다.
- 모듈 전역 `isPdfSpaceInserted`가 true면 즉시 return(로그 "PDF space already inserted").
- 문서 전체 `$("br").length == 0`이면 return("No removing <br> elements") — **플래그는 세우지 않음**(다음 기회에 재시도).
- `<br>`이 있으면 `isPdfSpaceInserted = true`, **문서의 모든 `<br>` 제거**, `insertLineBreak()`.
- `insertLineBreak()`: `$(".page span:not(:has(*))")`(자식 없는 leaf span) 순회:
  - `textContent.trim() == ""`면 skip.
  - `lineY = getBoundingClientRect().top`, `lineFontSize = computed fontSize`.
  - 이전 줄(`prevLine`)이 공백/개행으로 끝나지 않을 때:
    - `|prevY - lineY| > fontSize * 1.3` → `prevLine.textContent += "\n"`
    - else `|prevY - lineY| > fontSize * 1.0` → `prevLine.textContent += " "`
  - (같은 줄의 스팬 사이에는 아무것도 넣지 않음.) 예외는 console.log 후 계속.
- **중요 동작**: 한 번 플래그가 서면 이후 렌더되는 페이지(스크롤로 lazy 렌더되는 textLayer)는 **다시 처리되지 않는다**. 즉 처음 처리 시점에 DOM에 있던 페이지들만 보정. 재작성 시 "동일 기능"을 원하면 이 한계까지 그대로 둘지 결정 필요(#275: 줄 넘는 문장 한계와 연관).
- [관찰] `<br>` 제거는 `.page` 범위가 아니라 문서 전체 대상이다.

### 2.7 `checkLocalFileType` / 기본 문서
- `url = getFileParam()`; `isFileUrl(url)`(`/^file:\/\/(.*?)/` on lowercase) 이고 `!isPdfFileName(url)`(`/(.*?)\.pdf$/`)이면 `window.location.replace("/pdfjs/web/viewer.html?file=")`.
  - `?file=`(빈 값) → PDF.js `params.get("file") ?? defaultUrl`에서 빈 문자열은 nullish가 아니라 `file = ""` → `run()`의 `if (file) { open(...) }` 가드로 **아무 문서도 열지 않은 빈 뷰어**가 된다("Open File"로 직접 열어야 함).
- **[관찰] 버그**: `?file=` 파라미터가 아예 없으면 `getFileParam()`이 `null` → `isFileUrl(null)`에서 `null.toLowerCase()` TypeError → `initPdf()`가 reject되어 **이후 `addCustomKeystroke`/`addCopyUrlButton`/공백 보정이 전부 실행되지 않는다**. 이때 PDF.js는 `defaultUrl`(`compressed.tracemonkey-pldi-09.pdf`)을 여는데 이 파일은 빌드에서 제외되어 404.
- `about.vue`는 항상 `?file=/pdf_demo.pdf`를 붙이므로 정상 경로에서는 문제 없음.

### 2.8 데드 코드 (pdfInject.js)
- `waitUntilPdfLoad()` — 미사용.
- `changeUrlParam()` — 미사용. (`location.search.slice(6)` 주석은 "?page="라고 되어 있으나 실제로는 "?file=" 6글자.)
- `changeUrlWithoutRedirect()` — 미사용.
- `initButton()` — 호출 주석 처리. `#toolbarViewerRight`에 "Reader Mode options1" 버튼 추가 → `DownloadFromUrl` 호출. `PDFViewerApplication.pdfDocument.getData;` 무의미 표현식.
- `DownloadFromUrl()` — `pdfDocument.getData()`로 Blob 만들어 `Mouse_Tooltip_Translator_History.pdf`로 다운로드. `initButton`에서만 참조 → 데드.
- 상단 주석 블록(script 태그 목록, `validateFileURL`)은 viewer 수정 메모.

---

## 3. doq (PDF 다크 모드 / 리더 모드 애드온, #35)

- 출처: `shivaprsd/doq` v2.4 ("The missing reader mode/color schemes tool for PDFs", MIT). `package.json`의 `pdfjs_version.target`은 `4.1.392` — 번들 PDF.js(4.8.69)보다 낮다(호환은 사실상 수동 확인).
- 로드: viewer.html의 `<script type="module" src="../../doq/addon/doq.js">`. **번들되지 않은 raw ES 모듈**로 로드되므로 bare specifier import(`import x from "pkg"`) 불가.
  - #339/#342: PR #335가 `prefs.js`에 `import deepmerge from "deepmerge"`를 넣어 모듈 해석 실패 → PDF 뷰어 전체(툴팁 포함, 다크모드 패널 포함)가 깨짐. 인라인 `deepMerge(base, override)`(plain object만 재귀 병합, 배열은 override로 교체)로 교체됨(#335의 "부분 저장 prefs가 키를 잃지 않게" 의도 유지).
- 동작: `window.PDFViewerApplication`이 있으면 `DOMContentLoaded`(또는 이미 interactive면 즉시)에 `installAddon()`:
  - `lib/colors.json` fetch → `doq.css` link 삽입 → `doq.html` fetch → `#toolbarAddon` 템플릿 내용을 `#toolbarViewerRight`에 prepend, `#mainAddon` 템플릿을 `#findbar` 뒤에 삽입 → 색 구성표 등록/리더 초기화/설정 로드/툴바 위치/이벤트 바인딩.
  - `window.DOQ = doqAPI` 노출.
- 설정 저장: **`localStorage`**(확장 출처) 키 `doq.preferences.<theme>`, 마이그레이션 플래그 `doq.migrated-chromium-theme`. 확장 설정(`storage.local`)과는 무관.
- 리포지토리 내 수정 이력: `a135280d fix pdf dark mode`, `af9be9b8 update doq library`, `401b6ff8`/`9e0868ce`(prefs 병합). 재작성 시 doq는 서드파티 그대로 유지하는 것이 기본.

---

## 4. `public/injectRightPan.js` (우클릭 드래그 팬)

- 외부 기여(`46d1c197 change to implement to inject method`)로 추가된 **번들되지 않은 plain 스크립트**. viewer.html에서 classic script로 로드.
- 초기화: DOMContentLoaded 후 100ms, 또는 이미 로드됐으면 즉시 100ms 후, 그리고 `webviewerloaded`(capture) 후 200ms에 `initializeRightPan()` — `window.rightPanInitialized`로 1회만. `PDFViewerApplication`과 `.pdfCursorTools`가 생길 때까지 100ms 간격 무한 폴링 → `new RightPanInjector(pdfCursorTools)`.
- 동작(`pdfCursorTools.container` = `#viewerContainer`):
  - `mousedown`(capture, document): `button === 2` 이고 컨테이너 내부이며 `a[href], a[href] *, input, textarea, button, button *, select, option`이 아니면 대기 상태.
  - `mousemove`(capture): 시작점에서 x 또는 y로 `PAN_THRESHOLD = 5`px 초과 시 팬 시작, `scrollLeft/Top` 저장, `preventDefault()`. 손 도구(`activeTool === 1`, CursorTool.HAND)면 PDF.js에 맡기고 리턴. 아니면 `div.grab-to-pan-grabbing` 오버레이를 body에 붙여 커서 표시, `container.scrollTo({ top: start - dy, left: start - dx, behavior: "instant" })`.
  - `mouseup`(capture) `button === 2`: 상태 리셋, 오버레이 제거, `recentPanActivity`를 100ms 후 false.
  - `contextmenu`(컨테이너, capture): `recentPanActivity`면 `preventDefault()` — 드래그 후 컨텍스트 메뉴 억제. 클릭만 한 경우는 정상 메뉴.
- `window.RightPanInjector`, `window.initializeRightPan` 전역 노출.
- [관찰] 모든 단계에 `console.log("[RightPan] ...")` — mousedown마다 로그(프로덕션 빌드의 `dropConsole`은 public 파일에 적용 안 됨).
- [관찰] `mousemove`에서 `event.buttons`를 확인하지 않음 → 창 밖에서 우클릭을 떼면 `rightMouseDown`이 남아 버튼을 안 눌러도 팬이 계속될 수 있다. mousemove의 `preventDefault()`는 contextmenu를 막지 못하며 실제 억제는 `recentPanActivity`가 담당.
- 대부분 경우 PDF 뷰어 컨텍스트 메뉴(확장의 contextMenus 항목 포함)와 공존.

---

## 5. 이북 리더 (foliate-js + `ebookEventInject.js`)

### 5.1 `public/foliate-js/reader.html` 통합 지점
- foliate-js(서드파티) 리더. 파일 끝에 우리 태그 추가:
  ```html
  <script src="reader.js" type="module"></script>   <!-- 원본 -->
  <link rel="stylesheet" href="/tippy.css" />
  <script src="/contentScript.js"></script>
  <script src="/ebookEventInject.js"></script>
  ```
- **자체 meta CSP**(manifest CSP에 추가로 적용됨):
  `default-src 'self' blob:; script-src 'self'; style-src 'self' blob: 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' blob: data: *; frame-src blob: data:; object-src blob: data:; form-action 'none';`
  - `style-src 'unsafe-inline'` 덕분에 contentScript의 주입 `<style>`이 동작.
  - [추정] `img-src`/`font-src`(=default-src) 제한 때문에 리더 안에서는 툴팁의 외부 이미지(`requestImage`)나 외부 웹폰트가 차단될 수 있다. 번역/TTS는 background 메시지 경유라 무관.
- web_accessible_resources에 **없음** → 확장 탭(about.vue)으로만 연다.
- 파일 열기: 드래그&드롭, `#file-button`/`#file-input`, 또는 `?url=<URL>` 파라미터(`fetch(url)` → `File`). EPUB/MOBI/AZW/FB2/FBZ/CBZ/디렉터리 지원(foliate 기능).
- `reader.js` 우리 수정(#201): `getEbookTheme()` = `(globalThis.browser || globalThis.chrome).storage.local.get('ebookTheme')` → 기본 `'auto'`(실패 시도 `'auto'`). `themeCSS(theme)`:
  - `light`: `html { color-scheme: light !important; } html, body { background: #ffffff !important; color: #111111 !important; }`
  - `dark`: `html { color-scheme: dark !important; } html, body { background: #1b1b1b !important; color: #d6d6d6 !important; }`
  - 그 외: `html { color-scheme: light dark; }`(원본 동작)
  - `Reader.open()`에서 `this.style.theme = await getEbookTheme()` 후 `renderer.setStyles(getCSS(this.style))` — foliate가 섹션마다 재적용. 설정 변경은 **리더를 다시 열어야** 반영(라이브 반영 없음).
  - reader.js는 raw 모듈이라 `storage.local`을 직접 읽는다(SettingUtil 미사용, sync 미반영).

### 5.2 `ebookEventInject.js` (이벤트 브리지)
- foliate는 책 본문을 **shadow DOM 안의 iframe**에 그린다. 리더 top 문서의 contentScript가 그 iframe의 마우스/키/선택을 받도록 브리지.
- `setInterval(1000ms, 영구)`: `util.getEbookIframe()`이 있고 `iframe.src`가 직전과 다르면(섹션 이동 시 바뀜) `bindIFrameEvent(iframe)` + `iframe.contentWindow.focus()`(키 이벤트 수신용).
- `util.getEbookIframe()` = `getAllShadows()`(문서 내 모든 shadowRoot를 재귀 수집한 평탄 배열)의 **인덱스 `[1]`** shadowRoot에서 첫 `iframe`; 없으면 `document.querySelector('iframe[id^="bf-epub-view-"]')`(BookFusion) ?? `null`.
  - [관찰] `[1]` 고정 인덱스는 foliate 내부 shadow 구조(`foliate-view` → `foliate-paginator`)에 의존 — 매우 취약.
- `bindIFrameEvent(iframe)`:
  - `enableSelectionEndEvent(iframe.contentWindow)` — `src/event/selection.js`의 **별도 번들 복사본**. 기본 `textDetectTime = 0.7`초 고정(설정 미반영). iframe 문서의 `selectionchange`(debounce 700ms)와 `mouseup`에서 `triggerSelectionEnd(text)` → 리더 top `document`에 `CustomEvent("selectionEnd")`(`selectedText` 포함) dispatch → contentScript가 선택 번역.
  - `mousemove`/`keydown`/`keyup`을 iframe window에서 듣고 `CustomEvent(eventName, { bubbles: true })`를 만들어 **`window`와 `document` 양쪽에 dispatch**. 붙이는 필드:
    - `ebookWindow = iframe.contentWindow`
    - `key`, `code`, `ctrlKey`(shift/alt/meta는 복사 안 함)
    - `clientX = e.clientX + iframeRect.left` (falsy면 `""`), `clientY` 동일
    - `iframeX = e.clientX`, `iframeY = e.clientY`
- 소비 측(`src/event/mouseover.js`): `e.ebookWindow`가 있으면 `_win = e.ebookWindow`, `_isIframe = true`, `clientX/Y = iframeX/Y`, `mouseTarget = e.target` → `caretRangeFromPoint(x, y, _win.document)`로 iframe 문서 안에서 텍스트 탐색. 이후 일반 이벤트로는 좌표를 덮어쓰지 않음(`_isIframe`이 한번 true면 유지).
- 하이라이트 위치(`contentScript.highlightText`): `util.isEbookReader()`면 rect에 `getEbookIframe().getBoundingClientRect().left/top` 가산.
  - `isEbookReader()` = `location.href == browser.runtime.getURL("/foliate-js/reader.html")` **완전 일치**.
  - [관찰] `?url=`로 연 경우 href가 달라 `isEbookReader()`가 false → 하이라이트 오프셋 보정이 빠진다.
- [관찰] `clientX`가 0이면 `""`가 된다(`e?.clientX ? ... : ""`).
- 형제 경로: BookFusion(`reader.bookfusion.com`) 브리지는 contentScript `bindBookFusionIframe()`에 별도 구현(스케일 보정, selection lock 등). 이 문서 범위 밖이지만 `getEbookIframe` 폴백을 공유.

---

## 6. OCR (이미지 위 번역 오버레이, #109/#250)

### 6.1 트리거
- `contentScript.handleMousemove(e)` — 마우스가 "충분히 움직였을 때"(`checkMouseOnceMoved`)마다 `ocrView.checkImage(e.clientX, e.clientY, setting, keyDownList)`.
- keydown 디스패치 맵(`rebuildKeyBindings`, #352)에는 OCR이 **의도적으로 없다** — mousemove 폴링 방식.
- `checkImage(x, y, currentSetting, keyDownList)`:
  1. `keyDownList[setting.keyDownOCR]`가 falsy면 return. (`keyDownList` 초기값 `{ always: true }` → `keyDownOCR = "always"`면 항상 동작.)
  2. `img = util.getPointedImg(x, y)`; 없거나 `ocrHistory[img.src]`가 있으면 return(이미지당 1회).
  3. 모듈 전역 `setting = currentSetting`; `ocrHistory[src] = img`, `translatorHistory[src] = []`, `ocrResultHistory[src] = []`; `lang = setting.ocrLang`.
  4. `img.style.cursor = "wait"`.
  5. `Promise.all([getBase64Image(img.src), initOCRIframe().then(() => initOCRLibrary(lang))])`.
  6. 5개 모드 병렬 `processOcr` (§6.4) 완료 후 `cursor = ""`.
- `util.getPointedImg(x, y)`:
  1. `deepElementFromPoint`(shadowRoot 따라 내려감)가 이미지면 반환.
  2. `document.elementsFromPoint(x, y)` 스택에서 첫 이미지.
  3. 스택에서 인라인 `style.backgroundImage`가 `.(jpg|jpeg|png|gif|webp)$`인 요소 → `createHiddenImageFromCSS`: `url(...)` 해제, `//`→`https:`, `/`→`location.origin` 접두, 요소 위치/크기에 맞춘 `opacity:0; z-index:-999; position:absolute` `<img>`를 **body에 새로 append**해 반환.
  - "이미지" 판정 `checkIsImage`: `tagName == "IMG"` && `src` && `complete` && `naturalHeight !== 0` && `width > 150` && `height > 150`.
  - [관찰] CSS 배경 경로는 키를 누른 채 움직일 때마다 숨김 `<img>`를 새로 만든다(이력 체크가 그 뒤라 같은 src면 OCR은 1회지만 DOM 요소는 계속 누적). 계산된 스타일(`getComputedStyle`)이 아니라 인라인 style만 본다.
- `getBase64Image(url)`: `util.getBase64(url)`(탭에서 `fetch`→`FileReader.readAsDataURL`, 실패 시 `""`) → 비면 `util.requestBase64(url)` → background `requestBase64` 핸들러가 같은 `getBase64`를 확장 권한(host_permissions `<all_urls>`)으로 수행해 `{ base64Url }` 반환. 둘 다 실패하면 `processOcr`가 즉시 return(아무것도 안 함, 커서만 복구).

### 6.2 프레임 구성
| 프레임 name/id | HTML | 역할 | 비고 |
|---|---|---|---|
| `ocrFrame` | `/ocr.html` → `ocrIframe.js` | tesseract 스케줄러/워커 | 일반 확장 페이지(확장 출처) |
| `opencvFrame` | `/opencvHandler.html` → `opencvHandler.js` + `/opencv/opencv.js` | 전처리·텍스트 영역 검출 | **sandbox 페이지**(§7) |

- `createIframe(name, path)`: `iFrames[name]` 캐시, 없으면 `loadScript` — jQuery로 `<iframe name=id=name src=runtime.getURL(path)>`를 **페이지 `body`에 append**, `load` 이벤트에 DOM 요소 resolve.
  - 기본 CSS: `width:"1"; height:"1"; pointer-events:none; opacity:0`.
    - [관찰] 값이 **문자열** `"1"`/`"700"`이라 jQuery가 `px`를 붙이지 않는다(자동 px는 number 타입에만) → `style.width = "1"`은 무효값으로 무시되어 iframe은 기본 크기(300×150)로 **보이지 않게 레이아웃 공간을 차지**할 가능성이 높다(디버그 700도 마찬가지). [추정 — 실브라우저 확인 권장]
  - 디버그: 이름에 `"Debug"`가 포함되면 `700x700, pointer-events:auto, opacity:1`. 소스 상단의 `// var ocrFrameName="ocrFrameDebug"` 등 주석을 풀어 사용. 프레임 쪽도 `window.name.includes("Debug")`로 `isDebug`를 켜서 canvas들을 body에 그린다.
  - [관찰] 경쟁 조건: `iFrames[name]`은 `load` 후에 채워지므로, 첫 iframe 로드 전에 다른 이미지로 `checkImage`가 또 오면 iframe이 중복 생성되고 나중 것이 캐시를 덮어쓴다.
  - [관찰] id `ocrFrame`/`opencvFrame`이 페이지와 충돌할 수 있음.
- 두 HTML 모두 `web_accessible_resources`에 등록(임의 페이지에서 iframe 로드). manifest content_scripts의 `<all_urls>`는 `chrome-extension://`에 매치되지 않으므로 이 iframe들 안에서는 contentScript가 돌지 않는다.
- 콘텐츠 스크립트는 `all_frames`이므로 OCR은 이미지가 있는 **해당 frame** 안에서 iframe을 만든다.

### 6.3 메시지 프로토콜 (`window-post-message-proxy` 0.2.6)
- 콘텐츠 측: `new WindowPostMessageProxy({ suppressWarnings: true })` 1개(모듈 전역). `postMessage(frame.contentWindow, data)` → 라이브러리가 `data.windowPostMessageProxy = { id: <random base36> }`를 **원본 객체에 붙이고** `targetWindow.postMessage(data, "*")`, `pendingRequestPromises[id]`에 deferred 저장.
- 응답 매칭: 라이브러리는 자기 `window`의 `message`를 듣고, 메시지의 `windowPostMessageProxy.id`가 pending에 있으면 resolve(`message.error`가 truthy면 reject). 없으면 "요청"으로 보고 핸들러(없음)에 넘김 — 경고는 suppress.
- **프레임 측은 라이브러리를 쓰지 않는다.** 받은 `data.windowPostMessageProxy`를 응답 객체에 그대로 복사해 `window.parent.postMessage(data, "*")`로 회신(수동 에코). 이 필드 에코가 프로토콜의 핵심 불변식.
- pending promise에 **타임아웃 없음** — 프레임이 응답하지 않으면 영원히 대기(`processOcr`/`checkImage`가 끝나지 않고 커서가 `wait`로 남음).
- 요청 타입:

| 요청 → 대상 | 필드 | 응답 |
|---|---|---|
| `{type:"init", lang, mode}` → ocrFrame | | `getScheduler(lang, mode)` 완료 후 `{ windowPostMessageProxy }`만 |
| `{type:"ocr", mainUrl, lang, bboxList, base64Url, mode}` → ocrFrame | `bboxList`는 tesseract `rectangle` 배열 | `{ type:"ocrSuccess"|"ocrFail", mainUrl, base64Url, lang, ocrData, windowPostMessageProxy }` (`ocrData` = tesseract `recognize` 결과 배열, 실패 시 `[]`) |
| `{type:"segmentBox", mainUrl, lang, base64Url, mode}` → opencvFrame | | `{ type:"segmentSuccess"|"segmentFail", mainUrl, base64Url, lang, bboxList, opencvImg(항상 undefined), ratio, windowPostMessageProxy }` |
| `{type:"resizeImage", base64Url}` → opencvFrame | | `{ base64Url, cvratio, windowPostMessageProxy }` — **호출처 없음(데드)** |

- `initOCRLibrary(lang)`은 `requestOcrInit(lang,"auto")`, `requestOcrInit(lang,"bbox")`를 **await 없이** 발사(워밍업). 실제 OCR 요청도 같은 `getScheduler`를 기다리므로 순서 문제 없음.
- 실패 응답(`ocrFail`/`segmentFail`)도 resolve로 처리되며 `type`을 검사하지 않는다 → 빈 결과로 조용히 끝남.
- [관찰] 보안/프라이버시: 요청·응답 모두 `"*"` 타깃 window 메시지. 응답은 **페이지 top/frame window**로 오므로 페이지 main-world 스크립트가 이미지 base64와 OCR 결과를 그대로 볼 수 있고, id를 알면 응답 위조도 가능.

### 6.4 OCR 모드 (5개 병렬)
`checkImage`가 같은 이미지로 동시에 실행(색상은 원래 디버그 박스 색 — 현재 박스 표시가 꺼져 있어 미사용):

| 색 | mode | opencv 사용 | tesseract 입력 이미지 | 스케줄러 id |
|---|---|---|---|---|
| BLUE | `auto` | 아니오 | 원본 base64(원 해상도, 컬러) | `<lang>_auto` |
| RED | `bbox_small` | 예(커널 12×12) | 전처리(그레이, 리사이즈) | `<lang>_bbox` |
| GREEN | `bbox` | 예(말풍선 윤곽 마스크) | 전처리(그레이, 리사이즈) | `<lang>_bbox` |
| ORANGE | `bbox_white_useOpencvImg` | 예(흰 영역 플러드필) | opencv 가공 이미지 | `<lang>_bbox` |
| PURPLE | `bbox_black_useOpencvImg` | 예(반전 후 동일) | opencv 가공 이미지 | `<lang>_bbox` |
| (주석) | `bbox_contour_useOpencvImg` | — | — | — |

`processOcr(mainUrl, lang, base64Url, img, color, mode)`:
- `ratio = 1`, `bboxList = [[]]`.
- `mode.includes("bbox")`면 `requestSegmentBox` → `{ bboxList, base64Url, ratio }`로 교체(base64Url 파라미터를 덮어씀).
- `bboxList`의 **각 bbox마다 별도** `requestOcr(..., [bbox], base64Url, mode)` → `showOcrData(img, res.ocrData, ratio, color)`.
  - auto 모드: `[[]]` → 요청 1회, 프레임에서 rectangle 무시하고 전체 인식.
  - bbox 모드에서 opencv가 0개를 내면 OCR 요청 자체가 없다.

### 6.5 tesseract (`ocrIframe.js`)
- 버전 고정(3자 일치 필수):
  - npm `tesseract.js` = `^5.0.3`, pnpm-lock 해석 **5.0.3** → 의존 `tesseract.js-core` **5.0.0**.
  - `public/tesseract/worker.min.js` = `https://unpkg.com/tesseract.js@5.0.3/dist/worker.min.js` (README 기록).
  - `public/tesseract/tesseract-core-lstm.wasm.js` = `https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core-lstm.wasm.js` (wasm 내장 JS, 약 3.9MB).
  - 메인 스레드 API(번들된 npm 5.0.3)와 워커 스크립트(5.0.3)의 메시지 프로토콜이 맞아야 함 — npm 버전을 올리면 public 파일도 같이 교체해야 한다(`^` 범위라 lock 갱신 시 깨질 수 있음).
- 워커 생성: `Tesseract.createWorker(lang, 1 /* OEM.LSTM_ONLY */, { workerBlobURL: false, workerPath: runtime.getURL("/tesseract/worker.min.js"), corePath: runtime.getURL("/tesseract/tesseract-core-lstm.wasm.js") })`.
  - `workerBlobURL: false` → 확장 출처 URL로 직접 `new Worker`(CSP상 blob 워커 회피).
  - `corePath`가 `.js`로 끝나므로 tesseract.js의 SIMD 자동 선택을 건너뛰고 **비-SIMD LSTM 전용 코어**를 `importScripts`.
  - `langPath` 미지정 → 학습 데이터는 jsdelivr CDN `https://cdn.jsdelivr.net/npm/@tesseract.js-data/<lang>/4.0.0_best_int`에서 `<lang>.traineddata` 다운로드(LSTM-only라 best_int). 확장에 학습 데이터 미포함 → **첫 사용 시 네트워크 필요**.
  - 캐시: tesseract.js 기본(`cacheMethod` 기본 = IndexedDB 읽기/쓰기)으로 ocr.html 출처(확장 출처)의 IndexedDB에 저장. [추정] 서드파티 iframe 저장소 파티셔닝 때문에 top-level 사이트별로 캐시가 분리될 수 있다.
- `worker.setParameters({ user_defined_dpi: "100", tessedit_pageseg_mode })`:
  - auto 모드: `PSM.AUTO_ONLY`
  - bbox 계열: `lang.includes("vert")` ? `PSM.SINGLE_BLOCK_VERT_TEXT` : `PSM.SINGLE_BLOCK`
- 스케줄러 캐시: `getModeId(lang, mode) = lang + "_" + mode.split("_")[0]` → 언어당 최대 2개(`auto`: 워커 1개, `bbox`: 워커 4개 `[0,1,2,3]`). 로딩 중 중복 요청은 `loadingList[id]` + `waitUntil(() => schedulerList[id], WAIT_FOREVER)`로 대기.
  - 언어를 바꾸면 새 스케줄러가 추가 생성(기존 것은 프레임이 제거될 때까지 유지).
- `doOcr`: `loadImage(base64Url)` → `<canvas>`(naturalWidth/Height)에 그림 → auto면 `scheduler.addJob("recognize", canvas)` 1회(`[d]`), 아니면 `rectangles.map(r => addJob("recognize", canvas, { rectangle: r }))`. 예외 시 `ocrFail` + `[]`.
- `ocrIframe.js`는 `webextension-polyfill`의 `browser.runtime.getURL`을 쓴다 → **sandbox가 아닌** 확장 페이지여야 함.

### 6.6 OpenCV 전처리/영역 검출 (`opencvHandler.js`)
- 라이브러리: `public/opencv/opencv.js`(272KB 로더) + `opencv_js.wasm`(3.3MB). 출처(readme): `huningxin.github.io/opencv.js/build/wasm/` (구형 커뮤니티 빌드, 버전 표기 없음). `opencvHandler.html`이 인라인 `var Module = { wasmBinaryFile: "/opencv/opencv_js.wasm" }` 후 `opencvHandler.js`(module, defer)와 `/opencv/opencv.js`(async) 로드. 인라인 `opencvIsReady()`는 미사용(데드).
- `waitOpencvLoad()`: `cv.matFromArray(2,3,CV_8UC1,[1..6]).cols`가 truthy일 때까지 50ms 간격 `waitUntil` — **타임아웃 미지정 = async-wait-until 기본 5000ms**. 5초 내 wasm이 준비 안 되면 TimeoutError → catch → `segmentFail`(빈 bboxList). 첫 사용 시 bbox 계열 4개 모드가 결과 없이 끝날 수 있고, 이미지가 `ocrHistory`에 들어가 재시도도 안 된다. (예외 시 매 시도마다 console.log.)
- `segmentBox(request, isResize = true)`:
  1. `loadImage(base64)` → canvas.
  2. `preprocessImage(canvas, true)`: `cv.imread` → `RGBA2GRAY` → `image_resize(src, 700)`: **짧은 변을 700px로**(작은 이미지는 확대, 큰 이미지는 축소, `INTER_AREA`), `ratio = 700 / 짧은변` → `cv.imshow`로 새 canvas. 반환 `[canvas, ratio]`.
  3. `base64 = canvas.toDataURL()`(그레이·리사이즈 PNG) — bbox 계열 tesseract 입력.
  4. `detectText(canvas, mode)` → `{ bboxList, preprocessedSourceImage }`.
  5. `mode.includes("useOpencvImg")`이고 가공 이미지가 있으면 `base64 = opencvMatToBase64(preprocessedSourceImage)`(PNG).
- `detectText` 모드별 전처리(`src = imread(canvas)` RGBA, `w,h`, 기본 `paddingSize = 10`):
  - `small`: 커널 `MORPH_RECT 12×12`; `dst = gray(src)`.
  - `black`/`white`: 커널 15×15. `black`이면 `bitwise_not(src)`. `dst = gray` → `threshold 200 BINARY` → 네 모서리에서 `customFloodFillWithoutCv`(순수 JS 4방향 스택 플러드필, 같은 값 영역, `visited` Set 공유)로 배경 마스크 → `dst = NOT(NOT(dst) OR mask)`(모서리와 연결된 흰 영역 제거) → 1px 테두리 → (0,0)에서 다시 플러드필 → 반전 → ROI로 테두리 제거 = "닫힌 흰 영역(말풍선)" 마스크 → `src AND mask` → 마스크 밖을 흰색으로 → RGB → 반전·`convertScaleAbs(2.0)`·반전·`convertScaleAbs(1.5)`(대비 강화) = `preprocessedSourceImage` → `src = 흰배경 합성 이미지`, `dst = gray(가공 이미지)`.
  - `contour`(현재 호출 안 됨): 커널 12×12, Gaussian 5×5 → Canny(30,150) → 외곽 컨투어 채움 마스크 → dilate 3×3 ×2 → 마스크 영역만 복사.
  - 그 외(`bbox`): 커널 15×15, gray → Gaussian 5×5 → Canny(30,150) → 외곽 컨투어 → `mask1`(채움) AND NOT `mask2`(두께 5 외곽선) = 윤곽 내부 영역 → gray AND 내부 마스크 + 반전 마스크(외부를 흰색으로) → `src = dst = 결과`, `paddingSize = 3`.
- 공통 후처리: `threshold(OTSU|BINARY)` → `Sobel(dx=1)` → `Sobel(dy=1)`(직선 제거) → `threshold(OTSU|BINARY)` → `morphologyEx(MORPH_CLOSE, 커널)`(글자 묶기) → `findContours(RETR_EXTERNAL, CHAIN_APPROX_NONE)`.
- 컨투어 필터(하나라도 해당하면 제외): `area/(rect.w*rect.h) < 0.15`, `cnt.rows < 100`(컨투어 점 수), `area < 150`, `minAreaRect` 각도가 0/90/180/270/360 중 어느 것과도 20° 이내가 아님. 통과 시 padding을 더한 `{ left, top, width, height }`(이미지 경계로 clamp, `parseInt`).
- 겹치는 박스 병합: 이중 루프로 교차하면 합집합 박스로 `i`를 교체하고 `j` 제거(단일 패스 — 병합 후 새로 겹치게 된 앞쪽 박스와는 재검사 안 함).
- `sortBbox`: `top` 오름차순 의도. **[관찰]** 비교 함수가 `a.top < b.top`일 때만 `-1`을 반환하고 나머지는 `undefined`(=0 취급) → 일관성 없는 비교자라 정렬 결과가 엔진 의존적.
- 좌표계: bbox는 **리사이즈된 이미지 픽셀** 기준. 콘텐츠 측 `adjustTextBoxBbox`가 tesseract 결과 bbox를 `/ ratio`(x0,y0는 floor, x1,y1은 ceil)로 원본 natural 픽셀로 되돌린다.
- [관찰] `cv.Mat` 대부분이 `.delete()`되지 않음(`preprocessImage`와 `opencvMatToBase64`만 해제) → wasm 힙 누수.
- [관찰] `resizeImage` 핸들러는 선언 안 된 `base64`에 대입(번들은 strict 모드 → ReferenceError). 호출처도 없어 데드.
- [관찰] `opencvImg` 필드는 항상 undefined.

### 6.7 결과 필터링·번역
`showOcrData(img, ocrData, ratio, color)`:
1. `getTextBoxList(ocrData)`: 각 결과의 `data.blocks`(블록 단위; 문단 단위 루프는 주석) 순회
   - `filterOcrText(text)`: 다음 문자 제거 — `` ` `` `・〉«¢~「」〃ゝゞヽヾ●▲♩ヽ÷①↓®▽■◆『£〆∴∞▼™↑←~@#$%^&“*()_|+-=;…【】:'"<>{}[]\/` (정규식 `/[...]/gi`).
   - `TextUtil.filterWord(text)`: 공백 정규화 후, 1000자 초과 / URL / "숫자·공백·특수문자·통화기호·이모지만으로 구성" 이면 `""`.
   - 공백뿐이거나 길이 < 2 또는 `block.confidence < 70`이면 제외. `confidence`는 `parseInt`, `text`는 필터된 값으로 교체.
2. 각 블록 bbox를 `/ ratio`로 보정.
3. `showTooltipBoxes(img, list)`:
   - `filterDuplicateOcr`: 이 이미지의 `ocrResultHistory`(모든 모드 누적)의 어느 항목과 **bbox 네 좌표 차가 모두 < 15px** 이거나 **텍스트 유사도 > 0.8**이면 제외. 이후 이번 리스트 **전체(제외된 것 포함)**를 이력에 concat.
   - 남은 블록마다 순차로 `translateWithOCRVendor(text)`:
     - 엔진 = `setting.translatorVendor`가 `"bing"`/`"google"`이면 그대로, 그 외는 강제 `"google"`.
     - `util.requestTranslate(text, translateSource, translateTarget, translateReverseTarget, engine)` → background `translate`.
   - 스킵 조건: `targetText`가 없거나 길이 < 2; `targetText.length > text.length * 7`(`textLengthMultiplier`); 이 이미지의 기존 번역문 중 유사도 > 0.8인 것이 있음.
   - 통과 시 `translatorHistory[src].push(targetText)` → `addTooltipBox`.
- 유사도 `calculateTextSimilarity` = `1 - Levenshtein / max(len1, len2)`.
- 병렬 5모드가 같은 이미지에 대해 경쟁하므로 **먼저 끝난 모드의 결과가 우선** 표시되고 비슷한 것은 걸러진다(결과가 실행마다 달라질 수 있음).

### 6.8 오버레이 렌더링 (현행 = tippy, textfit은 데드)
`addTooltipBox(img, textBox, text, targetLang)`:
- `calculateImgSegBoxSize(img, bbox)`: `widthRatio = img.offsetWidth / naturalWidth`, `heightRatio` 동일; `left = img.offsetLeft + x0*wr`, `top = img.offsetTop + y0*hr`, `width/height` 비율 적용.
- 앵커 `<div>`: `position:absolute; left; top: top + height*0.7; width; height:1px; z-index; pointer-events:none` → **`img.parentElement`에 append**.
  - [관찰] `offsetLeft/Top`은 offsetParent 기준인데 부모 요소에 append — 둘이 다르면 위치가 어긋난다.
- `zIndex = 100000 + text.length + confidence`.
- 내용 `<span>`: `text`(텍스트 노드, HTML 아님), `wordWrap: break-word; zIndex:100000; pointerEvents:auto; dir: getRtlDir(targetLang)`.
  - [관찰] `dir`을 jQuery `css`로 넣어 CSS 속성으로는 무효(HTML 속성 아님) — RTL 방향이 실제 적용되지 않을 가능성.
- `tippy(anchor, { content: span, allowHTML: true, theme: "ocr", placement: "top", zIndex, arrow: false, role: "mtttooltip", showOnCreate: true, hideOnClick: false, maxWidth: max(200, bbox.x1 - bbox.x0) + "px", popperOptions: flip(fallbackPlacements: []) · preventOverflow(altAxis:false, tether:false) · offset [0,0] })`.
  - [관찰] `maxWidth`는 natural 픽셀 폭 기준(표시 크기 아님).
- 호버: span `mouseenter` → `setProps({ theme: "transparent" })` + span `opacity: 0`(원본 이미지 글자를 볼 수 있게), `mouseleave` → `theme: "ocr"` + `opacity: 1`.
- `$(window).on("resize")`마다 앵커 재배치. [관찰] 핸들러가 해제되지 않음(툴팁마다 누적).
- 스타일(contentScript 주입 `<style>`, #345 스코프 규칙 준수):
  - `.tippy-box[data-theme~="ocr"]`, `[data-theme~="transparent"]`: `backdrop-filter: blur(tooltipBackgroundBlur)`, `background-color: tooltipBackgroundColor`, `border: 1px solid tooltipBorderColor`, box-shadow; `transparent`는 `opacity:0` + `transition: opacity .3s`.
  - `.tippy-content *`: `tooltipFontSize`, `tooltipTextAlign`, `tooltipFontColor`, 폰트 패밀리(`tooltipFont` 접두) 공통.
  - `[data-tippy-root]:has(> .tippy-box[data-theme~="ocr"|"transparent"])` → `display:inline-block; visibility:visible !important`.
  - **[관찰] CSS 버그**: `ocr`/`transparent` 테마의 `max-width: $1000px !important;` — `$`가 들어간 잘못된 값이라 무시된다(템플릿 리터럴 오타).
- 레거시(데드): `createOcrTextBlocks`/`createOcrTextBlock` — `.ocr_text_div notranslate` 박스를 모드 색 테두리로 그리고 `delay(100)` 후 `textfit($div, { alignHoriz: true, multiLine: true, reProcess: false })`. 호출이 주석 처리됨. 그러나 관련 흔적이 남아 있음:
  - contentScript CSS `.ocr_text_div { position:absolute; opacity:.4; color:transparent !important; border:2px solid CornflowerBlue; ... }`
  - `mouseover.js checkMouseTargetIsSpecialWebBlock()` — 대상 class가 `ocr_text_div`/`textFitted`면 감지 타입을 `"container"`로.
  - `textfit` npm 2.4.0 import(번들 크기만 차지).

### 6.9 정리(cleanup)
- `removeAllOcrEnv()`: 모든 `ocrHistory` 이미지 커서 복구 → iframe 제거(`iFrames[k].remove()`) → `.ocr_text_div` 제거 → 상태 초기화 → `hideAll({ duration: 0 })`(모든 tippy 숨김).
- 호출 경로: `contentScript.resetTooltipStatus()` — **설정 변경 콜백**(`getSetting`의 storage 변경 리스너)과 **destructor**(콘텐츠 스크립트 재주입) 에서만. 즉 페이지에서 OCR 결과는 설정을 바꾸거나 확장이 재로드되기 전까지 유지되고, 같은 이미지는 다시 OCR되지 않는다.
- [관찰] tippy 앵커 `<div>`(img.parentElement 안)와 tippy 인스턴스는 제거(destroy)되지 않고 숨겨지기만 한다. CSS 배경용 숨김 `<img>`도 남는다. iframe을 지운 뒤에도 `windowPostMessageProxy`의 pending promise는 남음.

---

## 7. Sandbox / CSP 정리

| 페이지 | 컨텍스트 | CSP | 제약/이유 |
|---|---|---|---|
| `pdfjs/web/viewer.html` | 확장 페이지(WAR) | manifest `extension_pages`: `script-src 'self' 'wasm-unsafe-eval'; object-src 'none'` | 인라인 스크립트 불가 → 모든 주입은 외부 파일. contentScript/pdfInject가 확장 API 직접 사용 |
| `foliate-js/reader.html` | 확장 페이지(WAR 아님) | manifest CSP + 자체 meta CSP(§5.1) | 외부 img/font 제한[추정] |
| `ocr.html` | 확장 페이지(WAR) | manifest CSP | 워커 wasm 컴파일에 `'wasm-unsafe-eval'` 필요. `browser.runtime.getURL` 사용 → sandbox 불가 |
| `opencvHandler.html` | **sandbox** (`manifest.sandbox.pages`) + WAR | Chrome 기본 sandbox CSP(인라인/`eval` 허용) | opaque(`null`) 출처, 확장 API 없음 → 응답은 `postMessage(..., "*")` 필수. 인라인 `var Module = {...}`는 sandbox라서 실행됨. opencv.js(구형 Emscripten 빌드)가 eval류를 쓸 수 있어 sandbox에 격리 |

- MV3 manifest CSP: `"extension_pages": "script-src 'self' 'wasm-unsafe-eval' ;  object-src 'none'"`. Firefox MV2: 같은 문자열을 `content_security_policy`로.
- Firefox MV2 manifest에는 `sandbox` 키가 없다 → opencvHandler.html이 일반 확장 페이지로 로드되어 인라인 `Module` 스크립트가 CSP로 차단될 것. [미검증] 이 경우 opencv.js가 기본 경로로 wasm을 찾는지, eval 사용 여부에 따라 bbox 계열 OCR이 Firefox에서 동작하는지는 실브라우저 확인 필요.
- Firefox MV2 WAR 목록: `pdfjs/web/viewer.html, ocr.html, opencvHandler.html, videoHandler.js, googleDocInject.js, subtitle.js, offscreen.js, popup.html`.

---

## 8. 관련 설정 키 (`src/util/setting_default.js`)

| 키 | 기본값 | i18nKey | 탭 | 옵션 | 사용처 |
|---|---|---|---|---|---|
| `detectPDF` | `"true"` | `Detect_PDF` | advanced | toggleList | contentScript `detectPDF`(`== "true"`), background 로컬 PDF(`== "false"`면 skip), Firefox 리다이렉트(`=== "false"`면 skip) |
| `uiLanguage` | `"auto"` | `UI_Language` | advanced | uiLanguageList | PDF.js `localeProperties`(§2.3) |
| `ocrLang` | `"jpn_vert"` | `OCR_Language` | main | `ocrLangList`(93개, `langOptionList: true`) | tesseract 언어 코드. 세로쓰기: `chi_sim_vert`, `chi_tra_vert`, `jpn_vert`, `kor_vert` → bbox 모드 PSM `SINGLE_BLOCK_VERT_TEXT`. 자동 감지 없음(#17) |
| `keyDownOCR` | `"ShiftLeft"` | `OCR_When` | keyboard | `keyListWithAlways`(`always` 포함) | `checkImage` 게이트(#46, #49) |
| `ebookTheme` | `"auto"` | `Ebook_Theme` | graphic | `{Auto:"auto", Light:"light", Dark:"dark"}` | foliate `reader.js`가 `storage.local`에서 직접 읽음(#201) |

간접 사용: `translatorVendor`(OCR은 bing/google만, 그 외 google), `translateSource`/`translateTarget`/`translateReverseTarget`(OCR 번역), 툴팁 스타일 키 `tooltipFontSize`·`tooltipTextAlign`·`tooltipFontColor`·`tooltipBackgroundColor`·`tooltipBackgroundBlur`·`tooltipBorderColor`·폰트(OCR 테마 CSS), `keyDownAutoReader`(PDF 뷰어 스크롤 분기).

i18n 키(이 영역): `PDF_Viewer`, `Translate_local_PDF_file`, `Ebook_Reader`, `Translate_local_ebook_file`, `Detect_PDF`, `OCR_Language`, `OCR_When`, `Ebook_Theme`, `Light`, `Dark`(+`Auto`). PDF 뷰어 안의 "Copy PDF URL"/"Copied!"/"Copy failed"와 file 권한 alert는 하드코딩 영어.

---

## 9. 관찰된 버그 / 데드 코드 (모음, 관찰만)

1. `pdfInject.js` `checkLocalFileType` — `?file=` 없으면 `null.toLowerCase()` TypeError → `initPdf` 중단(단축키/Copy URL/공백 보정 미설치). 기본 문서는 빌드에서 제외되어 404.
2. `pdfInject.js` `addSpaceBetweenPdfText` — 1회성 플래그라 이후 렌더된 페이지 미처리. `<br>` 제거가 문서 전체 대상.
3. `pdfInject.js` 데드: `waitUntilPdfLoad`, `changeUrlParam`, `changeUrlWithoutRedirect`, `initButton`, `DownloadFromUrl`.
4. `pdfInject.js` `addCallbackForPdfTextLoad`가 DOMContentLoaded 이후 `webviewerloaded` 리스너 등록 — PDF.js는 그 전에 이벤트를 쏘므로 `textlayerrendered` 훅은 데드, 공백 보정은 `waitCount` 타이머(1s~60s)로만 실행.
5. `contentScript` `pdfErrorLoadDocument` 리스너가 출처/소스 검증 없음. 블롭 폴백 이후 2차 실패 미처리[추정].
6. `injectRightPan.js` — `event.buttons` 미검사(우클릭 해제를 놓치면 팬 고착), 과다한 console.log.
7. `ebookEventInject.js`/`util.getEbookIframe` — shadowRoot 인덱스 `[1]` 하드코딩. `isEbookReader()` 완전 일치 비교로 `?url=` 시 false. `clientX == 0`이면 `""`. shift/alt/meta 미전달. 선택 감지 지연 0.7s 고정.
8. `ocrView.js` — iframe 크기 `"1"` 문자열(px 없음, 무효값 가능)[추정], iframe 생성 경쟁 조건, 타임아웃 없는 pending promise, resize 핸들러 누수, 앵커/tippy 미파기, `dir`을 CSS로 지정, `maxWidth`가 natural 픽셀, offsetParent ≠ parentElement 위치 오차.
9. `util.getPointedImg` — CSS 배경 이미지일 때 mousemove마다 숨김 `<img>` 누적.
10. `opencvHandler.js` — `sortBbox` 비교자 불완전, `resizeImage`의 미선언 `base64`(데드), Mat 누수, `opencvImg` 항상 undefined, `waitOpencvLoad` 5초 기본 타임아웃으로 첫 실행 bbox 모드 무결과 가능.
11. `opencvHandler.html` 인라인 `opencvIsReady()` 미사용.
12. 레거시 박스 오버레이(`createOcrTextBlocks`, textfit, `.ocr_text_div`, `textFitted` 감지) 데드지만 CSS/감지 코드 잔존.
13. contentScript CSS `max-width: $1000px` 오타(`ocr`, `transparent` 테마).
14. OCR 메시지가 페이지 window를 경유 → 페이지 스크립트가 이미지/결과 열람·위조 가능.
15. Firefox: opencv sandbox 부재로 bbox OCR 동작 [미검증]; file 권한 alert 경로가 `chrome://`로 이동 시도.
16. tesseract 학습데이터를 CDN에서 받음(오프라인 불가, `langPath` 미지정).

---

## 10. 재작성 체크리스트

### 10.1 불변식 (깨지면 조용히 실패)
- [ ] 출력 파일명 `pdfInject.js`, `ebookEventInject.js`, `ocrIframe.js`, `opencvHandler.js`, `contentScript.js`가 `build/` 루트에 존재(viewer.html/reader.html/ocr.html/opencvHandler.html이 하드코딩).
- [ ] viewer.html 주입 순서: classic `contentScript.js` → `pdfInject.js` → `injectRightPan.js`가 module `viewer.mjs`보다 **먼저 실행**되어 `webviewerloaded`를 놓치지 않을 것(재작성 결과를 module로 바꾸면 defer되어 순서가 깨진다).
- [ ] `viewer.mjs`의 `validateFileURL(file)` 비활성 유지.
- [ ] doq는 raw ES 모듈 — bare import 금지(#339).
- [ ] tesseract 버전 3자 일치: 번들 `tesseract.js` 5.0.3 ↔ `public/tesseract/worker.min.js`(5.0.3) ↔ `tesseract-core-lstm.wasm.js`(core 5.0.0). `workerBlobURL:false`, OEM 1, `corePath`는 `.js` 파일 지정.
- [ ] iframe name `ocrFrame` / `opencvFrame`(이름에 `Debug` 포함 시 디버그 모드), 프레임은 `window.parent.postMessage(resp, "*")`로 `windowPostMessageProxy` 필드를 **그대로 에코**.
- [ ] `opencvHandler.html`은 sandbox 유지(확장 API 사용 금지), `ocr.html`은 비-sandbox(`runtime.getURL` 사용).
- [ ] manifest CSP에 `'wasm-unsafe-eval'` 유지, viewer/ocr/opencvHandler를 WAR에 유지.
- [ ] `getPDFUrl`의 `encodeURIComponent`(#11), `?file=` 파라미터명.
- [ ] 주입 CSS는 `data-theme~="ocr"|"transparent"`로 스코프(#345).

### 10.2 수동 회귀 시나리오
- [ ] Chrome에서 웹 PDF(https) 열기 → 문서가 `#mttPdfIframe` 래퍼로 교체, **주소창은 원 .pdf URL 유지**, 뷰어 안 마우스오버/선택 번역 동작.
- [ ] iframe에 임베드된 PDF도 하이재킹되는지.
- [ ] 인증/CORS로 PDF.js가 직접 못 여는 PDF → `documenterror` → 블롭 URL로 재마운트.
- [ ] `detectPDF=false` → Chrome 네이티브 뷰어 그대로, 로컬 PDF 리다이렉트 없음, Firefox 리다이렉트 없음.
- [ ] 로컬 `file:///x.pdf` 탭 로드(또는 드래그&드롭) → viewer.html로 `tabs.update`.
- [ ] "Allow access to file URLs" 꺼진 상태로 로컬 PDF → 정확한 alert 문구 후 `chrome://extensions/?id=<id>` 새 탭.
- [ ] `file://` 이지만 `.pdf`로 끝나지 않는 URL → `viewer.html?file=`로 replace.
- [ ] Tools 메뉴 맨 위 "Copy PDF URL"(웹 PDF에서만) → 클립보드에 디코드된 원 URL, "Copied!" 1.2초 표시. 로컬/데모 PDF에선 버튼 없음.
- [ ] 뷰어에서 수식키 없이 `T` → 자유 텍스트 도구, `D` → 잉크 도구. 입력창 포커스 중엔 무시.
- [ ] `uiLanguage` 설정(예: ko, fil→tl, no→nb-NO)에 따라 PDF.js 툴바 언어 변경, `auto`면 브라우저 언어.
- [ ] 줄 단위 span 사이에 공백/개행이 삽입되어 문장 단위 마우스오버가 줄을 넘어 동작(초기 렌더 페이지 기준).
- [ ] doq 다크/리더 모드 토글 및 새로고침 후 유지(localStorage).
- [ ] 우클릭 드래그(5px 초과) → 팬, 드래그 후 컨텍스트 메뉴 안 뜸, 단순 우클릭은 메뉴 뜸, 손 도구 활성 시 PDF.js에 위임, 링크/버튼 위에선 팬 안 함.
- [ ] 자동 읽기(F2)가 PDF 뷰어에서 `#viewerContainer`를 스크롤.
- [ ] about 페이지 → PDF Viewer(데모 PDF), Ebook Reader 새 탭.
- [ ] 이북: 파일 드롭/선택, `?url=` 열기, 본문 마우스오버 번역(좌표 보정), 드래그 선택 번역, 키 이벤트(툴팁/TTS 키)가 iframe 포커스 상태에서 동작, 섹션 이동 후에도 재바인딩.
- [ ] `ebookTheme` light/dark/auto → 리더 재오픈 시 배경/글자색 강제 적용.
- [ ] OCR: `keyDownOCR`(기본 ShiftLeft) 누른 채 150×150 초과 이미지 위 이동 → 커서 wait → 이미지 위 블록별 번역 툴팁(테마 ocr) 표시 → 툴팁 호버 시 투명화, 이탈 시 복원 → 창 리사이즈 시 위치 추종.
- [ ] `keyDownOCR = always` → 키 없이 동작.
- [ ] 같은 이미지 재호버 시 재OCR 안 함; 설정 변경 시 OCR 오버레이/iframe 제거 후 다시 가능.
- [ ] 인라인 `background-image` 요소 위에서도 OCR.
- [ ] `ocrLang`을 세로쓰기(`jpn_vert`)/가로쓰기(`eng`)로 바꿔 결과 확인. 첫 사용 시 CDN에서 traineddata 다운로드(네트워크 탭).
- [ ] `translatorVendor`가 deepl 등이면 OCR은 google로 번역.
- [ ] 디버그 프레임 이름(`ocrFrameDebug`/`opencvFrameDebug`)으로 700×700 프레임과 단계별 canvas 확인 가능.
- [ ] Firefox: 웹 `.pdf` main_frame → 우리 뷰어로 리다이렉트(루프 없음), 로컬 PDF는 내장 뷰어. OCR bbox 모드 동작 여부 확인.

### 10.3 재작성 시 결정 필요 항목(현행 유지 vs 수정)
- `addSpaceBetweenPdfText` 1회성 한계, `checkLocalFileType` null 크래시, `sortBbox`, `max-width: $1000px`, `dir` 미적용 — "동일 기능" 기준이면 동작을 그대로 재현하되, 수정한다면 체크리스트에 명시.
- jQuery 제거 시 대체 대상: `$("br").remove()`, `$(".page span:not(:has(*))")`(`:has` 지원 필요 → `querySelectorAll` 후 `childElementCount === 0` 필터), `$(fn)`(DOMContentLoaded), `$("<iframe/>").on("load")`, `$(window).on("resize")`, `.css({...})`(jQuery는 number 값에만 `px`를 붙임 — OCR iframe의 `width:"1"`은 문자열이라 무효값일 가능성, §6.2; 재작성 시 의도(`1px`)대로 할지 현행 재현할지 결정).
- `webextension-polyfill` 제거 시: `ocrIframe.js`의 `browser.runtime.getURL`, `util.hasFilePermission`(`chrome.extension.isAllowedFileSchemeAccess` 콜백/Promise), `reader.js`는 이미 `globalThis.browser || globalThis.chrome` 사용.
