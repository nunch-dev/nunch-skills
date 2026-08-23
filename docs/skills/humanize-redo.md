# humanize-redo

## 개요

가장 최근 `humanize-korean` 결과를 기존 run ID에서 다시 다듬는 후속 명령입니다. 전체 파이프라인을 처음부터 반복하지 않고 잔존 finding과 지정 범위만 처리합니다.

## 사용 예

```text
/humanize-redo 번역투만 다시
/humanize-redo 두 번째 문단만, 강도 낮춰
/humanize-redo 이 변경 되돌려줘
```

## 지원 범위

- 특정 탐지 카테고리만 재윤문
- 지정 문단만 재윤문
- 보수·적극 강도 조정
- 특정 edit 롤백
- 지시가 없으면 잔존 finding 전체를 round 2로 처리

이전 결과는 `final_prev.md`로 보존하고 새 결과는 `03_rewrite_v2.md`처럼 version을 분리합니다. 최대 round 3을 넘기면 사람 검토를 권고합니다.

Source: [`plugins/humanize-korean/skills/humanize-redo/SKILL.md`](../../plugins/humanize-korean/skills/humanize-redo/SKILL.md)
