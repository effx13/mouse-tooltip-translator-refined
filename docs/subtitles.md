# 이중 자막 (Dual Subtitles) — 현재 동작 명세 / 재작성 회귀 체크리스트

> 대상: `src/subtitle/*` (`subtitle.js`, `baseVideo.js`, `youtube.js`, `youtube-nocookie.js`, `netflix.js`, `svt.js`), `src/contentScript.js`의 자막 관련 부분, `src/util/setting_default.js`의 자막 관련 키.
> 목적: TypeScript 재작성(jQuery 제거, polyfill 제거, memoizee/lodash 대체, `@mswjs/interceptors` 업그레이드 가능성)에서 **동작을 그대로 유지**하기 위한 기준 문서.
> 표기: **[확인]** = 코드(또는 `node_modules` 라이브러리 소스)에서 직접 확인. **[추론]** = 코드 흐름으로 추정했고 실제 브라우저 검증이 필요함.
> 기준 트리: 현재 워킹 트리 그대로 (`netflix.js`의 `/^tb/.test` → `startsWith('tb')`, `youtube-nocookie.js` 정규식의 불필요한 `\-` 이스케이프 제거 같은 커밋 안 된 표면 diff가 있지만 동작에는 영향 없음).
> 라이브러리 버전(현재 lock 기준): `@mswjs/interceptors@0.26.8`, `memoizee@0.4.15`, `throttle-debounce@5`, `async-wait-until@2.0.12`, `webextension-polyfill@0.10`.

---

## 0. 한눈에 보기

| 사이트 | 클래스 | 방식 | 실행 컨텍스트 | 번역 출처 |
|---|---|---|---|---|
| YouTube (`www.youtube.com`) | `Youtube` | 자막 요청 인터셉트(json3) + 재요청 + 병합 | **페이지 컨텍스트**(주입 `subtitle.js`) | YouTube 자체 자막(수동 트랙 또는 `tlang` 기계번역) |
| youtube-nocookie (`www.youtube-nocookie.com`) | `YoutubeNoCookie extends Youtube` | YouTube와 같음(도메인만 다름) | 페이지 컨텍스트 (iframe 임베드) | 위와 같음 |
| Netflix (`www.netflix.com`) | `Netflix` | 자막 요청 인터셉트(TTML XML) + 플레이어 트랙 전환으로 번역 트랙 확보 + 병합 | 페이지 컨텍스트 | Netflix가 제공하는 해당 언어 자막 트랙 |
| SVT Play (`www.svtplay.se`) | `SVT` | DOM 관찰(MutationObserver) + 오버레이 + 확장 번역기 호출 | **콘텐츠 스크립트** (주입 없음) | 확장 번역 엔진(`translateCaller.translate`) |

YouTube/Netflix 이중 자막은 확장의 번역 엔진(`translatorVendor`)을 **쓰지 않는다**. 플랫폼이 제공하는 다른 언어 트랙을 받아 붙인다. SVT만 확장 번역기를 쓴다. [확인]

---

## 1. 주입 모델 (콘텐츠 스크립트 ↔ 페이지 컨텍스트)

### 1.1 진입점
- `src/subtitle/subtitle.js`는 `{ Youtube, Netflix, YoutubeNoCookie, SVT }`를 default export한다(이 순서). [확인]
- **같은 모듈이 두 번 번들된다**:
  1. `contentScript.js`가 `import subtitle from "/src/subtitle/subtitle.js"` 해서 콘텐츠 스크립트(isolated world) 안에 포함.
  2. 빌드 엔트리 `subtitle: "subtitle/subtitle"` (`vite.config.ts`의 `ENTRIES`, 예전 webpack은 `src/**/*.js` 전부를 엔트리로) → `build/subtitle.js` (IIFE). 이것을 `<script src>`로 페이지에 주입해서 **페이지 main world**에서 실행. [확인]
- `subtitle.js`는 `web_accessible_resources`에 있어야 한다 (`public/manifest.json`, `public/manifest.firefox.json` 둘 다 있음). [확인]
- 콘텐츠 스크립트는 `all_frames: true`, `match_about_blank: true`, `<all_urls>`라서 youtube-nocookie 임베드 iframe 안에서도 돈다. [확인]

### 1.2 콘텐츠 스크립트 쪽 흐름
- `initMouseTooltipTranslator()` → `getSetting()` → (exclude URL이면 중단) → `waitJquery` → `detectPDF()`가 true면 중단 → **`checkVideo()`**. [확인]
- `checkVideo()`: `for (key in subtitle) subtitle[key].handleVideo(setting)` — 네 클래스 모두에 대해 호출, 각자 `sitePattern`으로 걸러낸다. await 안 함. [확인]
- **설정이 바뀔 때마다(아무 키나)** `settingCallbackFn` → `applyStyleSetting()` + `checkVideo()`가 다시 실행된다. [확인] → 결과적으로 `resetInjectScript`(설정 재전송) + `handleUrlChange`(YouTube/Netflix는 `activateCaption` 재실행)가 매번 돈다.

`BaseVideo.handleVideo(setting)` [확인]:
1. `!isVideoSite()` 이거나 `setting.detectSubtitle == "null"`이면 return (아무것도 안 함).
2. `initVariable(setting)` → `this.setting = setting` (콘텐츠 쪽은 `Setting` 인스턴스, `save()` 있음).
3. `await initInjectScript(setting)`:
   - `checkIsInjectedScript()`가 true(=페이지 컨텍스트)면 return.
   - `await injectScript()` → `resetInjectScript(setting)` (postMessage로 설정 전송).
4. `await loadEventListener()` — 최초 1회만(`isEventListenerLoaded`): `listenUrl()`, `listenPlayer()`.
5. `handleUrlChange()` — 기본 구현은 `pausedByExtension=false`. YouTube/Netflix는 오버라이드해서 페이지에 `activateCaption(url)` 호출 메시지를 보낸다.

`injectScript(scriptUrl = "subtitle.js")` [확인]:
- `url = browser.runtime.getURL(scriptUrl)`; `id = filterSpecialText(url)` = URL에서 **영문자와 공백만 남긴 문자열**(예: `chrome-extension://abcd/subtitle.js` → `chromeextensionabcdsubtitlejs`).
- `#id` 요소가 이미 있으면 즉시 resolve(중복 주입 방지). 없으면 `<script id=...>`를 `head`에 append한 **뒤** `src`를 설정, `load` 이벤트에서 resolve.
- `error`는 처리하지 않음 → 로드 실패 시 promise가 영원히 pending → `handleVideo`가 거기서 멈추고 `loadEventListener`/`handleUrlChange`도 안 됨. (관찰)

### 1.3 컨텍스트 판별 — polyfill 의존 (재작성 시 핵심 주의)
```js
var browser;
try { browser = require("webextension-polyfill"); } catch (error) {}
static checkIsInjectedScript() { return browser?.runtime?.id == null; }
```
- 번들러가 polyfill을 인라인한다(현재 vite 빌드 결과물 `build/subtitle.js`에서 `if(!globalThis.chrome?.runtime?.id)throw Error("This script should only be loaded in a browser extension.")` 확인). 페이지 컨텍스트에선 `chrome.runtime.id`가 없어서 polyfill이 **throw** → catch → `browser === undefined` → `checkIsInjectedScript()` = true. 콘텐츠 스크립트에선 `browser.runtime.id`가 있어서 false. [확인]
- 즉 **이 try/catch가 곧 "나는 페이지에 주입된 쪽인가"를 판별하는 장치**다. polyfill을 없애면 판별을 따로 구현해야 한다(예: `globalThis.chrome?.runtime?.id == null` / Firefox `browser?.runtime?.id`). 안 그러면 모델이 뒤집혀서 콘텐츠 스크립트가 페이지용 리스너를 등록하고 주입은 안 한다.
- 페이지 컨텍스트에서 `browser`/`chrome.runtime`/`storage`를 쓸 수 없는 이유: main world는 확장 API가 노출되지 않는 일반 페이지 JS 환경이다. 그래서 설정은 메시지로 받아야 하고 `setting.save()`도 못 쓴다.
- 반대로 플레이어 API(`.html5-video-player`의 `setOption/loadModule`, `window.netflix.appContext…`, `window.ytInitialPlayerResponse`, `window.yt.config_`)와 **페이지의 실제 `fetch`/`XMLHttpRequest`**는 main world에만 있다 → 인터셉트와 플레이어 조작은 페이지 컨텍스트에서 해야 한다.

### 1.4 메시지 프로토콜 (window.postMessage)
콘텐츠 → 페이지 단방향. 페이지 → 콘텐츠 응답은 없다. [확인]

| type | 페이로드 | 보내는 곳 | 받는 쪽 처리 |
|---|---|---|---|
| `"resetInjectScript"` | `{ type, setting }` | `resetInjectScript(setting)` (`initInjectScript` 끝) | `this.resetInject(data.setting)` → `initVariable(setting)`; `!useManualIntercept`면 `interceptCaption()` |
| `"callMethod"` | `{ type, name, args }` | `callMethodFromInject(name, ...args)` | `this[name](...args)` (정적 메서드를 이름으로 호출) |

- 전송: `window.postMessage(message, "*")` (targetOrigin `"*"`). [확인]
- 수신: `listenMessageFrameFromInject()` — 각 클래스의 정적 초기화 블록(`static #injectScriptConstructor = (() => { this.listenMessageFrameFromInject(); })()`)에서 **모듈 로드 시점에** 호출된다. `Youtube`, `YoutubeNoCookie`, `Netflix`에 있음. `SVT`와 `BaseVideo`에는 없음. [확인]
  - `!isVideoSite() || !checkIsInjectedScript()`면 등록 안 함 → 콘텐츠 스크립트 쪽이나 사이트가 다른 클래스는 리스너 없음.
  - `YoutubeNoCookie`는 상속받은 정적 블록이 아니라 **자기 정적 블록**으로 `this=YoutubeNoCookie` 리스너를 등록한다(정적 private 필드는 상속돼도 재실행되지 않으므로 서브클래스마다 필요). `Youtube`의 블록은 `this=Youtube`로 돌고 nocookie 페이지에선 `sitePattern` 불일치로 등록 안 됨.
  - 수신 대상 클래스를 구분하는 필드가 없다. 그 페이지에서 `sitePattern`이 맞는 클래스(실질적으로 하나)가 처리한다.
