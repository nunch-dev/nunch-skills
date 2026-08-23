# Release runbook

This runbook prepares and validates a release of `@nunch-dev/skills`. It does not authorize or perform a Git tag push, npm publish, or GitHub release creation. Each of those is a separate remote write that needs explicit confirmation immediately before it is executed.

## Release identity

One release has one npm version, immutable Git tag, and full Git commit.

```text
@nunch-dev/skills@X.Y.Z
vX.Y.Z
<full 40-character commit SHA>
```

The generated `release-manifest.json` binds that identity to the package file allowlist and SHA-256 digests of the marketplace, manager manifest, hook definition, manager scripts, and six platform binaries. A release must fail closed when any of those values differ.

## Bootstrap trust boundary

The first `npx @nunch-dev/skills` or `pnpm dlx @nunch-dev/skills` invocation necessarily runs npm-delivered launcher and package code before dual-source verification can begin. This is distinct from ongoing SessionStart updates: the already-trusted manager downloads metadata and a tarball as data, verifies npm and Git sources, and does not execute candidate code before the verification succeeds.

Treat initial npm publication as a security boundary. Before the first public release, confirm `@nunch-dev` scope authority, package ownership, npm account authentication controls, public access, provenance, and registry integrity handling. Keep the package allowlist narrow and never add lifecycle `postinstall` mutation. These controls reduce the first-run trust risk; they do not claim that first-run npm code was independently verified before it ran.

The root package is distributed under the MIT License. The release tarball must include `LICENSE`, and package metadata must declare `"license": "MIT"`.

## Local preparation

Before building artifacts, ensure the intended release commit is clean and that the root npm version, planned `vX.Y.Z` tag, and package metadata agree. A manager plugin version is independent of the npm package version, but any manager plugin change must also update its Codex manifest and release artifact inputs.

Run the local validation suite from the repository root:

```bash
npm ci --ignore-scripts
npm test
npm run pack:check
node npm/scripts/repro-build.mjs
(
  cd plugins/nunch-skills-manager/updater
  go test -race -shuffle=on -count=1 ./...
)
```

Also validate the manager plugin and its skill after documentation or manifest changes:

```bash
python3 /Users/nunch/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/nunch-skills-manager
python3 /Users/nunch/.codex/skills/.system/skill-creator/scripts/quick_validate.py \
  plugins/nunch-skills-manager/skills/nunch-skills-manager
```

The release workflow runs the same source and package checks, compares two clean Go builds, generates a staged canonical manifest, and uploads a tarball plus `SHA256SUMS`. Its publish jobs are intentionally disabled; validation success is not publication.

## Approval gate for remote writes

Do not create a tag, push a ref, publish to npm, or create a GitHub release before showing the exact target and getting a new approval. At minimum, show:

- the current local commit and the expected remote ref/OID;
- the exact tag name and the full commit it will identify;
- the npm package name, version, dist-tag, tarball filename, and SHA-256;
- the GitHub repository, release tag, and each asset filename and SHA-256;
- whether the operation is a normal fast-forward/update or would rewrite remote history.

For the first npm publication, verify that the authenticated account has authority for `@nunch-dev/skills`, public access is intended, and the chosen authentication or trusted-publishing setup is correct. Do not put npm tokens in repository files, workflow logs, or release notes.

Only attach a stable release to the npm `latest` dist-tag. SessionStart automatic update accepts a strictly newer stable SemVer only; it rejects prerelease, same-version, and downgrade candidates. Prerelease testing must use an explicitly selected non-`latest` version and must not silently replace a stable installed release.

## Publish sequence after approval

1. Create the immutable tag for the already-validated commit and push only that tag.
2. Wait for the tag-triggered release validation workflow to complete successfully. Confirm the uploaded tarball and `SHA256SUMS` correspond to the approved version and commit.
3. Publish that exact approved tarball to npm with public access and provenance according to the approved publishing mechanism.
4. Create the GitHub release from the same immutable tag and upload only the validated artifacts and checksums.
5. In a fresh temporary `CODEX_HOME`, install the published package with `npx @nunch-dev/skills@X.Y.Z install`, run `doctor`, and confirm the manager hook trust and installed release identity match the manifest.

If any verification or post-publish check fails, stop. Do not republish the same version, retag, force-push, or replace artifacts. Investigate the immutable failure, prepare a new version, and obtain a new approval for the next remote publication.
