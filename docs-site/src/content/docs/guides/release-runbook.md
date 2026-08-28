---
title: 릴리스 런북
description: Nunch Skills npm 패키지를 안전하게 준비하고 검증하는 릴리스 절차
---

이 런북은 `@nunch-dev/skills` 릴리스를 준비하고 검증하는 절차를 설명합니다. Git 태그 푸시, npm 게시, GitHub 릴리스 생성은 승인하거나 실행하지 않습니다. 각 작업은 별도 원격 쓰기이며, 실행 직전 명시적 승인이 필요합니다.

## 릴리스 식별자

하나의 릴리스는 npm 버전, 변경할 수 없는 Git 태그, 전체 Git 커밋으로 식별합니다.

```text
@nunch-dev/skills@X.Y.Z
vX.Y.Z
<40자리 전체 커밋 SHA>
```

생성된 `release-manifest.json`은 이 식별자를 패키지 파일 허용 목록과 주요 파일의 SHA-256 다이제스트에 연결합니다. 대상 파일에는 marketplace, 설치 프로그램 매니페스트, hook 정의, Node dispatcher, 공개 CLI 번들, 설치 프로그램 런타임, upstream-sync 번들이 포함됩니다. 값 하나라도 다르면 릴리스는 실패해야 합니다.

## 최초 실행의 신뢰 경계

처음 `npx @nunch-dev/skills`, `pnpm dlx @nunch-dev/skills`, `bunx @nunch-dev/skills`를 실행하면 이중 출처 검증을 시작하기 전에 npm으로 받은 launcher와 패키지 코드가 먼저 실행됩니다. 이 과정은 이후 SessionStart 업데이트와 다릅니다. 이미 신뢰한 설치 프로그램은 metadata와 tarball을 데이터로 내려받아 npm과 Git 출처를 검증하고, 검증이 성공하기 전에는 후보 코드를 실행하지 않습니다.

초기 npm 게시는 보안 경계로 다뤄야 합니다. 첫 공개 릴리스 전에 `@nunch-dev` scope 권한, 패키지 소유권, npm 계정 인증 통제, 공개 접근 설정, provenance, registry 무결성 처리를 확인하세요. 패키지 허용 목록은 좁게 유지하고, 파일을 변경하는 lifecycle `postinstall`은 추가하지 않습니다. 이 통제는 최초 실행의 신뢰 위험을 줄이지만, 처음 실행된 npm 코드가 실행 전에 독립적으로 검증되었다는 뜻은 아닙니다.

루트 패키지는 MIT License로 배포합니다. 릴리스 tarball에는 `LICENSE`가 포함되어야 하며 패키지 metadata에는 `"license": "MIT"`를 선언해야 합니다.

## 로컬 준비

artifact를 만들기 전에 대상 릴리스 커밋이 깨끗한지 확인하고, 루트 npm 버전과 번들 플러그인 버전, 예정된 `vX.Y.Z` 태그, 패키지 metadata가 서로 일치하는지 확인하세요. 번들 플러그인이 바뀌었다면 두 플랫폼의 매니페스트와 릴리스 artifact 입력을 모두 갱신해야 합니다.

저장소 루트에서 로컬 검증을 실행합니다.

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm run check
node npm/scripts/repro-build.mjs
```

`check`는 정적 검사, 빌드, 테스트, 패키지 gate를 모두 실행합니다. 릴리스 전에 `scripts/qa-sandbox.sh`를 source한 뒤, 격리된 home에서 빌드한 CLI와 해당 Codex 또는 Claude 설치 흐름을 직접 실행하세요. 정확한 명령은 [로컬 개발과 QA](/guides/local-development/)를 참고합니다.

문서나 매니페스트를 바꿨다면 번들 플러그인과 포함된 모든 스킬도 검증합니다.

```bash
python3 /Users/nunch/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py \
  plugins/nunch-skills
