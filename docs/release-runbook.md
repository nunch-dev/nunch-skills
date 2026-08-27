# Release runbook

This runbook prepares and validates a release of `@nunch-dev/skills`. It does not authorize or perform a Git tag push, npm publish, or GitHub release creation. Each of those is a separate remote write that needs explicit confirmation immediately before it is executed.

## Release identity

One release has one npm version, immutable Git tag, and full Git commit.

```text
@nunch-dev/skills@X.Y.Z
vX.Y.Z
<full 40-character commit SHA>
```

The generated `release-manifest.json` binds that identity to the package file allowlist and SHA-256 digests of the marketplace, installer manifest, hook definition, Node dispatcher, public CLI bundle, installer runtime, and upstream-sync bundle. A release must fail closed when any value differs.

## Bootstrap trust boundary

The first `npx @nunch-dev/skills`, `pnpm dlx @nunch-dev/skills`, or `bunx @nunch-dev/skills` invocation necessarily runs npm-delivered launcher and package code before dual-source verification can begin. This is distinct from ongoing SessionStart updates: the already-trusted installer downloads metadata and a tarball as data, verifies npm and Git sources, and does not execute candidate code before the verification succeeds.

Treat initial npm publication as a security boundary. Before the first public release, confirm `@nunch-dev` scope authority, package ownership, npm account authentication controls, public access, provenance, and registry integrity handling. Keep the package allowlist narrow and never add lifecycle `postinstall` mutation. These controls reduce the first-run trust risk; they do not claim that first-run npm code was independently verified before it ran.

The root package is distributed under the MIT License. The release tarball must include `LICENSE`, and package metadata must declare `"license": "MIT"`.

## Local preparation

Before building artifacts, ensure the intended release commit is clean and that the root npm version, planned `vX.Y.Z` tag, and package metadata agree. A installer plugin version is independent of the npm package version, but any installer plugin change must also update its Codex manifest and release artifact inputs.

Run the local validation suite from the repository root:

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
node npm/scripts/repro-build.mjs
```

`check` runs the complete static/build/test/package gate. Before release, source `scripts/qa-sandbox.sh` and manually exercise the built CLI plus the applicable Codex or Claude installation flow in the throwaway homes. See [Local development and QA](local-development.md) for the exact commands.

Also validate the installer plugin and its skill after documentation or manifest changes:

```bash
python3 /Users/nunch/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/nch-installer
python3 /Users/nunch/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/nch-installer/skills/nch-installer
```

`docs-fairy`를 포함하는 release에서는 repository-owned CI contract 검사에 더해 격리된 실제 호출 gate도 통과해야 합니다.

```bash
scripts/qa-docs-fairy-smoke.sh
```

이 명령은 Codex와 Claude marketplace에서 `docs-fairy`를 발견·설치하고, 각 플랫폼에서 read-only 요청을 한 번 실행한 뒤 fixture가 바뀌지 않았는지 확인합니다. 구체적인 응답 문구나 생성 결과는 release 합격 조건이 아닙니다.

The validation workflow runs the same source and package checks, compares two clean TypeScript bundle builds, generates a staged canonical manifest, and uploads a tarball plus `SHA256SUMS`. It never publishes. The separate `publish-npm.yml` workflow accepts only a manually selected, already-published stable GitHub Release.

## Approval gate for remote writes

Do not create a tag, push a ref, publish to npm, or create a GitHub release before showing the exact target and getting a new approval. At minimum, show:

- the current local commit and the expected remote ref/OID;
- the exact tag name and the full commit it will identify;
- the npm package name, version, dist-tag, tarball filename, and SHA-256;
- the GitHub repository, release tag, and each asset filename and SHA-256;
- whether the operation is a normal fast-forward/update or would rewrite remote history.

For the first npm publication, verify that the authenticated account has authority for `@nunch-dev/skills`, public access is intended, and the chosen authentication or trusted-publishing setup is correct. Do not put npm tokens in repository files, workflow logs, or release notes.

The npm trusted publisher is bound to repository `nunch-dev/nunch-skills`, workflow file `publish-npm.yml`, no GitHub Environment, and the `npm publish` permission. The workflow uses GitHub OIDC and must not receive a long-lived `NODE_AUTH_TOKEN`.

Only attach a stable release to the npm `latest` dist-tag. SessionStart automatic update accepts a strictly newer stable SemVer only; it rejects prerelease, same-version, and downgrade candidates. Prerelease testing must use an explicitly selected non-`latest` version and must not silently replace a stable installed release.

## Publish sequence after approval

1. Create the immutable tag for the already-validated commit and push only that tag.
2. Wait for the tag-triggered validation workflow to complete successfully. Confirm the uploaded tarball and `SHA256SUMS` correspond to the approved version and commit.
3. Create the GitHub Release from the same immutable tag and attach only the validated tarball, canonical manifest, and checksums.
4. Download those assets from the published GitHub Release into a new directory. Verify GitHub's asset digests and run `sha256sum -c SHA256SUMS` without rewriting the files.
5. After a separate npm approval, manually dispatch `publish-npm.yml` with the exact stable tag. The workflow checks out that tag, downloads the GitHub Release, validates its three-file surface, checksums, commit identity, canonical manifest, and embedded package manifest, then publishes the exact tarball through npm trusted publishing with automatic provenance.
6. Wait for the workflow to succeed. The workflow must run `install --help` and `doctor --help` through the exact published version in an isolated npm cache. Download `@nunch-dev/skills@X.Y.Z` from npm and confirm its SHA-256 matches the GitHub Release tarball and `latest` points to the approved version.
7. In a fresh temporary `CODEX_HOME`, run `npx @nunch-dev/skills@X.Y.Z install --no-tui --platform=codex --plugins=git-tools`, then run `npx @nunch-dev/skills@X.Y.Z doctor --verbose --platform=codex`. Confirm the installer hook trust and installed release identity match the manifest.
8. In a separate fresh temporary `CLAUDE_HOME` and `CLAUDE_CONFIG_DIR`, run `npx @nunch-dev/skills@X.Y.Z install --no-tui --platform=claude --plugins=git-tools`, then run `npx @nunch-dev/skills@X.Y.Z doctor --verbose --platform=claude`. Confirm the installed plugin and marketplace source match the release.

If any verification or post-publish check fails, stop. Do not republish the same version, retag, force-push, or replace artifacts. Investigate the immutable failure, prepare a new version, and obtain a new approval for the next remote publication.
