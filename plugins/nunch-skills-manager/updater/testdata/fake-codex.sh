#!/bin/sh
set -eu

printf '%s\n' "$*" >> "$FAKE_CODEX_CALLS"

if [ "$1 $2 $3" = "plugin marketplace upgrade" ]; then
  : > "$FAKE_CODEX_UPGRADED"
  printf '%s\n' '{"upgraded":true}'
  exit 0
fi

if [ "$1 $2" = "plugin list" ]; then
  if [ -f "$FAKE_CODEX_UPGRADED" ]; then
    printf '%s\n' '{"installed":[{"pluginId":"deep-interview@nunch-skills","name":"deep-interview","version":"0.2.0","installed":true,"enabled":true},{"pluginId":"nunch-skills-manager@nunch-skills","name":"nunch-skills-manager","version":"0.1.0","installed":true,"enabled":true}]}'
  else
    printf '%s\n' '{"installed":[{"pluginId":"deep-interview@nunch-skills","name":"deep-interview","version":"0.1.0","installed":true,"enabled":true},{"pluginId":"nunch-skills-manager@nunch-skills","name":"nunch-skills-manager","version":"0.1.0","installed":true,"enabled":true}]}'
  fi
  exit 0
fi

if [ "$1 $2" = "plugin add" ]; then
  plugin_id=$3
  plugin_name=${plugin_id%@*}
  if [ "$plugin_name" = "deep-interview" ]; then
    version=0.2.0
  else
    version=0.1.0
  fi
  printf '{"pluginId":"%s","name":"%s","version":"%s"}\n' "$plugin_id" "$plugin_name" "$version"
  exit 0
fi

printf '%s\n' "unexpected fake codex arguments: $*" >&2
exit 1
