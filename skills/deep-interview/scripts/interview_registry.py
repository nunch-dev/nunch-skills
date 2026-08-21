from __future__ import annotations

from collections.abc import KeysView
from typing import Protocol


class PayloadKeys(Protocol):
    def keys(self) -> KeysView[str]: ...


class RegistryValidationError(ValueError):
    pass


USER = frozenset({"user"})
ASSISTANT = frozenset({"assistant"})
TOOL = frozenset({"tool"})
RUNTIME = frozenset({"runtime"})
USER_RUNTIME = frozenset({"user", "runtime"})
USER_ASSISTANT = frozenset({"user", "assistant"})

EVENT_ACTORS: dict[str, frozenset[str]] = {
    "interview.started": RUNTIME,
    "interview.paused": USER_RUNTIME,
    "interview.resumed": USER_RUNTIME,
    "interview.cancelled": USER_RUNTIME,
    "intent.proposed": ASSISTANT,
    "intent.confirmed": USER,
    "intent.reduction_requested": USER_ASSISTANT,
    "intent.reduction_approved": USER,
    "topology.proposed": ASSISTANT,
    "topology.confirmed": USER,
    "topology.component_added": USER_ASSISTANT,
    "topology.component_deferred": USER_ASSISTANT,
    "topology.component_split": USER_ASSISTANT,
    "topology.component_merged": USER_ASSISTANT,
    "question.asked": ASSISTANT,
    "clarification.received": USER,
    "clarification.answered": ASSISTANT,
    "question.reasked": ASSISTANT,
    "question.rephrased": ASSISTANT,
    "answer.received": USER,
    "answer.refine_proposed": ASSISTANT,
    "answer.refine_confirmed": USER,
    "fact.confirmed": USER,
    "fact.disputed": USER,
    "fact.superseded": USER,
    "round.scored": RUNTIME,
    "ambiguity.floor_applied": RUNTIME,
    "evidence.code_recorded": TOOL,
    "evidence.research_recorded": TOOL,
    "evidence.data_recorded": TOOL,
    "review.lateral_completed": TOOL,
    "review.advisory_completed": TOOL,
    "review.finding_incorporated": ASSISTANT,
    "gate.closure_passed": RUNTIME,
    "gate.restate_confirmed": USER,
    "gate.execution_approved": USER,
}

REQUIRED_KEYS: dict[str, frozenset[str]] = {
    "interview.started": frozenset({"mode", "project_root"}),
    "intent.proposed": frozenset({"intent_id", "category", "statement"}),
    "intent.confirmed": frozenset({"intent_id"}),
    "intent.reduction_requested": frozenset({"intent_id", "reason"}),
    "intent.reduction_approved": frozenset({"intent_id"}),
    "question.asked": frozenset({"question_id", "text", "dimension"}),
    "clarification.received": frozenset({"question_id", "text"}),
    "clarification.answered": frozenset({"question_id", "text"}),
    "question.reasked": frozenset({"question_id", "text"}),
    "question.rephrased": frozenset({"question_id", "text"}),
    "answer.received": frozenset({"question_id", "text", "decision_bearing"}),
    "answer.refine_proposed": frozenset({"answer_event_id", "decision", "reasoning"}),
    "answer.refine_confirmed": frozenset(
        {"answer_event_id", "refine_event_id", "confirmation"}
    ),
    "fact.confirmed": frozenset({"fact_id"}),
    "fact.disputed": frozenset({"fact_id"}),
    "fact.superseded": frozenset({"fact_id"}),
    "round.scored": frozenset({"raw_ambiguity", "effective_ambiguity"}),
    "evidence.code_recorded": frozenset({"claim_id", "location", "summary"}),
    "evidence.research_recorded": frozenset({"claim_id", "source", "summary"}),
    "evidence.data_recorded": frozenset({"claim_id", "metric", "permission_event_id"}),
}


def validate_registry(event_type: str, actor: str, payload: PayloadKeys) -> None:
    allowed = EVENT_ACTORS.get(event_type)
    if allowed is None:
        raise RegistryValidationError(f"unknown event type: {event_type}")
    if actor not in allowed:
        raise RegistryValidationError(f"actor {actor} is not allowed for {event_type}")
    missing = sorted(
        REQUIRED_KEYS.get(event_type, frozenset()).difference(payload.keys())
    )
    if missing:
        raise RegistryValidationError(
            f"{event_type} missing payload keys: {', '.join(missing)}"
        )
