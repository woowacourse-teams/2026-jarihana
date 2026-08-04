# 코드 컨벤션

> 이 문서는 구속력 있는 팀 컨벤션 모듈이다.
> 인덱스: [team-convention.md](../team-convention.md)

## 도메인 객체와 엔티티

도메인 객체와 JPA 엔티티를 분리하지 않고 하나로 사용한다.

선택 이유:

- 현재 프로젝트는 JPA를 사용한다.
- 엔티티의 상태 전이와 객체 간 관계를 중심으로 비즈니스 로직을 구현한다.
- 가까운 미래에 영속성 기술을 교체할 가능성이 낮다.
- 분리로 생기는 매핑과 구현 계층의 비용이 현재 기대 이익보다 크다.

JPA 매핑 어노테이션과 `createdAt`, `updatedAt`이 도메인 객체에 포함되는 것을
허용한다. 그 대신 도메인 규칙을 엔티티 내부에 응집하고 엔티티를 애플리케이션
코드에서 불변으로 다룬다.

## 불변 엔티티와 상태 전이

- 엔티티에 setter나 기존 인스턴스의 필드를 변경하는 메서드를 두지 않는다.
- 상태 전이 메서드는 기존 엔티티를 변경하지 않고 변경 결과를 담은 새 엔티티를 반환한다.
- 값 객체도 불변으로 만들고 변경 시 새 객체를 반환한다.
- JPA 구현상 필드를 `final`로 선언하기 어렵더라도 생성자와 상태 전이 경로를
  통제해 외부에서 상태를 변경할 수 없는 실질적 불변 구조를 유지한다.
- Repository 구현은 상태 전이로 생성된 엔티티를 저장하는 책임을 가진다.

```java
public Club modifyDescription(String description) {
    return new Club(id, name, validateDescription(description));
}
```

## 객체 생성

도메인 객체와 엔티티는 외부에서 `new`로 생성하지 않고 정적 팩터리 메서드로만
생성한다. JPA가 요구하는 기본 생성자는 `protected`로 제한하고, 도메인 생성에
사용하는 생성자는 외부에 공개하지 않는다.

가능하면 Lombok의 `@NoArgsConstructor(access = AccessLevel.PROTECTED)`를
사용한다. Lombok 적용이 어렵거나 명시적 생성자가 더 읽기 쉬운 예외 상황에서만
`protected` 기본 생성자를 직접 작성한다.

```java
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Club {
    private String name;

    private Club(String name) {
        this.name = validateName(name);
    }

    public static Club create(String name) {
        return new Club(name);
    }
}
```

권장 이름:

- `of`: 주어진 값을 조합해 직접 생성
- `from`: 다른 타입이나 표현에서 변환
- `create`: 기본값 적용 등 생성 절차에 별도 의미가 있는 신규 생성

정적 팩터리 메서드를 강제하는 주된 이유는 생성 경로를 통제하고 생성 의도, 검증,
불변식을 한곳에 모으기 위함이다. 부 생성자에서 `this(...)`를 호출하기 전에
인스턴스 메서드를 사용할 수 없다는 점은 주된 근거로 삼지 않는다. 정적 검증
메서드를 생성자 인자로 전달하거나 주 생성자에서 검증할 수 있기 때문이다.

## 메서드 이름

- `find...`: 결과가 없을 수 있는 조회. `Optional` 등으로 부재를 표현한다.
- `get...`: 결과가 반드시 있어야 하는 조회. 없으면 명시적인 예외를 발생시킨다.
- `exists...`: 존재 여부를 `boolean`으로 반환한다. `exist...`는 사용하지 않는다.
- Repository 기본 동사는 `save`, `find`/`get`, `remove`를 사용한다.
- Service 메서드는 Repository의 CRUD 이름을 그대로 복사하지 않고 유스케이스를
  표현한다. 예: `modifyUserInfo()`
- Controller 메서드명은 동사를 먼저 쓰고 그 뒤에 도메인명을 조합한다. 예:
  `createClub`, `findClubs`, `modifyClub`, `removeClub`

```java
Optional<Club> findById(Long id);
Club getById(Long id);
boolean existsByName(String name);
```

## DTO와 외부 응답 경계

- Controller 요청 DTO는 `*Request`, 응답 DTO는 `*Response`로 이름을 끝낸다.
- Service가 파라미터로 받는 DTO는 `*Command`, 반환하는 DTO는 `*Result`로 이름을 끝낸다.
- 위 접미사 규칙은 DTO를 사용할 때 적용한다. `void`, 기본 타입, 값 객체 또는
  도메인 객체를 접미사를 맞추기 위해 불필요하게 DTO로 감싸지 않는다.
- 단순히 계층이 다르다는 이유로 DTO를 기계적으로 분리하지 않는다. 역할이나 변경
  이유가 다를 때 분리한다.
- Service는 항상 DTO를 반환할 필요가 없다. 상황에 따라 `void`, 기본 타입,
  값 객체, 도메인 객체 또는 전용 결과 DTO를 반환할 수 있다.
- 도메인 객체 하나만 반환하면 불필요한 DTO로 감싸지 않는다.
- 여러 값을 함께 반환해야 하면 서비스 결과 DTO를 사용한다.
- 서비스 결과 DTO에는 필요한 경우 도메인 객체를 포함할 수 있다.

도메인 객체 포함을 허용하는 이유:

- 모든 값을 기본 타입으로 변환하는 보일러플레이트를 줄인다.
- 다른 서비스에서 같은 도메인 객체를 다시 조회하는 비용을 줄인다.
- 값을 분해하고 다시 도메인 객체로 조립하는 과정을 줄인다.
- 도메인의 행위와 의미를 유지한 채 서비스가 협력할 수 있다.

다음 위험은 감수하되 코드 리뷰에서 확인한다.

- 서비스 간 결합도 증가
- 서비스와 도메인의 책임 경계 약화
- JPA 지연 로딩, 변경 감지, 트랜잭션 범위 문제

서비스 DTO는 비즈니스 레이어 내부에서만 사용한다. 엔티티, 도메인 객체 또는 서비스
DTO를 API 응답으로 직접 노출하지 않고, 컨트롤러에서 `*Response` DTO로
변환한다. 변환 과정에서 의도치 않은 지연 로딩이 발생하지 않도록 서비스에서 응답에
필요한 데이터를 명시적으로 조회한다. DTO는 `record`를 기본으로 하며 프레임워크
제약 등 명확한 이유가 있을 때만 `class`를 사용한다.

## 일반 스타일

- `switch` 문은 enum 분기에만 사용한다.
- 여는 중괄호는 선언이나 제어문과 같은 줄에 둔다.
- guard clause와 early return으로 예외 조건을 먼저 처리한다.
- 불필요한 `else`와 깊은 중첩을 줄여 정상 흐름이 드러나게 작성한다.
- 컬렉션은 방어적으로 복사한다.
- 비즈니스 규칙이 있는 컬렉션은 일급 컬렉션으로 구현한다.
- 와일드카드 import를 사용하지 않는다. 예: `import java.util.*;`
- 로그에는 비밀번호, 토큰, 개인정보, 전체 요청·응답 본문을 남기지 않는다.
- 예외 추적과 운영상 의미 있는 이벤트만 기록한다.
