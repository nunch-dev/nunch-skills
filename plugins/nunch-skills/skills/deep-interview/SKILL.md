---
name: deep-interview
description: "모호하거나 재작업 비용이 큰 요청을 한 번에 한 질문씩 인터뷰해, 출처가 분명하고 실행 전 승인을 거친 Seed-equivalent 스펙으로 결정화합니다. 사용자가 deep interview, 인터뷰해줘, 질문하면서 정리해줘, 추측하지 마, 요구사항을 같이 정리하자고 하거나 복잡한 작업 전 요구사항 확정을 원할 때 사용하세요. 이미 명확한 저위험 변경, 단순 수정, 확정된 계획의 실행에는 사용하지 않습니다."
metadata:
  user-invocable: true
  argument-hint: "[--trace] [--no-state] [--quick|--standard|--deep] <idea or vague description>"
  original: "https://github.com/Yeachan-Heo/gajae-code/blob/main/packages/coding-agent/src/defaults/gjc/skills/deep-interview/SKILL.md"
---

# Deep Interview

막연한 요청을 곧바로 구현하지 않고, 사용자 판단을 보존하는 Socratic interview로 실행 가능한 Seed를 만듭니다. 코드·연구·데이터·보조 관점은 판단 자료일 뿐 답변자가 아닙니다.

## 불변 조건

- 사용자에게 보이는 질문은 한 번에 하나만 합니다.
- clarification은 답변이 아니며 절대 점수화하지 않습니다.
- 판단이 담긴 자유 답변은 Refine 확인 전까지 점수화하지 않습니다.
- 후속 답변이 기존 결정을 깨면 ambiguity가 다시 올라갈 수 있습니다.
- unresolved dispute 또는 미점수 active component가 있으면 closure를 차단합니다.
- “알아서 정해줘”를 Auto-answer로 처리하지 않습니다. 사용자의 우려나 부족한 판단 자료를 질문합니다.
- Restate와 별도의 명시적 실행 승인 전에는 제품 코드 수정, 실행 worker, commit, PR, 배포를 시작하지 않습니다.
- 인터뷰 상태 기록은 허용된 로컬 작업입니다. 기본 canonical history는 `.nunch/interviews/<interview-id>/events.jsonl`입니다.

## Phase 0. Suitability

상태를 만들기 전에 요청을 분류합니다.

- 목표·대상·성공 기준이 명확하고 중요한 판단이 없으며 저위험이면 `DIRECT_EXECUTE`로 종료합니다. threshold, Round 0, Seed를 만들지 않습니다.
- 사용자가 숨은 가정 검토나 인터뷰 지속을 명시하면 인터뷰를 계속합니다.
- 활성 인터뷰가 있으면 단순 요청으로 오인해 삭제하지 말고 Resume identity를 확인합니다.

## 모드

| Mode | Threshold | Strategy budget | Absolute cap |
|---|---:|---:|---:|
| `quick` | 20% | 5 | 100 |
| `standard` | 10% | 10 | 100 |
| `deep` | 5% | 20+ | 100 |

Budget은 “계속할까요?”를 묻는 시점이 아니라 질문 전략을 바꾸는 기준입니다. 일반 round는 실제 종료 조건까지 이어갑니다.

Suitability를 통과한 첫 응답의 첫 줄:

```text
Deep Interview threshold: <threshold>% (mode: <quick|standard|deep>)
```

## Phase 1. Initialize and Round 0

1. 아이디어, 명시된 제약, 비목표, 언어를 추출합니다.
2. `greenfield` 또는 `brownfield`로 분류합니다.
3. Brownfield는 focused read-only 탐색을 먼저 수행합니다. 관련 경계를 신뢰하기 어렵거나 `--trace`가 지정됐으면 [runtime-contract.md](references/runtime-contract.md)의 trace 규칙을 적용합니다.
4. 긴 입력은 의도·결정·제약·비목표·근거·미해결 gap을 보존한 prompt-safe summary로 줄입니다.
5. `--no-state`가 아니면 [event-schema.md](references/event-schema.md)를 읽고 `.nunch` interview를 초기화합니다.
6. Round 0에서 독립적으로 성공/실패할 수 있는 top-level component 1~6개와 Stable Intent Contract를 한 질문으로 확인합니다.

Intent category는 `artifact`, `surface`, `integration`, `constraint`입니다. 각 item은 stable ID를 가집니다. 이후 제거·의미 축소·대체는 별도 Intent Review와 사용자 승인이 필요하며, 그 승인은 실행 승인이 아닙니다.

```text
Round 0 | Topology and Intent | Ambiguity: not scored yet

제가 이해한 active/deferred component와 잠글 의도는 다음과 같습니다.
<components and intent IDs>

이 구조와 의도가 맞나요? 추가·제거·병합·분리·보류할 한 가지가 있나요?
```

## Phase 2. Interview loop

Round 1 전에 [interview-contract.md](references/interview-contract.md)를 읽습니다.

각 round:

