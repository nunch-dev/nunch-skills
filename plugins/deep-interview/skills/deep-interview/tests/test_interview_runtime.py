from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from interview_events import (
    Actor,
    EventDraft,
    EventType,
    EventValidationError,
    JsonValue,
)
from interview_store import (
    append_event,
    initialize_interview,
)

TIMESTAMP = "2026-08-21T00:00:00.000000Z"


def draft(
    event_type: EventType,
    *,
    actor: Actor,
    round_number: int | None,
    payload: dict[str, JsonValue],
) -> EventDraft:
    return EventDraft(
        event_type=event_type,
        actor=actor,
        round_number=round_number,
        component_ids=(),
        source_refs=(),
        payload=payload,
        occurred_at=TIMESTAMP,
    )


def initialized_root(tmp_path: Path) -> Path:
    root = tmp_path / ".nunch" / "interviews" / "di-test"
    initialize_interview(
        root=root,
        interview_id="di:test",
        mode="standard",
        project_root=tmp_path,
        occurred_at=TIMESTAMP,
    )
    return root


def test_round_scoring_fails_after_clarification_without_answer(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)
    append_event(
        root,
        draft(
            EventType.QUESTION_ASKED,
            actor=Actor.ASSISTANT,
            round_number=1,
            payload={"question_id": "q:001", "text": "Choose?", "dimension": "goal"},
        ),
    )
    append_event(
        root,
        draft(
            EventType.CLARIFICATION_RECEIVED,
            actor=Actor.USER,
            round_number=1,
            payload={"question_id": "q:001", "text": "What does that mean?"},
        ),
    )
    append_event(
        root,
        draft(
            EventType.CLARIFICATION_ANSWERED,
            actor=Actor.ASSISTANT,
            round_number=1,
            payload={"question_id": "q:001", "text": "Explanation"},
        ),
    )
    append_event(
        root,
        draft(
            EventType.QUESTION_REASKED,
            actor=Actor.ASSISTANT,
            round_number=1,
            payload={"question_id": "q:001", "text": "Choose?"},
        ),
    )

    # When / Then
    with pytest.raises(EventValidationError, match="answer"):
        append_event(
            root,
            draft(
                EventType.ROUND_SCORED,
                actor=Actor.RUNTIME,
                round_number=1,
                payload={
                    "raw_ambiguity": "0.500000",
                    "effective_ambiguity": "0.500000",
                },
            ),
        )


def test_decision_bearing_answer_requires_confirmed_refine(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)
    append_event(
        root,
        draft(
            EventType.QUESTION_ASKED,
            actor=Actor.ASSISTANT,
            round_number=1,
            payload={
                "question_id": "q:001",
                "text": "Choose?",
                "dimension": "constraints",
            },
        ),
    )
    answer = append_event(
        root,
        draft(
            EventType.ANSWER_RECEIVED,
            actor=Actor.USER,
            round_number=1,
            payload={
                "question_id": "q:001",
                "text": "Use A because B",
                "decision_bearing": True,
            },
        ),
    )

    # When / Then
    with pytest.raises(EventValidationError, match="Refine"):
        append_event(
            root,
            draft(
                EventType.ROUND_SCORED,
                actor=Actor.RUNTIME,
                round_number=1,
                payload={
                    "raw_ambiguity": "0.400000",
                    "effective_ambiguity": "0.400000",
                },
            ),
        )

    refine = append_event(
        root,
        draft(
            EventType.ANSWER_REFINE_PROPOSED,
            actor=Actor.ASSISTANT,
            round_number=1,
            payload={
                "answer_event_id": answer.event_id,
                "decision": "Use A",
                "reasoning": "B",
            },
        ),
    )
    append_event(
        root,
        draft(
            EventType.ANSWER_REFINE_CONFIRMED,
            actor=Actor.USER,
            round_number=1,
            payload={
                "answer_event_id": answer.event_id,
                "refine_event_id": refine.event_id,
                "confirmation": "yes",
            },
        ),
    )
    scored = append_event(
        root,
        draft(
            EventType.ROUND_SCORED,
            actor=Actor.RUNTIME,
            round_number=1,
            payload={"raw_ambiguity": "0.400000", "effective_ambiguity": "0.400000"},
        ),
    )
    assert scored.sequence == 6
