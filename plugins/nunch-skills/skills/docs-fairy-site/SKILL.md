---
name: docs-fairy-site
description: "문서 사이트를 새로 구축하거나 기존 사이트에 문서를 통합하고 production build·preview를 검증하며, 사용자가 명시한 경우에만 배포를 준비·수행합니다. ‘docs site를 만들어줘’, Starlight·VitePress 구축, 문서 사이트 이관·검색·배포 요청에 사용하세요. 일반 문서만 생성·동기화·감사하는 요청에는 docs-fairy를 사용합니다."
metadata:
  user-invocable: true
---

# Docs Fairy Site

문서 사이트의 scaffold·integration·build·preview·배포를 소유하는 primary 스킬입니다. 작업을 시작할 때 [`docs-fairy`의 문서 공통 정책](../docs-fairy/references/shared-policy.md)을 읽습니다.

## 호출 계약

다음 세 경로는 모두 이 workflow로 합류합니다.

1. “docs site를 만들어줘” 같은 자연어 요청에서 이 스킬이 자동 선택됩니다.
2. 사용자가 `$docs-fairy`를 명시했지만 결과가 문서 사이트이면 `docs-fairy`가 같은 turn에서 이 스킬로 전환합니다.
3. 사용자가 `$docs-fairy-site`를 명시하면 이 스킬을 직접 실행합니다.

한 요청에서 SITE workflow를 두 번 실행해서는 안 됩니다. `docs-fairy`에서 전환된 경우 그 스킬이 이미 완료한 문서 조사·생성·검증을 반복하지 않고 handoff 결과를 사용합니다.

## 소유 범위와 권한

이 스킬은 문서 사이트의 콘텐츠, scaffold, framework 설정, 사이트 전용 package, navigation, search, asset, build와 preview를 수정할 수 있습니다. 일반 애플리케이션 코드, 다른 package 구현과 비문서용 저장소 설정은 수정하지 않습니다.

- **WHEN** 사용자가 사이트 생성·통합만 요청하면 local scaffold, production build와 production preview 검증까지만 수행합니다.
- **ONLY WHEN** 사용자가 `deploy`, `publish`, 공개 URL 또는 동등한 원격 배포를 명시하면 [문서 사이트 배포](references/site-deployment.md)를 읽습니다.
- Repository workflow 준비는 실제 원격 배포, provider project 생성, secret 접근, domain·DNS 변경 권한을 포함하지 않습니다.
- **BEFORE** 원격 배포를 실행할 때 exact provider·project·account·public URL과 사용할 secret 범위를 확인합니다.
- 요청에 없던 기존 사이트 framework 교체, 문서 정본 변경, 대규모 콘텐츠 재구성은 영향과 migration plan을 보여주고 별도 승인을 받습니다.

## 입력과 handoff

`docs-fairy`는 SITE 필수 산출물의 존재와 검증을 확인한 뒤에만 이 스킬을 호출합니다. **IF** SITE 필수 산출물이 누락됐거나 미검증이면 질문은 `docs-fairy` workflow에 남고, 이 스킬을 호출하거나 SITE workflow를 시작한 것으로 계산해서는 안 됩니다.

**WHEN** 검증 gate를 통과한 `docs-fairy` handoff로 이 스킬을 시작하면 다음 입력을 확인합니다.

- 검증된 문서 산출물과 canonical source
- 미검증·실패 항목
- SITE에 필수인 콘텐츠 목록
- 사용자가 승인한 SITE와 배포 범위

**IF** 전달 자료가 사전 조건과 달리 SITE 필수 산출물의 누락·미검증을 포함하면 handoff를 거부하고 `docs-fairy`가 한 가지 선택을 묻게 합니다. 이 경우 어떤 SITE 파일도 변경하지 않습니다. **ELSE** 검증된 산출물만 사용하고 필수가 아닌 미검증 항목을 결과에 남깁니다.

## Framework router

