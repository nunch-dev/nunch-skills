# Deep Interview Seed: mail-priority-classification

## Metadata

- Mode: deep
- Interview ID: di:mail-priority-classification
- Event Sequence: 42
- Event Hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
- Threshold: 5%
- Rounds: 8
- Final Ambiguity: 4%
- Type: brownfield
- Generated: 2026-06-02T12:00:00+09:00
- Status: PASSED
- Spec Path: .nunch/plans/deep-interview-mail-priority-classification.md

## Clarity Breakdown

| Dimension | Score | Weight | Weighted | Gap |
|---|---:|---:|---:|---|
| Goal | 1.0 | 0.35 | 0.35 | Clear |
| Constraints | 0.95 | 0.25 | 0.2375 | Clear |
| Success Criteria | 0.95 | 0.25 | 0.2375 | Clear |
| Context | 1.0 | 0.15 | 0.15 | Clear |
| Total Clarity |  |  | 0.975 |  |
| Ambiguity |  |  | 4% |  |

## Topology

| Component ID | Status | Description | Coverage / Deferral Note |
|---|---|---|---|
| Classification | active | 중요한 메일을 판별한다. | covered |
| Mail List UX | active | 분류 결과를 메일 목록에서 보여준다. | covered |
| User Feedback | deferred | 사용자 교정 학습은 후속 작업이다. | [from-user] 이번 Seed에서는 제외 |

## Seed Contract

이 섹션은 실행자가 바꾸면 안 되는 source of truth입니다.

### Immutable Direction

- [from-user] 사용자는 중요한 메일을 놓치지 않도록 메일 목록에서 우선 확인할 수 있어야 한다.
- [from-code] 기존 메일 목록 훅과 필터 패턴을 확장하되 새 라우트를 만들지 않는다.
- [from-research] N/A

### Stable Intent Contract

| Intent ID | Category | Statement | Status | Reduction Evidence |
|---|---|---|---|---|
| intent:priority-surface | surface | 중요한 메일을 기존 목록에서 우선 노출한다. | active | N/A |
| intent:preserve-unread | constraint | 기존 unreadCount 동작을 보존한다. | active | N/A |

### Source Routing

| Claim | Source | Evidence |
|---|---|---|
| 중요한 메일을 우선 노출한다. | [from-user] | Round 4 사용자 답변 |
| 메일 목록 훅을 확장한다. | [from-code] | apps/web/src/features/mail 패턴 |

### Acceptance Criteria Tree

- AC-1: 사용자는 중요한 메일 섹션을 메일 목록에서 볼 수 있다.
  - AC-1.1: 중요 메일이 없으면 빈 상태가 보인다.
  - AC-1.2: 중요 메일이 있으면 최신순으로 노출된다.
- AC-2: 기존 읽지 않음 필터는 동일하게 동작한다.
  - AC-2.1: unreadCount 계산은 기존 기준과 일치한다.

### Unresolved Assumptions

| Assumption | Risk | User Disposition |
|---|---|---|
| N/A | N/A | removed |

## Goal

메일 사용자가 중요한 메일을 목록에서 우선 확인할 수 있게 한다.

## Constraints

- [from-user] 사용자 교정 학습은 이번 범위에서 제외한다.
- [from-code] 기존 메일 목록 흐름을 유지한다.

## Non-Goals

- [from-user] 새 AI 모델 학습은 하지 않는다.

## Acceptance Criteria

- [ ] AC-1: 중요한 메일 섹션이 메일 목록에 표시된다.
- [ ] AC-2: 기존 unreadCount는 변하지 않는다.

## Assumptions Exposed and Resolved

| Assumption | Challenge | Resolution |
|---|---|---|
| 중요도 기준은 별도 모델이 필요하다. | 규칙 기반으로 충분한가? | [from-user] 초기 버전은 규칙 기반으로 한다. |

## Decision and Refine Ledger

| Decision ID | Answer Event | Refine Confirmation | Result |
|---|---|---|---|
| decision:rules-first | evt:000000000020 | evt:000000000022 | 초기 버전은 규칙 기반으로 한다. |

Clarification events may appear in the transcript, but never in scored decisions.

## Technical Context

### Brownfield Evidence

- [from-code] apps/web/src/features/mail: 기존 메일 feature 경계

### Greenfield Decisions

- [from-user] N/A

## Ontology

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| Mail | core domain | id, subject, sender, unread | PrioritySignal을 가진다 |
| PrioritySignal | supporting | reason, score | Mail 분류에 사용된다 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|---:|---:|---:|---:|---:|---:|
| 1 | 2 | 2 | - | - | N/A |
| 8 | 2 | 0 | 0 | 2 | 100% |

## Closure Audit

- [x] All active components have goal, constraints, and acceptance criteria.
- [x] Acceptance criteria are observable and yes/no testable.
- [x] Deferred components and non-goals are explicit.
- [x] Ontology is stable enough for execution.
- [x] Factual claims use source routing tags.
- [x] Remaining assumptions are resolved or explicitly accepted.
- [x] Every decision-bearing free answer has a confirmed Refine event.
- [x] No clarification event was scored.
- [x] Stable Intent IDs are preserved or have approved reduction evidence.
- [x] Canonical event chain and artifact projection agree.

## Restate Gate

Current status: pending restatement.

Seed direction to restate to the user:

- 중요한 메일을 우선 노출한다.
- 기존 메일 목록 흐름을 유지한다.

Question: 이 방향이 맞나요? 맞다면 "맞아"라고 답해주세요. 다르면 수정할 한 가지를 말해주세요.

## Approval Gate

Current status: pending approval after restatement.

Available next steps:

1. 계획을 더 다듬기
2. 실행 승인
3. 인터뷰 계속
4. 중단

## Interview Transcript Summary

<details>
<summary>Rounds</summary>

### Round 0

- Q: 토폴로지 확인 질문
- A: Classification과 Mail List UX는 active, User Feedback은 deferred

### Round 1

- Target: Classification/Goal
- Q: 사용자가 무엇을 먼저 할 수 있어야 하나요?
- A: 중요한 메일을 우선 확인한다.
- Ambiguity: 62%

</details>

## Resume State

- Canonical Store: .nunch/interviews/di-mail-priority-classification/events.jsonl
- Snapshot: snapshots/round-008.json
- Next Target: closed
- Integrity: 42 events through evt:000000000042 validated
