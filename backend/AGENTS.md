# 자리하나 AI 작업 지침

## 범위

현재 디렉터리는 Spring Boot 백엔드 애플리케이션이다. Gradle Wrapper와 Docker
Compose 명령은 이 디렉터리에서 실행한다.

## 작업 시작

모든 백엔드 작업은 다음 순서로 시작한다.

1. 현재 브랜치와 working tree 상태를 확인한다.
2. `docs/team-convention.md` 전체를 읽고 아래 라우팅 표에서 필요한 문서를 결정한다.
3. 선택한 컨벤션과 설계 맥락을 읽은 뒤 관련 코드·테스트·설정을 확인한다.
4. 프로덕션 코드 변경에는 항상 `docs/conventions/code.md`와
   `docs/conventions/testing.md`를 포함한다.
5. 작업 중 변경된 인덱스나 로딩한 문서는 다시 읽는다.

## 문서 라우팅

| 작업 범위 | 추가로 읽을 문서 |
| --- | --- |
| API, Controller, 요청·응답, Swagger | `context/api/common-contract.md`, `context/api/endpoints/README.md`, 관련 `context/api/endpoints/` 상세 문서, `context/domain/model/README.md`, 관련 `context/domain/model/` 상세 문서, `conventions/api.md` |
| 기능·유스케이스 변경 | 관련 `context/domain/model/` 문서, `context/domain/invariants.md`, `context/domain/business-policies.md`, API 변경 시 관련 `context/api/` 문서와 해당 컨벤션 |
| 도메인 전체 관계·용어·생명주기 | `context/domain/model/README.md` |
| 회원 모델·회원 정책 | `context/domain/model/member.md` |
| 그룹 모델·그룹 상태·유형 | `context/domain/model/group.md` |
| 모집 모델·모집 규칙 | `context/domain/model/grouprecruitment.md` |
| 일정 모델·일정 규칙 | `context/domain/model/schedule.md` |
| 신청 모델·신청 규칙 | `context/domain/model/registration.md` |
| 그룹 소속·모임장 위임 | `context/domain/model/groupmember.md` |
| 도메인 불변식·비즈니스 정책 | `context/domain/invariants.md`, `context/domain/business-policies.md` |
| JPA, Repository, 쿼리, DB·삭제 | 관련 `context/domain/` 상세 문서, `conventions/persistence.md` |
| 패키지 구조, 계층, 예외 처리 | `conventions/architecture.md` |
| 인증, 인가, 비밀값, 개인정보 | `conventions/security.md` |
| 날짜, 시간, 현재 시각 | `conventions/time.md` |
| ADR, 기존 기술 결정, 프로필, 빌드, 실행 환경 | 관련 `docs/adr/`, `conventions/project-operations.md` |
| 컨벤션 자체 변경 | 변경 대상 모듈, `conventions/project-operations.md` |

여러 범위에 해당하면 문서의 합집합을 읽고, 범위가 불명확하거나 복합적이면 관련
설계 맥락과 컨벤션 전체를 읽는다. `docs/proposals/convention-review.md`는 사용자가
재검토를 명시할 때만 읽는 비구속 보류 문서다.

## 적용과 검증

- 현재 사용자의 요청, 루트 `AGENTS.md`, 이 파일, 구속력 있는 컨벤션 순서로 판단한다.
- 설계 문서·컨벤션·코드·테스트·Swagger/OpenAPI가 충돌하면 차이를 보고하고 임의로
  관련 없는 코드를 정규화하지 않는다.
- 기존 변경사항을 보존하고 요청 범위를 벗어난 이동·리팩터링·의존성 변경을 하지 않는다.
- 실행 명령, 버전, 환경 변수와 endpoint는 저장소 파일에서 확인한 뒤 사용한다.
- 검증은 관련 테스트와 `./gradlew` 명령을 우선 사용하고, 검증 공백은 성공으로
  가정하지 않는다.
