# History Edit

[공통 안전 계약](safety.md)을 먼저 적용합니다. 이 leaf는 commit graph를 재작성하거나 역변경 commit을 만드는 작업을 다룹니다.

## Rebase, squash와 fixup

- Current branch, target base, merge-base, local-only/pushed commit range와 dirty work를 확인합니다.
- Protected branch와 이미 공유된 history rewrite는 정확한 target과 영향을 보여주고 별도 확인받습니다.
- Fixup은 대상 commit을 확인한 뒤 fixup commit과 autosquash를 우선합니다.
- Interactive sequence는 final order, dropped/squashed commit과 new parent를 실행 전에 검토합니다.
- Conflict는 단일한 의도가 입증될 때만 자동 해결합니다. 나머지는 `git rebase --abort` 가능한 상태에서 질문합니다.
- 완료 후 old/new range mapping, tests와 base..HEAD graph를 확인합니다.

## Revert

- Revert target, mainline parent가 필요한 merge commit인지, 이미 revert/reapply된 patch인지 확인합니다.
- Revert는 history를 삭제하지 않지만 working tree와 새 commit을 만들므로 명시 요청이 필요합니다.
- Conflict 해결 기준은 다른 integration과 동일합니다. 완료 후 inverse patch와 new commit을 검증합니다.

## Cherry-pick

- Target commit patch, dependency order와 equivalent patch가 이미 있는지 확인합니다.
- 여러 commit이면 정확한 ordered range를 확정합니다.
- Conflict가 모호하면 `git cherry-pick --abort` 가능한 상태에서 질문합니다.
- 완료 후 original-to-new commit mapping, diff와 verification을 확인합니다.

## Shared history publication

History edit 완료는 push 권한을 포함하지 않습니다. Remote publication은 [공통 안전 계약](safety.md#remote-write)의 fetch·OID preview와 fast-path/high-risk 분류를 별도로 적용합니다. Rewrite 결과의 force·non-fast-forward push는 항상 high-risk이므로 실행 직전에 두 번째 확인을 받습니다.

## Observable success

- 요청된 commit만 reorder, combine, rewrite 또는 inverse됐습니다.
- Original recovery OID와 abort/reflog path가 남아 있습니다.
- Hook/test failure는 history를 더 바꾸거나 code fix로 확대하지 않고 보고됩니다.
