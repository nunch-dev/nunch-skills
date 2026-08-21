from __future__ import annotations

from dataclasses import dataclass
from typing import assert_never

from interview_events import EventType, EventValidationError, InterviewEvent, JsonValue


@dataclass(frozen=True, slots=True)
class AnswerState:
    event_id: str
    decision_bearing: bool


class InterviewProjection:
    __slots__ = (
        "answers",
        "clarification_open",
        "current_round",
        "effective_ambiguity",
        "facts",
        "gates",
        "interview_id",
        "last_event_hash",
        "last_sequence",
        "mode",
        "questions",
        "refined_answers",
        "scored_rounds",
    )

    def __init__(self) -> None:
        self.interview_id = ""
        self.mode = "standard"
        self.current_round = 0
        self.scored_rounds = 0
        self.effective_ambiguity: str | None = None
        self.questions: dict[int, str] = {}
        self.answers: dict[int, AnswerState] = {}
        self.clarification_open: set[int] = set()
        self.refined_answers: set[str] = set()
        self.facts: dict[str, str] = {}
        self.gates: set[str] = set()
        self.last_sequence = 0
        self.last_event_hash = "0" * 64

    def as_dict(self) -> dict[str, JsonValue]:
        facts: dict[str, JsonValue] = dict(self.facts)
        gates: list[JsonValue] = []
        gates.extend(sorted(self.gates))
        return {
            "effective_ambiguity": self.effective_ambiguity,
            "facts": facts,
            "gates": gates,
            "interview_id": self.interview_id,
            "last_event_hash": self.last_event_hash,
            "last_sequence": self.last_sequence,
            "mode": self.mode,
            "current_round": self.current_round,
            "scored_rounds": self.scored_rounds,
        }


def text_payload(event: InterviewEvent, key: str) -> str:
    value = event.payload.get(key)
    if not isinstance(value, str) or not value:
        raise EventValidationError(f"{event.event_type.value} requires payload.{key}")
    return value


def bool_payload(event: InterviewEvent, key: str) -> bool:
    value = event.payload.get(key)
    if not isinstance(value, bool):
        raise EventValidationError(
            f"{event.event_type.value} requires boolean payload.{key}"
        )
    return value


def require_round(event: InterviewEvent) -> int:
    if event.round_id == "round:000":
        raise EventValidationError(f"{event.event_type.value} requires a round")
    try:
        round_number = int(event.round_id.removeprefix("round:"))
    except ValueError as error:
        raise EventValidationError("round_id is invalid") from error
    if not 1 <= round_number <= 100:
        raise EventValidationError("round number must be between 1 and 100")
    return round_number


