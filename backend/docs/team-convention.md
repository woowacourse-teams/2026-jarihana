# 자리하나 팀 개발 컨벤션

## 목적과 적용 범위

자리하나는 우아한테크코스 내부에 흩어진 동아리와 스터디 정보를 한곳에서 탐색할 수
있도록 만드는 서비스다.

이 문서와 여기서 참조하는 8개 모듈은 함께 하나의 구속력 있는 자리하나 팀 개발
컨벤션이다. 이 문서는 모듈의 권한과 소유권을 정하는 인덱스이고, 각 모듈은 맡은
분야의 확정 규칙을 소유한다.

## 구속력 있는 모듈

| 모듈 | 책임 |
| --- | --- |
| [api.md](conventions/api.md) | API 계약과 Swagger/OpenAPI 문서화 |
| [architecture.md](conventions/architecture.md) | 패키지 구조, 계층 경계, 예외 처리 |
| [testing.md](conventions/testing.md) | TDD와 테스트 구성·작성 |
| [code.md](conventions/code.md) | 도메인, 엔티티, DTO, 이름, 스타일 |
| [persistence.md](conventions/persistence.md) | JPA, 트랜잭션, 조회, DB와 삭제 |
| [time.md](conventions/time.md) | 날짜, 시간, 현재 시각 |
| [security.md](conventions/security.md) | 인증·인가, 비밀값, 개인정보 |
| [project-operations.md](conventions/project-operations.md) | ADR, 프로필, 빌드, 실행 환경, 저장소 명령 |

`../proposals/convention-review.md`는 사용자가 명시적으로 재검토를 요청할 때만 읽는 비구속
보류 문서이며, 이 컨벤션의 구속력 있는 규칙이나 모듈 소유권에 포함하지 않는다.

## 적용과 변경

작업 범위별 문서 로딩은 `backend/AGENTS.md`가 담당한다. 이 문서와 로딩한 모듈이
변경되면 해당 문서를 다시 읽는다. 기억이나 추측으로 규칙을 적용하지 않는다.

확정 규칙은 소유 모듈 한 곳에만 둔다. 문서 간 충돌은 조용히 해석하지 않고
보고한다. 모듈 소유권이 바뀔 때만 이 인덱스를 갱신한다.
