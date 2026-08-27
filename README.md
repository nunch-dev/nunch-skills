# nunch-skills

Codex와 Claude Code에서 함께 사용할 수 있는 플러그인 마켓플레이스입니다. Codex의 권장 설치·갱신 경로는 release-pinned npm CLI인 `@nunch-dev/skills`입니다. CLI와 installer는 Node.js 22 이상의 TypeScript bundle로 동작합니다.

## 플러그인

| 플러그인 | 포함된 스킬 | 설명 | 문서 |
| --- | --- | --- | --- |
| `deep-interview` | `deep-interview` | 모호한 요청을 인터뷰해 실행 가능한 스펙으로 정리합니다. | [가이드](docs/skills/deep-interview.md) |
| `kaneo-skills` | `kaneo-skills` | 자연어 작업을 한국어 Kaneo Todo 이슈로 등록합니다. | [가이드](docs/skills/kaneo-skills.md) |
| `humanize-korean` | `humanize-korean`, `humanize`, `humanize-redo` | AI가 작성한 한국어 문장을 자연스럽게 윤문합니다. | [오케스트레이터](docs/skills/humanize-korean.md) · [진입 명령](docs/skills/humanize.md) · [재윤문](docs/skills/humanize-redo.md) |
| `i-have-adhd` | `i-have-adhd` | 응답을 행동 우선의 ADHD 친화적 형식으로 구성합니다. | [가이드](docs/skills/i-have-adhd.md) |
| `git-tools` | `git-tools` | 원자적 한글 커밋부터 이력·worktree·branch·remote·복구까지 Git porcelain을 안전하게 처리합니다. | [가이드](docs/skills/git-tools.md) |
| `nch-installer` | `nch-installer` | 설치, 의존성 진단, release 검증과 자동 갱신을 관리합니다. | [가이드](docs/skills/nch-installer.md) |

전체 문서 색인은 [스킬 문서](docs/skills/README.md), 개발·로컬 QA는 [개발 가이드](docs/local-development.md), 배포 운영 절차는 [release runbook](docs/release-runbook.md)에서 확인할 수 있습니다.

## Codex와 Claude Code lifecycle CLI

`@nunch-dev/skills`는 `nunch-skills` 명령 하나로 설치, 갱신, 진단, 제거를 제공합니다. 최초 `npx` 또는 `pnpm dlx` 실행은 npm이 전달한 launcher와 package를 실행하는 bootstrap trust 경계입니다. npm registry integrity, provenance, `@nunch-dev`의 최초 publish 권한·인증 통제가 이 초기 신뢰를 완화하지만, 첫 실행 자체를 Git 검증만으로 대체할 수는 없습니다.

공개 CLI는 omo와 같은 subcommand 구조를 사용합니다. `install`과 별칭 `setup`은 대화형 설치를 시작하고, `doctor`는 TTY 없이도 실행됩니다. Codex 작업은 dual npm+Git verification을 마친 뒤에만 marketplace, plugin, `config.toml`, hook trust를 변경합니다. Claude Code 작업은 marketplace가 `github:nunch-dev/nunch-skills`인지 확인한 뒤에만 plugin을 변경합니다.

```bash
npx @nunch-dev/skills install
pnpm dlx @nunch-dev/skills install
bunx @nunch-dev/skills install
```

설치 과정은 플랫폼 선택 → Node.js·Git·대상 CLI 사전 점검 → leaf plugin 선택 → npm·Git release 검증 → marketplace → plugin → installer hook trust → 최종 검증 순서입니다. 플랫폼은 Codex, Claude Code 또는 둘 다를 선택할 수 있습니다. Codex에는 `nch-installer` 를 통해 hook trust가 함께 설치되며, Claude Code에는 선택한 leaf plugin만 설치됩니다.

CI나 bootstrap script에서는 모든 값을 명시한 비대화식 설치를 사용할 수 있습니다. `--plugins`에는 쉼표 구분 이름, `all`, `none`을 지정합니다.

```bash
npx @nunch-dev/skills install --no-tui --platform=both --plugins=all
```

telemetry는 최초 실행부터 기본 활성화되며 `settings` 명령 또는 `NUNCH_SKILLS_TELEMETRY_DISABLED=1`로 끌 수 있습니다. 전송 항목은 임의 installation ID, CLI 버전, OS·architecture, 작업 종류와 결과, 시간 구간, 선택한 plugin ID로 제한합니다. prompt, 파일 경로, 명령 출력, 원문 오류와 개인 프로필은 전송하지 않습니다. Installer 전체 삭제 시 installation ID를 포함한 로컬 lifecycle·telemetry 데이터도 함께 제거합니다.

```bash
npx @nunch-dev/skills settings
```

설치 후 상태와 개별 skill의 실행 의존성을 확인합니다.

```bash
npx @nunch-dev/skills doctor
```

