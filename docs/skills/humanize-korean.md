# humanize-korean

> 출처: [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai), epoko77-ai, MIT License. 현재 동기화 기준은 [`c4d03d4`](https://github.com/epoko77-ai/im-not-ai/commit/c4d03d4859acda143f0b04b4bbdb56c5e6a94db1)입니다.

## 개요

AI가 작성한 한국어에서 번역투, 기계적 병렬, 관용구, 피동태, 접속사·이모지·불릿 과다와 균일한 리듬을 탐지하고 의미를 보존한 채 자연스럽게 윤문하는 오케스트레이터입니다.

## 사용 시점

- “AI 티 없애줘”, “사람이 쓴 것처럼 윤문해줘” 같은 요청
- 의미와 사실은 유지하면서 문체·리듬만 다듬을 때
- 최근 결과의 특정 문단·카테고리·강도를 다시 조정할 때

단순 맞춤법 교정, 번역, 내용 추가·삭제가 필요한 집필은 별도 작업입니다.

## 실행 경로

| 경로 | 용도 | LLM 호출 |
| --- | --- | ---: |
| `light` | 이미 잘 쓴 글을 보수적으로 정리 | 기본 1회 |
| `standard` | 일반적인 AI 초안 | 기본 2회 |
| `heavy` | 중증 문체·정밀 검증·초장문 | 기본 3회 이상 |

사용자 지정이 없으면 진단 shim의 `route_hint`가 경로를 정합니다. `--strict` 또는 “정밀하게”는 heavy, “가볍게”는 light를 선택합니다.

## 의미 보존

핵심 명사와 개념어를 의미 anchor로 잡고, 조사·어미·문장 구조만 바꿉니다. 내용 anchor가 사라지면 자연성보다 원문 의미 복원을 우선합니다.

## 산출물

각 실행은 cwd의 `_workspace/<run_id>/`에 입력, 진단, rewrite, 검증과 최종 결과를 남깁니다. Python 3.11 이상이 필요합니다.

Source: [`plugins/nunch-skills/skills/humanize-korean/SKILL.md`](../../plugins/nunch-skills/skills/humanize-korean/SKILL.md)

License: [`plugins/nunch-skills/licenses/humanize-korean-LICENSE`](../../plugins/nunch-skills/licenses/humanize-korean-LICENSE)
