---
title: kaneo-skills
description: 자연어 작업을 중복 없는 한국어 Kaneo 이슈로 등록하는 스킬
---

자연어 작업을 적절한 Kaneo workspace와 project의 구체적인 한국어 이슈로 등록합니다. 생성 전에 대상·시작 컬럼·중복을 확인하고, 독립적인 결과가 여러 개면 parent/subtask 구조를 사용합니다.

## 자동 진행 조건

다음 조건을 모두 만족할 때만 추가 질문 없이 생성합니다.

- 인증이 유효하고 workspace와 project가 각각 하나로 확정됩니다.
- project의 컬럼 이름 중 `Todo`, `To Do`, `할 일`과 정확히 일치하는 항목이 하나뿐입니다.
- 중복 후보가 없고 작업 구조가 명확합니다.

시작 컬럼을 찾으면 표시 이름을 임의로 slug로 변환하지 않고 API가 반환한 실제 slug를 사용합니다. 정확한 alias가 없거나 둘 이상이면 mutation 전에 사용자에게 시작 컬럼 하나를 선택해 달라고 요청합니다. 첫 번째 non-final 컬럼을 임의로 선택하지 않습니다.

## 작성과 부분 성공

- 제목과 설명은 구체적인 한국어로 작성합니다.
- 제공되지 않은 우선순위·마감일·담당자는 추측하지 않습니다. 우선순위가 없으면 task 생성 payload에 `priority: no-priority`를 명시합니다.
- 같은 project의 유사 이슈를 먼저 확인합니다.
- parent를 먼저 만들고 child를 시작 컬럼에 생성한 뒤 parent `id`를 `sourceTaskId`, child `id`를 `targetTaskId`, `subtask`를 `relationType`으로 relation을 연결합니다.
- issue 생성은 성공했지만 relation 연결이 실패하면 생성 사실을 숨기거나 무작정 재시도하지 않습니다. 생성된 ID, 실패 단계, 재시도 안전성, 다음 선택을 `partial success`로 보고합니다.

Kaneo MCP 연결이 필요합니다. 성공 응답을 받지 못한 항목을 생성됐다고 보고하지 않습니다.

Source: [`plugins/nunch-skills/skills/kaneo-skills/SKILL.md`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/skills/kaneo-skills/SKILL.md)
