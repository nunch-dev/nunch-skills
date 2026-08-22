# 공통 안전 계약

Git write workflow가 공유하는 source of truth입니다. Leaf reference에는 이 계약으로 설명되지 않는 command별 예외만 둡니다.

## 상태 전이와 권한

| Risk tier | 예 | 실행 권한 |
|---|---|---|
| Read-only / tracking refresh | status, diff, show, log, remote 조회, 제한된 fetch | 요청 해결에 필요하면 실행 가능하며 fetch의 local tracking-ref update를 기록 |
| Reversible local write | add, commit, switch, merge, stash, worktree 생성 | 사용자가 해당 Git 작업을 명시적으로 요청해야 함 |
| Destructive local write | restore로 변경 폐기, reset --hard, clean, unmerged branch 강제 삭제 | exact target·손실·복구 지점을 보여주고 실행 직전 별도 확인 |
| Remote write | commit/tag push, remote ref 생성·갱신·삭제·덮어쓰기 | 최초 요청과 별도로 fetch·OID preview 후 실행 직전 별도 확인 |

`--system` config, hook 관리, plumbing, object/ref 직접 조작과 repository administration은 지원하지 않습니다.

## 공통 preflight

Write 전에 필요한 surface만 resolve합니다.

- repository root, 현재 branch와 detached HEAD 여부
- worktree/index의 staged, unstaged, untracked 상태
- 진행 중인 rebase, merge, cherry-pick, revert, bisect 또는 am 상태
- 대상 ref와 OID, upstream, remote와 fetch freshness
- user-owned unrelated dirty work
- command가 바꿀 surface와 복구 명령 또는 recovery OID

Target ref와 pathspec은 실제 존재 여부를 확인합니다. Unresolved variable, broad glob 또는 추정한 default branch를 destructive target으로 사용하지 않습니다.

## 안전한 보조 작업

다음 보조 작업은 사용자의 주된 요청을 안전하게 완료하는 데 필요하면 별도 write 승인 없이 사용할 수 있습니다.

- status, diff, show와 dry-run/check mode
- remote 상태 최신화를 위한 제한된 fetch
- commit candidate 검증이나 bisect를 위한 임시 index/worktree 생성과 정리

보조 작업이 user-visible branch, index, worktree, submodule 또는 remote 의미를 바꾸면 이 예외에 해당하지 않습니다.

## 예상 밖 상태

Conflict는 diff와 history에서 해결 의도가 하나로 확정되고, local·recoverable하며, 범위 확대·데이터 손실·shared history 변경이 없을 때만 자동 해결합니다.

다음 상황에서는 복구 가능한 지점에서 중단하고 질문합니다.

- 의미가 둘 이상인 conflict
- hook 또는 test failure
- non-fast-forward
- 요청 밖 code change가 필요한 상태
- 새로운 remote write, destructive variant 또는 target 확대

Ours/theirs 전체 선택, automatic merge/rebase와 force로 우회하지 않습니다.

## Local destructive write

초기 요청에 destructive command가 있어도 실행 직전 다음을 보여주고 확인받습니다.

- exact path/ref와 현재 OID 또는 file state
- 사라질 staged, unstaged, untracked data
- 영향을 받는 branch/worktree
- recovery branch, tag, stash, patch 또는 reflog OID

Recovery point가 없거나 손실 범위가 불명확하면 실행하지 않습니다.

## Remote write

모든 remote write 전에 대상 remote/ref를 fetch하고 다음을 보여줍니다.

- remote와 ref
- observed current OID와 target OID
- 전송 commit range와 refspec
- fast-forward 여부, 다른 사용자 영향과 복구 가능성

그 뒤 실행 직전 별도 확인을 받습니다. 승인받은 remote/ref/refspec을 벗어나지 않습니다.

- Force-push는 `--force-with-lease=<ref>:<expected-oid>`만 사용합니다.
- 여러 ref가 하나의 단위면 atomic push를 요구합니다. Server가 지원하지 않으면 sequential partial push로 우회하지 않습니다.
- Fetch가 실패하면 ordinary fast-forward push는 server 검증에 맡길 수 있지만 force, delete, overwrite는 중단합니다.

## Config와 hooks

- Repo-local config는 명시 요청 범위에서 지원합니다.
- Global identity, credential helper와 signing config는 exact key와 redacted old/new value를 보여주고 별도 확인받습니다.
- Secret value를 output, evidence 또는 commit에 남기지 않습니다.
- Existing hooks는 정상 실행되게 두고 실패를 보고합니다. 별도 요청 없이 만들거나 수정·비활성화하지 않고 `--no-verify`로 우회하지 않습니다.

## Postcondition

완료 전에 관련 surface의 pre/post state를 비교합니다. 요청한 최소 전이 외의 change, 예상하지 않은 ref 이동, 남은 operation state 또는 정리되지 않은 temporary resource가 있으면 완료로 보고하지 않습니다.
