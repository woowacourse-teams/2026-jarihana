# 영속성 컨벤션

> 이 문서는 구속력 있는 팀 컨벤션 모듈이다.
> 인덱스: [team-convention.md](../team-convention.md)

## JPA 컨벤션

### 도입 이유

SQL을 직접 사용해도 기능 구현은 가능하지만 객체 조회와 저장마다 SQL 작성,
파라미터 바인딩, 결과 매핑, 수정 쿼리 같은 반복 작업이 생긴다.

자리하나는 단순 조회보다 엔티티의 상태 전이와 객체 간 관계를 중심으로 비즈니스
로직을 구현하므로 반복적인 SQL과 매핑 코드를 줄이고 도메인 객체에 로직을
응집시키기 위해 JPA를 사용한다. JPA를 데이터베이스를 몰라도 되는 도구로
취급하지 않으며 실제 실행 SQL과 성능을 함께 관리한다.

### 매핑과 조회

- 모든 연관관계는 LAZY 로딩을 기본으로 한다.
- 다대다 관계는 직접 사용하지 않고 중간 엔티티를 둔다.
- 연관관계는 단방향을 기본으로 한다.
- 실제 유스케이스에서 반대 방향 탐색이 필요할 때만 양방향 연관관계를 허용한다.
- 양방향 연관관계를 사용하면 도메인 메서드에서 양쪽 상태를 함께 맞춘다.
- `cascade`와 `orphanRemoval`은 두 엔티티의 생명주기가 완전히 같을 때만 사용한다.
- 핵심 조회는 fetch join, EntityGraph 또는 전용 조회 쿼리로 필요한 연관 데이터를 명시적으로 가져온다.
- N+1 문제를 허용하지 않는다.
- flush 최적화는 실제 성능 문제가 발견된 뒤 수행한다.

### 공통 필드와 이름

- 엔티티 ID 타입은 `Long`으로 한다.
- 자바 도메인 클래스의 ID 필드명은 `id`로 한다.
- 데이터베이스 외래 키 컬럼은 `{참조_엔티티}_id` 형식을 사용한다.
- `createdAt`, `updatedAt`은 공통 `BaseEntity`에서 관리하고 getter를 제공한다.
- ID는 `BaseEntity`에 포함하지 않는다.
- 엔티티 필드명에는 `is`, `has`, `can` 같은 접두사를 사용하지 않는다. getter나 도메인 행위 메서드에는 사용할 수 있다.

### 스키마 설정

- 운영 환경: `ddl-auto: validate`
- 로컬 환경: `ddl-auto: update`

운영 환경에서는 `ddl-auto: update`와 `create`로 애플리케이션 스키마를 변경하지 않는다.

### 엔티티 동일성

- 엔티티의 `equals`와 `hashCode`는 ID 값만을 기준으로 구현한다.
- 동일한 인스턴스는 같다고 판단한다.
- 서로 다른 두 엔티티 중 하나라도 ID가 `null`이면 같지 않다고 판단한다.
- 두 엔티티 모두 ID가 있을 때만 ID 값으로 동일성을 판단한다.
- 영속화 전 속성이 같은지 비교해야 하면 `equals`를 변경하지 않고 의도가 드러나는 별도 메서드나 유틸리티를 만든다.
- ID 할당 전후 `hashCode`가 바뀔 수 있으므로 미영속 엔티티를 `HashSet` 원소 또는 `HashMap` 키로 사용하지 않는다.
- Hibernate 프록시와 실제 클래스의 비교를 위한 별도 처리는 현재 적용하지 않는다. 실제 문제가 생기면 다시 결정한다.

### 그룹 목록 조회의 JPA 구성

- `group.domain.Group`, `groupmember.domain.GroupMember`,
  `recruitment.domain.GroupRecruitment`, `registration.domain.Registration`은
  도메인 규칙을 가진 JPA 엔티티로 사용한다.
- `RecurringGroupSchedule`과 `SessionGroupSchedule`은 그룹 테이블에 임베드하는
  `@Embeddable` 값 객체다. 반복 활동 요일 집합은
  `ActivityDaysConverter`로 하나의 컬럼에 저장한다.
- 그룹 목록 조회의 운영 Repository는 `JpaGroupListRepository`다. 이 어댑터는
  Spring Data JPA의 `GroupJpaRepository`, `GroupMemberJpaRepository`,
  `GroupRecruitmentJpaRepository`, `RegistrationJpaRepository`를 조합해
  그룹·구성원·활성 모집·승인 신청 집계를 가져와 `GroupListProjection`을 만든다.
