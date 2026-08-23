#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_root="$root/updater"
output_root="${NUNCH_SKILLS_OUTPUT_ROOT:-$root/bin}"
version="${NUNCH_SKILLS_VERSION:-dev}"
version_symbol="github.com/nunch-dev/nunch-skills/plugins/nunch-skills-manager/updater/internal/manager.cliVersion"

usage() {
  printf '%s\n' "usage: $0 [--dry-run] [output-directory]"
}

dry_run=false
case "${1:-}" in
  --dry-run)
    dry_run=true
    shift
    ;;
  --help|-h)
    usage
    exit 0
    ;;
esac

if [ "$#" -gt 1 ]; then
  usage >&2
  exit 2
fi

if [ "$#" -eq 1 ]; then
  output_root=$1
fi

build() {
  target_os=$1
  target_arch=$2
  suffix=$3
  output="$output_root/nunch-skills-manager-$target_os-$target_arch$suffix"
  if [ "$dry_run" = true ]; then
    printf '%s\n' "$output"
    return
  fi
  GOOS=$target_os GOARCH=$target_arch CGO_ENABLED=0 go build -buildvcs=false -trimpath \
    -ldflags="-s -w -buildid= -X $version_symbol=$version" -o "$output" ./cmd/nunch-skills-manager
}

if [ "$dry_run" = false ]; then
  mkdir -p "$output_root"
fi
cd "$source_root"
build darwin arm64 ""
build darwin amd64 ""
build linux arm64 ""
build linux amd64 ""
build windows arm64 ".exe"
build windows amd64 ".exe"
