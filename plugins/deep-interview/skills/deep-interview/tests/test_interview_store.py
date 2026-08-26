from __future__ import annotations

import json
import subprocess
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
    load_events,
    resume_interview,
    validate_store,
)

TIMESTAMP = "2026-08-21T00:00:00.000000Z"


def test_imports_store_on_windows_without_fcntl(tmp_path: Path) -> None:
    # Given
    code = f"""
import sys
import types
from pathlib import Path

scripts = {str(SCRIPTS)!r}
root = Path({str(tmp_path)!r}) / "store"
calls = []

msvcrt = types.ModuleType("msvcrt")
msvcrt.LK_LOCK = 1
msvcrt.LK_UNLCK = 0
msvcrt.locking = lambda file_descriptor, operation, size: calls.append(operation)
sys.modules["msvcrt"] = msvcrt
sys.modules["fcntl"] = None
sys.path.insert(0, scripts)
sys.platform = "win32"

from interview_store import writer_lock

with writer_lock(root):
    pass

print(calls)
"""

    # When
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        check=False,
        text=True,
    )

    # Then
    assert result.returncode == 0, result.stderr
    assert result.stdout == "[1, 0]\n"


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


def test_data_evidence_requires_permission_metadata(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)

    # When / Then
    with pytest.raises(EventValidationError, match="permission"):
        append_event(
            root,
            draft(
                EventType.EVIDENCE_DATA_RECORDED,
                actor=Actor.TOOL,
                round_number=None,
                payload={
                    "claim_id": "claim:data",
                    "metric": "round_count",
                    "definition": "scored rounds",
                    "value": "10",
                    "period": "all",
                    "observed_at": TIMESTAMP,
                    "source_scope": "external",
                    "method": "aggregate",
                    "quality_caveats": "none",
                },
            ),
        )


def test_validate_store_rejects_broken_hash_chain(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)
    events_path = root / "events.jsonl"
    lines = events_path.read_text(encoding="utf-8").splitlines()
    event = json.loads(lines[0])
    event["payload"]["mode"] = "deep"
    events_path.write_text(json.dumps(event) + "\n", encoding="utf-8")

    # When / Then
    with pytest.raises(EventValidationError, match="hash"):
        validate_store(root)


def test_round_101_is_rejected(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)

    # When / Then
    with pytest.raises(EventValidationError, match="100"):
        append_event(
            root,
            draft(
                EventType.QUESTION_ASKED,
                actor=Actor.ASSISTANT,
                round_number=101,
                payload={
                    "question_id": "q:101",
                    "text": "Too far",
                    "dimension": "goal",
                },
            ),
        )


def test_registry_rejects_actor_mismatch(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)

    # When / Then
    with pytest.raises(EventValidationError, match="actor user is not allowed"):
        append_event(
            root,
            draft(
                EventType.QUESTION_ASKED,
                actor=Actor.USER,
                round_number=1,
                payload={"question_id": "q:001", "text": "Choose", "dimension": "goal"},
            ),
        )


def test_snapshot_corruption_rebuilds_from_canonical_events(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)
    append_event(
        root,
        draft(
            EventType.TOPOLOGY_CONFIRMED,
            actor=Actor.USER,
            round_number=None,
            payload={},
        ),
    )
    snapshot_path = root / "snapshots" / "round-000.json"
    snapshot_path.write_text("{broken", encoding="utf-8")

    # When
    result = validate_store(root)

    # Then
    assert result.event_count == 2
    assert (
        json.loads(snapshot_path.read_text(encoding="utf-8"))["through_sequence"] == 2
    )


def test_resume_replays_100_rounds_from_canonical_events(tmp_path: Path) -> None:
    # Given
    root = initialized_root(tmp_path)
    for round_number in range(1, 101):
        question_id = f"q:{round_number:03d}"
        append_event(
            root,
            draft(
                EventType.QUESTION_ASKED,
                actor=Actor.ASSISTANT,
                round_number=round_number,
                payload={
                    "question_id": question_id,
                    "text": "Choose",
                    "dimension": "goal",
                },
            ),
        )
        append_event(
            root,
            draft(
                EventType.ANSWER_RECEIVED,
                actor=Actor.USER,
                round_number=round_number,
                payload={
                    "question_id": question_id,
                    "text": "Yes",
                    "decision_bearing": False,
                },
            ),
        )
        append_event(
            root,
            draft(
                EventType.ROUND_SCORED,
                actor=Actor.RUNTIME,
                round_number=round_number,
                payload={
                    "raw_ambiguity": "0.100000",
                    "effective_ambiguity": "0.100000",
                },
            ),
        )

    # When
    resumed = resume_interview(root)

    # Then
    assert resumed.projection.current_round == 100
    assert resumed.projection.scored_rounds == 100
    assert resumed.event_count == 301
    assert (root / "snapshots" / "round-100.json").is_file()
    assert len(load_events(root)) == 301
