# Nunch Skills 문서 사이트 디자인 시스템

## 0. Research Log

- Embedded refs: Starlight 기본 컴포넌트 체계, `minimalist-skill`, Notion design system을 비교해 읽기 중심의 warm minimalism을 선택했다.
- Existing component system: 탐색, 검색, 콘텐츠, 카드, 코드 블록은 Starlight primitive를 사용하고 새 컴포넌트 계층은 만들지 않는다.
- Lazyweb·Imagen: Starlight가 이미 구체적인 문서 UI 계약을 제공하며 별도 브랜드 랜딩이나 reference-fidelity mockup이 범위에 없어 사용하지 않았다.

## 1. Atmosphere & Identity

차분한 작업 노트처럼 읽히는 기술 문서다. 따뜻한 종이색 배경, 숯빛 본문, 얇은 구분선이 구조를 만들며 파란색은 링크와 현재 위치처럼 행동을 나타낼 때만 쓴다. 기억에 남는 요소는 장식이 아니라 “어떤 스킬을 골라야 하는지”를 즉시 보여주는 정보 밀도다.

## 2. Color

| Role | Token | Light | Dark | Usage |
| --- | --- | --- | --- | --- |
| Canvas | `--nch-surface-primary` | `#fbfaf8` | `#1c1b1a` | 페이지 배경 |
| Raised | `--nch-surface-raised` | `#ffffff` | `#242321` | 카드, 검색, 코드 외곽 |
| Subtle | `--nch-surface-subtle` | `#f4f1ec` | `#2d2b28` | 사이드바, inline code |
| Text | `--nch-text-primary` | `#262421` | `#f3f0ea` | 제목, 본문 |
| Muted | `--nch-text-secondary` | `#68635c` | `#b8b1a7` | 설명, 보조 정보 |
| Border | `--nch-border` | `#e4dfd7` | `#3e3b37` | 구분선과 카드 외곽 |
| Accent | `--nch-accent` | `#1769aa` | `#78b7e8` | 링크, 현재 위치, focus |
| Accent hover | `--nch-accent-hover` | `#0f4f83` | `#9bcdf2` | hover, active |

색상은 위 역할 외 용도로 확장하지 않는다. 큰 면적에 accent를 칠하지 않고, surface의 미세한 명도 차이로 깊이를 만든다.

## 3. Typography

| Level | Size | Weight | Line height | Tracking | Usage |
| --- | --- | --- | --- | --- | --- |
| Display | `3rem` | 700 | 1.1 | `-0.025em` | splash title |
| H1 | `2.25rem` | 700 | 1.2 | `-0.02em` | 문서 제목 |
| H2 | `1.65rem` | 650 | 1.3 | `-0.015em` | 주요 섹션 |
| H3 | `1.25rem` | 650 | 1.4 | `-0.01em` | 하위 섹션, 카드 제목 |
| Body | `1rem` | 400 | 1.7 | `0` | 본문 |
| Body small | `0.875rem` | 400 | 1.55 | `0` | 보조 정보 |
| Code | `0.9rem` | 450 | 1.65 | `0` | 코드와 식별자 |

- UI와 본문: `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Noto Sans KR`, sans-serif.
- 코드: `SFMono-Regular`, `Consolas`, `Liberation Mono`, monospace.
- 외부 웹폰트를 내려받지 않아 첫 렌더와 한국어 fallback을 안정적으로 유지한다.

## 4. Spacing & Layout

기준 단위는 4px다.

| Token | Value | Usage |
| --- | --- | --- |
| `--nch-space-1` | `0.25rem` | inline 간격 |
| `--nch-space-2` | `0.5rem` | 조밀한 항목 |
| `--nch-space-3` | `0.75rem` | 작은 padding |
| `--nch-space-4` | `1rem` | 기본 padding |
| `--nch-space-6` | `1.5rem` | 카드와 섹션 내부 |
| `--nch-space-8` | `2rem` | 그룹 간격 |
| `--nch-space-12` | `3rem` | 큰 섹션 간격 |

- 본문 최대 너비는 `52rem`으로 제한한다.
- Starlight의 header/sidebar/content grid를 유지한다.
- 데스크톱 기준으로 탐색과 본문을 동시에 보여준다. 모바일·태블릿 전용 재설계는 프로젝트 규칙에 따라 범위에서 제외한다.

## 5. Components

### Global navigation

- Structure: Starlight header, search, theme control, GitHub link.
- States: default, hover, active, focus는 Starlight 동작을 유지하고 색상만 토큰으로 매핑한다.
- Accessibility: 키보드 탐색과 visible focus를 보존한다. 별도 속성은 추가하지 않는다.
- Motion: 색상과 opacity만 짧게 전환한다.

### Sidebar item

- Structure: Starlight sidebar group과 link.
- Variants: group label, inactive link, current link.
- States: current link는 accent와 surface 차이로 표시한다.
- Layout: Starlight sidebar scroll owner를 유지한다.

### Splash action and card

- Structure: Starlight hero action, `CardGrid`, `Card`.
- Variants: primary action, minimal action, informational card.
- States: hover와 focus는 색상·border 변화만 사용한다.
- Depth: raised surface와 whisper border. 무거운 shadow는 쓰지 않는다.

### Prose, code, and diagram

- Structure: Starlight Markdown content, fenced code block, Mermaid output.
- States: link와 copy control은 기본 상호작용을 유지한다.
- Layout: 본문 안에서 overflow를 일으키지 않으며 긴 코드만 자체 가로 스크롤한다.

## 6. Motion & Interaction

- Micro transition: 120ms ease-out, hover와 focus 색상 변화.
- Standard transition: 200ms ease-in-out, Starlight navigation 상태 변화.
- 장식 목적의 entrance animation과 scroll animation은 사용하지 않는다.
- `prefers-reduced-motion`에서는 custom transition을 제거한다.

## 7. Depth & Surface

전략은 `tonal-shift + whisper border`다. 배경·사이드바·카드의 명도 차이와 1px border만 사용한다. 검색 overlay처럼 Starlight가 기능적으로 elevation을 요구하는 경우를 제외하고 custom box shadow를 추가하지 않는다.

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- WCAG 2.2 AA 대비를 목표로 한다.
- 모든 상호작용은 키보드로 도달 가능하고 visible focus가 있어야 한다.
- 한국어 제목과 본문은 글자 잘림, 외톨이 한 글자 줄바꿈, 잘못된 glyph fallback이 없어야 한다.
- semantic structure와 Starlight 기본 접근성 동작을 훼손하지 않는다.

### Accepted Debt

없음.
