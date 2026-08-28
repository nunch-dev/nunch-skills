---
name: kaneo-skills
description: 자연어 작업을 적절한 Kaneo workspace와 project의 구체적인 한국어 Todo 이슈로 등록하고, 중복을 확인하며 필요한 경우 parent/subtask로 구조화합니다. 사용자가 Kaneo에 등록·추가·이슈화를 명시적으로 요청할 때 사용하세요. 작업을 논의하거나 Kaneo를 조회만 하는 요청에는 사용하지 않습니다.
---

# Kaneo Skills

사용자가 제공한 작업을 최소한의 질문으로 Kaneo 이슈에 등록합니다. 등록 요청은 아래의 명확한 경로에 있는 mutation만 승인합니다. 대상·중복·구조가 모호한데 추측해서 생성해서는 안 됩니다.

## 우선순위와 자동 진행 조건

다음 조건을 모두 충족할 때만 preview나 추가 승인 없이 생성합니다.

- 접근 가능한 workspace가 정확히 하나입니다.
- 기존 project 중 의미상 명확한 대상이 정확히 하나입니다.
- 입력이 독립적으로 완료할 수 있는 결과 하나이며 subtask가 필요하지 않습니다.
- 같은 project에 가능성 있는 중복 이슈가 없습니다.
- 시작 column alias `Todo`, `To Do`, `할 일` 중 정확히 하나와 이름이 일치합니다.

**IF** 조건 하나라도 거짓이거나 확실하지 않으면 mutation 전에 멈추고 현재 모호성 하나만 해소하는 질문을 합니다. 서로 무관한 결정을 한 질문에 묶어서는 안 됩니다.

## Workflow

### 1. 인증과 destination 확인

1. Kaneo 도구로 현재 인증 상태와 접근 가능한 workspace를 조회합니다.
2. **IF** workspace가 0개이면 연결·권한 문제를 보고하고 중단합니다.
3. **IF** workspace가 여러 개이면 후보를 보여주고 하나를 선택하도록 요청합니다. 최근 사용이나 첫 번째 항목을 default로 선택해서는 안 됩니다.
4. 선택한 workspace의 archive되지 않은 project를 조회하고 이름·설명·목적을 작업과 의미상 비교합니다. 단순 keyword 일치만으로 결정하지 않습니다.
5. **IF** 기존 project 하나가 명확하면 사용합니다. 0개 또는 여러 개가 맞을 수 있으면 관련 후보를 보여주고 기존 project 선택 또는 새 project 생성 여부를 묻습니다.
6. **IF** 사용자가 새 project를 선택하면 Kaneo에 필요한 name·slug·icon 제안을 보여주고 확인받은 뒤 생성합니다.

### 2. 시작 column 결정

선택한 project의 column을 조회하고 Kaneo가 반환한 `position` 순서와 실제 `name`·`slug`·`isFinal`을 보존합니다.

1. Column `name`이 `Todo`, `To Do`, `할 일` 중 하나와 정확히 일치하는 항목을 찾습니다.
2. **IF** 일치 항목이 정확히 하나이면 그 column의 실제 `slug`를 parent와 모든 subtask의 status로 사용합니다.
3. **IF** 일치 항목이 0개이면 첫 번째 non-final column을 임의로 사용하지 않고 사용자에게 묻습니다.
4. **IF** 둘 이상이 일치하면 position이 빠른 항목을 임의로 고르지 않고 후보를 보여준 뒤 사용자에게 묻습니다.

표시 이름을 `todo` 같은 추정 slug로 변환해서는 안 됩니다. API가 반환한 실제 `slug`만 사용합니다.

### 3. 이슈 구조 작성

- 독립적으로 완료할 수 있는 outcome 하나만 issue 하나로 만듭니다.
- **IF** 입력에 여러 outcome·phase·owner·독립 검증 항목이 있으면 이해하기 쉬운 parent/subtask 구조를 제안하고 생성 전에 확인받습니다.
- Title은 관찰 가능한 작업이나 문제를 나타내는 간결한 한국어로 씁니다.
- Description은 사용자가 제공한 사실을 모두 보존하고 context·목표·필요한 세부사항을 구분합니다. 요구사항이나 acceptance criteria를 새로 만들지 않습니다.
- 한국어 초안에 명백한 번역투가 있고 `$humanize-korean`을 사용할 수 있으면 사실·숫자·날짜·이름·의도를 보존하는 범위에서만 적용합니다. 이미 자연스러우면 호출하지 않습니다.

