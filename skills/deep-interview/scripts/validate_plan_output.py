#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

BALANCED_HEADINGS = [
    "Metadata",
    "컨텍스트",
    "Goal",
    "범위",
    "Decision Log",
    "Open Questions / Risks",
    "계획 실행 전략",
    "TODOs",
    "Final Verification",
    "Approval Gate",
]

EXTENDED_HEADINGS = [
    "계획 의존성 매트릭스",
    "Dispatch Summary",
    "Rollback / Recovery",
]

METADATA_FIELDS = [
    "Source Seed",
    "Interview ID",
    "Source Event Hash",
    "Mode",
    "Final Ambiguity",
    "Template Profile",
    "Complexity Score",
    "High Risk Flags",
    "Interaction Complexity Score",
    "Complexity Decision",
    "Status",
]

TODO_FIELDS = [
    "Status",
    "Goal",
    "References",
    "Dependencies",
    "Implementation notes",
    "Must Not",
    "Acceptance criteria",
    "QA 방법",
    "실패 시 대응",
]

EXTENDED_TODO_FIELDS = [
    "Evidence path",
    "Rollback trigger",
    "Reviewer notes",
]


def has_heading(text: str, level: int, heading: str) -> bool:
    marks = "#" * level
    return re.search(rf"(?m)^{marks}\s+{re.escape(heading)}\s*$", text) is not None


def section(text: str, heading: str) -> str:
    match = re.search(
        rf"(?ms)^##\s+{re.escape(heading)}\s*$\n(.*?)(?=^##\s+|\Z)",
        text,
    )
    return match.group(1) if match else ""


def parse_text_line(text: str, label: str) -> str | None:
    match = re.search(rf"(?mi)^-\s*{re.escape(label)}:\s*(.+?)\s*$", text)
    return match.group(1).strip() if match else None


def todo_sections(text: str) -> dict[str, str]:
    matches = re.finditer(
        r"(?ms)^###\s+TODO\s+(T\d+)\.\s+.*?\n(.*?)(?=^###\s+TODO\s+T\d+\.|^##\s+|\Z)",
        text,
    )
    return {match.group(1): match.group(2) for match in matches}


def has_field(block: str, field: str) -> bool:
    return re.search(rf"(?mi)^-\s*{re.escape(field)}\s*:", block) is not None


def has_blocker(open_questions: str) -> bool:
    for line in open_questions.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|") or "---" in stripped:
            continue
        cells = [cell.strip().lower() for cell in stripped.strip("|").split("|")]
        if len(cells) < 2 or cells[0] in {"question or risk", "question", "risk"}:
            continue
        if cells[1] in {"yes", "true", "y", "예", "차단", "blocks"}:
            return True
    return False


def first_column_task_ids(table_section: str) -> set[str]:
    ids: set[str] = set()
    for line in table_section.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|") or "---" in stripped:
            continue
        cells = [cell.strip() for cell in stripped.strip("|").split("|")]
        if not cells or cells[0].lower() == "task":
            continue
        if re.fullmatch(r"T\d+", cells[0]):
            ids.add(cells[0])
    return ids


def all_task_ids(text: str) -> set[str]:
    return set(re.findall(r"\bT\d+\b", text))


def validate_plan(
    text: str, profile: str, require_ready: bool, failures: list[str]
) -> None:
    for heading in BALANCED_HEADINGS:
        if not has_heading(text, 2, heading):
            failures.append(f"missing required section `## {heading}`")

    metadata = section(text, "Metadata")
    for field in METADATA_FIELDS:
        if parse_text_line(metadata, field) is None:
            failures.append(f"missing metadata field `- {field}: ...`")

    declared_profile = parse_text_line(metadata, "Template Profile")
    status = parse_text_line(metadata, "Status")
    selected_profile = profile
    if selected_profile == "auto":
        selected_profile = (
            "extended" if declared_profile == "C_EXTENDED" else "balanced"
        )

    if selected_profile == "balanced" and declared_profile not in {None, "A_BALANCED"}:
        failures.append("balanced plans must declare `Template Profile: A_BALANCED`")
    if selected_profile == "extended" and declared_profile != "C_EXTENDED":
        failures.append("extended plans must declare `Template Profile: C_EXTENDED`")

    if require_ready and status != "READY_FOR_APPROVAL":
        failures.append("`--require-ready` requires `- Status: READY_FOR_APPROVAL`")

    open_questions = section(text, "Open Questions / Risks")
    if require_ready and has_blocker(open_questions):
        failures.append(
            "READY_FOR_APPROVAL plans must not contain execution-blocking open questions or risks"
        )

    todos = todo_sections(text)
    if not todos:
        failures.append("plan must include at least one `### TODO Tn. ...` section")
    for todo_id, block in todos.items():
        for field in TODO_FIELDS:
            if not has_field(block, field):
                failures.append(f"{todo_id} missing TODO field `- {field}: ...`")
        qa = re.search(r"(?ms)^-\s*QA 방법\s*:(.*?)(?=^-\s+\S|\Z)", block)
        qa_text = qa.group(1) if qa else ""
        if "Happy path:" not in qa_text:
            failures.append(f"{todo_id} QA 방법 must include `Happy path:`")
        if "Failure path:" not in qa_text:
            failures.append(f"{todo_id} QA 방법 must include `Failure path:`")

    final_verification = section(text, "Final Verification")
    for marker in ["Goal compliance", "Constraint compliance", "Non-goal compliance"]:
        if marker not in final_verification:
            failures.append(f"Final Verification must include `{marker}`")

    approval = section(text, "Approval Gate")
    if not re.search(r"(?i)pending approval|승인|구현 승인", approval):
        failures.append(
            "Approval Gate must explicitly state pending approval / separate execution approval"
        )

    if selected_profile == "extended":
        validate_extended(text, todos, failures)


def validate_extended(text: str, todos: dict[str, str], failures: list[str]) -> None:
    for heading in EXTENDED_HEADINGS:
        if not has_heading(text, 2, heading):
            failures.append(f"extended plan missing required section `## {heading}`")

    for todo_id, block in todos.items():
        for field in EXTENDED_TODO_FIELDS:
            if not has_field(block, field):
                failures.append(
                    f"{todo_id} missing extended TODO field `- {field}: ...`"
                )

    todo_ids = set(todos)
    matrix = section(text, "계획 의존성 매트릭스")
    matrix_ids = first_column_task_ids(matrix)
    if todo_ids and matrix_ids != todo_ids:
        failures.append(
            "계획 의존성 매트릭스 first-column task IDs must match TODO IDs "
            f"(matrix={sorted(matrix_ids)}, todos={sorted(todo_ids)})"
        )

    dispatch = section(text, "Dispatch Summary")
    dispatch_ids = all_task_ids(dispatch)
    missing_dispatch = todo_ids - dispatch_ids
    if missing_dispatch:
        failures.append(
            f"Dispatch Summary missing TODO IDs: {sorted(missing_dispatch)}"
        )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate Deep Interview plan documents."
    )
    parser.add_argument("--input", required=True, help="Markdown plan file to validate")
    parser.add_argument(
        "--profile", choices=["balanced", "extended", "auto"], default="auto"
    )
    parser.add_argument(
        "--require-ready",
        action="store_true",
        help="Require `Status: READY_FOR_APPROVAL` and reject execution blockers.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(
            f"validation failed:\n- input file not found: {input_path}", file=sys.stderr
        )
        return 2

    text = input_path.read_text(encoding="utf-8")
    failures: list[str] = []
    validate_plan(text, args.profile, args.require_ready, failures)

    if failures:
        print("validation failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"ok: validated {input_path} (profile={args.profile})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
