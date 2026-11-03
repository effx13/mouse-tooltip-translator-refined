# 콘텐츠 스크립트 / 인페이지 툴팁 — 동작 명세 (재작성용 회귀 기준)

대상: `src/contentScript.js`, `src/event/mouseover.js`, `src/event/selection.js`, `src/event/pageTranslate.js`, `src/event/savedHighlight.js`, `src/googleDoc/googleDocInject.js`, `public/tippy.css`, 그리고 이들이 쓰는 `src/util/index.js`, `src/util/text_util.js`, `src/util/dom.js`, `src/util/lang.js`, `src/speech/index.js` 일부.

목적: TypeScript + Svelte(jQuery/polyfill 제거)로 재작성할 때 **동일 동작**을 보장하기 위한 행동 명세. "왜 이렇게 되어 있는지"는 코드 주석의 이슈 번호(#NNN)를 그대로 남겼다. 설정 스키마 자체는 다른 문서가 다루며, 여기선 키 이름과 기본값만 언급한다.

> 기준 시점: 작업 트리(`chore/modernize-tooling`). `contentScript.js`/`util/index.js`/`text_util.js`의 미커밋 diff는 정규식 이스케이프만 바뀐 것(`[\/?#]`→`[/?#]`, `/^file:\/\//`→`startsWith("file://")` 등)으로 의미 동일.

---

## 0. 로딩 컨텍스트

### 0.1 주입 경로
| 경로 | 방식 | 비고 |
|---|---|---|
| 모든 웹 페이지 | manifest `content_scripts`: `js: ["contentScript.js"]`, `css: ["tippy.css"]`, `run_at: "document_start"`, `all_frames: true`, `matches: ["<all_urls>"]`, `match_about_blank: true` | MV3(`manifest.json`)·Firefox MV2(`manifest.firefox.json`) 동일 |
| 번들 PDF.js 뷰어 | `public/pdfjs/web/viewer.html` 이 `<script src="../../contentScript.js">` 로 직접 로드 | 확장 페이지 origin. 같은 페이지에 `pdfInject.js`도 로드 |
| EPUB 리더(foliate-js) | `public/foliate-js/reader.html` 이 `<script src="/contentScript.js">` + `<script src="/ebookEventInject.js">` 로드 | 확장 페이지 origin |
| 설치/업데이트 시 | background `injectContentScriptForAllTab()` 가 열린 탭에 재주입 (chrome://, edge://, file://, 웹스토어, chrome-extension:// 제외) | 기존 스크립트 제거는 아래 destructor 이벤트로 |

- 빌드 산출물 이름 `contentScript.js`, `googleDocInject.js`, `ebookEventInject.js`, `subtitle.js`, `tippy.css` 는 manifest·HTML·`getURL()`에 하드코딩 → **이름 변경 금지**. content script와 `<script src>` 주입물은 ES module 불가(IIFE).
- **프레임마다 독립 인스턴스**: 각 frame(iframe 포함)이 자기 툴팁·키 상태·`extensionDisabled`를 가진다. 프레임 간 조율은 background 경유 TTS 정지/`killAutoReaderTabs`뿐.

### 0.2 초기화 순서 (`initMouseTooltipTranslator`, 전부 try/catch로 감싸 오류 시 `console.log`)
1. `injectGoogleDocAnnotation()` — Google Docs면 `<script src=getURL("googleDocInject.js")>` 를 `document.documentElement`에 추가(MAIN world 실행).
2. `bindBookFusionIframe()` — `reader.bookfusion.com`이면 1초 폴링으로 epub iframe 이벤트 브리지 설치.
3. `loadDestructor()` — `window`에 `CustomEvent("destructmyextension_MouseTooltipTranslator")` dispatch(이전 인스턴스 정리) 후 자신도 같은 이벤트에 destructor 등록.
4. `await getSetting()` — `SettingUtil.loadSetting(callback)`; 이어서 `applyPerSiteTargetLang()`(#262), `rebuildKeyBindings()`(#352).
5. `checkExcludeUrl()` 가 true면 **여기서 종료**(이 프레임에는 아무 기능도 없음. 단 2·3단계 및 GoogleDoc 스크립트는 이미 실행됨).
6. `await dom_util.waitJquery()` — jQuery `$(fn)` = DOMContentLoaded 대기.
7. `detectPDF()` — `detectPDF=="true"` && `util.isPDF()`면 문서를 뷰어 iframe으로 재작성하고 **종료**(래퍼 문서엔 툴팁 스택 없음).
8. `checkVideo()` — `subtitle` 모듈(Youtube/Netflix/YoutubeNoCookie/SVT) 각각 `handleVideo(setting)`.
9. `checkGoogleDocs()` — Google Docs면 텍스트 이벤트 iframe의 keydown/keyup 포워딩.
10. `addElementEnv()` — `#mttContainer`, `#mttstyle`, `#mttstyleSubtitle`, tippy 인스턴스 생성.
11. `applyStyleSetting()` — tippy props + 주입 CSS.
12. `addMsgListener()` — `CopyRequest`, `killAutoReaderTabs`.
13. `loadEventListener()` — mousemove/touchstart/scroll/keydown/keyup/mousedown/mouseup/blur/beforeunload/focusin.
14. `loadSpeechRecognition()`.
15. `startMouseoverDetector()` / 16. `startTextSelectDetector()`.
17. `refreshSavedWordHighlight(setting)`.

### 0.3 이벤트 등록 규칙
- `addEventHandler(name, fn, capture=true)` = `window.addEventListener(name, fn, {capture, signal})`. 공용 `AbortController`의 `signal` → destructor에서 `controller.abort()`로 일괄 해제.
- **예외**: `mouseover.js`(mousemove, scroll), `selection.js`(selectionchange, mouseup, mousedown)의 리스너는 signal 없이·비capture로 등록 → destructor 후에도 남는다(관찰 §18).
- 커스텀 이벤트 버스: `mouseoverText`(evt.mouseoverText = `{mouseoverText, mouseoverRange}`), `selectionEnd`(evt.selectedText) — 모두 `document.dispatchEvent`로 쏘고 contentScript는 `window` capture로 받는다.

### 0.4 destructor
`resetTooltipStatus()` → `#mttstyle`/`#mttstyleSubtitle` 제거 + `tooltip.destroy()` → `cleanupSavedWordHighlight()` → `controller.abort()`. (`#mttContainer`는 직접 제거하지 않지만 tippy destroy + `hideTooltip`의 3초 타이머가 제거.)

---

## 1. 마우스오버 번역

### 1.1 흐름
1. `mouseover.js`의 `window` `mousemove` → 좌표 갱신 + `debounce(mouseoverEventInterval ms)` 트리거. `window` `scroll`(비capture, 문서 스크롤만)도 같은 debounce 트리거.
   - `mouseoverEventInterval` 기본 `"300"`(옵션 0~1000, 50 단위, #235). **시작 시 1회만 읽음** → 변경은 페이지 새로고침 전까지 반영 안 됨.
2. debounce 만료 → `getMouseoverText(clientX, clientY)` → `{mouseoverText, mouseoverRange}` → `mouseoverText` 이벤트.
3. contentScript `stageTooltipTextHover(event)`:
   - `hoveredData = event.mouseoverText` 저장(auto reader·보조언어 키가 재사용).
   - 조건: `translateWhen` 에 `"mouseover"` 포함(`"mouseover"` | `"mouseoverselect"`, 기본 `"mouseoverselect"`) && hoveredData 존재 && `!isOtherServiceActive()` && `!isTooltipSuppressedWhileWriting()` → `stageTooltipText(text, "mouseover", range)`.
   - `isOtherServiceActive()` = `listenText`(음성인식 결과 표시 중) || `isAutoReaderRunning` || `selectedText`(선택 텍스트가 있으면 마우스오버 무시).
   - `isTooltipSuppressedWhileWriting()` (#186) = `mouseoverWhileWriting === "false"`(기본 "false") && Google Docs 아님 && 포커스가 쓰기 필드. → **기본값에서는 입력 중 마우스오버 툴팁이 안 뜬다.**

### 1.2 감지 타입 결정 (`getMouseoverType`)
1. 보조언어 사용 중(`keySecondaryLang != "null"` && 그 키 down && `translateTarget2 != "null"`)이면 `mouseoverTextType2`, 아니면 `mouseoverTextType` (둘 다 기본 `"sentence"`, 옵션 `word`/`sentence`/`container`).
2. `keyHoldMouseoverTextType`(기본 `F8`) down이면 스왑: `word`→`sentence`, 그 외(`sentence`, **`container`도**)→`word`.
3. 마우스 타겟의 classList에 `ocr_text_div`(OCR 오버레이 블록) 또는 `textFitted` 가 있으면 무조건 `"container"`. (`textFitted`의 출처는 repo 내에 없음.)

### 1.3 커서 아래 Range 찾기 (`getPointedRange`) — 순서대로 첫 성공
1. `caretRangeFromPoint(x, y, _win.document)` — `document.caretRangeFromPoint`(Chromium) 없으면 `caretPositionFromPoint`(Firefox)로 collapsed range 생성. **startContainer가 텍스트 노드가 아니면 실패**.
2. `caretRangeFromPointOnPointedElement` — `document.elementsFromPoint(x,y)` 중 `offsetHeight<1000 && offsetWidth<1000`인 것만 남기고 **마지막(가장 바깥)** 요소 아래 텍스트 노드(`STYLE`/`SCRIPT`/`TITLE` 부모 제외)를 전수 → 공백 아닌 노드 중 박스가 (x,y) 포함 → 각 문자 range(`getCharRanges`: `i < length-1`까지, 즉 **마지막 문자는 후보에서 빠짐**) 중 (x,y) 포함 첫 번째.
3. `caretRangeFromPointOnShadowDom` — `util.getAllShadows()`(body 하위 모든 open shadowRoot 재귀) 중 host 박스가 (x,y) 포함하는 것들의 텍스트 노드로 2와 같은 방식.

### 1.4 Range 확장 (`expandRange(range, type, useSegmentation)`)
- range가 없거나 startContainer가 분리(`!isConnected`)되면 undefined (#104, 콘솔 스팸 방지). 예외는 catch 후 `console.log`.
- `type=="container"`: `getContainerRange` — 시작 노드에서 **인라인 요소(display `inline*`/`ruby`/`contents`)를 타고 올라가** 가장 가까운 블록 조상(body/html 직전에서 정지)의 내용 전체(`selectNodeContents`) (#254, X.com처럼 줄마다 span으로 쪼갠 사이트). 블록 조상 못 찾으면 기존 방식(startContainer 자체 선택 후 start offset 0).
- 세그멘테이션 경로(`shouldUseSegmentation()` = `isFirefox()` || PDF 뷰어, 또는 fallback에서 `useSegmentation=true`): `expandRangeWithSeg` (§1.5).
- 그 외(Chromium): `range.cloneRange().expand("word"|"sentence")`.
- `isFirefox()`(mouseover.js 내부)는 UA가 아니라 **feature detect**: `!document.createRange().expand`.

### 1.5 세그멘테이션 경로 (`expandRangeWithSeg`)
1. 원 range의 첫 client rect 중심 (x,y) 계산(마우스 좌표가 아님).
2. container range의 `commonAncestorContainer` 전체 텍스트(`getNodeText`, 자식 텍스트 연결).
3. `new Intl.Segmenter("en-US", {granularity: type})` 로 분절 — **로케일 고정 en-US** (언어 무관).
4. 커서가 가리키는 문자 1개(`getCurrentMousePointedChar`)를 찾고, 그 문자를 포함하는 세그먼트만 후보로.
5. 후보를 **직전에 맞춘 세그먼트 인덱스(`prevWordSegIndex`)와의 거리순** 정렬 → 각 후보를 `selectNode`(자식 길이 누적, `nodeLengthCache` WeakMap 캐시)로 노드/오프셋 변환 → (x,y)가 rect 안이면 채택하고 `prevWordSegIndex` 갱신.
6. 실패 시 null.

### 1.6 텍스트 추출 (`getTextFromRange`)
- `expandRange` 결과 range의 boundingClientRect가 **마우스 좌표(clientX/Y)를 포함할 때만** 텍스트 채택. 아니면 `mouseoverText:""`, `mouseoverRange`는 원 range.
- 텍스트 = `util.extractTextFromRange(range)` = `range.cloneContents()` → `ruby>rt` 제거(후리가나) → `textContent` → `TextUtil.filterWord`:
  - 공백 런을 한 칸으로, trim.
  - 1000자 초과 / `is-url` 판정 URL / 숫자·공백·기호·통화기호·이모지(`\p{Extended_Pictographic}`)로만 구성 → `""` (= "텍스트 없음" → 툴팁 숨김 경로).
- **fallback**: 세그멘테이션 경로가 아니고 타입이 word/sentence인데 결과가 비었고, 같은 지점을 container로 확장하면 텍스트가 나오면 → 세그멘테이션으로 재시도(`getTextFromRange(range, type, true)`). (Chromium `expand`가 실패하는 레이아웃 대비.)

### 1.7 Google Docs 경로 (`getGoogleDocText`) — 캔버스 렌더링 문서
- `googleDocInject.js`(MAIN world)가 `window._docs_annotate_canvas_by_ext = "clfoagbcljppiogigjclfjnjpcijnijl"` 설정 → Docs가 캔버스 위에 `aria-label` 달린 SVG `<rect>` 주석을 렌더(Amaimersion/google-docs-utils#10).
- `getGoogleDocRect`: 최초 1회 `<style id="enable-pointer-events-on-rect">` 추가:
  ```css
  .kix-canvas-tile-content{pointer-events:none!important;}
  #kix-current-user-cursor-caret{pointer-events:none!important;}
  .kix-canvas-tile-content svg>g>rect{pointer-events:all!important; stroke-width:7px !important;}
  ```
  호출 때마다 style을 잠깐 enable → `elementFromPoint` → 다시 disable.
- `rect`의 `aria-label` 텍스트로 SVG `<text>`를 rect 옆에 생성(`x`,`y`,`transform`,`data-font-css` 폰트 복사, `all: initial`, 세로 중앙 보정 translate) → 이진 탐색으로 커서 아래 문자 range → 일반 `getTextFromRange` → `<text>` 제거.
- 선택 텍스트도 별도 경로(§2.3).

### 1.8 iframe / 전자책 / BookFusion 좌표 브리지
- 일반 iframe: 각 frame의 자체 content script가 처리(§0.1).
- EPUB 리더(`ebookEventInject.js`, 별도 번들)와 BookFusion(`bindBookFusionIframe`, contentScript 내부)은 내부 iframe의 `mousemove`(/`keydown`/`keyup`)를 받아 상위 window·document에 `CustomEvent`로 재발행:
  - `evt.ebookWindow = iframe.contentWindow`, `evt.iframeX/iframeY` = iframe 로컬 좌표, `evt.clientX/clientY` = 상위 좌표(BookFusion은 CSS scale 보정: `rect.width / offsetWidth`).
  - 키 이벤트는 `key`, `code`, `ctrlKey`만 복사.
- `mouseover.js`는 `e.ebookWindow`가 오면 `_win = ebookWindow`, `_isIframe = true`, 좌표 = `iframeX/Y`. 이후 `_isIframe`은 **다시 false가 되지 않음**(관찰 §18).
- 하이라이트 위치 보정: ebook 리더면 `util.getEbookIframe()` rect 오프셋, BookFusion이면 활성 iframe rect + scale.
- BookFusion 선택: iframe 문서 `selectionchange` 700ms debounce + `mouseup`(capture, BookFusion 핸들러가 선택을 지우기 전) 즉시 → `selectionEnd` dispatch. mouseup에서 텍스트가 있었으면 3000ms 동안 빈 선택 dispatch 잠금(`selectionDispatchLock`), `lastGoodSelection` 보존. BookFusion에선 일반 `enableSelectionEndEvent`를 켜지 않는다.
- BookFusion iframe 셀렉터: `iframe[id^="bf-epub-view-"]` (1000ms 폴링, WeakSet으로 중복 바인딩 방지, abort 시 interval 해제).

---

## 2. 드래그 / 선택 번역

### 2.1 감지 (`selection.js` `enableSelectionEndEvent(window, setting["tooltipEventInterval"])`)
- `tooltipEventInterval` 키는 `setting_default.js`에 **존재하지 않음** → `undefined` → 기본 파라미터 `0.7`초 → **실효 debounce 700ms 고정** (관찰 §18).
- `selectionchange`(debounce 700ms) — 키보드 선택, 메뉴의 "모두 선택" 등도 포함.
- `mouseup` 즉시 트리거(700ms 지연 단축). 단 mousedown·mouseup 대상이 모두 `user-select: none`이면 `""`로 트리거.
- 결과 `selectionEnd` 이벤트(evt.selectedText).

### 2.2 텍스트 (`getSelectionText` → `getWindowSelection`)
- 모든 selection range의 `cloneContents()`를 div에 모아 `extractTextFromHtml`(rt 제거 + `filterWord`).
- `ruby>rt` 가 있으면 필터된 텍스트 우선(후리가나 중복 낭독 방지 #120), 없으면 `getSelection().toString()` 우선.

### 2.3 Google Docs 선택 (`getGoogleDocSelection`)
- `.docs-texteventtarget-iframe` 내부 `[contenteditable=true]`에 `CustomEvent("copy")` dispatch → Docs가 iframe에 선택 내용을 렌더 → iframe의 모든 `span` 텍스트를 공백으로 이어 trim.

### 2.4 처리 (`stageTooltipTextSelect`)
- 조건: `translateWhen`에 `"select"` 포함 && `!isOtherServiceActive(true)`(선택 자체는 제외하고 음성인식/auto reader만 확인).
- `prevSelected = selectedText; selectedText = event.selectedText`.
- `selectText = selectedText.replace(/\s+/g, " ").trim()` — 여러 줄 드래그(특히 PDF)를 한 문장으로 번역/낭독.
- 선택 텍스트가 있으면 `mouseMoved = true` (정지 상태 더블클릭은 mousemove가 없고, mousedown의 click-to-hide(#114)가 `mouseMoved=false`로 만들었기 때문). 단순 클릭(빈 선택)은 숨김 유지.
- `stageTooltipText(selectText, "select")` (range 없음 → 선택 시 하이라이트 박스 없음).

---

## 3. 핵심 게이팅: `stageTooltipText(text, actionType, range)`

`actionType` ∈ `"mouseover"` | `"select"` | `"listen"`(음성인식). 이 값은 `recordTooltipText`로 background에 전달되어 히스토리 기록/자동 그룹 결정에 쓰인다(계약).

사전 계산:
- `isTtsOn` = `isActionActive("TTSWhen")` || (`TTSWhen=="select"` && `actionType=="select"`).
- `isTtsSwap` = `keyDownDoublePress[setting.TTSWhen]` (TTS 키 더블프레스).
- `useSecondary` = `keySecondaryLang != "null"` && `isActionActive("keySecondaryLang")` && `translateTarget2 != "null"`.
- `isTooltipOn` = `isActionActive("showTooltipWhen")` || `useSecondary`.
- `isActionActive(name)` = `setting[name]`이 비어있지 않고 `"null"`이 아니며 `keyDownList[thatKey]`가 truthy. `keyDownList.always`는 항상 true이므로 값 `"always"`는 상시 활성.
- `timestamp = Date.now()`.

순서대로:
1. **조용히 무시(return, 상태 변화 없음)**: `extensionDisabled`(#126) || `!checkWindowFocus()` (= `mouseMoved && document.visibilityState=="visible"`) || 마우스 타겟이 툴팁 popper 내부 || `stagedText == text`(같은 텍스트 재처리 방지) || `!util.isExtensionOnline()`(`browser.runtime.id` 없음 = 확장 리로드 후 고아 스크립트) || (`selectedText == prevSelected && !text && actionType=="select"`) (선택 깜빡임 방지).
2. `!text` → `stagedText = text`, `hideTooltip()`, return.
3. 툴팁·TTS 둘 다 off → `hideTooltip()`, return. (stagedText 갱신 안 함)
4. 툴팁만 off(TTS on) → `hideTooltip()` 후 계속.
5. `isExcludedByRegex(text)` (#36): `translateExcludeRegex`(기본 `""`)를 `new RegExp(src)`로 lazy 컴파일·캐시, 잘못된 패턴은 무시(제외 안 함). 매치 → `stagedText = text`, hide, return.
6. `stagedText = text` → `requestTranslate(text, translateSource, useSecondary ? translateTarget2 : translateTarget, translateReverseTarget)`.
7. 응답 도착 후 `stagedText != text`면(더 최신 요청이 있음) 폐기.
8. `!targetText` || `isRedundantTranslation(text, targetText, sourceLang, targetLang)` || `isLangExcluded(langExcludeList, sourceLang)` → hide, return.
   - `isRedundantTranslation`: 코드 동일 → true. `isSameLanguage`(bcp-47 파싱, `zh` 지역태그는 다른 언어 취급, script 지정 시 script 일치 필요, base vs region 은 같음)가 아니면 false. 같은 언어군(예: pt vs pt-PT)이면 공백 정규화 후 원문==번역문일 때만 true (#257).
   - `isLangExcluded`: 목록 항목과 정확 일치 또는 `isSameLanguage` (pt-BR 항목이 감지된 `pt`에 매치).
   - 주의: 이 필터들은 **번역 요청을 이미 보낸 뒤** 적용된다.
   - `isBroken` 응답(엔진 실패 시 background가 `targetText: "<engine> is broken"`로 채움)은 걸러지지 않아 **그 문구가 툴팁에 표시된다**.
9. `isTooltipOn` → `handleTooltip(text, translatedData, actionType, range)`.
10. `isTtsOn` → `handleTTS(text, sourceLang, targetText, targetLang, timestamp, false, isTtsSwap)`.

### 3.1 TTS 트리거 (`handleTTS` → `callTTS`)
- `requestKillAutoReaderTabs(true)`(모든 탭·자기 탭 포함 auto reader 중지) → `delay(50)` → `requestTTS(...)`.
- 일반: `requestTTS(text, sourceLang, targetText, targetLang, timestamp+100, noInterrupt)`.
- swap(TTS 키 더블프레스, 1초 이내 재입력): 원문/번역 자리를 바꿔 `requestTTS(targetText, targetLang, text, sourceLang, ...)` → background의 `voiceTarget`(source/target/sourcetarget/targetsource) 해석이 뒤집혀 번역문이 먼저/대신 읽힌다.
- **timestamp 계약**(background `TTS`): `stopTTS(ts, force)`는 `noInterrupt` 재생 중이면 `force`일 때만 동작; `ts < stopTtsTimestamp`면 무시; 아니면 `stopTtsTimestamp = ts`로 올리고 정지. `playTts`는 자기 timestamp가 `stopTtsTimestamp`보다 작으면 재생하지 않음. 그래서 `requestStopTTS(Date.now()+500)`은 "지금부터 500ms 안에 요청될 TTS까지 차단"하는 효과(타이핑 중 낭독 억제).

---

## 4. 툴팁 렌더링 (`handleTooltip`)

- 설정: `tooltipInfoSourceText`(기본 false), `tooltipInfoSourceLanguage`(false), `tooltipInfoTransliteration`(false), `tooltipWordDictionary`(true).
- 본문 우선순위: `wrapMainImage(imageUrl)` (이미지 엔진 `googleWebImage`) → `wrapDict(dict)` (사전 on이고 dict 존재) → `wrapMain(targetText)`.
- 부가 정보(순서 고정): 원문 `<i>` → 음역 `<b>` → 원문 언어명 `<sup>`.
- HTML 형태(jQuery로 생성, 텍스트는 이스케이프됨):
  - `wrapMain`: `<span dir="{rtl|ltr of targetLang}">{targetText}</span>`
  - `wrapDict`: dict를 `\n`으로 나눠 줄마다 첫 `:` 까지를 `<b>`, 나머지를 `<span>`(콜론 없으면 줄 전체 `<span>`) → `\n`으로 join → `<span dir="{targetLang}">…</span>` 으로 감쌈. (전역 replace가 아니라 줄 단위 — 반복/부분문자열 라벨 대응, Wiktionary 등 공통.)
  - `wrapInfoText(text, tag, dirLang)`: `<{tag} dir="{getRtlDir(dirLang)}">\n{text}</{tag}>` — 앞에 개행 문자가 들어가고 CSS `white-space: pre-line`으로 줄바꿈된다. `<i>`만 sourceLang 방향, `<b>`/`<sup>`은 `getRtlDir(null)` = `ltr`.
  - `wrapMainImage`: `<img src="{imageUrl}" class="mtt-image">`
- 언어명: `getLocalizedLangName(sourceLang, langListOpposite[sourceLang], getUiLangCode())` — UI 언어는 `uiLanguage`(기본 `"auto"`; `_`→`-`), auto면 `navigator.language`, 없으면 `"en"`. en*이면 영문명, 아니면 `Intl.DisplayNames`로 현지화(첫 글자 대문자, tesseract `_vert`/`chi_sim` 처리).
- 표시 후: `requestRecordTooltipText(text, sourceLang, targetText, targetLang, dict, actionType)` (히스토리 + 컨텍스트 메뉴 "Copy : …" 갱신) → `highlightText(range)`.

### 4.1 RTL
- `getRtlDir(lang)` = `rtlLangList.includes(lang) ? "rtl" : "ltr"`. 적용처: 본문 span, dict 래퍼, 원문 `<i>`, 자막 CSS `.caption-visual-line { direction: getRtlDir(translateTarget) }`.
- `rtlLangList`(그대로 유지할 것): `ar, az, bm, dv, doi, ha, iw, kk, ku, ckb, ky, ml, ms-Arab, pa-Arab, ps, fa, sd, so, su, tg, tk, ur, ug, uz, yi, yo` (lang.js 351행, 전체 목록). 실제 LTR 문자 언어(az, kk, ky, ml, su, tg, tk, uz, yo 등)가 섞여 있음 → 관찰 §18.

### 4.2 텍스트 하이라이트 (`highlightText(range, force)`)
- `mouseoverHighlightText=="false"`(기본)이거나 range 없으면 생략(auto reader는 `force=true`).
- `range.getClientRects()` → `util.filterOverlappedRect`(동일 rect 제거, 다른 rect에 완전히 덮이는 rect 제거) → rect마다 `<div class="mtt-highlight" style="position:absolute;left;top;width;height">`를 **`body`** 에 추가(스크롤 오프셋 + ebook/BookFusion 보정).
- 제거: `hideHighlight()` = `$(".mtt-highlight").remove()`; capture `scroll` 시 `hideHighlight(true)`(auto reader 실행 중엔 유지).
- 색: `mouseoverTextHighlightColor`(기본 `#21dc6d40`).

---

## 5. 툴팁 lifecycle / 위치 / 스타일

### 5.1 DOM 구조
- `#mttContainer`: `<div id="mttContainer" class="notranslate" contenteditable="false" data-mtt="1">` — 툴팁의 tippy **reference**(앵커). 처음엔 DOM에 없음; `showTooltip`에서 없으면 **`document.documentElement`(=`<html>`) 에 append** (body 아님: React/SvelteKit(Open WebUI 등)이 body 자식 reconcile 중 `NotFoundError`로 크래시, SPA/View-Transitions에서 body 교체).
- `contenteditable=false` + `data-mtt` = 리치 에디터/페이지 빌더에 직렬화되지 않게(#102, #115).
- `<style id="mttstyle">`, `<style id="mttstyleSubtitle">` 를 `head`에 추가. `showTooltip` 때 `#mttstyle`이 사라졌으면 다시 `head`에 append(`#mttstyleSubtitle`은 재부착 안 함).
- tippy 인스턴스 (`tippy.js` + `sticky` plugin):
  ```js
  { content: "", trigger: "manual", allowHTML: true, theme: "custom", zIndex: 100000200,
    hideOnClick: false, role: "mtttooltip", interactive: true, plugins: [sticky] }
  ```
  popper에 `class="notranslate"`, `translate="no"` 추가 — Chrome 페이지 번역이 툴팁을 재번역하며 깜빡이는 문제(#19).
- `public/tippy.css`(manifest `css`로 주입, 전역): tippy 기본 스타일 + 애니메이션 `fade`/`perspective`/`scale`/`shift-away`/`shift-toward`. 이 파일은 tippy 원본 그대로이며 `[data-tippy-root]{max-width:calc(100vw - 10px)}` 등 **비스코프 셀렉터를 포함**한다(원본 tippy CSS라 사이트 tippy와 동일 값).

### 5.2 show / hide
- `showTooltip(html)`:
  1. 이전 내용과 다르면 `hideTooltip(true)`(숨김 애니메이션 후 다시 표시되는 효과).
  2. `prevTooltipText = html`; 컨테이너 제거 타이머 취소; 컨테이너/스타일 존재 확인·재부착; `tooltip.setContent(html)`; `tooltip.show()`.
- `hideTooltip()`: `tooltip.hide()` → `hideHighlight()` → `removeTooltipContainer()` = **3000ms 후 `#mttContainer` remove** (같은 jQuery 객체/엘리먼트를 다음 show에서 다시 append — tippy 인스턴스는 유지). `resetAll` 인자는 사용 안 됨(`hideAll` 주석 처리).
- 숨김 트리거 전체:
  - 텍스트 없음/필터됨/번역 실패(§3).
  - 좌클릭(#114, §6.6), Ctrl+A / Ctrl+F (`mouseMoved=false` → 다음 마우스 이동(3회 이상 3px 초과)까지 재표시 안 됨).
  - `keyToggleEnable` 토글.
  - `window` capture `blur`(→ `resetTooltipStatus`): 탭 전환뿐 아니라 **페이지 내 어떤 요소의 blur도** capture로 잡힘.
  - `focusin`으로 쓰기 필드 포커스(Google Docs 제외) → `hideTooltip(true)` + `#mttContainer` **즉시** remove (#102, #115).
  - 설정 변경 콜백(§13).
  - auto reader 종료.
- 마우스 "움직임" 판정 (`checkMouseOnceMoved`): `mouseMoved==false`일 때 직전 좌표 대비 맨해튼 거리 >3px 이동을 3회 누적해야 `mouseMoved=true`. 그 전 mousemove는 좌표만 기록하고 위치/OCR 처리 안 함. `touchstart`는 즉시 `mouseMoved=true`.

### 5.3 위치 (`tooltipPosition`: `follow`(기본) / `fixed` / `topright`, `tooltipPlacement`: `top`(기본) / `bottom`)
- 컨테이너는 `position: fixed`, `left:0; top:0; width:1000px; margin-left:-500px`, 높이 0(빈 inline-block). mousemove마다 `transform: translate(x px, y px)` → 커서 x를 중심으로 하는 1000px 폭의 가로선이 커서 y에 위치. tippy는 이 선 위(top)/아래(bottom)에 `offset: [0, tooltipDistance]`(기본 20px) 떨어져 표시.
- `follow`: `sticky: "reference"`, `appendTo: tooltipContainerEle`(popper가 컨테이너 내부) → 표시 중에도 커서를 따라감.
- `fixed`: `sticky: "popper"`, `appendTo: () => document.documentElement` → 표시 시점 위치에 고정(컨테이너는 계속 이동하지만 popper는 재배치 안 됨).
- `topright` (#43): placement `"bottom-end"`, 컨테이너 CSS `top:12px; right:12px; left:auto; width:auto; margin:0`, mousemove 시 `transform: none` → 화면 우상단 고정. `tooltipPlacement` 무시.
- `appendTo`를 함수형으로 둔 이유: show마다 live root 재평가(SPA 내비게이션 후 stale 방지, #80).
- `animation: tooltipAnimation`(기본 `"fade"`, `""`=없음), `duration: [300, Number(tooltipDisappearDuration)]`(숨김 시간 기본 250ms, 0~500, #240).

### 5.4 주입 CSS (`#mttstyle`, 설정 변경마다 재생성) — 원문 그대로
`containerPosCss`는 topright면 `top: 12px !important; right: 12px !important; left: auto !important; width: auto !important; margin: 0 !important;`, 아니면 `left: 0 !important; top: 0 !important; width: 1000px !important; margin: 0px !important; margin-left: -500px !important;`.
`fontPrefix`: `tooltipFontFamily`(#86)가 있으면 generic(`sans-serif, serif, monospace, cursive, fantasy, system-ui`)은 그대로, 그 외는 `"…"`로 감싸고 뒤에 `,`.

```css
#mttContainer {
  ${containerPosCss}
  position: fixed !important;
  z-index: 2147483647 !important;
  background: none !important;
  pointer-events: none !important;
  display: inline-block !important;
  visibility: visible  !important;
  white-space: pre-line;
}
.tippy-box[data-theme~="custom"], .tippy-box[data-theme~="ocr"],
.tippy-box[data-theme~="custom"] .tippy-content *,
.tippy-box[data-theme~="ocr"] .tippy-content *,
.tippy-box[data-theme~="transparent"] .tippy-content *{
  font-size: ${tooltipFontSize}px  !important;          /* 기본 18 */
  text-align: ${tooltipTextAlign} !important;           /* 기본 center */
  overflow-wrap: break-word !important;
  color: ${tooltipFontColor} !important;                /* 기본 #ffffffff */
  font-family: ${fontPrefix} -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen",
    "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif  !important;
  white-space: pre-line;
}
.tippy-box[data-theme~="custom"]{
  max-width: ${tooltipWidth}px  !important;             /* 기본 200 */
  backdrop-filter: blur(${tooltipBackgroundBlur}px) !important;   /* 기본 6 */
  background-color: ${tooltipBackgroundColor} !important;          /* 기본 #00000080 */
  border: 1px solid ${tooltipBorderColor};                          /* 기본 #ffffff00 */
  box-shadow: rgba(50, 50, 93, 0.25) 0px 2px 5px -1px, rgba(0, 0, 0, 0.3) 0px 1px 3px -1px;
  opacity: 1.0;
}
.tippy-box[data-theme~="ocr"]{ max-width: $1000px !important; /* ← 오타: 무효 */ (custom과 동일 배경/blur/border/shadow) opacity: 1.0; }
.tippy-box[data-theme~="transparent"] { max-width: $1000px !important; (동일) opacity: 0.0; transition: opacity 0.3s ease-in-out; }
/* #345: 우리 테마 root에만 */
[data-tippy-root]:has(> .tippy-box[data-theme~="custom"]),
[data-tippy-root]:has(> .tippy-box[data-theme~="ocr"]),
[data-tippy-root]:has(> .tippy-box[data-theme~="transparent"]) {
  display: inline-block !important;
  visibility: visible  !important;
}
/* 화살표 색 = 배경색 (custom, ocr) */
.tippy-box[data-theme~='custom'][data-placement^='top'] > .tippy-arrow::before, .tippy-box[data-theme~='ocr'][data-placement^='top'] > .tippy-arrow::before { border-top-color: ${tooltipBackgroundColor} !important; }
/* bottom/left/right 도 각각 border-bottom/left/right-color 로 동일 */
.mtt-highlight{
  background-color: ${mouseoverTextHighlightColor}  !important;
  position: absolute !important;
  z-index: 2147483646 !important;
  pointer-events: none !important;
  display: inline !important;
  border-radius: 3px !important;
}
.mtt-image{ width: ${Number(tooltipWidth) - 20}px  !important; border-radius: 3px !important; }
.ocr_text_div{ position: absolute; opacity: 0.4; color: transparent !important; border: 2px solid CornflowerBlue; background: none !important; border-radius: 3px !important; }
```
- 테마: `custom` = 메인 툴팁, `ocr` = OCR 결과 툴팁(ocrView.js), `transparent` = OCR 툴팁이 hover 중 투명 전환(ocrView.js가 setProps로 전환).
- **스코프 규칙(#345)**: 페이지에 넣는 CSS는 반드시 `data-theme~="custom"|"ocr"|"transparent"` 로 한정. `[data-tippy-root]`, `.tippy-content *` 같은 맨 전역 셀렉터 금지 (zulip 등 Tippy 사용 사이트의 메뉴가 깨졌음).

### 5.5 자막 CSS (`#mttstyleSubtitle`) — `detectSubtitle=="null"`이면 `disabled=true`
```css
#ytp-caption-window-container .ytp-caption-segment { cursor: text !important; user-select: text !important; font-family: ${fontPrefix} -apple-system, … sans-serif !important; }
.caption-visual-line{ display: flex !important; align-items: stretch !important; direction: ${getRtlDir(translateTarget)} }
.captions-text .caption-visual-line:first-of-type:after { content: '⣿⣿'; border-radius: 3px !important; color: white !important; background: transparent !important;
  box-shadow: rgba(50, 50, 93, 0.25) 0px 30px 60px -12px inset, rgba(0, 0, 0, 0.3) 0px 18px 36px -18px inset;
  display: inline-block; vertical-align: top; opacity:0; transition: opacity 0.7s ease-in-out; }
.ytp-caption-segment{ color: white !important; text-shadow: 1px 1px 2px black !important;
  /* subtitleBackground=="false" */ backdrop-filter: none !important; background: transparent !important;
  /* 그 외(기본 "true") */ backdrop-filter: blur(3px) !important; background: rgba(8, 8, 8, 0.1) !important; }
.captions-text:hover .caption-visual-line:first-of-type:after { opacity:1; }
.ytp-pause-overlay { display: none !important; }
.ytp-expand-pause-overlay .caption-window { display: block !important; }
```
(YouTube 자막을 선택/호버 가능하게 하고, 자막 드래그 핸들 `⣿⣿`을 호버 시 표시, 일시정지 오버레이 숨김.) 자막 로직 자체는 subtitle 문서 참조; contentScript는 `checkVideo()`로 `subtitle[*].handleVideo(setting)`만 호출(초기화 + 설정 변경 시).

---

## 6. 키보드 / 마우스 버튼 시스템

### 6.1 상태
- `keyDownList`: `{ always: true, [e.code | "ClickLeft"|"ClickMiddle"|"ClickRight"]: bool | {lastPressed} }`. 키 값은 `KeyboardEvent.code` (예 `ControlLeft`, `AltRight`, `F2`, `F8`). 마우스 버튼은 `mouseKeyMap[e.button]` = `["ClickLeft","ClickMiddle","ClickRight"]`.
- 설정 가능한 키 목록(`keyList`): `null`, `ControlLeft`, `ControlRight`, `AltLeft`, `AltRight`, `ShiftLeft`, `ShiftRight`, `MetaLeft`, `MetaRight`, `ClickLeft`, `ClickMiddle`, `ClickRight`, `F2`, `F8`, … (+ `showTooltipWhen`엔 `always`, `TTSWhen`엔 `select`/`always`).
- `keyBindings: Map<code, Array<actionName | {type:"wordGroup", id}>>` (#352) — 설정 로드/변경 때 `rebuildKeyBindings()`로 재구성. 대상: `showTooltipWhen, TTSWhen, keySecondaryLang, keyHoldMouseoverTextType, keyDownTranslateWriting, keySpeechRecognition, keyDownAutoReader, keyDownTranslatePage, keyToggleEnable, keyTTSPause` + `wordGroups[].key`. `keyDownOCR`은 의도적으로 제외(mousemove 때 `ocrView.checkImage`가 폴링).
- 한 키에 여러 액션이 바인딩될 수 있으며 모두 실행된다.

### 6.2 keydown 처리 순서 (`handleKeydown`, window capture)
1. (#354) `e.code=="AltRight"` && ControlLeft 보류 타이머 있음 && `getModifierState("AltGraph")` → 보류된 ControlLeft 취소(AltGr의 유령 ControlLeft).
2. (#352/#353/#354/#355) `ignoreAltGr=="true"`(기본 false) && `getModifierState("AltGraph")` → 전부 무시하고 return. (기본 off = 예전 동작; AltGr를 무조건 무시하면 Right Alt를 트리거로 쓰는 사용자가 깨졌음.)
3. auto reader 실행 중이면 화살표 키 처리(§7.2) 후 return.
4. Ctrl+Shift+`Digit0-9`: `"CtrlShift"+digit`과 같은 `key`(미설정이면 `"CtrlShift"+id`)를 가진 word group이 있으면 `preventDefault` + `requestSaveTranslation(group.id)` 후 return.
5. Ctrl+`KeyA`/`KeyF` → `mouseMoved=false`, `hideTooltip()` (계속 진행).
   `Escape` → `requestStopTTS()` + `requestKillAutoReaderTabs(true)`.
   `e.key=="HangulMode"|"Process"`(IME) → **return** (키 기록 안 함).
   `e.key=="Alt"` → `preventDefault()` (Alt로 브라우저 메뉴바 포커스 이동 방지; 바인딩 여부 무관 항상).
6. (#354) `e.code=="ControlLeft"` && keyBindings에 ControlLeft가 있으면 `CTRL_VERIFICATION_DELAY = 20`ms 후 `holdKeydownList("ControlLeft")` 하도록 보류하고 return. (기본 TTS 키가 ControlLeft. 1회성 액션은 되돌릴 수 없어 사후 취소가 아니라 사전 보류.)
7. `holdKeydownList(e.code)`.

### 6.3 holdKeydownList / releaseKeydownList
- 토글 모드(#321): `swapKeyToggleMode=="true"`(기본 false)이고 키가 `keyHoldMouseoverTextType` 또는 `keySecondaryLang`이면, 물리적 첫 press마다 `keyDownList[key]`를 반전(오토리피트 무시 `keyPhysicalHeld`)하고 `runKeydownPostProcess(key, true)`. release는 `keyPhysicalHeld=false`만.
- 일반: `recordKeydownList` — 키가 있고, 아직 down 아니고, **char key가 아니면**(`isCharKey`: code에 `Key|Digit|Numpad|Space` 포함) `true` 기록 + "새로 눌림" 플래그.
  `recordDoublePress` — 이미 down이면 직전 press와의 간격 `< 1000ms`이면 `keyDownDoublePress[key]=true` 아니면 false, 시간 갱신. down이 아니면(char key의 경우) `keyDownList[key] = {lastPressed}`(truthy 객체).
- `runKeydownPostProcess(key, isNew)`: 새로 눌렸으면 바인딩된 액션 디스패치(§6.4). 그리고 **char key면 항상** `requestStopTTS(Date.now()+500)` + `killAutoReader()` (타이핑하면 낭독 중단).
- `releaseKeydownList(key)` (keyup / mouseup): `delay(20)` 후
  - 토글 키면 `keyPhysicalHeld=false` 후 return.
  - `keyDownList[key]=false`.
  - `keySpeechRecognition` → `stopSpeechRecognition()`.
  - `keySecondaryLang`이고 `translateTarget2 != "null"` → `stageTooltipTextHover(null, false, true)` (주 언어로 재번역).
  - `keyHoldMouseoverTextType` → `restartWordProcess()`.
- `restartWordProcess()`: `delay(10)`(클릭에 의한 선택 변화 대기) → `stagedText=null` → 선택 텍스트가 있으면 `stageTooltipTextSelect("", false)`(이전 selectedText 재사용), 없으면 `forceTriggerMouseoverText()`(마지막 마우스 좌표에서 즉시 재감지).

### 6.4 단축키별 동작 (설정 키 / 기본값)
| 설정 | 기본 | 동작 |
|---|---|---|
| `showTooltipWhen` | `always` | 이 키가 down일 때만 툴팁 표시. press 시 `restartWordProcess()`로 현재 단어 즉시 재평가. |
| `TTSWhen` | `ControlLeft` | down일 때 hover/선택 텍스트 TTS. `select`면 선택 번역 때만, `always`면 항상. press 시 재평가. 1초 내 더블프레스 = swap(번역문 우선). |
| `keySecondaryLang` | `null` | down 동안 `translateTarget2`(기본 `null`)로 번역 + `mouseoverTextType2` 감지, 툴팁 키 무관 표시. press/release 때 현재 hover 재번역(`translateTarget2`가 `null`이면 press는 `restartWordProcess`). 토글 모드 대상. |
| `keyHoldMouseoverTextType` | `F8` | down 동안 word↔sentence 스왑(container→word). press/release 때 재감지. 토글 모드 대상. |
| `keyDownTranslateWriting` | `AltRight` | 쓰기 필드 번역(§8). |
| `keySpeechRecognition` | `ControlRight` | 누르는 동안 음성 인식(§11). |
| `keyDownAutoReader` | `F2` | auto reader 시작(§7). 더블프레스 = swap. |
| `keyDownTranslatePage` | `null` | 페이지 전체 번역 토글(§9). |
| `keyToggleEnable` | `null` | (#126) `extensionDisabled` 반전(프레임·페이지 로드 단위, 저장 안 됨) + hide + `requestStopTTS(now+500)`. disabled면 `stageTooltipText`가 무시. |
| `keyTTSPause` | `null` | (#124) `pauseResumeTTS` 메시지. |
| `keyDownOCR` | `ShiftLeft` | down 상태로 이미지 위 mousemove → OCR(ocrView, §11.2). keyBindings 미포함. |
| `wordGroups[].key` | `CtrlShift1..5` | Ctrl+Shift+숫자 → 해당 그룹 저장(§6.2-4). keyBindings에도 들어가지만 `"CtrlShift1"`은 `e.code`가 아니므로 그 경로는 실질적으로 발동 안 함(관찰). |
| (Escape) | 고정 | TTS 정지 + 모든 탭 auto reader 중지. |
| (Ctrl+A/F) | 고정 | 툴팁 숨김, 마우스 재이동까지 억제. |

### 6.5 마우스 버튼
- `mousedown`(capture) → `holdKeydownList(ClickX)` + `dismissTooltipOnClick`. `mouseup` → `releaseKeydownList(ClickX)`.

### 6.6 클릭으로 닫기 (#114)
- 좌클릭이고, `ClickLeft`가 `showTooltipWhen`/`TTSWhen`/`keySecondaryLang` 어느 것에도 바인딩되지 않았을 때: `mouseMoved=false` + `hideTooltip()`. `preventDefault` 안 함(링크/버튼 정상). 다음 마우스 이동 판정 후 다시 표시.

### 6.7 특수 프레임의 키 포워딩
- Google Docs: `.docs-texteventtarget-iframe`(등장할 때까지 `waitUntilForever`)의 contentWindow keydown/keyup → `CustomEvent`(`key`,`code`,`ctrlKey`만) 를 window·document에 dispatch.
- BookFusion / ebook 리더도 동일 형태.
- 이 합성 이벤트엔 `shiftKey`, `getModifierState`가 없음 → 해당 iframe 포커스 중엔 Ctrl+Shift+숫자 저장, AltGr 가드가 동작하지 않음. 또한 window와 document 양쪽에 dispatch하므로 window capture 리스너가 **2회** 받는다(키 처리는 이미 down이면 무시되어 대체로 무해).

---

## 7. Auto Reader (연속 낭독, `keyDownAutoReader`)

### 7.1 시작/진행
- `startAutoReader()`: 키가 실제 down인지 재확인 → `isTtsSwap = keyDownDoublePress[key]` → `util.clearSelection()` → `requestKillAutoReaderTabs()`(다른 탭만) → 로컬 `killAutoReader()` 완료 대기 → 네비 히스토리 리셋 → 시작 range = `hoveredData.mouseoverRange`(iframe 로컬 좌표로 이미 감지된 것; BookFusion처럼 scale된 iframe에서 clientX/Y 재감지가 틀리기 때문) || `getMouseoverText(clientX, clientY).mouseoverRange` → `processAutoReader(range, isTtsSwap)`.
- `processAutoReader(range)` 반복:
  1. range 없거나 `isStopAutoReaderOn` → hide, 플래그 해제, 종료.
  2. BookFusion 활성 iframe 동기화, `isAutoReaderRunning=true`, 히스토리 기록(최대 300, 초과 시 앞에서 삭제).
  3. `extractTextFromRange` → `requestTranslate(text, translateSource, translateTarget, translateReverseTarget)`.
  4. `scrollAutoReader(range)`: 문장을 화면 세로 중앙으로 jQuery `animate({scrollTop}, 400ms)` — PDF 뷰어는 `#viewerContainer`, BookFusion은 iframe scale 보정, 그 외 `body,html`.
  5. 400ms(`autoReaderScrollTime`) 후 `highlightText(range, true)` (스크롤 끝난 뒤 위치 계산).
  6. `showTooltip(targetText)` — **dict/부가정보 없이 번역문 텍스트만**, `recordTooltipText` 호출 안 함.
  7. 다음 range = `getNextExpandedRange(range, mouseoverTextType)` || (BookFusion) 다음 챕터 iframe 첫 range(`getFirstExpandedRangeInDoc`).
  8. `preloadNextTranslation(next)`: 700ms 후 다음 문장 번역 요청(캐시 워밍, 결과 무시).
  9. `await callTTS(..., Date.now(), noInterrupt=true, isTtsSwap)` — 낭독 끝날 때까지 대기. `noInterrupt`라 일반 stopTTS로는 안 끊기고 `force`만 끊음.
  10. `getAutoReaderNextRange(next)`(화살표 점프 반영) 로 재귀.
- `getNextExpandedRange`: 끝 위치에서 offset을 1씩 늘려가며 다음 range를 확장, 원 range와 다를 때까지. `expand("sentence")`가 같은 시작으로 되돌아오면(텍스트 없는 블록/인라인 경계) 같은 문장의 미독 꼬리를 잘라 반환, 없으면 null → `getForwardExpandedRange`: TreeWalker로 다음 텍스트 노드부터 확장(최대 10회 skip, `MAX_FORWARD_SKIPS`), 이미 읽은 영역으로 확장되면 클립. (YouTube 결과 목록 같은 그리드에서 멈추지 않게.) `getNextSiblingElement`는 body/ShadowRoot에서 정지.

### 7.2 낭독 중 키 (#180)
- `ArrowLeft`/`ArrowRight`: `autoReaderPending = "prev"|"next"` + `requestStopTTS(Date.now(), true)`(force로 현재 문장 끊기) + `preventDefault`. 히스토리 안에서 이전/다음으로 이동(히스토리 끝에서 next는 정상 진행).
- `ArrowUp`/`ArrowDown`: 속도 ±0.1 (`adjustAutoReaderSpeed`): `ttsRate_<translateTarget>`가 설정되어 있고 `"default"`가 아니면 그 키, 아니면 `voiceRate`(기본 "1.0"). 0.5~2.0 클램프, 소수 1자리, `setting.save()` → 다음 문장부터 적용. `preventDefault`.
- 그 외 키는 일반 처리(char key면 낭독 중단).

### 7.3 중지
- `killAutoReader()`: 실행 중이고 중지 진행 중이 아니면 `isStopAutoReaderOn=true` → `requestStopTTS(now, force=true)` → 루프가 끝날 때까지 `waitUntilForever` → 플래그 해제 + 히스토리 리셋.
- 트리거: char key 입력, `beforeunload`, Escape(`killAutoReaderTabs` 경유), 다른 탭/프레임의 hover TTS·auto reader 시작(background `killAutoReaderTabs` 브로드캐스트), 새 auto reader 시작.
- 실행 중엔 마우스오버 툴팁 비활성(`isOtherServiceActive`), scroll로 하이라이트 제거 안 함.

---

## 8. 쓰기 필드 번역 (`keyDownTranslateWriting`, 기본 `AltRight`)

- 조건: 포커스가 쓰기 필드(`util.writingField` = `input[type="text"], input[type="search"], input:not([type]), textarea, [contenteditable], [contenteditable="true"], [role=textbox], [spellcheck]`; shadow DOM 내부 activeElement까지 추적) 이거나 Google Docs.
- 재진입 가드 `isTranslatingWriting`(#75): 비동기 흐름 중 두 번째 입력 무시.
- 텍스트: 선택(`type != "Caret"`)이 있고 2자 이상이면 선택 텍스트. 아니면 `execCommand("selectAll")`로 전체 선택 후 텍스트를 읽고, IME 조합 종료 처리(`makeNonEnglishTypingFinish`: 10ms → 선택 해제 + blur → 10ms → focus → 50ms → selectAll → 50ms).
- 번역: `requestTranslate(text, "auto", writingLanguage(기본 "en"), translateTarget)` — 이미 writingLanguage면 reverse로 translateTarget으로 번역. `isBroken`이면 중단.
- 삽입(`insertText`):
  - Google Docs: `.docs-texteventtarget-iframe` 내부 `[contenteditable=true]`에 합성 `paste` ClipboardEvent(`docs_plus_ = true` 플래그, matthewsot/docs-plus 방식).
  - 쓰기 필드가 `[spellcheck='true']`(Discord, Twitch): paste 이벤트 먼저 → 300ms → 아직 선택이 남아있으면 `execCommand("insertText")` → 300ms.
  - 그 외(Bard, butterflies.ai): `execCommand("insertText")` 먼저 → 300ms → 선택이 남아있으면 paste 이벤트 → 300ms.
  - paste 이벤트: `new DataTransfer()` + `ClipboardEvent("paste", {clipboardData, bubbles, cancelable})`, dispatch 후 `clearData()`.

---

## 9. 페이지 전체 번역 (`pageTranslate.js`, #177, `keyDownTranslatePage`)

- `togglePageTranslate(setting)`: 실행 중(`busy`) 재입력 → `cancelled=true`(중단). 번역된 상태면 `revertPage()`(원문 복원), 아니면 `translatePage()`.
- 대상 텍스트 노드: `document.body` 하위, 공백 아님, 부모가 `SCRIPT, STYLE, NOSCRIPT, TEXTAREA, INPUT, SELECT, CODE, PRE` 아님, `isContentEditable` 아님, `#mttContainer` 내부 아님. 최대 6000개(`MAX_TEXT_NODES`). Shadow DOM 미포함.
- 대상 언어: `setting.translateTarget`(사이트별 오버라이드 반영), 요청은 `requestTranslate(text, "auto", target, "null")` (reverse 없음).
- 배치: 노드 텍스트(내부 `\n`→공백)를 `\n`으로 join, **UTF-8 바이트 기준 700**(`MAX_BATCH_BYTES`; bing은 ~1200자부터 실패, CJK는 문자당 3바이트) 이하. 응답을 `\n`으로 split해 개수가 같으면 노드별 치환.
  - 응답이 1줄로 뭉쳐 오면(bing이 개행 제거) `batchingUseless=true` → 이후 배치는 바로 노드별 요청.
  - 개수 불일치/실패 → 노드별 요청, 4개 병렬 윈도우(`NODE_REQUEST_WINDOW`), 윈도우 단위로 성공 여부를 브레이크에 보고.
  - 700바이트 초과 단일 노드: 단어 경계(공백)로 분할(서로게이트 쌍 보호, 잘라낸 구분자 보존) 후 순차 번역해 이어붙임; 하나라도 실패하면 노드 그대로 둠.
- 제한: 배치 간 80ms 대기(`BATCH_PAUSE_MS`), 최대 요청 2000(`MAX_REQUESTS`), 최대 120초(`MAX_DURATION_MS`), 연속 3회 실패(`MAX_CONSECUTIVE_FAILURES`) 시 중단 + 콘솔 `MouseTooltipTranslator: page translate stopped - …`. 예산 소진 시 "stopped early" 로그.
- 치환: `node.nodeValue` 직접 교체, 원문은 `originals`에 저장; 복원 시 연결된 노드만 복원. 툴팁/TTS/히스토리와 무관.
- 상태는 모듈 전역(프레임 단위). 번역 후 새로 추가된 DOM은 번역 안 됨.

---

## 10. 저장 단어 하이라이트 (`savedHighlight.js`)

- 시작: init 및 모든 설정 변경 시 `refreshSavedWordHighlight(setting)`. destructor에서 `cleanupSavedWordHighlight()`.
- CSS Custom Highlight API(`CSS.highlights`, `Highlight`) 미지원이면 아무것도 안 함. **DOM을 변형하지 않음**(span 래핑 없음 → observer 피드백 루프 없음).
- 대상: `wordGroups` 중 `enabled`인 그룹(기본 전부 disabled → 기본 비용 0)의 `historyList` 항목(`groupId` 없으면 1). 키 = `sourceText`를 정규화(`[^\p{L}\p{N}]+`→공백, trim, 소문자).
- 매칭: 페이지 텍스트 노드(최대 8000, pageTranslate와 같은 skip 규칙)를 1패스로 정규화(노드 경계를 넘어 매치 가능, 공백/구두점/따옴표 차이 무시) → 긴 구문 우선 alternation 정규식(`gi`) → 최대 3000개 Range.
- 색상별로 `CSS.highlights.set("mtt-saved-<n>", new Highlight(...ranges))`, `<style id="mtt-saved-hl-style">`에 `::highlight(mtt-saved-<n>){ background-color: <color>; }`.
- `MutationObserver(body, childList+subtree)` → 700ms debounce 후 전체 재페인트.
- 대소문자 무시 매칭은 ASCII 외 문자에도 `i` 플래그 적용; 정규화는 문자 단위(`isAlnum`)와 정규식 단위가 동치여야 함.

---

## 11. 기타 연동

### 11.1 음성 인식 (`src/speech/index.js`)
- `webkitSpeechRecognition`/`SpeechRecognition`(페이지 컨텍스트) `continuous=true`, `interimResults=true`, `lang = speechRecognitionLanguage`(기본 `en-US`, 설정 변경 시 재적용).
- `keySpeechRecognition`(기본 `ControlRight`) press → start, release → stop. blur/설정 변경(`resetTooltipStatus`)도 stop.
- 결과가 final이면 `listenText = text` → `stageTooltipText(listenText, "listen")` (번역 툴팁 + TTS 키 규칙 동일). 인식 종료(onend) 시 `listenText=""`. `listenText`가 있는 동안 mouseover/선택 툴팁 억제.

### 11.2 OCR (`src/ocr/ocrView.js` — 인터페이스만)
- `handleMousemove`(마우스 이동 판정 이후)마다 `ocrView.checkImage(clientX, clientY, setting, keyDownList)` — `keyDownOCR` down일 때만 이미지 탐지·OCR. 결과 블록은 `div.ocr_text_div.notranslate`, 툴팁 theme `ocr`/`transparent`.
- `resetTooltipStatus` → `ocrView.removeAllOcrEnv()` (OCR iframe/블록 제거 + tippy `hideAll({duration:0})` — 이 번들의 모든 tippy 인스턴스 즉시 숨김).
- `ocr_text_div` 위에서는 감지 타입이 `container` 강제(§1.2).

### 11.3 PDF (`detectPDF`)
- `detectPDF=="true"`(기본) && `util.isPDF()` (`document.contentType=="application/pdf"` 또는 body 첫 자식 `type=="application/pdf"` — 최신 Chrome은 body가 비어 있어 contentType이 신뢰 신호).
- `document.open()/write()/close()`로 문서를 통째로 재작성(크롬 내부 PDF guest 뷰어 제거) → `<iframe id="mttPdfIframe" allow="clipboard-write; clipboard-read">` 전체 화면, `src = getURL("/pdfjs/web/viewer.html?file=" + encodeURIComponent(url))`(write 후 설정해 HTML 이스케이프 불필요). 주소창은 원본 .pdf URL 유지.
- 재작성 **후** `addFrameListener("pdfErrorLoadDocument", openPdfIframeBlob)` 등록(document.open이 리스너를 날릴 수 있음). 뷰어(pdfInject.js)가 로드 실패 시 `postFrame({type:"pdfErrorLoadDocument"})` → 래퍼가 원본을 `fetch`→blob URL로 만들어 다시 iframe 로드(CORS/인증 PDF).
- 래퍼 문서에서는 이후 init을 중단(뷰어 iframe이 자기 contentScript를 로드).
- 뷰어 내부에서는 `isPDFViewer()`(URL에 `pdfjs/web/viewer.html`) → 세그멘테이션 감지 경로, auto reader 스크롤 컨테이너 `#viewerContainer`.

### 11.4 Copy (background 커맨드)
- background가 `copy-translated-text`(Ctrl+Shift+6) / `copy-source-text`(Ctrl+Shift+7, #204) 커맨드 또는 컨텍스트 메뉴 "Copy"에서 `tabs.sendMessage(activeTab, {type:"CopyRequest", text})` → contentScript가 `navigator.clipboard.writeText(text)`. `frameId` 없이 보내므로 탭의 모든 프레임이 수신·시도.
- 복사 대상 텍스트는 background가 마지막 `recordTooltipText`로 기억한 값.

---

## 12. URL / 언어 제외, 사이트별 대상 언어

### 12.1 URL 필터 (`checkExcludeUrl`, init 시 1회 — 설정 바꿔도 이미 로드된 페이지엔 재평가 안 됨)
- URL = `util.getCurrentUrl()`: iframe이면(`window.location != window.parent.location`) **`document.referrer`**, 아니면 `location.href`.
- `matchSite(url, list)`: `match-url-wildcard` 매치, 또는 항목에서 프로토콜/경로/쿼리/해시/포트를 떼어낸 bare host에 대해 `"*." + host` 매치 → `example.com` 항목이 `www.example.com`, `m.example.com`도 매치(#197).
- `websiteFilterMode`(#297, 기본 `"auto"`):
  - `blacklist`: `websiteExcludeList` 매치면 제외.
  - `whitelist`(#344): `websiteWhiteList`에 매치 안 되면 제외 — **빈 목록이면 전부 제외**.
  - `auto`(=둘 다): exclude 매치 또는 (whitelist가 비어있지 않고 매치 안 됨)이면 제외. 빈 whitelist = 제한 없음.
- 기본 `websiteExcludeList = ["*.example.com"]`, `websiteWhiteList = []`.
- 제외 시 이 프레임에서 툴팁/자막/PDF/하이라이트 등 init 이후 기능 전부 없음.

### 12.2 언어 제외
- `langExcludeList`(기본 `[]`): 번역 응답의 `sourceLang`이 목록에 있으면(지역 변형 관대 매치) 툴팁/TTS 안 함(§3-8).
- 정규식 제외 `translateExcludeRegex`(#36, §3-5).

### 12.3 사이트별 번역 대상 (#262)
- `websiteTargetLangList`: `"site=lang"` 항목 배열(예 `github.com=ko`). 첫 `=` 기준 분리, trim, `site`는 `matchSite` 규칙, **첫 매치 우선**. `=`가 맨 앞이거나 없으면 무시.
- `applyPerSiteTargetLang(changes)`: 최초 실행 또는 `changes.translateTarget`이 있을 때만 `globalTranslateTarget = setting.translateTarget` 갱신(그 외엔 현재 값이 오버라이드일 수 있어 재읽기 금지). `effective = matched || global` → `setting.setLocalOverride("translateTarget", effective, global)` — 읽기는 effective, `save()`는 global 저장(오버라이드가 전역에 새지 않음).
- `translateTarget`을 읽는 모든 소비자(툴팁, 자막, 페이지 번역, auto reader, 쓰기 번역의 reverse, RTL 판정)에 반영.

---

## 13. 설정 변경 콜백 (`storage.onChanged` → `Setting`이 값 반영 후 콜백)

- `ignoreCallbackOptionList`(기본 `["historyList"]`)에 속한 키만 바뀐 경우 콜백 생략. 그 외 **어떤 키든** 변경되면, 모든 탭·프레임에서:
  1. `applyPerSiteTargetLang(changes)`
  2. `resetTooltipStatus(keyReset=true, mouseReset=false)` → `keyDownList={always:true}`(토글 상태 포함 초기화), `selectedText=""`, `stagedText=null`, hide, OCR 정리, `listenText=""`, 음성인식 정지
  3. `applyStyleSetting()` (tippy props + CSS 재생성)
  4. `checkVideo()`
  5. `speech.initSpeechRecognitionLang(setting)`
  6. `refreshSavedWordHighlight(setting)`
  7. `rebuildKeyBindings()`
- 반영 안 되는 것: `mouseoverEventInterval`(debounce 생성 시 고정), URL 필터(init 1회), 선택 debounce.

---

## 14. 메시지 계약

### 14.1 content → background (`browser.runtime.sendMessage`; 실패 시 `console.log` 후 `{}` 반환)
| type | data | 응답 | 호출처 |
|---|---|---|---|
| `translate` | `{text, sourceLang, targetLang, reverseLang, engine}` (engine 보통 undefined → `translatorVendor`) | `{targetText, sourceLang, targetLang, transliteration?, dict?, imageUrl?, isBroken?, …}`. 실패 시 `{targetText:"<engine> is broken", transliteration:"", sourceLang, targetLang, isBroken:true, text}` | hover/선택/음성, auto reader(+preload), 쓰기 번역, 페이지 번역 |
| `tts` | `{sourceText, sourceLang, targetText, targetLang, timestamp, noInterrupt}` | `{}` (재생 **완료 후** 응답 → auto reader가 await로 문장 끝을 기다림) | `callTTS` |
| `stopTTS` | `{timestamp, force}` | `{}` | Escape(timestamp undefined→bg 기본 now), char key(`now+500`), toggleEnable(`now+500`), auto reader 중지/화살표(`now`, force) |
| `pauseResumeTTS` | `{}` | `{}` | `keyTTSPause` (#124) |
| `recordTooltipText` | `{sourceText, sourceLang, targetText, targetLang, dict, actionType}` | `{}` | 툴팁 표시 직후(auto reader 제외) — 히스토리 기록 + 컨텍스트 메뉴 갱신 + copy 대상 기억 |
| `saveTranslation` | `{groupId}` | `{}` | Ctrl+Shift+숫자 / 그룹 키 — 최근 기록을 해당 그룹으로 강제 저장 |
| `killAutoReaderTabs` | `{includeCaller}` | `{}` | background가 같은 메시지를 모든 탭(includeCaller면 호출 탭 포함)에 `tabs.sendMessage`로 재전송 |

### 14.2 background → content (`util.addMessageListener(type, handler)` — type 매치 시 handler 후 `sendResponse({})`)
| type | payload | 동작 |
|---|---|---|
| `CopyRequest` | `{text}` | `navigator.clipboard.writeText(text)` |
| `killAutoReaderTabs` | `{data:{includeCaller}}` | `killAutoReader()` |

### 14.3 window postMessage / DOM 이벤트
- `message` 이벤트 `data.type == "pdfErrorLoadDocument"` (PDF 래퍼 문서에서 수신, 뷰어 iframe이 `window.parent.postMessage(…, "*")`로 송신).
- `destructmyextension_MouseTooltipTranslator` (window CustomEvent) — 새 인스턴스가 이전 인스턴스 제거. 상수 이름 유지 필요(구버전 스크립트와의 호환).
- `mouseoverText`, `selectionEnd` (document CustomEvent, window capture로 수신) — ebook/BookFusion 브리지와 공유.
- 합성 `mousemove`/`keydown`/`keyup` (속성 `ebookWindow`, `iframeX`, `iframeY`, `key`, `code`, `ctrlKey`) — `ebookEventInject.js`가 발행.

### 14.4 storage
- 직접 `storage.onChanged`를 구독하지 않고 `Setting`(src/util/setting.js)의 콜백 사용(§13). 쓰기는 `adjustAutoReaderSpeed`의 `setting.save()`뿐.

---

## 15. 타이밍 상수 / 지연

| 값 | 위치 | 의미 |
|---|---|---|
| `mouseoverEventInterval` ms (기본 300) | mouseover.js debounce | 커서 정지 후 감지까지 (#235). 시작 시 고정 |
| 700ms | selection.js debounce | `selectionchange` 후 선택 확정(`tooltipEventInterval` 키 부재로 고정) |
| 즉시 | selection mouseup | 마우스 드래그 종료 |
| 3px × 3회 | `checkMouseOnceMoved` | "마우스 움직임" 인정 기준 |
| 3000ms | `tooltipRemoveTime` | hide 후 `#mttContainer` DOM 제거 |
| [300, `tooltipDisappearDuration`(250)] ms | tippy duration | show/hide 애니메이션 (#240) |
| 20ms | `CTRL_VERIFICATION_DELAY` | ControlLeft 보류(AltGr 판별, #354) |
| 20ms | `releaseKeydownList` | keyup 처리 지연 |
| 10ms | `restartWordProcess` | 클릭에 의한 선택 변화 대기 |
| 1000ms | `recordDoublePress` | 더블프레스 판정 창 |
| 50ms | `handleTTS` | auto reader kill 후 TTS 요청까지 |
| +100ms | TTS timestamp | 요청 timestamp = 감지 시각 + 100 |
| +500ms | `requestStopTTS(now+500)` | char key/toggle: 향후 500ms 내 TTS 차단 |
| 400ms | `autoReaderScrollTime` | auto reader 스크롤 애니메이션, 하이라이트 지연 |
| 700ms | `preloadNextTranslation` | 다음 문장 사전 번역 |
| 300 | auto reader 히스토리 최대 길이 |
| 10 / 50 / 50ms, 300ms | 쓰기 번역 | IME 종료 처리, 삽입 단계 간 대기 |
| 1000ms | BookFusion iframe 바인딩 폴링 / ebookEventInject 폴링 |
| 700ms / 3000ms | BookFusion 선택 debounce / 빈 선택 잠금 |
| 80ms, 120s, 2000, 3, 4, 700B, 6000 | 페이지 번역 | 배치 간격, 시간·요청·연속실패 한도, 병렬창, 배치 바이트, 노드 수 |
| 700ms, 8000, 3000 | 저장 단어 하이라이트 | observer debounce, 노드 수, 하이라이트 수 |

---

## 16. 사이트별 처리 / 우회 요약
- **Google Docs** (`docs.google.com/document`, `/presentation`): MAIN world 주석 활성화 스크립트, SVG rect + aria-label 기반 hover, 합성 copy로 선택 텍스트, 텍스트 이벤트 iframe 키 포워딩, paste 이벤트로 쓰기 삽입, 입력 중 억제/`focusin` 제거 예외.
- **BookFusion** (`reader.bookfusion.com`): epub iframe 이벤트 브리지, scale 보정, 다음 챕터 iframe 이어 읽기, 기본 선택 감지 비활성.
- **EPUB 리더**(`foliate-js/reader.html`): `ebookEventInject.js` 브리지, 하이라이트 오프셋 보정(`getEbookIframe`: 두 번째 shadowRoot의 첫 iframe).
- **PDF**: 문서 재작성 + 뷰어 iframe, blob fallback, 뷰어 내 세그멘테이션/스크롤 컨테이너.
- **YouTube 등 영상**: 자막 CSS, `checkVideo`.
- **SPA(Open WebUI/SvelteKit/React)**: 컨테이너·popper를 `<html>`에 부착(#80).
- **Zulip 등 tippy 사용 사이트**: CSS 스코프(#345).
- **Discord/Twitch/Bard**: 쓰기 삽입 순서 분기.
- **X.com**: container 감지 시 인라인 래퍼 상승(#254).
- **NHK Easy 등 후리가나**: `ruby>rt` 제거(#120).
- **국제 키보드 AltGr**: #352–#355.
- **Chrome 페이지 번역**: `notranslate`/`translate="no"`(#19).
- **리치 에디터/페이지 빌더**: `contenteditable=false`, `data-mtt`, focusin 시 즉시 제거(#102, #115).
- **Edge 미니 메뉴**: `disableEdgeMiniMenu`(좌클릭 preventDefault) 함수가 있으나 **호출되지 않음**.

---

## 17. 재작성 시 유지해야 할 외부 계약
- 파일명: `contentScript.js`, `tippy.css`, `googleDocInject.js`, `ebookEventInject.js`, `subtitle.js`, `pdfjs/web/viewer.html`(+`?file=`), `foliate-js/reader.html`.
- DOM id: `mttContainer`, `mttstyle`, `mttstyleSubtitle`, `mttPdfIframe`, `enable-pointer-events-on-rect`, `mtt-saved-hl-style`.
- class: `notranslate`(컨테이너·popper·OCR 블록), `mtt-highlight`, `mtt-image`, `ocr_text_div`, `textFitted`(감지 대상).
- 속성: `data-mtt="1"`, `contenteditable="false"`, `translate="no"`, tippy `data-theme~="custom"|"ocr"|"transparent"`, `role="mtttooltip"`(tippy가 `.tippy-box`의 role 속성으로 설정).
- `::highlight(mtt-saved-<n>)` 이름 접두사.
- 페이지 셀렉터 의존: `.docs-texteventtarget-iframe`, `[contenteditable=true]`, `.kix-canvas-tile-content`, `#kix-current-user-cursor-caret`, `iframe[id^="bf-epub-view-"]`, `#viewerContainer`, YouTube `#ytp-caption-window-container`, `.ytp-caption-segment`, `.caption-visual-line`, `.captions-text`, `.ytp-pause-overlay`, `.ytp-expand-pause-overlay .caption-window`.
- 전역: `window._docs_annotate_canvas_by_ext = "clfoagbcljppiogigjclfjnjpcijnijl"` (MAIN world).
- 이벤트 이름: `destructmyextension_MouseTooltipTranslator`, `mouseoverText`, `selectionEnd`, `pdfErrorLoadDocument`.
- 메시지 type 및 `actionType` 값(§14).
- z-index: 컨테이너 2147483647, 하이라이트 2147483646, tippy 100000200.

---

## 18. 관찰된 버그 / 데드 코드 (수정하지 않음, 재작성 시 판단)
1. `tooltipEventInterval` 설정 키가 존재하지 않음 → 선택 debounce가 항상 700ms(`tooltipIntervalTimeList` 0.1~2.0s 옵션은 정의만 있고 미사용으로 보임).
2. 주입 CSS의 `max-width: $1000px`(ocr/transparent 테마) — `$` 오타로 무효 선언.
3. `wordGroups[].key` 기본값 `"CtrlShift1..5"`는 `e.code`가 아니어서 `keyBindings` 경로로는 발동 불가. 그룹 키를 char key(예 `KeyQ`)로 지정해도 `isCharKey` 때문에 dispatch 안 됨. 실제 동작은 `handleKeydown`의 Ctrl+Shift+Digit 분기뿐.
4. `disableEdgeMiniMenu` 미사용(데드). `hideAll` import 미사용(주석 처리된 호출). `mouseover.js`의 `import { detect } from "tesseract.js"` 미사용(콘텐츠 번들에 tesseract 유입 가능). `caretRangeFromPointOnDocument`, `getAllTextNodes`, `getCenterXY`, `rectCollide` 미사용.
5. `mouseover.js`/`selection.js` 리스너가 AbortController signal 없이 등록 → destructor(재주입) 후에도 남아 이전 인스턴스가 `mouseoverText`/`selectionEnd`를 계속 발행 → 새 인스턴스가 중복 수신.
6. `mouseover.js`의 `_isIframe`은 한 번 true가 되면 리셋 안 됨 → ebook/BookFusion에서 iframe 밖(상위 문서) 텍스트는 이후 감지 불가.
7. `blur`가 window capture로 등록되어 페이지 내부 요소의 blur에도 `resetTooltipStatus` 실행(키 상태·토글·음성인식 초기화). `scroll` capture도 중첩 스크롤 컨테이너 스크롤에 반응.
8. auto reader 중 ArrowUp/Down → `setting.save()` → 모든 탭·프레임에서 설정 콜백 → `resetTooltipStatus` (툴팁 다음 문장까지 사라짐, OCR 정리, 키 상태 초기화). 또한 `ttsRate_<translateTarget>`을 조정하지만 낭독은 보통 원문 언어 → 원문 언어별 속도가 설정돼 있으면 체감 변화 없음.
9. 툴팁 경로는 `isBroken`을 걸러내지 않아 "`<engine> is broken`"이 툴팁으로 표시됨(의도일 수 있음). 언어 제외/중복 판정은 번역 요청 후에야 적용.
10. Google Docs/BookFusion/ebook 키 포워딩이 `shiftKey`·`getModifierState` 미복사 → 그 iframe에서 Ctrl+Shift+숫자 저장/AltGr 가드 불가. window+document 이중 dispatch로 window capture 리스너가 2회 수신.
11. iframe의 URL 판정은 `document.referrer` 사용 → referrer가 비면(no-referrer 정책) whitelist 모드에서 해당 프레임 차단, 사이트별 대상 언어 미적용.
12. `CopyRequest`가 frameId 없이 탭 전체 프레임에 전달 → 프레임 수만큼 clipboard 쓰기 시도(포커스 없는 프레임은 실패 가능).
13. `extensionDisabled`(#126)는 프레임별·비영속 → 상위 프레임에서 끄더라도 iframe 내부 툴팁은 계속 동작.
14. `rtlLangList`에 LTR 문자 언어(az, kk, ky, ml, su, tg, tk, uz, bm, ha, so, doi 등)가 포함 → 이 언어 번역문이 `dir="rtl"`로 표시됨.
15. Google Docs `getGoogleDocCaretRange`: rect에 `aria-label`이 없으면 `createTextNode(null)`→"null" 텍스트 오버레이를 붙인 뒤 `{}`를 반환해 오버레이가 제거되지 않음(누수).
16. `getCharRanges`가 `length - 1`까지만 순회 → 텍스트 노드 마지막 문자 위에서는 fallback 경로(§1.3-2/3)가 실패.
17. `CTRL_VERIFICATION_DELAY`(20ms)와 `releaseKeydownList`의 `delay(20)`이 같음 → ControlLeft를 아주 짧게 탭하면 keyup 처리와 보류 press의 순서가 경합할 수 있음(브라우저 검증 필요, 확정 버그 아님).
18. `hideTooltip(resetAll)` 파라미터는 아무 효과 없음. `showTooltip`이 `#mttstyleSubtitle`은 재부착하지 않음(페이지가 head를 갈아엎으면 자막 CSS 소실).
19. `resetTooltipStatus`가 `keyPhysicalHeld`는 초기화하지 않음(토글 모드에서 키를 누른 채 blur 시 다음 release까지 press 무시 — 경미).
20. `selection.js`의 `prevNoneSelect`는 모듈 전역이라 ebookEventInject 번들과 별개이며, mousedown·mouseup 대상 모두 `user-select:none`일 때만 빈 선택으로 취급.

---

## 19. 재작성 체크리스트 (브라우저 수동 검증)

### 로딩/환경
- [ ] 일반 페이지, iframe 내부, `about:blank` iframe에서 각각 툴팁이 뜬다(프레임별 독립).
- [ ] 확장 업데이트/리로드 후 기존 탭에서 이전 툴팁이 정리되고 새 인스턴스 하나만 동작한다(중복 툴팁 없음).
- [ ] 확장 리로드 후 고아 스크립트가 오류 없이 조용히 멈춘다(`runtime.id` 없음).
- [ ] `websiteExcludeList`의 `example.com`이 `www.example.com`도 제외한다(#197).
- [ ] `websiteFilterMode=whitelist` + 빈 whitelist → 모든 사이트에서 비활성. `auto` + 빈 whitelist → 제한 없음(#344, #297).
- [ ] iframe은 부모 페이지 URL(referrer) 기준으로 제외/사이트별 언어가 적용된다.

### 마우스오버
- [ ] 기본 설정(sentence)에서 문장에 커서를 300ms 멈추면 번역 툴팁이 뜬다; `mouseoverEventInterval` 변경은 새로고침 후 반영.
- [ ] word / sentence / container 각 모드가 동작하고, container는 X.com처럼 줄마다 span인 문단 전체를 잡는다(#254).
- [ ] F8을 누르는 동안 word↔sentence가 바뀌고(container→word), 떼면 원래 모드로 재감지.
- [ ] `swapKeyToggleMode=true`면 F8/보조언어 키가 누를 때마다 토글되고 떼도 유지된다(#321).
- [ ] Firefox에서 단어/문장 감지(Intl.Segmenter 경로)가 동작한다.
- [ ] PDF 뷰어에서 hover 감지가 동작한다.
- [ ] Shadow DOM 내부 텍스트, 큰(>1000px) 요소 안 텍스트의 감지.
- [ ] Google Docs 문서/프레젠테이션 hover 번역.
- [ ] 숫자·URL·기호만 / 1000자 초과 텍스트에는 툴팁이 뜨지 않는다.
- [ ] `translateExcludeRegex`에 매치되는 텍스트는 툴팁 없음; 잘못된 정규식은 무시(#36).
- [ ] 원문 언어 == 대상 언어면 툴팁 없음; pt(브라질) → pt-PT는 텍스트가 바뀌면 표시(#257).
- [ ] `langExcludeList`에 `pt-BR`이 있으면 `pt` 감지 텍스트 툴팁 없음.
- [ ] 텍스트 선택이 존재하는 동안 hover 툴팁이 뜨지 않는다.
- [ ] 입력창 포커스 중 hover 툴팁 억제(기본), `mouseoverWhileWriting=true`면 표시, Google Docs는 항상 표시(#186).
- [ ] 툴팁 위로 마우스를 올려도 툴팁이 갱신/숨김되지 않는다.
- [ ] `mouseoverHighlightText=true`면 감지된 텍스트에 하이라이트 박스, 스크롤 시 제거.

### 선택
- [ ] 드래그 후 mouseup 즉시 번역; 키보드 선택/모두 선택은 ~700ms 후.
- [ ] 여러 줄 선택(PDF 포함)이 한 문장으로 번역·낭독된다.
- [ ] 정지 상태 더블클릭 단어 선택 시 툴팁이 뜬다.
- [ ] 후리가나(ruby) 포함 선택 시 읽기가 중복되지 않는다(#120).
- [ ] `user-select:none` 영역 클릭으로 툴팁이 뜨지 않는다.
- [ ] Google Docs 선택 번역.
- [ ] `translateWhen=select`면 hover 무시, `mouseover`면 선택 무시.

### 툴팁 표시/스타일
- [ ] follow: 툴팁이 커서를 따라감; fixed: 뜬 자리에 고정; topright: 화면 우상단 고정, 커서 무시(#43).
- [ ] placement top/bottom, distance, animation(none/fade/scale/shift-away/shift-toward/perspective), 숨김 duration 0~500(#240).
- [ ] 폰트 크기/색/정렬/폭/배경색/blur/테두리색, 사용자 폰트(이름에 공백, generic family)(#86).
- [ ] 화살표 색이 배경색과 일치.
- [ ] 원문/음역/원문 언어명(UI 언어로 현지화) 부가정보 토글, 사전(dict) 표시 시 품사 라벨 굵게.
- [ ] 아랍어/히브리어 대상일 때 툴팁 텍스트가 RTL.
- [ ] 이미지 엔진(googleWebImage) 결과가 이미지로 표시(폭 = tooltipWidth-20).
- [ ] 좌클릭하면 툴팁이 사라지고 마우스를 움직이면 다시 뜬다; 링크 클릭은 정상 동작(#114).
- [ ] Ctrl+A / Ctrl+F 후 툴팁이 사라지고 마우스 이동 전까지 안 뜬다.
- [ ] 숨긴 뒤 3초 지나 `#mttContainer`가 DOM에서 사라지고, 다음 hover에서 정상 재등장.
- [ ] `#mttContainer`와 popper가 `<html>` 직계에 붙는다; Open WebUI 등 SPA가 크래시하지 않는다.
- [ ] zulip 등 Tippy 사용 사이트의 자체 메뉴/팝오버가 깨지지 않는다(#345).
- [ ] Chrome "이 페이지 번역" 활성 중 툴팁이 깜빡이지 않는다(#19).
- [ ] 리치 에디터(워드프레스/페이지 빌더) 포커스 시 컨테이너가 즉시 제거되어 저장 HTML에 섞이지 않는다(#102, #115).
- [ ] 탭 전환 후 돌아오면 툴팁/키 상태 초기화.

### 키
- [ ] Left Ctrl(기본 TTS 키)을 누른 채 hover → 원문 낭독; 1초 내 두 번 누르면 swap 낭독.
- [ ] `TTSWhen=select`는 선택 번역 때만 낭독, `always`는 hover마다 낭독.
- [ ] `showTooltipWhen`을 키로 설정하면 그 키를 누를 때만 툴팁, 누르는 순간 현재 단어 표시.
- [ ] 보조언어 키를 누르는 동안 `translateTarget2`로 번역, 떼면 주 언어로 복귀.
- [ ] 스위스/독일 등 AltGr로 `@`,`€` 입력 시: `ignoreAltGr=true`면 쓰기번역 등 오발동 없음, false면 Right Alt 트리거 정상(#352–#355). AltGr의 유령 Left Ctrl이 TTS를 발동시키지 않는다(#354).
- [ ] Alt 단독 입력 시 브라우저 메뉴바로 포커스가 가지 않는다.
- [ ] 문자 키 입력 시 TTS가 멈추고 auto reader가 종료된다.
- [ ] Escape로 TTS 정지 + 모든 탭 auto reader 정지.
- [ ] `keyToggleEnable`로 툴팁/TTS 전체 on/off(#126).
- [ ] `keyTTSPause`로 TTS 일시정지/재개(#124).
- [ ] 마우스 버튼(ClickLeft/Middle/Right)을 트리거 키로 설정 가능; ClickLeft를 트리거로 쓰면 click-to-hide 비활성.
- [ ] 한 키에 여러 기능을 바인딩하면 모두 실행.
- [ ] Ctrl+Shift+1..5로 최근 번역이 해당 그룹에 저장(페이지 기본 동작 차단).
- [ ] 한글 IME 전환 키(HangulMode/Process)가 오작동을 일으키지 않는다.

### Auto reader
- [ ] F2: 커서 위치 문장부터 연속 낭독, 문장마다 스크롤 중앙 정렬 + 하이라이트 + 번역 툴팁.
- [ ] F2 더블프레스 swap 낭독.
- [ ] ←/→ 이전/다음 문장, ↑/↓ 속도 ±0.1(0.5~2.0) (#180).
- [ ] YouTube 검색 결과 같은 그리드/목록에서 멈추지 않고 진행.
- [ ] PDF 뷰어(`#viewerContainer`), BookFusion(다음 챕터 이어서), EPUB 리더에서 동작.
- [ ] 다른 탭에서 hover TTS/auto reader 시작 시 이 탭 낭독 중지; 페이지 이탈 시 중지.

### 쓰기 번역
- [ ] 입력창에서 Right Alt → 전체 텍스트가 `writingLanguage`로 번역되어 교체; 선택 부분만 있으면 그 부분만.
- [ ] 이미 writingLanguage면 translateTarget으로 번역.
- [ ] 한글/일본어 IME 조합 중에도 마지막 글자 누락 없이 번역.
- [ ] Discord, Twitch, 일반 textarea, contenteditable, Google Docs에서 삽입.
- [ ] 연타해도 결과가 중복 삽입되지 않는다(#75).

### 페이지 번역 / 하이라이트 / 기타
- [ ] `keyDownTranslatePage`: 페이지 텍스트 번역 → 다시 누르면 원복; 진행 중 누르면 중단(#177).
- [ ] bing 엔진/CJK 페이지에서 페이지 번역이 동작(700바이트 배치).
- [ ] 엔진 실패 시 3회 연속 실패 후 중단되고 요청 폭주 없음.
- [ ] 그룹 하이라이트 enable 시 저장 단어가 그룹 색으로 표시, 태그로 쪼개진 구문도 매치; 무한스크롤 추가 콘텐츠도 ~700ms 후 반영; disable 시 즉시 제거.
- [ ] 음성인식 키(Right Ctrl)를 누르고 말하면 최종 인식 문장이 번역 툴팁으로 표시, 떼면 종료.
- [ ] Left Shift + 이미지 hover → OCR 오버레이(`ocr_text_div`) 위에서 container 단위 번역.
- [ ] Ctrl+Shift+6/7(또는 컨텍스트 메뉴 Copy)로 최근 번역문/원문이 클립보드에 복사(#204).
- [ ] 웹 PDF 열기 → 주소창 URL 유지한 채 번들 뷰어로 열림; CORS/인증 PDF는 blob fallback으로 열림.
- [ ] YouTube 자막이 선택 가능하고 `⣿⣿` 핸들이 호버 시 표시, `subtitleBackground=false`면 배경 없음, `detectSubtitle=null`이면 자막 CSS 비활성.
- [ ] 사이트별 대상 언어(`github.com=ko`)가 해당 사이트에서만 적용되고, 전역 대상 언어 설정값은 바뀌지 않는다(#262). 전역 대상 변경 시 오버라이드 없는 사이트에 즉시 반영.
- [ ] 설정 팝업에서 스타일 변경 시 열린 페이지 툴팁에 즉시 반영.