def apply_event(state: InterviewProjection, event: InterviewEvent) -> None:
    event_type = event.event_type
    match event_type:
        case EventType.INTERVIEW_STARTED:
            if state.last_sequence:
                raise EventValidationError("interview.started must be the first event")
            state.interview_id = event.interview_id
            state.mode = text_payload(event, "mode")
        case (
            EventType.QUESTION_ASKED
            | EventType.QUESTION_REASKED
            | EventType.QUESTION_REPHRASED
        ):
            round_number = require_round(event)
            state.questions[round_number] = text_payload(event, "question_id")
            state.current_round = max(state.current_round, round_number)
        case EventType.CLARIFICATION_RECEIVED:
            round_number = require_round(event)
            require_question(state, event, round_number)
            state.clarification_open.add(round_number)
        case EventType.CLARIFICATION_ANSWERED:
            round_number = require_round(event)
            require_question(state, event, round_number)
            if round_number not in state.clarification_open:
                raise EventValidationError(
                    "clarification answer has no pending clarification"
                )
        case EventType.ANSWER_RECEIVED:
            round_number = require_round(event)
            require_question(state, event, round_number)
            state.answers[round_number] = AnswerState(
                event.event_id, bool_payload(event, "decision_bearing")
            )
            state.clarification_open.discard(round_number)
        case EventType.ANSWER_REFINE_PROPOSED:
            round_number = require_round(event)
            answer = require_answer(state, round_number)
            if text_payload(event, "answer_event_id") != answer.event_id:
                raise EventValidationError("Refine targets a different answer")
            _ = text_payload(event, "decision")
            _ = text_payload(event, "reasoning")
        case EventType.ANSWER_REFINE_CONFIRMED:
            round_number = require_round(event)
            answer = require_answer(state, round_number)
            if text_payload(event, "answer_event_id") != answer.event_id:
                raise EventValidationError(
                    "Refine confirmation targets a different answer"
                )
            _ = text_payload(event, "refine_event_id")
            _ = text_payload(event, "confirmation")
            state.refined_answers.add(answer.event_id)
        case EventType.ROUND_SCORED:
            score_round(state, event)
        case (
            EventType.FACT_CONFIRMED
            | EventType.FACT_DISPUTED
            | EventType.FACT_SUPERSEDED
        ):
            fact_id = text_payload(event, "fact_id")
            state.facts[fact_id] = event_type.value.removeprefix("fact.")
        case EventType.GATE_CLOSURE_PASSED:
            if "disputed" in state.facts.values():
                raise EventValidationError(
                    "closure cannot pass with unresolved disputed facts"
                )
            state.gates.add(event_type.value)
        case EventType.GATE_RESTATE_CONFIRMED | EventType.GATE_EXECUTION_APPROVED:
            state.gates.add(event_type.value)
        case (
            EventType.INTERVIEW_PAUSED
            | EventType.INTERVIEW_RESUMED
            | EventType.INTERVIEW_CANCELLED
            | EventType.INTENT_PROPOSED
            | EventType.INTENT_CONFIRMED
            | EventType.INTENT_REDUCTION_REQUESTED
            | EventType.INTENT_REDUCTION_APPROVED
            | EventType.TOPOLOGY_PROPOSED
            | EventType.TOPOLOGY_CONFIRMED
            | EventType.TOPOLOGY_COMPONENT_ADDED
            | EventType.TOPOLOGY_COMPONENT_DEFERRED
            | EventType.TOPOLOGY_COMPONENT_SPLIT
            | EventType.TOPOLOGY_COMPONENT_MERGED
            | EventType.AMBIGUITY_FLOOR_APPLIED
            | EventType.EVIDENCE_CODE_RECORDED
            | EventType.EVIDENCE_RESEARCH_RECORDED
            | EventType.EVIDENCE_DATA_RECORDED
            | EventType.REVIEW_LATERAL_COMPLETED
            | EventType.REVIEW_ADVISORY_COMPLETED
            | EventType.REVIEW_FINDING_INCORPORATED
        ):
            pass
        case unreachable:
            assert_never(unreachable)
    state.last_sequence = event.sequence
    state.last_event_hash = event.event_hash


def require_question(
    state: InterviewProjection, event: InterviewEvent, round_number: int
) -> None:
    expected = state.questions.get(round_number)
    if expected is None:
        raise EventValidationError("event requires a prior question")
    if text_payload(event, "question_id") != expected:
        raise EventValidationError("question_id does not match active question")


def require_answer(state: InterviewProjection, round_number: int) -> AnswerState:
    answer = state.answers.get(round_number)
    if answer is None:
        raise EventValidationError("event requires a substantive answer")
    return answer


def score_round(state: InterviewProjection, event: InterviewEvent) -> None:
    round_number = require_round(event)
    if round_number not in state.questions:
        raise EventValidationError("round cannot score without a question")
    answer = require_answer(state, round_number)
    if round_number in state.clarification_open:
        raise EventValidationError("clarification cannot be scored as an answer")
    if answer.decision_bearing and answer.event_id not in state.refined_answers:
        raise EventValidationError("decision-bearing answer requires confirmed Refine")
    if round_number <= state.scored_rounds:
        raise EventValidationError("round was already scored")
    if round_number != state.scored_rounds + 1:
        raise EventValidationError("rounds must score in order")
    state.scored_rounds = round_number
    state.current_round = max(state.current_round, round_number)
    state.effective_ambiguity = text_payload(event, "effective_ambiguity")


def replay(events: list[InterviewEvent]) -> InterviewProjection:
    state = InterviewProjection()
    for event in events:
        apply_event(state, event)
    return state
