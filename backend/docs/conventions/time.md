# 날짜와 시간 컨벤션

> 이 문서는 구속력 있는 팀 컨벤션 모듈이다.
> 인덱스: [team-convention.md](../team-convention.md)

- 날짜만 표현하는 값은 `LocalDate`를 사용한다.
- 날짜와 시간을 함께 표현하는 값은 `LocalDateTime`을 사용한다.
- `Instant`와 `OffsetDateTime`은 현재 기본 타입으로 사용하지 않는다.
- 현재 시간에 의존하는 도메인 및 서비스 로직은 `Clock`을 주입한다.
- 현재 날짜와 시간은 `LocalDate.now(clock)` 또는 `LocalDateTime.now(clock)`으로
  얻어 테스트에서 제어할 수 있게 한다.
