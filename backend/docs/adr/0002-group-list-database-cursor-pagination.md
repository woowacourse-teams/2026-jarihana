# ADR 0002. 그룹 목록 조회의 DB cursor 페이지네이션

- 상태: 채택
- 날짜: 2026-08-19
- 관련 문서: [영속성 컨벤션](../conventions/persistence.md), [아키텍처 컨벤션](../conventions/architecture.md), [그룹 API 엔드포인트 설계](../context/api/endpoints.md)

## 배경

`GET /api/groups`는 무한 스크롤을 위해 `cursor`, `size`, `nextCursor`, `hasNext`를
사용한다. 초기 구현에서 Repository가 전체 그룹을 `findAll()`로 조회한 뒤 Service가
필터링과 페이지네이션을 수행하면 데이터가 증가할수록 다음 문제가 생긴다.

- DB에서 사용하지 않을 데이터까지 모두 애플리케이션 메모리로 전송한다.
- 애플리케이션 메모리와 GC 사용량이 목록 크기에 비례한다.
- `size`가 작아도 전체 조회 비용은 줄어들지 않는다.
- 여러 사용자가 동시에 요청하면 같은 전체 목록 조회를 반복한다.

## 결정

1. 그룹 목록의 필터링과 cursor 조건은 DB 조회에 포함한다.
   상태, 유형, 키워드, 가입 관계, 구성원 역할, 모집 여부를 Repository 쿼리에서
   적용한다.
2. 정렬 기준은 `createdAt DESC, id DESC`로 고정한다.
3. cursor는 이 정렬 기준의 마지막 행을 가리키는 불투명 문자열로 유지한다.
   Service가 cursor를 해석해 `createdAt`과 `id`를 Repository 조회 조건으로 전달한다.
4. Repository는 다음 조건으로 cursor 이후 행만 조회한다.

   ```sql
   created_at < :cursorCreatedAt
   OR (created_at = :cursorCreatedAt AND id < :cursorId)
   ```

5. Spring Data JPA의 `Pageable`을 DB `LIMIT` 적용에 사용하고, 반환 타입은 `Slice`로
   한다. 현재 요청의 `size`로 `Pageable.ofSize(size)`를 만들며 cursor 조건이
   이미 offset을 대신하므로 매 요청의 page 번호는 0이다.
6. 전체 데이터 개수가 필요하지 않은 무한 스크롤이므로 `Page` 대신 `Slice`를 사용한다.
   `Slice`의 `hasNext`를 이용해 다음 페이지 존재 여부만 판단하고 count 쿼리는
   실행하지 않는다.
7. 그룹 기본 목록을 DB에서 제한한 뒤, 해당 페이지의 그룹 ID에 대해서만 구성원·활성
   모집·승인 신청 집계를 일괄 조회해 `GroupListProjection`을 조립한다.

## 구현 책임

- `GroupJpaRepository`: 그룹 필터, cursor 조건, 정렬, `Slice<Group>` 조회
- `JpaGroupListRepository`: 페이지 그룹을 기준으로 관련 데이터를 일괄 조회하고
  `Slice<GroupListProjection>`으로 변환
- `GroupListService`: 요청 검증, 인증 회원 ID 확인, cursor 인코딩·디코딩, 응답 결과 변환

## 검토한 대안

| 대안 | 장점 | 채택하지 않은 이유 |
| --- | --- | --- |
| 전체 조회 후 Service에서 필터·페이지네이션 | 구현이 단순하다 | 데이터 증가에 따라 조회·메모리 비용이 선형으로 증가한다 |
| `Page`와 offset 페이지네이션 | Spring Data JPA 기본 기능을 바로 사용할 수 있다 | 무한 스크롤에 필요하지 않은 count 쿼리와 offset 누적 비용이 생긴다 |
| `Slice`만 사용하고 cursor 조건은 적용하지 않음 | 구현이 쉽다 | 매 요청이 첫 데이터부터 다시 읽어 중복 조회가 발생한다 |
| 모든 연관 데이터를 하나의 조인 쿼리로 조회 | Repository 호출 수가 적다 | 구성원 컬렉션 조인으로 행이 중복되고 집계·페이지 조립이 복잡해진다 |

## 결과

- DB가 필터와 cursor 조건을 적용하므로 요청 크기만큼의 그룹 페이지만 애플리케이션에
  전달된다.
- count 쿼리 없이 `hasNext`를 제공한다.
- 페이지에 포함된 그룹만 연관 데이터를 조회하므로 전체 그룹 기준의 일괄 조회를
  피한다.
- cursor 조건과 정렬 기준이 함께 유지되어 페이지 사이의 순서가 안정적이다.

## 후속 작업

- 실제 운영 데이터 규모에 맞춰 `status`, `type`, `created_at`, `id` 및 관계 조회
  조건의 인덱스를 검토한다.
- 실행 SQL과 실행 계획을 확인해 키워드 검색 성능을 검토한다.
- 인증 회원 Provider가 연결되면 가입 관계·역할 조건의 실행 계획을 다시 확인한다.
