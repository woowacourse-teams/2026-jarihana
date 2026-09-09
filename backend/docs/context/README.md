# 자리하나 설계 맥락

이 디렉터리는 저장소에서 관리하는 최신 도메인 설계와 API 설계 맥락을 사람이 찾고
검토할 수 있도록 정리한 문서 모음이다.

## 문서 성격

- 저장소에 정리된 설계 의도와 비즈니스 규칙을 전달한다.
- 코드, 테스트 또는 실행 가능한 Swagger/OpenAPI의 현재 상태를 증명하지 않는다.
- 저장소 컨벤션을 대체하지 않는다.
- 문서 간 충돌을 발견하면 한쪽을 조용히 우선하지 않고 사용자에게 보고한다.

## 문서 구성

| 영역 | 문서 | 내용 |
| --- | --- | --- |
| 도메인 | [도메인 모델](domain/model/README.md), [Member](domain/model/member.md), [Group](domain/model/group.md), [모집](domain/model/grouprecruitment.md), [일정](domain/model/schedule.md), [신청](domain/model/registration.md), [소속](domain/model/groupmember.md), [도메인 불변식](domain/invariants.md), [비즈니스 정책](domain/business-policies.md) | 전체 개요, 도메인별 모델, 불변식, 정책 |
| API | [API 공통 설계](api/common-contract.md), [API 엔드포인트 설계](api/endpoints.md) | 공통 계약과 엔드포인트 |

## 책임 경계

- `context/domain/`: 제품이 의도한 도메인 모델, 불변식, 비즈니스 정책
- `context/api/`: 저장소에서 정리한 HTTP 설계 의도
- `../conventions/`: 구현·테스트·문서화 방법에 관한 구속력 있는 팀 규칙
- 코드와 테스트: 현재 구현 증거
- Swagger/OpenAPI와 RestAssured 인수 테스트: 실행 가능한 API 계약

삭제 정책은 이 설계 맥락에 기록된 도메인별 최종 결정을 우선 적용한다. 따라서 그룹 삭제,
그룹 구성원 이탈, 대기 신청 철회와 반복 일정 제거는 각 도메인 문서에 따라 Hard
Delete로 처리한다.

## 최신성 및 결정 반영

이 디렉터리의 문서는 현재 팀이 사용하는 최신 설계 기준이다. ADR이나 팀의 확정된
결정이 기존 설계 내용과 달라지면 해당 결정에 맞게 이 문서와 관련 인덱스를 함께
갱신한다.

### 결정과 구현의 차이

아래 표는 설계 맥락과 현재 확정된 결정 사이의 차이를 기록한다.

| 항목 | 기존 설계 내용 | 확정된 결정 |
| --- | --- | --- |
| `GET /api/oauth/github/authorization` | 엔드포인트로 존재 | 만들지 않는다. [ADR 0003](../adr/0003-oauth-authorization-ownership.md) |
| 콜백의 `state` 보관 | 서버 세션 | 프론트엔드가 만든 쿠키와 대조. [ADR 0003](../adr/0003-oauth-authorization-ownership.md) |
| 콜백의 토큰 전달 방식 | 결정 필요 | Access Token과 Refresh Token 모두 쿠키. [ADR 0002](../adr/0002-access-token-cookie.md) |
| 반복 일정의 `startTime`, `endTime` | 시각 필수 | 두 시각을 함께 비우면 요일만 고정한 시간 유동적 일정. 한쪽만 비우면 거절 |

이 디렉터리에는 도메인·API 설계 맥락을 기록한다. 기술 구현 결정은 ADR 문서에,
인프라 설정과 역할 분담은 각 담당 문서에 기록한다.
