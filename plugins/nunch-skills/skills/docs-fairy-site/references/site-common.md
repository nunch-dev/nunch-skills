# 문서 사이트 공통 계약

문서 사이트의 프레임워크 선택, 콘텐츠 이관, 완료 판정과 검증을 담당합니다. 먼저 [`docs-fairy`의 문서 공통 정책](../../docs-fairy/references/shared-policy.md)을 적용하고, 이 reference를 읽은 뒤 현재 사이트나 사용자가 선택한 프레임워크 reference 하나만 추가로 읽습니다.

- [Starlight](site-starlight.md): 기존 Starlight 사이트 또는 프레임워크를 지정하지 않은 신규 사이트
- [VitePress](site-vitepress.md): 기존 VitePress 사이트 또는 사용자가 VitePress를 지정한 사이트

다른 프레임워크를 지정하면 그 프레임워크의 실행 시점 공식 문서를 조사해 이 공통 계약을 적용합니다. 기존 사이트의 프레임워크를 요청 없이 교체하지 않습니다.

배포·hosting·GitHub Pages·공개 URL을 요청하면 [문서 사이트 배포](site-deployment.md)를 추가로 읽습니다. 설정과 workflow만 준비한 상태는 `config-prepared`, 실제 원격 배포와 공개 URL 검증까지 마친 상태만 `deployment-ready`입니다.

## 완료 상태

`local-complete`는 다음 조건을 모두 만족한 상태입니다.

- 사이트 package의 production build와 package-local 품질 gate가 통과했다.
- production preview에서 대표 사용자 흐름을 직접 검증했다.
- 남은 warning과 기술부채를 숨기지 않고 보고했다.

production preview를 실행하지 못했거나 대표 흐름이 실패했다면 기술부채로 낮춰 기록하더라도 `local-complete`라고 선언하지 않습니다. 독립 package는 자체 gate가 있으면 충분하며 root workspace·`check`·CI 편입은 필수 조건이 아닙니다. 대신 독립 package라는 사실과 root gate 참여 여부를 결과에 남깁니다.

## 상황 판단

| 상황 | 진행 |
|---|---|
| 문서 사이트 없음 | 사용자가 프레임워크를 지정하지 않았으면 Starlight로 신규 scaffold |
| 문서 사이트 이미 있음 | 현재 프레임워크와 구조에 통합 |
| 다른 정적 사이트만 있음 (블로그 등) | 별도 docs 사이트와 기존 사이트 통합 중 어느 쪽인지 확인 |

신규 scaffold는 의존성 설치와 다수 파일 생성을 동반하므로 시작 전에 생성 위치와 구조를 한 줄로 보고합니다. 기본 후보 경로에 기존 문서나 자산이 있으면 덮어쓰지 말고 충돌하지 않는 위치를 선택해 그 이유도 함께 알립니다.

기존 사이트에 통합할 때는 콘텐츠 디렉터리, project root, 설정 파일, sidebar 방식, frontmatter, 파일명, locale, 테마 확장 관례를 먼저 조사합니다. 페이지만 만들지 말고 관련 기존 페이지와 sidebar·nav에서 새 문서가 발견되는지까지 확인합니다.

## 콘텐츠 이관

- 파일당 페이지 1개를 기본으로 하고, 거대한 단일 문서는 독자의 목적에 맞는 논리 단위로 분할을 제안합니다.
- 각 페이지는 프레임워크와 기존 사이트가 사용하는 frontmatter를 따릅니다. 자동 제목과 본문 H1이 중복되면 하나만 남깁니다.
- 상대 링크와 이미지 등 자산을 함께 이관하고, 최종 URL 규칙에 맞춰 내부 링크를 고칩니다.
- 완료 전에 문서의 **정본(SSOT)** 과 동기화 방식을 확인합니다. 기본 제안은 사이트 문서를 정본으로 두고 GitHub에서 바로 읽을 가치가 있는 원본은 요약과 사이트 링크 stub으로 남기는 방식입니다.
- 원본을 정본으로 유지하면 결정적 생성·동기화 절차를 둡니다. 중복 유지를 선택하면 책임과 갱신 절차를 문서화합니다. 즉시 해소하지 못한 drift와 잘못된 edit link는 [기술부채 기록과 해소 가이드](../../docs-fairy/references/technical-debt.md)에 따라 영향·목표 상태·해소 절차·검증·종료 기준을 기록합니다.

