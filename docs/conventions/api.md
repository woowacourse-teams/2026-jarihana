# API 문서화 컨벤션

> 이 문서는 구속력 있는 팀 컨벤션 모듈이다.
> 인덱스: [team-convention.md](../team-convention.md)

## 기준 문서

Swagger/OpenAPI를 API 계약의 기준 문서로 사용한다.

- Swagger/OpenAPI: 엔드포인트, 요청·응답 스키마, 상태 코드, 오류 코드
- Notion: 정책, 사용자 흐름, 기획 배경, 논의 과정

API가 변경되면 Swagger/OpenAPI 문서와 RestAssured 인수 테스트를 같은 PR에서
수정한다. 서로 내용이 다르면 실행 가능한 API와 인수 테스트를 기준으로 불일치를
해소하고 문서를 즉시 갱신한다.
