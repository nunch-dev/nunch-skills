# nunch-skills-manager

## 개요

release-pinned nunch-skills 설치·업데이트·제거·무결성 검증과 plugin 실행 의존성 진단을 관리합니다. 일반 사용자는 `@nunch-dev/skills` npm CLI를 통해 호출합니다.

## 명령

```bash
npx @nunch-dev/skills install
npx @nunch-dev/skills update
npx @nunch-dev/skills doctor
npx @nunch-dev/skills uninstall --dry-run
```

기본 install은 manager만 설치합니다. plugin 이름을 추가하거나 `--all`을 명시해야 범위가 늘어납니다. 기본 uninstall은 ownership ledger에서 `created`인 리소스만 preview하고, 실제 제거에는 interactive 확인 또는 `--yes`가 필요합니다.

## Release 검증

npm tarball, immutable Git tag·full commit, marketplace, manager manifest, hook, Unix·Windows launcher와 선택된 플랫폼 binary digest를 비교합니다. 검증이 끝나기 전에는 Codex marketplace, plugin, config나 hook trust를 변경하지 않습니다.

최초 `npx` 실행은 npm-delivered bootstrap을 신뢰합니다. 설치가 끝난 뒤 SessionStart 자동 업데이트는 현재 신뢰된 manager가 candidate code를 실행하지 않고 npm과 Git을 먼저 검증합니다.

## Doctor

doctor는 다음 범주를 구분해 보고합니다.

- plugin 실행 의존성
- release integrity
- 중단된 lifecycle transaction
- manager hook trust
- installer ownership

누락된 시스템 패키지는 자동 설치하지 않습니다. 실제 설치 명령과 범위를 보여주고 별도 승인을 받아야 합니다.

Source: [`plugins/nunch-skills-manager/skills/nunch-skills-manager/SKILL.md`](../../plugins/nunch-skills-manager/skills/nunch-skills-manager/SKILL.md)
