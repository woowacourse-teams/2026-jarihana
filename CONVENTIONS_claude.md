# 자리하나 개발 컨벤션

우아한테크코스 내부에 파편화된 동아리와 스터디 정보를 한곳에 모아 탐색할 수 있게 하는 서비스.

---

## 0. 이 문서를 읽는 에이전트를 위한 지침

### 0.1 강제 수준

| 표기       | 의미                                               | 위반 시               |
| ---------- | -------------------------------------------------- | --------------------- |
| `[MUST]`   | 반드시 지킨다                                      | CI 또는 리뷰에서 차단 |
| `[SHOULD]` | 기본으로 지키되, 어길 경우 PR 본문에 근거를 남긴다 | 리뷰에서 근거 요구    |
| `[MAY]`    | 선택 사항                                          | 없음                  |

표기가 없는 문장은 `[MUST]`로 간주한다.

### 0.2 코드를 생성하기 전에

1. 이 문서의 20장(미결정 항목)에 해당하는 주제라면 코드를 작성하지 말고 사람에게 질문한다.
2. 기존 코드가 이 문서와 충돌하면, 이 문서를 따르되 충돌 사실을 응답에 보고한다. 무단으로 기존 코드를 리팩터링하지 않는다.
3. 이 문서에 없는 규칙이 필요하면 임의로 정하지 말고 질문한다. 관례상 명백한 경우에만 진행하고, 어떤 관례를 적용했는지 응답에 남긴다.

### 0.3 산출물 기본값

기능 하나를 구현할 때 기본 산출물은 아래와 같다. 명시적으로 제외 요청을 받지 않는 한 전부 만든다.

- 도메인(엔티티) 클래스와 단위 테스트(도메인에 로직이 있는 경우)
- Repository 인터페이스(비즈니스 계층)와 구현(영속성 계층)
- Service와 서비스 DTO
- Controller와 컨트롤러 DTO
- 인수 테스트
- Service + Repository 통합 테스트
- Flyway 마이그레이션 스크립트(스키마 변경이 있는 경우)

---

## 1. 기술 스택

| 항목         | 값                          |
| ------------ | --------------------------- |
| 언어         | Java 21                     |
| 프레임워크   | Spring Boot 3.x             |
| 영속성       | Spring Data JPA (Hibernate) |
| 데이터베이스 | MySQL 8.x                   |
| 마이그레이션 | Flyway                      |
| 빌드         | Gradle (Kotlin DSL)         |
| API 문서     | Swagger (springdoc-openapi) |
| 인수 테스트  | RestAssured                 |
| 테스트 DB    | Testcontainers (MySQL)      |

---

## 2. Git

### 2.1 브랜치

| 브랜치                        | 용도             |
| ----------------------------- | ---------------- |
| `main`                        | 프로덕션         |
| `develop`                     | 통합 개발 브랜치 |
| `feat/#{이슈번호}-{기능명}`   | 기능 개발        |
| `refactor/#{이슈번호}-{대상}` | 리팩터링         |
| `fix/#{이슈번호}-{목적}`      | 버그 수정        |

- `[MUST]` 기능명과 대상은 영문 소문자 케밥 케이스로 작성한다. 예: `feat/#42-group-search`
- `[MUST]` `main`과 `develop`에 직접 푸시하지 않는다. 브랜치 보호 규칙으로 강제한다.
- `[MUST]` 머지된 브랜치는 삭제한다.

### 2.2 머지 전략

- `[MUST]` feature 계열 브랜치를 `develop`에 머지할 때는 squash merge를 사용한다. squash 커밋 메시지는 PR 제목을 따른다.
- `[MUST]` `develop`을 `main`에 머지할 때는 merge commit을 사용한다. 릴리스 단위를 히스토리에 남기기 위함이다.
- `[MUST]` rebase는 자신의 로컬 feature 브랜치를 최신 `develop`에 맞출 때만 사용한다. 공유된 브랜치를 rebase하지 않는다.

### 2.3 커밋

```
<type>(<scope>): <subject>

<body>

<footer>
```

**type**

| 타입       | 의미                                |
| ---------- | ----------------------------------- |
| `feat`     | 새로운 기능 추가                    |
| `fix`      | 버그 수정                           |
| `docs`     | 문서 수정, 주석 추가                |
| `style`    | 포맷팅, 공백 등 로직 변화 없는 변경 |
| `refactor` | 기능 변화 없는 코드 개선            |
| `test`     | 테스트 코드 추가 및 수정            |
| `perf`     | 성능 개선                           |
| `build`    | 빌드 스크립트, 의존성 변경          |
| `ci`       | CI 설정 변경                        |
| `chore`    | 그 외 유지보수                      |
| `revert`   | 이전 커밋 되돌리기                  |

