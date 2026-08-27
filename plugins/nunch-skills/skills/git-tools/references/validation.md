# Validation Gate

Skill wording 검사는 실제 Git state-transition 검증을 대체하지 않습니다. 모든 mutation fixture는 disposable local repository와 disposable bare remote만 사용합니다.

## 매 release 필수

1. Official skill validator와 plugin validator
2. Codex·Claude manifest와 marketplace JSON parsing
3. Relative link와 command coverage owner/risk/recovery completeness
4. Critical smoke:
   - read-only status/history evidence
   - mixed changes atomic grouping과 unrelated state 보존
   - destructive local operation의 second-confirmation stop
   - 모든 remote write의 fetch/OID preview와 second-confirmation stop
   - ambiguous conflict, hook/test failure와 non-fast-forward stop
   - abort/reflog/temporary worktree cleanup
5. 이번 release에서 변경된 leaf의 happy/failure scenario

## Full matrix trigger

다음 경우 command coverage의 모든 family에 대표 scenario를 실행합니다.

- Router/topology, shared safety 또는 risk tier 변경
- 새 command family 추가
- 정기 full validation

이번 porcelain-wide migration은 full matrix 대상입니다.

## Host activation

- Codex와 Claude에서 Git request가 `git-tools`로 route되는지 확인합니다.
- Host priority가 있으면 최우선 설정을 확인합니다.
- 겹치는 Git skill을 비활성화해야 하면 정확한 대상을 보여주고 QA operator 승인을 받은 뒤에만 수행합니다. 삭제하지 않습니다.
- Conflict skill이 active인 fixture에서는 sole-policy를 주장하지 않는지 확인합니다.

## Evidence

각 scenario는 initial state, command/approval boundary, observed output, final state, cleanup과 verdict를 기록합니다. Secret, credential, production URL과 PII는 남기지 않습니다.

Provider-specific auth와 protected branch policy를 bare remote 결과로 일반화하지 않습니다. 검증하지 못한 host/provider behavior는 residual risk로 보고합니다.
