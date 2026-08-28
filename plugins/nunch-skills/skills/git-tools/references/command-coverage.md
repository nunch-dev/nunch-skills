# Command Coverage

Supported Git porcelain의 owner, authority, postcondition과 recovery를 정의합니다. Command 이름이 여기 없더라도 아래 family와 동일한 상태 전이·risk tier로 분류할 수 있을 때만 지원합니다. Plumbing, direct object/ref manipulation과 repository administration은 확장 추론하지 않습니다.

| Command family | Owner | Risk | Authority | Observable success | Recovery |
|---|---|---|---|---|---|
| status, diff, show, grep, describe, shortlog, range-diff | `INSPECT` | read-only | 조사에 필요 | requested evidence 출력, state 불변 | N/A |
| log, blame, follow, reflog inspection | `HISTORY` | read-only | 조사에 필요 | hash/path/diff evidence | N/A |
| bisect | `HISTORY` | isolated local | deterministic command + known bounds | first-bad 검증, original checkout 불변 | bisect reset + temp cleanup |
| add | `COMMIT`/`WORKTREE` | reversible local | explicit task | exact staged diff | restore --staged 또는 saved index state |
| commit, amend | `COMMIT` | local history | explicit commit request | expected tree/message/hash | recovery OID/reflog |
| restore | `WORKTREE` | reversible/destructive local | destructive variant second confirm | exact path/index state | patch/OID/recovery copy |
| reset | `WORKTREE` | local ref/index/destructive | mode별 preview, hard second confirm | HEAD/index/worktree expected state | recovery ref/reflog |
| clean | `WORKTREE` | destructive local | dry-run + second confirm | approved files만 제거 | pre-created backup가 없으면 불가 |
| rm, mv | `WORKTREE` | local content/index | overwrite/loss 시 second confirm | exact path/index transition | restore/recovery copy |
| sparse-checkout | `WORKTREE` | local worktree/index | explicit request | patterns/index/visible paths 일치 | prior patterns |
| stash | `WORKTREE` | reversible local | explicit scoped request | scoped diff 이동, stash OID 확인 | apply/drop 분리 |
| worktree | `WORKTREE` | reversible/destructive local | dirty remove second confirm | worktree list와 path 일치 | preserve branch/OID, remove temp |
| branch, switch, checkout | `INTEGRATE` | local ref/worktree | force delete second confirm | branch/OID/upstream/worktree 일치 | recovery ref/reflog |
| merge | `INTEGRATE` | local graph | explicit strategy | parents/tree/tests 일치 | merge --abort/recovery OID |
| rebase, squash, fixup | `INTEGRATE`/history-edit | history rewrite | shared rewrite second confirm | old/new mapping과 base graph | rebase --abort/reflog |
| revert | `INTEGRATE`/history-edit | new history | explicit request | inverse patch commit | revert --abort |
| cherry-pick | `INTEGRATE`/history-edit | new history | explicit range | original/new mapping | cherry-pick --abort |
| apply | `INTEGRATE` | local content/index | check 후 explicit apply | patch target diff | reverse patch/recovery copy |
| am | `INTEGRATE` | new history | check 후 explicit apply | author/message/commits 일치 | am --abort |
| remote add/rename/remove/set-url | `REMOTE` | repo-local config | explicit request, secret redact | exact remote config | old config restore |
| fetch | `REMOTE` | remote-read/local tracking update | freshness에 필요 | observed remote OID 기록 | prior tracking OID는 report only |
| pull | `REMOTE` + `INTEGRATE` | local graph/worktree | repository policy, fallback ff-only | fetched OID와 approved integration | merge/rebase abort |
| branch push/upstream | `REMOTE` | remote branch fast path 또는 high-risk remote | `safety.md`의 branch fast path 조건을 모두 만족하면 preview 후 실행, 아니면 second confirm | server final OID 일치 | separate approved remote recovery |
| remote branch create/update/delete | `REMOTE` | remote branch fast path 또는 high-risk remote | 새 branch와 일반 fast-forward update는 fast path 가능, delete·overwrite·non-fast-forward는 second confirm | exact approved ref final OID | approved recovery ref push |
| remote tag/notes/special ref | `REMOTE`/`PACKAGE` | high-risk remote | fetch/OID preview + second confirm | exact approved ref final OID | approved recovery ref push |
| local tag | `PACKAGE` | local ref | overwrite/delete second confirm | tag target/type/message 일치 | saved tag OID |
| clone, init | `PACKAGE` | repository lifecycle | exact safe target | repository root/HEAD/remote 일치 | remove only task-created empty target |
| submodule add/init/update/sync/deinit | `PACKAGE` | multi-repository local/network | exact module list, destructive variant confirm | gitlink/config/module OID 일치 | prior gitlink/config/OID |
| archive | `PACKAGE` | artifact write | explicit output, no overwrite | archive list/tree-ish 확인 | remove task-created output |
| bundle | `PACKAGE` | artifact/ref transfer | explicit refs/target | bundle verify 통과 | remove task-created output |
| format-patch, request-pull | `PACKAGE` | artifact/text write | explicit range/output | generated series/range 일치 | remove task-created output |
| notes | `PACKAGE` | local ref | explicit request, remote publish 별도 | notes ref/object content 일치 | saved notes ref/OID |
| config --local | `PACKAGE` | repo-local config | explicit request | key origin/value 일치 | old value restore |
| config --global identity/helper/signing | `PACKAGE` | user-global config | redacted preview + second confirm | exact key origin/value 일치 | old value restore |
| abort, continue, skip | `RECOVER` | sequencer control | operation/intention 확인 | marker와 HEAD/index expected state | native abort/reflog |

## Explicit non-goals

- Plumbing과 direct object/ref commands: `cat-file`, `commit-tree`, `hash-object`, `mktree`, `read-tree`, `update-index`, `update-ref`, `symbolic-ref` write와 `replace`
- Repository administration: `gc`, `maintenance`, reflog expiry, aggressive prune와 object database repair
- System config, credential secret 저장과 hook management
- Arbitrary shell surfaces: `submodule foreach`, unreviewed alias execution
- External transports/workflows: `send-email`, `svn`, non-core extensions such as LFS 또는 filter-repo

Read-only diagnostic command가 non-goal family에 속하더라도 사용자가 명시적으로 요청하면 별도 scope로 설명할 수 있지만, 이 skill이 mutation 또는 recovery를 보장하지 않습니다.
