# humanize

> 출처: [epoko77-ai/im-not-ai](https://github.com/epoko77-ai/im-not-ai), epoko77-ai, MIT License. 이 명령은 원본 프로젝트를 `humanize-korean` 플러그인으로 동기화해 제공합니다.

## 개요

`humanize-korean` 파이프라인을 간단히 호출하는 사용자 진입 명령입니다. 기본은 빠른 경로를 사용하고 `--strict`로 정밀 경로를 강제할 수 있습니다.

## 사용 예

```text
/humanize 이 문장을 사람이 쓴 것처럼 자연스럽게 다듬어줘
/humanize 초안.md --strict
```

텍스트나 `.txt`·`.md` 파일을 입력으로 받습니다. 입력이 없으면 윤문할 텍스트를 요청하고 종료합니다.

## 옵션

- `장르: 칼럼|리포트|블로그|공적`
- `강도: 보수|기본|적극`
- `최소심각도: S1|S2|S3`
- `--strict`: 진단→겨냥 윤문→finalize 경로 강제

결과에는 윤문본, 변경률·등급, 카테고리별 before/after와 주요 변경이 포함됩니다. 등급이 낮으면 `humanize-redo`로 2차 윤문할 수 있습니다.

Source: [`plugins/humanize-korean/skills/humanize/SKILL.md`](../../plugins/humanize-korean/skills/humanize/SKILL.md)

License: [`plugins/humanize-korean/LICENSE`](../../plugins/humanize-korean/LICENSE)
