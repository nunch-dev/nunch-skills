# Deep Interview Plan Template

Deep Interview의 Seed-equivalent spec이 확정된 뒤, 별도 실행 계획 문서를 만들 때 사용합니다.
이 파일은 기본 A 균형형 양식과 A/C 판정 규칙만 담습니다. C 확장형으로 판정되면 `references/plan-template-extended.md`를 추가로 읽습니다.

## 목차

- 읽는 순서
- A/C 판정 규칙
- 기본 계획 템플릿
- READY_FOR_APPROVAL 기준

## 읽는 순서

1. 항상 이 파일을 먼저 읽습니다.
2. 아래 A/C 판정 규칙으로 `Template Profile`을 결정합니다.
3. `C_EXTENDED`이면 `references/plan-template-extended.md`를 추가로 읽고 C 전용 필드를 계획 문서에 포함합니다.
4. 계획 작성 후 `scripts/validate_plan_output.py --input <plan.md> --profile <balanced|extended> --require-ready`로 구조를 검증합니다.

## A/C 판정 규칙

기본은 `A_BALANCED`입니다. 다음 중 하나라도 만족하면 `C_EXTENDED`로 승격합니다.

- 일반 복잡도 점수 총합이 3점 이상입니다.
- 고위험 플래그가 1개 이상입니다.

### 일반 복잡도 점수

| Score | Condition |
|---:|---|
| 1 | 예상 TODO가 5개 이상 |
| 1 | 변경 대상 파일/모듈이 3개 이상 |
| 1 | 병렬 실행 가능한 독립 작업이 2개 이상 |
| 1 | 기존 public API, CLI, 사용자-facing UX 중 하나 변경 |
| 1 | 새 dependency, tool, framework, external service 추가 |
| 1 | rollback/recovery 전략 필요 |
| 1 | 별도 reviewer, QA agent, 또는 dispatch summary 필요 |
| 1 | 단순 클릭/입력 또는 단순 navigation 중심 UI |
| 2 | 상태ful form, scroll/viewport 의존, hover/focus/keyboard 접근성 |
| 3 | drag/drop, resize, gesture, realtime/async interaction, visual QA 핵심 UI |

### 고위험 플래그

- auth, security, session, permission 변경
- DB schema, migration, 데이터 변환
- 결제, 메일, 알림, 외부 API 연동
- 사용자 데이터 손실 또는 irreversible mutation 가능성
- 동시성, transaction, background job, queue 변경
- 배포, 인프라, secret, 환경변수 변경
- 대규모 cross-module refactor

## 기본 계획 템플릿

```markdown
# Deep Interview Plan: {title}

## Metadata

- Source Seed: {.nunch/plans/deep-interview-<slug>.md}
- Interview ID: {di:stable-id}
- Source Event Hash: {Seed projection event hash}
- Mode: {quick|standard|deep}
- Final Ambiguity: {score}%
- Template Profile: {A_BALANCED|C_EXTENDED}
- Complexity Score: {integer}
- High Risk Flags: {none|comma-separated flags}
- Interaction Complexity Score: {integer}
- Complexity Decision: {why A or C was selected}
- Status: {DRAFT|READY_FOR_APPROVAL|APPROVED|SUPERSEDED}
- Created: {ISO-8601 timestamp}
- Updated: {ISO-8601 timestamp}

## 컨텍스트

### 1. 원본 요구사항

- [from-user] {original request summary}

### 2. 인터뷰 요약 내용

- {round/component summary}
- {confirmed decision}
- {resolved ambiguity}

### 3. 확정된 사실

| Claim | Source | Evidence |
|---|---|---|
| {claim} | [from-user] | {round/user answer summary} |
| {claim} | [from-code] | {file/path/symbol/pattern} |
| {claim} | [from-research] | {doc/link/reference} |
| {claim} | [from-data] | {bounded aggregate and permission event} |
| {claim} | [assumption] | {accepted risk and confirmation event} |

### 4. 기타 agent 리뷰 내용 (optional)

- {reviewer}: {finding}

## Goal

### 1. 핵심 목표

{one clear goal covering every active component}

### 2. 반드시 지켜야 하는 항목

- [from-user] {constraint}
- [from-code] {system constraint}

### 3. 하면 안되는 항목

- [from-user] {non-goal}
- {scope boundary}

### 4. Acceptance Criteria

- AC-1: {observable outcome}
- AC-2: {observable outcome}

## 범위

### In Scope

- {included component/workstream}

### Out of Scope

- {excluded component/workstream}

### Deferred

| Item | Reason | Revisit Trigger |
|---|---|---|
| {deferred item} | {reason} | {condition} |

## Decision Log

| Decision | Alternatives Rejected | Reason | Source |
|---|---|---|---|
| {decision} | {rejected options} | {reason} | [from-user] |

## Open Questions / Risks

| Question or Risk | Blocks Execution | Default if Unanswered | Impact |
|---|---|---|---|
| {question or risk} | {yes|no} | {default or N/A} | {low|medium|high} |

## 계획 실행 전략

### 1. 직렬 혹은 병렬 실행 여부

{serial|parallel|hybrid}: {reason}

### 2. 병렬 실행 시 실행 순서

| Wave | Tasks | Can Run In Parallel | Must Finish Before |
|---|---|---|---|
| Wave 1 | {tasks} | {yes|no} | {dependency} |

### 3. 기본 의존성 요약

| Task | Depends On | Blocks | Shared Files/Surfaces |
|---|---|---|---|
| T1 | None | T2 | {paths/surfaces} |

## TODOs

### TODO T1. {task title}

- Status: [ ]
- Goal: {task-specific goal}
- References:
  - {seed section or source path}
  - {code path or document path}
- Dependencies: {none|T0|T1}
- Implementation notes:
  - {decision-complete instruction}
- Must Not:
  - {must-not-change boundary}
- Acceptance criteria:
  - [ ] {task-level observable criterion}
- QA 방법:
  - Happy path: {exact command/tool/surface and expected observable}
  - Failure path: {exact command/tool/surface and expected observable}
- 실패 시 대응:
  - {debug path}

## Final Verification

- [ ] Goal compliance: every AC is satisfied.
- [ ] Constraint compliance: every must-have is preserved.
- [ ] Non-goal compliance: excluded scope was not implemented.
- [ ] Integration check: dependent tasks work together.
- [ ] Real-surface QA: the user-facing or runtime surface was exercised.

## Approval Gate

Current status: pending approval.

이 계획은 아직 구현 승인이 아닙니다. 실행하려면 사용자가 이 계획을 기준으로 별도 실행 승인을 명확히 해야 합니다.
```

## READY_FOR_APPROVAL 기준

- 필수 섹션이 모두 존재합니다.
- `Template Profile`, `Complexity Score`, `High Risk Flags`, `Interaction Complexity Score`, `Complexity Decision`이 기록되어 있습니다.
- 모든 TODO에 `Goal`, `References`, `Dependencies`, `Implementation notes`, `Must Not`, `Acceptance criteria`, `QA 방법`, `실패 시 대응`이 있습니다.
- `Open Questions / Risks`에 execution blocker가 남아 있으면 `READY_FOR_APPROVAL`로 표시하지 않습니다.
- `Final Verification`이 Goal, Constraints, Non-goals를 모두 검증합니다.
- `Approval Gate`는 계획이 구현 승인이 아니며 별도 실행 승인이 필요하다고 명시합니다.
