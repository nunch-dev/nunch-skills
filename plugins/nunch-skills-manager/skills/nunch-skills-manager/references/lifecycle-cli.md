# Lifecycle CLI

`@nunch-dev/skills` exposes the `nunch-skills` command. It is the supported lifecycle path for Codex users with Node.js 22 or later and npm or pnpm.

```bash
npx @nunch-dev/skills
pnpm dlx @nunch-dev/skills
```

The first `npx` or `pnpm dlx` invocation is a bootstrap trust boundary: npm-delivered launcher and package code must run before this project can independently verify a Git release. npm integrity, provenance, and controlled first-publication access for `@nunch-dev/skills` mitigate that risk; they do not make first-run package execution disappear. After bootstrap, dual npm+Git verification must complete before a lifecycle command changes any Codex marketplace, plugin, config, or hook trust state.

## Interactive operations

| Operation | Scope |
| --- | --- |
| Install | Selects leaf plugins and always includes the manager control plane. |
| Update | Applies one verified release atomically to every installed nunch-skills plugin. |
| Doctor | Reports dependency, integrity, transaction, trust, and ownership health without changing state. |
| Uninstall | Selects created leaf plugins or performs a created-only full teardown when manager removal is chosen. |

The public CLI rejects arguments and non-TTY input. Cancellation, empty selection, and Ctrl-C do not mutate state.

## Trust boundary

The installer may register only the manager's declared SessionStart hook. Before doing so it requires exact agreement between the npm package and the immutable Git release: the npm version, `v<version>` tag, full commit, canonical manifest, marketplace, manager plugin manifest, hook JSON, Node dispatcher, and TypeScript runtime must all match their SHA-256 declarations.

The trusted SessionStart manager obtains metadata and the npm tarball without executing candidate package code. It accepts only a strictly newer stable SemVer candidate, verifies both release sources before staging any update, and only then changes Codex marketplace, plugin, config, or exact hook trust state. It updates non-manager plugins, the manager, and exact hook trust before final verification. A failed stage rolls owned resources back to the last known-good release.

If a verification fails, fail closed: do not grant trust, do not run candidate code, and preserve the current installation. Use `doctor` to surface the category and cause. A user can review the displayed manager hook through Codex `/hooks`, but that manual path must not be presented as a way to bypass an unresolved digest mismatch.
