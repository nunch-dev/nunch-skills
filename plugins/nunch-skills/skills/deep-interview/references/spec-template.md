# Deep Interview Spec Template

아래 템플릿은 `/deep-interview`가 인터뷰를 마친 뒤 작성하는 Seed-equivalent 스펙 구조입니다.
스펙은 한국어로 작성하고, 파일명은 영어 kebab-case를 사용합니다.

```markdown
# Deep Interview Seed: {title}

## Metadata

- Mode: {quick|standard|deep}
- Interview ID: {di:stable-id}
- Event Sequence: {last canonical sequence}
- Event Hash: {last canonical event hash}
- Threshold: {threshold}%
- Rounds: {count}
- Final Ambiguity: {score}%
- Type: {greenfield|brownfield}
- Generated: {ISO-8601 timestamp}
- Status: {PASSED|BELOW_THRESHOLD_EARLY_EXIT|MAX_ROUND_EXIT}
- Spec Path: {.nunch/plans/deep-interview-<slug>.md}

Note: `.nunch/plans/`의 Seed는 canonical event projection에서 만든 로컬 작업 산출물입니다. 팀 검토나 장기 보존이 필요하면 사용자 확인 후 tracked 문서 위치로 옮깁니다.

## Clarity Breakdown

| Dimension | Score | Weight | Weighted | Gap |
|---|---:|---:|---:|---|
| Goal | {score} | {weight} | {weighted} | {gap} |
| Constraints | {score} | {weight} | {weighted} | {gap} |
| Success Criteria | {score} | {weight} | {weighted} | {gap} |
| Context | {score or N/A} | {weight or N/A} | {weighted or N/A} | {gap or N/A} |
| Total Clarity |  |  | {total} |  |
| Ambiguity |  |  | {ambiguity}% |  |

## Topology

| Component ID | Status | Description | Coverage / Deferral Note |
|---|---|---|---|
| {component} | {active|deferred} | {description} | {coverage note or deferral reason} |

## Seed Contract

이 섹션은 실행자가 바꾸면 안 되는 source of truth입니다. 구현 계획은 이 Seed를 해석할 수 있지만, 사용자 승인 없이 방향을 바꾸면 안 됩니다.

### Immutable Direction

- [from-user] {사용자가 확인한 최종 방향}
- [from-code] {brownfield라면 기존 코드에서 확인한 연결 지점}
- [from-research] {외부 문서나 링크에서 확인한 제약. 없으면 N/A}

### Stable Intent Contract

| Intent ID | Category | Statement | Status | Reduction Evidence |
|---|---|---|---|---|
| {intent:id} | {artifact|surface|integration|constraint} | {confirmed intent} | {active|reduced|replaced} | {event id or N/A} |

### Source Routing

| Claim | Source | Evidence |
|---|---|---|
| {claim} | [from-user] | {round/user answer summary} |
| {claim} | [from-code] | {file/path/symbol/pattern} |
| {claim} | [from-research] | {doc/link/reference} |
| {claim} | [from-data] | {metric definition, aggregate, period, permission event} |
| {claim} | [assumption] | {accepted risk and confirmation event} |

### Acceptance Criteria Tree

- AC-1: {top-level observable outcome}
  - AC-1.1: {component-level criterion}
  - AC-1.2: {component-level criterion}
- AC-2: {top-level observable outcome}
  - AC-2.1: {component-level criterion}

### Unresolved Assumptions

| Assumption | Risk | User Disposition |
|---|---|---|
| [assumption] {assumption if any} | {risk} | {accepted|needs interview|removed} |

## Goal

{모든 active component를 포함하는 명확한 목표 문장}

## Constraints

- [from-user] {constraint}
- [from-code] {constraint from existing system, if brownfield}
- [from-research] {constraint from external source, if any}

## Non-Goals

- [from-user] {non-goal}

## Acceptance Criteria

- [ ] AC-1: {testable criterion}
- [ ] AC-2: {testable criterion}

## Assumptions Exposed and Resolved

| Assumption | Challenge | Resolution |
|---|---|---|
| {assumption} | {question or challenge} | {decision} |

## Decision and Refine Ledger

| Decision ID | Answer Event | Refine Confirmation | Result |
|---|---|---|---|
| {decision:id} | {evt:id} | {evt:id} | {confirmed decision and reasoning} |

Clarification events may appear in the transcript, but never in scored decisions.

## Technical Context

### Brownfield Evidence

- [from-code] {file/path/symbol/pattern}: {why it matters}

### Greenfield Decisions

- [from-user] {decision}: {reason}

## Ontology

| Entity | Type | Fields | Relationships |
|---|---|---|---|
| {entity} | {core domain|supporting|external system} | {fields} | {relationships} |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|---:|---:|---:|---:|---:|---:|
| 1 | {count} | {count} | - | - | N/A |
| {n} | {count} | {new} | {changed} | {stable} | {ratio}% |

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

- {immutable direction bullet 1}
- {immutable direction bullet 2}

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

- Q: {topology question}
- A: {answer}

### Round 1

- Target: {component}/{dimension}
- Q: {question}
- A: {answer}
- Ambiguity: {score}%
- Event IDs: {question, answer, refine, score event ids}

</details>

## Resume State

- Canonical Store: {.nunch/interviews/<interview-id>/events.jsonl}
- Snapshot: {latest matching snapshot or N/A}
- Next Target: {component/dimension or closed}
- Integrity: {validated event count, sequence, and hash}
```