## 정보 구조와 시각 설명

사용자·개발자 안내 콘텐츠의 정보 구조를 새로 설계할 때는 [Diátaxis](https://diataxis.fr/)로 독자 요구를 구분합니다. 각 페이지에는 주된 요구를 하나만 부여하고 실제로 필요한 분류만 만듭니다.

- **시작하기** (tutorial): 안내를 따라 첫 성공 경험에 도달하는 학습 경로
- **가이드** (how-to guide): 특정 목표를 달성하는 절차
- **레퍼런스** (reference): API·CLI·설정처럼 정확하게 조회할 정보
- **설명** (explanation): 아키텍처 개념, 동작 원리, 설계 맥락과 이유

ADR·프로젝트 히스토리·사고 기록은 Diátaxis 페이지로 바꾸지 않습니다. 함께 제공해야 한다면 의사결정·프로젝트 기록·운영 기록 같은 별도 탐색 그룹에 원래 형식으로 배치합니다.

입문자·비개발자 대상 tutorial이나 explanation에는 장식이 아니라 이해를 돕는 시각 자료를 사용합니다. 프로젝트에 이미 있는 호환 가능한 다이어그램 방식을 우선하고, 새 도구가 필요하면 현재 프레임워크·버전과의 호환성을 공식 문서에서 확인합니다. 페이지마다 다이어그램을 강제하지 않습니다.

## production preview 수동 검수

프로젝트에서 허용한 브라우저 자동화 수단으로 production preview를 실제 사용자처럼 확인합니다. 작은 사이트는 모든 route를, 큰 사이트는 각 템플릿·sidebar 그룹의 대표 페이지와 위험도가 높은 페이지를 표본으로 봅니다. 프로젝트가 별도 viewport 범위를 정했다면 그 범위만 따릅니다.

- 홈 CTA, sidebar 이동, 검색 결과 진입이 실제로 동작하고, 사이트가 테마 전환 UI를 제공하면 해당 전환도 검증한다.
- 내부 링크가 올바른 페이지로 이동하고 코드 블록·표에 잘림이나 원치 않는 가로 넘침이 없다.
- 한국어 사이트는 본문·표·검색 발췌에서 CJK 줄바꿈이 자연스럽고 명령·경로·식별자가 중간에서 깨지지 않는다.
- 자동 생성되는 페이지 제목·개요와 본문 heading이 중복되지 않는다.

검색처럼 production build에서 생성되는 기능은 dev 서버 결과로 대체하지 않습니다. 검수한 URL·상호작용·결과와 필요한 화면 증거를 기록하며, sticky 영역이 반복되는 전체 페이지 합성 화면만을 유일한 증거로 삼지 않습니다.

## 완료 보고

사이트 작업의 완료 보고에는 다음을 포함합니다.

- **사이트 구조**: 생성·변경된 콘텐츠의 디렉터리 트리와 sidebar 대응
- **실행 방법**: package 위치와 dev·build·preview 명령
- **검증 상태**: production build·preview 수동 검수, root workspace·`check`·CI 참여 여부, 남은 warning
- **완료 상태**: 다음 상태를 각각 `충족`·`미충족`·`요청 안 됨`으로 표시

| 상태 | 판정 기준 |
|---|---|
| `local-complete` | package-local production build와 production preview 대표 흐름 통과 |
| `config-prepared` | 선택한 provider의 로컬 설정과 workflow 준비 완료. 실제 배포 완료를 뜻하지 않음 |
| `deployment-ready` | 원격 배포 완료 후 공개 URL에서 대표 흐름 검증 통과 |

`config-prepared`는 완료 단계가 아닌 중간 상태입니다. build warning은 영향과 함께 보고하고 공개 URL을 확인하지 못했으면 지어내지 않습니다. hard gate 실패는 기술부채를 기록했다는 이유로 통과 처리하지 않습니다.
