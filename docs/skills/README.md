# 스킬 문서

이 디렉터리는 nunch-skills marketplace가 제공하는 사용자-facing 스킬을 설명합니다. 실제 실행 규칙의 source of truth는 각 plugin의 `SKILL.md`이며, 이 문서는 설치 전 탐색과 일반 사용을 위한 가이드입니다.

| 스킬 | 용도 | 문서 |
| --- | --- | --- |
| `deep-interview` | 모호하고 재작업 비용이 큰 요청을 승인된 스펙으로 정리 | [보기](deep-interview.md) |
| `git-tools` | 안전한 Git 조사·커밋·통합·원격·복구 | [보기](git-tools.md) |
| `humanize-korean` | 한국어 AI 문체 탐지와 의미 보존 윤문 | [보기](humanize-korean.md) |
| `humanize` | 윤문 파이프라인의 간단한 진입 명령 | [보기](humanize.md) |
| `humanize-redo` | 최근 윤문 결과의 부분·강도별 재실행 | [보기](humanize-redo.md) |
| `i-have-adhd` | 행동 우선의 ADHD 친화적 응답 모드 | [보기](i-have-adhd.md) |
| `kaneo-skills` | 자연어 작업을 Kaneo Todo로 등록 | [보기](kaneo-skills.md) |
| `nch-installer` | 설치·업데이트·제거·doctor와 의존성 관리 | [보기](nch-installer.md) |

## 공통 설치

```bash
npx @nunch-dev/skills install
```

설치 화면에서 플랫폼과 대상 plugin을 선택합니다. installer는 Codex 설치 시 자동 포함됩니다. 상태 점검은 `npx @nunch-dev/skills doctor`를 사용합니다.