[문서 사이트 공통 계약](references/site-common.md)을 항상 읽고 현재 상태에 맞는 reference 하나만 추가로 읽습니다.

| 조건 | 선택 |
|---|---|
| 기존 Starlight 사이트 | [Starlight](references/site-starlight.md) |
| 기존 VitePress 사이트 | [VitePress](references/site-vitepress.md) |
| 신규 사이트이며 사용자가 framework를 지정하지 않음 | 기본값 [Starlight](references/site-starlight.md) |
| 사용자가 다른 framework를 지정 | 실행 시점의 해당 framework 공식 문서 |

기존 사이트가 있으면 framework와 구조를 보존합니다. 다른 정적 사이트만 있고 별도 docs 사이트와 통합 중 어느 결과인지 불명확하면 파일을 만들기 전에 한 가지 질문을 합니다.

## Workflow

1. 사이트 root, 기존 콘텐츠·자산, framework, package manager, workspace와 CI 참여 여부를 확인합니다.
2. 신규 scaffold이면 생성 위치와 예상 구조를 한 줄로 알리고 기존 파일과 충돌하지 않는 경로를 선택합니다.
3. canonical 문서 source와 동기화 방식을 정하고 검증된 콘텐츠만 이관합니다.
4. 선택한 framework의 navigation·search·locale·asset·link 규칙을 적용합니다.
5. package-local production build와 관련 lint·link check를 실행합니다.
6. Repository가 허용한 브라우저 자동화 수단으로 production preview의 대표 사용자 흐름을 검증합니다.
7. 배포가 명시된 경우에만 별도 배포 gate를 적용합니다.
8. 완료 상태와 미검증 항목, 남은 승인과 기술부채를 보고합니다.

## 완료 상태

| 상태 | 필수 조건 |
|---|---|
| `local-complete` | package-local production build와 production preview 대표 흐름 통과 |
| `config-prepared` | 명시된 provider의 공식 설정·workflow 준비와 local 검증 완료. 실제 배포 완료를 뜻하지 않음 |
| `deployment-ready` | 승인된 원격 배포와 공개 URL 대표 흐름 검증 통과 |

필수 build 또는 preview가 실패하면 기술부채를 기록해도 `local-complete`로 판정해서는 안 됩니다. 실제 공개 URL을 검증하지 않았으면 `deployment-ready`라고 주장해서는 안 됩니다.

## 경계 예시

### 정상 경로

- 입력: “기존 `docs/`를 보존하면서 Starlight 문서 사이트를 만들어줘.”
- 판단: 신규 SITE 요청이며 배포 요청은 없습니다.
- 행동: 충돌하지 않는 위치에 scaffold하고 콘텐츠를 이관한 뒤 production build·preview까지 검증합니다. 원격 배포는 하지 않습니다.

### 질문이 필요한 경로

- 입력: “이 블로그에 문서 사이트도 붙여줘.”
- 관찰: 기존 정적 사이트가 있지만 같은 사이트에 통합할지 별도 docs 앱으로 만들지 알 수 없습니다.
- 행동: 두 결과의 exact 위치와 영향을 보여주고 한 가지 선택을 묻습니다. 선택 전에는 scaffold하지 않습니다.

### 부분 성공 경로

- 입력: “API 문서와 사이트를 모두 최신화해줘.”
- 관찰: `docs-fairy`가 API 경로 하나를 검증하지 못했고 그 페이지가 SITE 필수 입력입니다.
- 행동: 검증된 페이지를 보존하지만 SITE workflow를 시작하지 않습니다. 미검증 API와 필요한 다음 선택을 `partial success`로 보고합니다.

## 완료 보고

- 사이트 root와 콘텐츠·sidebar 대응 구조
- dev·build·preview 명령과 실행 결과
- `local-complete`·`config-prepared`·`deployment-ready`의 `충족`·`미충족`·`요청 안 됨` 판정
- 검수한 route·navigation·search·theme 제공 여부와 관찰 결과
- 실행하지 않은 remote·secret·domain 작업과 남은 blocker
