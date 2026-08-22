from __future__ import annotations

import fcntl
import json
import os
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from interview_canonical import JsonValue, calculate_hash, canonical_json
from interview_events import (
    GENESIS_HASH,
    Actor,
    EventDraft,
    EventType,
    EventValidationError,
    InterviewEvent,
    build_event,
    parse_event,
    validate_chain,
)
from interview_projection import InterviewProjection, apply_event, replay


@dataclass(frozen=True, slots=True)
class ResumeResult:
    projection: InterviewProjection
    event_count: int


@contextmanager
def writer_lock(root: Path) -> Iterator[None]:
    root.mkdir(parents=True, exist_ok=True)
    lock_path = root / ".writer.lock"
    with lock_path.open("a+", encoding="utf-8") as lock_file:
        fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def initialize_interview(
    *,
    root: Path,
    interview_id: str,
    mode: str,
    project_root: Path,
    occurred_at: str,
) -> InterviewEvent:
    if mode not in {"quick", "standard", "deep"}:
        raise EventValidationError("mode must be quick, standard, or deep")
    with writer_lock(root):
        events_path = root / "events.jsonl"
        if events_path.exists() and events_path.stat().st_size:
            raise EventValidationError("interview store already exists")
        (root / "snapshots").mkdir(exist_ok=True)
        meta: dict[str, JsonValue] = {
            "interview_id": interview_id,
            "mode": mode,
            "project_root": str(project_root.resolve()),
            "schema_version": 1,
        }
        atomic_write(root / "meta.json", canonical_json(meta) + "\n")
        event = build_event(
            EventDraft(
                event_type=EventType.INTERVIEW_STARTED,
                actor=Actor.RUNTIME,
                round_number=None,
                component_ids=(),
                source_refs=(),
                payload={"mode": mode, "project_root": str(project_root.resolve())},
                occurred_at=occurred_at,
            ),
            interview_id=interview_id,
            sequence=1,
            previous_hash=GENESIS_HASH,
        )
        append_line(events_path, canonical_json(event.as_dict()) + "\n")
        write_derived(root, [event])
        return event


def append_event(root: Path, draft: EventDraft) -> InterviewEvent:
    with writer_lock(root):
        events = load_events(root)
        if not events:
            raise EventValidationError("interview store is not initialized")
        if draft.expected_revision is not None and draft.expected_revision != len(
            events
        ):
            raise EventValidationError("revision conflict; event was not appended")
        projection = replay(events)
        event = build_event(
            draft,
            interview_id=events[0].interview_id,
            sequence=len(events) + 1,
            previous_hash=events[-1].event_hash,
        )
        apply_event(projection, event)
        append_line(root / "events.jsonl", canonical_json(event.as_dict()) + "\n")
        events.append(event)
        write_derived(root, events)
        if should_snapshot(event, projection):
            write_snapshot(root, projection)
        return event


def load_events(root: Path) -> list[InterviewEvent]:
    events_path = root / "events.jsonl"
    if not events_path.is_file():
        raise EventValidationError("events.jsonl does not exist")
    events: list[InterviewEvent] = []
    try:
        for line_number, line in enumerate(
            events_path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            if not line.strip():
                raise EventValidationError(
                    f"empty or partial event at line {line_number}"
                )
            events.append(parse_event(json.loads(line)))
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise EventValidationError(f"invalid event JSON: {error}") from error
    interview_id = events[0].interview_id if events else None
    validate_chain(events, interview_id)
    replay(events)
    return events


def validate_store(root: Path) -> ResumeResult:
    events = load_events(root)
    projection = replay(events)
    if not snapshot_is_valid(root, projection):
        write_snapshot(root, projection)
    return ResumeResult(projection=projection, event_count=len(events))


def resume_interview(root: Path) -> ResumeResult:
    result = validate_store(root)
    write_derived(root, load_events(root))
    return result


def should_snapshot(event: InterviewEvent, projection: InterviewProjection) -> bool:
    if (
        event.event_type is EventType.ROUND_SCORED
        and projection.scored_rounds % 10 == 0
    ):
        return True
    return event.event_type in {
        EventType.TOPOLOGY_CONFIRMED,
        EventType.INTERVIEW_PAUSED,
        EventType.GATE_CLOSURE_PASSED,
        EventType.GATE_RESTATE_CONFIRMED,
        EventType.GATE_EXECUTION_APPROVED,
    }


def write_snapshot(root: Path, projection: InterviewProjection) -> None:
    state = projection.as_dict()
    snapshot: dict[str, JsonValue] = {
        "projection_hash": calculate_hash(state),
        "snapshot_schema_version": 1,
        "state": state,
        "through_event_hash": projection.last_event_hash,
        "through_sequence": projection.last_sequence,
    }
    name = f"round-{projection.scored_rounds:03d}.json"
    atomic_write(root / "snapshots" / name, canonical_json(snapshot) + "\n")


def snapshot_is_valid(root: Path, projection: InterviewProjection) -> bool:
    snapshots = sorted((root / "snapshots").glob("*.json"))
    if not snapshots:
        return True
    try:
        raw = json.loads(snapshots[-1].read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        return False
    if not isinstance(raw, dict):
        return False
    state = raw.get("state")
    stored_hash = raw.get("projection_hash")
    if not isinstance(state, dict) or not isinstance(stored_hash, str):
        return False
    if calculate_hash(state) != stored_hash:
        return False
    through = raw.get("through_sequence")
    return through != projection.last_sequence or state == projection.as_dict()


def write_derived(root: Path, events: list[InterviewEvent]) -> None:
    projection = replay(events)
    index: dict[str, JsonValue] = {
        "event_count": len(events),
        "interview_id": projection.interview_id,
        "last_event_hash": projection.last_event_hash,
        "last_sequence": projection.last_sequence,
    }
    atomic_write(root / "index.json", canonical_json(index) + "\n")
    summary = (
        f"# Interview {projection.interview_id}\n\n"
        f"- Mode: {projection.mode}\n"
        f"- Completed rounds: {projection.scored_rounds}\n"
        f"- Effective ambiguity: {projection.effective_ambiguity or 'unscored'}\n"
        f"- Last sequence: {projection.last_sequence}\n"
    )
    atomic_write(root / "summary.md", summary)


def append_line(path: Path, content: str) -> None:
    with path.open("a", encoding="utf-8", newline="") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())


def atomic_write(path: Path, content: str) -> None:
    temp = path.with_suffix(path.suffix + ".tmp")
    with temp.open("w", encoding="utf-8", newline="") as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)