for skill in plugins/nunch-skills/skills/*; do
  python3 /Users/nunch/.codex/skills/.system/skill-creator/scripts/quick_validate.py "$skill"
done
```

`docs-fairy`가 포함된 릴리스는 저장소가 관리하는 CI contract 검사에 더해 격리된 실제 호출 gate도 통과해야 합니다.

```bash
scripts/qa-docs-fairy-smoke.sh
```

이 명령은 Codex와 Claude marketplace에서 `nunch-skills` 번들을 발견·설치하고, 번들 안의 `docs-fairy`로 각 플랫폼에서 읽기 전용 요청을 한 번 실행한 뒤 fixture가 바뀌지 않았는지 확인합니다. 구체적인 응답 문구나 생성 결과는 릴리스 합격 조건이 아닙니다.

검증 workflow는 같은 source와 패키지 검사를 실행하고, 두 번의 깨끗한 TypeScript 번들 빌드를 비교한 뒤, staged canonical manifest를 생성하고 tarball과 `SHA256SUMS`를 업로드합니다. 게시 작업은 하지 않습니다. 별도의 `publish-npm.yml` workflow는 수동으로 선택한 이미 게시된 안정 GitHub Release만 받습니다.

## 원격 쓰기 승인 gate

정확한 대상을 보여주고 새 승인을 받기 전에는 태그를 만들거나 ref를 푸시하거나 npm에 게시하거나 GitHub 릴리스를 만들지 않습니다. 최소한 다음 정보를 보여줘야 합니다.

- 현재 로컬 커밋과 예상 원격 ref/OID
- 정확한 태그 이름과 태그가 가리킬 전체 커밋
- npm 패키지 이름, 버전, dist-tag, tarball 파일 이름, SHA-256
- GitHub 저장소, 릴리스 태그, 각 asset 파일 이름과 SHA-256
- 일반 fast-forward/update인지 원격 이력을 다시 쓰는 작업인지 여부

첫 npm 게시에서는 인증한 계정이 `@nunch-dev/skills` 권한을 보유하는지, 공개 접근이 의도된 것인지, 선택한 인증 또는 trusted publishing 설정이 올바른지 확인합니다. npm token을 저장소 파일, workflow 로그, 릴리스 노트에 넣지 않습니다.

npm trusted publisher는 `nunch-dev/nunch-skills` 저장소와 `publish-npm.yml` workflow 파일, GitHub Environment 없음, `npm publish` 권한에 묶입니다. workflow는 GitHub OIDC를 사용하며 장기 `NODE_AUTH_TOKEN`을 받으면 안 됩니다.

npm `latest` dist-tag에는 안정 릴리스만 연결합니다. SessionStart 자동 업데이트는 현재보다 새로운 안정 SemVer만 받으며 prerelease, 같은 버전, downgrade 후보는 거부합니다. prerelease 검증에는 명시적으로 선택한 `latest`가 아닌 버전을 사용해야 하며, 설치된 안정 릴리스를 몰래 대체하면 안 됩니다.

## 승인 후 게시 순서

1. 이미 검증한 커밋을 가리키는 변경 불가능한 태그를 만들고 그 태그만 푸시합니다.
2. 태그로 시작된 검증 workflow가 성공할 때까지 기다립니다. 업로드된 tarball과 `SHA256SUMS`가 승인한 버전 및 커밋과 일치하는지 확인합니다.
3. 같은 변경 불가능한 태그에서 GitHub Release를 만들고 검증한 tarball, canonical manifest, checksum만 첨부합니다.
4. 게시된 GitHub Release의 asset을 새 디렉터리에 내려받습니다. GitHub asset digest를 확인하고 파일을 다시 쓰지 않은 채 `sha256sum -c SHA256SUMS`를 실행합니다.
5. 별도의 npm 승인을 받은 뒤 정확한 안정 태그로 `publish-npm.yml`을 수동 실행합니다. workflow는 해당 태그를 checkout하고 GitHub Release를 내려받아 3개 파일 표면, checksum, 커밋 식별자, canonical manifest, 포함된 패키지 manifest를 검증한 뒤 npm trusted publishing과 자동 provenance로 정확한 tarball을 게시합니다.
6. workflow가 성공할 때까지 기다립니다. workflow는 격리된 npm cache에서 정확히 게시된 버전으로 `install --help`와 `doctor --help`를 실행해야 합니다. npm에서 `@nunch-dev/skills@X.Y.Z`를 내려받아 SHA-256이 GitHub Release tarball과 일치하고 `latest`가 승인한 버전을 가리키는지 확인합니다.
7. 새 임시 `CODEX_HOME`에서 `npx @nunch-dev/skills@X.Y.Z install --no-tui --platform=codex --plugins=all`을 실행한 뒤 `npx @nunch-dev/skills@X.Y.Z doctor --verbose --platform=codex`를 실행합니다. `nunch-skills` hook 신뢰와 설치된 릴리스 식별자가 manifest와 일치하는지 확인합니다.
8. 별도의 새 임시 `CLAUDE_HOME`과 `CLAUDE_CONFIG_DIR`에서 `npx @nunch-dev/skills@X.Y.Z install --no-tui --platform=claude --plugins=all`을 실행한 뒤 `npx @nunch-dev/skills@X.Y.Z doctor --verbose --platform=claude`를 실행합니다. 설치된 `nunch-skills` 플러그인과 marketplace 출처가 릴리스와 일치하는지 확인합니다.

검증이나 게시 후 확인이 하나라도 실패하면 중단합니다. 같은 버전을 다시 게시하거나 태그를 다시 붙이거나 force-push하거나 artifact를 교체하지 않습니다. 변경할 수 없는 실패를 조사하고 새 버전을 준비한 뒤 다음 원격 게시에 대해 새 승인을 받습니다.
