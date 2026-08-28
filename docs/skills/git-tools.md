# git-tools

## 개요

Git 상태와 이력을 근거로 최소 상태 전이만 수행하는 primary Git 스킬입니다. 섞인 변경을 원자적으로 커밋하고 branch, rebase, merge, stash, worktree, remote, tag, submodule, bundle과 복구 작업을 다룹니다.

## 사용 시점

- 변경을 작업별로 나눠 커밋할 때
- log, blame, bisect, reflog로 변경 원인을 조사할 때
- branch 통합, rebase, restore, stash 또는 worktree 작업이 필요할 때
- push, pull, remote ref와 tag를 안전하게 관리할 때

일반 코드 수정만 요청했고 Git 상태 변경이나 이력 조사가 필요하지 않으면 활성화하지 않습니다.

## 사용 예

```text
$git-tools 현재 변경을 작업 단위로 나눠 커밋해줘
```

Git 실행 파일이 필요합니다.

## 커밋 원칙

- 전체 staged·unstaged·untracked 변경을 읽고 독립적으로 revert 가능한 단위로 분류합니다.
- 기본 커밋 메시지는 이모지 없이 한글로 작성합니다.
- 모노레포 제목은 `(서비스) [타입]: 한글 요약` 형식을 사용합니다.
- 구현과 직접 연결된 테스트·생성 artifact는 같은 커밋에 둡니다.

## 원격 작업

모든 push·remote tag·remote ref 변경은 최초 요청과 별도로 fetch와 OID preview 후 실행 직전 승인을 받습니다. Force push는 exact expected OID를 지정한 `--force-with-lease`만 허용합니다.

## 안전 경계

- destructive local 작업은 손실 범위와 복구 지점을 보여준 뒤 재확인합니다.
- hook/test failure, conflict, non-fast-forward를 우회하지 않습니다.
- 무관한 dirty work와 기존 index 상태를 보존합니다.

Source: [`plugins/nunch-skills/skills/git-tools/SKILL.md`](../../plugins/nunch-skills/skills/git-tools/SKILL.md)
