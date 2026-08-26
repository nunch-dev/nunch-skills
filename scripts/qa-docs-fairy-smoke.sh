#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FIXTURE_ROOT="$REPOSITORY_ROOT/plugins/docs-fairy/evals/fixtures/smoke-project"
SMOKE_CONFIG="$REPOSITORY_ROOT/plugins/docs-fairy/evals/smoke.json"
HOST_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
HOST_CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR-}"
HOST_CLAUDE_CONFIG_DIR_WAS_SET="${CLAUDE_CONFIG_DIR+x}"
HOST_CLAUDE_HOME="${CLAUDE_HOME-}"
HOST_CLAUDE_HOME_WAS_SET="${CLAUDE_HOME+x}"

for command in codex claude git node; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "missing required command: $command" >&2
    exit 1
  fi
done

source "$REPOSITORY_ROOT/scripts/qa-sandbox.sh"

if [[ ! -f "$HOST_CODEX_HOME/auth.json" ]]; then
  echo "Codex authentication is required: run 'codex login' before the smoke test" >&2
  exit 1
fi
ln -s "$HOST_CODEX_HOME/auth.json" "$CODEX_HOME/auth.json"

PROJECT_ROOT="$NUNCH_SKILLS_QA_SANDBOX/docs-fairy-project"
EVIDENCE_ROOT="$NUNCH_SKILLS_QA_SANDBOX/docs-fairy-evidence"
mkdir -p "$PROJECT_ROOT" "$EVIDENCE_ROOT"
cp -R "$FIXTURE_ROOT/." "$PROJECT_ROOT/"

git -C "$PROJECT_ROOT" init --quiet
git -C "$PROJECT_ROOT" config user.name "Docs Fairy Smoke"
git -C "$PROJECT_ROOT" config user.email "docs-fairy-smoke@example.test"
git -C "$PROJECT_ROOT" add .
git -C "$PROJECT_ROOT" commit --quiet -m "docs-fairy smoke fixture"

CODEX_MARKETPLACE="$({
  node -e "const data=require(process.argv[1]); process.stdout.write(data.name)" \
    "$REPOSITORY_ROOT/.agents/plugins/marketplace.json"
})"
CLAUDE_MARKETPLACE="$({
  node -e "const data=require(process.argv[1]); process.stdout.write(data.name)" \
    "$REPOSITORY_ROOT/.claude-plugin/marketplace.json"
})"
SMOKE_PROMPT="$({
  node -e "const data=require(process.argv[1]); process.stdout.write(data.prompt)" "$SMOKE_CONFIG"
})"

codex plugin marketplace add "$REPOSITORY_ROOT" --json \
  >"$EVIDENCE_ROOT/codex-marketplace-add.json"
codex plugin list --marketplace "$CODEX_MARKETPLACE" --available --json \
  >"$EVIDENCE_ROOT/codex-plugin-list.json"
grep -q 'docs-fairy' "$EVIDENCE_ROOT/codex-plugin-list.json"
codex plugin add "docs-fairy@$CODEX_MARKETPLACE" --json \
  >"$EVIDENCE_ROOT/codex-plugin-add.json"

claude plugin marketplace add "$REPOSITORY_ROOT" --scope user \
  >"$EVIDENCE_ROOT/claude-marketplace-add.txt"
claude plugin list --available --json >"$EVIDENCE_ROOT/claude-plugin-list.json"
grep -q 'docs-fairy' "$EVIDENCE_ROOT/claude-plugin-list.json"
claude plugin install "docs-fairy@$CLAUDE_MARKETPLACE" --scope user \
  >"$EVIDENCE_ROOT/claude-plugin-install.txt"

CODEX_COMMAND=(
  codex exec
  --cd "$PROJECT_ROOT"
  --sandbox read-only
  --ephemeral
  --output-last-message "$EVIDENCE_ROOT/codex-response.txt"
)
if [[ -n "${CODEX_SMOKE_MODEL:-}" ]]; then
  CODEX_COMMAND+=(--model "$CODEX_SMOKE_MODEL")
fi
CODEX_COMMAND+=("$SMOKE_PROMPT")

"${CODEX_COMMAND[@]}" \
  >"$EVIDENCE_ROOT/codex-exec.log" 2>&1

CLAUDE_COMMAND=(
  claude --print
  --no-session-persistence
  --permission-mode dontAsk
  --plugin-dir "$REPOSITORY_ROOT/plugins/docs-fairy"
  --tools "Skill,Read,Glob,Grep"
  --output-format stream-json
  --verbose
  --max-budget-usd "${CLAUDE_SMOKE_MAX_BUDGET_USD:-1.00}"
)
CLAUDE_COMMAND+=(--model "${CLAUDE_SMOKE_MODEL:-haiku}")
CLAUDE_COMMAND+=("Invoke the docs-fairy skill with the Skill tool before doing anything else. Then ${SMOKE_PROMPT#\$docs-fairy를 사용해 }")

(
  cd "$PROJECT_ROOT"
  if [[ -n "$HOST_CLAUDE_CONFIG_DIR_WAS_SET" ]]; then
    export CLAUDE_CONFIG_DIR="$HOST_CLAUDE_CONFIG_DIR"
  else
    unset CLAUDE_CONFIG_DIR
  fi
  if [[ -n "$HOST_CLAUDE_HOME_WAS_SET" ]]; then
    export CLAUDE_HOME="$HOST_CLAUDE_HOME"
  else
    unset CLAUDE_HOME
  fi
  "${CLAUDE_COMMAND[@]}"
) >"$EVIDENCE_ROOT/claude-events.jsonl" 2>"$EVIDENCE_ROOT/claude-exec.log"

node -e '
const fs = require("node:fs");
const [eventsPath, responsePath] = process.argv.slice(1);
let invoked = false;
const response = [];
for (const line of fs.readFileSync(eventsPath, "utf8").split("\n")) {
  if (line.trim() === "") continue;
  const event = JSON.parse(line);
  for (const block of event.message?.content ?? []) {
    if (block.type === "tool_use" && block.name === "Skill" && block.input?.skill === "docs-fairy:docs-fairy") {
      invoked = true;
    }
    if (event.type === "assistant" && block.type === "text") response.push(block.text);
  }
}
fs.writeFileSync(responsePath, response.join("\n"));
if (!invoked) {
  console.error("Claude did not invoke docs-fairy through the Skill tool");
  process.exit(1);
}
' "$EVIDENCE_ROOT/claude-events.jsonl" "$EVIDENCE_ROOT/claude-response.txt"

if grep -Eqi 'skill[^[:alnum:]]+(not found|missing)|missing reference|no such file.*references|스킬.*(찾지 못|없|미설치|설치되어 있지)' \
  "$EVIDENCE_ROOT/codex-response.txt" "$EVIDENCE_ROOT/claude-response.txt"; then
  echo "a platform reported a missing skill or reference" >&2
  exit 1
fi

if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
  echo "smoke fixture changed during a read-only invocation" >&2
  git -C "$PROJECT_ROOT" status --short >&2
  exit 1
fi

printf 'docs-fairy smoke passed\nEvidence: %s\n' "$EVIDENCE_ROOT"