`doctor`는 실행 파일, 설치된 plugin, dependency, release integrity, 중단된 transaction, installer hook trust, resource ownership을 구분해 병렬로 검사합니다. 기본 출력은 문제만 보여주고 `--status`는 간결한 대시보드, `--verbose`는 전체 상세와 조치, `--json`은 자동화용 구조를 출력합니다. `--platform=codex` 또는 `--platform=claude`로 범위를 좁힐 수 있습니다. 누락된 실행 의존성은 진단만 하며 자동으로 시스템 패키지를 설치하지 않습니다.

```bash
npx @nunch-dev/skills doctor --status
npx @nunch-dev/skills doctor --verbose --platform=codex
npx @nunch-dev/skills doctor --json
```

### 갱신과 자동 갱신

수동 갱신은 `update` 명령을 사용합니다. `--platform`을 생략하면 TTY에서 대상을 묻습니다.

```bash
npx @nunch-dev/skills update --platform=both
```

Codex 설치가 완료된 뒤에는 신뢰된 installer의 SessionStart hook도 새 release를 확인합니다. 현재 installer가 npm tarball을 scripts 없이 내려받고 immutable Git tag·full commit과 canonical manifest의 marketplace, installer manifest, hook, dispatcher, TypeScript runtime digest를 교차 검증합니다. 검증 전에는 candidate code를 실행하거나 Codex 상태를 바꾸지 않습니다.

Codex 자동 SessionStart update는 현재 release보다 엄격히 높은 stable SemVer만 수용합니다. prerelease와 같은 버전 또는 downgrade candidate는 자동 적용하지 않습니다. 검증을 통과한 candidate만 non-installer plugin, installer, 정확한 hook trust 순서로 staged 적용하고 최종 검증 뒤에 완료 상태를 기록합니다. 어느 단계든 실패하면 installer가 소유한 변경만 마지막 정상 release로 되돌리고 기존 설치와 trust 상태를 유지합니다.

### Hook trust와 실패 시 동작

Codex `install`은 release manifest와 실제 설치 결과가 모두 일치할 때에만 `nch-installer`가 소유한 SessionStart hook 한 개의 신뢰 해시를 등록합니다. 다른 plugin이나 사용자가 등록한 hook은 읽거나 변경하지 않습니다.

Codex 검증이 실패하거나 hook 정의가 release manifest와 일치하지 않으면 fail closed 합니다. 즉, 새 hook을 자동 신뢰하지 않고 plugin·설정의 기존 상태를 유지합니다. 이 경우 원인을 `doctor`로 확인한 뒤, 필요하면 Codex의 `/hooks`에서 표시된 installer hook을 직접 검토하고 신뢰할 수 있습니다. `/hooks`에서의 수동 신뢰는 release-pinned lifecycle 검증을 우회하는 것이므로, digest 불일치 원인을 해결하기 전에는 권장하지 않습니다.

### 제거

`uninstall` 명령에는 ownership ledger에서 `created`로 기록한 leaf plugin만 표시됩니다. installer 제거를 고르면 created plugin, installer trust, 비어 있는 created marketplace를 함께 정리하는 full teardown으로 전환되며 adopted·pre-existing 자원은 보존합니다.

```bash
npx @nunch-dev/skills uninstall --platform=codex
```

## Codex plugin 직접 설치

개별 plugin을 연구하거나 개발 중에 Codex 명령을 직접 사용할 수도 있습니다.

```bash
codex plugin marketplace add nunch-dev/nunch-skills
codex plugin add deep-interview@nunch-skills
```

이 경로는 npm lifecycle ownership ledger와 release-pinned 자동 trust를 만들지 않습니다. `nch-installer`를 직접 설치했다면 `/hooks`에서 SessionStart hook을 직접 검토·승인해야 합니다. 일반 사용에는 lifecycle CLI를 권장합니다.

## 의존성 초기화

각 plugin은 root `dependencies.json`에 실행·연결 의존성을 선언합니다. 설치된 plugin 집합이나 버전이 바뀐 뒤 첫 Codex 작업에서 installer hook이 같은 작업 안에 초기화 결과를 전달합니다. 의존성 알림을 받았거나 직접 점검하려면 다음 명령을 사용합니다.

```bash
npx @nunch-dev/skills doctor --verbose
```

실제 패키지 설치는 시스템을 변경하므로, 사용할 패키지 관리자와 명령을 먼저 검토하고 승인한 뒤 진행해야 합니다. Kaneo MCP처럼 실행 파일이 아닌 연결 의존성은 자동 설치하지 않고 필요한 설정을 안내합니다.

## 업스트림 동기화

외부 프로젝트에서 가져온 `i-have-adhd`와 `humanize-korean`은 매일 KST 04:00에 GitHub Actions가 원본의 `main` branch를 확인합니다. 변경이 있으면 관리 대상으로 선언된 파일만 교체하고, 원본 버전과 commit SHA를 반영한 `automation/sync-upstream-plugins` PR을 생성하거나 갱신합니다. `main`에 직접 반영하지 않으므로 diff를 검토한 뒤 병합할 수 있습니다.

### 업스트림 출처