1. active component별 Goal, Constraints, Success Criteria, Brownfield Context를 점수화합니다.
2. 가장 약한 component/dimension을 다음 target으로 고릅니다. 비슷한 sibling을 순환합니다.
3. 코드·연구·데이터로 확인 가능한 사실은 사용자가 재조사하게 하지 않습니다.
4. 사용자 판단을 요구하는 질문 하나를 제시합니다.
5. clarification이면 설명하고 같은 round의 질문을 다시 제시하거나 한 판단으로 재작성합니다.
6. 판단 포함 자유 답변이면 구조화한 Refine을 보여주고 누락 여부를 한 질문으로 확인합니다.
7. confirmed answer를 Established Facts와 비교하고 bidirectional ambiguity를 계산합니다.
8. raw, floor, effective ambiguity와 다음 target을 보고합니다.
9. confirmed event를 저장한 뒤 다음 round로 진행합니다.

Greenfield:

```text
ambiguity = 1 - (goal × 0.40 + constraints × 0.30 + criteria × 0.30)
```

Brownfield:

```text
ambiguity = 1 - (goal × 0.35 + constraints × 0.25 + criteria × 0.25 + context × 0.15)
```

여러 component는 가장 약한 sibling을 가리지 않는 보수적 집계를 사용합니다.

## Phase 3. Reviews and continuation

- agent-centered resolution이 3회 연속이면 다음 unresolved round를 직접 사용자 판단으로 라우팅합니다.
- 첫 50%, 25%, threshold 진입과 topology/architecture 변화, closure 직전에 Researcher·Contrarian·Simplifier panel을 실행합니다. 구조가 바뀌면 Architect를 추가합니다.
- 필요한 subagent capability가 없으면 main-session fallback을 기록하고 수행하지 않은 독립 검토를 가장하지 않습니다.
- Question advisory는 필요한 lane을 최대 3개 선택하지만 사용자 질문은 하나입니다. 사용자가 먼저 답하면 늦은 결과로 결정을 다시 열지 않습니다.
- hard cancellation은 즉시 중단합니다. 조기 진행은 Round 3 이후 현재 ambiguity와 gap을 보여주고 위험 수락을 확인합니다.
- Round 100은 `MAX_ROUND_EXIT`이며 PASSED가 아닙니다.

## Phase 4. Closure

`effective ambiguity <= threshold`는 closure audit 시작 조건입니다.

필수 통과 조건:

- 모든 active component의 Goal, Constraints, Success Criteria가 점수화됨
- unresolved disputed fact가 없음
- Stable Intent ID가 모두 보존되거나 승인된 reduction evidence가 있음
- acceptance criteria가 관찰 가능하고 yes/no 판정 가능함
- non-goals와 deferred scope가 명시됨
- decision-critical volatile evidence가 재확인됨
- `[from-user]`, `[from-code]`, `[from-research]`, `[from-data]`, `[assumption]` provenance가 정확함
- Lateral closure review의 high-severity gap이 해결됨

실패 항목 하나를 다음 질문으로 삼아 Phase 2로 돌아갑니다.

## Phase 5. Seed, Restate, Approval

Closure 통과 후 [spec-template.md](references/spec-template.md)를 읽고 `.nunch/plans/deep-interview-<slug>.md`에 Seed를 생성합니다. `.nunch` state가 활성화된 경우 Seed는 canonical event projection에서 생성합니다.

Restate gate:

```text
Restate gate

실행의 source of truth로 사용할 불변 방향은 다음과 같습니다.
<2-4 bullets>

이 방향이 맞나요? 맞다면 "맞아"라고 답해주세요. 다르면 수정할 한 가지를 말해주세요.
```

수정 답변은 길이와 관계없이 Refine하고, score·closure·Restate를 다시 수행합니다.

Restate 확인 후에만 Approval gate를 제시합니다.

```text
1. 계획을 더 다듬기
2. 실행 승인
3. 인터뷰 계속
4. 여기서 중단
```

`2. 실행 승인` 또는 동등하게 명확한 승인 전에는 구현하지 않습니다. 계획을 원하면 [plan-template.md](references/plan-template.md)를 읽고 필요할 때만 [plan-template-extended.md](references/plan-template-extended.md)를 추가로 읽습니다.

## Prompt-external validation

```bash
uv run scripts/validate_interview_output.py --input <output.md> --kind initial --mode standard
uv run scripts/validate_interview_output.py --input <spec.md> --kind spec --mode deep --require-passed
uv run scripts/interview_state.py validate --root <.nunch/interviews/id>
```

PASSED를 선언하기 전에 Markdown artifact와 canonical event projection을 모두 검증합니다.

## 최종 체크

- [ ] Suitability가 인터뷰 필요성을 먼저 판정했다.
- [ ] 질문은 한 번에 하나였다.
- [ ] Round 0 topology와 Stable Intent가 승인됐다.
- [ ] clarification을 점수화하지 않았다.
- [ ] decision-bearing free text가 Refine 확인을 거쳤다.
- [ ] bidirectional trigger와 blocker floor가 적용됐다.
- [ ] Auto-answer를 만들지 않았다.
- [ ] Assisted evidence가 사용자 결정을 대신하지 않았다.
- [ ] `.nunch` event chain과 projection이 유효하다.
- [ ] closure, Restate, Approval이 분리됐다.

## 출처

이 스킬은 [GJC deep-interview](https://github.com/Yeachan-Heo/gajae-code/tree/main/packages/coding-agent/src/defaults/gjc/skills/deep-interview)와 [Q00/ouroboros](https://github.com/Q00/ouroboros)의 현재 개념을 선택적으로 차용합니다. `.gjc` CLI, Ouroboros MCP lifecycle, plugin updater, execution bridge는 로컬 계약에 포함하지 않습니다.
