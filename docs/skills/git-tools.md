# git-tools

## 개요

Git 상태와 이력을 근거로 요청한 최소 상태 전이만 수행하는 primary Git 스킬입니다. 섞인 변경의 원자적 커밋과 branch·rebase·merge·restore·stash·worktree·remote·tag·submodule·bundle·복구를 다룹니다.

## 사용 시점

- 변경을 작업별로 나눠 커밋할 때
- log·blame·bisect·reflog로 변경 원인을 조사할 때
- branch 통합, rebase, restore, stash, worktree가 필요할 때
- push, pull, remote ref, tag를 관리할 때

일반 코드 수정만 요청했고 Git 작업이나 이력 조사를 요구하지 않았다면 사용하지 않습니다.

## 커밋 계약

- 전체 staged·unstaged·untracked 변경을 읽고 독립적으로 되돌릴 수 있는 목적 단위로 분류합니다.
- 단순 커밋 요청은 목적 기반 그룹화와 index 재구성을 허용합니다.
- 요청 범위의 staged patch는 커밋이 소비하므로 커밋 뒤 다시 stage하지 않습니다. 요청과 무관한 staged hunk나 파일만 원래 index 상태로 복원합니다.
- 같은 파일에서 요청 범위와 무관한 변경의 소유권을 안전하게 나눌 수 없으면 커밋 전에 질문합니다.
- test·typecheck·lint·hook 실패 시 복구 가능한 상태를 보존하고 멈춥니다. 별도의 명확한 요청 없이 코드·테스트·설정·formatter를 고치지 않습니다.

## 원격 작업

정확히 지정한 일반 branch의 fast-forward push 또는 새 branch push는 다음 조건을 모두 만족하면 추가 확인 없이 실행할 수 있습니다.

- 실행 직전에 fetch하고 예상 local·remote OID와 exact refspec을 보여줍니다.
- non-fast-forward·force·delete·overwrite가 아닙니다.
- CI/CD, Pages, package publish, release, deploy 같은 외부 side effect가 없음을 확인했습니다.

외부 side effect가 있거나 알 수 없으면 두 번째 확인을 받습니다. Force·delete·overwrite·non-fast-forward와 remote tag·notes·special ref 변경도 항상 고위험 작업으로 분류합니다. Force push는 exact expected OID를 지정한 `--force-with-lease`만 허용합니다.

## 로컬 파괴 작업

`reset --hard`, `clean`, 파괴적 restore는 사용자가 처음부터 명시했더라도 손실 범위와 복구 지점을 보여주고 두 번째 확인을 받습니다. 복구 지점이 없거나 손실 범위가 불명확하면 실행하지 않습니다.

Source: [`plugins/nunch-skills/skills/git-tools/SKILL.md`](../../plugins/nunch-skills/skills/git-tools/SKILL.md)
