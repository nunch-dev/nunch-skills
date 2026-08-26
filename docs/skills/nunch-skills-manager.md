# nunch-skills-manager

## 개요

Codex의 release-pinned nunch-skills 설치·업데이트·제거·무결성 검증과 plugin 실행 의존성 진단을 관리합니다. 일반 사용자는 `@nunch-dev/skills` npm CLI를 통해 Codex 또는 Claude Code를 선택해 호출합니다.

## 명령

```bash
npx @nunch-dev/skills install
```

omo와 같은 `install|setup`, `update`, `uninstall`, `doctor`, `settings` subcommand를 제공합니다. 대화형 설치는 플랫폼과 leaf plugin을 선택하고, `--no-tui --platform=<codex|claude|both> --plugins=<목록|all|none>`은 자동화용 설치를 실행합니다. Codex에는 manager control plane이 설치되며 삭제는 created resource full teardown으로만 가능합니다. Claude Code에는 선택한 leaf plugin만 설치되고 marketplace 출처는 `github:nunch-dev/nunch-skills`로 확인합니다.

## Release 검증

Codex는 npm tarball, immutable Git tag·full commit, marketplace, manager manifest, hook, Windows Node dispatcher와 TypeScript runtime digest를 비교합니다. 검증이 끝나기 전에는 Codex marketplace, plugin, config나 hook trust를 변경하지 않습니다. Claude Code는 marketplace의 GitHub 출처를 확인한 뒤에만 plugin을 변경합니다.

최초 `npx` 실행은 npm-delivered bootstrap을 신뢰합니다. 설치가 끝난 뒤 SessionStart 자동 업데이트는 현재 신뢰된 manager가 candidate code를 실행하지 않고 npm과 Git을 먼저 검증합니다.

## Doctor

doctor는 다음 범주를 구분해 보고합니다.

- plugin 실행 의존성
- release integrity
- 중단된 lifecycle transaction
- manager hook trust
- installer ownership

기본 모드는 문제만, `--status`는 간결한 대시보드, `--verbose`는 전체 상세와 조치, `--json`은 기계 판독 결과를 출력합니다. 플랫폼별 검사는 `--platform=codex` 또는 `--platform=claude`로 제한합니다.

누락된 시스템 패키지는 자동 설치하지 않습니다. 실제 설치 명령과 범위를 보여주고 별도 승인을 받아야 합니다.

Source: [`plugins/nunch-skills-manager/skills/nunch-skills-manager/SKILL.md`](../../plugins/nunch-skills-manager/skills/nunch-skills-manager/SKILL.md)
