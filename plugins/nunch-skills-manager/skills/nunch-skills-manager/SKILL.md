---
name: nunch-skills-manager
description: Initialize, diagnose, and help install runtime tools required by installed nunch-skills plugins. Use when the first-task initialization notice reports missing dependencies or when the user asks to check, fix, set up, or install nunch-skills dependencies; do not use for ordinary plugin updates.
---

# Nunch Skills Dependencies

Use the manager's bundled doctor as the source of truth. Resolve the physical plugin root as two directories above this `SKILL.md`; do not rely on `PLUGIN_ROOT` being present outside a hook.

The trusted SessionStart hook checks dependency declarations when the installed plugin set or version changes. Treat its initialization context as a diagnosis, not permission to install packages.

- On macOS or Linux, run `<plugin-root>/scripts/run-manager.sh doctor`.
- On Windows, run `<plugin-root>/scripts/run-manager.ps1 doctor` with PowerShell.

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
