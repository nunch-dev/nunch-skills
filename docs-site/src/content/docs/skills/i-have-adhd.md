---
title: i-have-adhd
description: ADHD 독자가 바로 행동할 수 있는 응답 형식을 유지하는 스킬
---

> 출처: [ayghri/i-have-adhd](https://github.com/ayghri/i-have-adhd), Ayoub G., MIT License. 현재 동기화 기준은 [`b42a45a`](https://github.com/ayghri/i-have-adhd/commit/b42a45a068e080294924bfba19a7a2e8944c48ff)입니다.

응답을 ADHD 독자가 바로 실행할 수 있는 형태로 바꾸는 지속형 출력 모드입니다. 단순히 짧게 쓰는 것이 아니라 시작 마찰, 작업 기억, 시간 감각과 진행 보상을 고려합니다.

## 사용

Claude Code에서는 `/i-have-adhd`, Codex에서는 `$i-have-adhd`로 명시적으로 활성화할 수 있습니다. Codex는 요청의 맥락이 이 출력 형식에 적합하면 스킬을 암묵적으로 호출할 수도 있습니다.

활성화 후 세션의 후속 응답에도 유지됩니다. “stop adhd mode” 또는 “normal mode”라고 말하면 종료됩니다.

## 항상 켜기

Claude Code에서 설치만으로 자동 활성화되지는 않습니다. 세션을 시작하거나 재개할 때 항상 적용하려면 `~/.claude/.i-have-adhd-always` 플래그 파일을 만듭니다. 파일을 삭제하면 다시 필요할 때만 켜지는 방식으로 돌아갑니다.

## 응답 원칙

- 첫 줄에 지금 할 수 있는 다음 행동을 둡니다.
- 여러 단계는 짧은 번호 목록으로 나눕니다.
- 매 turn 현재 단계와 완료 상태를 다시 보여줍니다.
- 모호한 기간 대신 구체적인 시간 범위를 사용합니다.
- 열린 항목이 있으면 2분 안에 할 수 있는 행동 하나로 끝냅니다.

안전 확인, 충분한 설명 요청, 실제 ambiguity와 harness 규칙은 형식보다 우선합니다.

Source: [`plugins/nunch-skills/skills/i-have-adhd/SKILL.md`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/skills/i-have-adhd/SKILL.md)

License: [`plugins/nunch-skills/licenses/i-have-adhd-LICENSE`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/licenses/i-have-adhd-LICENSE)
