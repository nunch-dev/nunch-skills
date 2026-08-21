#!/usr/bin/env python3
"""Validate deep-interview outputs outside the prompt.

The script intentionally checks structural contracts only. It does not grade prose
quality or decide whether a spec is strategically good.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path
from typing import Literal, assert_never

THRESHOLDS = {"quick": 20.0, "standard": 10.0, "deep": 5.0}

SPEC_HEADINGS = [
    "Metadata",
    "Clarity Breakdown",
    "Topology",
    "Seed Contract",
    "Goal",
    "Constraints",
    "Non-Goals",
    "Acceptance Criteria",
    "Assumptions Exposed and Resolved",
    "Technical Context",
    "Ontology",
    "Ontology Convergence",
    "Closure Audit",
    "Restate Gate",
    "Approval Gate",
    "Interview Transcript Summary",
]

SEED_SUBHEADINGS = [
    "Immutable Direction",
    "Stable Intent Contract",
    "Source Routing",
    "Acceptance Criteria Tree",
]

SOURCE_TAG_RE = re.compile(
    r"\[(from-user|from-code|from-research|from-data|assumption)\]"
)


def first_non_empty_line(text: str) -> str:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped:
            return stripped
    return ""


def has_heading(text: str, level: int, heading: str) -> bool:
    marks = "#" * level
    return re.search(rf"(?m)^{marks}\s+{re.escape(heading)}\s*$", text) is not None


def section(text: str, heading: str) -> str:
    match = re.search(
        rf"(?ms)^##\s+{re.escape(heading)}\s*$\n(.*?)(?=^##\s+|\Z)",
        text,
    )
    return match.group(1) if match else ""


def parse_percent_line(text: str, label: str) -> float | None:
    match = re.search(
        rf"(?mi)^-\s*{re.escape(label)}:\s*([0-9]+(?:\.[0-9]+)?)%\s*$", text
    )
    return float(match.group(1)) if match else None


def parse_status(text: str) -> str | None:
    match = re.search(r"(?mi)^-\s*Status:\s*([A-Z_]+)\s*$", text)
    return match.group(1) if match else None


def parse_text_line(text: str, label: str) -> str | None:
    match = re.search(rf"(?mi)^-\s*{re.escape(label)}:\s*(.+?)\s*$", text)
    return match.group(1) if match else None


def heading_index(text: str, level: int, heading: str) -> int:
    marks = "#" * level
    match = re.search(rf"(?m)^{marks}\s+{re.escape(heading)}\s*$", text)
    return match.start() if match else -1


def validate_initial(text: str, mode: str, failures: list[str]) -> None:
    expected_threshold = THRESHOLDS[mode]
    first_line = first_non_empty_line(text)
    match = re.fullmatch(
        r"Deep Interview threshold:\s*([0-9]+(?:\.[0-9]+)?)%\s*\(mode:\s*(quick|standard|deep)\)",
        first_line,
    )

    if not match:
        failures.append(
            "first non-empty line must be `Deep Interview threshold: <n>% (mode: <mode>)`"
        )
    else:
        actual_threshold = float(match.group(1))
        actual_mode = match.group(2)
        if actual_mode != mode:
            failures.append(
                f"threshold line mode is `{actual_mode}`, expected `{mode}`"
            )
        if actual_threshold != expected_threshold:
            failures.append(
                f"threshold line uses {actual_threshold:g}%, expected {expected_threshold:g}% for {mode} mode"
            )

    if not re.search(r"(?i)Round\s*0", text):
        failures.append("initial output must include Round 0")
    if not re.search(r"(?i)(토폴로지|topology)", text):
        failures.append("Round 0 must be a topology confirmation")
    if not re.search(r"(?i)Ambiguity:\s*not scored yet", text):
        failures.append("Round 0 ambiguity must be `not scored yet`")

    mutation_markers = [
        r"\bapply_patch\b",
        r"\bgit\s+commit\b",
        r"\bpnpm\s+(?:run\s+)?(?:build|test|dev)\b",
        r"파일을\s*수정했습니다",
        r"구현을\s*시작했습니다",
    ]
    for pattern in mutation_markers:
        if re.search(pattern, text):
            failures.append(
                "initial output appears to start implementation before approval"
            )
            break


def validate_spec(
    text: str, mode: str, require_passed: bool, failures: list[str]
) -> None:
    for heading in SPEC_HEADINGS:
        if not has_heading(text, 2, heading):
            failures.append(f"missing required section `## {heading}`")

    seed_contract = section(text, "Seed Contract")
    for heading in SEED_SUBHEADINGS:
        if not has_heading(seed_contract, 3, heading):
            failures.append(f"missing required Seed subsection `### {heading}`")

    if not re.search(r"\[from-user\]", text):
        failures.append(
            "spec must include at least one `[from-user]` source routing tag"
        )
    if not SOURCE_TAG_RE.search(text):
        failures.append("spec must include source routing tags")

    interview_id = parse_text_line(text, "Interview ID")
    event_sequence = parse_text_line(text, "Event Sequence")
    event_hash = parse_text_line(text, "Event Hash")
    spec_path = parse_text_line(text, "Spec Path")
    if interview_id is None or not re.fullmatch(r"di:[A-Za-z0-9._:-]+", interview_id):
        failures.append("metadata must include a stable `- Interview ID: di:...`")
    if event_sequence is None or not event_sequence.isdigit():
        failures.append("metadata must include numeric `- Event Sequence: ...`")
    if event_hash is None or not re.fullmatch(r"[0-9a-f]{64}", event_hash):
        failures.append("metadata must include a 64-character `- Event Hash: ...`")
    if spec_path is None or not spec_path.startswith(".nunch/plans/"):
        failures.append("Spec Path must be under `.nunch/plans/`")

    rounds = parse_text_line(text, "Rounds")
    if rounds is None or not rounds.isdigit() or not 0 <= int(rounds) <= 100:
        failures.append("Rounds must be an integer between 0 and 100")

    expected_threshold = THRESHOLDS[mode]
    declared_mode = parse_text_line(text, "Mode")
    declared_threshold = parse_percent_line(text, "Threshold")
    final_ambiguity = parse_percent_line(text, "Final Ambiguity")
    status = parse_status(text)

    if declared_mode != mode:
        failures.append(f"metadata mode is `{declared_mode}`, expected `{mode}`")
    if declared_threshold is None:
        failures.append("missing `- Threshold: <n>%` metadata")
    elif declared_threshold != expected_threshold:
        failures.append(
            f"metadata threshold is {declared_threshold:g}%, expected {expected_threshold:g}% for {mode} mode"
        )

    if require_passed and status != "PASSED":
        failures.append("`--require-passed` requires `- Status: PASSED`")
    if final_ambiguity is None:
        failures.append("missing `- Final Ambiguity: <n>%` metadata")
    elif (
        require_passed or status == "PASSED"
    ) and final_ambiguity > expected_threshold:
        failures.append(
            f"PASSED spec final ambiguity is {final_ambiguity:g}%, above threshold {expected_threshold:g}%"
        )

    restate_index = heading_index(text, 2, "Restate Gate")
    approval_index = heading_index(text, 2, "Approval Gate")
    if restate_index != -1 and approval_index != -1 and restate_index > approval_index:
        failures.append("Restate Gate must appear before Approval Gate")

    if not re.search(r"(?mi)^###\s+Acceptance Criteria Tree\s*$", seed_contract):
        failures.append("Seed Contract must include an Acceptance Criteria Tree")
    elif not re.search(r"\bAC-\d+(?:\.\d+)?\b", seed_contract):
        failures.append(
            "Acceptance Criteria Tree must use AC identifiers such as `AC-1`"
        )

    closure = section(text, "Closure Audit")
    if not closure.strip():
        failures.append("Closure Audit section must not be empty")
    elif require_passed or status == "PASSED":
        if re.search(r"(?m)^\s*-\s*\[\s\]", closure):
            failures.append(
                "PASSED spec must not contain unchecked Closure Audit items"
            )
        if not re.search(r"(?m)^\s*-\s*\[[xX]\]", closure):
            failures.append("Closure Audit must contain checked items")
        for marker in ["Refine", "clarification", "Stable Intent", "event chain"]:
            if marker not in closure:
                failures.append(f"Closure Audit must verify `{marker}`")

    if not has_heading(text, 2, "Decision and Refine Ledger"):
        failures.append("missing required section `## Decision and Refine Ledger`")
    if not has_heading(text, 2, "Resume State"):
        failures.append("missing required section `## Resume State`")

    approval = section(text, "Approval Gate")
    if approval and not re.search(r"(?i)pending approval|승인 대기", approval):
        failures.append(
            "Approval Gate should explicitly remain pending until execution approval"
        )

    restate = section(text, "Restate Gate")
    if restate and not re.search(
        r"(?i)pending restatement|방향이 맞나요|source of truth", restate
    ):
        failures.append(
            "Restate Gate should ask the user to confirm the immutable direction"
        )


def validate_full(
    text: str, mode: str, require_passed: bool, failures: list[str]
) -> None:
    if first_non_empty_line(text).startswith("Deep Interview threshold:"):
        validate_initial(text, mode, failures)
    validate_spec(text, mode, require_passed, failures)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate deep-interview initial outputs or Seed-equivalent specs."
    )
    parser.add_argument(
        "--input", required=True, help="Markdown/text output to validate"
    )
    parser.add_argument("--kind", choices=["initial", "spec", "full"], required=True)
    parser.add_argument("--mode", choices=sorted(THRESHOLDS), default="standard")
    parser.add_argument(
        "--require-passed",
        action="store_true",
        help="Require a PASSED spec with final ambiguity at or below the mode threshold.",
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

    kind: Literal["initial", "spec", "full"] = args.kind
    match kind:
        case "initial":
            validate_initial(text, args.mode, failures)
        case "spec":
            validate_spec(text, args.mode, args.require_passed, failures)
        case "full":
            validate_full(text, args.mode, args.require_passed, failures)
        case unreachable:
            assert_never(unreachable)

    if failures:
        print("validation failed:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print(f"ok: validated {input_path} ({args.kind}, mode={args.mode})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
