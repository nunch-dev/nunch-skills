# Repository 자산과 설정

[공통 안전 계약](safety.md)을 먼저 적용합니다. 이 leaf는 local tag, repository lifecycle, submodule과 portable artifact를 다룹니다.

## Local tag

- 같은 이름의 local/remote tag와 target OID를 확인합니다.
- Release 의미가 있는 tag는 repository policy가 다르지 않으면 annotated tag를 우선합니다.
- Existing tag 이동·삭제는 local ref destructive write로 분류하고 recovery OID와 별도 확인을 요구합니다.
- Tag 생성은 remote publication 권한을 포함하지 않습니다.

## Clone과 init

- Clone target path가 비어 있거나 새 path인지 확인하고 URL의 credential을 redact합니다.
- Existing directory나 repository root에 덮어쓰지 않습니다.
- `git init`은 exact target과 기존 `.git` 여부, default branch policy를 확인합니다.
- Remote code를 checkout한 뒤 hook 또는 executable을 agent가 임의로 실행하지 않습니다.

## Submodule

- `.gitmodules`, index gitlink, submodule worktree와 remote URL을 함께 확인합니다.
- Add, init, update, sync와 deinit의 영향을 구분하고 recursive 범위를 명시합니다.
- 여러 repository의 branch/worktree를 바꾸는 recursive update는 exact module list를 preview합니다.
- `submodule foreach`처럼 arbitrary shell을 실행하는 operation은 이 skill의 지원 범위가 아닙니다.
- 완료 후 superproject diff와 각 affected submodule OID/status를 확인합니다.

## Archive와 bundle

- Archive path, format, tree-ish와 포함 path를 확인하고 existing output overwrite를 피합니다.
- Bundle은 create 후 `git bundle verify`로 prerequisites와 refs를 확인합니다.
- Bundle import/clone은 target path와 가져올 refs를 명시하고 unexpected ref overwrite를 허용하지 않습니다.

## Patch package와 notes

- `format-patch`는 exact commit range, output directory와 existing file overwrite를 확인합니다.
- `request-pull`은 text output만 생성하며 email 전송 권한을 포함하지 않습니다. `send-email`은 이 skill의 지원 범위가 아닙니다.
- Notes는 target object와 notes ref를 확인합니다. Add/edit/remove는 local ref write이고 remote publication은 별도 remote write입니다.

## Config

- Repo-local config는 명시 요청 범위에서 exact key old/new를 확인한 뒤 변경합니다.
- Global identity, credential helper와 signing config는 redacted old/new preview 후 별도 확인받습니다.
- `--system`, credential secret 저장과 hook path 관리는 지원하지 않습니다.
- 완료 후 effective origin을 구분할 수 있는 조회로 원하는 scope에만 적용됐는지 확인합니다.

## Observable success

- Tag, gitlink, artifact, target repository와 config scope가 요청한 exact state와 일치합니다.
- Remote publication, arbitrary shell, system config 또는 secret mutation으로 확대되지 않았습니다.