**scope**

아래 목록에서만 선택한다. 새 scope가 필요하면 이 문서를 먼저 수정한다.

`auth`, `member`, `group`, `recruitment`, `application`, `tag`, `bookmark`, `search`, `common`, `infra`, `docs`

여러 scope에 걸치면 scope를 생략한다.

**subject**

- `[MUST]` 한국어로 작성한다.
- `[MUST]` 명령문, 현재 시제, 마침표 없음.
- `[MUST]` 50자 이내.

```
feat(group): 모임 목록 조회 API를 추가한다
fix(application): 마감된 모집에 신청이 가능하던 문제를 수정한다
refactor(member): 크루 조회 로직을 일급 컬렉션으로 분리한다
```

**body** `[SHOULD]`

변경 이유, 이전 동작과의 차이, 구현 세부를 1줄에서 3줄로 적는다. subject만으로 이유가 자명하면 생략한다.

**footer** `[MAY]`

Breaking Change 또는 이슈 연관을 적는다. 예: `Closes #42`

### 2.4 PR과 코드 리뷰

- `[MUST]` PR 제목은 커밋 subject와 동일한 형식으로 작성한다.
- `[MUST]` PR 본문에는 변경 요약, 리뷰 포인트, 테스트 방법을 포함한다.
- `[MUST]` approve 2개 이상을 받아야 머지할 수 있다.
- `[MUST]` 셀프 approve와 셀프 머지를 금지한다. 머지는 작성자가 approve를 모두 받은 뒤 직접 수행한다.
- `[SHOULD]` PR의 변경 라인 수는 500줄 이내로 유지한다. 초과하면 분리 가능한지 먼저 검토한다.
- `[SHOULD]` 리뷰 요청을 받으면 24시간 이내에 응답한다.
- `[MUST]` 리뷰 코멘트에는 등급을 붙인다.
  - `P1:` 머지 전 반드시 수정
  - `P2:` 수정을 제안하나 작성자 판단에 맡김
  - `nit:` 취향 수준의 의견, 무시해도 무방

---

## 3. 패키지 구조

기능 기반(package-by-feature)을 따른다. 도메인 패키지 내부에 계층을 둔다.

```
com.jarihana
├── group
│   ├── presentation          컨트롤러, 컨트롤러 DTO
│   │   └── dto
│   ├── application           서비스, 서비스 DTO
│   │   └── dto
│   ├── domain                엔티티, 값 객체, 일급 컬렉션, Repository 인터페이스
│   └── infrastructure        Repository 구현, 외부 연동
├── member
├── recruitment
├── application
├── tag
├── bookmark
└── common
    ├── config
    ├── exception             BusinessException, ErrorCode, GlobalExceptionHandler
    └── entity                BaseEntity
```

- `[MUST]` 도메인 패키지 안에 계층 패키지를 둔다. 계층 패키지 안에 도메인을 두지 않는다.
- `[MUST]` `domain` 패키지는 다른 계층 패키지를 참조하지 않는다.

---

## 4. 계층과 의존 방향

```
presentation  ─┐
               ├──▶  application  ──▶  domain
infrastructure ─┘                        ▲
                                         │
infrastructure ──────────────────────────┘
```

- `[MUST]` 표현 계층은 서비스와 서비스 DTO를 참조한다.
- `[MUST]` 서비스는 `domain` 패키지에 정의된 Repository 인터페이스를 참조한다.
- `[MUST]` 영속성 계층이 그 인터페이스를 구현한다.
- `[MUST]` 도메인은 어떤 상위 계층도 참조하지 않는다.
- `[MUST]` 컨트롤러가 Repository를 직접 호출하지 않는다.

---

## 5. 도메인과 엔티티

이 프로젝트는 도메인 객체와 JPA 엔티티를 분리하지 않고 하나로 사용한다.

- `[MUST]` 도메인 클래스에 setter를 만들지 않는다. 상태 변경은 의미 있는 이름의 메서드로 표현한다.
  - 나쁨: `group.setStatus(CLOSED)`
  - 좋음: `group.closeRecruitment()`
