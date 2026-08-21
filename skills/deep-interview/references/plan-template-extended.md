# Deep Interview Extended Plan Template

`plan-template.md`의 A/C 판정 결과가 `C_EXTENDED`일 때만 이 파일을 추가로 읽습니다.
이 파일은 C 확장형에서 요구되는 고정밀 필드와 일관성 규칙만 담습니다.

## C 확장형 추가 요구사항

`C_EXTENDED` 계획 문서는 기본 템플릿에 더해 아래 항목을 포함해야 합니다.

- `Decision Log`에 owner, deadline, mitigation, rollback trigger를 추가합니다.
- `Open Questions / Risks`에 owner, deadline, mitigation, rollback trigger를 추가합니다.
- `계획 의존성 매트릭스`를 상세 테이블로 둡니다.
- `Dispatch Summary`를 TODO 또는 wave와 연결합니다.
- 각 TODO에 `Evidence path`, `Rollback trigger`, `Reviewer notes`를 추가합니다.
- `Rollback / Recovery` 섹션을 둡니다.

## C 확장 블록

아래 블록을 기본 계획 템플릿의 해당 위치에 추가합니다.

```markdown
## C Extension: Decision Log

| Decision | Alternatives Rejected | Reason | Source | Owner | Deadline | Mitigation | Rollback Trigger |
|---|---|---|---|---|---|---|---|
| {decision} | {rejected options} | {reason} | [from-user] | {owner} | {date or N/A} | {mitigation} | {rollback trigger or N/A} |

## C Extension: Open Questions / Risks

| Question or Risk | Blocks Execution | Default if Unanswered | Impact | Owner | Deadline | Mitigation | Rollback Trigger |
|---|---|---|---|---|---|---|---|
| {question or risk} | {yes|no} | {default or N/A} | {low|medium|high} | {owner} | {date or N/A} | {mitigation} | {rollback trigger or N/A} |

## 계획 의존성 매트릭스

| Task | Depends On | Blocks | Shared Files/Surfaces | Risk | Parallel Safe | Reason |
|---|---|---|---|---|---|---|
| T1 | None | T2 | {paths/surfaces} | {low|medium|high} | {yes|no} | {reason} |
| T2 | T1 | Final QA | {paths/surfaces} | {low|medium|high} | {yes|no} | {reason} |

## Dispatch Summary

| Dispatch Unit | Related Tasks | Role | Scope | Inputs | Output | Verification |
|---|---|---|---|---|---|---|
| D1 | T1 | {executor/reviewer/qa} | {scope} | {required context} | {deliverable} | {QA command or manual surface} |

## Rollback / Recovery

- Rollback strategy: {how to revert or disable}
- Recovery trigger: {what failure requires rollback}
- State cleanup: {files/processes/data to clean up}
- Data cleanup: {test data, migration residue, cache, queue, external resource cleanup}

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
- Evidence path: {where output/screenshot/log/result should be recorded}
- Rollback trigger: {condition that requires rollback or replan}
- Reviewer notes:
  - {specific review focus}
- 실패 시 대응:
  - {debug path}
  - {rollback or replan trigger}
```

## C 확장 검증 규칙

- `Template Profile`은 `C_EXTENDED`여야 합니다.
- 모든 TODO ID는 `계획 의존성 매트릭스`에 있어야 합니다.
- 모든 TODO ID는 `Dispatch Summary`의 `Related Tasks`에 있어야 합니다.
- `Dispatch Summary`에 없는 독립 실행 작업은 계획에 남기지 않습니다.
- `계획 의존성 매트릭스`에 있는 task ID가 실제 TODO에 없으면 실패입니다.
- `Open Questions / Risks`에 `Blocks Execution = yes`가 남아 있으면 `READY_FOR_APPROVAL`이 될 수 없습니다.
- 모든 TODO에는 `Evidence path`, `Rollback trigger`, `Reviewer notes`가 있어야 합니다.
- `Rollback / Recovery`가 없으면 C 확장 계획으로 볼 수 없습니다.
