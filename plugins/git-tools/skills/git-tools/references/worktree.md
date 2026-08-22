# Worktree와 Index

[공통 안전 계약](safety.md)을 먼저 적용합니다. 이 leaf는 worktree와 index 상태를 바꾸는 command의 delta만 정의합니다.

## Restore

- Source tree-ish, `--staged`, `--worktree`와 pathspec을 분리해 해석합니다.
- `--staged`만 사용해 index를 HEAD로 되돌리는 것은 worktree content를 보존하는 local write입니다.
- Uncommitted worktree content를 덮는 restore는 destructive local write입니다. Exact diff와 복구 patch/OID를 보여주고 별도 확인받습니다.
- 완료 후 대상 path의 index/worktree diff와 무관한 path 불변을 확인합니다.

## Add, rm과 mv

- Add는 exact path/hunk를 stage하고 staged diff를 읽은 뒤 완료합니다.
- `git rm`은 index-only와 worktree deletion을 구분합니다. Uncommitted content를 잃는 variant는 destructive local write입니다.
- `git mv`는 source/destination existence, case-only rename와 overwrite 여부를 확인합니다.
- Sparse-checkout이 활성화된 repository에서는 skip-worktree 영향과 visible path 범위를 먼저 확인합니다.

## Reset

- Path reset과 branch/HEAD reset을 구분합니다.
- `--soft`는 ref 이동, `--mixed`는 ref와 index 변경, `--hard`는 ref·index·worktree 변경입니다.
- Target OID와 사라질 commit range, staged/unstaged content를 각각 preview합니다.
- `--hard`와 history를 잃을 수 있는 ref 이동은 destructive local write입니다. Recovery branch/tag 또는 reflog OID 없이는 실행하지 않습니다.

## Clean

- 먼저 dry-run으로 exact untracked/ignored target을 나열합니다.
- `-x`, `-X`, nested repository와 directory removal 영향을 구분합니다.
- Clean은 destructive local write이며 삭제 대상과 복구 불가능성을 보여준 뒤 별도 확인받습니다.
- Repository root, broad path 또는 unresolved glob을 target으로 사용하지 않습니다.

## Stash

- 기본적으로 사용자가 지정한 path/hunk와 index state만 이동합니다.
- `--staged`, `--keep-index`, untracked 포함 여부와 message를 의도적으로 선택합니다.
- 같은 file에 서로 다른 staged/unstaged ownership이 섞였거나 scope가 불명확하면 전체 stash로 확대하지 않고 질문합니다.
- Apply 후 diff와 stash list를 확인합니다. Conflict가 있으면 stash가 삭제됐다고 가정하지 않습니다.
- `pop`보다 apply 결과를 검토한 뒤 명시적으로 drop하는 흐름이 안전하면 이를 우선합니다.

## Worktree

- Add 전에 target path, branch/ref ownership과 기존 worktree lock을 확인합니다.
- Temporary validation worktree는 task-specific temp directory에 만들고 original checkout/index를 바꾸지 않습니다.
- Remove 전에 dirty/untracked state와 linked branch를 확인합니다. Dirty worktree 강제 제거는 destructive local write입니다.
- 완료 후 `git worktree list --porcelain`과 filesystem cleanup을 확인하고 stale metadata가 있을 때만 prune을 고려합니다.

## Sparse checkout

- Current cone/non-cone mode와 patterns를 확인하고 exact desired set을 preview합니다.
- Working tree에서 사라질 path가 uncommitted change를 포함하면 진행하지 않습니다.
- 완료 후 sparse patterns, index flags와 visible path를 확인합니다.

## Observable success

- 요청한 path/index/worktree만 예상한 state로 바뀌었습니다.
- Unrelated staged, unstaged, untracked file과 linked worktree가 보존됐습니다.
- Destructive operation에는 승인과 복구 evidence가 있습니다.
