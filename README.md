# nunch-skills

Codex에서 사용할 개인 스킬 레지스트리입니다. 스킬 정의는 `skills.toml` 한 곳에서 관리합니다.
설치 도구는 [Bun](https://bun.sh/)으로 실행되므로 Bun이 필요합니다.

```bash
./install.sh                          # 메뉴에서 설치할 스킬 선택
./uninstall.sh                        # 메뉴에서 제거할 스킬 선택
./uninstall.sh --purge                # 제거 후 외부 저장소 복제본도 삭제
```

메뉴에서 번호를 쉼표로 구분해 여러 스킬을 선택하거나, `a`로 전체를 선택할 수 있습니다.

기본 대상은 `~/.codex/skills`이며, 외부 저장소는 `.skills-cache/`에 shallow clone으로 보관됩니다. 테스트나 다른 Codex 홈에 설치할 때는 `--target`을 사용합니다.

```bash
./install.sh --target /tmp/codex/skills
./uninstall.sh --target /tmp/codex/skills --purge
```

새 스킬은 `[[sources]]`에 추가합니다. `repo`가 없는 source는 이 저장소 내부 경로를, `repo`가 있는 source는 clone한 저장소를 사용합니다. `path`는 그 source 안에서 나열된 `skills`의 상위 디렉터리입니다.