- `[MUST]` 엔티티 ID의 자바 필드명은 `id`, 타입은 `Long`으로 한다.
- `[MUST]` 엔티티 필드명에 `is`, `has`, `can` 접두사를 쓰지 않는다. getter 메서드명에는 사용할 수 있다.
- `[MUST]` `createdAt`, `updatedAt`, `deletedAt`은 `BaseEntity`에서 관리한다. `BaseEntity`에 ID는 두지 않는다.
- `[MUST]` 컬렉션 필드를 반환할 때 방어적 복사를 적용한다.
- `[MUST]` 비즈니스 로직에서 컬렉션을 다룰 때는 일급 컬렉션으로 감싼다.
- `[MUST]` 도메인 상태 변경 메서드는 새 객체를 반환하지 않고 자기 자신의 상태를 변경한다. JPA 변경 감지를 사용하기 위함이다. 값 객체(VO)는 예외로, 불변으로 만들고 변경 시 새 인스턴스를 반환한다.

### 5.1 객체 생성

- `[MUST]` 생성자에서 불변식을 검증한다. 검증 실패 시 도메인 예외를 던진다.
- `[MUST]` 생성자 오버로딩으로 시그니처가 충돌하는 경우 정적 팩터리 메서드를 사용한다.
- `[SHOULD]` 그 외에는 생성자를 사용한다. 의미 부여가 필요할 때만 정적 팩터리를 사용한다.
- `[MUST]` 정적 팩터리 메서드명은 `of`, `from`, `create{의도}` 중에서 선택한다.

---

## 6. 네이밍

### 6.1 Repository

| 동작                      | 메서드명                   |
| ------------------------- | -------------------------- |
| 생성, 수정                | `save`                     |
| 조회(결과가 없을 수 있음) | `findXxx`, `Optional` 반환 |
| 조회(없으면 예외)         | `getXxx`                   |
| 존재 확인                 | `existsXxx`                |
| 삭제                      | `remove`                   |

### 6.2 Service

- `[MUST]` 유스케이스를 드러내는 이름을 사용한다. Repository 메서드명을 그대로 따라가지 않는다.
  - 나쁨: `saveMember`
  - 좋음: `modifyMemberProfile`

### 6.3 Controller

- `[MUST]` 동사 + 도메인 형태로 작성한다. 예: `findGroups`, `createGroup`, `applyToGroup`

---

## 7. DTO

- `[MUST]` DTO는 `record`로 정의한다. 프레임워크 제약으로 불가능한 경우에만 `class`를 쓰고 그 이유를 주석으로 남긴다.
- `[MUST]` 컨트롤러 DTO는 API 요청과 응답 형식을 표현한다. 이름은 `XxxRequest`, `XxxResponse`로 한다.
- `[MUST]` 서비스 DTO는 유스케이스의 입력과 결과를 표현한다. 이름은 `XxxCommand`(입력), `XxxResult`(결과)로 한다.
- `[MUST]` 서비스 DTO를 API 응답으로 직접 반환하지 않는다. 컨트롤러에서 컨트롤러 DTO로 변환한다.
- `[MUST]` 컨트롤러 DTO를 서비스 계층으로 전달하지 않는다. 컨트롤러에서 서비스 DTO로 변환한다.
- `[SHOULD]` 계층이 다르다는 이유만으로 기계적으로 분리하지 않는다. 역할이나 변경 이유가 같고 필드가 동일하다면 컨트롤러 DTO에서 서비스 DTO로의 변환만 두고 구조를 단순하게 유지한다.

### 7.1 서비스 반환 타입

- `[MUST]` 서비스가 항상 DTO를 반환할 필요는 없다. `void`, 기본 타입, 값 객체, 도메인 객체, 결과 DTO 중에서 선택한다.
- `[MUST]` 도메인 객체 하나만 반환할 때는 DTO로 감싸지 않는다.
- `[MUST]` 여러 값을 함께 반환해야 할 때만 결과 DTO를 사용한다.
- `[MAY]` 결과 DTO에 도메인 객체를 그대로 포함할 수 있다.
- `[MUST]` 결과 DTO에 도메인 객체를 포함한 경우, 이를 사용하는 쪽에서 해당 객체의 상태를 변경하지 않는다.

---

## 8. JPA

- `[MUST]` 모든 연관관계는 `FetchType.LAZY`로 설정한다. `@ManyToOne`과 `@OneToOne`은 기본이 EAGER이므로 반드시 명시한다.
- `[MUST]` `@ManyToMany`를 사용하지 않는다. 중간 엔티티를 만들고 `@OneToMany`와 `@ManyToOne` 두 개로 표현한다.
- `[MUST]` enum 필드에 `@Enumerated(EnumType.STRING)`을 명시한다. ORDINAL을 사용하지 않는다.
- `[MUST]` N+1 쿼리를 허용하지 않는다. 연관 데이터가 필요한 조회는 fetch join, `@EntityGraph`, 전용 조회 쿼리 중 하나로 명시적으로 가져온다.
- `[MUST]` 통합 테스트에서 실행 쿼리 수를 검증한다. 목록 조회 API는 반드시 쿼리 수 검증 테스트를 포함한다.
- `[MUST]` `spring.jpa.open-in-view`를 `false`로 둔다. 지연 로딩 프록시 초기화는 트랜잭션 안에서 끝낸다.
- `[MUST]` cascade와 orphanRemoval은 생명주기가 완전히 종속된 관계에만 사용한다. 사용 시 PR 본문에 근거를 남긴다.
- `[SHOULD]` flush 최적화와 배치 사이즈 조정은 성능 문제가 관측된 뒤에 한다.

