# Remote

[공통 안전 계약](safety.md)을 먼저 적용합니다. 이 leaf는 remote tracking과 remote state를 다룹니다.

## Remote configuration

- `remote -v`와 repository config에서 current name, fetch/push URL과 refspec을 확인합니다.
- Add, rename, remove와 set-url은 local repository config write입니다. Exact old/new 값을 보여주고 명시 요청 범위에서 수행합니다.
- URL에 credential이나 token이 있으면 redact합니다.
- Remote remove가 tracking config와 refs에 미칠 영향을 preview합니다.

## Fetch

- Freshness 확인에 필요한 remote/ref만 fetch합니다.
- Prune, tag update와 refspec 확대는 요청 또는 repository policy 없이 추가하지 않습니다.
- Fetch failure를 ref 부재나 up-to-date의 증거로 해석하지 않습니다.
- 완료 후 observed remote OID와 remote-tracking ref update를 기록합니다.

## Pull

- Dirty work와 upstream을 확인하고 먼저 fetch합니다.
- User 또는 repository의 `pull.rebase`와 `pull.ff` policy를 따릅니다.
- Policy가 없으면 fast-forward only로 시도합니다. Divergence가 있으면 merge/rebase를 자동 선택하지 않고 질문합니다.
- Hook/test failure 또는 conflict는 [통합](integration.md)의 stop rule을 따릅니다.

## Push와 upstream

- Remote write 권한 분류는 [공통 안전 계약](safety.md#remote-write)만 소유합니다. 이 reference는 fetch 후 exact remote/ref, current/target OID, refspec과 commit range를 구성하고 fast-forward 여부를 판정합니다.
- 일반 fast-forward push와 새 branch 생성은 공통 안전 계약의 fast path 조건을 모두 만족할 때만 preview 후 실행합니다. 조건 하나라도 불명확하면 high-risk로 처리합니다.
- New upstream 설정과 commit push를 같은 승인 scope에 포함할지 명시합니다.
- Non-fast-forward를 자동 rebase/merge/force로 우회하지 않습니다.
- Force는 `--force-with-lease=<ref>:<expected-oid>`만 사용합니다.
- 여러 ref가 하나의 transaction이면 atomic push를 사용하고 server 미지원 시 partial push로 우회하지 않습니다.

## Remote branch와 tag mutation

- 새 branch 생성과 일반 fast-forward branch update는 공통 안전 계약의 fast path를 만족할 수 있습니다. Branch delete·overwrite·non-fast-forward update와 remote tag·notes·special ref는 high-risk remote write입니다.
- Delete/overwrite 전에 current OID, reachable unique commits, 다른 사용자 영향과 recovery ref를 보여줍니다.
- 승인받은 refspec 외의 branch/tag를 함께 전송하지 않습니다.

## Observable success

- Post-fetch remote OID와 server가 수락한 final OID가 승인 내용과 일치합니다.
- Partial multi-ref update, unexpected upstream change 또는 credential 노출이 없습니다.
- Remote rejection은 local history를 추가로 바꾸지 않고 보고됩니다.
