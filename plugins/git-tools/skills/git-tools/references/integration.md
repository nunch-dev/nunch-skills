# Branch와 통합

[공통 안전 계약](safety.md)을 먼저 적용합니다. 이 leaf는 branch/switch, merge와 patch integration을 다룹니다.

## Branch와 switch/checkout

- 같은 이름의 local/remote branch, upstream, target OID와 linked worktree ownership을 확인합니다.
- New branch는 사용자가 지정한 start-point 또는 확인된 current HEAD에서 만듭니다.
- Detached HEAD 전환, overwrite되는 path와 branch rename 영향을 명시합니다.
- Unmerged local branch 강제 삭제는 exact branch/OID, unique commit과 recovery ref를 보여주고 별도 확인받습니다.
- Checkout의 file-restore form은 [Worktree와 index](worktree.md)의 destructive restore rule을 따릅니다.

## Merge

- Merge-base, 양 branch의 unique commit과 fast-forward 가능 여부를 확인합니다.
- User/repository policy가 정한 fast-forward, merge commit 또는 squash 방식을 따릅니다. 임의로 전략을 바꾸지 않습니다.
- Conflict가 단일한 의도로 해결되지 않으면 `git merge --abort` 가능한 상태에서 질문합니다.
- 완료 후 parents, resulting tree, tests와 branch positions를 확인합니다.

## Apply와 am

- Patch source와 target root를 확인하고 먼저 `--check` 또는 equivalent dry-run을 사용합니다.
- `git apply`는 worktree/index change이고 `git am`은 commit 생성과 sequencer state를 포함한다는 차이를 유지합니다.
- Path traversal, binary patch, whitespace policy와 already-applied patch를 확인합니다.
- `am` conflict가 모호하면 abort 가능한 상태에서 질문하고, 완료 후 author/message와 resulting commits를 검증합니다.

## Pull routing

Pull은 [Remote](remote.md)에서 fetch freshness를 확인한 뒤 이 leaf의 integration rule을 사용합니다.

## Observable success

- Branch/ref와 resulting tree가 선택한 strategy와 일치합니다.
- Unrelated dirty work와 branch는 보존됐습니다.
- Conflict resolution과 tests에 미확정 상태가 남지 않았습니다.
