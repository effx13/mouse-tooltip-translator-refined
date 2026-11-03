# CLAUDE.md — MouseTooltipTranslator 개발 가이드

브라우저 확장(Chrome/Edge MV3, Firefox MV2). 마우스오버/드래그 번역 툴팁, 입력창 번역, 페이지 번역, 내장 PDF/EPUB 뷰어를 제공한다. **WXT + Svelte 5 + TypeScript**, 패키지 매니저는 **pnpm**이다.

## 빌드 · 실행

```bash
pnpm install          # postinstall이 `wxt prepare`(.wxt/ 타입 생성)
pnpm dev              # 개발 모드(브라우저 자동 실행 + 리로드)
pnpm build            # → .output/chrome-mv3/   (console 제거)
pnpm build:firefox    # → .output/firefox-mv2/
pnpm zip | pnpm zip:firefox   # → .output/*-chrome.zip, *-firefox.zip, *-sources.zip
pnpm test             # vitest
pnpm lint             # oxlint
pnpm format           # oxfmt
pnpm typecheck        # svelte-check (TS 포함)
```

- 확장 로드는 **빌드 결과 폴더**(`.output/chrome-mv3`, `.output/firefox-mv2`)를 "Load unpacked"로 한다.
- 코드 변경 후 `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`가 통과하는지 확인한다.
- 버전은 배포 시점에 release 워크플로가 `package.json`에 태그 버전을 기록한다. repo 값은 stale하니 직접 올리지 말 것(#209).

## 저장소 구조

- `wxt.config.ts`: 매니페스트(브라우저별 분기), 빌드 설정. `public/manifest*.json`은 없다.
- `src/entrypoints/`: WXT 진입점. 파일명이 출력명이다.
  - `background.ts` → `src/background/`
  - `content/index.ts` → `src/content/` (`content-scripts/content.js`)
  - `popup/`: Svelte 설정 화면. 툴바 팝업 겸 options 페이지(`popup.html`, `#/about`)
  - `pdf/`: PDF 뷰어(`pdf.html`, `pdfjs-dist`). 웹 PDF 가로채기와 로컬 PDF 리다이렉트가 `pdf.html?file=`로 연다.
  - `reader/`: EPUB/MOBI/FB2/CBZ 리더(`reader.html`, `foliate-js`)
  - `googleDocInject.ts`: content script가 `injectScript`로 page world에 주입하는 unlisted 스크립트
  - 출력명(`pdf.html`, `reader.html`, `googleDocInject.js`)은 content script가 경로로 판별하거나 `getURL()`로 참조하니 바꾸지 말 것.
- `src/background/`: 번역 요청 처리, 복사(컨텍스트 메뉴/단축키), 옴니박스, 설치 처리, PDF 리다이렉트.
- `src/content/`: 툴팁(Shadow DOM), 텍스트 감지(`detect/`), 키 처리, 입력창/페이지 번역, 사이트 필터, Google Docs, 웹 PDF 가로채기.
- `src/translators/`: 번역 엔진(`engine.ts`의 `defineEngine`), `registry.ts`, `index.ts`의 `translate()`(캐시, 역번역, 사전, 폴백 엔진과 언어쌍별 쿨다운 #363). background에서만 실행된다(DOM 없음).
- `src/viewers/`: PDF 뷰어 로직(`pdf/`: pdf.js 설정, 우클릭 드래그 이동, 줄바꿈 보정), 이북 iframe → content script 이벤트 브리지(`ebook.ts`).
- `modules/pdfjs-assets.ts`: 로컬 WXT 모듈. pdf.js worker·cmaps·폰트·wasm을 빌드 결과 `pdfjs/`로 복사한다.
- `src/components/`: 공용 Svelte 컴포넌트.
- `src/utils/`: `settings/`(스키마 + 저장소), `messaging.ts`, `i18n.ts`, `lang.ts`, `text.ts`, `async.ts`.
- `public/`: `_locales`만 있다. 서드파티 코드는 저장소에 복사하지 않고 npm 패키지로 쓴다.
- `src/assets/icon.svg`: 확장 아이콘 원본. `@wxt-dev/auto-icons`가 빌드 때 `icons/<size>.png`를 만든다.
- `doc/`: `intro.md`(설치 시 열리는 사용법), `privacy_policy.md`, `insertLocale.py`(로케일 생성, 확장 이름/설명 `appName`/`appDesc` 포함).

## 관례

### 코드 스타일
- 파일 상단이나 import 위에 주석을 쓰지 않는다. 주석은 꼭 필요한 곳에만, 해당 코드 바로 위에 짧은 `//`로 쓴다. 한 줄짜리 `/** */`와 `// ----` 같은 구분선은 쓰지 않는다.
- 최신 문법만 쓴다. Svelte 5 rune(`$state`, `$derived`, `$effect`, `$props`), snippet과 `{@render}`, `onclick=` 속성, 콜백 prop을 쓰고, 최신 TS/ES를 쓴다. `var`, jQuery, lodash, 폴리필은 쓰지 않는다.
- `browser`는 `wxt/browser`에서, 스토리지는 `wxt/utils/storage`에서 가져온다. import는 `@/` 별칭(= `src/`)을 쓴다. WXT auto-import는 꺼져 있으니(`imports: false`) 명시적으로 import한다.
- lint 경고는 규칙을 끄지 말고 코드를 고친다.
- WXT는 빌드 중 진입점 파일을 Node에서 import해 옵션을 읽는다. 진입점 최상위에서 런타임 코드를 실행하지 말고 `main()` 안에 둔다.

### 설정
- `src/utils/settings/schema.ts`의 `settingSchema`에 항목을 추가하면 설정 화면이 자동으로 렌더한다.
  - `optionType`: `select`(기본), `toggle`, `multipleSelect`, `comboBox`, `fontSelect`, `colorPicker`, `textField`, `llmModelSelect`, `button`, `hidden`
  - `settingTab`, `visibleWhen`, 선언 순서가 화면 배치를 정한다.
- 값은 타입이 있다. 토글은 boolean, 크기·시간은 number, 키와 언어는 문자열(`"null"` = 없음)이다.
- 저장은 `local:settings` 하나에 바뀐 값만 넣고, 읽을 때 기본값과 합친다. 쓰는 API는 `getSettings`, `updateSettings`, `watchSettings`, `resetSettings`, `importSettings`, `exportSettings`다.
- `syncSetting`이 켜지면 `sync:settings`로 미러한다. LLM 키는 동기화하지 않는다.
- content script는 설정을 읽기만 한다. 사이트별 대상 언어(#262)는 그 자리에서 유효 설정으로 계산한다.

### 메시징
- `src/utils/messaging.ts`의 ProtocolMap(`@webext-core/messaging`)만 쓴다. 메시지는 `translate`, `tooltipShown`, `copyText` 세 가지다. 새 메시지가 필요하면 여기에 타입을 추가한다.
- 설정 리셋/가져오기/내보내기는 popup이 스토리지에 직접 하므로 메시지가 필요 없다.

### content script
- 툴팁은 `createShadowRootUi`로 만든 Shadow Root 안에 있다. host는 `<html>`에 붙인다.
  - CSS는 `src/content/tooltip.css?inline`을 `css` 옵션으로 넘긴다(`cssInjectionMode: "manual"`). 그래야 뷰어 페이지에서도 같은 방식으로 동작한다.
  - 페이지에 전역 CSS를 넣지 않는다. 마우스오버 하이라이트는 `CSS.highlights`를 쓴다.
- 리스너와 타이머는 `ctx`(ContentScriptContext)에 묶어서, 확장이 갱신되면 정리되게 한다.
- 뷰어 페이지(`pdf.html`, `reader.html`)는 확장 페이지라 content script가 안 붙는다. 그래서 각 페이지의 `main.ts`가 `startContentScript(new ContentScriptContext("viewer"))`를 직접 호출한다.
- 무거운 모듈을 content script에 import하지 않는다. 모든 페이지의 모든 프레임에 실린다.

### UI 텍스트 / 로케일 키 (직접 편집 금지)
`public/_locales/*/messages.json`을 손으로 고치지 말 것.
1. `doc/insertLocale.py`의 `i18List`에 영문 문자열을 추가한다. 키는 공백을 `_`로 바꾼 것이다(`"Website Target Language"` → `Website_Target_Language`).
2. `python ./doc/insertLocale.py`를 실행한다.
   - 모든 로케일에 누락 키를 영문 placeholder로 채우고, `i18List` 순서로 재정렬한다.
   - `i18List`에 없는 키는 제거한다.
코드에서는 `getMessage(key)`(폴백 없음) 또는 `t(key)`(키 폴백)를 쓴다(`@/utils/i18n`). 사용자가 고른 UI 언어(`uiLanguage`, #76)를 따른다.

## Gotchas
- 빌드·lint·타입·테스트가 통과하는 단위마다 커밋한다. 푸시는 요청할 때만 한다.
- 툴팁, 키 처리, 뷰어, Google Docs 같은 브라우저 동작은 헤드리스로 확인할 수 없다. 실제 브라우저 확인을 요청한다.
- 번역 엔진 대부분은 소비자용 엔드포인트를 스크래핑하므로, 데이터센터 IP에서는 쉽게 막힌다. 네트워크 테스트는 CI에서 skip한다.
- Windows 셸에서는 heredoc이 백슬래시를 뭉갤 수 있으니, 정규식 등은 파일로 작성한 뒤 실행한다.
