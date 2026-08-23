# nunch-skills

Codex와 Claude Code에서 함께 사용할 수 있는 플러그인 마켓플레이스입니다. Codex의 권장 설치·갱신 경로는 release-pinned npm CLI인 `@nunch-dev/skills`입니다. CLI에는 Node.js 22 이상과 npm 또는 pnpm이 필요하며, 실제 plugin lifecycle은 포함된 플랫폼별 manager binary가 처리합니다.

## 플러그인

| 플러그인 | 포함된 스킬 | 설명 |
| --- | --- | --- |
| `deep-interview` | `deep-interview` | 모호한 요청을 인터뷰해 실행 가능한 스펙으로 정리합니다. |
| `kaneo-skills` | `kaneo-skills` | 자연어 작업을 한국어 Kaneo Todo 이슈로 등록합니다. |
| `humanize-korean` | `humanize-korean`, `humanize`, `humanize-redo` | AI가 작성한 한국어 문장을 자연스럽게 윤문합니다. |
| `i-have-adhd` | `i-have-adhd` | 응답을 행동 우선의 ADHD 친화적 형식으로 구성합니다. |
| `git-tools` | `git-tools` | 원자적 한글 커밋부터 이력·worktree·branch·remote·복구까지 Git porcelain을 안전하게 처리합니다. |
| `nunch-skills-manager` | Codex 전용 lifecycle manager | 설치, 의존성 진단, release 검증과 자동 갱신을 관리합니다. |

## Codex lifecycle CLI

`@nunch-dev/skills`는 `nunch-skills` 명령 하나로 설치, 갱신, 진단, 제거를 제공합니다. 최초 `npx` 또는 `pnpm dlx` 실행은 npm이 전달한 launcher와 package를 실행하는 bootstrap trust 경계입니다. npm registry integrity, provenance, `@nunch-dev`의 최초 publish 권한·인증 통제가 이 초기 신뢰를 완화하지만, 첫 실행 자체를 Git 검증만으로 대체할 수는 없습니다.

Bootstrap 뒤에는 npm package가 Codex 설정이나 hook 신뢰 상태를 임의로 바꾸지 않습니다. 명시적인 `install`, `update`, `uninstall`만 lifecycle 변경을 요청할 수 있으며, 그 요청도 dual npm+Git verification이 완료되기 전에는 marketplace, plugin, `config.toml`, hook trust를 변경하지 않습니다.

```bash
npx @nunch-dev/skills install
pnpm dlx @nunch-dev/skills install
```

기본 설치는 `nunch-skills-manager`만 대상으로 합니다. 필요한 skill은 이름으로 추가하고, 전체 설치는 `--all`을 명시합니다.

```bash
# manager와 git-tools만 설치
npx @nunch-dev/skills install git-tools

# 모든 nunch-skills plugin 설치
npx @nunch-dev/skills install --all

# 실제 변경 없이 설치 대상을 미리 확인
npx @nunch-dev/skills install git-tools --dry-run
```

설치 후 상태와 개별 skill의 실행 의존성을 확인합니다.

```bash
npx @nunch-dev/skills doctor
```

`doctor`는 dependency, release integrity, 중단된 transaction, manager hook trust, resource ownership을 구분해 보고합니다. 누락된 Python·uv·Git 같은 실행 의존성은 진단만 하며 자동으로 시스템 패키지를 설치하지 않습니다.

### 갱신과 자동 갱신

수동 갱신은 다음 명령으로 실행합니다.

```bash
npx @nunch-dev/skills update
pnpm dlx @nunch-dev/skills update
```

설치가 완료된 뒤에는 신뢰된 manager의 SessionStart hook도 새 release를 확인합니다. 이 경로는 `main`이나 이동 가능한 tag를 신뢰 기준으로 사용하지 않습니다. 현재 신뢰된 manager가 npm tarball과 immutable Git tag·full commit을 별도로 읽고, canonical release manifest에 기록된 marketplace, manager manifest, hook, launcher script, 플랫폼별 binary digest를 모두 비교합니다. 검증 전에는 candidate release의 코드를 실행하거나 Codex marketplace, plugin, `config.toml`, hook trust를 바꾸지 않습니다.

자동 SessionStart update는 현재 release보다 엄격히 높은 stable SemVer만 수용합니다. prerelease와 같은 버전 또는 downgrade candidate는 자동 적용하지 않습니다. 검증을 통과한 candidate만 non-manager plugin, manager, 정확한 hook trust 순서로 staged 적용하고 최종 검증 뒤에 완료 상태를 기록합니다. 어느 단계든 실패하면 installer가 소유한 변경만 마지막 정상 release로 되돌리고 기존 설치와 trust 상태를 유지합니다.

### Hook trust와 실패 시 동작

`install`은 release manifest와 실제 설치 결과가 모두 일치할 때에만 `nunch-skills-manager`가 소유한 SessionStart hook 한 개의 신뢰 해시를 등록합니다. 다른 plugin이나 사용자가 등록한 hook은 읽거나 변경하지 않습니다.

