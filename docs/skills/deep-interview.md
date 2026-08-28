# deep-interview

## 개요

모호하거나 재작업 비용이 큰 요청을 한 번에 한 질문씩 정제해, 출처와 승인 이력이 남는 실행 가능한 Seed 스펙으로 만듭니다.

## 사용 시점

- 요구사항을 질문하면서 함께 정리하고 싶을 때
- 구현 전에 목표·제약·성공 기준을 명시적으로 잠가야 할 때
- 중요한 판단을 AI가 추측하지 않게 하고 싶을 때

명확한 저위험 수정이나 이미 승인된 계획의 실행에는 사용하지 않습니다.

## 사용 예

```text
$deep-interview 이 설치 도구의 요구사항을 인터뷰하면서 정리해줘
```

모드는 `quick`, `standard`, `deep`이며 각각 ambiguity 종료 기준과 질문 예산이 다릅니다. `--trace`는 brownfield runtime 계약을 더 깊게 조사하고, `--no-state`는 `.nunch/interviews/` 상태 기록을 생략합니다.

상태 기록과 검증 스크립트에는 Python 3.11 이상과 uv가 필요합니다.

## 핵심 흐름

1. 요청을 인터뷰가 필요한 문제인지 판정합니다.
2. component와 stable intent를 확인합니다.
3. 목표·제약·성공 기준·코드 맥락을 한 질문씩 정제합니다.
4. closure 검토 후 Seed를 생성합니다.
5. Restate와 실행 승인을 별도 gate로 받습니다.

## 안전 경계

- 명시적 실행 승인 전에는 제품 코드, commit, PR, 배포를 시작하지 않습니다.
- 자유 형식 판단은 구조화된 Refine 확인 전에는 확정하지 않습니다.
- 코드·연구 evidence는 사용자 판단을 대신하지 않습니다.

Source: [`plugins/nunch-skills/skills/deep-interview/SKILL.md`](../../plugins/nunch-skills/skills/deep-interview/SKILL.md)
