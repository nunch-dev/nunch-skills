# Runtime Contract

Trace, `.nunch` state, external capability, data가 필요한 경우에만 읽습니다.

## Trace

`--trace` 또는 동등한 요청은 항상 bounded read-only 사전 조사를 실행합니다. 자동 trace는 focused exploration만으로 reliable Round 0 topology를 만들기 어려운 complex Brownfield에서 실행합니다.

자동 trigger:

- component/ownership 경계가 불명확함
- 여러 module/data flow/integration에 걸칠 가능성
- 과거 설계 결정이 현재 판단에 중요함
- 사용자가 어디서 시작할지 모름

시작 전에 이유와 범위를 짧게 알리고 opt-out을 허용합니다. 관련 paths, symbols, entities, integrations, tests, change context만 prompt-safe summary로 남깁니다. Onboarding은 예시일 뿐 기능 정의가 아닙니다. Agent sessions, browser history, 로그인 계정, 프로젝트 밖 자료로 자동 확장하지 않습니다.

## State layout

```text
.nunch/interviews/<interview-id>/
├── meta.json
├── events.jsonl
├── index.json
├── summary.md
└── snapshots/
```

Canonical history는 `events.jsonl`입니다. Snapshot, index, summary, Seed, plan은 derived artifact입니다. 각 user-visible question, answer, clarification, Refine, topology/fact/score/review/gate change를 event로 저장합니다. Hidden reasoning, raw page, raw subagent output, unrelated tool log는 저장하지 않습니다.

`--no-state` 또는 “파일을 만들지 마”가 있으면 conversation-only mode를 사용하고 exact Resume를 보장하지 않습니다.

## Resume

1. 같은 project에 active interview가 있는지 찾습니다.
2. topic, completed rounds, effective ambiguity, next target, last checkpoint를 보여줍니다.
3. 이어서 진행, 요약 보기, 취소, 기존 state를 보존한 새 interview 중 하나를 한 질문으로 확인합니다.
4. meta, registry, sequence, hash chain, transition을 검증합니다.
5. latest matching snapshot과 이후 event를 replay합니다.
6. summary를 다시 만들고 필요한 과거 event만 선택적으로 읽습니다.

Compaction 자체는 원문 복원을 보장하지 않습니다. 디스크에는 모든 user-visible event를 보존하되 AI context에는 summary와 필요한 exact events만 넣습니다.

Corruption은 새 write를 중단합니다. 마지막 valid prefix와 corrupt tail을 보여주고 recover, new, cancel을 확인합니다. 승인 없이 원본을 truncate/delete하지 않습니다.

## Capability adaptation

필요한 시점에만 capability를 찾습니다.

| Capability | Preferred use | Fallback |
|---|---|---|
| code inspection | exact repo fact | focused local search |
| web research | current external fact | unresolved gap or user-provided source |
| subagent review | lateral/advisory independence | recorded main-session fallback |
| data read | scoped aggregate | continue without measurement |
| local state write | event checkpoint/Resume | conversation-only warning |

Discovery는 permission이 아닙니다. GJC/Ouroboros state를 canonical로 사용하지 않습니다. External tool은 evidence/advisory provider이며 local Intent, scoring, closure, Restate, Approval을 대체하지 않습니다. Missing integration을 자동 설치·업데이트·연결하지 않습니다.

## Data context

실제 measurement가 질문을 바꿀 때만 사용합니다. `.nunch`와 사용자가 제공한 local data는 in-scope read-only aggregate로 사용할 수 있습니다. 외부 connector, 로그인 source, 유료 API, 개인정보 data는 source별 명시적 허락이 필요합니다.

`[from-data]` evidence:

```text
metric, definition, value, denominator, period, observed_at,
source_scope, bounded query/method, quality caveats, permission event
```

Raw row보다 aggregate를 우선합니다. Metric definition, missing data, duplicates, timezone, test data 혼입을 확인합니다. Data는 질문 옆 판단 자료이며 답변이 아닙니다. 사용자가 먼저 결정하면 늦은 measurement로 자동 재개방하지 않습니다.

## Checkpoint timing

Confirmed user-visible event 직후 append합니다. Snapshot은 10 rounds, ambiguity milestone, topology change, closure, Restate, pause, approval에 만듭니다. Clarification이나 Refine 중간 상태도 exact Resume를 위해 event로 저장하지만 confirmed decision projection에는 들어가지 않습니다.