### 8.1 ddl-auto

| 환경  | 값         |
| ----- | ---------- |
| local | `validate` |
| test  | `validate` |
| dev   | `validate` |
| prod  | `validate` |

- `[MUST]` 모든 환경에서 `validate`를 사용한다. 스키마 변경은 Flyway 마이그레이션 스크립트로만 한다.
- `[MUST]` `update`를 사용하지 않는다. 컬럼 삭제와 타입 변경이 반영되지 않아 개발자마다 로컬 스키마가 달라진다.

---

## 9. 트랜잭션과 동시성

- `[MUST]` `@Transactional`은 서비스 클래스에만 붙인다. 컨트롤러와 Repository에 붙이지 않는다.
- `[MUST]` 서비스 클래스에 `@Transactional(readOnly = true)`를 선언하고, 쓰기 메서드에만 `@Transactional`을 재선언한다.
- `[MUST]` 트랜잭션 안에서 외부 API를 호출하지 않는다. 커넥션을 잡은 채 네트워크 대기가 발생한다.
- `[MUST]` 같은 클래스 내부 메서드를 호출하면 프록시를 거치지 않아 `@Transactional`이 동작하지 않는다. 트랜잭션이 필요한 메서드는 다른 빈으로 분리하거나 호출 구조를 바꾼다.
- `[MUST]` 전파 속성은 기본값(REQUIRED)을 사용한다. `REQUIRES_NEW`를 쓰는 경우 PR 본문에 근거를 남긴다.

### 9.1 동시성 제어

정원이 있는 모집에 여러 크루가 동시에 신청하는 상황을 반드시 고려한다.

- `[MUST]` 중복 신청은 `(recruitment_id, member_id)` 복합 유니크 제약으로 데이터베이스에서 막는다. 애플리케이션 검증만으로 처리하지 않는다.
- `[MUST]` 정원 차감처럼 현재 값을 읽고 갱신하는 로직은 비관적 락(`@Lock(LockModeType.PESSIMISTIC_WRITE)`)으로 조회한 뒤 수행한다.
- `[MUST]` 락을 사용하는 로직에는 동시 요청 상황을 재현하는 테스트를 함께 작성한다.
- `[SHOULD]` 락 구간은 최대한 짧게 유지한다. 락 조회 이전에 가능한 검증을 모두 마친다.

---

## 10. 예외 처리

### 10.1 구조

```java
public class BusinessException extends RuntimeException {

    private final ErrorCode errorCode;

    public BusinessException(ErrorCode errorCode) {
        super(errorCode.getMessage());
        this.errorCode = errorCode;
    }

    public ErrorCode getErrorCode() {
        return errorCode;
    }
}
```

```java
public enum ErrorCode {

    GROUP_NOT_FOUND("GROUP_001", "모임을 찾을 수 없습니다.", HttpStatus.NOT_FOUND),
    RECRUITMENT_CLOSED("RECRUIT_001", "이미 마감된 모집입니다.", HttpStatus.CONFLICT),
    APPLICATION_DUPLICATED("APPLY_001", "이미 신청한 모집입니다.", HttpStatus.CONFLICT);

    private final String code;
    private final String message;
    private final HttpStatus status;
}
```

- `[MUST]` 모든 비즈니스 예외는 `BusinessException`을 상속한 unchecked 예외로 만든다. checked 예외를 새로 정의하지 않는다.
- `[MUST]` 도메인별 하위 예외 클래스는 만들지 않는다. `ErrorCode`로 구분한다. 클래스 폭발을 막기 위함이다.
- `[MUST]` `ErrorCode`의 코드 체계는 `{도메인약어}_{3자리번호}`로 한다.
- `[MUST]` `ErrorCode`에 HTTP 상태를 함께 정의한다.

### 10.2 처리 위치

