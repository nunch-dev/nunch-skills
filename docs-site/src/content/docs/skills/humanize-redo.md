---
title: humanize-redo
description: 최근 한국어 윤문 결과를 지정한 범위와 강도로 다시 다듬는 명령
---

> 출처: [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai), epoko77-ai, MIT License. 이 명령은 원본 프로젝트를 `nunch-skills` 번들의 `humanize-korean` 스킬로 동기화해 제공합니다.

가장 최근 `humanize-korean` 결과를 기존 run ID에서 다시 다듬도록 설계된 후속 명령입니다. 현재 wrapper 지침은 잔존 finding과 지정 범위만 처리한다고 선언합니다.

## 사용 예

```text
/humanize-redo 번역투만 다시
/humanize-redo 두 번째 문단만, 강도 낮춰
/humanize-redo 이 변경 되돌려줘
```

새 글을 처음 윤문할 때는 `/humanize` 또는 `humanize-korean`을 사용합니다. 이 명령의 실행 환경과 Python 요구 사항은 [`humanize-korean`](/skills/humanize-korean/)을 따릅니다.

## wrapper가 선언한 지원 범위

- 특정 탐지 카테고리만 재윤문
- 지정 문단만 재윤문
- 보수·적극 강도 조정
- 특정 edit 롤백
- 지시가 없으면 잔존 finding 전체를 round 2로 처리

wrapper 지침상 이전 결과는 `final_prev.md`로 보존하고 새 결과는 `03_rewrite_v2.md`처럼 version을 분리합니다. 최대 round 3을 넘기면 사람 검토를 권고합니다.

## 현재 제약

현재 `humanize-redo` 지침은 `humanize-korean` v2.1에서 은퇴한 agent와 artifact 이름을 일부 참조합니다. v2.3 본체는 2차 윤문을 새 입력으로 받아 `heavy` 경로를 처음부터 실행하도록 정의하므로, 두 지침을 동기화하기 전에는 이 wrapper의 부분 재실행 경로를 검증된 동작으로 보지 않습니다. 당장은 `humanize-korean`에 "2차 윤문"을 요청하는 경로를 사용합니다.

Source: [`plugins/nunch-skills/skills/humanize-redo/SKILL.md`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/skills/humanize-redo/SKILL.md)

License: [`plugins/nunch-skills/licenses/humanize-korean-LICENSE`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/licenses/humanize-korean-LICENSE)
