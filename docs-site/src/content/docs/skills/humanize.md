---
title: humanize
description: 한국어 윤문 파이프라인을 간단히 시작하는 명령
---

> 출처: [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai), epoko77-ai, MIT License. 이 명령은 원본 프로젝트를 `nunch-skills` 번들의 `humanize-korean` 스킬로 동기화해 제공합니다.

`humanize-korean` 파이프라인을 간단히 호출하는 사용자 진입 명령입니다. 사용자가 경로를 지정하지 않으면 입력 점수의 `route_hint`가 `light`, `standard`, `heavy` 중 하나를 고르고, `--strict`는 `heavy`를 강제합니다.

## 사용 예

```text
/humanize 이 문장을 사람이 쓴 것처럼 자연스럽게 다듬어줘
/humanize 초안.md --strict
```

텍스트나 `.txt`·`.md` 파일을 입력으로 받습니다. 입력이 없으면 윤문할 텍스트를 요청하고 종료합니다.

실행 환경과 Python 요구 사항은 [`humanize-korean`](/skills/humanize-korean/)을 따릅니다.

## 옵션

- `장르: 칼럼|리포트|블로그|공적`
- `강도: 보수|기본|적극`
- `최소심각도: S1|S2|S3`
- `--strict`: 진단→겨냥 윤문→finalize 경로 강제

결과에는 윤문본, 변경률·등급, 카테고리별 before/after와 주요 변경이 포함됩니다. 등급이 낮으면 `humanize-redo`로 2차 윤문할 수 있습니다.

Source: [`plugins/nunch-skills/skills/humanize/SKILL.md`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/skills/humanize/SKILL.md)

License: [`plugins/nunch-skills/licenses/humanize-korean-LICENSE`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/licenses/humanize-korean-LICENSE)
