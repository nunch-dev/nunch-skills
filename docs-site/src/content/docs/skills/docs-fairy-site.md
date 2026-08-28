---
title: docs-fairy-site
description: 문서 사이트를 구축·검증하고 명시적으로 요청된 경우에만 배포하는 스킬
---

문서 사이트의 scaffold·콘텐츠 통합·설정·검색·navigation·build·preview를 담당하는 `docs-fairy` 연관 스킬입니다. 일반 문서 작성과 사이트 구현의 책임을 분리하되, 혼합 요청에서는 두 스킬이 같은 응답 안에서 순서대로 협력합니다.

## 호출 방식

다음 요청은 모두 하나의 SITE workflow로 합류하며, 한 요청에서 두 번 실행하지 않습니다.

1. “docs site를 만들어줘” 같은 자연어 요청은 `docs-fairy-site`를 자동 선택합니다.
2. `$docs-fairy`를 지정해 사이트를 요청하면 `docs-fairy`가 같은 응답 안에서 이 스킬로 전환합니다.
3. `$docs-fairy-site`를 지정하면 이 스킬을 직접 실행합니다.

## 실행 경계

- 기존 사이트가 있으면 framework와 구조를 보존합니다.
- 신규 사이트에서 framework를 지정하지 않으면 Starlight를 사용합니다.
- 일반적인 사이트 생성 요청은 로컬 scaffold, production build, production preview 검증까지만 수행합니다.
- `deploy`, `publish`, 공개 URL을 명시한 경우에만 배포 절차를 시작합니다. 원격 변경 전에 정확한 provider·project·account·public URL과 secret 범위를 확인합니다.
- SITE에 필수인 문서가 누락됐거나 미검증이면 scaffold·통합을 시작하지 않고 한 가지 선택을 묻습니다.

## 완료 상태

| 상태 | 의미 |
| --- | --- |
| `local-complete` | package-local production build와 production preview 대표 흐름을 검증함 |
| `config-prepared` | 명시한 provider의 설정·workflow와 로컬 검증을 완료했지만 실제 배포는 하지 않음 |
| `deployment-ready` | 승인된 원격 배포와 공개 URL의 대표 흐름을 검증함 |

필수 build나 preview가 실패하면 `local-complete`라고 하지 않습니다. 공개 URL을 검증하지 않았으면 `deployment-ready`라고 하지 않습니다.

Source: [`plugins/nunch-skills/skills/docs-fairy-site/SKILL.md`](https://github.com/nunch-dev/nunch-skills/blob/main/plugins/nunch-skills/skills/docs-fairy-site/SKILL.md)
