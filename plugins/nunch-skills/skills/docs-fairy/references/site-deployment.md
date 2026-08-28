# 문서 사이트 배포

먼저 docs-site의 프레임워크와 배포 대상을 확인한 다음, 선택한 provider의 공식 방식에 따라 `config-prepared`와 `deployment-ready`를 검증합니다. 사이트 구축과 `local-complete`는 [문서 사이트 공통 계약](site-common.md)이 소유합니다.

provider의 action version, adapter, Node 요구사항, workflow syntax와 hosting 제한은 바뀔 수 있습니다. 이 reference의 예시를 최신 사실로 간주하지 말고 실행 시점의 공식 문서를 우선합니다.

## 먼저 확인할 것

배포 설정에 앞서 사용자에게 다음 중 어떤 결과가 필요한지 확인합니다.

| 선택 | 진행 |
|---|---|
| `local-only` | 원격 배포 설정을 만들지 않는다. `config-prepared`와 `deployment-ready`는 `요청 안 됨`으로 보고 |
| GitHub Pages | 실행 시점의 선택한 프레임워크와 GitHub Pages 공식 문서를 확인 |
| named provider | 사용자가 지정한 provider와 선택한 프레임워크의 공식 배포 문서를 확인 |

대상을 확인하기 전에는 adapter, publish directory, workflow, `base`를 추정해 만들지 않습니다. 공식 권장 방식이 아닌 custom 배포는 사용자가 명시적으로 선택한 경우에만 진행합니다. 이 경우 공식 방식과의 차이·운영 위험·검증 방법을 기록합니다.

## 권한 gate

배포 대상을 정했다고 해서 아래 작업이 한꺼번에 승인된 것은 아닙니다.

| Gate | 허용 범위 | 별도 확인이 필요한 경우 |
|---|---|---|
| repository 준비 | docs-site 설정·package 구성·사이트 전용 workflow 작성 | 사용자가 배포 준비나 해당 변경을 요청한 범위에서 수행 |
| 원격 배포 | workflow 실행, provider project 생성·연결, remote publish | 실제 원격 쓰기 전에 승인 필요 |
| secret 접근 | token·key·credential 조회, 생성, 등록 | secret별 승인 필요 |
| domain/DNS | custom domain 연결, DNS record 변경 | 대상 domain과 변경값에 대한 승인 필요 |

repository 준비 승인은 원격 배포·secret·domain/DNS 권한을 포함하지 않습니다. docs-fairy가 직접 수정하는 범위는 문서와 docs-site입니다. 일반 애플리케이션 코드나 다른 package를 바꿔야 한다면 수정하지 말고 필요한 작업을 안내합니다.

## 실행 시점 근거 기록

`config-prepared`를 판단하기 전에 다음을 확인한 뒤 날짜와 출처를 결과에 남깁니다.

- 선택한 provider의 최신 공식 배포 문서
- 프로젝트에 설치된 문서 프레임워크와 runtime 버전
- Node와 package manager 요구사항
- 공식 방식이 요구하는 build command와 publish directory
- 정적 output 또는 on-demand rendering 여부
- 필요한 adapter·workflow·runtime 설정

정적 문서 사이트라는 이유만으로 adapter·workflow·publish directory를 미리 단정하지 않습니다. 선택한 프레임워크, provider와 rendering 방식의 공식 절차가 요구하는 구성을 따릅니다. provider별 값을 이 reference에 영구 고정하지 않습니다.

확인 기록 예시:

```markdown
- Provider: GitHub Pages
- 확인일: YYYY-MM-DD
- 공식 출처: {framework와 provider 공식 문서 URL}
- Framework / Node: {project에서 확인한 값}
- 공식 방식과 다른 점: 없음
```

## 공통 `config-prepared` gate

다음 조건을 모두 만족해야 `config-prepared`로 보고합니다.

1. [문서 사이트 공통 계약](site-common.md)의 `local-complete`가 충족됐다.
2. provider의 공식 방식과 project version 요구사항을 실행 시점에 확인했다.
3. 공식 방식이 요구하는 build command, output 또는 publish directory, adapter, workflow와 runtime 설정을 적용했다.
4. 실제 공개 URL을 확정하고 프레임워크가 제공하는 canonical URL·site metadata 설정이 있으면 그 URL과 일치하는지 검증했다.
5. hosted site는 하위 경로 배포인 경우에만 path `base`를 설정하고 그 경로에서 문서 링크·asset·검색 결과 진입을 검증했다. relocatable build를 명시적으로 요청했다면 프레임워크의 공식 relative-base 방식과 제한을 별도로 검증했다.
6. sitemap 필요 여부를 사용자에게 확인하고 선택 결과를 반영했다.
7. 아직 승인받지 않았거나 수행하지 않은 remote 작업·secret·domain/DNS 변경을 명시했다.

설정과 workflow가 준비됐더라도 실제 배포를 완료했다고 표현하지 않습니다. `config-prepared`는 중간 보고 상태이며 완료 단계가 아닙니다.

## 공개 URL과 base

