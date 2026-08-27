# Local development and QA

로컬 검증은 빠른 피드백, 전체 gate, 격리된 CLI 직접 실행의 세 단계로 나눕니다. Node.js 22 이상과 pnpm이 필요하며, 플랫폼 연동을 확인할 때는 Codex CLI 또는 Claude Code CLI도 필요합니다.

## 빠른 개발 루프

변경 중에는 관련 테스트 파일을 직접 실행하거나 세 그룹을 병렬 실행합니다.

```bash
node --experimental-strip-types --test npm/test/public-cli.test.ts
pnpm run test:fast
```

`test:fast`는 package surface, TypeScript runtime, upstream sync 테스트를 독립 프로세스로 동시에 실행합니다. 한 그룹이라도 실패하면 전체 명령이 실패합니다.

## 전체 검증

코드 변경을 마치면 정적 검사, bundle, 전체 테스트, npm package surface를 한 번에 검증합니다.

```bash
pnpm run check
```

이 명령은 다음 순서로 실행됩니다.

```text
typecheck → lint → build → test → pack:check
```

PR에서는 `.github/workflows/ci.yml`이 빠른 테스트, 정적 검사, build/package 검사를 별도 job으로 실행합니다.

`pack:check`는 실제 npm tarball을 만든 뒤 격리된 임시 디렉터리에서 그 tarball의 `install --help`와 `doctor --help`를 실행합니다. package surface가 있어도 launcher가 오래되었거나 실행되지 않는 문제를 이 단계에서 차단합니다.

## CLI 직접 실행

TypeScript 소스를 바로 실행하면 build 없이 명령 동작을 확인할 수 있습니다.

```bash
pnpm run dev:cli --help
pnpm run dev:cli install --help
pnpm run dev:cli doctor --status --platform=codex
```

실제 사용자 설정을 건드리지 않고 설치 과정을 직접 시험하려면 먼저 임시 홈을 준비합니다.

```bash
source scripts/qa-sandbox.sh
pnpm run dev:cli install
pnpm run dev:cli doctor --verbose --platform=codex
```

`qa-sandbox.sh`는 `CODEX_HOME`, `CLAUDE_HOME`, `CLAUDE_CONFIG_DIR`, XDG 경로를 하나의 임시 디렉터리 아래로 지정합니다. 경로는 `NUNCH_SKILLS_QA_SANDBOX`에서 확인할 수 있습니다.

개발 체크아웃에는 `release-manifest.json`이 없으므로 Codex install은 installer hook 신뢰 단계에서 fail closed 합니다. 이것은 의도된 동작입니다. 샌드박스에서는 Claude 플랫폼 설치와 Codex 마켓플레이스·plugin 단계까지 확인할 수 있고, hook 신뢰 등록까지 검증하려면 GitHub Release 배포 후 npm 패키지 경로(`npx @nunch-dev/skills install`)로 진행하세요.

build 결과가 실제 배포용 launcher에서도 같은지 확인합니다.
```bash
pnpm run build
node npm/bin/nunch-skills.mjs --help
node npm/bin/nunch-skills.mjs doctor --status --platform=codex
```

현재 checkout을 플랫폼의 local marketplace로 직접 확인하려면 같은 sandbox에서 플랫폼 CLI를 실행합니다.

```bash
codex plugin marketplace add "$PWD" --json
codex plugin list --marketplace nunch-skills --json --available

claude plugin marketplace add "$PWD" --scope user
claude plugin list --json
```

`docs-fairy`를 배포하기 전에는 양쪽 marketplace 발견과 실제 read-only 호출을 격리된 홈에서 확인합니다. 이 gate는 모델의 문구나 문서 결과를 비교하지 않고 호출 성공, skill/reference 로딩 오류 부재, fixture 무변경만 검사합니다.

```bash
scripts/qa-docs-fairy-smoke.sh
```

Codex와 Claude CLI 인증이 모두 필요합니다. 실행 로그와 응답은 명령이 출력한 QA sandbox의 `docs-fairy-evidence/`에 남습니다.

작업이 끝나면 `rm -rf "$NUNCH_SKILLS_QA_SANDBOX"`로 임시 홈을 지웁니다. 이 명령은 값이 출력한 임시 경로인지 확인한 뒤 실행합니다. release-pinned npm/Git 검증은 release workflow와 staged package 검증이 담당합니다.
