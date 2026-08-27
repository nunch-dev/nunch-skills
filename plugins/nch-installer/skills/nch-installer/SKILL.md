---
name: nch-installer
description: Manage the release-pinned nunch-skills lifecycle and diagnose its runtime dependencies. Use when the user asks to install, update, uninstall, verify, or repair nunch-skills, or when a first-task initialization notice reports missing dependencies; do not use for unrelated Codex plugins.
---

# Nunch Skills Setup

Use the release-pinned lifecycle CLI for user-requested nunch-skills installation, update, removal, or integrity checks. Read [Lifecycle CLI](references/lifecycle-cli.md) before invoking a lifecycle command or explaining hook trust.

Do not treat `npx` download as permission to change Codex configuration. Use the explicit `install|setup`, `update`, `uninstall`, or `doctor` subcommand the user requested. Interactive mutation commands show their selected scope; `install --no-tui` is allowed only when `--platform` and `--plugins` make the scope explicit. Uninstall always previews created-only targets and requires interactive confirmation.

The lifecycle CLI verifies the npm tarball, immutable Git tag and commit, manifest allowlist, installer hook, dispatcher, and TypeScript runtime before a release-pinned trust change. If verification fails, keep existing state unchanged. Do not workaround a failure by editing Codex hook trust state; explain that the user may inspect the installer hook through `/hooks` only after understanding the mismatch.

Do not publish npm packages, create or push Git tags, or create GitHub releases as part of lifecycle support. Those are separate remote writes and require an explicit final approval at the point of execution.

## Dependencies

Use the lifecycle CLI's `doctor` command as the source of truth.

The trusted SessionStart hook checks dependency declarations when the installed plugin set or version changes. Treat its initialization context as a diagnosis, not permission to install packages.

- Run `npx @nunch-dev/skills doctor --verbose`. Use `--platform=codex` or `--platform=claude` when the request concerns one platform.

The JSON report separates missing executable dependencies from integrations that require a manual connection. Only act on dependencies required by plugins the user installed.

For missing executable dependencies:

1. Identify the platform and an already-installed package manager.
2. Resolve the package that provides the reported requirement. `python3` must provide Python 3.11 or newer.
3. Show the exact installation command and obtain approval immediately before running it. Package installation changes the user's system and may require network or administrator access.
4. Do not install a package manager, use an unaudited download script, or change system-wide defaults without separate user direction.
5. Run the bundled doctor again and report the remaining items.

For a manual dependency such as Kaneo MCP, check whether the corresponding connector or MCP tools are already available. If they are absent, explain the required connection without claiming it was installed. Do not substitute an unrelated task-management integration.

If the doctor itself fails, preserve the existing plugin installation and report the failed command and actionable error. Never treat a dependency failure as permission to uninstall or disable a plugin.

When adding dependency metadata to a plugin, read [Dependency declarations](references/dependency-declarations.md).
