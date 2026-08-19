# 자리하나 팀 개발 컨벤션

## 목적과 적용 범위

자리하나는 우아한테크코스 내부에 흩어진 동아리와 스터디 정보를 한곳에서 탐색할 수
있도록 만드는 서비스다.

이 문서와 여기서 참조하는 9개 모듈은 함께 하나의 구속력 있는 자리하나 팀 개발
컨벤션이다. 이 문서는 문서의 권한과 선택 로딩을 정하는 인덱스이고, 각 모듈은 맡은
분야의 확정 규칙을 소유한다.

## 구속력 있는 모듈

| 모듈 | 책임 |
| --- | --- |
| [workflow.md](conventions/workflow.md) | 브랜치, PR, 병합, 커밋 메시지 |
| [api.md](conventions/api.md) | API 계약과 Swagger/OpenAPI 문서화 |
| [architecture.md](conventions/architecture.md) | 패키지 구조, 계층 경계, 예외 처리 |
| [testing.md](conventions/testing.md) | TDD와 테스트 구성·작성 |
| [code.md](conventions/code.md) | 도메인, 엔티티, DTO, 이름, 스타일 |
| [persistence.md](conventions/persistence.md) | JPA, 트랜잭션, 조회, DB와 삭제 |
| [time.md](conventions/time.md) | 날짜, 시간, 현재 시각 |
| [security.md](conventions/security.md) | 인증·인가, 비밀값, 개인정보 |
| [project-operations.md](conventions/project-operations.md) | ADR, 프로필, 빌드, 실행 환경, 저장소 명령 |

`convention-review.md`는 사용자가 명시적으로 재검토를 요청할 때만 읽는 비구속
보류 문서이며, 이 컨벤션의 구속력 있는 우선순위나 선택 로딩 대상에 포함하지 않는다.

## 선택 로딩

작업을 시작하기 전에 이 인덱스 전체를 읽고, 아래 표에서 해당하는 모듈을 모두
읽는다. 여러 행에 해당하면 모듈의 합집합을 읽는다. 작업 범위가 불명확하거나
복합적이거나 표에 없으면 9개 모듈 전체를 읽는다. 모든 프로덕션 코드 변경에는
항상 [code.md](conventions/code.md)와 [testing.md](conventions/testing.md)를
포함한다.

| 작업 범위 | 필수 모듈 |
| --- | --- |
| 브랜치, PR, 병합, 커밋 메시지 | [workflow.md](conventions/workflow.md) |
| 모든 프로덕션 코드 변경 | [code.md](conventions/code.md), [testing.md](conventions/testing.md) |
| API, Controller, 요청·응답, Swagger | [api.md](conventions/api.md), [code.md](conventions/code.md), [testing.md](conventions/testing.md) |
| 패키지 구조, 계층 경계, 예외 처리 | [architecture.md](conventions/architecture.md), [code.md](conventions/code.md), [testing.md](conventions/testing.md) |
| 도메인, 엔티티, Service, DTO, 이름, 스타일 | [code.md](conventions/code.md), [testing.md](conventions/testing.md) |
| JPA, Repository, 쿼리, 트랜잭션, DB·삭제 | [persistence.md](conventions/persistence.md), [code.md](conventions/code.md), [testing.md](conventions/testing.md) |
| 날짜, 시간, 현재 시각 | [time.md](conventions/time.md), [code.md](conventions/code.md), [testing.md](conventions/testing.md) |
| 인증, 인가, 비밀값, 개인정보 | [security.md](conventions/security.md), [code.md](conventions/code.md), [testing.md](conventions/testing.md) |
| ADR, 프로필, 빌드, 실행 환경, 저장소 명령 | [project-operations.md](conventions/project-operations.md) |
| 컨벤션 자체 변경 | 변경 대상 모듈, [project-operations.md](conventions/project-operations.md) |

## 적용과 변경

작업 중 이 인덱스 또는 로딩한 모듈이 변경되면 해당 문서를 다시 읽는다. 기억이나
추측으로 규칙을 적용하지 않는다.

확정 규칙은 소유 모듈 한 곳에만 둔다. 문서 간 충돌은 조용히 해석하지 않고
보고한다. 파일 소유권이나 라우팅이 바뀔 때만 이 인덱스를 갱신한다.