- 메서드 이름으로 표현할 수 있는 정렬·연관 조회는 Spring Data 파생 쿼리를 사용하고,
  활성 모집과 승인 신청 집계처럼 조건이나 집계가 필요한 조회는 각 Repository의
  `@Query`로 선언한다. 조회 어댑터에서 `EntityManager`를 직접 호출하지 않는다.
- 구성원별 Repository 호출을 반복하지 않고 `@EntityGraph`와 일괄 조회를 사용해
  N+1 조회를 만들지 않는다.
- 그룹 목록의 필터링과 cursor 조건은 DB 쿼리에 포함한다. 애플리케이션에서 전체
  목록을 가져온 뒤 메모리에서 페이지네이션하지 않는다.
- 무한 스크롤 목록은 `Page` 대신 Spring Data JPA `Slice`를 사용한다. `Pageable`은
  DB의 limit 적용에 사용하고, offset 대신 `createdAt DESC, id DESC` 기준의 cursor
  조건으로 다음 페이지를 조회한다. 상세 결정은
  [ADR 0002(그룹 목록 커서 페이지네이션)](../adr/0002-group-list-database-cursor-pagination.md)를
  따른다.
- `InMemoryGroupListRepository`는 Service 단위 테스트의 대역으로만 사용하므로
  `src/test/java` 아래에 두고, Spring Repository Bean으로 등록하지 않는다.

## 트랜잭션 컨벤션

- 데이터 변경이나 여러 작업의 원자성이 필요한 Service public 유스케이스 메서드를 트랜잭션 경계로 삼는다.
- 단순 읽기 작업에는 기본적으로 트랜잭션을 적용하지 않는다.
- 일관된 스냅샷, 잠금, 명시적인 격리 수준 또는 의도적인 지연 로딩처럼 트랜잭션이
  필요한 조회에만 근거를 남기고 적용한다.
- `@Transactional(readOnly = true)`는 기본 규칙으로 사용하지 않는다.
  현재 프로젝트에서는 DB 최적화 힌트와 JPA 더티 체킹 최적화의 실익이 크지 않다고
  판단한다.
- 오래 걸리는 외부 API 호출은 가능한 한 DB 트랜잭션 밖에서 수행한다.

## 목록 조회 컨벤션

- 목록 API는 무한 스크롤을 지원하기 위해 cursor 기반 페이지네이션을 사용한다.
- 첫 요청은 `cursor`를 생략하고, 이후 요청은 이전 응답의 `nextCursor`를 전달한다.
- 요청 `size`의 기본값은 20, 허용 범위는 1 이상 100 이하로 한다.
- 응답은 `items`, `nextCursor`, `hasNext`를 포함하며, 마지막 페이지의 `nextCursor`는
  `null`, `hasNext`는 `false`로 한다.
- 기본 정렬은 `createdAt DESC, id DESC`로 하고, cursor는 정렬 기준 값을 불투명 문자열로
  인코딩한다.

## DB 및 삭제 컨벤션

- 도메인별 삭제 정책은 `docs/context/domain/`과 `docs/context/api/`에 기록된 최종 결정을 우선 적용한다.
- 도메인별 정책이 별도로 정해지지 않은 삭제는 soft delete로 처리한다.
- 삭제 시각은 nullable `LocalDateTime deletedAt`으로 기록한다.
- `deletedAt == null`이면 활성 데이터이고 값이 있으면 삭제된 데이터다.
- 일반 조회에서는 `deletedAt`이 `null`인 데이터만 반환한다.
- PK 이외의 unique 제약이 필요해지면 soft delete 데이터와의 충돌 정책을 구현하기 전에 팀에 다시 알리고 결정한다.

### Hard Delete 확정 대상

- `Group`: 생성 후 24시간 이내의 `ACTIVE` 그룹 삭제 시 그룹과 연관된 모집 공고, 신청,
  구성원과 일정을 물리적으로 삭제한다.
- `GroupMember`: 구성원이 그룹에서 이탈할 때 소속 관계를 물리적으로 삭제한다.
  `deletedAt`을 두지 않으며, 삭제된 관계는 그룹 조회와 그룹 구성원 조회에 포함하지 않는다.
- `Registration`: `PENDING` 신청 철회 시 신청을 물리적으로 삭제한다.
- 반복 일정 제거: `RecurringGroupSchedule` 값을 물리적으로 제거하고 그룹은 유지한다.
