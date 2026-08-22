#!/bin/sh
set -eu

plugin_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

case "$(uname -s)" in
  Darwin) platform=darwin ;;
  Linux) platform=linux ;;
  *) echo "unsupported operating system" >&2; exit 1 ;;
esac

case "$(uname -m)" in
  arm64|aarch64) architecture=arm64 ;;
  x86_64|amd64) architecture=amd64 ;;
  *) echo "unsupported architecture" >&2; exit 1 ;;
esac

exec "$plugin_root/bin/nunch-skills-manager-$platform-$architecture" "$@"
