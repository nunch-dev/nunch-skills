# kaneo-skills

## 개요

자연어 작업을 적절한 Kaneo workspace와 project의 한국어 Todo 이슈로 등록합니다. 중복을 확인하고 독립적인 결과가 여러 개면 parent/subtask 구조를 제안합니다.

## 사용 시점

- “Kaneo에 등록해줘”, “이 작업 이슈로 만들어줘”처럼 실제 생성을 요청할 때
- 여러 작업을 project와 Todo 상태에 맞춰 구조화할 때

단순히 작업을 논의하거나 Kaneo를 조회하는 요청에는 생성 권한을 추론하지 않습니다.

## 자동 진행 조건

workspace와 project가 각각 하나로 명확하고, Todo column이 존재하며, 한 개의 독립 작업이고, 중복 후보가 없을 때만 추가 질문 없이 생성합니다. 하나라도 불명확하면 mutation 전에 질문 하나로 대상이나 구조를 확인합니다.

## 작성 규칙

- 제목과 설명은 구체적인 한국어로 작성합니다.
- 제공되지 않은 우선순위·마감일·담당자는 추측하지 않습니다.
- 생성 전 같은 project의 유사 이슈를 확인합니다.
- parent를 먼저 만들고 child를 Todo로 생성한 뒤 subtask relation을 연결합니다.

Kaneo MCP 연결이 필요합니다. 성공 응답을 받지 못한 항목을 생성됐다고 보고하지 않습니다.

Source: [`plugins/kaneo-skills/skills/kaneo-skills/SKILL.md`](../../plugins/kaneo-skills/skills/kaneo-skills/SKILL.md)
