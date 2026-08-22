# 커밋 워크플로

## 1. 저장소 규칙 확인

다음 순서로 커밋 규칙을 찾습니다.

1. 사용자 요청과 현재 대화에서 확정된 형식
2. `AGENTS.md`, `CONTRIBUTING.md`, 저장소 문서와 commitlint 같은 설정
3. 최근 commit 및 변경한 경로의 commit history에서 반복되는 명확한 형식
4. 어느 것도 규칙을 만들지 못하면 `commit-convention.md`의 기본 형식

상위 규칙이 하위 규칙보다 우선합니다. 최근 history에 형식이 섞여 있거나 표본이 적으면 억지로 규칙을 추론하지 말고 기본 형식을 사용합니다.

## 2. 전체 변경 분류

staged 여부와 관계없이 요청 범위의 전체 diff와 untracked 파일 내용을 읽습니다. 각 변경을 다음 기준으로 묶습니다.

- 하나의 사용자 관점 동작 또는 목적
- 같은 모듈과 직접 연결된 설정
- 독립적으로 revert 또는 cherry-pick 가능한 단위
- 함께 있어야 검증이 통과하는 구현과 테스트
- source 변경과 그 결과로 반드시 갱신되는 generated artifact

다른 기능, 독립된 버그 수정, 별도 설정, 문서 전용 변경, 의존성 변경은 원칙적으로 나눕니다. 파일 수에 따른 최소 commit 개수는 만들지 않습니다. 하나의 기능이 여러 파일을 요구하면 한 commit일 수 있고, 한 파일에 여러 작업이 섞이면 여러 commit일 수 있습니다.

모노레포에서는 서비스 경계도 분류 기준입니다. 서비스별 변경이 독립적이면 나누고, 하나의 동작을 위해 분리할 수 없을 때만 같은 commit에 둡니다.

## 3. 기존 index 보존과 재구성

기존 staged 변경도 실제 작업 단위에 맞게 분류합니다.

- 요청 범위의 분류가 명확하면 index를 원자적 그룹에 맞게 재구성할 수 있습니다.
- 요청과 무관한 staged 변경은 staged 상태를 포함해 보존합니다.
- 사용자 의도나 소유가 모호한 staged 변경은 임의로 unstage하거나 다른 commit에 섞지 말고 질문합니다.
- 한 파일 일부만 필요하면 hunk 단위로 stage합니다. 자동화 환경에서 대화형 stage가 불안정하면 patch를 먼저 검토한 뒤 index에 적용합니다.
- 무관한 staged 변경과 commit 대상이 서로 다른 전체 file이면 named path만 commit하는 안전한 방법을 사용할 수 있습니다.
- 같은 file의 staged/unstaged hunk 소유가 섞였거나 index 복원 결과를 보장할 수 없으면 temporary index trick으로 추측하지 말고 질문합니다.

## 4. 그룹별 검증과 commit

의존 관계가 있으면 기반 변경부터 순서를 정합니다. 각 그룹마다 다음을 수행합니다.

1. Candidate patch를 구성하고 실제 diff를 읽습니다. 일반적으로 필요한 path/hunk만 stage하지만, 무관한 staged file을 보존하면서 disjoint full path만 commit할 때는 named-path candidate diff를 사용합니다.
2. 아직 commit하지 않을 sibling change가 candidate test 결과에 영향을 줄 수 있는지 판정합니다.
3. 영향 가능성이 없으면 current worktree에서 가장 작은 관련 검사, test, typecheck 또는 build를 실행합니다.
4. 영향 가능성이 있으면 HEAD와 이미 완료된 선행 commit 위에 candidate patch만 적용한 temporary index/worktree에서 검증합니다. Original checkout과 user index는 바꾸지 않습니다.
5. 저장소 규칙 또는 기본 한글 convention으로 message를 작성합니다.
6. 제목과 본문을 별도 `-m` 인수로 전달해 줄바꿈이 실제 commit message 서식으로 저장되게 합니다.
7. Commit 직전에 staged 또는 named-path candidate가 의도한 patch와 같은지 다시 확인합니다.
8. commit 후 `git show --stat --oneline --decorate -1`과 `git log -1 --pretty=fuller`로 결과를 확인합니다.

검사 또는 hook failure를 숨기기 위해 변경을 넓히거나 hook을 우회하지 않습니다. Commit 요청만 받은 경우 code fix 권한으로 확대하지 말고 staged candidate와 failure를 보존한 채 중단해 보고합니다. 요청과 무관한 기존 failure라면 근거와 함께 구분합니다.

## 5. 전체 검증과 보고

모든 commit이 끝나면 프로젝트의 적절한 전체 검사 또는 가장 가까운 통합 검사를 한 번 실행합니다. Temporary index/worktree를 정리하고 original checkout과 user-owned staged state가 보존됐는지 확인한 뒤 status와 새 commit 범위를 확인합니다.

```bash
git status --short --branch
git log --oneline --decorate <base>..HEAD
```

base가 확정되지 않으면 아는 척하지 않고 생성한 commit만 직접 확인합니다. 최종 보고에는 각 hash와 subject, 검증 결과, 남은 변경을 포함합니다.