`deployment-ready`에는 실제 공개 URL이 필요합니다. 프레임워크가 canonical URL이나 site metadata 설정을 제공하면 공개 URL과 일치시키고, 제공하지 않으면 존재하지 않는 설정을 만들지 않습니다. URL을 모르면 임의로 작성하지 말고 `config-prepared` 미충족 또는 blocker로 보고합니다.

일반 hosted site에서는 하위 경로 배포에만 path `base`를 적용합니다. 예를 들어 GitHub Pages project site와 custom domain은 경로 조건이 다를 수 있으므로 공식 문서와 실제 URL 구조로 판단합니다. IPFS·offline bundle처럼 위치를 옮길 수 있는 산출물을 사용자가 명시적으로 요청했고 프레임워크가 relative base를 지원하면 별도 route로 다룹니다. `base`를 적용했다면 production build와 실제 경로에서 다음을 확인합니다.

- 내부 문서 링크가 올바른 하위 경로를 유지한다.
- CSS·JavaScript·이미지 등 asset이 정상적으로 로드된다.
- 검색 결과에서 선택한 문서로 이동할 수 있다.

## sitemap 선택

sitemap은 모든 배포의 필수 조건이 아닙니다. 배포 준비 전에 공개 검색 엔진 노출과 sitemap이 필요한지 사용자에게 먼저 묻습니다.

- 필요하지 않거나 `local-only`이면 sitemap 누락은 blocker가 아닙니다.
- 필요하면 선택한 프레임워크의 공식 sitemap 방식, 생성 결과와 sitemap 안의 공개 URL이 실제 배포 URL과 일치하는지 검증합니다.
- 사용자 답변 없이 자동 활성화하지 않습니다.
- sitemap 선택만으로 검색 엔진 등록, Search Console 연결이나 크롤링 요청을 수행하지 않습니다.

구현 시점의 선택한 프레임워크와 provider 공식 sitemap 문서를 다시 확인합니다.

## GitHub Pages route

GitHub Pages를 선택하면 다음 순서로 준비합니다.

1. 실행 시점의 선택한 프레임워크와 GitHub Pages 공식 문서를 확인합니다.
2. user/organization site, project site, custom domain 중 URL 형태를 확인합니다.
3. URL에 맞춰 프레임워크가 지원하는 canonical URL 설정과 조건부 `base`를 설정합니다.
4. 현재 공식 문서가 권장하는 Pages workflow와 repository 설정을 사용합니다. action version이나 권한 값을 이 reference에서 추정하지 않습니다.
5. lockfile과 공식 Node/package-manager 요구사항을 확인합니다.
6. repository 준비 결과와 아직 필요한 remote·secret·domain/DNS 승인을 분리해 보고합니다.

## Named provider route

사용자가 다른 provider를 지정하면 해당 provider와 선택한 문서 프레임워크의 공식 배포 문서를 확인합니다. 공식 방식에서 다음 값을 확인해 project 설정과 대조합니다.

- 지원하는 rendering mode와 필요한 adapter
- build command와 publish directory
- Node와 package manager 조건
- environment variable과 secret 요구사항
- 하위 경로·redirect·custom domain 조건
- 공식 배포와 rollback 또는 redeploy 방법

provider 문서에 없는 값을 관례로 채우지 않습니다. 서로 다른 공식 문서가 충돌하면 설치된 version과 provider의 현재 UI·runtime을 기준으로 차이를 보고한 뒤 사용자 판단이 필요한 한 가지를 묻습니다.

## `deployment-ready` gate

다음 조건을 모두 확인한 뒤에만 `deployment-ready`로 보고합니다.

1. 실제 원격 배포가 성공했다.
2. 공개 URL이 응답하고 framework의 URL metadata·조건부 `base`와 일치한다.
3. production 공개 URL에서 [문서 사이트 공통 계약](site-common.md)의 대표 흐름을 다시 검증했다.
   - 홈 CTA
   - 사이드바 이동
   - 검색 결과 진입
   - 사이트가 제공하는 경우 테마 전환
   - 핵심 페이지의 CJK 줄바꿈과 overflow
4. provider 조건에 해당하는 asset·하위 경로·sitemap 검증이 통과했다.
5. 실패한 gate와 미검증 항목이 없다.

실제 배포나 공개 URL smoke를 수행하지 못했다면 `config-prepared`까지만 보고합니다. public smoke에서 발견한 문제를 기술부채로 기록할 수는 있지만, 실패한 필수 흐름을 통과 처리할 수는 없습니다.

## 결과 보고

SITE 결과에는 다음 상태를 각각 `충족`·`미충족`·`요청 안 됨`으로 표시합니다.

| 상태 | 보고할 근거 |
|---|---|
| `local-complete` | package-local production build와 production preview 결과 |
| `config-prepared` | provider, 공식 출처·확인일, local config와 workflow, 남은 승인 |
| `deployment-ready` | 원격 배포 결과, 공개 URL, public smoke 결과 |

warning과 기술부채를 남길 때는 [기술부채 기록과 해소 가이드](technical-debt.md)를 따릅니다. provider 선택, 공식 문서 확인, 설정 준비, remote 실행과 smoke 중 어디에서 멈췄는지 명확히 적습니다.
