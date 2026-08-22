# nunch-skills

Codex와 Claude Code에서 함께 사용할 수 있는 플러그인 마켓플레이스입니다. 설치 과정에서 Bun, Node.js, Python 같은 별도 런타임을 사용하지 않습니다.

## 플러그인

| 플러그인 | 포함된 스킬 | 설명 |
| --- | --- | --- |
| `deep-interview` | `deep-interview` | 모호한 요청을 인터뷰해 실행 가능한 스펙으로 정리합니다. |
| `kaneo-skills` | `kaneo-skills` | 자연어 작업을 한국어 Kaneo Todo 이슈로 등록합니다. |
| `humanize-korean` | `humanize-korean`, `humanize`, `humanize-redo` | AI가 작성한 한국어 문장을 자연스럽게 윤문합니다. |
| `i-have-adhd` | `i-have-adhd` | 응답을 행동 우선의 ADHD 친화적 형식으로 구성합니다. |
| `git-tools` | `git-tools` | 원자적 한글 커밋부터 이력·worktree·branch·remote·복구까지 Git porcelain을 안전하게 처리합니다. |
| `nunch-skills-manager` | Codex 전용 updater | 설치된 nunch-skills 플러그인을 하루 한 번 자동으로 갱신합니다. |

## Codex 설치

```bash
codex plugin marketplace add nunch-dev/nunch-skills
codex plugin add nunch-skills-manager@nunch-skills
codex plugin add deep-interview@nunch-skills
```

manager의 SessionStart hook을 최초 한 번 승인하면 별도의 예약 작업 없이 자동 업데이트가 활성화됩니다. manager는 Codex가 이미 설치한 `nunch-skills` 플러그인만 유지하며, 사용자가 선택하지 않은 플러그인을 새로 설치하지 않습니다. 설치된 플러그인에 필요한 실행 파일도 함께 점검하고, 누락된 항목은 다음 Codex 작업에서 알립니다.

설치 가능한 목록은 다음 명령으로 확인합니다.

```bash
codex plugin list
```

manager는 Codex 시작 시 백그라운드에서 동작하며 다음 순서로 갱신합니다.

1. 최근 성공한 확인으로부터 24시간이 지났는지 확인합니다.
2. `codex plugin marketplace upgrade nunch-skills`로 등록된 Git ref를 갱신합니다.
3. 사용자가 이미 설치한 플러그인만 `codex plugin add`로 갱신합니다.
4. Codex가 반환한 설치 버전이 달라진 항목을 기록합니다.
5. 다음 Codex 작업에서 실제 변경된 플러그인을 알립니다.
6. 설치된 플러그인의 Python·uv·Git 요구사항을 확인하고 누락 항목을 알립니다.

의존성 알림을 받았거나 직접 점검하려면 Codex에 다음처럼 요청합니다.

```text
nunch-skills 의존성을 확인하고 설치해줘.
```

각 플러그인은 root `dependencies.json`에 실행·연결 의존성을 선언합니다. 설치된 플러그인 집합이나 버전이 바뀐 뒤 첫 Codex 작업에서 manager hook이 같은 작업 안에 초기화 결과를 전달합니다. Manager의 `nunch-skills-manager` 스킬은 번들 doctor를 실행해 설치된 플러그인에 필요한 항목만 찾습니다. 실제 패키지 설치는 시스템을 변경하므로, 사용할 패키지 관리자와 명령을 먼저 보여주고 승인을 받은 뒤 진행합니다. Kaneo MCP처럼 실행 파일이 아닌 연결 의존성은 자동 설치하지 않고 필요한 설정을 안내합니다.

네트워크 또는 업데이트 명령이 실패하면 기존 설치를 유지하고 30분 뒤 다시 시도합니다. 자동 업데이트를 끄려면 Codex 실행 환경에 다음 값을 설정합니다.

```bash
export NUNCH_SKILLS_AUTO_UPDATE_DISABLED=1
```

수동 갱신도 계속 사용할 수 있습니다.

```bash
codex plugin marketplace upgrade nunch-skills
codex plugin add deep-interview@nunch-skills
```

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
plugins/<name>/.codex-plugin/       Codex manifest
plugins/<name>/.claude-plugin/      Claude Code manifest
plugins/<name>/skills/              두 제품이 공유하는 스킬 콘텐츠
plugins/nunch-skills-manager/bin/   OS·아키텍처별 정적 updater
```

각 플러그인은 설치 시 자체 완결된 디렉터리로 복사됩니다.

자동 업데이트가 동작하려면 변경된 플러그인의 manifest와 marketplace entry에서 버전을 함께 올려야 합니다. Git commit만 바뀌고 버전이 같으면 Codex는 기존 설치 버전을 유지합니다. manager 자체 hook이 변경된 릴리스는 Codex가 hook 재승인을 요청할 수 있습니다.

## 런타임 요구사항

플러그인 설치와 manager 실행에는 Codex 또는 Claude Code 외의 런타임이 필요하지 않습니다. manager는 macOS, Linux, Windows의 ARM64·x64 정적 바이너리를 포함합니다. 다만 개별 스킬이 실행 중 외부 명령이나 연결을 사용할 수 있습니다.

| 플러그인 | 실행·연결 의존성 |
| --- | --- |
| `deep-interview` | Python 3.11 이상, uv |
| `humanize-korean` | Python 3.11 이상 |
| `git-tools` | Git |
| `kaneo-skills` | 연결된 Kaneo MCP |

manager는 `python3`와 `python`을 모두 확인합니다. 실행 파일이 누락되거나 Python 버전이 낮아도 기존 플러그인을 삭제하거나 자동 업데이트 전체를 실패 처리하지 않습니다.
