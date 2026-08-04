# 자리하나 개발 컨벤션

> 상태: 팀 합의안 v1.0
>
> 적용 대상: 자리하나 백엔드 저장소
>
> 기준 스택: Java 21, Spring Boot 4.1, Gradle, Spring Data JPA

이 문서는 자리하나의 개발·협업 기준에 대한 단일 진실 공급원(Single Source of Truth)이다. 문서에 없는 선택은 기존 코드의 일관성을 우선하고, 반복되는 선택이나 구조에 영향을 주는 선택은 이 문서를 먼저 수정한 뒤 적용한다.

현재 저장소는 초기 프로젝트 상태이므로 이 문서에는 아직 자동화되지 않은 목표 규칙도 포함되어 있다. 규칙을 문서에 적는 것과 CI에서 강제하는 것은 구분하며, 자동화 현황은 [하네스 엔지니어링 분리 기준](#14-하네스-엔지니어링-분리-기준)에서 관리한다.

## 0. 규칙의 강도와 변경 절차

- **MUST**: 반드시 지킨다. 예외가 필요하면 PR에 이유와 영향 범위를 기록하고 리뷰어의 동의를 받는다.
- **SHOULD**: 기본 선택이다. 더 나은 선택이 있으면 PR에 근거를 남기고 달리 적용할 수 있다.
- **MAY**: 상황에 따라 선택한다.
- 코드, 테스트, API 명세와 이 문서가 충돌하면 임의로 해석하지 않고 같은 PR에서 하나로 맞춘다.
- 패키지 의존 방향, 트랜잭션 경계, 데이터 삭제 정책처럼 되돌리기 어려운 변경은 간단한 ADR(Architecture Decision Record)을 남긴다.
- 팀 합의 없는 “나중을 위한” 추상화, 호환 계층, 공통 모듈은 만들지 않는다. 현재 요구사항을 만족하는 가장 작은 설계를 선택한다.

### 핵심 결정 요약

| 영역 | 결정 |
| --- | --- |
| 브랜치 | `main` + `develop`, 작업 브랜치는 `type/issue-kebab-case` |
| 병합 | 작업 PR은 `develop`에 squash merge, 배포 PR은 `develop`에서 `main`으로 merge commit |
| API 문서 | OpenAPI 명세가 기준, Swagger UI는 조회 도구, Notion은 논의·기획용 |
| 패키지 | 기능 우선(package-by-feature), 기능 내부에서 계층 분리 |
| 도메인/JPA | JPA 엔티티와 도메인 모델을 통합하되 외부 API로 직접 노출하지 않음 |
| DB 스키마 | 공유 환경은 마이그레이션 파일로 관리, `ddl-auto: update` 금지 |
| 삭제 | 일괄 soft delete가 아니라 복구·감사 요구가 있는 데이터에만 적용 |
| 테스트 | 핵심 유스케이스 인수 테스트 + 도메인 단위 테스트 + 필요한 통합 테스트 |
| 동시성 | 정원 변경은 DB 제약과 잠금 또는 원자적 조건부 갱신으로 불변식 보장 |

## 1. Git 브랜치 컨벤션

### 1.1 장기 브랜치

| 브랜치 | 역할 | 규칙 |
| --- | --- | --- |
| `main` | 현재 배포 가능한 프로덕션 코드 | 직접 push 금지, 항상 배포 가능한 상태 유지 |
| `develop` | 다음 배포를 위한 통합 코드 | 작업 브랜치의 기본 PR 대상, 직접 push 금지 |

- `main`과 `develop`에는 branch protection을 적용한다.
- 최소 보호 조건은 PR 필수, 승인 1명 이상, 필수 CI 통과, 미해결 대화 없음, force push·삭제 금지다.
- 관리자도 긴급 장애 대응을 제외하고 보호 규칙을 우회하지 않는다.

### 1.2 작업 브랜치

형식은 `<type>/<issue-number>-<short-description>`으로 통일한다.

```text
feat/123-create-club
fix/245-duplicate-application
refactor/81-split-club-service
docs/32-api-convention
chore/19-configure-flyway
hotfix/301-login-failure
```

| type | 용도 | 시작 브랜치 | 병합 대상 |
| --- | --- | --- | --- |
| `feat` | 새로운 기능 | `develop` | `develop` |
| `fix` | 배포 전 일반 버그 수정 | `develop` | `develop` |
| `refactor` | 동작 변화 없는 구조 개선 | `develop` | `develop` |
| `test` | 테스트만 추가·수정 | `develop` | `develop` |
| `docs` | 문서만 변경 | `develop` | `develop` |
| `chore` | 설정·의존성·빌드 작업 | `develop` | `develop` |
| `hotfix` | 운영 장애 긴급 수정 | `main` | `main`, 이후 `develop` 동기화 |

- 브랜치 설명은 영문 kebab-case로 짧게 작성한다.
- 이슈가 없는 단순 문서·설정 작업은 이슈 번호를 생략할 수 있다. 예: `docs/update-readme`.
- 하나의 브랜치는 하나의 목표만 가진다.
- 병합 후 원격 작업 브랜치는 삭제한다.

### 1.3 병합 전략

- 일반 작업 PR은 `develop`에 **squash merge**한다.
- 배포 PR은 `develop`에서 `main`으로 **merge commit**하여 두 브랜치의 조상 관계를 유지한다.
- hotfix는 `main`에서 분기하여 `main`에 병합한 직후, `main`을 `develop`에 병합해 수정이 유실되지 않게 한다.
- 공유 중인 브랜치의 커밋을 rebase하거나 강제 push하지 않는다. 개인 작업 브랜치에서만 안전하게 수행한다.
- 충돌 해결 후에는 빌드와 관련 테스트를 다시 실행한다.

## 2. 커밋 컨벤션

Conventional Commits 형식을 사용하고 설명은 한국어로 작성한다. `scope`는 변경 범위를 분명히 할 때만 사용한다.

```text
<type>[(<scope>)][!]: <subject>

[body]

[footer]
```

### 2.1 type

| type | 의미 | 예시 |
| --- | --- | --- |
| `feat` | 새로운 기능 | `feat(club): 동아리 등록 기능 추가` |
| `fix` | 버그 수정 | `fix(application): 중복 지원 허용 문제 수정` |
| `docs` | 문서만 변경 | `docs: 로컬 실행 방법 추가` |
| `style` | 로직 없는 포맷 변경 | `style: import 순서 정리` |
| `refactor` | 동작 변화 없는 코드 개선 | `refactor(member): 회원 조회 책임 분리` |
| `test` | 테스트 추가·수정 | `test(club): 모집 마감 조건 테스트 추가` |
| `perf` | 성능 개선 | `perf(club): 목록 조회 N+1 제거` |
| `build` | 빌드 도구·의존성 변경 | `build: RestAssured 의존성 추가` |
| `ci` | CI 워크플로 변경 | `ci: PR 테스트 작업 추가` |
| `chore` | 코드 동작과 무관한 유지보수 | `chore: 이슈 템플릿 추가` |
| `revert` | 이전 변경 되돌림 | `revert: 동아리 검색 캐시 적용 취소` |

### 2.2 subject, body, footer

- `subject`는 무엇이 바뀌었는지 한 문장으로 쓰고 마침표를 붙이지 않는다.
- “수정”, “추가”만 쓰지 말고 변경 대상을 포함한다.
- body는 선택 사항이며 **무엇을** 반복하기보다 **왜** 바꿨는지와 이전 동작과의 차이를 설명한다.
- 관련 이슈는 footer에 `Closes #123`, 참고만 할 때는 `Refs #123`으로 연결한다.
- 호환되지 않는 변경은 type 뒤에 `!`를 붙이고 `BREAKING CHANGE: <내용>` footer를 반드시 작성한다.
- 비밀번호, 토큰, 개인정보, 내부 접속 정보는 커밋 메시지와 diff에 포함하지 않는다.
- 커밋 하나는 독립적으로 설명 가능한 하나의 변경 단위여야 한다. 포맷 변경과 기능 변경을 섞지 않는다.

```text
feat(application): 동아리 중복 지원 방지

동일 사용자가 모집 중인 동아리에 여러 번 지원할 수 있던 문제를
DB 유니크 제약과 애플리케이션 검증으로 함께 차단한다.

Closes #123
```

## 3. 이슈와 Pull Request 컨벤션

### 3.1 이슈

- 기능 이슈에는 배경, 완료 조건, 범위 밖 항목을 기록한다.
- 버그 이슈에는 재현 절차, 기대 결과, 실제 결과, 실행 환경을 기록한다.
- 구현 중 새 범위를 발견하면 몰래 포함하지 않고 별도 이슈로 분리하거나 원래 이슈의 범위를 팀과 갱신한다.

### 3.2 PR

- PR 제목은 커밋 제목과 같은 형식을 권장한다. 예: `feat(club): 동아리 등록 기능 추가`.
- 본문에는 최소한 변경 목적, 주요 변경, 검증 방법, 관련 이슈를 적는다.
- API·DB 스키마·설정이 바뀌면 그 영향과 롤백 방법을 추가한다.
- 화면이나 API 동작처럼 관찰 가능한 변경은 캡처, 요청·응답 예시 또는 테스트 결과를 남긴다.
- PR 작성자는 리뷰 요청 전 self-review와 로컬 검증을 완료한다.
- 리뷰어는 정확성, 요구사항, 테스트, 보안, 쿼리·트랜잭션 영향을 확인한다. 개인 취향만으로 변경을 요구하지 않는다.
- 리뷰 대화는 수정, 합의 또는 후속 이슈 연결 중 하나로 해소하고 임의로 닫지 않는다.
- 기능과 무관한 대규모 리팩터링을 같은 PR에 섞지 않는다.

### 3.3 병합 조건

다음을 모두 만족해야 병합할 수 있다.

- 승인 1명 이상
- 필수 CI 작업 통과
- 변경된 동작에 맞는 테스트 통과
- 모든 리뷰 대화 해결
- API·DB·운영 변경 사항 문서화
- 디버그 코드, 임시 주석, 비밀 정보가 없음

## 4. 아키텍처와 패키지 구조

기능 우선 패키지 구조를 사용한다. 최상위에서 기술 계층별로 모든 기능을 섞지 않고, 기능 패키지 안에서 계층을 나눈다.

```text
com.project.jarihana
├── club
│   ├── presentation
│   │   ├── ClubController
│   │   └── dto
│   ├── application
│   │   ├── ClubService
│   │   └── dto
│   ├── domain
│   │   ├── Club
│   │   ├── ClubRepository
│   │   └── exception
│   └── infrastructure
│       └── persistence
├── member
│   └── ...
└── common
    ├── config
    ├── exception
    └── time
```

### 4.1 계층 책임

| 계층 | 책임 | 금지 사항 |
| --- | --- | --- |
| `presentation` | HTTP 요청 검증, 인증 정보 해석, application 호출, 응답 변환 | 비즈니스 규칙·직접 DB 접근 |
| `application` | 유스케이스 흐름, 트랜잭션 경계, 도메인 협력 | HTTP 요청·응답 타입 의존 |
| `domain` | 엔티티·값 객체·도메인 규칙·Repository 포트 | Controller·외부 API 형식 의존 |
| `infrastructure` | JPA Repository 구현, 외부 시스템 어댑터 | 유스케이스 정책 결정 |

의존 방향은 다음을 지킨다.

```text
presentation -> application -> domain
infrastructure -------------> domain
```

- `domain`은 `presentation`과 `infrastructure`를 참조하지 않는다.
- application에 선언한 포트가 더 자연스러운 유스케이스 전용 외부 의존성은 application에 둘 수 있다.
- `common`은 둘 이상의 기능에서 의미와 변경 이유가 실제로 같을 때만 사용한다. 단순 중복 제거 목적으로 성급하게 공통화하지 않는다.
- 기능 간 직접 참조가 늘어나면 공개할 application 인터페이스를 좁히거나 도메인 이벤트를 검토한다. 순환 참조는 허용하지 않는다.

## 5. Java 코드와 네이밍 컨벤션

### 5.1 기본 스타일

- Java 21 문법을 사용하되 팀이 이해하기 어려운 기법은 근거 없이 도입하지 않는다.
- 클래스와 메서드는 하나의 책임을 드러내는 이름을 사용한다.
- 여는 중괄호는 선언과 같은 줄에 두고, 닫는 중괄호는 별도 줄에 둔다.
- 한 줄 조건문도 중괄호를 생략하지 않는다.
- wildcard import를 사용하지 않는다. 예: `import java.util.*;` 금지.
- 사용하지 않는 코드와 주석 처리된 코드는 커밋하지 않는다.
- 주석은 코드가 하는 일을 번역하지 않고, 코드만으로 알기 어려운 이유·제약·트레이드오프를 설명한다.
- Lombok `@Data`, 무분별한 `@Setter`, 엔티티의 자동 `equals/hashCode/toString` 생성을 금지한다.
- DTO는 `record`를 기본으로 사용하고, 프레임워크 제약이나 가변 상태가 필요한 명확한 이유가 있을 때만 `class`를 사용한다.

### 5.2 이름

- 클래스·인터페이스: PascalCase
- 메서드·필드·지역 변수: camelCase
- 상수: UPPER_SNAKE_CASE
- 패키지: 소문자 단수 명사
- boolean 필드: `active`, `deleted`, `visible`처럼 상태를 나타내고 `is`, `has`, `can` 접두어를 필드명에 넣지 않는다.
- boolean 질의 메서드: `isActive()`, `hasMember()`, `canApply()`처럼 의도를 드러낸다.
- 약어도 단어처럼 취급한다. 예: `ApiResponse`, `ClubId`.

### 5.3 메서드 이름

| 상황 | 접두어·형식 | 반환 예시 |
| --- | --- | --- |
| 없을 수 있는 단건 조회 | `find...` | `Optional<Club>` |
| 반드시 존재해야 하는 단건 조회 | `get...` | `Club`, 없으면 정의된 예외 |
| 존재 여부 | `exists...` | `boolean` |
| 컬렉션 조회 | `findAll...` | `List<Club>` 또는 페이지 |
| 생성·수정 영속화 | `save` | 저장된 엔티티 |
| 삭제 | `delete` | `void` |

- `exist...`가 아니라 `exists...`를 사용한다.
- application 서비스 메서드는 저장 방식이 아니라 유스케이스를 표현한다. 예: `modifyMemberProfile()`, `applyToClub()`.
- Controller 메서드는 HTTP 동작이 아닌 유스케이스를 표현한다. 예: `createClub()`, `getClub()`, `closeRecruitment()`.
- `Manager`, `Util`, `Helper`, `Processor` 같은 포괄적 이름은 책임을 구체화할 수 없을 때만 사용한다.

### 5.4 null과 Optional

- 메서드 인자와 컬렉션 원소에 `null`을 허용하지 않는 것을 기본으로 한다.
- 빈 결과는 빈 컬렉션으로 반환하고 `null` 컬렉션을 반환하지 않는다.
- `Optional`은 주로 Repository의 없을 수 있는 단건 반환에 사용한다.
- 엔티티 필드, DTO 필드, 메서드 인자에 `Optional`을 사용하지 않는다.
- 필수 값은 생성 시점이나 시스템 경계에서 검증한다.

## 6. 도메인 모델과 객체 생성

### 6.1 JPA 엔티티와 도메인 모델

현재 프로젝트는 JPA 엔티티와 도메인 모델을 하나의 객체로 사용한다. 영속성 교체 가능성만을 이유로 동일한 모델을 이중으로 만들지 않는다.

- 엔티티는 상태와 그 상태를 변경하는 비즈니스 행위를 함께 가진다.
- 엔티티 상태는 setter가 아니라 의도가 드러나는 메서드로 변경한다. 예: `closeRecruitment()`, `changeCapacity()`.
- JPA용 기본 생성자는 `protected`로 제한한다.
- Controller나 JSON serializer가 엔티티를 직접 응답으로 노출하지 않는다.
- `@Entity`에 `@Data`, 모든 필드 기반 `equals/hashCode`, 연관관계를 포함한 `toString`을 적용하지 않는다.
- 양방향 연관관계는 실제 양쪽 탐색이 필요할 때만 사용하고, 편의 메서드에서 양쪽 상태를 함께 맞춘다.

### 6.2 ID와 동일성

- 엔티티 ID 타입은 `Long`을 사용하고 필드명은 `id`로 통일한다.
- ID는 영속화 전에는 `null`일 수 있으므로 primitive `long`을 사용하지 않는다.
- 엔티티 동일성은 자동 생성 메서드에 맡기지 않고, 영속화 전후의 동작을 고려해 명시적으로 설계한다.
- 값 객체는 값을 기준으로 동등성을 비교하며 가능하면 불변 객체로 만든다.

### 6.3 생성과 변경

- 생성 자체가 의미를 가지거나 검증·기본값이 필요하면 이름 있는 정적 팩터리 메서드를 사용한다. 예: `Club.open(...)`.
- 단순 값 객체처럼 생성 의미가 하나뿐이고 시그니처가 명확하면 public 생성자를 사용할 수 있다.
- 같은 타입의 인자가 여러 개라 의미가 모호하거나 생성 시나리오가 여러 개면 정적 팩터리 메서드를 사용한다.
- 가변 엔티티의 update는 기존 영속 엔티티의 의도 있는 메서드로 상태를 바꾼다.
- 불변 값 객체의 변경은 새 객체를 반환한다.
- 생성 검증을 우회하는 public 생성자와 팩터리 메서드를 동시에 제공하지 않는다.

### 6.4 컬렉션

- 외부에서 받은 가변 컬렉션을 보관하거나 외부로 반환할 때 `List.copyOf`, 불변 뷰 등으로 캡슐화를 지킨다.
- JPA 연관 컬렉션은 엔티티 내부에서 초기화하고 컬렉션 자체의 setter를 두지 않는다.
- 모든 컬렉션을 기계적으로 일급 컬렉션으로 만들지 않는다. 고유한 불변식, 행위, 용어가 있을 때만 일급 컬렉션으로 승격한다.

### 6.5 검증 책임

- 형식·필수 여부·길이 같은 입력 형식은 presentation DTO에서 검증한다.
- 현재 상태에 따른 비즈니스 규칙은 domain에서 검증한다.
- 다른 aggregate나 저장 데이터가 필요한 규칙은 application에서 조회한 뒤 domain 행위와 DB 제약으로 보장한다.
- 중복 지원, 정원 초과처럼 경쟁 상태가 생길 수 있는 규칙은 사전 조회만으로 보장하지 않는다.

## 7. DTO와 계층 경계

### 7.1 DTO 종류

- presentation DTO는 외부 API 요청·응답 계약을 표현한다.
- application command/result는 유스케이스 입력과 결과를 표현한다.
- 계층이 다르다는 이유만으로 같은 구조의 DTO를 기계적으로 복제하지 않는다. 역할이나 변경 이유가 다를 때 분리한다.
- 외부 API DTO는 `presentation` 패키지를 벗어나 application/domain의 입력 타입이 되지 않는다.

### 7.2 반환 규칙

- application 서비스는 상황에 따라 `void`, 기본 타입, 값 객체, domain 객체, 전용 result를 반환할 수 있다.
- Controller는 service가 반환한 JPA 엔티티를 직접 직렬화하지 않고 API 응답 DTO로 변환한다.
- application 내부에서 domain 객체를 전달할 수 있지만, 다른 트랜잭션이나 기능 경계를 넘어 관리 엔티티를 공유하지 않는다.
- 여러 값, 계산 결과, 부가 상태가 함께 필요하면 전용 result를 사용한다.
- 지연 로딩에 의존한 응답 변환을 피하고 application 트랜잭션 안에서 필요한 데이터를 명시적으로 준비한다.

### 7.3 매핑 위치

- API request를 application command로 바꾸는 책임은 presentation에 둔다.
- domain을 application result로 조합하는 책임은 application에 둔다.
- application result를 API response로 바꾸는 책임은 presentation에 둔다.
- 단순 매핑을 위한 범용 reflection mapper는 도입하지 않는다.

## 8. JPA, Repository와 트랜잭션

### 8.1 Repository

- domain에는 기술 독립적인 Repository 인터페이스를 두고 infrastructure가 구현한다.
- 단순 CRUD는 Spring Data JPA Repository에 위임하되 domain/application이 Spring Data 세부 타입에 불필요하게 결합하지 않게 한다.
- 조회 목적과 반환 형태가 다르면 전용 조회 메서드나 projection을 사용한다.
- `findAll()`로 전체 데이터를 읽은 뒤 애플리케이션에서 필터링하지 않는다.
- 목록 API는 데이터 증가가 가능한 경우 반드시 페이지네이션한다.

### 8.2 연관관계와 조회

- 모든 to-one 연관관계에 `fetch = LAZY`를 명시한다. 컬렉션 연관관계도 LAZY를 유지한다.
- 다대다(`@ManyToMany`)를 직접 사용하지 않고 연결 엔티티와 두 개의 다대일 관계로 표현한다.
- cascade와 orphan removal은 aggregate 생명주기가 실제로 같을 때만 사용한다.
- 핵심 조회는 fetch join, EntityGraph, projection 또는 전용 쿼리로 필요한 데이터를 명시적으로 가져온다.
- N+1은 허용하지 않는다. 쿼리 수 또는 실제 SQL을 확인하는 통합 테스트로 중요한 조회 경로를 보호한다.
- 컬렉션 fetch join과 페이지네이션을 함께 사용하지 않는다. ID 페이지 조회 후 상세 조회 등 안전한 방식을 선택한다.

### 8.3 트랜잭션

- 트랜잭션 경계는 기본적으로 public application 서비스 메서드에 둔다.
- 조회 유스케이스에는 `@Transactional(readOnly = true)`를 사용한다.
- Controller와 domain 객체에 트랜잭션 경계를 두지 않는다.
- 외부 HTTP 호출, 파일 업로드, 메시지 전송을 DB 트랜잭션 안에서 오래 수행하지 않는다. 원자성이 필요하면 outbox 등 별도 설계를 검토한다.
- 트랜잭션 전파 수준과 격리 수준은 기본값을 우선하고, 변경할 때 재현 테스트와 근거를 남긴다.
- 예외를 잡아 정상 반환하면서 트랜잭션 rollback을 무력화하지 않는다.

### 8.4 자리·정원 동시성

동아리·스터디의 지원, 승인, 정원 변경은 자리하나의 핵심 무결성 경계다.

- `현재 승인 인원 <= 정원` 불변식은 DB 트랜잭션 안에서 보장한다.
- “조회 후 남은 자리 확인 후 저장”만으로 구현하지 않는다.
- 충돌 빈도와 유스케이스에 따라 optimistic lock(`@Version`), pessimistic lock, 원자적 조건부 update 중 하나를 선택한다.
- 동일 사용자의 중복 지원·가입은 DB unique constraint로 최종 보장한다.
- 동시 요청 테스트를 추가해 정원 초과와 중복 생성이 발생하지 않음을 검증한다.
- 충돌은 일관된 도메인 오류로 변환하고, 무한 재시도하지 않는다.

## 9. 데이터베이스 컨벤션

### 9.1 이름과 타입

- 테이블과 컬럼은 영문 snake_case를 사용한다.
- 테이블명은 복수형을 사용한다. 예: `clubs`, `club_members`.
- PK는 `id`, FK는 `<참조_엔티티_단수형>_id`로 작성한다. 예: `club_id`, `member_id`.
- Java `Long` ID는 DB의 64비트 정수 타입에 매핑한다.
- boolean 컬럼은 `active`, `visible`처럼 상태명으로 작성한다.
- 모든 FK, unique, not null 제약은 애플리케이션 검증과 별개로 DB에 명시한다.
- FK와 빈번한 조회·정렬 조건에는 실행 계획을 확인하고 필요한 인덱스를 둔다.

### 9.2 시간과 감사 필드

- 저장·비교 기준 시간은 UTC로 통일한다.
- Java에서는 절대 시점에 `Instant`를 기본으로 사용한다. 날짜만 의미가 있으면 `LocalDate`를 사용한다.
- API 시각은 ISO 8601 UTC 형식으로 주고받는다.
- 공통 `BaseEntity`에는 `createdAt`, `updatedAt`만 두고 ID는 각 엔티티에 둔다.
- DB 컬럼명은 `created_at`, `updated_at`으로 통일한다.
- 테스트 가능한 시간 로직은 `Instant.now()`를 직접 흩뿌리지 않고 주입한 `Clock`을 사용한다.

### 9.3 스키마 마이그레이션

- 공유 개발·스테이징·운영 환경의 스키마는 Flyway 마이그레이션 파일을 유일한 기준으로 관리한다.
- 공유 환경에서 `ddl-auto: update`, `create`, `create-drop`을 사용하지 않는다.
- Flyway 도입 후 application의 `ddl-auto`는 `validate`를 기본으로 하여 엔티티와 스키마 불일치를 시작 시 발견한다.
- 마이그레이션 파일은 `V<version>__<description>.sql` 형식으로 작성하고 한번 공유된 versioned migration은 수정하지 않는다.
- 이미 배포된 스키마를 바꿀 때는 새 migration을 추가한다.
- 파괴적 변경은 확장-이관-축소 단계를 검토하고 롤백 또는 복구 방법을 PR에 기록한다.
- `schema.sql`, Hibernate 자동 생성, Flyway를 함께 스키마 생성 수단으로 사용하지 않는다.

### 9.4 삭제 정책

모든 테이블에 일괄적으로 soft delete를 적용하지 않는다.

- 복구, 감사, 운영 이력, 사용자 탈퇴 보존 요구가 있는 aggregate에만 soft delete를 사용한다.
- 연결 데이터, 임시 데이터처럼 생명주기가 명확하고 보존 요구가 없는 데이터는 hard delete할 수 있다.
- soft delete는 `deleted_at nullable timestamp`를 기본으로 하고, `null`이면 활성 상태로 본다.
- soft-deleted row는 일반 조회에서 항상 제외하고 관리자·복구 조회에서만 명시적으로 포함한다.
- soft delete와 unique constraint가 함께 있을 때 재가입·재생성 정책과 DB별 인덱스 전략을 먼저 설계한다.
- 개인정보 보존 기간과 삭제 요청은 soft delete와 별개다. 보존 근거가 끝난 개인정보는 익명화하거나 실제 삭제한다.

## 10. HTTP API와 문서화 컨벤션

### 10.1 문서 기준

- OpenAPI 명세를 API 계약의 기준으로 사용한다.
- Swagger UI는 OpenAPI 명세를 탐색하고 호출해보는 도구로 사용한다.
- Notion은 기획, 논의, 회의 기록에 사용할 수 있지만 필드·상태 코드·오류 응답의 최종 기준으로 사용하지 않는다.
- API 변경 PR에는 요청·응답 모델, 상태 코드, 인증 조건, 오류 응답, 예시를 함께 갱신한다.
- CI에서 애플리케이션이 생성한 OpenAPI 문서가 유효한지 검사하고, 계약 파일을 저장한다면 코드와의 drift를 검사한다.

### 10.2 URI와 HTTP 의미

- URI는 명사형 복수 자원을 사용한다. 예: `/api/v1/clubs`, `/api/v1/clubs/{clubId}/applications`.
- URI에 동사를 넣지 않는 것을 기본으로 하되, `close`, `approve`처럼 자원 상태 전이 자체가 핵심 명령이면 하위 action endpoint를 사용할 수 있다.
- 공개 API는 `/api/v1` prefix로 시작한다.
- GET은 상태를 변경하지 않고, PUT은 전체 교체, PATCH는 부분 변경에 사용한다.
- 생성 성공은 `201 Created`와 `Location` header, 본문 없는 성공은 `204 No Content`를 사용한다.
- 입력 오류는 `400`, 인증 없음은 `401`, 권한 없음은 `403`, 자원 없음은 `404`, 상태 충돌·중복은 `409`를 기본으로 한다.
- 모든 성공 응답을 공통 `data` wrapper로 감싸지 않는다. 공통 메타데이터가 실제로 필요할 때만 응답 객체를 둔다.
- 목록 API의 정렬 기본값과 페이지 크기 상한을 문서화한다.

### 10.3 요청과 응답

- 요청 DTO에 Bean Validation을 사용하고 Controller에서 `@Valid`로 검증한다.
- API 요청·응답 DTO는 domain/JPA entity와 분리한다.
- 응답 필드는 내부 구현명보다 사용자 관점의 의미를 표현한다.
- 민감 정보, 내부 식별자, 지연 로딩 proxy를 직렬화하지 않는다.
- enum을 API에 노출할 때 허용 값과 의미를 OpenAPI에 기록하고, 이름 변경을 호환성 변경으로 취급한다.

### 10.4 예외와 오류 응답

- 예외는 `@RestControllerAdvice`에서 일관된 오류 응답으로 변환한다.
- 예상 가능한 비즈니스 실패는 기능별 domain exception과 안정적인 `ErrorCode`로 표현한다.
- ErrorCode 이름은 `DOMAIN_REASON` 형식의 영문 대문자로 작성한다. 예: `CLUB_RECRUITMENT_CLOSED`.
- 외부 오류 메시지는 사용자에게 안전하고 이해 가능한 문구로 관리하며 예외의 원문이나 stack trace를 노출하지 않는다.
- HTTP 상태, 내부 오류 코드, 메시지, 요청 추적 ID를 포함한다.
- 필드 검증 오류는 선택적으로 `fieldErrors`에 필드와 사유를 제공한다.

```json
{
  "code": "CLUB_RECRUITMENT_CLOSED",
  "message": "모집이 마감된 동아리에는 지원할 수 없습니다.",
  "traceId": "01J...",
  "fieldErrors": []
}
```

- 같은 오류 코드는 같은 의미와 HTTP 상태를 유지한다.
- 예상하지 못한 예외는 서버 로그에 stack trace와 trace ID를 남기고 클라이언트에는 일반화된 `500` 응답을 보낸다.

## 11. 테스트 컨벤션

### 11.1 테스트 범위

| 종류 | 대상 | 원칙 |
| --- | --- | --- |
| 도메인 단위 테스트 | 상태 전이, 계산, 불변식 | 도메인 로직이 있으면 MUST, Spring context 없이 실행 |
| application 통합 테스트 | 트랜잭션, 여러 domain/repository 협력 | 핵심 유스케이스와 복잡한 흐름에 적용 |
| Repository 테스트 | 커스텀 쿼리, 매핑, 제약, 성능 경계 | 단순 Spring Data CRUD에는 생략 가능 |
| 인수 테스트 | 실제 HTTP 요청부터 DB까지 핵심 사용자 흐름 | 핵심 유스케이스에 RestAssured로 MUST |
| 슬라이스 테스트 | MVC 직렬화·검증·보안 등 특정 계층 | 해당 경계를 빠르게 검증할 가치가 있을 때 적용 |

- 테스트 수를 계층별 목표 비율로 맞추지 않고 위험과 변경 가능성에 비례해 작성한다.
- 핵심 유스케이스 인수 테스트에는 최소한 대표 성공 흐름과 중요한 비즈니스 실패 흐름을 포함한다.
- Controller endpoint 수를 기준으로 테스트 도입 여부를 결정하지 않는다.
- 단순 프레임워크 동작이나 getter/setter 자체는 테스트하지 않는다.
- 버그 수정은 실패를 재현하는 테스트를 먼저 추가하고 수정 후 통과시킨다.

### 11.2 대역 선택

- 외부 결제·메일·스토리지·OAuth 같은 시스템 경계는 stub 또는 fake로 대체한다.
- 고정 응답만 필요하면 stub, 상태와 여러 흐름이 필요하면 fake를 사용한다.
- 우리 코드의 내부 협력 객체를 과도하게 mock하여 구현 순서를 검증하지 않는다.
- 외부 API adapter에는 정상, timeout, 오류 응답, 잘못된 응답 변환 테스트를 둔다.

### 11.3 작성 방식

- 테스트 메서드명은 영문 camelCase로 행위를 표현한다. 예: `pastDateCannotReserve()`.
- `@DisplayName`은 같은 의미를 자연스러운 한국어 문장으로 표현한다. 예: `과거 날짜에는 예약할 수 없다`.
- 테스트 본문은 `// given`, `// when`, `// then` 순서로 구분한다. 한 단계가 없으면 억지로 빈 주석을 넣지 않는다.
- 한 테스트는 하나의 행위와 실패 원인만 검증한다.
- 구현 세부 호출 횟수보다 외부에서 관찰 가능한 결과와 상태를 검증한다.
- fixture는 테스트 의도를 가리지 않게 최소화하고, 테스트 간 공유 가변 상태를 두지 않는다.
- 현재 시간에 의존하는 테스트는 고정 `Clock`을 사용한다.

### 11.4 격리와 DB

- Spring TestContext의 context cache를 유지하기 위해 `@DirtiesContext`를 DB 정리 용도로 사용하지 않는다.
- rollback이 보장되는 통합 테스트는 테스트 트랜잭션을 사용한다.
- HTTP 인수 테스트처럼 서버 트랜잭션이 분리되는 경우 명시적 DatabaseCleaner나 검증된 SQL cleanup을 사용한다.
- FK 순서와 sequence 초기화를 포함한 하나의 공통 cleanup 전략을 사용하고 테스트마다 임의 truncate SQL을 복제하지 않는다.
- 운영 DB가 결정되기 전에는 H2를 사용할 수 있다. 운영 DB가 결정되면 DB 고유 동작이 중요한 Repository·통합·인수 테스트는 Testcontainers 등으로 같은 DB 엔진에서 검증한다.
- 테스트 실행 순서에 의존하지 않는다.

## 12. 설정, 보안과 로깅

### 12.1 설정

- 공통 기본값은 `application.yaml`, 환경별 차이는 profile 파일과 환경 변수로 관리한다.
- `local`, `test`, `dev`, `prod` profile의 목적을 명시하고 이름을 임의로 추가하지 않는다.
- 비밀번호, API key, access token, 운영 접속 정보는 저장소에 커밋하지 않는다.
- 필요한 환경 변수 이름과 로컬 대체값은 문서화하되 실제 secret은 예시에도 넣지 않는다.
- 운영에서 안전하지 않은 기본값으로 자동 fallback하지 않는다. 필수 설정이 없으면 시작에 실패하게 한다.
- 의존성 버전은 Gradle에서 중앙 관리하고 이유 없는 dynamic version을 사용하지 않는다.

### 12.2 보안

- 인증과 인가는 Controller의 사용자 입력이 아니라 검증된 보안 컨텍스트를 기준으로 한다.
- 객체 소유권과 역할 권한을 application 경계에서 검증한다.
- 클라이언트가 보낸 사용자 ID를 신뢰해 현재 사용자로 사용하지 않는다.
- 모든 입력은 길이, 형식, 허용 범위를 시스템 경계에서 검증한다.
- 비밀번호는 안전한 password encoder로 단방향 해시하고 평문으로 저장·로그·응답하지 않는다.
- 의존성 취약점과 secret 노출 검사를 CI에 추가한다.

### 12.3 로깅

- 로그는 운영자가 행동할 수 있는 이벤트와 문제 진단에 필요한 문맥을 남긴다.
- 비밀번호, token, session ID, 개인정보, 전체 요청·응답 본문을 로그에 남기지 않는다.
- `System.out`과 `printStackTrace()`를 사용하지 않고 로깅 facade를 사용한다.
- 구조화 가능한 key-value 문맥을 사용하고 요청 trace ID를 전파한다.
- 같은 예외를 여러 계층에서 반복 로깅하지 않는다. 처리 책임이 있는 경계에서 한 번 기록한다.
- 정상적인 비즈니스 거절을 error stack trace로 남기지 않는다.

## 13. 완료 조건(Definition of Done)

코드 변경은 다음 조건을 모두 만족할 때 완료다.

- 요구사항과 인수 조건을 충족한다.
- 변경 파일의 컴파일·정적 검사 오류가 없다.
- 관련 테스트와 전체 빌드가 통과한다.
- 실제 사용 표면에서 동작을 확인했다. API는 실행 중인 애플리케이션에 실제 HTTP 요청을 보낸다.
- 새 동작과 회귀 위험을 보호하는 적정 테스트가 있다.
- API 명세, DB migration, 설정 예시, 운영 문서가 코드와 일치한다.
- 로그와 diff에 secret·개인정보·임시 디버그 코드가 없다.
- N+1, 무제한 조회, 장시간 트랜잭션, 경쟁 상태 영향을 확인했다.
- PR 리뷰가 완료되고 미해결 대화가 없다.

## 14. 하네스 엔지니어링 분리 기준

이 문서를 여러 Markdown·설정 파일로 분리할 때 다음 구조를 권장한다. 각 규칙은 한 파일에만 원문을 두고 다른 문서에서는 링크한다.

```text
AGENTS.md
docs/
├── architecture.md
├── conventions/
│   ├── git.md
│   ├── java.md
│   ├── api.md
│   ├── database.md
│   └── testing.md
├── adr/
│   └── README.md
└── runbook/
    ├── local-development.md
    └── release.md
.github/
├── PULL_REQUEST_TEMPLATE.md
└── ISSUE_TEMPLATE/
```

### 14.1 `AGENTS.md`에 남길 내용

- 프로젝트 목적과 기준 스택
- 필수 의존 방향과 금지 규칙
- 빌드·테스트·실행 명령
- 변경 종류별 필수 검증 명령
- Manual QA 방법
- 완료 조건
- 상세 컨벤션 문서 링크

### 14.2 자동화 우선순위

| 우선순위 | 규칙 | 권장 강제 수단 | 현재 상태 |
| --- | --- | --- | --- |
| P0 | 컴파일·전체 테스트 | Gradle CI | 미구성 |
| P0 | `main`/`develop` 직접 push 방지 | GitHub branch protection | 확인 필요 |
| P0 | secret 커밋 방지 | secret scan + PR check | 미구성 |
| P0 | migration 검증 | Flyway + 실제 DB 통합 테스트 | 미구성 |
| P1 | 포맷·wildcard import | Spotless 또는 Checkstyle | 미구성 |
| P1 | 패키지 의존 방향 | ArchUnit test | 미구성 |
| P1 | OpenAPI 유효성·drift | OpenAPI lint/contract check | 미구성 |
| P1 | 테스트·빌드 없는 병합 방지 | required status checks | 미구성 |
| P2 | 커밋·PR 제목 형식 | commit/PR lint | 미구성 |
| P2 | 의존성 취약점 | dependency scan | 미구성 |

### 14.3 사람의 판단으로 남길 규칙

- 이름이 도메인 의도를 충분히 드러내는가
- 추상화와 공통화가 현재 문제에 필요한가
- 트랜잭션 경계가 유스케이스에 적절한가
- 테스트가 구현이 아니라 위험을 검증하는가
- soft delete, 잠금, cascade 선택의 근거가 타당한가
- PR 범위가 하나의 목표에 집중되어 있는가

## 15. 참고 기준

- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [OpenAPI Specification](https://spec.openapis.org/oas/)
- [Spring Boot Database Initialization](https://docs.spring.io/spring-boot/how-to/data-initialization.html)
- [Spring Data JPA Locking](https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html)
- [Spring Framework TestContext Caching](https://docs.spring.io/spring-framework/reference/testing/testcontext-framework/ctx-management/caching.html)
