# CLAUDE.md — Mouse Tooltip Translator Refined 개발 가이드

브라우저 확장(Chrome/Edge MV3, Firefox MV2). 마우스오버/드래그 번역 툴팁, 입력창 번역, 페이지 번역, 내장 PDF/EPUB 뷰어를 제공한다. **WXT + Svelte 5 + TypeScript**, 패키지 매니저는 **pnpm**이다.

## 빌드 · 실행

```bash
pnpm install          # postinstall이 `wxt prepare`(.wxt/ 타입 생성)
pnpm dev              # 개발 모드(브라우저 자동 실행 + 리로드)
pnpm build            # → .output/chrome-mv3/   (console 제거)
pnpm build:firefox    # → .output/firefox-mv2/
pnpm zip | pnpm zip:firefox   # → .output/*-chrome.zip, *-firefox.zip, *-sources.zip
pnpm test             # vitest (src/**/*.test.ts)
pnpm test:e2e         # wxt build + Playwright (e2e/*.spec.ts, headless Chromium)
pnpm screenshots      # wxt build + docs/screenshots/*.png (README용)
pnpm lint             # oxlint
pnpm format           # oxfmt
pnpm typecheck        # svelte-check (TS 포함)
```

- 확장 로드는 **빌드 결과 폴더**(`.output/chrome-mv3`, `.output/firefox-mv2`)를 "Load unpacked"로 한다.
- 코드 변경 후 `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`가 통과하는지 확인한다.
- 처음 한 번 `pnpm exec playwright install chromium`이 필요하다.
- 버전은 배포 시점에 release 워크플로가 `package.json`에 태그 버전을 기록한다. repo 값은 stale하니 직접 올리지 말 것(#209).

## 저장소 구조

- `wxt.config.ts`: 매니페스트(브라우저별 분기), 빌드 설정. `public/manifest*.json`은 없다.
- `src/entrypoints/`: WXT 진입점. 파일명(폴더면 폴더명)이 출력명이다. 페이지 전용 모듈은 해당 진입점 폴더에 둔다.
  - `background/`: `index.ts`가 진입점(`defineBackground`)이다. 번역 메시지를 받고, 나머지 모듈의 리스너를 `main()`에서 등록한다. `copy.ts`(컨텍스트 메뉴/단축키 복사), `install.ts`(설치 처리, 열린 탭 주입), `omnibox.ts`, `pdfRedirect.ts`(로컬 PDF·Firefox 웹 PDF 리다이렉트), `settings.ts`(설정 캐시, `main()` 첫 줄의 `trackSettings()`로 시작)
  - `content/index.ts` → `src/content/` (`content-scripts/content.js`)
  - `popup/`: Svelte 설정 화면. 툴바 팝업 겸 options 페이지(`popup.html`, `#/about`). `state.svelte.ts`(설정 store), `options.ts`(옵션 목록 현지화), `actions.ts`(버튼 동작)
  - `pdf/`: PDF 뷰어(`pdf.html`, `pdfjs-dist`). 웹 PDF 가로채기와 로컬 PDF 리다이렉트가 `pdf.html?file=`로 연다. `controller.svelte.ts`(pdf.js 뷰어 상태), `pdfjs.ts`(pdf.js 설정), `source.ts`(파일 파라미터·로컬 파일 권한), `rightPan.ts`(우클릭 드래그 이동), `textSpacing.ts`(줄바꿈 보정)
  - `reader/`: EPUB/MOBI/FB2/CBZ 리더(`reader.html`, `foliate-js`). `bridge.ts`는 이북 iframe 이벤트를 content script로 넘기고, `theme.ts`는 책 본문 CSS다.
  - `googleDocInject.ts`: content script가 `injectScript`로 page world에 주입하는 unlisted 스크립트
  - 출력명(`pdf.html`, `reader.html`, `googleDocInject.js`)은 content script가 경로로 판별하거나 `getURL()`로 참조하니 바꾸지 말 것.
  - 진입점 폴더의 하위 모듈 이름을 `index.ts`로 짓지 않는다. WXT가 `entrypoints/*/index.*`를 진입점으로 읽는다. `entrypoints/` 바로 아래에 새 `.ts`를 두어도 unlisted 스크립트가 된다.
- `src/content/`: 툴팁(Shadow DOM), 텍스트 감지(`detect/`), 키 처리, 입력창/페이지 번역, 사이트 필터, Google Docs, 웹 PDF 가로채기. 뷰어 페이지도 `startContentScript`/`watchSelection`을 가져다 쓴다.
- `src/translators/`: 번역 엔진(`engine.ts`의 `defineEngine`), `registry.ts`, `parse.ts`(`matchOrThrow`/`required`: 응답 형식이 바뀌면 throw해서 실패로 처리), `index.ts`의 `translate()`(캐시, 역번역, 사전, 폴백 엔진과 언어쌍별 쿨다운 #363). background에서만 실행된다(DOM 없음).
- `modules/pdfjs-assets.ts`: 로컬 WXT 모듈. pdf.js worker·cmaps·폰트·wasm을 빌드 결과 `pdfjs/`로 복사한다.
- `src/components/`: 공용 Svelte 컴포넌트. `ui/`는 shadcn-svelte가 생성한 파일이다.
- `src/utils/`: `settings/`(스키마 + 저장소), `messaging.ts`, `i18n.ts`, `lang.ts`, `text.ts`, `async.ts`, `page.ts`(확장 페이지 공통 부팅 `bootPage`), `colorScheme.svelte.ts`, `pdfViewer.ts`(`pdf.html?file=` URL), `download.ts`, `cn.ts`(shadcn 별칭).
- `src/assets/app.css`: Tailwind 진입점. `@source`가 `components/`와 `entrypoints/**/*.svelte`만 스캔하니, Tailwind 클래스를 다른 곳(TS 파일 등)에 쓰면 `@source`를 추가해야 한다.
- `public/`: `_locales`만 있다. 서드파티 코드는 저장소에 복사하지 않고 npm 패키지로 쓴다.
- `src/assets/icon.svg`: 확장 아이콘 원본. `@wxt-dev/auto-icons`가 빌드 때 `icons/<size>.png`를 만든다.
- `doc/`: `intro.md`(설치 시 열리는 사용법), `privacy_policy.md`, `insertLocale.py`(로케일 생성, 확장 이름/설명 `appName`/`appDesc` 포함).

## 테스트
- 단위 테스트는 대상 파일 옆에 `src/**/*.test.ts`로 둔다(vitest `include`가 이 패턴만 읽는다). 확장 API는 `wxt/testing/fake-browser`의 `fakeBrowser`로 대신하고, 번역 엔진은 `vi.mock("@/translators/registry")`로 막는다.
- 실제 엔진에 요청하는 네트워크 테스트(`src/translators/translator.test.ts`)는 `CI`에서 skip한다.
- e2e는 WXT 공식 예제(wxt-dev/examples `playwright-e2e-testing`) 구조를 따른다. `e2e/fixtures.ts`가 `context`(빌드 결과 `.output/chrome-mv3`를 올린 persistent context)와 `extensionId`를 주고, `e2e/pages/`는 페이지 헬퍼, `e2e/support/`는 실행 헬퍼다. 빌드가 최신이어야 한다.
  - 번역은 `e2e/support/server.ts`의 가짜 OpenAI 호환 서버(`/v1/chat/completions`)로 오프라인·결정적으로 한다. `useOfflineSettings()`가 `localLlm` 설정을 `chrome.storage.local`의 `settings` 키에 쓴다.
  - 브라우저는 `--host-resolver-rules`로 127.0.0.1 외에는 막혀 있다. `channel: "chromium"`의 새 headless가 확장을 올리므로 xvfb가 필요 없다. 창을 보려면 `pnpm exec playwright test --headed`.
- `scripts/screenshots.ts`는 테스트가 아니라 README용 캡처다. `e2e/support/`를 공유하므로, 그 파일들은 `@/` 별칭 없이 `.ts` 확장자를 붙인 상대 경로로 import한다(Node가 바로 실행한다).

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
- 툴팁, 선택 번역, 입력창 번역, 뷰어는 e2e로 확인한다. Google Docs, 키 조합(AltGr 등), 시각적 품질은 여전히 실제 브라우저 확인을 요청한다.
- 번역 엔진 대부분은 소비자용 엔드포인트를 스크래핑하므로, 데이터센터 IP에서는 쉽게 막힌다. 네트워크 테스트는 CI에서 skip한다.
- Windows 셸에서는 heredoc이 백슬래시를 뭉갤 수 있으니, 정규식 등은 파일로 작성한 뒤 실행한다.
