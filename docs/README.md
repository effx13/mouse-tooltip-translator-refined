# 원본 확장 동작 명세

WXT + Svelte 5 + TypeScript로 재작성하기 전, 원본 확장(ttop32/MouseTooltipTranslator 기반)이 무엇을 어떻게 했는지 코드에서 정리한 문서다. 재작성의 기준과 회귀 체크리스트로 쓴다.

재작성에서 유지한 기능: 마우스오버/드래그 번역 툴팁, 입력창 번역, 페이지 번역, 설정 화면, PDF·이북 뷰어, 모든 번역 엔진, 복사 메뉴/단축키, 옴니박스.

재작성에서 뺀 기능: TTS/음성, 음성 인식, OCR, 이중 자막, 번역 기록·단어장·하이라이트·플래시카드, what's new 탭, 후원/리뷰 배너. 아래 문서의 해당 부분은 원본 동작 기록으로만 남는다.

| 문서 | 범위 |
|---|---|
| [content-script.md](content-script.md) | 마우스오버/드래그 번역, 툴팁 lifecycle, 단축키, 페이지 번역, Google Docs |
| [background-translation-tts.md](background-translation-tts.md) | background 메시지, 컨텍스트 메뉴/옴니박스/커맨드, 번역 엔진·파이프라인(TTS 부분은 제거됨) |
| [subtitles.md](subtitles.md) | 이중 자막 (제거됨) |
| [pdf-ebook-ocr.md](pdf-ebook-ocr.md) | PDF.js 뷰어, foliate 이북 리더 (OCR 부분은 제거됨) |
| [popup-settings-ui.md](popup-settings-ui.md) | 설정 화면, 설정 스키마, i18n (기록/단어장/플래시카드는 제거됨) |

현재 코드 구조와 작성 규칙은 저장소 루트의 `CLAUDE.md`를 본다.
