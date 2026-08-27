# 문서 사이트 (SITE)

프로젝트 문서를 독립적인 웹 문서 사이트로 제공합니다. 기본 프레임워크는 **Starlight**(Astro 기반)입니다. 사용자가 VitePress 등 다른 프레임워크를 지정하면 그 공식 문서를 조사해 같은 원칙으로 진행합니다.

프레임워크 scaffold 명령과 설정 스키마는 자주 바뀝니다. 아래 내용과 실제 동작이 다르면 공식 문서(https://starlight.astro.build)를 우선하고, 문서 조회 도구(Context7 등)가 있으면 최신 버전을 확인합니다.

## 상황 판단

| 상황 | 진행 |
|---|---|
| 문서 사이트 없음 | 신규 scaffold (아래 A) |
| Starlight/VitePress 이미 있음 | 기존 구조에 통합 (아래 B) |
| 다른 정적 사이트만 있음 (블로그 등) | 사용자에게 확인: 별도 docs 사이트 vs 기존 사이트에 통합 |

신규 scaffold는 의존성 설치와 다수 파일 생성을 동반하므로, 시작 전에 생성될 위치·구조를 한 줄로 보고하고 진행합니다.

## A. 신규 사이트 scaffold

### 위치

- 기본: 저장소 안 `docs/` 하위 디렉터리에 독립 패키지로. 모노레포면 기존 워크스페이스 관례를 따릅니다.
- 프로젝트 루트가 이미 Astro 프로젝트면 scaffold 대신 `npx astro add starlight`로 기존 프로젝트에 통합을 검토합니다.

### 절차

1. scaffold 실행 (패키지 매니저는 저장소의 lockfile로 판단 — pnpm-lock.yaml이면 pnpm):

   ```bash
   npm create astro@latest docs -- --template starlight --no-git
   ```

2. 새 사이트에는 Mermaid 렌더링과 내부 링크 검증을 기본 설치합니다. 아래는 npm 예시이며 실제 명령은 1단계에서 판단한 패키지 매니저에 맞춥니다.

   ```bash
   npm install astro-mermaid mermaid starlight-links-validator
   ```

   다른 Starlight 커뮤니티 플러그인은 사용자가 명시적으로 요청하지 않는 한 기본 설치하지 않습니다.

3. `astro.config.mjs`에서 Mermaid integration을 Starlight보다 먼저 등록하고, 링크 검증기를 Starlight plugin으로 등록합니다. 기존 설정을 보존하면서 `title`(프로젝트명), `locales`, `sidebar`, `social`(저장소 링크)도 프로젝트에 맞게 설정합니다. 언어는 사용자 지정, 기존 프로젝트 관례, 한국어 순으로 선택합니다.

   ```js
   import starlight from '@astrojs/starlight'
   import mermaid from 'astro-mermaid'
   import { defineConfig } from 'astro/config'
   import starlightLinksValidator from 'starlight-links-validator'

   export default defineConfig({
     integrations: [
       mermaid(),
       starlight({
         plugins: [starlightLinksValidator()],
         title: '프로젝트 문서',
       }),
     ],
   })
   ```

4. 템플릿이 만든 영어 예제 콘텐츠(`src/content/docs/` 하위)는 삭제하고 실제 문서로 대체합니다. 예제 페이지가 남은 채 배포되는 것이 흔한 사고입니다.
5. 기존 마크다운 문서(README, docs/*.md)가 있으면 이관합니다 (아래 '콘텐츠 이관').
6. dev 서버(`npm run dev`)를 띄워 페이지를 확인하고, 프로덕션 빌드(`npm run build`)로 Mermaid 처리와 내부 링크 검증까지 통과하는지 확인한 뒤 완료를 보고합니다. 빌드 확인 없이 "완료"라고 하지 않습니다.

### 완료 보고 형식

사이트 작업의 완료 보고에는 두 가지를 반드시 포함합니다. 사용자가 만들어진 결과의 모양과 다루는 법을 한눈에 파악할 수 있어야 하기 때문입니다.

- **사이트 구조**: 생성·변경된 콘텐츠의 디렉터리 트리 (사이드바 구성과의 대응이 보이게):

  ```
  docs/src/content/docs/
  ├── index.mdx            # 홈 (splash)
  ├── getting-started.md   # 사이드바: 시작하기
  ├── guides/
  │   └── accessibility.md # 사이드바: 가이드 > 접근성 기준
  └── reference/
      └── api.md           # 사이드바: 레퍼런스 > API
  ```

- **실행 방법**: 용도별로 나눠 명확하게:

  ```bash
  cd docs
  npm run dev      # 로컬 미리보기 (http://localhost:4321)
  npm run build    # 정적 빌드 (dist/)
  npm run preview  # 빌드 결과 확인
  ```

배포(CI, GitHub Pages 등) 설정은 이 스킬의 기본 범위가 아닙니다. 사용자가 요청하면 진행하되 별도 승인을 받습니다.

## B. 기존 사이트에 통합

기존 사이트의 관례를 먼저 조사하고 따릅니다 — 새 문서가 사이트의 이질적 부분이 되면 안 됩니다.

1. **구조 파악**: 콘텐츠 디렉터리(Starlight: `src/content/docs/`), 사이드바 구성 방식(자동 생성 vs 수동 배열), 기존 문서의 frontmatter 패턴, 파일명 규칙, locale 구조.
2. **문서 추가**: 기존 패턴과 같은 frontmatter(최소 `title`, `description`)로 작성. 사이드바가 수동 구성이면 설정에도 항목을 추가합니다 — 페이지만 만들고 사이드바에 안 보이는 것이 가장 흔한 누락입니다.
3. **연결 확인**: 관련 기존 페이지에서 새 페이지로의 링크, 새 페이지에서 나가는 링크가 모두 유효한지 확인. 링크는 프레임워크 관례(Starlight는 사이트 루트 기준 절대 경로 `/guides/example/`)를 따릅니다.
4. **빌드 검증**: dev 서버나 빌드로 확인 후 보고.

## 콘텐츠 이관 (마크다운 → 사이트)

- 파일당 페이지 1개가 기본. 거대한 단일 문서는 논리 단위로 분할을 제안합니다.
- 각 페이지에 frontmatter 추가: `title`(H1과 중복되므로 본문 H1은 제거), `description`.
- 상대 링크(`./other.md`)를 사이트 경로로 변환하고, 이미지 등 자산을 함께 이관합니다.
- **원본 처리 결정은 사용자에게**: 원본 마크다운을 삭제할지, 사이트로 안내하는 stub으로 남길지, 그대로 둘지(중복 유지) 확인합니다. 기본 제안은 stub — README처럼 GitHub에서 바로 읽히는 가치가 있는 문서는 요약 + 사이트 링크로 남기는 편이 안전합니다.

## 다국어 문서

Starlight 사이트는 임의의 `docs/<locale>/` 규칙 대신 공식 i18n을 사용합니다. 구현 시점의 [Starlight i18n 문서](https://starlight.astro.build/guides/i18n/)와 [설정 reference](https://starlight.astro.build/reference/configuration/)를 확인합니다.

- 단일 한국어 사이트는 `root` locale에 `lang: 'ko'`를 설정합니다.
- 다국어 사이트는 `locales`와 `defaultLocale`을 설정하고 `src/content/docs/<locale>/` 아래에 콘텐츠를 둡니다.
- 같은 페이지의 번역본은 locale 사이에서 동일한 상대 파일명과 경로를 유지합니다. 그래야 fallback 콘텐츠와 번역 안내가 연결됩니다.
- root locale을 쓰면 기본 언어 콘텐츠는 `src/content/docs/` 바로 아래에 두고 다른 언어만 locale 디렉터리에 둡니다.
- `src/content/i18n/`은 Starlight가 제공하지 않는 UI 문자열을 추가하거나 기본 번역을 재정의할 때만 사용합니다.
- 기존 사이트에 `locales`, `defaultLocale`, root 구성이 있으면 그대로 따르고 별도 locale 체계를 만들지 않습니다.

## 시각 우선 설명

입문자·비개발자 대상 tutorial이나 explanation에는 별도 HTML artifact 대신 기본 설치된 Mermaid와 Starlight 컴포넌트를 사용합니다. 페이지 상단에는 핵심 흐름을 보여주는 Mermaid 다이어그램 하나와 짧은 요약을 두고, 검증된 상세 설명은 그 아래에 배치합니다. 시각 자료를 여러 개 쓰려면 각 자료가 서로 다른 질문에 답해야 하며 장식만을 위한 그림은 만들지 않습니다.

## 문서 구조 설계

사용자·개발자 안내 콘텐츠의 정보 구조를 새로 설계할 때는 [Diátaxis](https://diataxis.fr/)로 독자 요구를 구분합니다. 각 페이지에는 주된 요구를 하나만 부여하고, 프로젝트에 실제 필요한 분류만 만듭니다. 네 분류를 채우기 위한 빈 페이지나 중복 문서는 만들지 않습니다.

- **시작하기** (tutorial): 처음 온 사람이 안내를 따라 성공 경험에 도달하는 학습 경로
- **가이드** (how-to guide): 이미 기본 지식이 있는 독자가 특정 목표를 달성하는 절차
- **레퍼런스** (reference): API/CLI/설정처럼 정확하고 완전하게 조회할 정보
- **설명** (explanation): 아키텍처 개념, 동작 원리, 설계 맥락과 이유

ADR·프로젝트 히스토리·사고 기록은 Diátaxis 페이지로 바꾸지 않습니다. 사이트에 함께 제공해야 한다면 기존 프로젝트 관례에 맞춰 **의사결정**, **프로젝트 기록**, **운영 기록** 같은 별도 탐색 그룹에 원래 기록 형식으로 배치합니다.
