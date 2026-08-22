# Typed Event Schema

`.nunch` state를 만들거나 Resume하기 전에 읽습니다. `scripts/interview_state.py`와 validator가 이 계약의 executable source입니다.

## Canonical envelope

```json
{
  "schema_version": 1,
  "event_id": "evt:000000000001",
  "sequence": 1,
  "interview_id": "di:example",
  "round_id": "round:000",
  "occurred_at": "2026-08-21T00:00:00.000000Z",
  "type": "topology.confirmed",
  "actor": "user",
  "component_ids": ["cmp:surface"],
  "source_refs": ["claim:topology"],
  "payload": {},
  "previous_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "event_hash": "<sha256>"
}
```

Stable namespaces: `di`, `round`, `evt`, `intent`, `cmp`, `fact`, `claim`, `decision`, `q`, `ref`, `term`, `review`, `gate`.

## Canonicalization

- UTF-8, Unicode NFC
- object keys lexicographic, compact `,` and `:` separators, no insignificant whitespace
- schema controls null versus omitted fields
- ambiguity is a six-decimal string in `0.000000..1.000000`
- timestamp is RFC 3339 UTC with microseconds; ordering uses sequence only
- sequence starts at 1; `event_id = evt:<12-digit sequence>`
- actors: `user`, `assistant`, `tool`, `runtime`
- SHA-256 input is the entire canonical event except `event_hash`
- genesis `previous_hash` is 64 zeroes

## Event families

| Family | Types |
|---|---|
| lifecycle | `interview.started`, `interview.paused`, `interview.resumed`, `interview.cancelled` |
| intent | `intent.proposed`, `intent.confirmed`, `intent.reduction_requested`, `intent.reduction_approved` |
| topology | `topology.proposed`, `topology.confirmed`, `topology.component_added`, `topology.component_deferred`, `topology.component_split`, `topology.component_merged` |
| question | `question.asked`, `clarification.received`, `clarification.answered`, `question.reasked`, `question.rephrased` |
| answer | `answer.received`, `answer.refine_proposed`, `answer.refine_confirmed` |
| fact | `fact.confirmed`, `fact.disputed`, `fact.superseded` |
| scoring | `round.scored`, `ambiguity.floor_applied` |
| evidence | `evidence.code_recorded`, `evidence.research_recorded`, `evidence.data_recorded` |
| review | `review.lateral_completed`, `review.advisory_completed`, `review.finding_incorporated` |
| gate | `gate.closure_passed`, `gate.restate_confirmed`, `gate.execution_approved` |

Unknown types fail. The executable registry defines allowed actor, required payload, allowed prior states, next state, and projection behavior per type.

## Critical transitions

```text
question.asked
→ clarification.received
→ clarification.answered
→ question.reasked | question.rephrased
```

This path cannot score.

```text
question.asked
→ answer.received(decision_bearing=true)
→ answer.refine_proposed
→ answer.refine_confirmed
→ round.scored
```

Non-decision-bearing direct answers can move from `answer.received` to `round.scored`. Restate correction and Fact/Intent replacement are always decision-bearing.

Facts project as `confirmed`, `disputed`, `superseded`. Unresolved disputes block closure. Superseded facts remain audit evidence but are not active decisions.

## Snapshot

```json
{
  "snapshot_schema_version": 1,
  "through_sequence": 100,
  "through_event_hash": "<hash>",
  "projection_hash": "<hash>",
  "state": {}
}
```

Snapshots are caches. Hash mismatch discards/rebuilds the snapshot without modifying canonical events.

## Writes and recovery

Under an exclusive writer lock: read tail, recheck after lock, reject changed revision, validate, stage+fsync, append+fsync, release. Do not silently renumber a conflict.

JSON, sequence, hash, registry, transition, or partial-tail failure stops new writes. Preserve the original and ask before recovery. Round 101 is invalid.

## Validation layers

1. Event: schema, actor, payload, sequence, hash, transition, permission, cap.
2. Projection: snapshot equals replayed canonical state.
3. Artifact: generated Seed/plan preserve projected Intent, Topology, Facts, provenance, ambiguity, and gates.
