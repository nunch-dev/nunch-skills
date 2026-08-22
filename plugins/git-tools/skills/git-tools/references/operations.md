# Git 작업 Index

Write operation은 먼저 [공통 안전 계약](safety.md)을 읽고 요청에 맞는 leaf 하나를 선택합니다.

- Restore, reset, clean, stash, worktree: [Worktree와 index](worktree.md)
- Rebase, squash, fixup, revert, cherry-pick: [History edit](history-edit.md)
- Branch, switch/checkout, merge, apply/am: [통합](integration.md)
- Remote, fetch, pull, push, upstream, remote tag: [Remote](remote.md)
- Local tag, submodule, archive, bundle, clone/init, config: [Repository 자산](repository-assets.md)
- Abort, continue, skip, reflog recovery: [복구](recovery.md)
- 전체 command owner와 risk tier: [Command coverage](command-coverage.md)

각 leaf는 `precondition → authority → execute → observable success → recovery` 순으로 command별 delta만 정의합니다. Shared permission과 remote confirmation rule을 leaf에 복제하지 않습니다.
