# VitePress 문서 사이트

[문서 사이트 공통 계약](site-common.md)을 먼저 읽습니다. 이 reference는 신규 VitePress scaffold와 기존 VitePress 사이트 통합에만 적용합니다. 기존 사이트를 Starlight로 바꾸지 않고 현재 VitePress 구조를 보존합니다.

VitePress의 Node 요구사항, 설치 명령, config와 theme API는 바뀔 수 있습니다. 구현 시점의 [VitePress 공식 문서](https://vitepress.dev)와 설치된 버전을 확인하고, 이 reference의 예시와 다르면 공식 문서를 우선합니다. community plugin을 고를 때는 현재 VitePress·Vue·Vite 조합과의 호환 근거도 확인합니다.

작업 범위에 맞는 공식 문서만 확인합니다: [설치](https://vitepress.dev/guide/getting-started), [routing](https://vitepress.dev/guide/routing), [site config](https://vitepress.dev/reference/site-config), [default theme config](https://vitepress.dev/reference/default-theme-config), [theme 확장](https://vitepress.dev/guide/extending-default-theme), [검색](https://vitepress.dev/reference/default-theme-search).

배포를 요청하면 [문서 사이트 배포](site-deployment.md)를 추가로 읽습니다.

## 신규 사이트 scaffold

### 위치와 project root

- 기존 애플리케이션과 함께 두는 사이트는 `docs/` 같은 중첩 디렉터리를 VitePress **project root**로 두는 구성이 일반적입니다. 하지만 `docs/`가 기존 Markdown의 정본이면 그 위에 init하지 말고, 기존 파일을 보존할 수 있는 `docs-site/` 또는 monorepo의 기존 앱 위치를 선택합니다.
- VitePress는 CLI에 전달한 디렉터리에서 `.vitepress/`를 찾습니다. package 위치, VitePress project root와 Markdown `srcDir`을 서로 다른 개념으로 기록합니다.
- `.vitepress/config.*`, `.vitepress/theme/`, source Markdown과 `public/`의 실제 위치를 확인한 뒤 script의 root 인수를 정합니다. `srcDir`은 project root 기준입니다.

### 구성

1. 저장소 lockfile과 workspace 관례로 package 위치와 package manager를 정합니다. 구현 시점 공식 가이드가 요구하는 VitePress와 Node 버전을 확인해 local dev dependency로 설치합니다.
2. 새 디렉터리가 안전할 때만 공식 init wizard를 사용합니다. 기존 문서 디렉터리에서는 wizard가 만들 파일을 먼저 확인하고 충돌하는 파일을 덮어쓰지 않습니다.

   ```bash
   npx vitepress init
   ```

3. package script는 project root를 명시해 실행 위치가 달라도 같은 사이트를 가리키게 합니다. `docs`가 project root인 예시는 다음과 같습니다.

   ```json
   {
     "scripts": {
       "docs:dev": "vitepress dev docs",
       "docs:build": "vitepress build docs",
       "docs:preview": "vitepress preview docs"
     }
   }
   ```

4. init 예제 페이지는 실제 문서로 대체하고 nav·sidebar·검색에 남지 않았는지 확인합니다.
5. 기본 cache와 build output 또는 project가 설정한 `cacheDir`·`outDir`을 `.gitignore`에 반영합니다. 실제 config로 경로를 계산하고 `.vitepress/cache`·`.vitepress/dist`라고 단정하지 않습니다.

## config 판단 기준

`.vitepress/config.*`의 기존 module 형식과 분할 방식을 보존합니다. 새 config는 설치된 VitePress가 지원하는 `defineConfig`와 ESM 규칙을 따릅니다.

- **site metadata**: `lang`, `title`, `description`, head metadata를 프로젝트 사실과 문서 독자에 맞춥니다.
- **root와 산출물**: `srcDir`, `outDir`, `cacheDir`은 모두 project root와의 관계를 확인합니다. build 후 보고하는 publish directory도 실제 `outDir`을 사용합니다.
- **sidebar와 nav**: 수동 sidebar면 새 페이지를 명시적으로 추가합니다. path별 sidebar object와 `base`를 쓰면 중첩 item link의 최종 route를 계산해 확인합니다.
- **검색**: 외부 검색 서비스 요구가 없으면 기본 theme의 local search를 우선 검토합니다. `themeConfig.search.provider: 'local'`을 썼다면 한국어 제목·본문·code token의 검색 결과와 결과 선택 이동을 production preview에서 확인합니다.
- **URL**: 내부 Markdown 링크는 기존 관례를 우선하고, 새 사이트에서는 확장자를 생략한 상대 링크를 사용합니다. `cleanUrls`는 hosting server 지원과 함께 결정하며 preview가 성공했다는 이유만으로 production 지원을 가정하지 않습니다.
- **dead links**: 기본 build의 dead-link 실패를 품질 gate로 유지합니다. `ignoreDeadLinks: true`로 실제 오류를 일괄 숨기지 말고, 불가피한 외부·localhost 예외만 근거와 함께 좁게 설정합니다.
- **theme mode**: `appearance`를 프로젝트의 의도에 맞춥니다. `false`, `force-dark`, `force-auto`처럼 전환 UI가 없는 설정에는 테마 전환 QA를 강제하지 않습니다.
- **배포 경로**: hosted site의 `base`는 실제 공개 경로가 정해진 배포 작업에서만 설정합니다. root 배포와 sub-path 배포를 추정으로 구분하지 않습니다. 사용자가 IPFS·offline bundle처럼 relocatable build를 요청한 경우에만 공식 relative-base 절차와 제한을 별도로 확인합니다.

## theme 확장

단순 색상·글꼴·간격 조정은 기본 theme의 CSS variable과 custom CSS로 처리합니다. `.vitepress/theme/index.*`가 있으면 VitePress가 custom theme로 인식하므로, 문서 기능을 유지하려면 기본 theme를 import해 그대로 내보내거나 `extends`로 확장합니다.

```js
import DefaultTheme from 'vitepress/theme'
import './custom.css'

export default DefaultTheme
```

- 기존 theme entry, Vue component 등록, layout slot과 SSR-safe 코드를 보존합니다.
- default theme 전체를 복제하거나 내부 component alias에 의존하기 전에 config, CSS variable, layout slot으로 해결할 수 있는지 확인합니다.
- custom CSS는 home·doc layout, sidebar, outline, search modal, code block, table, callout을 함께 검수합니다.
- 한국어 본문에는 자연스러운 CJK 줄바꿈을 허용하되 inline code·명령·경로·식별자에는 임의 줄바꿈 규칙을 적용하지 않습니다.

## 기존 VitePress 사이트에 통합

1. package script가 전달하는 project root, `.vitepress/config.*`, `srcDir`, `outDir`, theme entry와 source Markdown을 조사합니다.
2. 기존 frontmatter와 home/doc/page layout 관례에 맞춰 문서를 추가합니다.
3. 수동 nav·sidebar와 관련 페이지에서 새 문서로 들어가는 경로를 연결합니다. 새 Markdown 파일이 build됐다는 사실만으로 발견 가능하다고 판단하지 않습니다.
4. `rewrites`, path별 sidebar, `cleanUrls`, locale 또는 sub-path `base`가 있으면 source path가 아니라 최종 route 기준으로 링크를 검증합니다.
5. custom Markdown plugin이나 Vue component를 사용한 페이지는 SSR build와 client navigation 뒤 렌더링을 모두 확인합니다.
6. [공통 계약](site-common.md)의 production build와 preview 수동 검수를 통과합니다.

## 다국어 문서

구현 시점의 [VitePress i18n 공식 문서](https://vitepress.dev/guide/i18n)와 기존 config를 따릅니다.

- 단일 한국어 사이트는 site `lang`과 theme UI 문자열이 한국어 독자에게 맞는지 확인합니다.
- 다국어 사이트는 locale directory, top-level `locales`와 locale별 `themeConfig`를 함께 설계합니다.
- 같은 페이지의 번역본은 locale 사이에서 동일한 상대 경로를 유지하고 nav·sidebar·local search 설정도 locale별로 검증합니다.
- locale root redirect는 VitePress가 자동으로 제공한다고 가정하지 않습니다. 필요하면 선택한 hosting의 공식 방식으로 별도 설계합니다.
- 기존 locale 체계를 요청 없이 바꾸지 않습니다.

## 다이어그램과 Markdown 확장

VitePress에는 Mermaid가 기본 내장된다고 가정하지 않습니다. 프로젝트가 이미 쓰는 compatible Markdown plugin이나 Vue component가 있으면 그 방식을 우선합니다. 새로 도입할 때는 실제 콘텐츠에 다이어그램이 필요한지 먼저 판단하고, 설치된 VitePress와 SSR build를 지원하는 현재 방식을 공식 자료에서 확인합니다.

- Markdown plugin 설정은 기존 `markdown` config를 덮어쓰지 않고 합칩니다.
- 다이어그램 source가 build 시 HTML로 변환되는지, client navigation 뒤 재처리가 필요한지 사용한 integration의 계약으로 판단합니다.
- 실패한 다이어그램을 code fence로 조용히 남기거나 client-only 오류를 숨긴 채 완료하지 않습니다.

## VitePress 검수 초점

[공통 production preview 검수](site-common.md#production-preview-수동-검수)에 더해 다음을 확인합니다.

- source Markdown 전체가 예상 route로 build됐고 orphan page나 sidebar의 잘못된 link가 없다.
- local search index가 production build에서 생성되고 한국어 검색어와 code token 검색이 실제 route 진입까지 동작한다.
- home CTA, nav, path별 sidebar, outline과 doc footer가 config의 최종 URL을 사용한다.
- `cleanUrls`, `base`, `rewrites`를 사용하면 직접 URL 진입과 새로고침에서도 문서와 asset이 열린다.
- `appearance` 설정에 맞는 theme UI만 존재하고, 제공되는 경우 전환 후 code block·table·search의 대비와 가독성이 유지된다.
