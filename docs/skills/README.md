# 스킬 문서

이 디렉터리는 `nunch-skills` 플러그인 하나에 포함된 사용자-facing 스킬을 설명합니다. 실제 실행 규칙의 source of truth는 `plugins/nunch-skills/skills/<skill>/SKILL.md`이며, 이 문서는 설치 전 탐색과 일반 사용을 위한 가이드입니다.

| 스킬 | 언제 쓰나 | 사용자에게 남는 결과 | 문서 |
| --- | --- | --- | --- |
| `deep-interview` | 모호하거나 재작업 비용이 큰 요청의 요구사항을 확정할 때 | 출처와 승인 이력이 있는 실행 가능 스펙 | [보기](deep-interview.md) |
| `docs-fairy` | 프로젝트 문서를 만들거나 코드·이력과 맞출 때 | 근거가 확인된 문서 또는 승인 가능한 진단 | [보기](docs-fairy.md) |
| `docs-fairy-site` | 문서 사이트를 구축·통합·검증하거나 명시적으로 배포할 때 | 검증된 로컬 사이트 또는 승인된 배포 결과 | [보기](docs-fairy-site.md) |
| `git-tools` | Git 상태·이력을 조사하거나 안전하게 변경할 때 | 요청한 최소 Git 상태 전이와 검증 결과 | [보기](git-tools.md) |
| `humanize-korean` | AI가 쓴 한국어의 의미를 보존하며 문체를 다듬을 때 | 게이트를 통과한 윤문본과 변경 지표 | [보기](humanize-korean.md) |
| `humanize` | 한국어 윤문을 짧은 명령으로 시작할 때 | `humanize-korean` 파이프라인의 새 실행 결과 | [보기](humanize.md) |
| `humanize-redo` | 최근 윤문 결과의 범위나 강도를 다시 조정할 때 | 후속 윤문본을 목표로 하나 현재 본체와 동기화 필요 | [보기](humanize-redo.md) |
| `i-have-adhd` | 답변을 바로 행동할 수 있는 형식으로 바꿀 때 | 세션 동안 유지되는 행동 우선 응답 | [보기](i-have-adhd.md) |
| `kaneo-skills` | 자연어 작업을 실제 Kaneo Todo로 등록할 때 | 중복과 대상을 확인한 한국어 이슈 | [보기](kaneo-skills.md) |
| `ready-to-fight` | 업무 주장·계획·설계의 맹점을 상호 반론으로 검증할 때 | 근거·반대 근거·입장 변화·미결이 남는 대화 종합 | [보기](ready-to-fight.md) |

이번 first-party 스킬 개선의 assertion 분류와 로컬·라이브 시나리오 결과는 [2026-08-28 품질 검토 기록](../skill-quality-review-20260828.md)에 정리했습니다.

## 공통 설치

Node.js 22 이상이 필요합니다.

```bash
npx @nunch-dev/skills install
```

설치 화면에서 플랫폼을 선택하면 전체 스킬 번들이 함께 설치됩니다. 상태 점검은 `npx @nunch-dev/skills doctor`를 사용합니다. `doctor`는 스킬별로 필요한 Git, Python 3.11 이상, uv와 Kaneo MCP 상태도 알려줍니다.

설치 명령을 다시 실행하면 관리 중인 이전 버전은 업데이트되고, 같은 버전은 검증만 거칩니다. 더 높은 버전이나 lifecycle 기록이 없는 설치는 자동으로 덮어쓰지 않습니다. Codex는 SessionStart 자동 업데이트를 지원하며, Claude Code는 `npx @nunch-dev/skills update --platform=claude`로 직접 업데이트합니다.