- `[MUST]` 예외 처리는 `@RestControllerAdvice` 하나에서만 한다.
- `[MUST]` 컨트롤러와 서비스에서 try-catch로 비즈니스 예외를 잡지 않는다. 그대로 전파한다.
- `[MUST]` 도메인은 도메인 예외를 던진다. 서비스는 이를 변환하지 않고 전파한다.
- `[MUST]` 예외 메시지에 내부 클래스명, 쿼리, 스택 트레이스를 노출하지 않는다.
- `[MUST]` 처리되지 않은 예외는 500과 함께 고정된 일반 메시지를 반환하고, 서버 로그에만 상세 내용을 남긴다.

### 10.3 에러 응답 스키마

```json
{
  "code": "RECRUIT_001",
  "message": "이미 마감된 모집입니다.",
  "fieldErrors": [
    { "field": "capacity", "message": "정원은 1 이상이어야 합니다." }
  ]
}
```

- `[MUST]` 모든 에러 응답은 이 스키마를 따른다.
- `[MUST]` `fieldErrors`는 검증 실패가 아닌 경우 빈 배열로 내려준다. 필드를 생략하지 않는다.

---

## 11. API 설계

### 11.1 URI

- `[MUST]` `/api/v1`을 접두사로 붙인다.
- `[MUST]` 자원은 복수형 명사로 표현한다. 소문자와 케밥 케이스를 사용한다.
- `[MUST]` URI에 동사를 넣지 않는다.

```
GET    /api/v1/groups
GET    /api/v1/groups/{groupId}
POST   /api/v1/groups
PATCH  /api/v1/groups/{groupId}
DELETE /api/v1/groups/{groupId}
POST   /api/v1/groups/{groupId}/applications
GET    /api/v1/members/me/bookmarks
```

### 11.2 HTTP 메서드와 상태 코드

| 상황                        | 상태 코드 | 비고                                       |
| --------------------------- | --------- | ------------------------------------------ |
| 조회 성공                   | 200       |                                            |
| 생성 성공                   | 201       | `Location` 헤더에 생성된 자원 URI를 넣는다 |
| 수정 성공                   | 200       | 수정된 자원을 반환한다                     |
| 삭제 성공                   | 204       | 본문 없음                                  |
| 요청 형식 오류, 검증 실패   | 400       |                                            |
| 인증 실패                   | 401       |                                            |
| 권한 없음                   | 403       |                                            |
| 자원 없음                   | 404       |                                            |
| 도메인 규칙 위반(상태 충돌) | 409       | 마감된 모집 신청, 중복 신청 등             |

- `[MUST]` 부분 수정에는 `PATCH`를 사용한다. `PUT`은 전체 교체가 명확한 경우에만 사용한다.

### 11.3 응답 본문

- `[MUST]` 성공 응답에 공통 래퍼(`ApiResponse<T>` 같은 것)를 사용하지 않는다. 자원 표현을 그대로 반환한다. 에러 응답만 10.3의 고정 스키마를 사용한다.
- `[MUST]` 최상위 응답이 배열이 되지 않게 한다. 목록은 항상 객체로 감싼다.

### 11.4 페이지네이션

`자리하나`의 모임 목록은 페이지 번호 UI를 사용하므로 offset 기반으로 한다.

```
GET /api/v1/groups?type=STUDY&status=RECRUITING&tags=java,spring&sort=createdAt,desc&page=0&size=20
```

```json
{
  "content": [ ... ],
  "page": 0,
  "size": 20,
  "totalElements": 137,
  "totalPages": 7,
  "hasNext": true
}
```

- `[MUST]` 스프링의 `Page` 객체를 직렬화해서 그대로 반환하지 않는다. 위 형태의 전용 응답 DTO를 사용한다.
- `[MUST]` `page`는 0부터 시작한다. `size`의 기본값은 20, 최댓값은 100으로 제한한다.
- `[MUST]` 다중 값 필터는 쉼표로 구분한다.
- `[MUST]` 정렬 파라미터는 `sort={필드},{asc|desc}` 형식으로 하고, 허용 필드를 화이트리스트로 제한한다.

### 11.5 날짜와 시간

- `[MUST]` 데이터베이스에는 UTC로 저장한다. 애플리케이션 JVM 타임존을 UTC로 고정한다.
- `[MUST]` 자바 타입은 `LocalDateTime`(UTC 기준)을 사용한다. 날짜만 필요한 경우 `LocalDate`를 사용한다.
- `[MUST]` API 응답은 ISO 8601 UTC 형식으로 내려준다. 예: `2026-08-04T09:00:00Z`
- `[MUST]` 한국 시간으로의 표시 변환은 클라이언트 책임으로 둔다. 서버가 KST 문자열을 만들지 않는다.

