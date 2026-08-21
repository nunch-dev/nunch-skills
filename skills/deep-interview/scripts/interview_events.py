from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, replace
from enum import StrEnum

from interview_canonical import JsonValue, calculate_hash
from interview_registry import RegistryValidationError, validate_registry

GENESIS_HASH = "0" * 64
AMBIGUITY_PATTERN = re.compile(r"^(?:0\.[0-9]{6}|1\.000000)$")
TIMESTAMP_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$")


class EventValidationError(ValueError):
    pass


class Actor(StrEnum):
    USER = "user"
    ASSISTANT = "assistant"
    TOOL = "tool"
    RUNTIME = "runtime"


class EventType(StrEnum):
    INTERVIEW_STARTED = "interview.started"
    INTERVIEW_PAUSED = "interview.paused"
    INTERVIEW_RESUMED = "interview.resumed"
    INTERVIEW_CANCELLED = "interview.cancelled"
    INTENT_PROPOSED = "intent.proposed"
    INTENT_CONFIRMED = "intent.confirmed"
    INTENT_REDUCTION_REQUESTED = "intent.reduction_requested"
    INTENT_REDUCTION_APPROVED = "intent.reduction_approved"
    TOPOLOGY_PROPOSED = "topology.proposed"
    TOPOLOGY_CONFIRMED = "topology.confirmed"
    TOPOLOGY_COMPONENT_ADDED = "topology.component_added"
    TOPOLOGY_COMPONENT_DEFERRED = "topology.component_deferred"
    TOPOLOGY_COMPONENT_SPLIT = "topology.component_split"
    TOPOLOGY_COMPONENT_MERGED = "topology.component_merged"
    QUESTION_ASKED = "question.asked"
    CLARIFICATION_RECEIVED = "clarification.received"
    CLARIFICATION_ANSWERED = "clarification.answered"
    QUESTION_REASKED = "question.reasked"
    QUESTION_REPHRASED = "question.rephrased"
    ANSWER_RECEIVED = "answer.received"
    ANSWER_REFINE_PROPOSED = "answer.refine_proposed"
    ANSWER_REFINE_CONFIRMED = "answer.refine_confirmed"
    FACT_CONFIRMED = "fact.confirmed"
    FACT_DISPUTED = "fact.disputed"
    FACT_SUPERSEDED = "fact.superseded"
    ROUND_SCORED = "round.scored"
    AMBIGUITY_FLOOR_APPLIED = "ambiguity.floor_applied"
    EVIDENCE_CODE_RECORDED = "evidence.code_recorded"
    EVIDENCE_RESEARCH_RECORDED = "evidence.research_recorded"
    EVIDENCE_DATA_RECORDED = "evidence.data_recorded"
    REVIEW_LATERAL_COMPLETED = "review.lateral_completed"
    REVIEW_ADVISORY_COMPLETED = "review.advisory_completed"
    REVIEW_FINDING_INCORPORATED = "review.finding_incorporated"
    GATE_CLOSURE_PASSED = "gate.closure_passed"
    GATE_RESTATE_CONFIRMED = "gate.restate_confirmed"
    GATE_EXECUTION_APPROVED = "gate.execution_approved"


@dataclass(frozen=True, slots=True)
class EventDraft:
    event_type: EventType
    actor: Actor
    round_number: int | None
    component_ids: tuple[str, ...]
    source_refs: tuple[str, ...]
    payload: Mapping[str, JsonValue]
    occurred_at: str
    expected_revision: int | None = None


@dataclass(frozen=True, slots=True)
class InterviewEvent:
    schema_version: int
    event_id: str
    sequence: int
    interview_id: str
    round_id: str
    occurred_at: str
    event_type: EventType
    actor: Actor
    component_ids: tuple[str, ...]
    source_refs: tuple[str, ...]
    payload: dict[str, JsonValue]
    previous_hash: str
    event_hash: str

    def without_hash(self) -> dict[str, JsonValue]:
        return {
            "actor": self.actor.value,
            "component_ids": list(self.component_ids),
            "event_id": self.event_id,
            "interview_id": self.interview_id,
            "occurred_at": self.occurred_at,
            "payload": self.payload,
            "previous_hash": self.previous_hash,
            "round_id": self.round_id,
            "schema_version": self.schema_version,
            "sequence": self.sequence,
            "source_refs": list(self.source_refs),
            "type": self.event_type.value,
        }

    def as_dict(self) -> dict[str, JsonValue]:
        value = self.without_hash()
        value["event_hash"] = self.event_hash
        return value


def build_event(
    draft: EventDraft,
    *,
    interview_id: str,
    sequence: int,
    previous_hash: str,
) -> InterviewEvent:
    validate_draft(draft)
    event = InterviewEvent(
        schema_version=1,
        event_id=f"evt:{sequence:012d}",
        sequence=sequence,
        interview_id=interview_id,
        round_id=f"round:{draft.round_number or 0:03d}",
        occurred_at=draft.occurred_at,
        event_type=draft.event_type,
        actor=draft.actor,
        component_ids=draft.component_ids,
        source_refs=draft.source_refs,
        payload=dict(draft.payload),
        previous_hash=previous_hash,
        event_hash="",
    )
    return replace(event, event_hash=calculate_hash(event.without_hash()))


