# 복구

복구는 새 history 전략을 선택하는 작업이 아니라 요청 전 또는 마지막 안전 지점으로 돌아가는 작업입니다. [공통 안전 계약](safety.md)을 함께 적용합니다.

## 진행 중 operation

현재 Git state가 가리키는 operation의 native control을 우선합니다.

- Rebase: `--abort`, 승인된 resolution 뒤 `--continue`, 명시된 commit만 `--skip`
- Merge: `git merge --abort`
- Cherry-pick: `--abort`, `--continue`, 의도가 확인된 경우만 `--skip`
- Revert: `--abort`, `--continue`
- Am: `--abort`, `--continue`, 명시된 patch만 `--skip`
- Bisect: `git bisect reset` 후 temporary worktree cleanup

다른 operation의 abort command나 broad reset으로 우회하지 않습니다.

## Reflog와 recovery ref

- Reflog에서 operation 전 exact OID와 이동 원인을 확인합니다.
- Data를 버리는 reset 전에 recovery branch 또는 tag를 만들어 reachable state를 보존합니다.
- Shared remote state는 local reflog만으로 복구된다고 주장하지 않습니다. Remote recovery는 별도 remote write approval을 거칩니다.

## Temporary resource cleanup

- Task가 만든 temporary index, worktree, branch, tag, patch와 disposable repository만 정리합니다.
- User-owned stash, worktree와 recovery ref를 자동 삭제하지 않습니다.
- Cleanup 후 worktree list, status, operation markers와 expected HEAD를 확인합니다.

## Observable success

- Current operation marker가 사라지고 HEAD/index/worktree가 선택한 recovery point와 일치합니다.
- User-owned dirty work와 refs가 보존됐습니다.
- 복구하지 못한 remote/shared state와 필요한 next action을 명시합니다.
