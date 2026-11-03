# 팝업 / 설정 UI 동작 명세 (Svelte 5 재작성용)

> 기준 리비전: 브랜치 `chore/modernize-tooling`, HEAD `042a3a34` + 커밋되지 않은 워킹트리 변경(`src/pages/index.vue`, `src/pages/speech.vue` 등 — 이 문서는 워킹트리 상태를 기준으로 함).
> 목적: Vue 3 + Vuetify 3 + Pinia + vue-router(auto) + maska로 구현된 팝업/설정 UI를 **프레임워크 없는 Svelte 5**로 다시 짤 때 기능이 1:1로 같도록 하는 행동 명세. "현재 이렇게 동작한다"를 기록하며, 버그도 일단 그대로 기록한다(마지막 "관찰" 절).

대상 파일: `public/popup.html`, `src/popup.js`, `src/App.vue`, `src/router/index.js`, `src/pages/**`, `src/components/*.vue`, `src/stores/*.js`, `src/util/setting.js`, `setting_default.js`, `setting_util.js`, `i18n.js`, `review_util.js`, `src/flashcard/deck.js`, `doc/insertLocale.py`, `public/_locales/en/messages.json`.

---

## 1. 부팅 시퀀스

### 1.1 `public/popup.html`
```html
<link rel="stylesheet" href="popup.css" />
<script type="module" src="popup.js"></script>
<body><div id="app"></div></body>
```
- `<html lang="en">` 고정, `dir` 속성 없음(항상 LTR).
- `popup.css`라는 **정확한 파일명**을 링크한다(빌드가 popup 엔트리의 CSS를 `popup.css`로 내보냄). 재작성 시에도 파일명 유지 또는 html 동시 수정.
- manifest: `action.default_popup = "popup.html"`, `options_ui = { page: "popup.html", open_in_tab: true }`. 또 `web_accessible_resources`에 `popup.html` 포함. 즉 **같은 html이 툴바 팝업, 옵션 페이지(새 탭), 새 탭으로 연 서브페이지(`popup.html#/saved`), 패널 창(`popup.html#/speech`)** 4가지 컨텍스트에서 쓰인다.

### 1.2 `src/popup.js` 순서
1. 전역 CSS 로드: `vuetify/styles`, `typeface-roboto`(Roboto 폰트), `@mdi/font`(Material Design Icons 웹폰트 — 아이콘은 전부 `mdi-*` 클래스명), vuetify css.
2. `lang = SettingUtil.getDefaultLang()` (navigator.language → 확장 언어 코드). Vuetify `locale`에 `{ [lang]: { open:"Open", close:"Close" } }`만 넣고 fallback `en`. (Vuetify 내부 문자열용일 뿐 앱 i18n과 무관.)
3. **테마**: `window.matchMedia("(prefers-color-scheme: dark)").matches` 를 **부팅 시 1회** 읽어 `defaultTheme = "dark" | "light"`. OS 테마가 바뀌어도 런타임에 따라가지 않음(재오픈 시 반영). 사용자 설정으로 테마를 고르는 옵션은 없음.
   - dark: `primary #0D47A1`, `secondary #424242`
   - light: `primary #2196F3`, `secondary #424242`
   - 나머지(배경/표면/텍스트/error 등)는 Vuetify 기본 light/dark 팔레트.
4. 비동기 IIFE:
   - `setting = await SettingUtil.loadSetting()` (임시 인스턴스; UI 언어 읽기용)
   - `await i18n.loadUiLanguage(setting.uiLanguage)` — **마운트 전에** 사용자가 고른 UI 언어의 `messages.json`을 fetch. 실패해도 catch 후 계속.
   - `createApp(App)`; `app.config.globalProperties.$t = i18n.t` (템플릿에서 `$t("Saved_Words")`).
   - `v-maska` 디렉티브 등록, Vuetify, Pinia, router 사용 → `#app`에 mount.
5. 요구사항: **모든 UI 라벨은 `loadUiLanguage` 완료 후에 계산**되어야 한다(“관찰” §13의 import 순서 이슈 참조).

### 1.3 `src/App.vue`
- `<router-view>`를 `v-fade-transition hide-on-leave`로 감싸고 `:key="route.path"` → 라우트 전환 시 페이드, 같은 컴포넌트라도 경로가 다르면 재생성.

### 1.4 `src/components/popupWindow.vue` (모든 페이지 공통 셸, speech 제외)
- `<v-app id="appWindow">` + `<slot/>` + `<alertPopup/>`(전역 알림 카드).
- `created()`에서 `settingStore.loadSetting()` 호출 → **페이지가 마운트될 때마다 새 `Setting` 인스턴스를 로드**.
- `watch: setting (deep)` → 어떤 변경이든 `saveSetting()` (= `toRaw(setting).save()`, 전체 객체를 `storage.local`에 기록). 즉 **UI의 모든 설정 변경은 즉시 자동 저장**되며 "저장" 버튼은 없다. 로드 직후 `{}`→인스턴스 대입도 watcher를 1회 발화시켜, 페이지 마운트마다 전체 save가 1회 일어난다.
- 전역 CSS(스코프 없음):
  - `@media (max-width:400px)` (툴바 팝업): `body { width:392px; height:600px; margin:0 }`
  - `@media (min-width:400px)` (새 탭/옵션 페이지): `body { min-width:380px; min-height:600px; margin:0; background-color: rgba(255,240,240,.1) }`, `#appWindow { margin:auto; max-width:800px; box-shadow: rgba(149,157,165,.2) 0 8px 24px }`
  - `.scroll-container { height: calc(100vh - 112px); flex-direction:column; overflow-y:auto; padding-top:0 !important }`
  - `.v-input .v-label { font-size:16px !important }`

---

## 2. 라우팅

- `createWebHashHistory()` + `unplugin-vue-router`(파일=라우트). 명시 routes 배열은 비어 있음(주석뿐). URL 형식: `popup.html#/<path>`.
- 쿼리 `?whatsnew=1`은 해시 **앞**의 `location.search`에 붙는다(`popup.html?whatsnew=1` → 해시 없음 → `/`).

| 경로 | 파일 | 진입 방법 | 셸 |
|---|---|---|---|
| `/` | `pages/index.vue` | 툴바 아이콘 클릭(팝업), 옵션 페이지, `popup.html?whatsnew=1`(업데이트 후 background가 새 탭으로 엶) | popupWindow |
| `/about` | `pages/about.vue` | 설정 화면 툴바 `mdi-menu` 아이콘 → `router.push` (같은 창) | popupWindow |
| `/saved` | `pages/saved.vue` | 설정 툴바 `mdi-bookmark-multiple` → `browser.tabs.create({url: runtime.getURL("popup.html#/saved")})` **새 탭** | popupWindow (뒤로가기 없음) |
| `/deck` | `pages/deck/index.vue` | about 메뉴 "Flashcard" → `router.push("/deck")` | popupWindow |
| `/deck/card` | `pages/deck/card.vue` | deck 화면 "Play" 버튼(검사 통과 시) → `router.push("/deck/card")` | popupWindow |
| `/speech` | `pages/speech.vue` | about 메뉴 "Voice Panel" → `windows.create({type:"panel"})`로 `popup.html#/speech` 창 | **셸 없음**(v-app/테마/알림 없음) |
| `/history` | `pages/history.vue` | **현재 진입점 없음**(index.vue의 주석 처리된 v-fab에만 존재). URL 직접 입력 시에만 | popupWindow |

- 뒤로가기: `BackHeader`/about/card의 `<` 버튼은 `$router.go(-1)`(히스토리 back). saved는 `hideBack`으로 버튼 숨김(독립 탭이라 back 대상 없음).
- `deck/index.vue`의 "Reset progress"는 `$router.go(0)`(= 페이지 리로드).

### 2.1 설정 화면 툴바 아이콘 (`toolbarIcons`, 순서 유지)
| id | title(i18n) | icon | 동작 |
|---|---|---|---|
| coffee | `Support_this_extension` \|\| "Support" | `mdi-coffee-to-go` | `window.open("https://buymeacoffee.com/ttop324")` |
| saved | `Saved_Words` | `mdi-bookmark-multiple` | `tabs.create(popup.html#/saved)` (newTab) |
| about | `About` \|\| "About" | `mdi-menu` | `router.push("/about")` |

`openIcon` 규칙: `url` 있으면 window.open, `newTab`이면 tabs.create(`runtime.getURL("popup.html#" + path)`), 아니면 router.push.

### 2.2 About 페이지 메뉴 (`aboutPageList`, 순서 유지)
헤더: `/floating-maple-leaf.jpg` 높이 200 cover 이미지 위에 투명 다크 툴바(`<` 뒤로) + 제목 "Mouse Tooltip Translator"(하드코딩, `text-h4`).

| key | name / sub_name (i18n 키) | icon / avatar 색 | 동작 |
|---|---|---|---|
| howToUse | `How_to_use` / `Check_how_to_use_this_extension` | `mdi-help-box` / green | window.open(`https://github.com/ttop32/MouseTooltipTranslator/blob/main/doc/intro.md#how-to-use`) |
| pdfViewer | `PDF_Viewer` / `Translate_local_PDF_file` | `mdi-file-pdf-box` / red | window.open(`runtime.getURL("/pdfjs/web/viewer.html") + "?file=/pdf_demo.pdf"`) |
| epub | `Ebook_Reader` / `Translate_local_ebook_file` | `mdi-book-open-blank-variant` / orange | window.open(`runtime.getURL("/foliate-js/reader.html")`) |
| voicePanel | `Voice_Panel` / `Translate_Voice` | `mdi-microphone-message` / cyan | **패널 오픈**(아래) `"/popup.html#/speech"` |
| reviewPage | `Review_Page` / `Comment_on_this_extension` | `mdi-message-draw` / primary | window.open(`getReviewUrl()`) |
| sourceCode | `Source_code` / `Check_source_code_in_github` | `mdi-github` / black | window.open(github repo) |
| privacyPolicy | `Privacy_Policy` / `User_privacy_policy` | `mdi-shield-account` / error | window.open(`.../doc/privacy_policy.md`) |
| deck | `Flashcard`\|\|"Flashcard" / `Flashcard_makes_cards_from_your_saved_words`\|\|"Flashcards from your saved words" | `mdi-card-multiple` / primary | `router.push("/deck")` |

패널 오픈(`openUrlAsPanel`):
1. `url = runtime.getURL("/popup.html#/speech")`
2. `tabs.query({url: origin+pathname})`(해시/쿼리 제외)로 찾은 탭 중 `tab.url === url`인 것을 `tabs.remove` (중복 패널 제거).
3. `windows.create({ url, type:"panel", width: round(screen.width*0.5), height: round(screen.height*0.15), left: 가운데, top: 가운데 })`.

`getReviewUrl()` (`review_util.js`): `runtime.id`가 Edge 스토어 id(`nnodgmifnfgkolmakhcfkkbbjjcobhbl`) → Edge 상세, Chrome id(`hmigninkgibhdckiaphhmbgcghochdjc`) → Chrome 리뷰, Firefox(`typeof InstallTrigger !== "undefined"`) → AMO 리뷰, 그 외 → Chrome 리뷰.

