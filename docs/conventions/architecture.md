# 아키텍처 컨벤션

> 이 문서는 구속력 있는 팀 컨벤션 모듈이다.
> 인덱스: [team-convention.md](../team-convention.md)

## 패키지 구조

기능 기반 패키지 구조(package-by-feature)를 사용한다.

```text
club
├── controller
├── service
├── domain
└── repository
```

- `controller`: API 요청·응답, 표현 계층 DTO, 요청 검증
- `service`: 유스케이스, 트랜잭션 단위, 서비스 DTO
- `domain`: 엔티티, 값 객체, 일급 컬렉션, 도메인 규칙
- `repository`: 비즈니스 계층에서 사용하는 Repository 인터페이스와 JPA 기반 구현

표현 계층과 Repository 구현이 비즈니스 계층을 참조한다. 비즈니스 계층은 API
형식이나 구체적인 데이터 접근 기술에 의존하지 않는다. 별도 `persistence`
패키지는 두지 않는다.

### 예외 처리

- 예외는 식별 가능한 오류 코드와 사용자에게 전달할 오류 메시지를 가진다.
- 도메인 또는 서비스에서 발생한 예외는 전역 예외 처리기에서 일관된 API 오류 응답으로 변환한다.
- 내부 예외 메시지, 스택 트레이스, 민감한 값은 외부 응답에 노출하지 않는다.
- 구체적인 오류 응답 JSON 형식과 필드 오류 표현은 추가 합의 후 확정한다.
