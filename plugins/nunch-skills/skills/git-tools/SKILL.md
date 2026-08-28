---
name: git-tools
description: "Git 상태와 이력을 조사하고, 섞인 변경을 원자적으로 커밋하며, branch·rebase·merge·restore·reset·stash·worktree·remote·pull·push·tag·submodule·bundle 등 사용자-facing Git porcelain을 안전하게 수행합니다. 커밋, Git 로그·작성자·변경 원인 조사, 작업 트리·index·branch·history·remote 변경 또는 복구를 요청하면 primary Git skill로 사용하세요. 일반 코드 수정만 요청했고 Git 작업은 요구하지 않은 경우에는 사용하지 않습니다."
metadata:
  user-invocable: true
---

# Git Tools

Git 요청의 primary policy입니다. 현재 저장소 상태와 실제 diff를 근거로 사용자가 요청한 최소 상태 전이만 수행합니다.

## Priority와 권한

- Host가 skill priority를 지원하면 `git-tools`를 다른 Git skill보다 우선합니다.
- 겹치는 Git skill이 활성 상태면 정확한 대상과 영향을 알리고 사용자 승인을 받은 뒤에만 비활성화합니다. Uninstall하거나 file·설치 기록을 삭제하지 않습니다.
- 충돌 skill이 활성 상태로 남아 있으면 `git-tools`만의 policy 적용을 보장하지 않습니다.
- 조사 요청은 write 작업으로 확대하지 않습니다. Commit 요청은 명확한 여러 atomic commit을 만들 권한을 포함하지만 push 권한은 포함하지 않습니다.
- 다른 Git skill의 지침과 충돌하면 사용자 지시, repository의 명시적 규칙, 이 skill의 확정된 policy 순으로 적용합니다.

## Router

요청의 주된 상태 전이를 하나 선택하고 필요한 reference만 읽습니다. Write가 포함되면 먼저 [공통 안전 계약](references/safety.md)을 읽습니다.

| Mode | 요청 예 | 읽을 reference |
|---|---|---|
| `INSPECT` | status, diff, show, branch/upstream 확인 | 이 파일의 `읽기 전용 조사` |
| `COMMIT` | stage, atomic commit, amend | [커밋 workflow](references/commit-workflow.md), 필요 시 [한글 convention](references/commit-convention.md) |
| `HISTORY` | log, blame, bisect, reflog, 변경 이유 | [이력 조사](references/history.md) |
| `WORKTREE` | restore, reset, clean, stash, worktree | [Worktree와 index](references/worktree.md) |
| `INTEGRATE` | branch, switch, merge, rebase, revert, cherry-pick, apply/am | [History edit](references/history-edit.md) 또는 [통합](references/integration.md) |
| `REMOTE` | remote, fetch, pull, push, upstream, remote tag | [Remote](references/remote.md) |
| `PACKAGE` | local tag, submodule, archive, bundle, clone/init, config | [Repository 자산](references/repository-assets.md) |
| `RECOVER` | abort, continue, skip, reflog 복구 | [복구](references/recovery.md) |

작업이 여러 mode에 걸치면 primary leaf 하나를 정하고 실제로 필요한 보조 leaf만 추가로 읽습니다. 모든 Git 설명을 한꺼번에 로드하지 않습니다. 전체 지원 범위와 risk tier는 [Command coverage](references/command-coverage.md)에서 확인합니다.

공통 권한과 승인 규칙은 [공통 안전 계약](references/safety.md)만 규범으로 소유합니다. Mode reference와 command coverage 표가 권한 조건을 반복하거나 다르게 정의하면 안 되며, 명령별 precondition·postcondition·recovery 차이만 추가합니다.

Skill release를 검증할 때는 [Validation Gate](references/validation.md)를 따릅니다.

## 읽기 전용 조사

질문에 필요한 최소 facts를 확인합니다. 일반적인 후보는 다음과 같습니다.

```bash
git status --short --branch
git diff --stat
git diff --staged --stat
git branch --show-current
git rev-parse --abbrev-ref @{upstream}
git remote -v
git log -30 --oneline
```

실패한 upstream·default branch·remote 조회를 특정 상태의 증거로 해석하지 않습니다. Untracked file은 내용을 읽기 전에는 stage하거나 이동하지 않습니다.

## 공통 완료 조건

Write operation은 다음 조건을 모두 만족해야 완료입니다.

- 관련 worktree, index, local ref/graph와 remote ref의 pre/post state를 비교했습니다.
- 요청된 최소 상태 전이만 발생했고 무관한 dirty work와 ref가 보존됐습니다.
- 관련 verification이 통과했거나 실행하지 못한 이유를 보고했습니다.
- 실패 시 abort, reflog OID 또는 보존된 임시 자원으로 복구할 수 있습니다.
- 임시 index, worktree와 disposable 자원을 정리하고 최종 `git status`를 확인했습니다.

## 대표 경계 예시

- **일반 branch push**: 사용자가 exact remote·branch를 지정하고 fetch 결과가 fast-forward이며 외부 side effect가 없다고 확인되면 OID·refspec preview 후 실행합니다.
- **위험 remote write**: tag push, force, delete, overwrite, non-fast-forward 또는 CI/CD·release·배포 연결이 있거나 연결 여부를 확인할 수 없으면 실행 직전에 두 번째 확인을 받습니다.
- **Destructive local write**: `reset --hard`, `clean`, 변경을 폐기하는 `restore`는 사용자가 exact command를 요청했어도 손실 범위와 recovery point를 보여주고 다시 확인합니다.
- **Atomic commit**: 요청과 무관한 staged hunk·file만 staged 상태로 보존합니다. 요청 범위 staged patch는 commit에 소비하며 같은 file의 hunk 소유가 모호하면 질문합니다.
- **검증 실패**: test·typecheck·lint·hook이 실패하면 candidate를 복구 가능하게 보존하고 중단합니다. 별도 요청 없이 code·test·config를 수정하지 않습니다.

## 완료 보고

- 변경된 commit/ref와 충분히 식별 가능한 hash
- 수행한 상태 전이와 검증 결과
- 남은 staged, unstaged, untracked 변경
- remote write의 승인 대상과 실제 결과
- 실행하지 못한 검사, 미입증 history 또는 남은 복구 단계