---

## 3. 설정 시스템 (런타임)

### 3.1 `Setting` 클래스 (`src/util/setting.js`)
- **평범한 객체**: 설정 키가 인스턴스의 own enumerable 프로퍼티로 직접 붙는다(`setting["translateTarget"]`). getter/setter, 프록시 없음.
- 모듈 전역 `defaultSettingList`, `updateCallbackFn`(마지막 `loadSetting` 호출이 덮어씀 — 같은 JS 컨텍스트에서 여러 인스턴스 만들면 콜백은 마지막 것만 유효).
- `static loadSetting(defaultList, callbackFn)` → `initialize()`:
  1. `loadDefaultData()` — 기본값을 own 프로퍼티로 복사(`value != null`인 것만).
  2. `loadStorageData()`:
     - `storage.local.get(null)` — **전체 키**(스키마 외 동적 키 `ttsVoice_<lang>`, `ttsRate_<lang>` 보존, #338).
     - **마이그레이션** `DEPRECATED_KEY_MAP = { keyToggleMouseoverTextType: "keyHoldMouseoverTextType" }`: 옛 키가 있으면 새 키가 없을 때만 값 복사, 옛 키 삭제, 끝나고 `storage.local.remove(옛 키)` + `save()`.
     - `loadData(storage)` (null 아닌 값만 덮어씀).
     - `this.syncSetting === "true"` 이고 `storage.sync` 있으면 `storage.sync.get(null)`에서 `SYNC_EXCLUDE` 키 제거 후 그 위에 overlay(sync가 local보다 우선).
  3. `initSettingListener()` — `storage.onChanged`(모든 namespace: local·sync 구분 안 함)에서 `this[key] = changes[key].newValue` 후 `runSettingCallback(changes)`: `ignoreCallbackOptionList`(기본 `["historyList"]`)에 없는 키가 하나라도 있으면 `updateCallbackFn(changes)`.
- `save()`:
  - `getPersistData()` = own enumerable 키 전체(오버라이드 중인 키는 globalValue로 치환) → `storage.local.set(data)` (await 안 함).
  - `syncSetting === "true"`면 `storage.sync.set(getSyncSubset(data))`, 에러(쿼터 등)는 로그만.
- `getSyncSubset`: `SYNC_EXCLUDE = ["historyList","wordGroups","syncSetting","lastSettingTab"]` 제외, 함수 제외, `JSON.stringify(v).length > 7000`인 키 제외.
- `setLocalOverride(key, value, globalValue)` (#262, 콘텐츠 스크립트용): non-enumerable `__overrides` 생성; `value === globalValue`면 override 제거, 아니면 `__overrides[key] = globalValue`; `this[key] = value`. 읽기는 value, save는 globalValue.
- `clear()` → `storage.local.clear()`.

### 3.2 `SettingUtil` (`src/util/setting_util.js`)
- `loadSetting(cb)` = `Setting.loadSetting(await getDefaultDataAll(), cb)`.
- `getDefaultDataAll()`: `defaultData` 복사 + `translateTarget = getDefaultLang()` + `getDefaultVoice()`(모든 언어의 `ttsVoice_<lang>` = 그 언어 보이스 목록 첫 항목).
- `getDefaultLang()` = `parseLocaleLang(navigator.language)`: bcp-47 parse → language; 변환 `zh→zh-CN`, `he→iw`, `fil→tl`; 단 원문이 정확히 `"zh-TW"`면 `zh-TW`.
- `getAllVoiceList()` = 브라우저 보이스 + Bing + GoogleTranslate, 언어 키로 concat, 키 정렬:
  - 브라우저: `browser.tts.getVoices()` 중 `remote/lang/voiceName` 모두 non-null, `remote` 우선 정렬, `parseLocaleLang(lang)` 별 `voiceName` 배열.
  - Bing: `bingTtsVoiceList[lang]` 각 이름 앞에 `BingTTS_` 접두.
  - Google: `googleTranslateTtsLangList` 각 lang에 `["GoogleTranslateTTS_<lang>"]`.
- `getSpeechTTSVoiceList()`(speechSynthesis 기반)는 UI에서 사용 안 함.
- `resetSetting()`: 로드 → `clear()` → 그 인스턴스 `save()` → 다시 로드 → `save()` → 반환. (첫 인스턴스는 clear 전에 storage를 이미 읽었으므로 `save()`가 사실상 이전 값을 다시 씀 → **실제로 리셋되는지 의심**, §13-8.)
- `importSetting(data)`: 로드 → `loadData(data)`(merge, null 값 무시, 기존 키 삭제 없음, 검증 없음) → `save()`.
- `exportSetting()`: 로드 → `JSON.parse(JSON.stringify(instance))` (own enumerable 전체: historyList, wordGroups, llmApiKey 포함).

### 3.3 Pinia 스토어 `useSettingStore` (`src/stores/setting.js`)
- state: `setting: {}`, `isLoaded: false`.
- `loadSetting()`: `this.setting = await SettingUtil.loadSetting()`(콜백 없음); `isLoaded = true`.
- `saveSetting()`: `toRaw(this.setting).save()`.
- `waitSettingLoad()`: `util.waitUntilForever(() => this.isLoaded)` (폴링).
- 반응성 주의: storage.onChanged 리스너는 **raw 인스턴스**에 쓰므로 외부 변경(background의 import/reset, 콘텐츠 스크립트의 historyList 기록 등)은 **화면에 즉시 반영되지 않음**(다음 페이지 마운트/리로드 시 반영). 값 자체는 raw에 들어가므로 다음 save 때 덮어쓰지는 않음.

### 3.4 Pinia 스토어 `useAlertStore` (`src/stores/alert.js`)
- state 선언: `setting: "title"`(오타로 보임), `description: "description"`, `isShowed: false`. `title`은 state에 없지만 액션이 `this.title`에 씀.
- actions: `showPopup(title, description)`, `showPopupData({title, description})`, `hidePopup()`(빈 문자열 + isShowed=false).
- 소비: `alertPopup.vue` — `isShowed`일 때 화면 중앙(absolute, translate -50%, z-index 10, width 300px) 카드: 파란 툴바에 title, 본문 description, 우측 "close"(하드코딩) 버튼 → hidePopup. 오버레이/배경 클릭 닫힘 없음.

### 3.5 변경 전파 경로
1. 팝업에서 값 변경 → popupWindow deep watcher → `save()` → `storage.local.set`(전체) (+sync 미러).
2. `storage.onChanged`가 모든 컨텍스트에서 발화:
   - **콘텐츠 스크립트** (`contentScript.js getSetting`): 인스턴스 갱신 후 콜백 → `applyPerSiteTargetLang`, `resetTooltipStatus`, `applyStyleSetting`, `checkVideo`, `speech.initSpeechRecognitionLang`, `refreshSavedWordHighlight`, `rebuildKeyBindings`. (`historyList`만 바뀐 경우 콜백 생략.)
   - **background**: 인스턴스 갱신, 콜백 `onSettingChanged` — `saveContextMenu` 변경 시 컨텍스트 메뉴 재구성.
   - **speech 패널**: 콜백 → 스타일/언어 재적용 + 인식 stop(→ onend에서 자동 재시작).
3. 별도의 메시지 브로드캐스트는 없음 — **storage 이벤트가 유일한 전파 채널**. 재작성 시 동일하게 "전체 객체 storage.local.set"을 유지하면 다른 컨텍스트는 수정 불필요.

---

## 4. 설정 스키마 (`src/util/setting_default.js`)

### 4.1 항목 포맷
`settingDict[key] = { ... }` 필드:

| 필드 | 의미 |
|---|---|
| `default` | 기본값. `defaultData = {key: default}`로 추출됨(버튼 항목은 `undefined` → `loadData`에서 무시). |
| `i18nKey` | 라벨 로케일 키. 설정 화면에서 `value.description = i18n.getMessage(i18nKey)` (**키 폴백 없음** → 로케일 누락 시 빈 라벨). |
| `optionList` | `{ 라벨키: 값 }` 객체(셀렉트 항목). 텍스트/버튼류는 `{}`/`""`/`[]`. |
| `langOptionList: true` | 언어 목록 — 라벨을 CLDR(Intl.DisplayNames)로 현지화하고 UI 언어로 정렬. |
| `optionType` | 렌더러 선택(아래). 없으면 단일 select. |
| `settingTab` | `main`/`keyboard`/`voice`/`graphic`/`exclude`/`advanced`/`speech`/`backup`/`remains`. `remains`는 **화면에 렌더 안 함**(내부 상태 저장용). |
| `visibleWhen(setting)` | false면 행을 `v-show`로 숨김(DOM은 유지). |
| `readonlyWhen(setting)` | textField readonly 조건. |
| `inputType` | textField의 `type` (`url`, `password`, 기본 `text`). |
| `placeholder` | textField placeholder. |
| `menu` | colorPicker 메뉴 열림 상태(런타임에 mutate, 스와치 모서리 원형/사각 전환용). |
| `icon`, `color` | button 아이콘(mdi)과 색. |
| `onClick` | 행(list-item) 클릭 시 호출. |
| `onClickFuncName` | button 제목 클릭 시 `index.vue` 컴포넌트의 해당 메서드 호출. |

### 4.2 optionType 렌더 규칙 (`index.vue`)
| optionType | 렌더 | 값 형태 |
|---|---|---|
| (없음) | 단일 select(underlined). 항목 = `wrapTitleValueJson(optionList)` → `[{title, value}]` | 문자열 |
| `multipleSelect` | 다중 select + chips + chip 닫기 버튼 | 문자열 배열 |
| `fontSelect` | 단일 select; **각 항목과 선택값을 그 폰트(`font-family: value || inherit`)로 렌더**(미리보기, #86) | 문자열(`""`=기본) |
| `comboBox` | 자유 입력 다중 chips 콤보박스(엔터로 항목 추가, chip 닫기로 삭제). 제안 목록 없음(optionList `""`) | 문자열 배열 |
| `colorPicker` | 텍스트필드 + maska 마스크 `"!#XXXXXXXX"`(`!#` = 리터럴 `#`, `X` = `[0-9a-fA-F]`, 최대 8자리) + append 슬롯에 30×30 스와치(배경=현재값, box-shadow, 메뉴 열리면 원형) → 클릭 시 `v-color-picker`(mode 미지정, 알파 슬라이더 포함) 메뉴(내용 클릭 시 닫히지 않음) | hex 문자열. 피커 출력은 Vuetify `extractColor` 규칙: 알파=1이면 `#RRGGBB`(7자), 아니면 `#RRGGBBAA`(9자). 마스크는 타이핑만 제한 |
| `textField` | 텍스트필드, `type=inputType`, placeholder, `readonlyWhen` | 문자열 |
| `llmModelSelect` | 자유입력 콤보박스(항목 = 런타임 `llmAvailableModels`) + 우측 `mdi-refresh` 아이콘 버튼(로딩 스피너, title "Fetch models from endpoint") | 문자열 |
| `button` | `mdi` 아이콘(size 20, color) + 라벨 텍스트. 조용한 스타일(0.875rem, opacity .85, hover 1) | 값 없음 |

버튼 클릭 의미: list-item `@click`이 `option.onClick()`을, 제목 `@click`이 `this[onClickFuncName]()`을 부른다 — 제목 클릭 시 **둘 다** 실행. (block/allow 버튼은 `onClick`이 no-op, import/export/reset은 `onClickFuncName` 없음.)

### 4.3 옵션 라벨 현지화 (`convertOptionI18n`, 모듈 로드 시 1회, settingDict를 **in-place로 변경**)
- 일반 목록: 각 키에 대해 `getMessage(key) || key` (예: `Ctrl_Left` → "Ctrl Left"; 숫자 `"18"` → 메시지 없음 → "18"; 엔진명 `"LLM - OpenAI / ..."` → chrome.i18n이 잘못된 이름으로 throw → "" → 키 그대로).
- 언어 목록(`langOptionList`): 로케일 메시지가 있는 키(Auto/None/Default 등) → "specials"로 원래 순서대로 맨 위; 나머지 → `getLocalizedLangName(value, key.replace(/_/g," "), uiLang)`로 이름 생성 후 `localeCompare(uiLang)` 정렬. UI 언어가 `en*`이면 영문 큐레이션 이름 그대로.
- `uiLanguageList`의 키는 엔도님(“한국어”, “Deutsch”…)이라 메시지 없음 → 그대로 표시. 단 `Auto`는 현지화.
- 결과 객체는 `{현지화라벨: 값}` — **라벨이 겹치면 뒤 항목이 앞 항목을 덮어씀**(객체 키).
- 그 다음 렌더 시 `sortLangOption`: `langPriorityOptionList = [translateSource, translateTarget, translateTarget2, writingLanguage, translateReverseTarget]`에 한해 `setting.langPriority[value]` 내림차순 안정 정렬(동률은 기존 알파벳 순 유지). `langPriority` 기본값 `{auto: 9999999, null: 9999999}` → Auto/None이 항상 맨 위.

### 4.4 옵션 목록 소스
| 목록 | 정의 | 값 |
|---|---|---|
| `langList` (lang.js) | 번역 언어 `{영문명: 코드}` | `langListWithAuto`(+`Auto:"auto"`), `langListWithNone`(+`None:"null"`), `langListWithDefault`(+`Default:"default"`) |
| `ocrLangList` | tesseract 코드 (`jpn_vert` 등) | |
| `listenLangList` | 음성 인식 BCP-47 (`en-US`, `ar-AE` …) | |
| `toggleList` | `On:"true"`, `Off:"false"` (문자열!) | |
| `keyList` | `None:null(문자열 "null")`, `Ctrl_Left:ControlLeft`, `Ctrl_Right`, `Alt_Left`, `Alt_Right`, `Shift_Left`, `Shift_Right`, `Meta_Left`, `Meta_Right`, `Click_Left:ClickLeft`, `Click_Middle`, `Click_Right`, `F2`, `F8`, `F9` | |
| `keyListWithAlways` | keyList + `Always:"always"` | |
| `keyListWithAlwaysSelect` | keyList + `Select:"select"` + `Always:"always"` | |
| `translatorList` | google, bing, localLlm("LLM - OpenAI / Claude / Gemini / Local (Experimental)"), deepl, yandex, baidu, papago, browserAPI, googleWebImage, googleGTX, googleWeb, googleV2 (Experimental 표기). duckduckgo/chatgpt/lingva 등은 주석 처리 | |
| `llmProviderList` | Custom:custom, OpenAI:openai, Claude:claude, Gemini:gemini, Grok:grok, Groq:groq, OpenRouter:openrouter, GitHub Models:githubModels, Ollama:ollama, LM Studio:lmstudio | |
| `llmProviderEndpoints` (export) | custom `""`, openai `https://api.openai.com/v1`, claude `https://api.anthropic.com/v1`, gemini `https://generativelanguage.googleapis.com/v1beta/openai`, grok `https://api.x.ai/v1`, groq `https://api.groq.com/openai/v1`, openrouter `https://openrouter.ai/api/v1`, githubModels `https://models.inference.ai.azure.com`, ollama `http://localhost:11434/v1`, lmstudio `http://localhost:1234/v1` | |
| `translateActionList` | Select:select, Mouseover:mouseover, Mouseover_n_Select:mouseoverselect | |
| `detectTypeList` | Word:word, Sentence:sentence, Container:container | |
| `subtitleTypeList` | Dual_Subtitle:dualsub, Target_Single_Subtitle:targetsinglesub, Source_Single_Subtitle:sourcesinglesub, None:"null" | |
| `voiceTargetList` | Source_Text:source, Translated_Text:target, Source_n_Translated:sourcetarget, Translated_n_Source:targetsource | |
| `speechTextTargetList` | Source:source, Translated:target, Source_n_Translated:sourcetarget | |
| `tooltipPositionList` | Follow:follow, Fixed:fixed, Top_Right:topright | |
| `tooltipPlacementList` | Above:top, Below:bottom | |
| `tooltipAnimationList` | None:"", Fade:fade, Scale:scale, Shift_away:shift-away, Shift_toward:shift-toward, Perspective:perspective | |
| `textAlignList` | Center, Left, Right, Justify (값 소문자) | |
| `ebookThemeList` | Auto:auto, Light:light, Dark:dark | |
| `dictionarySourceList` | Translator:translator, Wiktionary:wiktionary | |
| `websiteFilterModeList` | Both:auto, Blacklist:blacklist, Whitelist:whitelist | |
| `uiLanguageList` | Auto:auto + 엔도님→`_locales` 디렉터리명 55개(en, en_GB, en_US, en_AU, ar, am, … zh_CN, zh_TW) | |
| 범위 목록 `_util.getRangeOption(start,end,inc,decimals)` | `_.range(start,end,inc).map(toFixed)` 를 `{s:s}`로 | 아래 |

범위: `tooltipFontSizeList` 6..40 step 2; `tooltipWidth` 100..1000 step 100; `voiceVolumeList` "0.0".."1.0" step .1; `voiceRateList` "0.5".."2.0" step .1; `voiceRepeatList` 1..10; `tooltipBackgroundBlurList` 0..20; `distanceList` 0..40; `tooltipDisappearList` 0..500 step 50; `mouseoverIntervalList` 0..1000 step 50. (`tooltipIntervalTimeList`, `voiceRateListWithDefault`는 미사용.)

### 4.5 전체 설정 키 표
탭은 `settingDict` **선언 순서**로 결정된다. 렌더 탭 순서: **MAIN → KEYBOARD → VOICE → GRAPHIC → EXCLUDE → ADVANCED → SPEECH → BACKUP** (en messages.json의 키 순서 GRAPHIC→VOICE와 다르니 주의). 같은 탭 안 행 순서도 선언 순서 — `mouseoverEventInterval`은 remains 블록 뒤에 선언되어 **ADVANCED 탭의 맨 마지막**에 나온다.

타입 표기: S=문자열, B=boolean, A=배열, O=객체. 토글은 `"true"/"false"` **문자열**.

#### MAIN
| key | optionType | default | 의미 |
|---|---|---|---|
| translateSource | select(lang, +Auto) | `"auto"` | 번역 원문 언어 (`Translate_From`) |
| translateTarget | select(lang) | `"en"` → 실제 기본은 `getDefaultLang()` | 번역 대상 언어 (`Translate_Into`) |
| translateTarget2 | select(lang, +None) | `"null"` | 두 번째 대상 언어 |
| translatorVendor | select | `"google"` | 번역 엔진 |
| llmProvider | select | `"custom"` | LLM 프로바이더. visibleWhen `translatorVendor==="localLlm"` |
| llmApiEndpoint | textField(url) | `""` | placeholder `http://localhost:11434/v1`; visibleWhen localLlm; readonlyWhen `llmProvider && llmProvider!=="custom"` |
| llmApiKey | textField(password) | `""` | placeholder `sk-...`; visibleWhen localLlm |
| llmModel | llmModelSelect | `""` | 모델명; visibleWhen localLlm |
| translateWhen | select | `"mouseoverselect"` | 번역 트리거(선택/마우스오버/둘다) |
| mouseoverTextType | select | `"sentence"` | 마우스오버 감지 단위 |
| writingLanguage | select(lang) | `"en"` | 입력란 번역 대상 언어 |
| ocrLang | select(ocr lang) | `"jpn_vert"` | OCR 언어 |
| translateReverseTarget | select(lang,+None) | `"null"` | 원문이 대상언어일 때 역번역 언어 |
| detectSubtitle | select | `"dualsub"` | 자막 모드 |

#### KEYBOARD
| key | optionType | default | 의미 |
|---|---|---|---|
| showTooltipWhen | select(keyListWithAlways) | `"always"` | 툴팁 표시 키 |
| TTSWhen | select(keyListWithAlwaysSelect) | `"ControlLeft"` | 음성 읽기 키 |
| keyDownTranslateWriting | select(keyList) | `"AltRight"` | 입력문 번역 키 |
| ignoreAltGr | toggle | `"false"` | AltGr를 일반 타이핑으로 간주(#352/#355) |
| keyDownAutoReader | keyList | `"F2"` | 자동 읽기 |
| keyDownTranslatePage | keyList | `"null"` | 페이지 번역 |
| keyDownOCR | keyListWithAlways | `"ShiftLeft"` | OCR |
| keySpeechRecognition | keyList | `"ControlRight"` | 음성 인식 |
| keyHoldMouseoverTextType | keyList | `"F8"` | 누르는 동안 감지 단위 전환(구 `keyToggleMouseoverTextType`) |
| keySecondaryLang | keyList | `"null"` | 두 번째 언어 전환 |
| swapKeyToggleMode | toggle | `"false"` | 위 두 키를 hold 대신 toggle로(#321) |
| keyToggleEnable | keyList | `"null"` | 확장 on/off 토글(#126) |
| keyTTSPause | keyList | `"null"` | TTS 일시정지/재개(#124) |

#### VOICE
| key | optionType | default | 의미 |
|---|---|---|---|
| voiceVolume | select | `"1.0"` | 볼륨 |
| voiceRate | select | `"1.0"` | 전역 속도 |
| voiceTarget | select | `"source"` | 읽을 텍스트 |
| voiceRepeat | select | `"1"` | 반복 횟수 |
| `ttsVoice_<lang>` (동적) | select | 해당 언어 보이스 목록[0] | `Voice_for_` + 언어명. 스키마 외, §5.4 |
| `ttsRate_<lang>` (동적) | select | `"default"` | `Voice_speed_for_` + 언어명. `"default"` = voiceRate 따름 |

#### GRAPHIC
| key | optionType | default | 의미 |
|---|---|---|---|
| tooltipFontSize | select | `"18"` | 글자 크기(px) |
| tooltipFontFamily | fontSelect | `""` | 툴팁 폰트(런타임 목록) |
| subtitleBackground | toggle | `"true"` | 이중자막 반투명 배경 |
| tooltipWidth | select | `"200"` | 툴팁 너비 |
| tooltipDistance | select | `"20"` | 커서와 거리 |
| tooltipAnimation | select | `"fade"` | 애니메이션 |
| tooltipDisappearDuration | select | `"250"` | 사라짐 시간(ms) |
| tooltipPosition | select | `"follow"` | 위치 모드 |
| tooltipPlacement | select | `"top"` | 위/아래 |
| tooltipTextAlign | select | `"center"` | 정렬 |
| tooltipBackgroundBlur | select | `"6"` | 배경 블러 |
| mouseoverHighlightText | toggle | `"false"` | 감지 텍스트 하이라이트 |
| tooltipFontColor | colorPicker | `"#ffffffff"` | |
| tooltipBackgroundColor | colorPicker | `"#00000080"` | |
| tooltipBorderColor | colorPicker | `"#ffffff00"` | |
| mouseoverTextHighlightColor | colorPicker | `"#21dc6d40"` | |
| ebookTheme | select | `"auto"` | 이북 뷰어 테마(#201) |
| compactMode | toggle | `"false"` | **설정 화면 자체**의 compact 모드(#220) |

#### EXCLUDE
| key | optionType | default | 의미 |
|---|---|---|---|
| langExcludeList | multipleSelect(lang) | `[]` | 번역 제외 언어 |
| websiteFilterMode | select | `"auto"` | 사이트 필터 모드 |
| websiteExcludeList | comboBox | `["*.example.com"]` | 제외 사이트 |
| websiteWhiteList | comboBox | `[]` | 허용 사이트 |
| websiteTargetLangList | comboBox | `[]` | `site=lang` 사이트별 대상 언어(#262) |
| websiteExcludeBtn | button (`mdi-web-cancel`, red) | — | `excludeCurrentWebsiteOnclickFunc` |
| websiteWhitelistBtn | button (`mdi-web-check`, green) | — | `includeWhitelistCurrentWebsiteOnclickFunc` |

#### ADVANCED
| key | optionType | default | 의미 |
|---|---|---|---|
| uiLanguage | select | `"auto"` | UI 언어(#76). 변경 시 400ms 후 리로드 |
| detectPDF | toggle | `"true"` | PDF를 내장 뷰어로 |
| mouseoverTextType2 | select | `"sentence"` | 보조 감지 단위 |
| mouseoverPauseSubtitle | toggle | `"true"` | 자막 위 마우스오버 시 영상 일시정지 |
| mouseoverWhileWriting | toggle | `"false"` | 입력 중 툴팁 |
| tooltipInfoSourceText | toggle | `"false"` | 툴팁에 원문 표시 |
| translateExcludeRegex | textField | `""` | 제외 정규식 (placeholder `e.g. ^[0-9.,]+$|https?://`) |
| tooltipInfoSourceLanguage | toggle | `"false"` | 원문 언어 표시 |
| tooltipInfoTransliteration | toggle | `"false"` | 음역 표시 |
| tooltipWordDictionary | toggle | `"true"` | 단어 사전 |
| tooltipWordDictionarySource | select | `"translator"` | 사전 소스 |
| fallbackTranslatorEngine | toggle | `"true"` | 실패 시 대체 엔진 |
| mouseoverEventInterval | select | `"300"` | 툴팁 표시 지연(ms) (`Tooltip_Show_Delay`, #235) — 탭 맨 끝 |

#### SPEECH
| key | optionType | default | 의미 |
|---|---|---|---|
| speechRecognitionLanguage | select(listenLangList) | `"en-US"` | 인식 언어 |
| voicePanelTranslateLanguage | select(lang,+Default) | `"default"` | 패널 번역 언어(default=translateTarget) |
| voicePanelTextTarget | select | `"sourcetarget"` | 표시 텍스트 |
| voicePanelPadding | select | `"20"` | 블록 상단 패딩 |
| voicePanelTextAlign | select | `"center"` | |
| voicePanelSourceFontSize / TargetFontSize | select | `"18"` / `"18"` | |
| voicePanelSourceFontColor / TargetFontColor | colorPicker | `"#ffffffff"` | |
| voicePanelSourceBorderColor / TargetBorderColor | colorPicker | `"#000000b8"` | text-shadow 색 |
| voicePanelBackgroundColor | colorPicker | `"#333333"` | |

#### BACKUP
| key | optionType | default | 의미 |
|---|---|---|---|
| syncSetting | toggle | `"false"` | storage.sync 미러(#134). sync 제외 키 |
| importSetting | button (`mdi-file-upload`, primary) | — | `.json` 파일 선택 → `sendMessage({type:"importSetting", data})` |
| exportSetting | button (`mdi-content-save`, green) | — | `sendMessage({type:"exportSetting"})` → `settingData` JSON(들여쓰기 2) Blob → `mouse-tooltip-translator-settings.json` 다운로드 (anchor를 body에 붙였다 제거, URL은 1s 후 revoke, #264) |
| resetSetting | button (`mdi-restore`, red) | — | `sendMessage({type:"resetSetting"})` (확인 대화상자 없음) |

#### REMAINS (렌더 안 됨, 내부 상태)
| key | default | 타입 | 의미 / 사용처 |
|---|---|---|---|
| llmProviderSettings | `{}` | O | 프로바이더별 `{apiEndpoint, apiKey, model}` 저장소(§5.5) |
| subtitleButtonToggle | `"true"` | S | 자막 버튼 토글(콘텐츠 측) |
| historyList | `[]` | A | 저장 단어/히스토리 레코드 + 플래시카드 상태(§7) |
| wordGroups | 5개 그룹(아래) | A | 저장 단어 그룹 |
| saveContextMenu | `false` | **B** | 우클릭 "Save to <group>" 메뉴 표시 |
| historyRecordActions | `[]` | A | 구 "Record when"(saved.vue가 group1로 이관 후 비움) |
| ignoreCallbackOptionList | `["historyList"]` | A | 이 키만 바뀌면 설정 콜백 생략 |
| popupCount | `"0"` | S | 미사용 |
| coffeeCount | `"0"` | S→number | 후원 배너 노출 카운터 |
| langPriority | `{auto:9999999, null:9999999}` | O | 언어 사용 빈도 점수 |
| cardPlayMeta | `["image"]` | A | 카드 자동재생/이미지 옵션(`source`/`target`/`image`) |
| lastSettingTab | `"MAIN"` | S | 마지막 탭(#83). sync 제외 |
| cardTagSelected | `[]` | A | 플레이할 그룹 태그 `wordgroup:<id>` |
| deckStatus | `{}` | O | `{date, tags, isFin}` |
| cardLen | `{}` | O | `{newStart, reviewStart, learningStart, newFin, reviewFin, allFin}` |
| (non-enumerable) `__overrides` | — | O | setLocalOverride 내부용, 저장 안 됨 |

`wordGroups` 기본:
```js
[{ id:1, name:"Group 1", color:"#21dc6d40", enabled:false, key:"CtrlShift1" },
 { id:2, name:"Group 2", color:"#2196f340", enabled:false, key:"CtrlShift2" },
 { id:3, name:"Group 3", color:"#ff980040", enabled:false, key:"CtrlShift3" },
 { id:4, name:"Group 4", color:"#9c27b040", enabled:false, key:"CtrlShift4" },
 { id:5, name:"Group 5", color:"#f4433640", enabled:false, key:"CtrlShift5" }]
```

---

## 5. 설정 화면 (`pages/index.vue`, 경로 `/`)

### 5.1 레이아웃
- 상단 `v-toolbar color=primary dense`: 왼쪽(7/12 폭) 앱 이름 `Mouse_Tooltip_Translator`(subtitle-1, bold), 오른쪽 툴바 아이콘 3개(§2.1).
- 툴바 extension 슬롯에 탭 바: `center-active`, `show-arrows`(오버플로 화살표), 슬라이더 빨강, 탭 글꼴 0.75rem / min-width 60px / padding 0 12px. 탭 라벨 = `getMessage(TAB_ID)` (`MAIN`, `KEYBOARD`, `VOICE`, `GRAPHIC`, `EXCLUDE`, `ADVANCED`, `SPEECH`, `BACKUP`; 탭 id는 `settingTab.toUpperCase()`).
- **휠로 탭 스크롤**(#344): 탭 바 위 `wheel` → 내부 `.v-slide-group__container`가 가로 오버플로일 때만 `preventDefault` 후 `scrollLeft += (|deltaX|>|deltaY| ? deltaX : deltaY)`.
- 본문 `v-tabs-window`(class `scroll-container`, 높이 `calc(100vh - 112px)`, 세로 스크롤; `compactMode==="true"`면 `compact-mode` 클래스). 탭 전환은 슬라이드 애니메이션(Vuetify 기본).
- MAIN 탭 맨 위에만 `CommentBanner`(§5.8).
- 각 행(`setting-item`, flex, 세로 margin 16px / compact 3px):
  - 왼쪽 바(`left-space`, margin 0 8px, 2px 노란 테두리): 기본값과 다르면 opacity .5, 같으면 0 → "수정됨" 표시.
  - 가운데 컨트롤(`v-lazy` — 뷰포트 진입 시 렌더), 모든 입력은 `variant=underlined`, `hide-details=auto`, 라벨=`description`.
  - 오른쪽(40px): 수정됨이면 `mdi-restore` 아이콘(원형 배경 `#ffffff11`, hover `#ffffff55`, padding 16) → `setting[key] = defaultSettings[key]` (개별 리셋).
  - `visibleWhen`이 false면 숨김.
- 검색/필터 기능 **없음**. 전체 리셋은 BACKUP 탭 버튼(§4.5).

### 5.2 수정 여부 판정 `isDefaultSetting(key)`
- `defaultSettings = await SettingUtil.getDefaultDataAll()` (mounted 후반에 채워짐 — 그 전엔 `{}`라 모든 행이 "수정됨"으로 잠깐 보임).
- `ttsRate_*`는 default가 undefined면 `"default"`로 간주.
- `isSettingEqual`: `===`, 배열은 길이+원소 재귀 비교, **객체는 항상 다름**(객체형 설정은 렌더 안 되므로 영향 없음).

### 5.3 mounted 순서
1. `addTtsVoiceTabOption()` (내부에서 `waitSettingLoad`)
2. `addFontFamilyOption()`
3. `waitSettingLoad()`
4. `defaultSettings = getDefaultDataAll()`
5. `lastSettingTab`이 존재하는 탭이면 `currentTab` 복원(#83). 이후 `currentTab` 변경 시 `setting.lastSettingTab = val` (자동 저장).
6. `location.search`에 `whatsnew` 있으면 `openWhatsNew()`(§10).

### 5.4 VOICE 탭 동적 행 (`addTtsVoiceTabOption`)
- `availableVoiceList = getAllVoiceList()`; `langListOpposite`(코드→영문명)의 키 중 voice 목록이 있는 언어만, `langPriority` 내림차순 정렬(#334).
- 언어마다 두 행을 VOICE 탭 **끝에** 추가(정적 4개 뒤):
  - `ttsVoice_<lang>`: 라벨 `getMessage("Voice_for_") + 현지화 언어명`, 옵션 = 보이스 이름 그대로(`{name:name}`; `BingTTS_…`, `GoogleTranslateTTS_…` 접두 포함 원문 표시).
  - `ttsRate_<lang>`: 라벨 `Voice_speed_for_ + 언어명`, 옵션 `{ [getMessage("Default")||"Default"]: "default", "0.25","0.5","0.75","1.0","1.25","1.5","1.75","2.0","2.5","3.0" }`.
  - `setting["ttsRate_"+lang] == null`이면 `"default"`를 써 넣음(→ 첫 오픈 때 다수 키가 저장됨).
- 정적 옵션처럼 `convertOptionI18n`을 거치지 않음(라벨 원문).

### 5.5 LLM 프로바이더 (MAIN 탭, `translatorVendor==="localLlm"`일 때만 4행 표시)
- `applyLlmProviderPreset(new, old)`(settingWrapper deep watch에서): `llmProvider`가 바뀌면(이전 값 non-null)
  1. 이전 프로바이더의 `{apiEndpoint, apiKey, model}`을 `llmProviderSettings[prev]`에 저장.
  2. 새 프로바이더 저장분이 있으면 복원, 없으면 endpoint = `llmProviderEndpoints[provider]`(custom이면 `""`), key/model `""`.
  3. `llmAvailableModels = []`.
- endpoint는 provider가 custom이 아니면 readonly.
- 모델 새로고침 버튼 `fetchLlmModels`: endpoint 비면 에러 "API endpoint is empty"; 아니면 **팝업 컨텍스트에서 직접** `localLlm.getModels(endpoint, apiKey)` = `GET {endpoint}/models` (`Authorization: Bearer <key>` 있으면, timeout 15s, retry 0) → `res.data || res.models` 의 `id||name||model`. 빈 결과면 "No models returned by endpoint". 실패 메시지는 하단 빨간 snackbar 4초: `"Failed to fetch LLM models: " + msg` (영문 하드코딩).

### 5.6 폰트 목록 (`addFontFamilyOption`, #86)
- 순서: `{ [Default 현지화]: "" }` → CSS generic(sans-serif, serif, monospace, cursive, fantasy, system-ui) → 스크립트별 하드코딩 공통 폰트 목록(라틴/한/일/중/아랍/히브리/태국/인도계/에티오피아/그리스/키릴; 원본 배열 그대로 복제할 것) → `chrome.fontSettings.getFontList()`의 `{displayName||fontId: fontId}` (Firefox는 API 없어 생략). 동일 키는 덮어씀.
- 결과를 `tabItems.GRAPHIC.tooltipFontFamily.optionList`에 대입.

### 5.7 settingWrapper 감시 (`Object.assign({}, setting)` 의 deep watch)
- `checkSettingLangPriority`: langPriorityOptionList 5개 키 값이 바뀌면(old non-null) 새 값 언어 +1; `ttsVoice_*`/`ttsRate_*` 값이 바뀌면 키의 언어 +1. `"null"`/빈 값은 무시.
- `applyLlmProviderPreset` (§5.5).
- `uiLanguage` 변경 시 `setTimeout(location.reload, 400)` — 저장될 시간을 준 뒤 재로드해 재현지화.

### 5.8 후원 배너 (`components/commentBanner.vue`)
- `v-alert type=success border=start variant=tonal closable`, title `Support_this_extension`, 본문 `Feed_a_coffee_to_the_extension_devs`, min-height 90px, 우하단 tonal 버튼 "Open"(하드코딩).
- mounted: `waitSettingLoad` → `coffeeCount = min(Number(coffeeCount)+1, 11)` → 표시 조건 `coffeeCount < 10`. 즉 **설정 화면을 열 때마다 +1, 처음 9번만 노출**.
- 버튼: `window.open("https://buymeacoffee.com/ttop324")`, `coffeeCount += 10`(최대 11) → 즉시 숨김.
- X(closable)로 닫는 것은 저장되지 않음(다음 오픈 시 다시 표시, 카운터 기준).
- `reviewTitle/reviewSubtitle/reviewUrl` 메시지는 정의만 되고 미사용.

### 5.9 사이트 차단/허용 버튼
- `getCurrentTabUrl()`: `tabs.query({active:true, currentWindow:true})[0].url`의 hostname.
- `appendSettingOnSettingList(key, host)`: 이미 있으면 무시, 없으면 새 배열로 추가 → `websiteExcludeList` / `websiteWhiteList`.

---

## 6. 히스토리 페이지 (`pages/history.vue`, `/history`) — 현재 진입점 없음
- `BackHeader title="History"`(하드코딩) + 툴바 버튼: 휴지통(`Remove history` → `historyList = []`), 다운로드(`Download history` → CSV).
- "Record Text When"(하드코딩) + `ChipOption settingName=historyRecordActions chipData=["select","mouseover"]`.
- `v-virtual-scroll`(높이 `calc(100vh - 164px)`) 항목: title=`sourceText`, subtitle=`targetText.substring(0,25)`, 높이 60, 우측 `mdi-close-circle` → 해당 index 삭제.
- CSV 헤더: `date,sourceLang,targetLang,sourceText,targetText,dict,actionType,translator`; 각 값 `TextUtil.trimAllSpace` 후 `[,#'"]`→공백, 줄 끝에 `,`; `data:text/csv;charset=utf-8,%EF%BB%BF` + encodeURI → `Mouse_Tooltip_Translator_History.csv`.

---

## 7. 저장 단어 페이지 (`pages/saved.vue`, `/saved`, 새 탭)

### 7.1 데이터
- 저장 레코드 = `setting.historyList`의 원소(최신이 index 0):
  `{ sourceText, sourceLang, targetText, targetLang, dict, actionType("select"|"mouseover"|"shortcutkey"|"import"), date(ISO), translator, groupId, ...플래시카드 필드 }`.
- 상한 `MAX_SAVED = 10000`(background와 동일, 초과 시 가장 오래된 것 제거).
- 그룹 = `setting.wordGroups` `{id, name, color(#RRGGBBAA, 페이지 하이라이트 배경), enabled(페이지 하이라이트 on/off), key}`. id 1 = 기본 그룹(삭제 불가, 이름 변경 가능). groupId 없거나 0이면 1로 간주.
- 그룹 `key` 값: `"null"`(없음), `CtrlShift0..9`, keyList 단일 키(ControlLeft…F9), 그리고 **자동 저장 트리거** `"select"`, `"mouseover"`, `"both"`. 미설정이면 유효 키 = `"CtrlShift"+id`.

### 7.2 자동 저장 트리거 (background `recordHistory`/`insertHistory`, 참고)
- 콘텐츠 스크립트가 툴팁 표시 시 `recordTooltipText` 전송 → `recentRecord` 갱신 → 자동 경로: `key === actionType`인 그룹(정확 일치 우선), 없으면 `key === "both"`인 그룹, 그것도 없으면 저장 안 함.
- 수동 경로: Ctrl+Shift+N(`saveTranslation` 메시지) / 우클릭 "Save to <group>" → `actionType:"shortcutkey"`, 지정 그룹(기본 1).
- 직전 레코드와 동일(`sourceText,sourceLang,targetText,targetLang,actionType`)하면 생략; select인데 새 sourceText가 직전 sourceText를 포함하면 직전 것 교체. unshift 후 10000 초과 시 pop, `setting.save()`.
- 우클릭 메뉴: "Copy : <번역 20자>"는 항상, `saveContextMenu`가 true면 그룹마다 "Save to <name>".

### 7.3 mounted 마이그레이션 (모두 idempotent)
1. `migrateGroups`: id 0 그룹이 있으면 id 1로(이름 "Default"면 "Group 1"), 프리셋 1~5 중 없는 것 추가.
2. `normalizeGroupId`: groupId 없음/0 → 1.
3. `migrateRecordWhenToGroup1`: `historyRecordActions`에 select/mouseover가 있으면 그룹 1의 key를 `select`/`mouseover`/`both`로 설정, 그 뒤 `historyRecordActions = []`.
4. `updateItemsPerPage` + resize 리스너; `body.classList.add("saved-wide")` → `#appWindow` max-width 1400px (언마운트 시 제거).

### 7.4 UI
- 헤더 `BackHeader :title=$t("Saved_Words") hideBack` + 버튼(순서): 그룹 관리(`mdi-tag-multiple`, `Manage_Groups`), 전체 삭제(`mdi-trash-can`, `Remove_all`, **확인 없음**), CSV 가져오기(`mdi-upload`, `Import_CSV`), CSV 다운로드(`mdi-download`, `Download_CSV`).
- 컨트롤 줄: 그룹 필터 select(`Group` 라벨, 첫 항목 `All`=null + 그룹들), 개수 `"{현재 전체 저장 수 toLocaleString} / 10,000"`(필터와 무관하게 전체 수), 우측 스위치 `Right_click_menu`(title `Add_right_click_context_menu`) → `saveContextMenu = !!val`.
- 선택이 있으면 일괄 바: `"{n} {selected}"`, `Move_to_group` select(선택 즉시 이동, 값은 항상 null로 리셋), `Delete`(빨강, 확인 없음), `Clear`.
- 테이블(compact, `table-layout: fixed`, 모든 셀 nowrap + ellipsis, 셀 title 툴팁로 전문):
  - 열: [체크박스 40px(헤더 = 현재 페이지 전체선택/부분선택 indeterminate)] [# 56px, 잘림 없음] [Date 150px] [Source(앞에 10px 그룹 색 점)] [Translation] [Group 110px].
  - 헤더 클릭 정렬: 같은 열이면 방향 토글, 다른 열이면 그 열 오름차순. 기본 `date` 내림차순. `groupId`는 숫자 비교, 나머지는 문자열 `localeCompare(undefined, {sensitivity:"base"})`. 정렬 열에 `mdi-arrow-down/up`.
  - Date 표시 = ISO 문자열 `T`→공백, 앞 16자(`YYYY-MM-DD HH:mm`, UTC 그대로).
  - 빈 목록: `No_saved_words_yet`.
  - `#`는 정렬·필터 후 전체 순번.
- 페이지네이션: `itemsPerPage = max(5, floor((innerHeight - 220) / 40))`, 1페이지 초과 시 `v-pagination total-visible=7`. 필터/정렬 변경 시 page=1, pageCount 감소 시 clamp. 무한 스크롤 없음.
- 선택은 레코드 **객체 참조**로 관리.
- 그룹 관리 다이얼로그(max-width 560): 열 때 `editGroups = clone(groups)`(key는 유효 키로 채움); 행마다 [색 스와치 28px → `v-color-picker mode=hexa`] [이름 텍스트필드] [`Save_key` select(옵션: `None`, `Ctrl+Shift+0..9`, keySecondaryLang 옵션 목록의 현지화 라벨들(None 제외), `On_Select`, `On_Hover`, `On_Select_n_Hover`)] [하이라이트 스위치(title `Highlight_on_page`)] [삭제(id 1 비활성)]. 제목줄 `+` → 새 그룹 `{id: max+1, name:"Group N", color:"#21dc6d40", enabled:true, key: N<=9 ? "CtrlShiftN" : "null"}`. `Done` 또는 바깥 클릭으로 닫히면 **그때 한 번 커밋**: 삭제된 그룹 소속 레코드 → 그룹 1, `wordGroups = clone(editGroups)`, 필터가 사라진 그룹이면 null.
- CSV 내보내기: **현재 필터+정렬된 목록**, 헤더 `date,sourceLang,targetLang,sourceText,targetText,dict,translator,group`(group=그룹 이름), 값 처리 §6과 동일, BOM 포함, 파일명 `Mouse_Tooltip_Translator_Saved_<All|그룹명>.csv`.
- CSV 가져오기: `.csv` 선택 → BOM 제거, 줄 분할(빈 줄 제외), 2줄 미만이면 무시; 첫 줄 헤더 단순 `split(",")`(따옴표 처리 없음); 각 행 → `{date, sourceLang, targetLang, sourceText, targetText, dict, translator, groupId: 이름으로 매칭 ?? 1, actionType:"import"}`, sourceText 없는 행 제외; `[...가져온 것, ...기존].slice(0, 10000)`.

---

## 8. 음성 패널 (`pages/speech.vue`, `/speech`)
- **popupWindow/Vuetify 미사용**, Pinia 미사용. 자체 `SettingUtil.loadSetting(cb)` 인스턴스.
- 전역 CSS: `html, body { overflow:hidden; font-family: -apple-system, … sans-serif }`; `.scroller { height:100vh; overflow:auto; display:flex; flex-direction:column-reverse; overflow-anchor:auto }`(새 줄이 아래에 붙고 자동으로 하단 고정), `.scroller-content { transform: translateZ(0) }`.
- 스타일(설정에서 계산, 문자열 style):
  - 전체: `text-align: voicePanelTextAlign; background-color: voicePanelBackgroundColor`
  - 블록: `padding: {voicePanelPadding}px 0 0 0`
  - 원문: `font-size: SourceFontSize px; color: SourceFontColor; text-shadow: 0 0 2px SourceBorderColor`; 번역문 동일(Target*).
  - `voicePanelTextTarget`에 "source"/"target" 포함 여부로 원문/번역 줄 표시.
- mounted: 설정 로드(콜백: `initSpeechConfig()` + `speech.stopSpeechRecognition()`) → `checkMicrophone()` → `speech.initSpeechRecognition(handleSpeechText, handleFinish)` → `initSpeechConfig()`(= `setSpeechRecognitionLang(speechRecognitionLanguage)` + 스타일) → `startSpeechRecognition()`.
- `handleFinish` = 인식 종료 시 자동 재시작(설정 변경 시 stop → 새 언어로 재시작되는 경로).
- 마이크 검사: `getUserMedia({audio:true})` 실패 시 메시지에 "Permission denied" → `alert(영문)` 후 `tabs.create("chrome://settings/content/microphone")`; "Requested device not found" → `alert(영문)`.
- 인식 결과 `handleSpeechText(text, isFinal)`:
  - 목록이 비었거나 마지막 항목이 final이면 새 블록 `{mainText:"", subText:"...", mainDir: getRtlDir(speechRecognitionLanguage), subDir: getRtlDir(translateTarget), isFinal:false, timestamp:0}` 추가.
  - 마지막 블록 `mainText=text`, `isFinal` 갱신.
  - 번역 스로틀: `Date.now() - block.timestamp <= 1400`이고 final이 아니면 번역 생략. 번역 대상 = `voicePanelTranslateLanguage==="default" ? translateTarget : 그 값`, 원문 언어 `translateSource`; `runtime.sendMessage({type:"translate", data:{text, sourceLang, targetLang, reverseLang: undefined}})`. 응답이 늦게 와서 요청 timestamp < 블록 timestamp면 폐기, 아니면 `timestamp`·`subText` 갱신.
  - v-for key = `translatedData.sourceText`(항상 undefined — §13).

---

## 9. 플래시카드

### 9.1 덱 메뉴 (`pages/deck/index.vue`, `/deck`)
- `BackHeader title=Flashcard` + 버튼 `mdi-recycle-variant`(`Reset_progress`) → `deck.resetFlashcard()` 후 `$router.go(0)`(리로드).
- 주황 x-large 블록 버튼 `Play_Flashcard` → `checkPlayable()` 통과 시 `/deck/card`.
- 진행 요약: `"{newCardLen} New / {reviewCardLen} Review / {learningCardLen} Learning"` (각각 text-green / text-orange / text-blue).
- `Select_group_to_play` + `ChipOption settingName=cardTagSelected chipData=deck.getAllFilterTag()`(= 그룹마다 `{title:name, value:"wordgroup:"+id}`); 칩 클릭 → `deck.loadDeck()` 재실행 후 진행 갱신.
- `checkPlayable` — 순서대로 첫 실패 시 알림(alert store):
  1. `historyList.length == 0` → `No_History_Data` / `Flashcard_makes_cards_from_your_saved_words`
  2. `cardTagSelected.length == 0` → `No_Group_Selected` / `Check_groups_to_play`
  3. `deck.checkTodayPlayFinish()` → `Today_play_is_completed` / `Try_on_next_day`
  4. `deck.checkNoMoreCardToPlay()` → `No_more_card_to_learn_today` / `Add_more_history_data_to_play_with`

### 9.2 카드 화면 (`pages/deck/card.vue`, `/deck/card`)
- 상단 200px 이미지(`currentImageUrl`, 그라데이션, 자식 `backdrop-filter: blur(3px)`) 위 `<` 뒤로 + 원문 제목(`sourceText` 또는 `No_More_Card_Data`, 흰색, 가운데, `dir=getRtlDir(sourceLang)`).
- 카드 액션 줄: `ChipOption settingName=cardPlayMeta chipData=["source","target","image"]`, 오른쪽 재생 버튼 2개(`mdi-play` 원문 TTS, key "5"; `mdi-play-outline` 번역 TTS, key "6"; title `"key: 5"` 등).
- 진행 바 `v-progress-linear stream color=orange height=12`: value = `getAllProgress()`, buffer = `getNewProgress()`.
- 정답 영역: `dict || targetText`, `white-space: pre-line`, 가운데, `dir=getRtlDir(targetLang)`, 정답 공개 전 `filter: blur(5px)`.
- 하단 `v-bottom-sheet` 안에 진행 요약 + 버튼. **주의**: `v-model`/activator가 없다. 설치된 Vuetify 3.11.5의 `VBottomSheet`는 `VDialog`(→ `VOverlay`, lazy)를 감싸므로 `modelValue`가 falsy면 내용이 **렌더되지 않는다** → 코드상으로는 아래 버튼과 진행 요약이 화면에 보이지 않고 키보드(Space/1–4)로만 조작 가능(§13-23, 실제 브라우저 확인 권장). 의도된 UI는 다음과 같다:
  - 공개 전: 파란 70px 블록 `Show_Answer`(uppercase, title "key: space").
  - 공개 후: 4개(각 cols 3, 70px): Again(red, "1"), Hard(orange, "2"), Good(green, "3"), Easy(cyan, "4"); 버튼 위 줄에 그 선택 시 다음 interval(`nextInterval[key].interval`, 예 "1m", "6m", "4d").
- 키보드(document keydown): `Space` → 공개; `e.key` "5"/"6" → 재생; "1".."4" → 난이도(공개 상태 + 카드 있을 때만).
- `isTargetShow` watcher(null→false 포함 모든 변화): `requestStopTTS()` → 50ms 대기 → `loadImage(sourceText)`(cardPlayMeta에 image 있을 때 `translate` 메시지 engine `googleWebImage`로 `imageUrl` 받음, 없으면 `""`) → 숨김 상태이고 "source" 포함이면 원문 TTS, 공개 상태이고 "target" 포함이면 번역 TTS(`requestTTSSingle`).
- mounted: `waitSettingLoad` → keydown 등록 → `new Deck().loadDeck()` → 진행 갱신 → `loadNextCard()` → `preLoadImage()`(staged 카드마다 700ms 간격으로 이미지 요청해 background 캐시 워밍).
- unmounted: keydown 해제, `requestStopTTS()`.
- `loadNextCard`: `checkTodayPlayFinish()`면 알림 `Finish` / `Today_Flashcards_are_Completed` + currentCard=null; 아니면 `deck.loadNextCard(prevUuid)`, 진행/다음 interval 갱신, `isTargetShow=false`.
- 난이도 처리: `deck.handleDifficulty(card, n-1)` → 진행 갱신 → 다음 카드.

### 9.3 간격 반복 알고리즘 (`src/flashcard/deck.js`, Anki 유사 SM-2 변형)
상수: `dayNewCard=20`, `dayReviewCard=200`, `easeStarting=2.5`, `easeMin=1.3`, `easeModifier=[-0.2,-0.15,0,+0.15]`, `easeMultiplier=[0.8,1.2,1.0,1.3]`, `newLearningSteps=["1m","10m"]`, `reLearningSteps=["10m"]`, `graduateIntervalList=["1d","4d"]`, `minInterval=1`, `cardTypePriority={newCard:1, reviewCard:1, newLearningCard:2, reLearningCard:2}`.

카드 상태 = historyList 레코드에 **직접 기록되는 필드**: `type`(`newCard`|`newLearningCard`|`reLearningCard`|`reviewCard`, 미설정=신규), `isStaged`(오늘 덱에 올라감), `scheduledDate`(`Date.toString()` 자정 기준 문자열), `step`, `interval`(`"<n>m"` 또는 `"<n>d"`), `uuid`, `ease`, `prevInterval`.

- 대상 카드 `getDueDatedTagCards`: `cardTagSelected`에 `"wordgroup:" + (groupId ?? 1)`가 있는 레코드 중 `isDueDate(scheduledDate)`(없으면 due, 아니면 `<= 오늘 0시`), scheduledDate 오름차순.
- `loadDeck()`: **자체 `SettingUtil.loadSetting()` 인스턴스**를 로드 →
  1. `initCardLen`: "새 로드"(= `{date: 오늘0시, tags: cardTagSelected}`가 `deckStatus`의 date/tags와 다름)면 `cardLen` 6개 카운터 0으로.
  2. `unloadPrevLoadCard`: staged 중 newCard 20번째 이후, reviewCard 200번째 이후를 unstage.
  3. `loadNewCard`: 남은 할당 = `max(일일한도 - 현재 staged 수 - 오늘 완료수(newFin/reviewFin), 0)`; unstaged 신규(type 없음/newCard)는 `initCard`(scheduledDate=오늘, type newCard, isStaged, step 0, interval "1m", **새 uuid**), unstaged review는 `isStaged=true`.
  4. `updateDeckCount`: 새 로드면 `deckStatus={date, tags, isFin:false}`, `newStart/reviewStart/learningStart = 현재 staged 수`; 아니면 `newStart = new + newFin`, `reviewStart = review + reviewFin`, `learningStart -= (learningStart+newFin+reviewFin-allFin) - learning`.
  5. `save()`.
- `countRemainCard`: staged 중 type에 "newCard"/"reviewCard"/"LearningCard" 포함 개수.
- 다음 카드 `loadNextCard(prevUuid)`: staged 셔플 후 정렬 — ① 직전 카드는 맨 뒤 ② scheduledDate 오름차순 ③ type 우선순위(신규/복습 먼저) ④ 둘 중 하나가 learning이면 interval 숫자 차이 ⑤ step 차이 → [0].
- 다음 간격 `getAllInterval(card)`:
  - reviewCard → `getLongInterval(ease, interval)`:
    - again: `{interval:"10m", ease:max(ease-0.2,1.3), type:"reLearningCard", prevInterval: interval×0.8, step:0}`
    - hard: `{interval: interval×1.2, ease:max(ease-0.15,1.3), type:"reviewCard"}`
    - good: `{interval: interval×ease, ease, type:"reviewCard"}`
    - easy: `{interval: interval×ease×1.3, ease: ease+0.15, type:"reviewCard"}`
    - `mulInterval`: 숫자×배수 반올림, 최소 1, 단위 유지.
  - newCard/newLearningCard → `getShortInterval(card, ["1m","10m"], ["1d","4d"], 2.5)`:
    - again: `steps[max(0,step-1)]`, step-1 ; hard: `steps[step]` ; good: `steps[step+1]`, step+1 (type → newLearningCard) ; easy: `"4d"`, reviewCard, ease 2.5, step 0.
    - step 0이면 hard = 두 스텝 평균(`"6m"`; 스텝 1개면 ×1.5).
    - 마지막 스텝이면 good = `"1d"`, reviewCard, ease, step 0.
  - reLearningCard → `getShortInterval(card, ["10m"], [good, easy] of getLongInterval(ease, prevInterval), ease)` (§13 버그).
  - 후처리: interval에 `"m"` 포함 → `scheduledDate=오늘`, `isStaged=true`(**분 단위 타이머 없음**, 같은 날 다시 나옴); 아니면 `scheduledDate = 오늘 + parseInt(interval)일`, `isStaged=false`.
- `handleDifficulty(card, idx)`: 해당 uuid 레코드에 interval 결과 필드 덮어쓰기 → `isStaged===false`면 `allFin++`; 이전 type이 newCard면 `newFin++`, reviewCard면 `reviewFin++` → `save()`.
- 진행률: `getAllProgress = allFin / (newStart+reviewStart+learningStart) × 100`; `getNewProgress = (newFin+reviewFin) / (newStart+reviewStart) × 100` (분모 0이면 NaN).
- `checkTodayPlayFinish`: `deckStatus.isFin` 또는 (`allProgress == 100` && `allFin > 0`) → `isFin=true` 저장 후 true.
- `checkNoMoreCardToPlay`: 세 start 카운터가 모두 0.
- `resetFlashcard`: `cardTagSelected=[]`, `deckStatus={}`, 모든 history 레코드 `initCard`(전부 신규·staged·새 uuid), save.
- 하루 경계 = 로컬 자정(`new Date(new Date().toDateString())`). 주석의 "4am 리셋"은 미구현.

### 9.4 공용 `ChipOption` (`components/chipOption.vue`)
- props `settingName`, `chipData`(문자열 또는 `{title, value}`); `v-chip-group multiple column filter`(선택 시 체크 표시)로 `setting[settingName]` 배열을 직접 v-model; 칩 클릭 시 `click` emit(값 갱신 후 처리 보장은 없음 — deck은 이 이벤트로 `loadDeck` 재실행하며 내부에서 storage를 다시 읽음).

### 9.5 `BackHeader` (`components/backHeader.vue`)
- `v-toolbar color=primary dense`: `hideBack`이 아니면 `mdi-chevron-left` 아이콘 → `$router.go(-1)`; 제목(hideBack이면 `ml-4`); spacer; 기본 slot(우측 버튼들).

---

## 10. What's New 처리
- background `addUpdateUrl`: `onInstalled` reason `update`이고 manifest 버전 마지막 패치 번호가 `patch % 10 === 0 && patch >= 250`이면 `tabs.create(runtime.getURL("popup.html?whatsnew=1"))`. (신규 설치는 `addInstallUrl`이 intro 사이트를 엶.)
- 설정 화면 mounted에서 `?whatsnew` 감지 → `v-dialog max-width=600 scrollable`:
  - 제목 "🎉 Mouse Tooltip Translator updated"(하드코딩) + 닫기 X.
  - 본문(max-height 50vh): 로딩 중 "Loading…"; 성공 시 `<pre>`(pre-wrap, 상속 폰트)로 로그; 실패/빈 값이면 "See the full change log on GitHub" 링크(`https://github.com/ttop32/MouseTooltipTranslator/blob/main/doc/description.md#change-log`).
  - 하단: "This extension is free & open-source. Please consider supporting it 💚"(하드코딩) + 갈색 flat 버튼(`mdi-coffee-to-go`, 라벨 `Support_this_extension` || "Buy me a coffee") → buymeacoffee 새 탭.
- 로그 취득: `fetch("https://raw.githubusercontent.com/ttop32/MouseTooltipTranslator/main/doc/description.md")` → `extractChangeLog`: `"# Change Log"` 이후 다음 `\n#\s` 전까지, `"- "`로 시작하는 최상위 줄을 버전으로 세어 **최근 4개 버전**까지, trim.
- 번역: `translateTarget`이 있고 `"en"`이 아니면 `requestTranslate(log, "en", target, target)`; `isBroken`이거나 결과 없으면 원문.
- 다이얼로그가 닫히면(X/바깥 클릭) URL에서 `whatsnew` 파라미터를 `history.replaceState`로 제거(새로고침 시 재표시 방지).

---

## 11. i18n

### 11.1 런타임 (`src/util/i18n.js`)
- `loadUiLanguage(lang)`: `!lang || "auto"` → 커스텀 해제. 아니면 `fetch(runtime.getURL("_locales/<lang>/messages.json"))` → `customMessages`, `customLang`. 실패 시 해제.
- `getMessage(key)`: ① `customMessages[key].message`(truthy) ② `browser.i18n.getMessage(key)`(브라우저 UI 언어 기준; `[a-zA-Z0-9_@]` 외 문자가 들어간 키는 throw → `""`) ③ `""`.
- `t(key)` = `getMessage(key) || key` — 템플릿 `$t`, 그리고 saved/deck 등의 로컬 `t`.
- `getUiLangCode()` = `customLang || i18n.getUILanguage() || navigator.language || "en"`, `_`→`-` (Intl.DisplayNames·localeCompare용).
- 폴백 규칙 정리:
  | 사용처 | 폴백 |
  |---|---|
  | 설정 행 라벨 `description` | **없음**(빈 칸) |
  | 탭 이름 | 없음 |
  | 옵션 라벨 | 키 그대로 |
  | `$t` / 로컬 `t` | 키 그대로 |
  | 일부 하드코딩 폴백 | `getMessage(k) || "Support"`, `"About"`, `"Flashcard"`, `"Default"`, `"Buy me a coffee"` 등 |
- `uiLanguage` 변경 → 400ms 후 `location.reload()`.

### 11.2 로케일 파일 구조
- `public/_locales/<locale>/messages.json`, 56개 디렉터리(en, en_AU, en_GB, en_US … zh_CN, zh_TW). Chrome 표준 포맷 `{ "Key": { "message": "..." } }`(description/placeholders 없음).
- en은 약 235키. 섹션 구분용 더미 키(`MAIN______________________________________` 등, 메시지에 공백 패딩)가 있고 실제 탭 키(`MAIN`, `KEYBOARD`, `GRAPHIC`, `VOICE`, `EXCLUDE`, `ADVANCED`, `SPEECH`, `BACKUP`)와 옵션 라벨 키(`Ctrl_Left`, `On`, `Follow` …), 화면 문구 키가 섞여 있다. 끝에 `appName`, `appDesc`(manifest용).

### 11.3 키 추가 절차 (`doc/insertLocale.py`, CLAUDE.md §2)
1. `i18List`에 영문 문자열 추가(키 = 공백→`_`).
2. `python ./doc/insertLocale.py`: 모든 로케일에 누락/빈 키를 영문으로 채우고, `i18List + [appName, appDesc]` 순서로 재정렬, **목록에 없는 키는 삭제**. 기존 값은 유지. 번역 함수는 호출되지 않음(단 스크립트 상단에서 `googletrans`, `tqdm` import는 함).
3. 번역은 Crowdin. `messages.json` 직접 편집 금지.
- 재작성 시 새 UI 문구가 필요하면 이 절차를 따르고, 기존 키 이름은 **그대로 재사용**(Crowdin 번역 보존).

---

## 12. RTL · 다크 모드 · 팝업 크기
- **UI 전체 RTL 없음**: 아랍어/히브리어 UI를 골라도 레이아웃은 LTR(`<html>` dir 없음, Vuetify `rtl` 미설정). 텍스트 단위 RTL만 존재:
  - 카드 화면 원문/정답 `dir=getRtlDir(sourceLang/targetLang)`.
  - 음성 패널 블록 `dir=getRtlDir(speechRecognitionLanguage / translateTarget)`.
  - `getRtlDir(lang)` = `rtlLangList.includes(lang) ? "rtl" : "ltr"` (lang.js).
- 다크 모드: §1.2 — 부팅 시 OS 설정 1회 반영, 사용자 옵션 없음. 설정 화면 reset 아이콘 배경(`#ffffff11`)·saved 일괄 바(`#00000011`) 같은 하드코딩 반투명 색은 테마와 무관.
- 크기: 툴바 팝업 392×600 고정(뷰포트 ≤400px 미디어쿼리), 탭/옵션 페이지는 최소 380×600, 중앙 최대 800px(saved는 1400px), 본문 스크롤 영역 `100vh - 112px`(툴바+탭) / `100vh - 64px`(헤더만).
- 음성 패널은 별도 창(화면 50%×15%) 전체 높이 사용.

---

## 13. 관찰 (기존 버그 / 데드코드 — 수정하지 않고 기록만)
1. **import 순서와 UI 언어 (이 브랜치 회귀)**: `vite.config.ts`가 `VueRouter({ importMode: "sync" })`로 바뀌었다(삭제된 webpack 설정은 기본값 = async lazy import). sync 모드의 라우트 모듈은 모든 페이지를 정적 `import`하므로, ESM 평가 순서상 `index.vue` 모듈 본문(최상위에서 `i18n.getMessage`로 `tabItems`/`tabs`/`remainSettingDesc`/`toolbarIcons`/옵션 라벨 생성)이 `popup.js` IIFE의 `await loadUiLanguage` **이전에** 실행된다. 결과: `uiLanguage ≠ "auto"`인 사용자는 설정 행 라벨·탭 이름·옵션 라벨·툴바 title이 고른 언어가 아닌 **브라우저 언어**로 표시된다(`auto`면 차이 없음; `data()`/템플릿 `$t`로 계산되는 다른 페이지 문구는 정상). 재작성 요구사항: 라벨은 언어 로드 후 계산.
2. `setting_default.js`는 `_.cloneDeep`을 lodash import 없이 사용 — webpack의 AMD `define`으로 lodash가 전역 `_`를 누출하던 것에 의존. 새 번들러에서는 ReferenceError 위험.
3. `deck.js` reLearningCard: `getLongInterval`의 `good/easy` **객체**가 `gradDays`로 넘어가 `interval`이 객체가 됨 → 후처리 `interval.includes("m")`에서 TypeError. 즉 Again을 눌러 relearning이 된 카드가 다음에 나오면 `getAllInterval` 단계에서 깨짐.
4. `deck.js` `avgInterval`/`getIntervalDiff`가 `interval1[last] == interval1[last]`(자기 자신 비교)로 단위 비교를 하지 않음 → m/d 섞여도 숫자만 비교.
5. 진행률 분모 0이면 NaN(progress bar에 NaN).
6. `Deck`은 Pinia와 **별개의 Setting 인스턴스**를 저장하고, `card.vue recordPlayFinish`(미호출)는 스토어 인스턴스에 씀 — 두 인스턴스가 각각 전체 객체를 save해 historyList 경합 가능.
7. `popupWindow`가 페이지마다 `loadSetting` → 새 인스턴스 + `storage.onChanged` 리스너 누적(리스너 해제 없음), 마운트마다 전체 save 1회. onChanged가 raw 객체에 써서 외부 변경이 반응형으로 반영되지 않음.
8. `SettingUtil.resetSetting`: clear 전에 로드한 인스턴스를 clear 후 save → 이전 값이 다시 기록되어 **리셋이 실질적으로 안 될 수 있음**(onChanged 타이밍에 따라 달라짐; 실제 브라우저 검증 필요). 확인 대화상자도 없음.
9. 내보내기 JSON에 `llmApiKey`, 전체 historyList 포함. 가져오기는 검증 없는 merge(기존 키 삭제 안 함).
10. "현재 사이트 차단/허용" 버튼은 옵션 페이지(새 탭)에서 열면 활성 탭이 확장 페이지 자신이라 확장 id hostname이 추가됨.
11. `history.vue`: 진입점 없음, `v-virtual-scroll` 직속 `<template v-slot:append>`가 미정의 `index` 참조, 제목/버튼/라벨 하드코딩, `historyRecordActions` 칩은 saved.vue 마이그레이션이 비워 버림.
12. `alert.js` state에 `setting:"title"`(title 미선언), `alertPopup`이 액션 `hidePopup`을 `mapState`로 가져옴. "close" 하드코딩.
13. `commentBanner`의 review 메시지/`getReviewUrl` 미사용, "Open" 하드코딩, `coffeeCount`가 문자열→숫자로 타입 변경.
14. 하드코딩 영문: What's New 다이얼로그 문구, LLM 에러 snackbar, "Fetch models from endpoint", speech 마이크 alert, history 페이지 문구, about 헤더 제목.
15. 미사용: `popupCount`, `tooltipIntervalTimeList`, `voiceRateListWithDefault`, index.vue `currentPage`/`open`/`isProxy`·`_` import, deck/index `progressKey`/`cardLenList`, card.vue `handleFinish`/`recordPlayFinish`/`gotoDeckPage`/`sourceText`/`targetText`/`intervalTimeList`, deck.js `checkPlayProgress`/`getCheckNextInterval`/`getAllCard`, `SettingUtil.getSpeechTTSVoiceList`, 라우터 주석 블록, index.vue 주석 v-fab.
16. `speech.vue` v-for `:key="translatedData.sourceText"` — 해당 필드가 없어 모든 key가 undefined.
17. `getRtlDir(speechRecognitionLanguage)`는 `"ar-AE"` 같은 지역 태그라 rtlLangList(`"ar"`)와 매칭되지 않아 항상 ltr. (rtlLangList 자체에도 ml/kk/ky/az 등 비-RTL 언어 포함 — lang.js 영역.)
18. `localLlm.getModels`는 `Authorization: Bearer`만 보냄 — Claude(`x-api-key` 필요) 등은 모델 목록 실패 가능.
19. en 로케일에 없는 `i18nKey` 15개(전부 REMAINS 탭이라 화면 영향 없음): `Card_Length`, `Card_Play_Meta`, `Card_Tag_Selected`, `Coffee_Count`, `Deck_Status`, `History_List`, `History_Record_Actions`, `Ignore_Callback_Option_List`, `LLM_Provider_Settings`, `Language_Priority`, `Last_Setting_Tab`, `Popup_Count`, `Save_Context_Menu`, `Subtitle_Button_Toggle`, `Word_Groups`.
20. `insertLocale.py`는 번역을 안 쓰면서도 상단에서 `googletrans`/`tqdm`를 import(미설치 시 실행 불가).
21. `convertOptionI18n`이 `settingDict`를 in-place 변경 — saved.vue는 `settingDict.keySecondaryLang.optionList`를 읽으므로 index.vue 모듈 평가 여부에 따라 라벨이 현지화/원문으로 달라짐.
22. Setting 콜백 `updateCallbackFn`이 모듈 전역이라 한 컨텍스트에서 마지막 `loadSetting` 콜백만 유효.
23. `card.vue`의 `<v-bottom-sheet>`에 `v-model`/activator가 없어(Vuetify 3.11.5에서 VDialog 기반 lazy overlay) Show Answer·Again/Hard/Good/Easy 버튼과 하단 진행 요약이 렌더되지 않는 것으로 판단됨 — 마우스 사용자는 카드를 진행할 수 없고 키보드만 동작. HEAD와 이 브랜치 모두 `vuetify ^3.11.5`라 브랜치 차이는 아님. 재작성 시 버튼을 **항상 보이게** 할지(의도된 UI) 결정할 것.

---

## 14. 재작성 체크리스트 (Svelte 5, UI 프레임워크 없음)

**부팅 / 셸**
- [ ] `popup.html`/`popup.css`/`popup.js` 파일명 유지(manifest·background·about이 하드코딩).
- [ ] `loadSetting` → `loadUiLanguage(uiLanguage)` await **후** 라벨 계산·마운트(§13-1 회피).
- [ ] `prefers-color-scheme` 1회 판독으로 light/dark CSS 변수 세트 적용, primary `#2196F3`/`#0D47A1`, secondary `#424242`.
- [ ] Roboto + MDI 아이콘 폰트(또는 동일 아이콘 SVG) — 아이콘 목록: chevron-left, coffee-to-go, bookmark-multiple, menu, restore, refresh, web-cancel, web-check, file-upload, content-save, close, tag-multiple, trash-can, upload, download, plus, arrow-up/down, help-box, file-pdf-box, book-open-blank-variant, microphone-message, message-draw, github, shield-account, card-multiple, recycle-variant, play, play-outline, close-circle.
- [ ] 해시 라우터: `/`, `/about`, `/saved`, `/deck`, `/deck/card`, `/speech`, `/history`; back = `history.back()`; 라우트 전환 페이드.
- [ ] 크기 미디어쿼리(392×600 / 380×600 + 800px 중앙 / saved 1400px).
- [ ] 전역 알림 카드(alert store 대체) — title/description/close.

**설정 데이터**
- [ ] `Setting`/`SettingUtil`/`setting_default.js`는 그대로 재사용(UI 비의존). 스토어는 Svelte `$state`로 감싸되 **모든 변경 → 전체 `save()`** 자동 저장 유지.
- [ ] 외부 storage 변경 반영 여부를 결정(현재는 미반영; 반영하도록 개선해도 기능 손실 없음 — 단 의도적으로 결정할 것).
- [ ] 페이지마다 재로드/리스너 누적은 재현하지 말고 단일 인스턴스로(동작 동일성 확인).
- [ ] `ttsVoice_*`, `ttsRate_*` 동적 키 보존(`storage.local.get(null)` 경로).
- [ ] 문자열 토글 `"true"/"false"`, `"null"` 문자열, `saveContextMenu` boolean 등 **값 타입 그대로**.

**설정 화면**
- [ ] 탭 순서 MAIN→KEYBOARD→VOICE→GRAPHIC→EXCLUDE→ADVANCED→SPEECH→BACKUP, 행 순서 = settingDict 선언 순서, REMAINS 미표시.
- [ ] 탭 바 가로 스크롤 + 휠 스크롤 + 오버플로 화살표, 마지막 탭 기억(`lastSettingTab`).
- [ ] 렌더러 8종(select/multipleSelect/fontSelect/comboBox/colorPicker/textField/llmModelSelect/button) — 특히 comboBox의 자유입력 chips, fontSelect 미리보기, colorPicker의 `#`+8hex 마스크와 HEXA 피커.
- [ ] `visibleWhen`/`readonlyWhen`, 수정됨 왼쪽 바, 개별 리셋 아이콘, compact 모드.
- [ ] 옵션 라벨 현지화 규칙(일반 = 메시지||키, 언어 = Intl.DisplayNames + UI 언어 정렬, specials 상단) + `langPriority` 정렬/증가 규칙.
- [ ] VOICE 동적 행(보이스 + 속도, langPriority 정렬, `ttsRate` "default" 초기화).
- [ ] 폰트 목록(기본 + generic + 하드코딩 목록 + `chrome.fontSettings`).
- [ ] LLM 프로바이더 프리셋 저장/복원, 모델 fetch + 에러 snackbar 4s.
- [ ] uiLanguage 변경 시 400ms 후 리로드.
- [ ] 버튼: 사이트 차단/허용, import(.json → background), export(다운로드 파일명), reset(background).
- [ ] 후원 배너 카운터 로직(+1/오픈, <10 노출, 클릭 +10, 최대 11).
- [ ] What's New 다이얼로그(4개 버전 추출, 번역, 닫으면 파라미터 제거).

**저장 단어 / 히스토리**
- [ ] saved: 마이그레이션 3종, 그룹 필터, 카운트 `/ 10,000`, 컨텍스트 메뉴 스위치, 정렬 가능한 고정 레이아웃 테이블, 페이지당 행 수 계산, 페이지 전체선택(indeterminate), 일괄 이동/삭제/해제, 그룹 다이얼로그(닫을 때 일괄 커밋, 그룹1 삭제 불가, 새 그룹 기본값), CSV import/export 포맷·파일명·BOM.
- [ ] history 페이지(진입점은 없지만 라우트 유지 여부 결정).

**음성 패널**
- [ ] 셸 없이 전체 화면, column-reverse 자동 하단 고정, 설정 기반 인라인 스타일, 1400ms 번역 스로틀, 늦은 응답 폐기, 설정 변경 시 stop→자동 재시작, 마이크 권한 처리.

**플래시카드**
- [ ] `deck.js` 그대로 재사용(Vue `toRaw` import만 제거/대체 필요). 덱 메뉴 4단계 검사 알림, 그룹 칩, Reset(리로드).
- [ ] 카드 화면: 이미지 헤더, 블러 정답, 진행 바(value/buffer), Show Answer / 4버튼 + 다음 간격 표시, 키보드(Space, 1–4, 5, 6), 공개 상태 변화 시 TTS 정지→50ms→이미지→자동재생, 700ms 이미지 프리로드, 언마운트 시 TTS 정지·리스너 해제, `dir` RTL.

**i18n**
- [ ] `i18n.js` 재사용, `$t` 대체 헬퍼 = `t`(키 폴백), 설정 라벨은 `getMessage`(폴백 없음) 규칙 유지.
- [ ] 새 문구는 `insertLocale.py` 절차로만 추가, 기존 키 이름 재사용.

**검증**
- [ ] `npm run build` 통과, 실제 브라우저에서 툴바 팝업 / 옵션 탭 / saved 새 탭 / speech 패널 / whatsnew 파라미터 각각 확인.
- [ ] §13 항목 중 재현할 것과 고칠 것을 명시적으로 결정(특히 1, 3, 7, 8, 23).

