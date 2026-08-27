# 언어와 파일명

문서 언어, 번역 위치, 파일명, 번호형 기록, rename의 공통 계약입니다.

## 언어 우선순위

1. 사용자가 지정한 언어
2. 프로젝트 문서가 일관되게 사용하는 기존 언어
3. 한국어

기본 언어 문서에는 locale suffix를 붙이지 않습니다. 기존 영어 프로젝트라면 `README.md`는 영어를 유지하고 한국어 번역을 `README-ko.md`로 둡니다. 관례가 없는 신규 프로젝트라면 `README.md`를 한국어로 작성하고 영어 번역을 `README-en.md`로 둡니다.

## 파일명 우선순위

아래에서 먼저 일치하는 규칙을 사용합니다.

1. 프로젝트의 기존 파일명·디렉터리 관례
2. 생태계 표준 파일명: `README.md`, `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE.md`
3. 생태계 표준 파일의 번역본: 확장자 앞에 locale suffix를 붙인 `README-ko.md` 형태
4. ADR·RFC·incident 같은 번호형 기록의 기존 식별 패턴
5. 그 밖의 신규 Markdown 문서: 소문자 영어 kebab-case

기존 번호 규칙이 없을 때만 `[문서타입]-[4자리 순번]-[영문 주제]-[YYYYMMDD].md`를 fallback으로 사용합니다. 예: `docs/adr/ADR-0001-starlight-20260826.md`. 번호 체계가 없는 일반 문서에는 번호를 도입하지 않습니다.

기존 한글 파일명은 오류로 판정하거나 영어로 자동 rename하지 않습니다. 프로젝트가 한글 파일명을 일관되게 사용하면 그 관례를 따릅니다. 관례가 없을 때 만드는 일반 문서만 영어 kebab-case를 기본값으로 사용합니다.

## 일반 문서의 번역

생태계 표준 파일이 아닌 문서는 locale suffix 대신 디렉터리로 언어를 구분합니다. 기존 구조가 없으면 `docs/<locale>/`을 fallback으로 사용하고, 번역 간 동일한 상대 파일명을 유지합니다.

```text
docs/
├── ko/getting-started.md
└── en/getting-started.md
```

Starlight에서는 이 fallback을 사용하지 않고 [문서 사이트](site-starlight.md)의 공식 i18n 규칙을 따릅니다.

## Rename

다음 중 하나일 때만 rename합니다.

- 사용자가 파일명 또는 명명 규칙 변경을 직접 요청했다.
- 영향받는 파일, 내부 링크, 사이드바, 관련 설정을 먼저 진단했고 사용자가 승인했다.

fallback 규칙을 맞추기 위한 기존 파일 rename은 하지 않습니다. rename할 때는 모든 참조를 함께 갱신하고 링크 검증과 문서 사이트 build를 통과해야 완료입니다.
