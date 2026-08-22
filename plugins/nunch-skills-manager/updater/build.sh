#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
source_root="$root/updater"
output_root="$root/bin"

build() {
  target_os=$1
  target_arch=$2
  suffix=$3
  output="$output_root/nunch-skills-manager-$target_os-$target_arch$suffix"
  GOOS=$target_os GOARCH=$target_arch CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o "$output" ./cmd/nunch-skills-manager
}

mkdir -p "$output_root"
cd "$source_root"
build darwin arm64 ""
build darwin amd64 ""
build linux arm64 ""
build linux amd64 ""
build windows arm64 ".exe"
build windows amd64 ".exe"