def validate_draft(draft: EventDraft) -> None:
    try:
        validate_registry(draft.event_type.value, draft.actor.value, draft.payload)
    except RegistryValidationError as error:
        raise EventValidationError(str(error)) from error
    if not TIMESTAMP_PATTERN.fullmatch(draft.occurred_at):
        raise EventValidationError("occurred_at must be RFC3339 UTC with microseconds")
    if draft.round_number is not None and not 0 <= draft.round_number <= 100:
        raise EventValidationError("round number must be between 0 and 100")
    if draft.event_type is EventType.ROUND_SCORED:
        for key in ("raw_ambiguity", "effective_ambiguity"):
            value = draft.payload.get(key)
            if not isinstance(value, str) or not AMBIGUITY_PATTERN.fullmatch(value):
                raise EventValidationError(f"{key} must be a six-decimal string")
    if draft.event_type is EventType.EVIDENCE_DATA_RECORDED:
        required = {
            "metric",
            "definition",
            "value",
            "period",
            "observed_at",
            "source_scope",
            "method",
            "quality_caveats",
            "permission_event_id",
            "permission_scope",
        }
        missing = sorted(required.difference(draft.payload))
        if missing:
            raise EventValidationError(
                f"data evidence requires permission metadata: {', '.join(missing)}"
            )


def parse_event(raw: JsonValue) -> InterviewEvent:
    parsed = validate_json_value(raw)
    if not isinstance(parsed, dict):
        raise EventValidationError("event must be a JSON object")
    try:
        component_ids = parsed["component_ids"]
        source_refs = parsed["source_refs"]
        payload = parsed["payload"]
        if not isinstance(component_ids, list) or not all(
            isinstance(item, str) for item in component_ids
        ):
            raise EventValidationError("component_ids must be strings")
        if not isinstance(source_refs, list) or not all(
            isinstance(item, str) for item in source_refs
        ):
            raise EventValidationError("source_refs must be strings")
        if not isinstance(payload, dict) or not all(
            isinstance(key, str) for key in payload
        ):
            raise EventValidationError("payload must be an object")
        component_strings = [item for item in component_ids if isinstance(item, str)]
        source_strings = [item for item in source_refs if isinstance(item, str)]
        event = InterviewEvent(
            schema_version=required_int(parsed, "schema_version"),
            event_id=required_string(parsed, "event_id"),
            sequence=required_int(parsed, "sequence"),
            interview_id=required_string(parsed, "interview_id"),
            round_id=required_string(parsed, "round_id"),
            occurred_at=required_string(parsed, "occurred_at"),
            event_type=EventType(required_string(parsed, "type")),
            actor=Actor(required_string(parsed, "actor")),
            component_ids=tuple(component_strings),
            source_refs=tuple(source_strings),
            payload=dict(payload),
            previous_hash=required_string(parsed, "previous_hash"),
            event_hash=required_string(parsed, "event_hash"),
        )
    except (KeyError, TypeError, ValueError) as error:
        raise EventValidationError(f"invalid event envelope: {error}") from error
    return event


def validate_json_value(value: JsonValue) -> JsonValue:
    if value is None or isinstance(value, str | int | float | bool):
        return value
    if isinstance(value, list):
        return [validate_json_value(item) for item in value]
    if isinstance(value, dict):
        result: dict[str, JsonValue] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise EventValidationError("JSON object keys must be strings")
            result[key] = validate_json_value(item)
        return result
    raise EventValidationError("unsupported JSON value")


def required_string(value: dict[str, JsonValue], key: str) -> str:
    item = value.get(key)
    if not isinstance(item, str):
        raise EventValidationError(f"{key} must be a string")
    return item


def required_int(value: dict[str, JsonValue], key: str) -> int:
    item = value.get(key)
    if not isinstance(item, int) or isinstance(item, bool):
        raise EventValidationError(f"{key} must be an integer")
    return item


def validate_chain(
    events: list[InterviewEvent], interview_id: str | None = None
) -> None:
    previous_hash = GENESIS_HASH
    for sequence, event in enumerate(events, start=1):
        if event.schema_version != 1 or event.sequence != sequence:
            raise EventValidationError("event sequence or schema version is invalid")
        if event.event_id != f"evt:{sequence:012d}":
            raise EventValidationError("event_id does not match sequence")
        if interview_id is not None and event.interview_id != interview_id:
            raise EventValidationError("interview_id changed within event store")
        if event.previous_hash != previous_hash:
            raise EventValidationError("previous hash does not match chain")
        if calculate_hash(event.without_hash()) != event.event_hash:
            raise EventValidationError("event hash does not match canonical content")
        previous_hash = event.event_hash