| 원본 프로젝트 | 이 저장소의 플러그인 | 원저자 | 현재 동기화 기준 | 라이선스 |
| --- | --- | --- | --- | --- |
| [`ayghri/i-have-adhd`](https://github.com/ayghri/i-have-adhd) | `i-have-adhd` | [Ayoub G.](https://github.com/ayghri) | [`b42a45a`](https://github.com/ayghri/i-have-adhd/commit/b42a45a068e080294924bfba19a7a2e8944c48ff) | MIT |
| [`epoko77-ai/im-not-ai`](https://github.com/epoko77-ai/im-not-ai) | `humanize-korean`, `humanize`, `humanize-redo` | [epoko77-ai](https://github.com/epoko77-ai) | [`c4d03d4`](https://github.com/epoko77-ai/im-not-ai/commit/c4d03d4859acda143f0b04b4bbdb56c5e6a94db1) | MIT |

각 원본의 저작권 고지와 MIT 전문은 [`plugins/i-have-adhd/LICENSE`](plugins/i-have-adhd/LICENSE)와 [`plugins/humanize-korean/LICENSE`](plugins/humanize-korean/LICENSE)에 보존합니다. `im-not-ai`는 원본 프로젝트명이며 이 marketplace에서는 한국어 윤문 기능을 `humanize-korean` 플러그인으로 제공합니다.

동기화 대상과 복사 경로는 `.github/upstreams.json`, 마지막으로 반영한 commit은 `.github/upstreams.lock.json`에서 관리합니다. 로컬에서는 Node.js 22 이상과 Git을 준비한 뒤 다음 명령으로 같은 동작을 실행합니다.

```bash
pnpm run build
node tools/upstream-sync/dist/upstream-sync.mjs -root .
```

동기화 시 원본 버전에 `+upstream.<commit SHA 12자리>` build metadata를 붙여 Codex와 Claude manifest에 함께 기록합니다. 따라서 원본이 자체 버전을 올리지 않은 변경도 설치 버전 변경으로 감지됩니다. PR이 병합되면 `nch-installer`의 기존 배포 업데이트가 새 플러그인 버전을 설치 사용자에게 전달합니다.

## Claude Code 설치

```bash
claude plugin marketplace add nunch-dev/nunch-skills
claude plugin install deep-interview@nunch-skills
```

다른 플러그인은 두 번째 명령의 이름만 바꿉니다. 업데이트는 다음 명령을 사용합니다.

```bash
claude plugin marketplace update nunch-skills
claude plugin update deep-interview@nunch-skills
```

## 저장소 구조

```text
.agents/plugins/marketplace.json    Codex 마켓플레이스
.claude-plugin/marketplace.json     Claude Code 마켓플레이스
npm/                                npm launcher·package verification
plugins/<name>/.codex-plugin/       Codex manifest
plugins/<name>/.claude-plugin/      Claude Code manifest
plugins/<name>/skills/              두 제품이 공유하는 스킬 콘텐츠
plugins/nch-installer/runtime/      TypeScript lifecycle runtime
tools/upstream-sync/                TypeScript upstream synchronization tool
docs/release-runbook.md             검증·publish 승인 절차
```

각 plugin은 설치 시 자체 완결된 디렉터리로 복사됩니다. installer plugin 자체의 manifest와 release artifact가 바뀌면 plugin version과 release metadata를 함께 갱신해야 합니다. Git commit만 바뀌고 버전이 같으면 Codex는 기존 plugin 설치 버전을 유지할 수 있습니다.

## 런타임 요구사항

Lifecycle CLI와 installer에는 Node.js 22 이상이 필요하며 npm, pnpm, Bun 중 어떤 실행 경로로도 사용할 수 있습니다. 저장소 개발과 검증은 pnpm을 기준으로 합니다. lifecycle runtime은 동일한 ESM bundle을 macOS, Linux, Windows에서 실행하며 Go, Python, uv는 필요하지 않습니다. 다만 개별 skill은 실행 중 외부 명령이나 연결을 사용할 수 있습니다.

| 플러그인 | 실행·연결 의존성 |
| --- | --- |
| `deep-interview` | Python 3.11 이상, uv |
| `humanize-korean` | Python 3.11 이상 |
| `git-tools` | Git |
| `kaneo-skills` | 연결된 Kaneo MCP |

installer는 `python3`와 `python`을 모두 확인합니다. 실행 파일이 누락되거나 Python 버전이 낮아도 기존 플러그인을 삭제하거나 자동 업데이트 전체를 실패 처리하지 않습니다.

## 릴리스

릴리스 artifact는 npm version, immutable Git tag, full commit SHA와 canonical digest manifest를 한 단위로 검증합니다. 검증된 GitHub Release를 배포 원본으로 확정한 뒤, Release에서 다시 내려받아 검증한 tarball만 GitHub OIDC trusted publishing과 provenance로 npm에 게시합니다. 로컬 검증은 [release runbook](docs/release-runbook.md)을 따릅니다. Git tag·push, GitHub Release 생성, npm workflow dispatch는 모두 원격 상태를 바꾸므로 실행 직전에 각각 범위와 대상을 확인하고 별도 승인을 받아야 합니다.
