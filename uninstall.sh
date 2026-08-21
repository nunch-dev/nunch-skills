#!/usr/bin/env bash
set -euo pipefail

exec bun "$(dirname "$0")/scripts/skill_registry.ts" uninstall "$@"