검증이 실패하거나 hook 정의가 release manifest와 일치하지 않으면 fail closed 합니다. 즉, 새 hook을 자동 신뢰하지 않고 plugin·설정의 기존 상태를 유지합니다. 이 경우 원인을 `doctor`로 확인한 뒤, 필요하면 Codex의 `/hooks`에서 표시된 manager hook을 직접 검토하고 신뢰할 수 있습니다. `/hooks`에서의 수동 신뢰는 release-pinned lifecycle 검증을 우회하는 것이므로, digest 불일치 원인을 해결하기 전에는 권장하지 않습니다.

### 제거

제거는 installer ownership ledger에서 `created`로 기록한 항목만 기본 대상으로 삼습니다. 설치 전부터 있던 plugin, marketplace, hook trust, adopted resource와 manager 상태 데이터는 보존합니다. 먼저 preview를 출력하며, interactive 확인 또는 `--yes`가 있어야 실제 제거합니다.

```bash
# 변경 없이 제거 대상을 확인
npx @nunch-dev/skills uninstall --dry-run

# preview된 created resource만 비대화형으로 제거
npx @nunch-dev/skills uninstall --yes
```

## Codex plugin 직접 설치

개별 plugin을 연구하거나 개발 중에 Codex 명령을 직접 사용할 수도 있습니다.

```bash
codex plugin marketplace add nunch-dev/nunch-skills
codex plugin add deep-interview@nunch-skills
```

이 경로는 npm lifecycle ownership ledger와 release-pinned 자동 trust를 만들지 않습니다. `nunch-skills-manager`를 직접 설치했다면 `/hooks`에서 SessionStart hook을 직접 검토·승인해야 합니다. 일반 사용에는 lifecycle CLI를 권장합니다.

## 의존성 초기화

각 plugin은 root `dependencies.json`에 실행·연결 의존성을 선언합니다. 설치된 plugin 집합이나 버전이 바뀐 뒤 첫 Codex 작업에서 manager hook이 같은 작업 안에 초기화 결과를 전달합니다. 의존성 알림을 받았거나 직접 점검하려면 다음 명령을 사용합니다.

```bash
npx @nunch-dev/skills doctor
```

실제 패키지 설치는 시스템을 변경하므로, 사용할 패키지 관리자와 명령을 먼저 검토하고 승인한 뒤 진행해야 합니다. Kaneo MCP처럼 실행 파일이 아닌 연결 의존성은 자동 설치하지 않고 필요한 설정을 안내합니다.

## 업스트림 동기화

외부 프로젝트에서 가져온 `i-have-adhd`와 `humanize-korean`은 매일 KST 04:00에 GitHub Actions가 원본의 `main` branch를 확인합니다. 변경이 있으면 관리 대상으로 선언된 파일만 교체하고, 원본 버전과 commit SHA를 반영한 `automation/sync-upstream-plugins` PR을 생성하거나 갱신합니다. `main`에 직접 반영하지 않으므로 diff를 검토한 뒤 병합할 수 있습니다.

동기화 대상과 복사 경로는 `.github/upstreams.json`, 마지막으로 반영한 commit은 `.github/upstreams.lock.json`에서 관리합니다. 로컬에서는 Go 1.23 이상과 Git을 준비한 뒤 다음 명령으로 같은 동작을 실행합니다.

```bash
cd tools/upstream-sync
go run . -root ../..
```

동기화 시 원본 버전에 `+upstream.<commit SHA 12자리>` build metadata를 붙여 Codex와 Claude manifest에 함께 기록합니다. 따라서 원본이 자체 버전을 올리지 않은 변경도 설치 버전 변경으로 감지됩니다. PR이 병합되면 `nunch-skills-manager`의 기존 배포 업데이트가 새 플러그인 버전을 설치 사용자에게 전달합니다.

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
plugins/nunch-skills-manager/bin/   OS·아키텍처별 lifecycle binary
docs/release-runbook.md             검증·publish 승인 절차
```

각 plugin은 설치 시 자체 완결된 디렉터리로 복사됩니다. manager plugin 자체의 manifest와 release artifact가 바뀌면 plugin version과 release metadata를 함께 갱신해야 합니다. Git commit만 바뀌고 버전이 같으면 Codex는 기존 plugin 설치 버전을 유지할 수 있습니다.

## 런타임 요구사항

Lifecycle CLI에는 Node.js 22 이상과 npm 또는 pnpm이 필요합니다. manager는 macOS, Linux, Windows의 ARM64·x64 binary를 포함하므로 Go, Python, uv, Bun을 설치할 필요는 없습니다. 다만 개별 skill은 실행 중 외부 명령이나 연결을 사용할 수 있습니다.

| 플러그인 | 실행·연결 의존성 |
| --- | --- |
| `deep-interview` | Python 3.11 이상, uv |
| `humanize-korean` | Python 3.11 이상 |
| `git-tools` | Git |
| `kaneo-skills` | 연결된 Kaneo MCP |

manager는 `python3`와 `python`을 모두 확인합니다. 실행 파일이 누락되거나 Python 버전이 낮아도 기존 플러그인을 삭제하거나 자동 업데이트 전체를 실패 처리하지 않습니다.

## 릴리스

릴리스 artifact는 npm version, immutable Git tag, full commit SHA와 canonical digest manifest를 한 단위로 검증합니다. 로컬 검증은 [release runbook](docs/release-runbook.md)을 따릅니다. Git tag·push, npm publish, GitHub release 생성은 모두 원격 상태를 바꾸므로 실행 직전에 각각 범위와 대상을 확인하고 별도 승인을 받아야 합니다.
