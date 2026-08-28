# Starlight 문서 사이트

[문서 사이트 공통 계약](site-common.md)을 먼저 읽습니다. 이 reference는 신규 Starlight scaffold와 기존 Starlight 사이트 통합에만 적용합니다. 프레임워크를 지정하지 않은 신규 사이트의 기본값은 Starlight입니다.

scaffold 명령과 설정 스키마는 바뀔 수 있습니다. 구현 시점의 [Starlight 공식 문서](https://starlight.astro.build)와 설치된 Astro·Starlight 버전을 확인하고, 아래 예시와 다르면 공식 문서를 우선합니다.

배포를 요청하면 [문서 사이트 배포](site-deployment.md)를 추가로 읽습니다.

## 신규 사이트 scaffold

### 위치 선택

- 기본 후보는 저장소 안 `docs/`의 독립 package입니다. `docs/`가 기존 Markdown·자산의 정본이면 그 위에 scaffold하지 않고 `docs-site/` 같은 충돌 없는 형제 경로나 monorepo의 기존 앱 위치를 선택합니다.
- 프로젝트 루트가 이미 Astro 프로젝트면 별도 scaffold보다 공식 Starlight integration 절차로 기존 프로젝트에 통합하는 편이 맞는지 확인합니다.

### 구성

1. 저장소 lockfile로 package manager를 판단하고, 현재 공식 scaffold 명령으로 Starlight 사이트를 만듭니다. 예시는 다음과 같지만 그대로 고정하지 않습니다.

   ```bash
   npm create astro@latest docs -- --template starlight --no-git
   ```

2. 새 사이트에는 Mermaid 렌더링과 내부 링크 검증을 기본 설치합니다. 아래 package를 쓰기 전에 설치된 Astro·Starlight와 현재 호환되는지 확인하고, 실제 명령은 선택한 package manager에 맞춥니다.

   ```bash
   npm install astro-mermaid mermaid starlight-links-validator
   ```

   다른 Starlight community plugin은 사용자가 요청하거나 프로젝트 요구가 입증된 경우에만 추가합니다.
3. `astro.config.mjs`에서는 Mermaid integration을 Starlight보다 먼저 등록하고 링크 검증기를 Starlight plugin으로 등록합니다. 기존 설정을 보존하면서 프로젝트명, locale, sidebar와 저장소 링크를 맞춥니다.

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

4. 템플릿의 영어 예제 콘텐츠는 실제 문서로 대체합니다. 예제 페이지가 navigation이나 검색 결과에 남지 않았는지 확인합니다.
5. package-local dev·build·preview script와 생성 산출물 ignore 규칙을 확인합니다.

## 설정과 콘텐츠

- 기본 콘텐츠 위치는 `src/content/docs/`이지만 기존 `srcDir` 또는 content collection 설정이 있으면 그 구조를 따릅니다.
- 페이지 frontmatter는 최소 `title`, `description`을 사용하되 기존 schema와 page type을 우선합니다.
- 수동 sidebar면 새 페이지를 설정에 추가하고, 자동 sidebar면 파일명·디렉터리·frontmatter 정렬 규칙으로 의도한 순서가 나오는지 확인합니다.
- 내부 문서 링크는 사이트 root 기준 경로 등 기존 Starlight 관례를 따르고 build에서 검증합니다.
- Astro 또는 Starlight 설정을 예시에서 복사하기보다 설치된 버전의 config type과 공식 reference로 유효성을 확인합니다.

## 기존 Starlight 사이트에 통합

1. `astro.config.*`, `src/content.config.*`, `src/content/docs/`, locale, sidebar, component override와 custom CSS를 조사합니다.
2. 기존 frontmatter와 content collection schema에 맞춰 문서를 추가합니다.
3. 수동 sidebar·nav·관련 페이지에서 새 문서가 발견되도록 연결합니다.
4. 기존 component override를 보존하고, 기본 Starlight component로 해결되는 문제에 별도 custom component를 만들지 않습니다.
5. [공통 계약](site-common.md)의 production build와 preview 수동 검수를 통과합니다.

## 다국어 문서

임의의 `docs/<locale>/` 규칙을 만들지 않고 구현 시점의 [Starlight i18n 문서](https://starlight.astro.build/guides/i18n/)와 [설정 reference](https://starlight.astro.build/reference/configuration/)를 확인합니다.

- 단일 한국어 사이트는 `root` locale에 `lang: 'ko'`를 설정합니다.
- 다국어 사이트는 `locales`와 `defaultLocale`을 설정하고 `src/content/docs/<locale>/` 아래에 콘텐츠를 둡니다.
- 같은 페이지의 번역본은 locale 사이에서 동일한 상대 파일명과 경로를 유지합니다. 그래야 fallback 콘텐츠와 번역 안내가 연결됩니다.
- root locale을 쓰면 기본 언어 콘텐츠는 `src/content/docs/` 바로 아래에 두고 다른 언어만 locale 디렉터리에 둡니다.
- `src/content/i18n/`은 Starlight가 제공하지 않는 UI 문자열을 추가하거나 기본 번역을 재정의할 때만 사용합니다.
- 기존 사이트에 `locales`, `defaultLocale`, root 구성이 있으면 그대로 따르고 별도 locale 체계를 만들지 않습니다.

## 시각 설명

신규 Starlight 사이트에는 Mermaid가 기본 포함되므로 시각 자료가 실제 이해를 돕는 tutorial·explanation에서 사용합니다. 페이지 상단의 핵심 흐름처럼 하나의 명확한 질문에 답하도록 하고, 여러 다이어그램을 장식처럼 반복하지 않습니다. Starlight 기본 component로 표현할 수 있는 안내·경고·단계에는 별도 HTML artifact를 만들지 않습니다.

## Starlight 검수 초점

[공통 production preview 검수](site-common.md#production-preview-수동-검수)에 더해 다음을 확인합니다.

- Pagefind 검색 결과가 build 산출물에서 생성되고 결과 선택이 올바른 route로 이동한다.
- sidebar 자동 생성·badge·collapsed 상태처럼 사용 중인 Starlight 기능이 실제 콘텐츠 구조와 일치한다.
- component override와 custom CSS가 기본 theme의 outline, code block, table, locale UI를 깨뜨리지 않는다.
- Mermaid나 community plugin을 썼다면 production build와 client navigation 뒤에도 렌더링이 유지된다.
