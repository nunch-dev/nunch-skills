---
title: 설치와 첫 사용
description: Nunch Skills를 설치하고 정상 동작을 확인하는 가장 짧은 경로
---

Nunch Skills는 한 번의 명령으로 Codex와 Claude Code에 같은 플러그인을 설치합니다. 시작하기 전에 Node.js 22 이상이 준비되어 있는지 확인하세요.

## 설치

```bash
npx @nunch-dev/skills install
```

설치 프로그램이 필요한 파일을 배치하고 각 에이전트의 플러그인 설정을 갱신합니다.

같은 명령을 다시 실행하면 관리 중인 이전 버전은 업데이트되고, 같은 버전은 설치 상태만 검증합니다. 더 높은 버전이 설치되어 있거나 lifecycle 기록이 없는 설치는 자동으로 덮어쓰지 않습니다.

Codex는 SessionStart에서 최신 안정 버전을 자동으로 확인합니다. Claude Code는 자동 updater를 실행하지 않으므로 필요할 때 직접 업데이트합니다.

```bash
npx @nunch-dev/skills update --platform=claude
```

## 설치 상태 확인

```bash
npx @nunch-dev/skills doctor
npx @nunch-dev/skills doctor --json
```

첫 번째 명령은 사람이 읽기 쉬운 진단을 보여주고, 두 번째 명령은 자동화에서 쓰기 좋은 JSON을 출력합니다. 두 환경 가운데 하나만 사용하는 경우 다른 환경이 없다는 경고는 설치 실패가 아닙니다.

## 첫 요청 보내기

설치한 뒤 Codex나 Claude Code에서 작업에 맞는 스킬을 직접 이름으로 부르면 됩니다.

> docs-fairy를 이용해 README와 실제 동작이 일치하는지 점검해줘.

어떤 스킬이 알맞은지 모르겠다면 [스킬 고르기](/skills/)에서 각 스킬의 사용 시점과 결과물을 비교하세요.

## 다음 단계

- 플러그인을 개발하거나 검증하려면 [로컬 개발과 QA](/guides/local-development/)를 따르세요.
- 새 버전을 배포하려면 [릴리스 런북](/guides/release-runbook/)의 순서를 지키세요.
