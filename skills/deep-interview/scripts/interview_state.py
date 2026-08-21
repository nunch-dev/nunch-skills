#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from interview_events import (
    Actor,
    EventDraft,
    EventType,
    EventValidationError,
    JsonValue,
    validate_json_value,
)
from interview_store import (
    append_event,
    initialize_interview,
    resume_interview,
    validate_store,
)


def timestamp_now() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def json_object(value: str) -> dict[str, JsonValue]:
    try:
        parsed = validate_json_value(json.loads(value))
    except json.JSONDecodeError as error:
        raise argparse.ArgumentTypeError(f"invalid JSON: {error}") from error
    if not isinstance(parsed, dict) or not all(isinstance(key, str) for key in parsed):
        raise argparse.ArgumentTypeError("payload must be a JSON object")
    return dict(parsed)


def csv_tuple(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(
        description="Manage canonical .nunch Deep Interview state"
    )
    commands = root.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init", help="create a new interview store")
    init.add_argument("--root", type=Path, required=True)
    init.add_argument("--id", required=True)
    init.add_argument(
        "--mode", choices=("quick", "standard", "deep"), default="standard"
    )
    init.add_argument("--project-root", type=Path, default=Path.cwd())
    init.add_argument("--at", default=None)

    append = commands.add_parser("append", help="append one validated event")
    append.add_argument("--root", type=Path, required=True)
    append.add_argument(
        "--type", required=True, choices=tuple(item.value for item in EventType)
    )
    append.add_argument(
        "--actor", required=True, choices=tuple(item.value for item in Actor)
    )
    append.add_argument("--round", type=int, default=None)
    append.add_argument("--payload", type=json_object, default={})
    append.add_argument("--components", type=csv_tuple, default=())
    append.add_argument("--sources", type=csv_tuple, default=())
    append.add_argument("--expected-revision", type=int, default=None)
    append.add_argument("--at", default=None)

    validate = commands.add_parser(
        "validate", help="validate events, projection, and snapshot"
    )
    validate.add_argument("--root", type=Path, required=True)

    resume = commands.add_parser("resume", help="validate and print resume context")
    resume.add_argument("--root", type=Path, required=True)
    return root


def render_result(command: str, root: Path) -> dict[str, JsonValue]:
    result = resume_interview(root) if command == "resume" else validate_store(root)
    projection = result.projection
    gates: list[JsonValue] = []
    gates.extend(sorted(projection.gates))
    return {
        "current_round": projection.current_round,
        "effective_ambiguity": projection.effective_ambiguity,
        "event_count": result.event_count,
        "gates": gates,
        "interview_id": projection.interview_id,
        "mode": projection.mode,
        "scored_rounds": projection.scored_rounds,
        "status": "valid",
    }


def run(arguments: argparse.Namespace) -> dict[str, JsonValue]:
    root: Path = arguments.root
    if arguments.command == "init":
        event = initialize_interview(
            root=root,
            interview_id=arguments.id,
            mode=arguments.mode,
            project_root=arguments.project_root,
            occurred_at=arguments.at or timestamp_now(),
        )
        return {
            "event_id": event.event_id,
            "interview_id": event.interview_id,
            "status": "initialized",
        }
    if arguments.command == "append":
        event = append_event(
            root,
            EventDraft(
                event_type=EventType(arguments.type),
                actor=Actor(arguments.actor),
                round_number=arguments.round,
                component_ids=arguments.components,
                source_refs=arguments.sources,
                payload=arguments.payload,
                occurred_at=arguments.at or timestamp_now(),
                expected_revision=arguments.expected_revision,
            ),
        )
        return {
            "event_hash": event.event_hash,
            "event_id": event.event_id,
            "sequence": event.sequence,
            "status": "appended",
        }
    return render_result(arguments.command, root)


def main() -> int:
    try:
        result = run(parser().parse_args())
    except EventValidationError as error:
        print(
            json.dumps(
                {"error": str(error), "status": "invalid"},
                ensure_ascii=False,
                sort_keys=True,
            )
        )
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
