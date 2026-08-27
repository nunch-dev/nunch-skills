# Contributing

nunch-skills는 외부 기여와 내부 유지보수에 같은 검증 기준을 사용합니다.

## 시작하기

Node.js 22 이상과 pnpm이 필요합니다.

```bash
pnpm install
pnpm run check
```

변경 중 빠른 확인에는 `pnpm run test:fast`를 사용할 수 있습니다.

## 변경 원칙

- 한 변경에는 한 가지 목적만 담고, 동작이 바뀌면 관련 테스트와 문서를 함께 수정합니다.
- 스킬 동작의 기준은 `plugins/nunch-skills/skills/<skill>/SKILL.md`입니다. 생성된 TypeScript bundle은 직접 수정하지 말고 `pnpm run build`로 갱신합니다.
- 업스트림에서 동기화되는 파일을 수정하기 전에는 `.github/upstreams.json`의 관리 범위를 확인합니다.
- 원격 tag, GitHub Release, npm publish는 일반 기여 절차에 포함되지 않으며 별도 승인이 필요합니다.
- PR을 열기 전에 `pnpm run check`를 통과시키고 비밀 정보, 임시 파일, 디버그 산출물이 포함되지 않았는지 확인합니다.

자세한 실행 방법은 [Local development and QA](docs/local-development.md), 배포 절차는 [Release runbook](docs/release-runbook.md), 스킬 목록은 [스킬 문서](docs/skills/README.md)를 참고하세요.