- 순서 보장: 주입 스크립트의 정적 블록(리스너 등록)은 스크립트 실행 중 동기적으로 돌고, `load` 이벤트는 실행이 끝난 뒤 발생 → `resetInjectScript`가 리스너 등록 후에 도착한다. 이어서 `handleUrlChange`의 `callMethod`가 간다. 같은 window에 보낸 postMessage는 순서대로 처리됨. [확인/추론]
- **Structured clone 영향**: `Setting` 인스턴스가 복제되면서 프로토타입이 빠짐 → 페이지 쪽 `setting`은 plain object(`save()` 없음). `setLocalOverride`가 만든 `__overrides`는 non-enumerable이라 **빠지지만** override된 값 자체(예: 사이트별 `translateTarget`, #262)는 own enumerable 프로퍼티라서 그대로 전달된다. [확인]
- 보안 관찰: 페이지 자체 JS도 같은 형식으로 postMessage를 보내면 `callMethod`로 임의 정적 메서드를 부를 수 있다(출처/nonce 검사 없음). `data.args`가 없으면 `...undefined`라서 TypeError. (관찰)

### 1.5 어느 메서드가 어느 컨텍스트에서 도나
| 메서드 | 컨텍스트 |
|---|---|
| `handleVideo`, `initInjectScript`, `injectScript`, `loadEventListener`, `listenUrl`, `listenPlayer`(→ `listenPlay/Pause/CaptionHover/Button/Key`), `pause/play`, `handleCaptionOnOff`(`setting.save()`) | 콘텐츠 스크립트 |
| `resetInject`, `activateCaption`, `interceptCaption`, `requestSubtitle*`, `parseSubtitle`, `mergeSubtitles`, 플레이어 API 호출, 메타데이터 fetch | 페이지 컨텍스트 |
| SVT 전체 | 콘텐츠 스크립트 |

DOM은 두 world가 공유하므로 콘텐츠 쪽에서 jQuery 셀렉터로 자막 DOM에 이벤트를 붙이는 건 문제없다. 콘텐츠 쪽 모듈에서도 `BaseVideo.interceptor`(BatchInterceptor)가 **생성은 되지만 apply는 안 된다**. [확인]

---

## 2. 인터셉트

### 2.1 BatchInterceptor
```js
static interceptor = new BatchInterceptor({
  name: "mtt-subtitle-interceptor",
  interceptors: [new XMLHttpRequestInterceptor(), new FetchInterceptor()],
});
```
- XHR과 fetch를 **둘 다** 가로챈다. 최신 YouTube는 timedtext를 fetch로 요청한다. XHR만 쓰던 시절엔 이중 자막이 조립되지 않았다(#151). [확인]
- 인스턴스 하나가 `BaseVideo`의 static이고 모든 서브클래스가 공유한다. `interceptorLoaded`는 `this.interceptorLoaded = true`로 쓰기 때문에 서브클래스에 own property로 생긴다. [확인]
- 리스너 계약(0.26.8): `interceptor.on("request", async ({ request, requestId }) => …)`. 응답할 땐 `request.respondWith(new Response(body))`. 0.26은 async 리스너가 끝날 때까지 기다렸다가 `respondWith`가 없으면 원 요청을 네트워크로 보낸다(= "return만 하면 통과"). [확인: 라이브러리 소스/동작]
- `new Response(string)`에는 헤더를 주지 않는다 → content-type은 `text/plain;charset=UTF-8`. 플레이어는 그래도 파싱한다. [확인/추론]
- **업그레이드 주의**: `@mswjs/interceptors` 이후 메이저에서는 리스너 인자가 `{ request, requestId, controller }`이고 `controller.respondWith()`를 쓰는 방식으로 바뀌어 `request.respondWith`가 없어진 것으로 알려져 있다. 버전을 올리기 전에 changelog로 확인할 것. 그리고 (a) async 리스너 대기, (b) respond 안 하면 원 요청 통과, (c) dispose 후 재apply 가능 — 이 세 가지 의미가 유지되는지 검증해야 한다.

### 2.2 사이트별 URL 패턴 [확인]
| 클래스 | `captionRequestPattern` |
|---|---|
| Youtube | `/^(https:\/\/)(www\.youtube\.com)(\/api\/timedtext)/` |
| YoutubeNoCookie | `/^(https:\/\/)(www\.youtube-nocookie\.com)(\/api\/timedtext)/` |
| Netflix | `/^(https:\/\/).*(nflxvideo\.net)\/\?o=1/` |
| SVT | `/NEVER_MATCH_SVTPLAY/` (인터셉트 안 함) |
| BaseVideo(기본) | `/^(https:\/\/)(example\.com)/` |

`sitePattern`: `^https://www.youtube.com`, `^https://www.youtube-nocookie.com`, `^https://www.netflix.com`, `^https://www.svtplay.se` (`m.youtube.com` 등은 대상 아님).

### 2.3 rawFetch 규칙 (무한 재귀 방지)
```js
static originalFetch = typeof fetch !== "undefined" ? fetch.bind(globalThis) : null;
static rawFetch(...args) { return (this.originalFetch || fetch)(...args); }
```
- 모듈 로드 시점(= `interceptor.apply()`로 전역 fetch가 패치되기 **전**)에 네이티브 fetch를 잡아 둔다. [확인]
- 인터셉트 핸들러 안에서 **같은 패턴의 URL을 다시 요청할 땐 반드시 `rawFetch`**를 쓴다: `Youtube.requestSubtitle`(두 번 다), `Netflix.requestSubtitle`. 일반 `fetch`를 쓰면 fetch 인터셉터에 다시 걸려서 무한 재귀한다. [확인]
- 패턴에 안 맞는 요청은 일반 `fetch`를 써도 된다(패턴 검사 후 그냥 통과): `getYoutubeMetaDataFromAPI`(`/youtubei/v1/player`), `getYoutubeMetaDataFromWatch`(`/watch?v=`). [확인]
- 한계: 페이지 JS가 우리 패치 **이전에** 잡아 둔 `fetch`/`XMLHttpRequest` 참조로 보내는 요청은 인터셉트되지 않는다 → `activateCaption`이 마지막에 `reloadCaption()`으로 강제 재요청을 거는 이유 중 하나. [추론]

### 2.4 수동 인터셉트(`useManualIntercept`)와 kill/debounce 타이밍 [확인]
- `useManualIntercept`: Base=false, **Youtube=true**(nocookie 상속), Netflix=false(상속), **SVT=true**.
  - false(Netflix): `resetInject`(설정 수신) 때 바로 `interceptCaption()`.
  - true(YouTube): `activateCaption` 안에서만 인터셉트를 시작한다.
- `interceptKillTime = 60_000` ms. `killInterceptDebounce = debounce(interceptKillTime, this.killIntercept)` (throttle-debounce v5, trailing).
  - 정적 필드라서 **타이머 하나를 모든 서브클래스가 공유**한다. 콜백은 bind 안 된 `killIntercept`이고, throttle-debounce가 `callback.apply(self, args)`(self = 래퍼 호출 시 `this`)로 부르므로 마지막으로 `this.killInterceptDebounce()`를 부른 클래스가 `this`가 된다.
  - `killIntercept()`: `interceptor.dispose()`(XHR/fetch 패치 원복 + **모든 리스너 제거**) → `interceptorLoaded=false`.
- `activateCaption`(YouTube/Netflix)은 항상 `killInterceptDebounce()` → `await interceptCaption()` 순서로 부른다. 그래서 **마지막 activateCaption 후 약 1분이 지나면 인터셉트가 꺼진다.** 그 뒤에 일어나는 자막 요청(사용자가 1분 넘게 지나서 자막을 켜거나 트랙/언어를 바꾸는 경우)은 이중 자막이 되지 않는다. 다음 URL 변경이나 **아무 설정 변경**(→ `checkVideo` → `activateCaption`)이 있으면 다시 켜진다. [확인; 사용자 체감은 추론]
- dispose 후 재apply는 0.26.8에서 동작한다: `readyState=DISPOSED` → `apply()`가 `setup()`을 다시 하고, `interceptCaption`이 `.on("request")`를 다시 등록한다. [확인: 라이브러리 소스]

---

## 3. 공용 인터셉트 핸들러 (`BaseVideo.interceptCaption`) — YouTube/nocookie가 사용

Netflix는 이 메서드를 **완전히 오버라이드**한다(§5). SVT는 인터셉트하지 않는다.

```
on request:
  if !captionRequestPattern.test(url): return              // 통과
  if isSubtitleFailing(url): return                         // 원 트랙이 파킹 중 → 플레이어 요청 그대로 통과
  sub1 = null
  try:
    response = await requestSubtitleCached(url)             // 키 (url)
    targetLang = getPreferredTargetLang()                    // subtitleLangDict[translateTarget] || translateTarget
    sourceLang = guessSubtitleLang(url)                      // YouTube: URL 쿼리 lang
    sub1 = parseSubtitle(response, sourceLang)
    if isSubtitleEmpty(sub1): markSubtitleFailed(url); return   // respond 안 함 → 원 요청 통과
    noteSubtitleSuccess(url)
    responseSub = sub1
    if !isSameLanguage(sourceLang, targetLang)
       && setting.detectSubtitle == "dualsub"
       && !isLangExcluded(setting.langExcludeList, sourceLang)     // #136
       && !isSubtitleFailing(url, targetLang):
      mergedSub = await withDeadline((async () => {
        await waitRandom(300, 800)                           // 밴 회피용 지연
        sub2raw = await requestSubtitleCached(url, targetLang)   // 키 (url, targetLang)
        sub2 = parseSubtitle(sub2raw, targetLang)
        if isSubtitleEmpty(sub2): markSubtitleFailed(url, targetLang); return null
        noteSubtitleSuccess(url, targetLang)
        return mergeSubtitles(sub1, sub2)
      })(), dualSubDeadline = 5000)
      if mergedSub: responseSub = mergedSub
    request.respondWith(new Response(JSON.stringify(responseSub)))
  catch error:
    console.log(error)
    if !sub1: markSubtitleFailed(url)
    respondSourceOnly(request, sub1)   // sub1 있으면 그것으로 응답(respondWith 예외도 삼킴), 없으면 통과
```
[확인]

핵심 계약:
- **플레이어는 이 요청에 묶여 있으므로 반드시 응답하거나 통과시켜야 한다.** 번역 트랙이 실패하면(레이트리밋/파싱/병합 오류) 원문 트랙으로 응답한다. 예전엔 플레이어가 멈춰서 "자막 켜면 YouTube 프리즈"가 났다.
- `withDeadline(promise, ms)`: `Promise.race([promise, timeout→null])`, `finally`에서 `clearTimeout`. 시간이 다 되면 **null로 resolve하고 작업은 취소하지 않는다**(버림). 늦게 끝난 작업도 `requestSubtitleCached` 캐시를 채우고 `markSubtitleFailed`/`noteSubtitleSuccess`를 기록한다. [확인]
- 내부 promise가 reject하면(parse/merge throw) race도 reject → 바깥 catch → `respondSourceOnly(sub1)`. 이때 YouTube `mergeSubtitles`가 sub1을 **제자리에서 수정**하므로, 루프 도중 throw하면 **일부만 병합된 sub1**이 응답될 수 있다. (관찰)
- 데드라인이 지나서 sub1만 보낸 뒤 버려진 작업이 나중에 `mergeSubtitles(sub1, …)`로 sub1을 수정해도, 이미 직렬화해서 보냈으니 영향 없다. [확인]
- 원 캐시 응답(raw json)은 절대 수정하지 않는다. `parseSubtitle`이 매번 새 객체를 만든다 → 같은 캐시 값을 여러 번 써도 안전. **재작성에서 꼭 지킬 불변식.** [확인]

### 3.1 캐시 (memoizee) — 정확한 의미 [확인: memoizee 0.4.15 소스]
```js
static requestSubtitleCached = memoize(
  async function (subUrl, lang, tlang, videoId) { return await this.requestSubtitle(...arguments); },
  { promise: true, maxAge: BaseVideo.subtitleCacheMaxAge }   // 5 * 60 * 1000
);
```
- **길이/정규화**: `fn.length === 4` → 정규화기 `get-fixed(4)`. 키는 `args[0..3]`의 위치별 동등성(`indexOf`, NaN 인식, 그 외엔 `===`)이다. 인자가 모자라면 `undefined`로 채운 것과 같다.
  - `requestSubtitleCached(url)` → 키 `(url, undefined, undefined, undefined)`
  - `requestSubtitleCached(url, targetLang)` → 키 `(url, targetLang, undefined, undefined)`
  - 실제 호출에선 `tlang`, `videoId`가 **항상 undefined**다(넘기는 곳 없음).
- **`this` 전달**: memoizee는 `call.call(original, this, …)`로 호출 시점의 `this`를 넘긴다 → `this.requestSubtitle`이 서브클래스(Youtube 등)로 디스패치된다. **캐시 맵은 하나**(BaseVideo static)이고 키에 `this`는 들어가지 않는다 → 모든 사이트 클래스가 공유. (실제론 사이트마다 URL이 달라서 충돌하지 않음.)
- **`promise: true`**(기본 'then' 모드): 같은 키로 동시에 들어온 호출은 pending promise 하나를 공유한다(in-flight dedupe). **reject되면 캐시에서 지운다.** **resolve된 값은 `undefined`/쓸모없는 값이어도 캐시된다.** YouTube `requestSubtitle`은 예외를 삼키고 `undefined`를 resolve하므로 실패도 캐시되는 셈이고, 그래서 `forgetSubtitle`이 있다.
- **`maxAge`**: `"setasync"` 이벤트에 걸려 있어서 5분 TTL이 **promise가 resolve된 시점부터** 잰다(호출 시점 아님). 만료되면 `conf.delete(id)`. 값은 `BaseVideo.subtitleCacheMaxAge`를 **클래스 정의 시 한 번** 읽는다 → 서브클래스가 오버라이드해도 소용없다(코드 주석에도 명시).
- **`forgetSubtitle(...args)` → `requestSubtitleCached.delete(...args)`** (try/catch로 감쌈):
  - `markSubtitleFailed(subUrl, lang)`이 `forgetSubtitle(subUrl, lang)`을 **인자 2개로** 부른다. memoizee의 `delete`(`extDel`)는 `get(args)`를 **같은 패딩 규칙**으로 계산하므로:
    - `forgetSubtitle(url, undefined)` → 키 `(url, undefined, undefined, undefined)` = `requestSubtitleCached(url)` 항목 → **실제로 지워진다.**
    - `forgetSubtitle(url, targetLang)` → `(url, targetLang, undefined, undefined)` = 번역 트랙 항목 → **실제로 지워진다.**
  - 항목이 없으면 `get`이 null → 아무것도 안 함(throw 없음).
  - **대체 구현 요구사항**: 키는 `[subUrl, lang ?? undefined]`(나머지 두 인자는 항상 undefined이므로 2-튜플로 충분하지만, 4인자 시그니처를 유지하려면 모자란 인자를 undefined로 정규화)이어야 하고, delete가 같은 정규화를 거쳐 2인자 호출로 4인자 항목을 지울 수 있어야 한다. 예: `key = JSON.stringify([url, lang ?? null])` 같은 식이면 `"" vs undefined` 구분에 주의.
- **대체 구현이 지켜야 할 것 정리**: (1) in-flight promise 공유, (2) reject 시 제거, (3) resolve된 undefined는 캐시(그리고 명시적 delete로 제거), (4) TTL 5분은 resolve 시점부터, (5) 호출자 `this` 보존(또는 클래스 디스패치를 다른 방식으로 보장), (6) 2인자 delete가 같은 키를 지움.

`getYoutubeMetaDataCached = memoize(this.getYoutubeMetaData)` [확인]:
- 정적 필드 초기화 시점의 `this`=Youtube. `getYoutubeMetaData.length === 1` → 정규화기 `get-1`(첫 인자 `videoId` 동등성). **`promise` 옵션 없음, `maxAge` 없음** → 반환된 promise 객체가 그대로 값으로 **페이지 수명 동안 영구 캐시**된다.
- 내부에서 모든 예외를 잡고 `{}`를 반환하므로 reject는 없다. 따라서 **실패(`{}`)도 해당 videoId에 대해 페이지를 새로 고칠 때까지 캐시된다.** (YouTube는 SPA라서 오래 유지됨.)
- `YoutubeNoCookie`도 같은 memo 함수를 상속받아 공유한다(키는 videoId만).

### 3.2 실패 파킹/백오프 [확인]
- 상수: `subtitleFailCooldownFirst = 8_000`, `subtitleFailCooldown = 60_000`, `subtitleFailMapMax = 100`, `subtitleFailures = {}`(BaseVideo static 객체, 서브클래스가 **같은 객체 참조**를 공유).
- 키: `getFailKey(subUrl, lang) = subUrl + "|" + (lang || "")` → 원 트랙 `"url|"`, 번역 트랙 `"url|ko"`. 서로 독립이라 번역이 깨져도 원 트랙은 파킹되지 않고, 반대도 마찬가지.
- `markSubtitleFailed(subUrl, lang)`:
  1. 새 키이고 맵 크기 ≥ 100이면 `at`이 가장 오래된 항목 하나를 삭제(맵 전체 초기화 금지 — 그러면 모든 트랙 파킹이 한꺼번에 풀린다).
  2. `{ at: Date.now(), count: (prev?.count || 0) + 1 }`로 기록. **count는 쿨다운이 끝나도 유지**된다(그래야 escalation이 된다).
  3. `forgetSubtitle(subUrl, lang)`(캐시 제거, §3.1).
- `noteSubtitleSuccess(subUrl, lang)`: 항목 삭제(count 리셋은 성공했을 때만).
- `isSubtitleFailing(subUrl, lang)`: 항목이 있고 `Date.now() - at < (count > 1 ? 60s : 8s)`이면 true. 쿨다운이 지나면 false(다시 시도는 허용하되 count는 남음).
- 호출 지점:
  - 핸들러 맨 앞 `isSubtitleFailing(url)` → 원 트랙이 파킹 중이면 손대지 않고 통과(플레이어가 YouTube와 직접 통신 → 원어 단일 자막).
  - 원 트랙 파싱 결과가 비면 `markSubtitleFailed(url)` 후 통과.
  - 원 트랙 처리 중 throw(sub1이 아직 없을 때) → `markSubtitleFailed(url)`.
  - 번역 트랙이 비면 `markSubtitleFailed(url, targetLang)` → null(원문만 응답).
  - 번역 트랙이 파킹 중이면 대기/요청을 아예 건너뛴다.
- 주의: 키에 쓰이는 `request.url`은 플레이어 URL 전체(쿼리 포함)다. 매 요청마다 토큰 같은 파라미터가 바뀌면 캐시와 파킹이 사실상 URL 단위로만 걸린다. [추론]

### 3.3 대기 유틸 [확인]
- `waitUntil(fn, time)`: `async-wait-until`, 50 ms 폴링, `timeout = time || WAIT_FOREVER`(∞). 시간 초과 시 `TimeoutError`를 **throw**. 예전엔 timeout 인자가 무시돼서 항상 무한 대기였다(Netflix 원래 트랙 복원이 영원히 안 되던 버그). predicate가 throw해도 reject.
- `waitPlayer()` = `waitUntil(() => getPlayer())`(무한). `waitPlayerReady()` = `waitUntil(() => checkPlayerReady())`(무한). 기본 `checkPlayerReady`는 `getPlayer()?.readyState >= 3`.
- `wait(ms)`, `waitRandom(min,max)` = `min + random*(max-min)` ms.
- `withDeadline` — §3.

---

## 4. YouTube / youtube-nocookie

### 4.1 셀렉터·상수 [확인]
| 항목 | 값 |
|---|---|
| `baseUrl` | `https://www.youtube.com` / nocookie: `https://www.youtube-nocookie.com` |
| `playerSelector` | `#movie_player video` |
| `playerApiSelector` | `.html5-video-player` |
| `captionContainerSelector` | `#movie_player .ytp-caption-window-container` |
| `captionWindowSelector` | `#movie_player .caption-window` |
| `captionBoxSelector` | `#movie_player .ytp-caption-segment` |
| `listenButtonSelector` | `.ytp-subtitles-button` |
| `useManualIntercept` | `true` |
| `isSubtitleRequestFailed` | `false`(static, 아래 flip-flop) |

youtube-nocookie는 `sitePattern`/`captionRequestPattern`/`baseUrl`만 오버라이드하고 나머지(셀렉터 포함)는 전부 상속한다. 자기 정적 블록에서 메시지 리스너를 등록한다. [확인]

### 4.2 활성화 흐름
1. (콘텐츠) `handleUrlChange(url)`: `pausedByExtension=false` → `callMethodFromInject("activateCaption", url)`. 최초 `handleVideo` 때와 **매 `navigate` 이벤트**(`navigation.addEventListener("navigate", e => handleUrlChange(e.destination.url))`), 그리고 **설정이 바뀔 때마다** 호출된다. [확인]
2. (페이지) `activateCaption(url)` [확인]:
   1. `setting.subtitleButtonToggle == "false"` 이거나 `!isVideoUrl(url)`이면 return. `isVideoUrl` = url에 `${baseUrl}/shorts` 또는 `/embed` 또는 `/watch`가 포함됨.
   2. `{lang, tlang} = await guessVideoLang(url)` (§4.3).
   3. `await waitPlayerReady()` (`#movie_player video` readyState ≥ 3, 무한 대기).
   4. `killInterceptDebounce()` → `await interceptCaption()`.
   5. `loadCaption()`: 모든 `.html5-video-player` 요소에 `ele.loadModule("captions")` (임베드에서 자막을 켜기 위함).
   6. `setPlayerCaption(lang, tlang)`: `ele.setOption("captions", "track", { languageCode: lang, translationLanguage: tlang })`.
   7. `await waitRandom(4000, 5000)`.
   8. `reloadCaption()`: `ele.setOption("captions", "reload", true)` → 플레이어가 timedtext를 다시 요청하게 해서 인터셉트에 걸리게 한다.
- `navigate` 이벤트는 내비게이션이 커밋되기 **전**에 발생하므로 `waitPlayerReady`가 이전 영상 기준으로 통과할 수 있다. 이것도 4–5초 뒤 `reloadCaption`을 하는 이유로 보인다. [추론]
- `navigation`(Navigation API)이 없는 브라우저에서는 `listenUrl`이 ReferenceError를 던진다 → `loadEventListener`의 promise가 reject되고 그 뒤의 `listenPlayer()`도 실행되지 않는다(호버 일시정지/버튼 리스너 없음). Firefox 지원 여부는 브라우저 버전별로 확인 필요. (관찰)

### 4.3 언어 결정 (`guessVideoLang(url)`) [확인]
- `v = getVideoId(url)` = `getUrlParam(url).v || getUrlParam(url)[2]`. `getUrlParam`은 path segment를 인덱스 키(`"0"`, `"1"`, `"2"`…)로, 쿼리를 이름 키로 합친 객체(`Object.assign`)다. `[2]`는 `/shorts/<id>`, `/embed/<id>`용.
- `captionMeta = metaData.captions.playerCaptionsTracklistRenderer.captionTracks`.
- 기본(dualsub/sourcesinglesub): `lang = captionMeta.filter(sub => sub.kind)[0].languageCode` → **첫 번째 ASR(자동 생성, `kind` 있음) 트랙의 언어** = 음성 언어. `tlang` = undefined.
- `targetsinglesub`: `isSameLanguage(sub.languageCode, translateTarget)`인 첫 트랙(ASR/수동 상관없음)의 언어. 없으면 ASR 언어. `tlang = !isSameLanguage(lang, translateTarget) ? { languageCode: translateTarget } : ""`. (YouTube는 트랙을 기본 코드(`pt`)로 표기하므로 정확 일치 대신 `isSameLanguage`를 쓴다 — 지역 코드 대상(`pt-BR`)일 때 이미 있는 트랙을 또 번역하지 않기 위해.)
- 반환: `{ lang: lang || "en", tlang }`. ASR 트랙이 없는 영상(수동 자막만)이면 해당 트랙 존재 여부와 무관하게 `"en"`으로 폴백한다. (관찰)

메타데이터(`getYoutubeMetaData(videoId)`, memo는 §3.1) [확인]:
1. `window.ytInitialPlayerResponse.videoDetails.videoId == videoId`면 그 객체(첫 로드 영상에만 맞음; SPA 이동 뒤엔 stale).
2. `getYoutubeMetaDataFromAPI`: `POST ${baseUrl}/youtubei/v1/player?key=${yt.config_.INNERTUBE_API_KEY}`, body `{ videoId, context: { client: { clientName: yt.config_.INNERTUBE_CLIENT_NAME, clientVersion: yt.config_.INNERTUBE_CLIENT_VERSION } } }`, `content-type: application/json`, 일반 `fetch`. `.captions`가 있으면 사용. 예외 → `{}`. (참고: timelens-youtube#2)
3. `getYoutubeMetaDataFromWatch`: `GET ${baseUrl}/watch?v=<id>` 텍스트에서 `/ytInitialPlayerResponse\s*=\s*({.+?})\s*;\s*(?:var\s+meta|<\/script|\n)/`로 JSON 추출. 예외 → `{}`.

### 4.4 인터셉트 시 트랙 확보 (`requestSubtitle(subUrl, lang)`) [확인]
- `guessSubtitleLang(url)` = **요청 URL 쿼리 `lang`** (원 트랙 언어).
- 원 트랙: `requestSubtitleCached(request.url)` → `requestSubtitle(url)` → 플레이어가 요청한 URL 그대로(`getTrafficSafeUrl` 적용) `rawFetch` → `.json()`.
- 번역 트랙: `requestSubtitleCached(request.url, targetLang)` → `getTranslatedSubtitleUrl(subUrl, targetLang)`:
  1. `getUserGeneratedSubUrl(v, lang)`: 메타데이터 `captionTracks` 중 `!kind && languageCode == lang`(**수동 업로드, 정확 일치**)인 첫 트랙의 `baseUrl + "&fmt=json3"`. `captionList?.filter`를 옵셔널로 막아서 captionTracks가 없어도 throw하지 않는다(#151).
  2. 없으면 원 URL에 `searchParams.set("tlang", lang)` → YouTube 자동 번역 트랙.
  - 수동 트랙 `baseUrl`에는 브라우저 세션 토큰(pot)이 없을 수 있어 anti-bot에 막힐 수 있다. 그래도 `tlang` 경로로 **폴백하지 않는다**(빈 결과 → 번역 트랙 파킹). [추론/관찰]
- fetch 재시도/호스트 전환:
  1. `rawFetch(getTrafficSafeUrl(subUrl))` → `.json()`. 예외는 로그만.
  2. `json`이 없으면 `isSubtitleRequestFailed = !isSubtitleRequestFailed`(**토글**) 후 한 번 더 시도. 예외는 `console.error`.
  3. `json`(undefined일 수 있음) 반환. **reject하지 않는다.**
- `getTrafficSafeUrl(url)`: `isSubtitleRequestFailed`가 true면 hostname을 `video.google.com`, pathname을 `/timedtext`로 바꾼다(쿼리 유지). 이 플래그는 **전역 flip-flop**이라 한 번 실패하면 이후 원/번역 모든 timedtext 요청이 `video.google.com`으로 가고, 다음 실패 때 다시 원래 호스트로 돌아온다. [확인]
- `isSubtitleEmpty(sub)` = `!sub?.events?.length`.
- 사용자가 YouTube 메뉴에서 직접 "자동 번역"을 골라 플레이어 요청 URL에 이미 `tlang`이 있으면: 원 트랙 refetch 결과가 이미 번역본이고 `sourceLang`(쿼리 `lang`)은 원어라서 dual 조건을 통과한다. 번역 URL은 같은 `tlang`을 다시 set → 두 줄 모두 번역문이 될 수 있다. [추론]
- `targetsinglesub`: 플레이어 트랙을 `lang + translationLanguage`로 설정했으므로 요청 URL에 `tlang`이 붙어 있고, 핸들러는 detectSubtitle != dualsub이라 그 URL을 refetch/정규화한 단일 트랙만 응답한다. `sourcesinglesub`도 refetch+정규화(ASR 롤링 병합 등)는 거치고 단일 트랙만 응답한다. [확인]

### 4.5 json3 파싱 (`parseSubtitle(subtitle, lang)`) [확인]
- `subtitle?.events`가 없으면 빈 트랙 `{events: [], pens: [{}], wireMagic: "pb3", wpWinPositions: [{}], wsWinStyles: [{}]}` 반환(→ `isSubtitleEmpty` true).
- `rtl = isRtl(lang)` (`rtlLangList.includes(lang)`, 정확 일치) (#206).
- `pens = [{}]` (pen 0 = 기본).
- 각 event에 대해:
  - `!event.segs || !event.dDurationMs`면 skip(윈도 정의/길이 0 이벤트 제외).
  - `oneLineSub` = segs의 `utf8` 이어 붙인 문자열(태그 포함 원문). `oneLineSubTrim = cleanSubText(oneLineSub).trim()`.
  - **새 이벤트로 push하는 조건**: `newEvents`가 비었거나, `oneLineSub == "\n"`이거나, 이전 이벤트의 `tStartMs + dDurationMs <= event.tStartMs`(겹치지 않음).
    - push: `{ tStartMs, dDurationMs, ...(rtl ? { wsWinStyleId: 2 } : {}), segs: buildColoredSegs(oneLineSub, pens) }`. LTR은 `wsWinStyleId`를 아예 넣지 않는다(바이트 단위로 기존과 같게).
    - 그다음 `newEvents.length > 2`이고 바로 앞(-2) 이벤트 끝이 현재 시작보다 뒤면 앞 이벤트 길이를 `event.tStartMs - prev.tStartMs - 1`로 자른다. (`> 2`라서 두 번째 이벤트는 절대 잘리지 않는다 — 관찰)
    - `"\n"` 이벤트는 `buildColoredSegs("\n")` → 빈 seg `[{utf8: ""}]`인 이벤트가 된다(ASR 줄바꿈 마커). 이어지는 겹친 이벤트가 이 빈 이벤트에 병합된다.
  - **겹치면(else)**: 이전 이벤트의 segs를 **plain seg 하나**로 합친다: `[{ utf8: mergeCaptionText(prev.segs.map(s=>s.utf8).join(""), oneLineSubTrim) }]` (색상 정보 소실). 길이는 `event.tStartMs - prev.tStartMs + event.dDurationMs`로 늘린다. (#90: ASR 롤링 자막 "AA BB" 중복 방지)
- 반환 템플릿(고정):
  ```js
  { events, pens, wireMagic: "pb3",
    wpWinPositions: [{}, { apPoint: 6, ahHorPos: 20, avVerPos: 100, rcRows: 2, ccCols: 40 }],
    wsWinStyles: [{}, { mhModeHint: 2, juJustifCode: 0, sdScrollDir: 3 }, { mhModeHint: 2, juJustifCode: 1, sdScrollDir: 3 }] }
  ```
  어떤 이벤트도 `wpWinPosId`를 쓰지 않으므로 `wpWinPositions[1]`과 `wsWinStyles[1]`은 사실상 쓰이지 않는다. (관찰)

헬퍼 [확인]:
- `mergeCaptionText(acc, next)`: `!next` → acc; `!acc` → next; `acc.endsWith(next)` → acc; `next.startsWith(acc)` → next(누적형); 아니면 `next`를 공백으로 나눠 가장 긴 접두 단어열 `head`(i = words.length..1)가 `acc.endsWith(head)`면 `acc + " " + rest`(rest 없으면 acc); 하나도 안 맞으면 `acc + " " + next`. 단어 단위라 단어 중간에서 병합되지 않는다.
- `cleanSubText(s)`: `<br\s*\/?>`(대소문자 무시) → 공백, `<\/?[a-zA-Z][^>]*>` 제거, `\s+` → 공백 하나. **trim 안 함.**
- `getPenId(pens, rgb)`: `pens[1..]`에서 `fcColor === rgb`(정수) 찾고, 없으면 push한 뒤 인덱스 반환.
- `buildColoredSegs(raw, pens)`: 정규식 `/<font\b[^>]*?\bcolor\s*=\s*["']?#?([0-9a-fA-F]{6})(?:[0-9a-fA-F]{2})?["']?[^>]*>([\s\S]*?)<\/font>/gi`로 `<font color>` 구간을 `pPenId`가 있는 seg로 만든다(색 = `parseInt(hex6, 16)`, 알파는 버림). 그 밖의 텍스트는 pen 0. 각 조각은 `cleanSubText`. 빈 조각 제거 → 첫 조각 앞 공백, 마지막 조각 뒤 공백만 trim → 다시 빈 조각 제거. 결과가 비면 `[{utf8: ""}]`. pen 0 조각은 `{utf8}`, 색 조각은 `{utf8, pPenId}`. 중첩 `<font>`는 non-greedy라 바깥 태그가 첫 `</font>`에서 끝난다(관찰).

### 4.6 병합 (`mergeSubtitles(sub1, sub2)`) [확인]
```js
for (let event of sub1.events) {
  var best = this.findMostOverlappingLine(event.tStartMs, event.tStartMs + event.dDurationMs,
               sub2.events, l => l.tStartMs, l => l.tStartMs + l.dDurationMs);
  if (best) {
    var targetText = best.segs.map(s => s.utf8).join("");
    event.segs.push({ utf8: "\n" + targetText });     // 매번 새 seg 객체
  }
}
return sub1;
```
- 원 이벤트마다 번역 줄을 **줄바꿈 뒤 plain seg**로 붙인다. 원문은 색상 seg를 유지하고, 번역 줄은 색이 빠진다.
- **sub2의 seg를 in-place로 수정하거나 참조를 공유하면 안 된다**(매 매칭마다 새 객체). 예전엔 `"\n"`을 제자리에서 앞에 붙이고 같은 참조를 push해서, 번역이 `\n`으로 뭉치거나 중복됐다(#151, CLAUDE.md §5).
- sub1은 제자리에서 수정한다(새로 파싱한 객체라 괜찮음).
- 한 번역 줄이 여러 원 이벤트에 반복해서 붙을 수 있다(always-attach).

### 4.7 `findMostOverlappingLine(start, end, candidates, getStart, getEnd)` (공용) [확인]
- `overlap = min(end, getEnd(l)) - max(start, getStart(l))`. 가장 큰 overlap을 고른다(같으면 **먼저 나온 것**, `>` 비교). `bestOverlap` 초기값은 `-Infinity` → 겹치는 게 없어도 가장 가까운(음수 중 최대) 줄을 반환한다. 후보가 없거나 null이면 null.
- 예전 metric `max(srcEnd - tgtStart, tgtEnd - srcStart)` 오름차순은 사실상 중점 거리였다(긴 번역 줄이 여러 원 줄에 걸칠 때 오정렬). overlap 최대로 바꾸면서 always-attach 성질은 유지했다.

### 4.8 2번째 줄 스타일 / 주입 CSS (`contentScript.js` `applyStyleSetting`) [확인]
- `addElementEnv()`가 **모든 페이지**에 `<style id="mttstyleSubtitle">`를 `head`에 추가하고, `applyStyleSetting()`이 내용을 채운다. `detectSubtitle == "null"`이면 `.prop("disabled", true)`. 설정이 바뀔 때마다 다시 채운다. destructor(`removePrevElement`)에서 `#mttstyleSubtitle`를 제거한다.
- 변수: `fontPrefix` = `tooltipFontFamily`(generic family면 그대로, 아니면 따옴표로 감싸고 `,`) (#86); `rtlDirection = getRtlDir(translateTarget)`.
- 내용:
  ```css
  #ytp-caption-window-container .ytp-caption-segment { cursor:text!important; user-select:text!important;
     font-family: ${fontPrefix} -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif !important; }
  .caption-visual-line { display:flex!important; align-items:stretch!important; direction: ${rtlDirection} }
  .captions-text .caption-visual-line:first-of-type:after { content:'⣿⣿'; border-radius:3px!important; color:white!important;
     background:transparent!important; box-shadow: rgba(50,50,93,0.25) 0px 30px 60px -12px inset, rgba(0,0,0,0.3) 0px 18px 36px -18px inset;
     display:inline-block; vertical-align:top; opacity:0; transition: opacity 0.7s ease-in-out; }
  .ytp-caption-segment { color:white!important; text-shadow:1px 1px 2px black!important;
     /* subtitleBackground !== "false": */ backdrop-filter: blur(3px)!important; background: rgba(8,8,8,0.1)!important;
     /* subtitleBackground === "false": */ backdrop-filter: none!important; background: transparent!important; }
  .captions-text:hover .caption-visual-line:first-of-type:after { opacity:1; }
  .ytp-pause-overlay { display:none!important; }
  .ytp-expand-pause-overlay .caption-window { display:block!important; }
  ```
  (#187 배경, #205 배경 끄기)
- 관찰: `.caption-visual-line`, `.captions-text` 같은 셀렉터는 YouTube 전용 스코프가 없는데 모든 사이트에 주입된다. CLAUDE.md §4(#345) 스코프 원칙과 맞지 않는다(현 동작이니 그대로 유지할지는 재작성 때 판단).

### 4.9 자막 DOM 상호작용 (콘텐츠 스크립트, `BaseVideo.listenCaptionHover`) [확인]
- `captionContainerSelector`가 있으면 그 요소가 나타날 때까지 무한 대기한 뒤, MutationObserver(`subtree: true, childList: true`)를 붙인다. 변화가 생길 때마다:
  - `$(captionBoxSelector).off().on("contextmenu", stopPropagation).on("mousedown", stopPropagation)` — 자막 텍스트를 선택할 수 있게(플레이어의 드래그/메뉴 가로채기 차단, #8). `.off()`는 그 요소의 jQuery 핸들러를 **전부** 지운다.
  - `$(captionWindowSelector).off().on("mouseenter", pause).on("mouseleave", play).attr("draggable", "false")`.
- `pause()`: `isPaused == true` 이거나 `mouseoverPauseSubtitle == "false"`면 무시. 아니면 `pausedByExtension = true; pausePlayer()`(`getPlayer()?.pause()`).
- `play()`: `pausedByExtension`일 때만 false로 바꾸고 `playPlayer()`.
- `listenPlay/listenPause`: `<video>`의 play/pause 이벤트로 `isPaused`를 추적한다.
- `handleUrlChange`가 `pausedByExtension = false`로 리셋한다.
- `listenButton`: `$(".ytp-subtitles-button").on("click", handleButtonKey)` (리스너를 붙이는 시점에 존재하는 요소에만). `listenKey`: `$(document).on("keydown", handleButtonKey)`.
- `handleCaptionOnOff(e)`: `e.code == "KeyC" || e.button == 0`이면 `setting.subtitleButtonToggle = $(".ytp-subtitles-button").attr("aria-pressed")`(문자열 `"true"`/`"false"`), `setting.save()`.
  - 관찰: 입력창에서 "c"를 쳐도 document keydown이 발동한다. keydown 시점의 `aria-pressed`는 YouTube가 토글하기 **전** 값일 수 있다(핸들러 순서에 따라 다름, [추론]). 저장으로 값이 바뀌면 storage 변경 → `checkVideo()` → `activateCaption()` 재실행 루프가 돈다.

---

## 5. Netflix

### 5.1 상수 [확인]
- `sitePattern` `^https://www.netflix.com`, `captionRequestPattern` `^https://.*nflxvideo.net/?o=1`, `baseUrl` `https://www.netflix.com`.
- `playerSelector/playerApiSelector/captionContainerSelector/captionWindowSelector/captionBoxSelector` = `""` → 호버 일시정지/선택 처리 없음.
- `subtitleLangDict = { "zh-CN": "zh-Hans", "zh-TW": "zh-Hant" }` → `getSettingTargetLang()`이 설정 대상을 Netflix bcp47로 매핑.
- `sub = {}`: 파싱한 자막 캐시 `sub[videoId][lang] = parsedSubMeta`(만료 없음, 페이지 수명).
- `listenPlayer()`는 no-op으로 오버라이드 → play/pause/호버/버튼/키 리스너 없음. `useManualIntercept`는 false(상속) → 설정을 받자마자 인터셉트 시작.

### 5.2 플레이어 API (페이지 컨텍스트) [확인]
- `getPlayer()`: `window.netflix.appContext.state.playerApp.getAPI().videoPlayer` → `getAllPlayerSessionIds()` 중 `"watch"` 포함 > `"preview"` 포함 > 첫 번째 → `getVideoPlayerBySessionId(id)`.
- `getVideoId()` = `String(getPlayer()?.getMovieId())` → 플레이어가 없으면 `"undefined"`(truthy 문자열). (관찰: 그래서 `waitUntil(() => getVideoId())`가 바로 통과한다)
- `extractVideoId(url)`(`/watch/(\d+)/`)는 정의만 있고 쓰이지 않는다(dead code).
- `waitPlayerReady()` 오버라이드: `getPlayer()`가 나올 때까지 기다린 뒤 `player.getAudioTrack()`이 truthy가 될 때까지 기다린다(둘 다 무한).
- `getOffTrack()`: `getTimedTextTrackList()`에서 `trackId`에 `"NONE"` 포함 > `"1;1;0;"` 포함 > 첫 번째.
- `checkPlayerCaptionOff()`: `!getTextTrack() || current.trackId === offTrack?.trackId`.
- `setPlayerCaption(lang)`, `setPlayerCaptionOff()`: 정의만 있고 쓰이지 않는다.
- `setTextTrack(sub)`: sub가 truthy면 `getPlayer()?.setTextTrack(sub)`.
- 언어: `guessVideoLang()` = `getAudioTrack()?.bcp47`(async, 인자 무시); `getCurrentSubtitle()` = `getTimedTextTrack()`; `getCurrentSubtitleLang()` = 그 `.bcp47`; `guessSubtitleLang`(async)은 Netflix 핸들러에서 쓰지 않는다.
- 플레이어 메서드 이름 혼용: `getTextTrack`(off 판별)과 `getTimedTextTrack`(현재 자막/언어), `setTextTrack`(실사용)과 `setTimedTextTrack`(미사용 메서드)이 섞여 있다. 그대로 보존하거나 실제 API로 검증할 것. (관찰)

### 5.3 활성화 (`activateCaption(url)`, 페이지) [확인]
1. `if (!this.isVideoUrl(url)) return;` — `isVideoUrl`이 **async**라서 Promise(truthy)를 반환 → 이 검사는 **절대 return하지 않는다**(관찰/버그). 의도는 `url.includes(baseUrl + "/watch")`.
2. `await waitPlayerReady()`.
3. `killInterceptDebounce()` → `await interceptCaption()`.
4. `await wait(3000)`.
5. `await waitUntil(() => getVideoId())` (위 이유로 즉시 통과).
6. `lang = await getPreferredSourceLang()` → `targetsinglesub`면 `getTargetLangMeta()` = 설정 대상(매핑 적용), 아니면 `guessVideoLang()` = 오디오 언어.
7. `checkPlayerCaptionOff()`면 `console.log("caption is off")`만(아무것도 안 함). 아니면 `requestTrack(lang, getVideoId())`(await 안 함) → 플레이어 자막을 그 언어 트랙으로 바꾼다.

### 5.4 트랙 전환 (`requestTrack(lang, videoId)`) [확인]
- `videoId ||= getVideoId()`; `console.log(videoId)`.
- `sub[videoId][lang]`이 있으면 바로 반환.
- 후보: `getTrackList()`(= `getTimedTextTrackList() || []`)를 `.sort((a,b) => a.trackType === "ASSISTIVE" ? -1 : 1)`(ASSISTIVE 우선 의도, 비일관 comparator이고 **플레이어가 돌려준 배열을 제자리 정렬** — 관찰) → `isImageBased === false` → off 트랙 제외 → `bcp47 === lang || bcp47.includes(lang)`인 첫 트랙(부분 문자열 매칭: `"en"`이면 `"en-GB"`도 맞음).
- 없으면 null. 있으면 `setTextTrack(track)` → 최대 2500 ms 동안 `sub[videoId][lang]`가 채워질 때까지 기다린다(시간 초과 TimeoutError는 catch해서 로그) → `sub[videoId][lang]` 반환(없으면 undefined).
- 트랙을 바꾸면 플레이어가 그 TTML을 요청하고, 그 요청이 다시 인터셉트되어 `parseSubtitle`이 `sub[videoId][<현재 트랙 언어>]`를 채운다 — 이렇게 번역 트랙을 얻는다. [추론: 플레이어 동작 의존]

### 5.5 인터셉트 핸들러 (오버라이드) [확인]
```
on request:
  if !captionRequestPattern.test(url): return
  xml = null
  try:
    response = await requestSubtitle(url)        // rawFetch(url), memo 없음
    sourceLang = getCurrentSubtitleLang()
    targetLang = getPreferredTargetLang()
    videoId = getVideoId()
    xml = await response.text()
    sub1 = parseSubtitle(xml, videoId)            // sub[videoId][currentLang] 갱신(부작용)
    xmlRes = xml                                  // 단일 자막은 원본 xml 그대로(ruby/br/중첩 span 100% 보존)
    if !isSameLanguage(sourceLang, targetLang) && detectSubtitle == "dualsub"
       && !isLangExcluded(langExcludeList, sourceLang):
      mergedXml = await withDeadline((async () => {
        sub2 = await requestSubtitleWithReset(targetLang)
        merged = mergeSubtitles(sub1, sub2)
        return merged ? encodeMergedSubtitles(merged) : null
      })(), 5000)
      if mergedXml: xmlRes = mergedXml
    request.respondWith(new Response(xmlRes))
  catch:
    console.log; if xml: try respondWith(new Response(xml))   // 실패 시 원본; xml 전이면 통과
```
- YouTube와 다른 점: **memo 없음, 실패 파킹 없음, 랜덤 대기 없음.** 원 TTML을 플레이어 요청과 별도로 `rawFetch`로 한 번 더 받는다(요청당 두 번 다운로드). [확인]
- `requestSubtitleWithReset(lang)`: `prevSub = getCurrentSubtitle()` → `try { return await requestTrack(lang) } finally { setTextTrack(prevSub) }`. 복원을 `finally`에서 하므로 requestTrack이 throw/timeout해도 원래 트랙으로 돌아온다(예전엔 번역 트랙에 남는 버그가 있었음). 데드라인으로 버려져도 finally는 나중에 실행된다.
- 예상 흐름 [추론]: 원 트랙 요청 인터셉트 → 플레이어를 대상 언어 트랙으로 전환 → 대상 TTML 요청이 **중첩 인터셉트**됨(이때 sourceLang = 대상 언어라 dual 조건이 false → 파싱(캐시 채움) 후 원본 응답) → 바깥 핸들러가 `sub[videoId][targetLang]`를 얻어 병합·응답 → `finally`에서 원 트랙으로 복원 → 플레이어가 원 트랙을 다시 요청하면 그땐 캐시 덕분에 곧바로 병합된다.

### 5.6 TTML 파싱 (`parseSubtitle(xmlString, videoId)`) [확인]
1. `DOMParser().parseFromString(sub, "text/xml")`.
2. 모든 `<p>`를 deep clone(`clonedPs`) — ruby/br/중첩 span 보존.
3. `lang = getCurrentSubtitleLang()` (인자가 아니라 플레이어 현재 트랙. undefined면 접미사가 `"_undefined"`).
4. 각 clone p와 그 하위 `<span>`의 `region`, `style` 속성 값 뒤에 `"_" + lang`을 붙인다.
5. 원 문서에서 첫 `<div>`를 제거한다.
6. `<layout>`의 각 `<region>`을 `xml:id = "region${index}_${lang}"`로 **인덱스 기반으로 바꾼다**. (관찰: p의 참조는 "원래 id + _lang"인데 region은 "region<index>_lang"이다. 원본 region id가 `region0, region1, …` 순서가 아니면 참조가 깨진다.)
7. `<styling>`의 각 `<style>`은 `xml:id = 원래id + "_" + lang`.
8. 각 clone p: `start = parseInt(begin.replace("t",""))`, `end`도 같은 방식(**tick 값 그대로**, tickRate 변환 없음), `text = getTextWithBr(p)`(clone에서 `<br>`를 공백 텍스트로 바꾼 textContent), `region` = p의 region 속성, `style` = p style || 첫 span style || `""`.
   - 바로 앞 항목과 `start`/`end`가 같으면 병합: `prev.text += " " + text`, `prev.originalP`에 공백 텍스트 노드 + 현재 p의 자식 clone을 append.
   - 아니면 `{start, end, text, region, style, originalP: p}` push.
9. `parsedSubMeta = { xmlDoc, lang, subtitles, regions, styles }` → `sub[videoId][lang] = parsedSubMeta`(덮어쓰기) → 반환.

### 5.7 병합 (`mergeSubtitles(sub1Meta, sub2Meta)`) [확인]
- `if (!sub1Meta || !sub2Meta) return null; else if (!sub1Meta) return sub2Meta; else if (!sub2Meta) return sub1Meta;` → 두 번째·세 번째 분기는 **도달 불가**(dead code). 한쪽이라도 없으면 null → 핸들러가 원본 xml로 응답.
- `mergedSubMeta = { ...sub1Meta }` — **얕은 복사라서 `xmlDoc`이 캐시된 `sub[videoId][sourceLang].xmlDoc`과 같은 객체다.** sub2의 각 region/style을 `targetDoc.importNode(node, true)`로 sub1 문서의 `<layout>`/`<styling>`에 append한다(importNode라서 sub2 캐시 문서는 그대로; 예전 appendChild는 노드를 옮겨 버려서 sub2 layout이 비었음). 캐시된 sub1 문서는 **변형된다**(관찰; 각 인터셉트가 다시 파싱하므로 보통 문제는 안 됨).
- `isRegionVertical(xmlDoc, regionId)`: `xml:id`가 일치하는 region의 `writingMode` 속성(`localName === "writingMode"` 또는 이름이 `":writingMode"`로 끝남) 값이 `"tb"`로 시작하면 true.
- 각 `line1 ∈ sub1.subtitles`: `line2 = findMostOverlappingLine(line1.start, line1.end, sub2.subtitles, l=>l.start, l=>l.end)`.
  - line2가 있으면: `useSwap = v1 && !v2`(원문은 세로, 번역은 가로) → region/style을 line2 것으로 쓴다(TTML writingMode는 region 단위). push `{ start: line1.start, end: line1.end, region, style, text: line1.text, originalP: line1.originalP, text2: line2.text, style2: line2.style, originalP2: line2.originalP }`.
  - 없으면 line1 그대로(sub2가 비어 있을 때만).
- `mergedSubMeta.subtitles = mergedSub` 반환. sub1/sub2의 line 객체는 수정하지 않는다(새 객체).
- 두 트랙의 tickRate가 다르면 시간 비교가 틀어진다(tick 원값을 비교함). (관찰)

### 5.8 인코딩 (`encodeMergedSubtitles(subMeta)`) [확인]
- `body`의 첫 `<div>`가 없으면(파싱 때 지웠으므로 보통 없음) 새로 만들어 body에 append.
- 각 항목(idx)마다 `<p xml:id="subtitle{idx+1}" begin="{start}t" end="{end}t" [region] [style]>`:
  - 본문: `originalP` 자식들을 복사(같은 문서면 `cloneNode(true)`, 다른 문서면 `importNode(true)`). originalP가 없으면 `<span>text</span>`.
  - `originalP2 || text2`면 `<br/>` + `<span [style=style2]>`(originalP2 자식 복사, 없으면 text2) 추가 → **두 언어를 한 `<p>`에 `<br>`로 쌓는다**(region 충돌 방지, 같은 region에 stacked 표시).
- `XMLSerializer().serializeToString(xmlDoc)` 반환.
- 2번째 줄 "스타일링"은 번역 트랙 원래 style id(`_<targetLang>` 접미사, import된 `<style>`)를 span에 거는 것뿐이다. 별도 CSS는 없다.

---

## 6. SVT Play

[확인] 전부 콘텐츠 스크립트에서 돈다.
- `captionRequestPattern = /NEVER_MATCH_SVTPLAY/`, `useManualIntercept = true`, `initInjectScript()` = no-op(주입 없음 → 메시지/인터셉트 없음). 메시지 리스너 정적 블록 없음.
- 셀렉터: `playerSelector = "video"`, `captionContainerSelector = '[data-rt="subtitles-container"]'`, `captionWindowSelector = '[data-rt="subtitles-container"] > *'`, `captionBoxSelector = '[data-rt="subtitles-container"] span, [data-rt="subtitles-container"] p'`(오버라이드한 `listenCaptionHover`는 이 둘을 쓰지 않음).
- 흐름: `handleVideo` → `loadEventListener` → `listenUrl` + `listenPlayer`(base: `waitPlayer` → play/pause 추적 → `listenCaptionHover`(오버라이드) → `listenButton`(셀렉터 `""` → 무동작) → `listenKey`(`handleButtonKey` no-op)).
- `listenCaptionHover()`:
  1. 컨테이너가 나올 때까지 무한 대기.
  2. 오버레이 `<div>` 생성: `position:absolute;left:0;right:0;bottom:8%;text-align:center;z-index:9999;pointer-events:auto;`. `document.querySelector("video")?.parentElement`에 append하고, 그 부모가 `position: static`이면 `relative`로 바꾼다. 부모가 없으면 문서에 붙지 않는다(그래도 `this.overlay`에는 할당).
  3. `<style>` `[data-rt="subtitles-container"]{opacity:0!important;pointer-events:none!important;}`를 `document.head`에 추가(원래 자막은 숨기되 DOM에는 남겨서 관찰). 제거하는 코드 없음.
  4. 오버레이 mouseenter → `pause()`, mouseleave → `play()`.
  5. MutationObserver(`childList: true, subtree: false`) on 컨테이너: 추가된 노드 중 `(innerText || textContent).trim()`이 비어 있지 않은 **첫 노드**만 처리 → `lastText = text` → 오버레이를 비우고 `<div innerText=text>`를 넣은 뒤 `translateInPlace(el, text)` → 그 mutation 배치는 return.
- `translateInPlace(el, text)`: `mode = detectSubtitle`.
  - `sourcesinglesub`: 원문만 `createSubtitleEl(text)`.
  - 그 외: `isDual = mode === "dualsub"`. `cache.get(text)`가 있으면 바로 적용. 없으면 el을 비우고(번역 오는 동안 **빈 화면**) `fetchAndApply`.
  - `targetsinglesub`(그리고 그 밖의 값): 번역문만.
- `fetchAndApply(el, text, isDual)`: `translate({ text, sourceLang: setting.translateSource, targetLang: setting.translateTarget, reverseLang: setting.translateReverse }, setting)` — **확장 번역 엔진을 콘텐츠 스크립트에서 직접 호출**(`/src/translator/translateCaller.js`, background 메시지 경유 아님; 엔진 fallback 포함). 응답이 왔을 때 `lastText !== text`면 버린다. `translated = result?.targetText || text` → `cache.set(text, translated)`(무제한 Map) → `applyTranslation`. 예외는 `console.error("[SVT Translator]", e)`(el은 빈 채로 남음).
  - 관찰: `setting_default.js`에 `translateReverse` 키가 없다(있는 건 `translateReverseTarget`) → `reverseLang`은 항상 undefined. [확인]
  - 관찰: SVT는 `langExcludeList`와 `isSameLanguage` 검사를 하지 않는다. `guessVideoLang/guessSubtitleLang`은 `"sv"`를 반환하지만 쓰이지 않는다.
- `applyTranslation`: el을 비우고, dual이면 원문 → 번역 순서로 `createSubtitleEl`.
- `createSubtitleEl(text)`: `<p style="font-size:${round(tooltipFontSize*1.5)}px;margin:0.12em 0;text-align:center;display:block;"><span style="color:white;background:rgba(0,0,0,0.75);padding:0.08em 0.4em;border-radius:4px;display:inline-block;">text</span></p>` (`textContent`라서 XSS 안전).
- `handleUrlChange`: `pausedByExtension=false; lastText=""; overlay.innerHTML=""`.
- 관찰: 오버레이/옵저버는 페이지당 한 번만 붙는다(`isEventListenerLoaded`). SPA 이동으로 `<video>`나 컨테이너가 교체되면 예전 요소에 붙은 채로 남는다. `detectSubtitle`을 나중에 `"null"`로 바꿔도 옵저버는 계속 돈다(`handleVideo`가 early return만 함).
- 스텁: `getVideoId()→null`, `requestSubtitle()→null`, `parseSubtitle(sub)→sub`, `mergeSubtitles(sub1)→sub1`.

---

## 7. 자막에 영향을 주는 설정

| 키 | 기본값 | 탭 | 영향 |
|---|---|---|---|
| `detectSubtitle` | `"dualsub"` | main | `dualsub`/`targetsinglesub`/`sourcesinglesub`/`"null"`(i18n `Detect_Subtitle`, 옵션 라벨 `Dual_Subtitle`, `Target_Single_Subtitle`, `Source_Single_Subtitle`, `None`). `"null"`이면 `handleVideo` 중단 + `#mttstyleSubtitle` disabled (#256). YouTube: targetsinglesub일 때 트랙 선택/`tlang`; dual일 때만 병합. Netflix: targetsinglesub면 활성화 시 대상 언어 트랙 선택; dual일 때만 병합. SVT: 표시 모드. |
| `translateTarget` | `"en"` | main | 번역 대상(YouTube `tlang`/수동 트랙 언어, Netflix 트랙(`subtitleLangDict` 매핑), SVT 번역기). 사이트별 override(#262)가 반영된 값이 페이지로 전달된다. CSS `direction`(`getRtlDir`). |
| `translateSource` | `"auto"` | main | SVT 번역기 sourceLang만. |
| `langExcludeList` | `[]` | exclude | 원 트랙 언어가 제외 목록에 있으면 YouTube/Netflix는 번역 줄 생략(#136). SVT 미적용. |
| `subtitleButtonToggle` | `"true"` | remains | YouTube: `"false"`면 `activateCaption` 중단(인터셉트도 안 켜짐). YouTube 자막 버튼 클릭 / `KeyC`로 `aria-pressed` 값을 저장. |
| `mouseoverPauseSubtitle` | `"true"` | advanced | 자막 창(YouTube) / 오버레이(SVT) 마우스오버 시 일시정지. |
| `subtitleBackground` | `"true"` | graphic | `.ytp-caption-segment` 블러 배경 on/off (#187, #205). |
| `tooltipFontFamily` | `""` | graphic | YouTube 자막 font-family 앞에 prepend (#86). |
| `tooltipFontSize` | `"18"` | graphic | SVT 자막 크기 = ×1.5 px. |
| `translatorVendor` 등 번역 설정 | — | — | SVT만(translateCaller 경유). |
| (존재하지 않음) `translateReverse` | — | — | SVT가 읽지만 키가 없어서 undefined. |

---

## 8. 주석에 남은 엣지 케이스 / 우회 (이슈 번호 유지)
- #151: 최신 YouTube timedtext가 fetch로 바뀜 → BatchInterceptor(XHR+fetch) + `rawFetch` + `captionList?.filter` 방어 + overlap 기반 매칭 + 번역 seg 새 객체 생성.
- #90: ASR 롤링 자막 중복 → `mergeCaptionText`.
- #206: RTL 자막 → `wsWinStyleId: 2`(juJustifCode 1), LTR은 바이트 단위로 동일.
- #136: 제외 언어면 번역 줄 생략.
- #187/#205: 자막 배경과 끄기 옵션.
- #86: 사용자 폰트 prepend.
- #262: 사이트별 대상 언어 override가 자막에도 적용됨(structured clone으로 값 전달).
- #8: 자막을 선택 가능한 텍스트로(mousedown/contextmenu 전파 차단, `user-select: text`).
- #256: detectSubtitle=None.
- #345 / CLAUDE.md §4: 주입 CSS 스코프 원칙(자막 CSS는 현재 어긋나 있음, §4.8).
- 플레이어 프리즈 방지: 실패해도 반드시 원문으로 응답(`respondSourceOnly`, Netflix catch).
- `withDeadline` 5초: 번역 트랙 대기 상한.
- `waitRandom(300, 800)`(번역 트랙 요청 전), `waitRandom(4000, 5000)`(reload 전): 밴/레이트리밋 회피.
- 실패 파킹 8초 → 60초 escalation, 맵 최대 100(가장 오래된 것부터 축출). YouTube는 문서를 다시 로드하지 않으므로 맵이 무한히 커지는 걸 막기 위함.
- Netflix `importNode`(cross-doc appendChild 때문에 캐시 sub2 layout이 비던 문제), `finally` 트랙 복원, `waitUntil` timeout 인자 복구.
- **anti-bot (CLAUDE.md §5)**: YouTube timedtext는 브라우저 세션(pot 토큰) 밖에서 온 요청을 막는다(빈 200/429). 서버나 curl로는 재현이 안 되고, 반복 요청은 IP 레이트리밋을 부른다. 그래서 인터셉트 안에서 플레이어 URL을 **그대로**(토큰 포함) 다시 쓰고, 실패하면 파킹한다. `video.google.com/timedtext` 호스트 전환은 그 우회 시도다.

---

## 9. 관찰된 기존 버그 / dead code (수정하지 말고 기록만; 재작성에서 동작 유지 여부를 결정)
1. `Netflix.mergeSubtitles`의 `else if (!sub1Meta)` / `else if (!sub2Meta)`는 도달 불가.
2. `Netflix.isVideoUrl`이 async → `activateCaption`의 `!isVideoUrl(url)` 검사가 항상 false(차단 안 됨).
3. `Netflix.getVideoId()`가 `String(undefined)` = `"undefined"` → `waitUntil(() => getVideoId())`가 바로 통과하고, `sub["undefined"]` 키가 생길 수 있다.
4. `Netflix.extractVideoId`, `setPlayerCaption`, `setPlayerCaptionOff`, `guessSubtitleLang`은 사용되지 않는다. `BaseVideo.getTargetLangMeta`/`getPreferredSourceLang`은 Netflix만 쓴다.
5. `Netflix.requestTrack`의 비일관 sort comparator + 플레이어 배열 제자리 정렬, `bcp47.includes(lang)` 부분 매칭, `console.log(videoId)` 잔존.
6. Netflix region id 재명명 방식(인덱스 기반)과 p 참조(원래 id + 접미사)가 다르다. tick 값을 tickRate 변환 없이 비교한다. 캐시된 sub1 xmlDoc을 병합에서 변형한다.
7. YouTube `parseSubtitle`의 이전 이벤트 자르기 조건이 `newEvents.length > 2`(두 번째 이벤트는 대상 아님). `wpWinPositions[1]`/`wsWinStyles[1]` 미사용.
8. YouTube `guessVideoLang`: ASR 트랙이 없으면 `"en"` 폴백. 수동 트랙 URL 실패 시 `tlang`으로 폴백하지 않음. `isSubtitleRequestFailed` 전역 flip-flop.
9. `handleCaptionOnOff`가 document 전체 `KeyC`에 반응(입력 중에도), keydown 시점 `aria-pressed`가 stale할 수 있음. 저장하면 activateCaption 재실행.
10. 아무 설정이나 바뀌어도 YouTube/Netflix `activateCaption`이 재실행된다(자막 트랙 재설정 + 4–5초 후 reload).
11. `detectSubtitle`을 `"null"`로 바꿔도 이미 주입된 페이지 스크립트는 새 설정을 못 받는다(`handleVideo`가 resetInject 전에 return) → 인터셉트가 꺼지는 1분 동안은 예전 설정(dualsub)으로 계속 동작. SVT 옵저버도 계속 돈다.
12. 인터셉트는 마지막 activateCaption 후 약 1분이 지나면 꺼진다 → 그 뒤의 자막 요청은 단일 자막.
13. `injectScript`가 `error`를 처리하지 않음 → 실패 시 `handleVideo`가 영원히 대기.
14. `listenUrl`이 Navigation API에 의존(미지원 브라우저면 throw → `listenPlayer` 미실행).
15. postMessage 수신 측에 출처 검증 없음(`callMethod`로 임의 정적 메서드 호출 가능), `args`가 없으면 TypeError.
16. SVT: `translateReverse` 키 없음, 제외 언어/같은 언어 검사 없음, 숨김 `<style>`이 제거되지 않음, 캐시 무제한, SPA 교체 미대응.
17. 자막 CSS(`.caption-visual-line`, `.captions-text`, `.ytp-*`)가 모든 사이트에 스코프 없이 주입된다.
18. `public/manifest.firefox.json`의 `web_accessible_resources`에 `videoHandler.js`가 있는데 빌드 `ENTRIES`에는 없다(stale 참조, 자막과 직접 관련은 없음).
19. 프로덕션 빌드는 console을 제거한다(vite `dropConsole`, 예전 webpack terser `drop_console`) → `console.log` 기반 진단은 개발 빌드에서만 보인다.

---

## 10. 재작성 체크리스트

**구조 / 컨텍스트**
- [ ] 정적 클래스 + 상속 + `this` 디스패치 모델 유지(또는 같은 의미의 대체): `this.requestSubtitle`, `this.parseSubtitle`, `this.isSubtitleEmpty`, `this.guessSubtitleLang`, `this.getPreferredTargetLang` 등이 서브클래스 오버라이드를 타야 한다. 공유 상태(인터셉터 인스턴스, memo 캐시, `subtitleFailures` 객체, kill debounce 타이머)와 클래스별 상태(`interceptorLoaded`, `setting`, `isPaused`, `pausedByExtension`, `isEventListenerLoaded`)를 구분할 것.
- [ ] `subtitle.js`를 **별도 IIFE 엔트리**(`build/subtitle.js`, 파일명 고정)로 빌드하고 `web_accessible_resources`에 유지.
- [ ] 콘텐츠/페이지 컨텍스트 판별을 polyfill 없이 명시적으로 구현(현재는 polyfill throw → `browser` undefined로 판별). 판별이 뒤집히면 전체 모델이 깨진다.
- [ ] 주입: `<script id=filterSpecialText(url)>`(영문자·공백만), 중복 방지, `head`에 append한 뒤 src 설정, `load`에서 resolve. 그 뒤 `resetInjectScript` → 이어서 `callMethod activateCaption` 순서.
- [ ] postMessage 프로토콜 `{type:"resetInjectScript", setting}` / `{type:"callMethod", name, args}`, targetOrigin `"*"`, 리스너는 모듈 로드 시 동기 등록(`Youtube`, `YoutubeNoCookie`, `Netflix` 각각; site 매칭 + 페이지 컨텍스트에서만).
- [ ] structured clone 의미: 페이지 쪽 setting은 plain object(`save()` 없음), override 값은 그대로, `__overrides`는 빠짐. `Setting`에 clone할 수 없는 own 프로퍼티(함수 등)를 추가하면 postMessage가 DataCloneError로 실패한다.
- [ ] `checkVideo`가 최초 + **모든 설정 변경 시** 호출되고, `handleVideo`는 `detectSubtitle == "null"`이면 즉시 return.

**인터셉트**
- [ ] XHR + fetch 둘 다 인터셉트. 패턴 불일치면 손대지 않고 통과. 리스너 안에서 응답하지 않으면 원 요청 통과. async 리스너는 끝날 때까지 기다림.
- [ ] `@mswjs/interceptors`를 올린다면 `request.respondWith` → `controller.respondWith` 등 API 변화를 changelog로 확인. dispose → 재apply → 리스너 재등록이 되는지 검증.
- [ ] `rawFetch`: 인터셉터 적용 전에 캡처한 네이티브 fetch. 패턴 URL 재요청은 반드시 이것으로.
- [ ] YouTube는 manual intercept(activateCaption에서만), Netflix는 설정 수신 즉시 + activateCaption.
- [ ] kill debounce: 60초 trailing, 타이머는 클래스 간 공유, activateCaption마다 리셋 → 마지막 활성화 후 약 1분 뒤 `dispose` + `interceptorLoaded=false`.
- [ ] 응답 본문: YouTube `JSON.stringify(json3)`, Netflix 직렬화된 XML 문자열. 헤더 없는 `new Response`.

**캐시 / 실패**
- [ ] `requestSubtitleCached` 대체: in-flight 공유, reject 시 제거, resolve된 undefined도 캐시, TTL 5분(resolve 시점부터), 키 `(url, lang)`(누락 인자 = undefined), 2인자 delete가 실제로 지움, `this` 보존, 사이트 간 캐시 하나.
- [ ] `getYoutubeMetaDataCached` 대체: videoId 키, TTL 없음, `{}` 실패도 영구 캐시(현 동작).
- [ ] 실패 파킹: 키 `url|lang`, 첫 실패 8초, 2회 이상 60초, count는 성공 때만 리셋, 최대 100개(가장 오래된 `at` 축출, 전체 초기화 금지), mark 시 캐시 delete.
- [ ] `withDeadline(…, 5000)`: null로 resolve, 작업은 취소 안 함, timer clear.
- [ ] `waitRandom(300,800)`는 번역 트랙 요청 전에, `waitRandom(4000,5000)`는 reloadCaption 전에.
- [ ] `waitUntil`: 50ms 폴링, 기본 무한, timeout이 있으면 TimeoutError throw(Netflix requestTrack 2500ms는 catch).
- [ ] 실패 경로: 원 트랙 비었음 → mark + 통과; throw하고 sub1 없음 → mark + 통과; sub1 있음 → sub1로 응답; 번역 트랙 비었음 → mark(url, lang) + 원문만.

**YouTube**
- [ ] activateCaption 순서: toggle/URL 검사 → guessVideoLang → waitPlayerReady(readyState≥3) → kill debounce → intercept → `loadModule("captions")` → `setOption("captions","track",{languageCode, translationLanguage})` → 4–5초 → `setOption("captions","reload",true)`. 모든 `.html5-video-player`에 적용.
- [ ] `isVideoUrl`: `/watch`, `/shorts`, `/embed` 포함. videoId: `v` 쿼리 또는 path[2].
- [ ] 언어: ASR 첫 트랙 / targetsinglesub의 `isSameLanguage` 매칭 + `tlang` 객체 / `"en"` 폴백.
- [ ] 메타데이터 3단계(ytInitialPlayerResponse → youtubei player API → watch HTML 정규식).
- [ ] 번역 URL: 수동 트랙(`!kind && languageCode == lang` 정확 일치) `baseUrl + "&fmt=json3"`, 없으면 `tlang` set.
- [ ] fetch 2회 시도 + `isSubtitleRequestFailed` flip-flop + `video.google.com/timedtext` 호스트 치환.
- [ ] `parseSubtitle` 알고리즘(skip 조건, 겹침 병합 + `mergeCaptionText`, `"\n"` 이벤트, -2 자르기 `> 2`, RTL `wsWinStyleId:2`, `<font color>` → pens, 고정 템플릿) 바이트 단위 호환.
- [ ] `mergeSubtitles`: overlap 최대 매칭, 매번 새 seg `{utf8: "\n" + target}`, sub2는 수정 금지, sub1은 제자리 수정.
- [ ] 캐시된 raw 응답 객체를 절대 수정하지 않는다.
- [ ] 콘텐츠 쪽: caption hover pause/play, 선택 가능 처리(`.off()` 재바인딩), `KeyC`/버튼 클릭 → `subtitleButtonToggle` 저장.
- [ ] `#mttstyleSubtitle` CSS 내용과 disabled 조건, 설정 변경 시 갱신, destructor에서 제거.
- [ ] youtube-nocookie: 도메인 3개 static만 다르고, 자기 메시지 리스너를 등록.

**Netflix**
- [ ] 플레이어 획득 경로(session id 우선순위 watch > preview > 첫 번째), off 트랙 판별, `subtitleLangDict` 매핑.
- [ ] 활성화: waitPlayerReady(플레이어 + audioTrack) → kill/intercept → 3초 → (getVideoId) → 소스 언어(targetsinglesub=대상, 그 외=오디오) → 자막이 켜져 있으면 requestTrack.
- [ ] 인터셉트: rawFetch로 원 TTML → 파싱(캐시 `sub[videoId][currentLang]`) → dual 조건 → `requestSubtitleWithReset`(finally 복원) → merge → encode. 단일이면 원본 xml 그대로. 오류 시 xml이 있으면 원본.
- [ ] `requestTrack`: 캐시 우선, ASSISTIVE 우선 정렬, 이미지 자막·off 제외, `bcp47 === lang || includes(lang)`, `setTextTrack` 후 최대 2500ms 대기.
- [ ] TTML 파싱: clone 보존, region/style id에 `_lang` 접미사 규칙(region은 인덱스 기반), div 제거, tick 원값, 같은 start/end p 병합(text + 자식 노드), `getTextWithBr`.
- [ ] 병합: overlap 매칭, 세로/가로 swap 규칙, `importNode`로 region/style 복제, 한 `<p>` 안에 `<br>` + span2(style2)로 쌓기, `xml:id="subtitle{n}"`, `begin/end="{tick}t"`.

**SVT**
- [ ] 주입 없이 콘텐츠 스크립트에서 동작, 원 자막 opacity 0 + 오버레이(bottom 8%, z 9999), 첫 텍스트 노드만, 모드별 표시, `lastText` 경합 방지, 텍스트별 무제한 캐시, `translateCaller.translate` 직접 호출(인자 그대로), 폰트 ×1.5, 스타일 문자열, URL 변경 시 초기화.

**검증 (헤드리스로는 불가 — 실제 브라우저)**
- [ ] YouTube watch/shorts/embed/nocookie에서 dualsub/targetsinglesub/sourcesinglesub/None; ASR 영상(롤링 중복 없음), 수동 자막 영상, `<font color>` 자막, RTL 대상(ar/he).
- [ ] 번역 트랙 레이트리밋/빈 응답 때 원문 단일 자막으로 계속 재생되는지(프리즈 없음), 8초/60초 파킹.
- [ ] Netflix에서 원래 자막 트랙 복원, 세로 쓰기(일본어) + 가로 번역, ruby 보존.
- [ ] SVT 오버레이 표시 / 호버 일시정지.
- [ ] 1분 kill 이후 동작, 설정 변경 시 재활성화 동작이 현재와 같은지.
