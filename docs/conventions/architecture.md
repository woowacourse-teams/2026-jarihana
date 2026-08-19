# 아키텍처 컨벤션

> 이 문서는 구속력 있는 팀 컨벤션 모듈이다.
> 인덱스: [team-convention.md](../team-convention.md)

## 패키지 구조

기능 기반 패키지 구조(package-by-feature)를 사용하고, 각 기능 안에서 명령과
조회를 분리하는 CQRS-lite 구조를 적용한다.

CQRS-lite는 협업 시 파일 소유권과 변경 이유를 분리하기 위한 코드 구조다. 하나의
Spring 애플리케이션과 하나의 데이터베이스를 사용하며, 쓰기 모델과 별도의 조회
데이터베이스를 만들지 않는다.

```text
group
├── command
│   ├── controller
│   └── service
├── query
│   ├── controller
│   ├── service
│   └── repository
├── domain
└── repository
```

- `command/controller`: 상태를 변경하는 API 요청·응답, 표현 계층 DTO, 요청 검증
- `command/service`: 상태를 변경하는 유스케이스, 트랜잭션 단위, 서비스 DTO
- `query/controller`: 상태를 변경하지 않는 API 요청·응답, 표현 계층 DTO, 요청 검증
- `query/service`: 조회 조건 조합과 조회 결과 구성
- `query/repository`: 조회 전용 쿼리와 Projection
- `domain`: 엔티티, 값 객체, 일급 컬렉션, 도메인 규칙
- `repository`: 명령 유스케이스에서 엔티티를 조회·저장하는 Repository 인터페이스와
  JPA 기반 구현

`member`, `group`, `groupmember`, `recruitment`, `registration`처럼 도메인 기능을
최상위 패키지로 두고, 각 기능 안에서 위 구조를 반복한다. 명령이나 조회 기능이
없는 패키지는 비어 있는 디렉터리를 미리 만들지 않는다.

표현 계층과 Repository 구현이 비즈니스 계층을 참조한다. 비즈니스 계층은 API
형식이나 구체적인 데이터 접근 기술에 의존하지 않는다. 별도 `persistence`
패키지는 두지 않는다.

## 명령과 조회의 경계

### 명령

- 시스템 상태를 변경하는 `POST`, `PUT`, `PATCH`, `DELETE` 유스케이스를 둔다.
- 상태 변경에 필요한 엔티티 조회는 명령의 일부다. 조회가 포함된다는 이유로 조회
  패키지로 이동하지 않는다.
- 도메인 엔티티와 `repository`를 사용해 불변식을 검증하고 상태 전이를 저장한다.
- 여러 상태 변경을 하나의 원자적 작업으로 처리해야 하면 명령 Service의 public
  유스케이스 메서드를 트랜잭션 경계로 삼는다.
- 명령 코드는 `query`의 Service나 Projection에 의존하지 않는다.

### 조회

- 시스템 상태를 변경하지 않는 `GET` 유스케이스를 둔다.
- `query/repository`는 엔티티 그래프를 API 응답 조립에 그대로 노출하지 않고 조회에
  필요한 값만 Projection 또는 조회 결과 DTO로 반환한다.
- 검색, 필터, 정렬, 페이지네이션과 집계는 조회 패키지에서 조합한다.
- 조회 코드는 엔티티의 상태 전이 메서드나 명령 Service를 호출하지 않는다.
- 조회라는 이유만으로 `@Transactional(readOnly = true)`를 기본 적용하지 않는다.
  트랜잭션 적용 여부는 [영속성 컨벤션](persistence.md)의 트랜잭션 규칙을 따른다.

조회 전용 구조를 위해 엔티티, 테이블 또는 데이터베이스를 복제하지 않는다. 별도
조회 저장소, 이벤트 버스, 비동기 Projection과 최종적 일관성은 현재 범위에
포함하지 않는다. 이를 도입하려면 별도 ADR과 팀 합의가 필요하다.

## 기능 배치 기준

- 명령은 최종적으로 상태가 변경되는 도메인 기능에 둔다.
- 조회는 응답의 주 리소스를 소유하는 도메인 기능에 둔다.
- URL이 중첩되어 있어도 모든 상위 리소스의 패키지를 반복하지 않는다.
- 여러 도메인을 조합하는 조회도 응답의 주 리소스가 명확하면 그 기능의 `query`에
  둔다. 주 리소스를 정하기 어렵다면 구현 전에 팀이 소유 패키지를 합의한다.

예를 들어 같은 `/api/groups` 경로를 사용하더라도 상태 변경과 조회 Controller를
분리한다.

```text
group/command/controller/GroupCommandController  # POST, PUT, PATCH, DELETE
group/query/controller/GroupQueryController      # GET
```

`GET /api/groups/{groupId}/recruitments`는 URL이 `groups` 아래에 있어도 응답의 주
리소스가 모집이므로 `recruitment/query`에 둔다. 명령과 조회 Controller는 같은
기본 경로를 사용할 수 있지만 하나의 HTTP method와 path 조합을 중복 매핑하지
않는다.

## Repository와 응답 모델

- 기능 루트의 `repository`는 명령 유스케이스가 도메인 엔티티를 조회하고 저장하는
  데 사용한다.
- `query/repository`는 조회 화면이나 API에 필요한 Projection을 반환한다.
- Projection은 조회 패키지 밖의 명령 또는 도메인 규칙에서 사용하지 않는다.
- 조회 성능을 위해 도메인 엔티티에 API 전용 필드나 역방향 연관관계를 추가하지
  않는다.
- fetch join, EntityGraph 또는 전용 조회 쿼리 선택과 N+1 방지는
  [영속성 컨벤션](persistence.md)을 따른다.
- 엔티티, 서비스 DTO 또는 Projection을 API 응답으로 직접 노출하지 않고
  Controller의 `*Response`로 변환한다.

## 협업과 소유권

- 명령 담당자는 도메인 엔티티, 상태 전이, 불변식과 명령 유스케이스를 주로
  변경한다.
- 조회 담당자는 Query Controller, Service, Repository와 Projection을 주로
  변경한다.
- 조회 응답의 의미, 권한과 비즈니스 상태 해석은 조회 담당자가 단독으로 결정하지
  않고 해당 도메인 담당자와 함께 리뷰한다.
- 공통 엔티티나 데이터베이스 스키마 변경은 해당 도메인 담당자가 주도하고 조회
  담당자는 필요한 조회 조건과 인덱스를 함께 검토한다.
- 담당자가 바뀌어도 패키지 경계는 유지한다. 작업량 조정을 위해 API 담당자를
  옮길 때 명령과 조회 코드를 다시 합치지 않는다.

## 테스트 경계

- 명령 유스케이스는 상태 변경, 불변식과 원자성을 검증한다.
- 복잡한 필터, 집계, 정렬 또는 Projection이 있는 조회는 Repository 통합 테스트를
  작성한다.
- 모든 API는 명령과 조회 구분과 관계없이 RestAssured 인수 테스트로 계약을
  검증한다.
- 세부 테스트 구성과 TDD 절차는 [테스트 컨벤션](testing.md)을 따른다.

## 예외 처리

- 예외는 식별 가능한 오류 코드와 사용자에게 전달할 오류 메시지를 가진다.
- 도메인 또는 서비스에서 발생한 예외는 전역 예외 처리기에서 일관된 API 오류 응답으로 변환한다.
- 내부 예외 메시지, 스택 트레이스, 민감한 값은 외부 응답에 노출하지 않는다.
- 구체적인 오류 응답 JSON 형식과 필드 오류 표현은 추가 합의 후 확정한다.