### 4. 선택 필드 처리

- 사용자가 priority를 주면 그대로 사용합니다. 없으면 `no-priority`를 사용하며 priority만 물어보지 않습니다. Kaneo task 생성 payload에는 선택 결과를 `priority` 필드로 반드시 포함합니다.
- 사용자가 due date를 주면 그대로 사용합니다. 없으면 생략하며 due date만 물어보지 않습니다.
- 사용자가 assignee를 명시했을 때만 workspace member에서 찾습니다. 0명 또는 여러 명이 일치하면 질문하고, 명시하지 않았으면 미할당으로 둡니다.
- Parent와 모든 subtask에 2단계에서 선택한 실제 시작 column `slug`를 적용합니다.

### 5. 중복 검사

Project와 제안 구조가 정해진 뒤, mutation 전에 같은 project의 기존 task를 검색합니다.

- 제안 title과 입력의 구분되는 명사를 각각 검색합니다.
- 문구가 달라도 underlying problem이나 outcome이 같은 후보를 직접 확인합니다.
- **IF** 중복 가능성이 있는 후보가 하나라도 있으면 identifier·title·상태를 보여주고 새 이슈 생성, 기존 이슈 재사용, 제안 수정 중 하나를 선택하도록 요청합니다.
- 중복 가능성이 없다고 확인된 경우에만 자동으로 계속합니다.

### 6. 생성과 relation 연결

1. Parent가 있으면 parent를 먼저 생성합니다.
2. 각 child를 독립적인 시작 상태 task로 생성합니다.
3. Parent의 실제 task `id`를 `sourceTaskId`, child의 실제 task `id`를 `targetTaskId`, `subtask`를 `relationType`으로 보내 relation을 생성합니다.
4. 각 API 결과에서 성공 여부, task `id`와 `number`를 즉시 확인합니다. 응답에 완성된 identifier가 없으면 확인한 project `slug`와 반환된 `number`를 API 계약대로 결합한 `${project.slug}-${number}`만 identifier로 보고합니다.

**IF** 생성 또는 relation 호출 하나가 실패하면 그 지점에서 중단합니다. 같은 mutation을 추측한 payload로 재시도하거나 처음부터 다시 실행해서는 안 됩니다. 성공한 자산, 실패한 단계, 생성됐지만 relation이 없는 orphan candidate와 안전한 다음 행동을 정확히 보고합니다.

## 완료 조건과 보고

Kaneo API가 성공 결과를 반환하고 실제 task `id`·`number`를 확인한 issue만 생성됐다고 보고합니다. 완료 보고에는 다음을 포함합니다.

- workspace와 project
- 생성한 각 issue의 title과 Kaneo identifier
- 사용한 시작 column 이름과 실제 `slug`
- parent/subtask relation의 source와 target
- 적용한 priority·due date·assignee
- 생략한 priority·due date와 미할당 상태
- partial success이면 성공한 mutation, 실패 지점, 남은 orphan·relation 상태

## 경계 예시

### 자동 진행

- 입력: “로그인 오류 재현 작업을 Kaneo에 등록해줘.”
- 관찰: workspace 하나, 명확한 project 하나, `To Do` 일치 column 하나, 중복 없음, outcome 하나.
- 행동: 실제 `To Do` column의 `slug`로 issue 하나를 생성하고 identifier를 보고합니다.

### 질문이 필요한 경로

- 입력: “성능 개선 작업을 Kaneo에 등록해줘.”
- 관찰: `Backend`와 `Platform` project가 모두 의미상 맞을 수 있습니다.
- 행동: 두 후보의 이름과 설명을 보여주고 project 선택 하나만 묻습니다. 선택 전에는 issue를 만들지 않습니다.

### 부분 성공

- 입력: Parent와 child 두 개로 확정된 작업을 생성합니다.
- 관찰: Parent와 child 두 개 생성은 성공했지만 두 번째 `subtask` relation이 실패했습니다.
- 행동: 이미 생성된 identifier와 성공한 첫 relation, relation이 없는 child, 실패 응답을 보고하고 중단합니다. 같은 relation을 자동 재시도하지 않습니다.