### 11.6 검증

- `[MUST]` 형식 검증(null, 길이, 범위, 형식)은 컨트롤러 DTO에 Bean Validation으로 선언하고 `@Valid`로 실행한다.
- `[MUST]` 도메인 불변식(모집 정원이 신청자 수보다 작을 수 없다 등)은 도메인 생성자와 메서드에서 검증한다.
- `[MUST]` 같은 검증을 두 계층에 중복해서 넣지 않는다.

---

## 12. 데이터베이스

### 12.1 네이밍

- `[MUST]` 테이블명과 컬럼명은 snake_case로 한다.
- `[MUST]` 테이블명은 단수형으로 한다. 예: `group_member`, `recruitment`
- `[MUST]` 자바 필드 `id`는 테이블에서 `{테이블명}_id`로 매핑한다. 예: `group` 테이블의 PK는 `group_id`
- `[MUST]` 인덱스는 `idx_{테이블}_{컬럼}`, 유니크 인덱스는 `uk_{테이블}_{컬럼}`으로 이름 짓는다.

### 12.2 스키마 규칙

- `[MUST]` 문자셋은 `utf8mb4`, 콜레이션은 `utf8mb4_0900_ai_ci`를 사용한다.
- `[MUST]` PK는 `BIGINT AUTO_INCREMENT`, 자바에서는 `@GeneratedValue(strategy = GenerationType.IDENTITY)`를 사용한다.
- `[MUST]` 외래키 물리 제약을 건다.
- `[MUST]` 시간 컬럼은 `DATETIME(6)`을 사용한다.

### 12.3 마이그레이션

- `[MUST]` 스키마 변경은 Flyway 스크립트로만 한다. 파일명은 `V{버전}__{설명}.sql`로 하고 설명은 영문 스네이크 케이스로 쓴다.
- `[MUST]` 이미 머지된 마이그레이션 스크립트를 수정하지 않는다. 새 스크립트를 추가한다.
- `[MUST]` 마이그레이션 스크립트와 엔티티 변경은 같은 PR에 포함한다.

### 12.4 Soft delete

- `[MUST]` 삭제는 soft delete로 한다. `deleted_at` 컬럼(nullable `DATETIME(6)`)에 삭제 시각을 기록한다.
- `[MUST]` soft delete 대상 엔티티에 `@SQLDelete`와 `@SQLRestriction("deleted_at is null")`을 선언한다. 조회 조건을 매번 수동으로 붙이지 않는다.
- `[MUST]` soft delete 대상 테이블에는 비즈니스 컬럼 단독 유니크 제약을 걸지 않는다. 삭제된 행 때문에 재등록이 막힌다. 유니크가 필요하면 `(비즈니스컬럼, deleted_at)` 복합 유니크를 사용한다.
- `[MUST]` 삭제된 데이터를 조회해야 하는 관리 기능은 네이티브 쿼리로 구현한다. `@SQLRestriction`은 네이티브 쿼리에 적용되지 않는다.

---

## 13. 로깅과 보안

- `[MUST]` 로그에 비밀번호, 토큰, 개인정보, 요청 본문 전체, 응답 본문 전체를 남기지 않는다.
- `[MUST]` 예외 추적과 운영상 의미 있는 이벤트만 기록한다.
- `[MUST]` 로거는 `@Slf4j` 또는 `LoggerFactory`로 얻는다. `System.out.println`을 사용하지 않는다.
- `[MUST]` 로그 레벨 기준
  - `ERROR`: 즉시 확인이 필요한 장애
  - `WARN`: 비정상이지만 서비스가 계속되는 상황
  - `INFO`: 주요 비즈니스 이벤트
  - `DEBUG`: 개발 환경에서만 활성화
- `[MUST]` 비즈니스 예외(4xx)는 `WARN` 이하로 기록한다. `ERROR`로 남기지 않는다.

---

## 14. 코드 스타일

포매터와 정적 분석이 자동으로 검사하는 항목은 리뷰에서 다루지 않는다.

