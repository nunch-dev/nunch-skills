# 이력 조사

질문이 요구하는 증거에 맞는 도구를 선택합니다.

- 정확한 문자열의 추가·제거 시점: `git log -S "text" --oneline -- <path>`
- 정규식에 맞는 diff가 바뀐 시점: `git log -G "regex" --oneline -- <path>`
- 특정 줄을 마지막으로 바꾼 commit: `git blame -L <start>,<end> -- <file>`
- rename을 거친 파일의 history: `git log --follow -- <file>`
- 한 commit의 의도와 patch: `git show <hash> -- <path>`
- merge를 포함한 branch 관계: `git log --graph --decorate --oneline --all`
- 첫 bad commit 찾기: 재현 가능한 결정적 pass/fail command와 known-good/known-bad 경계가 있을 때 temporary worktree에서 `git bisect`
- 최근 로컬 HEAD, branch, rebase 이동 복구: `git reflog`

`-S`는 문자열이 diff에 보이기만 했는지가 아니라 해당 문자열의 출현 횟수가 달라진 commit을 찾습니다. diff의 특정 형태를 찾을 때는 `-G`를 사용합니다.

첫 검색 결과를 곧바로 결론으로 삼지 않습니다. 관련 commit을 `git show`로 열고 parent, rename, merge 여부와 실제 patch를 확인합니다. Blame 결과는 작성 의도가 아니라 마지막 변경자만 보여주므로 필요하면 해당 commit과 이전 revision을 함께 확인합니다.

## Bisect isolation

- Current checkout에서 bisect하지 않습니다. Known-good/bad OID에서 disposable temporary worktree를 만듭니다.
- Command가 deterministic하고 external mutation, secret access 또는 production target을 포함하지 않는지 확인합니다.
- 각 result와 first-bad candidate를 `git show`로 검증합니다.
- 완료 또는 failure 후 `git bisect reset`, temporary worktree 제거와 original checkout 불변을 확인합니다.
- Bound나 command가 불명확하면 실제 bisect를 시작하지 않고 필요한 정보를 질문합니다.

## 변경 이유와 외부 evidence

Commit message와 patch만으로 이유를 입증할 수 없고 remote provider를 식별할 수 있으면 연결된 PR·issue를 read-only로 조사합니다. 가능한 경우 provider용 read-only CLI/API를 사용하고 URL, identifier와 관찰한 claim을 제시합니다.

접근 불가, link 부재 또는 source가 이유를 설명하지 않으면 추정으로 채우지 않고 `미입증`으로 보고합니다. PR·issue를 수정하거나 comment를 남기지 않습니다.

결론에는 다음을 포함합니다.

- 짧지 않은 식별이 필요하면 충분한 길이의 hash
- commit subject와 날짜
- 관련 파일 경로와 line 또는 diff 맥락
- 어떤 명령이 그 결론을 뒷받침하는지
- 연결된 PR·issue를 사용했다면 exact source
- history만으로 입증할 수 없는 의도나 추정
