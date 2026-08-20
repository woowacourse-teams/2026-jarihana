# 자리하나 설계 맥락

이 디렉터리는 Notion의 `자리하나? 팀 프로젝트` 아래에서 현재 채택된 도메인 설계와 API 설계를 AI가 저장소 안에서 읽을 수 있도록 정리한 스냅샷이다.

## 문서 성격

- Notion의 설계 의도와 비즈니스 규칙을 전달한다.
- 코드, 테스트 또는 실행 가능한 Swagger/OpenAPI의 현재 상태를 증명하지 않는다.
- 저장소 컨벤션을 대체하지 않는다.
- 문서 간 충돌을 발견하면 한쪽을 조용히 우선하지 않고 사용자에게 보고한다.

## 읽는 순서

| 작업 범위 | 필수 맥락 |
| --- | --- |
| 모든 도메인·API 작업 | 이 문서 |
| 도메인, 엔티티, 서비스, 영속성 | [도메인 모델](domain/model.md), [도메인 불변식](domain/invariants.md), [비즈니스 정책](domain/business-policies.md) |
| API, Controller, 요청·응답, Swagger | 도메인 문서 3개, [API 공통 설계](api/conventions.md), [API 엔드포인트 설계](api/endpoints.md) |
| 디자인, 빌드, 브랜치 등 무관한 작업 | 관련 설계 맥락이 필요할 때만 선택적으로 읽는다. |

## 책임 경계

- `docs/context/domain/`: 제품이 의도한 도메인 모델, 불변식, 비즈니스 정책
- `docs/context/api/`: Notion에서 정리한 HTTP 설계 의도
- `docs/conventions/`: 구현·테스트·문서화 방법에 관한 구속력 있는 팀 규칙
- 코드와 테스트: 현재 구현 증거
- Swagger/OpenAPI와 RestAssured 인수 테스트: 실행 가능한 API 계약

현재 컨벤션의 soft delete 원칙과 이 설계 맥락의 일부 Hard Delete 정책처럼 서로 다른 문서가 충돌할 수 있다. 이런 경우 구현 전에 차이를 보고하고 팀 결정을 확인한다.

## 원본과 동기화

- 프로젝트 루트: [자리하나? 팀 프로젝트](https://app.notion.com/p/88a0978a6e6c82c69ba301d292e04b33)
- 도메인 원본: [도메인 모델 · 불변식 · 비즈니스 정책](https://app.notion.com/p/3ba0978a6e6c81f89deed43d644c762d)
- API 원본: [자리하나 API 명세](https://app.notion.com/p/3bb0978a6e6c81aab624c61787d8be35)
- 엔드포인트 원본: [엔드포인트 명세](https://app.notion.com/p/0a438efca7fd4228bcbe8e0dfb10f75b)
- 마지막 동기화: 2026-08-15

### 원본과 어긋난 항목

팀 회의나 ADR로 확정된 결정이 Notion 원본보다 앞서는 경우가 있다. 이 스냅샷은 그런 항목을 원본
그대로 두지 않고 결정에 맞춰 고치되, 어긋난 사실을 여기에 남긴다. 다시 동기화할 때 되살아나지
않도록 확인한다.

| 항목 | 원본 | 확정된 결정 |
| --- | --- | --- |
| `GET /api/oauth/github/authorization` | 엔드포인트로 존재 | 만들지 않는다. [ADR 0003](../adr/0003-oauth-authorization-ownership.md) |
| 콜백의 `state` 보관 | 서버 세션 | 프론트엔드가 만든 쿠키와 대조. [ADR 0003](../adr/0003-oauth-authorization-ownership.md) |
| 콜백의 토큰 전달 방식 | 결정 필요 | Access Token과 Refresh Token 모두 쿠키. [ADR 0002](../adr/0002-access-token-cookie.md) |

Notion의 아카이브, 기술 구현 결정, 인프라 설정, 역할 분담 문서는 이 스냅샷에 포함하지 않는다.