- `[MUST]` 포매터 설정 파일을 저장소에 커밋하고 Spotless로 CI에서 검사한다.
- `[MUST]` `.editorconfig`와 `.gitattributes`(개행문자 LF 고정)를 저장소에 둔다. 인코딩은 UTF-8.
- `[MUST]` 와일드카드 임포트를 사용하지 않는다.
- `[MUST]` 코드 블록의 여는 중괄호는 개행하지 않는다.
- `[MUST]` `switch`는 enum을 분기할 때만 사용한다.
- `[MUST]` `Optional`은 반환 타입에만 사용한다. 필드, 파라미터, 컬렉션 요소로 사용하지 않는다.
- `[MUST]` 매직 넘버와 매직 스트링을 상수로 추출한다.
- `[MUST]` 클래스 내 멤버 선언 순서: 상수, 필드, 생성자, 정적 팩터리 메서드, public 메서드, private 메서드.
- `[SHOULD]` 지역 변수에 `var`를 사용하지 않는다. 타입을 명시한다.
- `[SHOULD]` 메서드 파라미터에 `final`을 붙이지 않는다. 필드는 가능한 한 `final`로 선언한다.

---

## 15. 롬복

- `[MUST]` `@Data`, `@Setter`, `@AllArgsConstructor`를 사용하지 않는다.
- `[MUST]` 엔티티에 `@NoArgsConstructor(access = AccessLevel.PROTECTED)`를 선언한다.
- `[MUST]` 엔티티에 `@EqualsAndHashCode`와 `@ToString`을 사용하지 않는다. 양방향 연관관계에서 순환 참조로 스택 오버플로가 발생한다. 필요하면 ID 기준으로 직접 구현한다.
- `[MUST]` `@Builder`는 정적 팩터리 메서드 내부에서만 사용한다. 외부에 노출하지 않는다. 검증 없이 객체가 생성되는 경로를 막기 위함이다.
- `[MAY]` `@Getter`와 `@RequiredArgsConstructor`는 자유롭게 사용한다.

---

## 16. 테스트

### 16.1 범위

| 테스트                           | 필수 여부                   | 도구              |
| -------------------------------- | --------------------------- | ----------------- |
| 인수 테스트                      | 필수                        | RestAssured       |
| Service + Repository 통합 테스트 | 필수                        | `@SpringBootTest` |
| 도메인 단위 테스트               | 도메인에 로직이 있으면 필수 | JUnit 5           |
| Repository 테스트                | 쿼리 로직이 복잡할 때만     | `@DataJpaTest`    |
| 컨트롤러 슬라이스 테스트         | 기본적으로 하지 않음        |                   |
| 그 외 단위 테스트                | 작성자 판단                 |                   |

- `[MUST]` 기본적으로 하지 않는 테스트라도 필요하다고 판단되면 PR 본문에 필요성을 언급한다.

### 16.2 작성 규칙

- `[MUST]` 테스트 메서드명은 CamelCase 영문으로 작성하고 `@DisplayName`의 내용과 일치시킨다.
  ```java
  @DisplayName("마감된 모집에는 신청할 수 없다.")
  @Test
  void closedRecruitmentCannotApply() { }
  ```
- `[MUST]` 테스트 본문에 `// given`, `// when`, `// then` 주석을 단다.
- `[MUST]` 테스트 패키지 구조를 프로덕션 코드와 동일하게 유지한다.
- `[MUST]` 테스트는 실행 순서에 의존하지 않는다.

### 16.3 격리와 환경

- `[MUST]` 테스트 데이터베이스는 Testcontainers로 띄운 MySQL을 사용한다. H2를 사용하지 않는다. 락 동작과 방언 차이를 검증할 수 없기 때문이다.
- `[MUST]` 스프링 컨텍스트를 올리는 테스트에서 `@DirtiesContext`를 사용하지 않는다. `@Sql`로 truncate 스크립트를 실행해 격리한다. 컨텍스트 캐싱을 유지하기 위함이다.
- `[MUST]` 테스트 픽스처는 `test` 소스의 `fixture` 패키지에 모아둔다. 각 테스트가 개별적으로 객체를 조립하지 않는다.

### 16.4 테스트 더블

- `[MUST]` 외부 연동(메일 발송, 외부 인증 등)은 stub으로 대체한다.
- `[MUST]` 내부 분기 로직이 많아 흐름 검증이 필요한 대상은 fake 객체로 구현한다.
- `[MUST]` 목록 조회 API에는 실행 쿼리 수를 검증하는 테스트를 포함한다.

---

## 17. 설정과 환경

- `[MUST]` 프로파일을 `local`, `test`, `dev`, `prod`로 나눈다.
- `[MUST]` 시크릿(DB 비밀번호, JWT 시크릿, 외부 API 키)을 저장소에 커밋하지 않는다. 환경 변수로 주입한다.
- `[MUST]` `application-local.yml.example`처럼 값이 비어 있는 예시 파일은 커밋한다.
- `[MUST]` `.gitignore`에 실제 설정 파일과 `.env`를 등록한다.

---

## 18. CI

