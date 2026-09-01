# nunch-skills

Codex와 Claude Code에서 함께 사용할 수 있는 개인용 스킬 모음입니다.

## Install

Node.js 22 이상이 필요합니다.

```bash
npx @nunch-dev/skills@latest install
```

## Update

설치 대상을 선택해 최신 릴리스로 업데이트합니다.

```bash
npx @nunch-dev/skills@latest update
```

## Skills

| 스킬 | 역할 |
| --- | --- |
| `deep-interview` | 모호한 요청을 질문으로 구체화하고 실행 가능한 스펙으로 정리합니다. |
| `docs-fairy` | 프로젝트 문서를 만들고 코드와 문서의 내용을 맞춥니다. |
| `docs-fairy-site` | 문서 사이트를 구축·검증하고, 명시적으로 요청된 경우에만 배포합니다. |
| `git-tools` | Git 조사, 커밋, 브랜치 통합, 원격 작업과 복구를 안전하게 수행합니다. |
| `humanize-korean` | AI가 쓴 한국어의 의미를 유지하면서 자연스럽게 윤문합니다. |
| `humanize` | 한국어 윤문 파이프라인을 간단히 실행합니다. |
| `humanize-redo` | 최근 윤문 결과를 원하는 범위와 강도로 다시 다듬습니다. |
| `i-have-adhd` | 답변을 행동 우선의 ADHD 친화적 형식으로 바꿉니다. |
| `kaneo-skills` | 자연어 작업을 정리해 Kaneo Todo로 등록합니다. |
| `ready-to-fight` | 주장·계획·설계의 맹점을 상호 반론과 근거 검증으로 찾습니다. |

스킬별 사용법은 [스킬 문서](docs/skills/README.md)에서 확인할 수 있습니다. 개발에 참여하려면 [CONTRIBUTING.md](CONTRIBUTING.md), 로컬 실행은 [Local development and QA](docs/local-development.md), 배포는 [Release runbook](docs/release-runbook.md)을 참고하세요.

## License

[MIT](LICENSE)
