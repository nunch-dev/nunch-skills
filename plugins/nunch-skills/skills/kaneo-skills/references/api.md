# Kaneo REST API 연결

Kaneo MCP를 사용할 수 없고 현재 환경에 승인된 REST API credential이 있을 때만 이 지침을 읽습니다. API의 canonical 계약은 실행 시점의 instance OpenAPI schema와 [Kaneo API reference](https://kaneo.app/docs/api-reference/introduction)입니다.

## 연결과 인증

- Base URL은 대상 instance의 `/api`입니다. Cloud 주소를 self-hosted instance에 재사용하지 않습니다.
- API key 또는 device authorization으로 받은 token을 `Authorization: Bearer <token>` 형식으로 보냅니다.
- Base URL과 credential은 사용자가 이미 승인한 secret·환경 설정에서 가져옵니다. 환경 변수 이름을 임의로 정하거나 raw credential을 출력·로그·파일·대화에 기록해서는 안 됩니다.
- 연결 정보가 없으면 MCP 연결 또는 안전한 API credential 설정이 필요하다고 안내하고 중단합니다.

## 실행 계약

1. Mutation 전에 인증과 접근 가능한 organization/workspace를 조회합니다.
2. Project, column, task, member, task relation의 request·response shape는 대상 instance의 OpenAPI schema를 확인합니다. 기억이나 예전 예시로 payload를 추측하지 않습니다.
3. 모든 요청은 status code와 response body를 함께 확인합니다. 성공 body에서 필요한 `id`·`number`를 확인하지 못하면 생성 성공으로 보고하지 않습니다.
4. 실패한 mutation은 transport를 바꿔 자동 재시도하지 않습니다. `SKILL.md`의 partial success 계약에 따라 성공 자산과 실패 지점을 보고합니다.

API key와 device token의 발급·사용 방법은 [Kaneo authentication guide](https://kaneo.app/docs/api-reference/authentication)를 따릅니다.
