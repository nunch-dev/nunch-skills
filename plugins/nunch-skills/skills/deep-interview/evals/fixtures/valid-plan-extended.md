# Deep Interview Plan: extended fixture

## Metadata

- Source Seed: .nunch/plans/deep-interview-example.md
- Interview ID: di:extended-fixture
- Source Event Hash: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
- Mode: standard
- Final Ambiguity: 5%
- Template Profile: C_EXTENDED
- Complexity Score: 3
- High Risk Flags: none
- Interaction Complexity Score: 3
- Complexity Decision: C_EXTENDED because interaction complexity raises the score to 3.
- Status: READY_FOR_APPROVAL
- Created: 2026-06-30T00:00:00+09:00
- Updated: 2026-06-30T00:00:00+09:00

## 컨텍스트

### 1. 원본 요구사항

- [from-user] Add complex interaction planning.

### 2. 인터뷰 요약 내용

- Drag and visual QA require extended planning.

### 3. 확정된 사실

| Claim | Source | Evidence |
|---|---|---|
| C profile is required | [from-user] | Round 11 |

### 4. 기타 agent 리뷰 내용 (optional)

- N/A

## Goal

### 1. 핵심 목표

Create a decision-complete extended plan.

### 2. 반드시 지켜야 하는 항목

- [from-user] Include evidence and rollback.

### 3. 하면 안되는 항목

- [from-user] Do not execute implementation from the plan.

### 4. Acceptance Criteria

- AC-1: Extended plan is ready for approval.

## 범위

### In Scope

- Extended plan document.

### Out of Scope

- Product implementation.

### Deferred

| Item | Reason | Revisit Trigger |
|---|---|---|
| None | N/A | N/A |

## Decision Log

| Decision | Alternatives Rejected | Reason | Source |
|---|---|---|---|
| Use extended profile | Balanced profile | Interaction complexity | [from-user] |

## Open Questions / Risks

| Question or Risk | Blocks Execution | Default if Unanswered | Impact |
|---|---|---|---|
| Visual QA can be flaky | no | Capture screenshot evidence | medium |

## 계획 실행 전략

### 1. 직렬 혹은 병렬 실행 여부

hybrid: T1 and T2 are serial because T2 verifies T1.

### 2. 병렬 실행 시 실행 순서

| Wave | Tasks | Can Run In Parallel | Must Finish Before |
|---|---|---|---|
| Wave 1 | T1 | no | T2 |
| Wave 2 | T2 | no | Final Verification |

### 3. 기본 의존성 요약

| Task | Depends On | Blocks | Shared Files/Surfaces |
|---|---|---|---|
| T1 | None | T2 | references/plan-template.md |
| T2 | T1 | Final Verification | scripts/validate_plan_output.py |

## TODOs

### TODO T1. Update extended template

- Status: [ ]
- Goal: Add extended-only fields.
- References:
  - plans/deep-interview-example.md
- Dependencies: none
- Implementation notes:
  - Keep C-only details in the extended template.
- Must Not:
  - Do not duplicate the full balanced template.
- Acceptance criteria:
  - [ ] Extended fields are present.
- QA 방법:
  - Happy path: Validate an extended fixture and expect success.
  - Failure path: Remove Evidence path and expect validation failure.
- Evidence path: /tmp/deep-interview-plan-validation.log
- Rollback trigger: validator cannot distinguish balanced and extended profiles.
- Reviewer notes:
  - Check that C-only fields are not required for balanced plans.
- 실패 시 대응:
  - Restore missing extended fields.

### TODO T2. Validate extended plan

- Status: [ ]
- Goal: Confirm dependency and dispatch consistency.
- References:
  - scripts/validate_plan_output.py
- Dependencies: T1
- Implementation notes:
  - Ensure every TODO is represented in matrix and dispatch summary.
- Must Not:
  - Do not accept unknown task IDs.
- Acceptance criteria:
  - [ ] Validator checks matrix and dispatch summary.
- QA 방법:
  - Happy path: Run validator with --profile extended and expect success.
  - Failure path: Remove T2 from Dispatch Summary and expect validation failure.
- Evidence path: /tmp/deep-interview-plan-validation.log
- Rollback trigger: validator accepts inconsistent task IDs.
- Reviewer notes:
  - Check first-column matrix IDs against TODO IDs.
- 실패 시 대응:
  - Fix the matrix or dispatch table.

## C Extension: Decision Log

| Decision | Alternatives Rejected | Reason | Source | Owner | Deadline | Mitigation | Rollback Trigger |
|---|---|---|---|---|---|---|---|
| Use extended profile | Balanced profile | Complexity score is 3 | [from-user] | Codex | N/A | Keep balanced file small | Validator rejects extended plan |

## C Extension: Open Questions / Risks

| Question or Risk | Blocks Execution | Default if Unanswered | Impact | Owner | Deadline | Mitigation | Rollback Trigger |
|---|---|---|---|---|---|---|---|
| Visual QA can be flaky | no | Capture screenshot evidence | medium | Codex | N/A | Store evidence path | QA evidence missing |

## 계획 의존성 매트릭스

| Task | Depends On | Blocks | Shared Files/Surfaces | Risk | Parallel Safe | Reason |
|---|---|---|---|---|---|---|
| T1 | None | T2 | references/plan-template-extended.md | medium | no | T2 validates T1 |
| T2 | T1 | Final QA | scripts/validate_plan_output.py | medium | no | Depends on T1 fields |

## Dispatch Summary

| Dispatch Unit | Related Tasks | Role | Scope | Inputs | Output | Verification |
|---|---|---|---|---|---|---|
| D1 | T1 | executor | Extended template | Seed spec | Template fields | Review template |
| D2 | T2 | qa | Validator | Extended fixture | Validation result | Run script |

## Rollback / Recovery

- Rollback strategy: Revert extended-only template and validator changes.
- Recovery trigger: Extended validator blocks valid balanced plans.
- State cleanup: Remove temporary validation logs.
- Data cleanup: N/A

## Final Verification

- [ ] Goal compliance: every AC is satisfied.
- [ ] Constraint compliance: every must-have is preserved.
- [ ] Non-goal compliance: excluded scope was not implemented.
- [ ] Integration check: dependent tasks work together.
- [ ] Real-surface QA: the validator was exercised.

## Approval Gate

Current status: pending approval.

이 계획은 아직 구현 승인이 아닙니다. 실행하려면 별도 구현 승인이 필요합니다.