- `[MUST]` PR 생성과 갱신 시 빌드, 테스트, 포매터 검사를 실행한다.
- `[MUST]` 위 검사가 모두 통과해야 머지할 수 있도록 브랜치 보호 규칙을 설정한다.
- `[MUST]` `main`과 `develop`에 직접 푸시를 금지한다.

---

## 19. 문서화

- `[MUST]` API 문서는 Swagger(springdoc-openapi)로 자동 생성한다. 별도로 Notion에 중복 작성하지 않는다.
- `[MUST]` 아키텍처 수준의 결정은 `docs/adr/{번호}-{제목}.md`에 ADR로 기록한다. 이 문서에는 결정된 규칙만 남긴다.
- `[MUST]` README에 프로젝트 소개, 실행 방법, 기술 스택, 팀원을 포함한다.

---

## 20. 미결정 항목

아래 항목은 아직 팀에서 확정하지 않았다. 에이전트는 이 주제에 해당하는 코드를 생성하기 전에 반드시 사람에게 질문한다.

| 번호 | 항목           | 확인이 필요한 내용                                       |
| ---- | -------------- | -------------------------------------------------------- |
| 1    | 인증 방식      | 세션인지 JWT인지, 우테코 계정 연동 여부                  |
| 2    | 권한 모델      | 모임 개설자, 참여자, 일반 크루의 권한 구분               |
| 3    | 검색 방식      | LIKE 기반인지 전문 검색 인덱스를 도입할지                |
| 4    | 모임 상태 전이 | 모집중, 진행중, 종료 사이의 허용된 전이와 자동 전이 여부 |
| 5    | 알림           | 신청 결과 알림을 보낼지, 보낸다면 채널은 무엇인지        |
| 6    | 이미지 업로드  | 모임 대표 이미지 지원 여부와 저장소                      |
| 7    | 배포 환경      | 배포 대상과 파이프라인                                   |

---

## 부록 A. 주요 결정의 근거

이 절은 규칙이 아니라 배경 설명이다. 규칙만 필요하다면 읽지 않아도 된다.

**JPA를 도입한 이유**

SQL을 직접 써도 기능 구현은 가능하다. 다만 객체를 조회하고 저장할 때마다 SQL 작성, 파라미터 바인딩, 결과 매핑, 수정 쿼리 작성이 반복된다. 이 프로젝트는 단순 조회보다 엔티티의 상태 변경과 객체 간 관계를 중심으로 비즈니스 로직을 구현하므로, 반복 작업을 줄이고 도메인 객체에 로직을 응집시키기 위해 JPA를 선택했다. 단, JPA를 데이터베이스를 몰라도 되는 도구로 쓰지 않고 실제 실행 SQL과 성능을 함께 관리한다.

**도메인과 엔티티를 분리하지 않은 이유**

지연 로딩과 변경 감지 같은 JPA의 이점을 그대로 쓰기 위해서다. 팀의 경험상 영속성 기술을 교체한 사례가 드물었고, 스키마 구조가 크게 바뀌면서 도메인 구조는 그대로인 상황도 현재 구상에서는 예상되지 않는다. 불필요한 변환 레이어를 만들지 않기로 했다.

**서비스 결과 DTO에 도메인 객체를 포함할 수 있게 한 이유**

모든 값을 기본 타입으로 변환할 때 생기는 보일러플레이트를 줄이고, 다른 서비스에서 같은 도메인 객체가 필요할 때의 재조회 비용을 줄이며, 값을 분해했다가 다시 조립하는 과정을 없애기 위해서다. 대신 서비스 간 결합도 상승, 책임 경계 흐려짐, 호출 측의 상태 변경 가능성, 지연 로딩과 트랜잭션 범위 문제라는 단점이 있다. 이 단점보다 변환 비용과 중복 조회를 줄이는 실용성이 크다고 판단했다. 단점을 통제하기 위해 9장의 OSIV 비활성화와 7.1의 상태 변경 금지 규칙을 함께 둔다.

**공통 응답 래퍼를 쓰지 않는 이유**

Swagger 스키마가 모든 응답에 대해 래퍼로 한 겹 감싸져 가독성이 떨어지고, 클라이언트는 HTTP 상태 코드로 이미 성공과 실패를 구분할 수 있다. 에러 응답만 고정 스키마로 통일해도 목적을 달성한다.

**offset 페이지네이션을 선택한 이유**

모임 목록은 페이지 번호 UI를 사용하며, 우테코 내부 서비스 특성상 전체 모임 수가 크지 않아 offset의 성능 문제가 나타나지 않는다. 무한 스크롤로 UI가 바뀌면 cursor 방식 도입을 다시 검토한다.
