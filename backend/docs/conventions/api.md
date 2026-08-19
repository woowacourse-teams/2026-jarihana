# API 문서화 컨벤션

> 이 문서는 구속력 있는 팀 컨벤션 모듈이다.
> 인덱스: [team-convention.md](../team-convention.md)

## 기준 문서

Swagger/OpenAPI를 API 계약의 기준 문서로 사용한다.

- Swagger/OpenAPI: 엔드포인트, 요청·응답 스키마, 상태 코드, 오류 코드
- Notion: 정책, 사용자 흐름, 기획 배경, 논의 과정

API가 변경되면 Swagger/OpenAPI 문서와 RestAssured 인수 테스트를 같은 PR에서
수정한다. 서로 내용이 다르면 실행 가능한 API와 인수 테스트를 기준으로 불일치를
해소하고 문서를 즉시 갱신한다.

## Controller 반환 타입

모든 `@RestController`의 HTTP 핸들러 메서드는 `ResponseEntity`로 반환값을 감싼다.

- 본문이 있는 성공 응답은 `ResponseEntity<ApiResponse<T>>`를 사용한다.
- 서비스는 HTTP 상태 코드나 `ResponseEntity`를 알지 못하고, 서비스 결과 DTO만 반환한다.
- 컨트롤러가 성공 상태 코드를 명시적으로 결정한다. 기본 조회는
  `ResponseEntity.ok(...)`를 사용한다.
- 생성·조회·상태 변경처럼 상태 코드가 기본값과 다르면
  `ResponseEntity.status(...).body(...)`로 감싼다.
- 본문이 없는 `204 No Content` 응답은 `ResponseEntity<Void>`를 사용한다.
- 예외 처리기의 HTTP 응답도 `ResponseEntity<ApiResponse<Void>>`로 반환한다.

```java
@GetMapping
public ResponseEntity<ApiResponse<GroupResponse>> findGroup() {
    GroupResult result = groupService.findGroup();
    return ResponseEntity.ok(ApiResponse.success(GroupResponse.from(result)));
}
```

컨트롤러에서 `ApiResponse<T>`, 서비스 DTO 또는 도메인 객체를 직접 반환하지 않는다.
이 규칙으로 HTTP 상태 코드 결정과 응답 봉투 변환의 책임을 표현 계층에 고정한다.

## Controller 요청 파라미터 바인딩

조회 API의 Query Parameter는 Controller 메서드에 하나씩 나열하지 않고 계층별
`controller/dto`의 Request DTO로 묶어 `@ModelAttribute`로 바인딩한다.

```java
@GetMapping
public ResponseEntity<ApiResponse<GroupListResponse>> findGroups(
        @Validated @ModelAttribute GroupListRequest request
) {
    // ...
}
```

- enum, `Boolean`, `Integer` 등 요청 DTO 필드는 가능한 경우 실제 타입으로 선언한다.
- `@Validated`와 Bean Validation으로 범위·필수 여부를 검증한다.
- 생략 가능한 Query Parameter의 기본값은 Request DTO에서 적용하고, Service에는
  변환이 끝난 `*Query` DTO를 전달한다.
- enum·boolean·숫자 변환 실패와 Bean Validation 실패는 Controller가 직접 처리하지
  않고 `GlobalExceptionHandler`에서 `INVALID_PARAMETER` 하나로 통일한다.
- 필드별 상세 오류 메시지는 현재 제공하지 않는다. 외부 응답은 공통 `code`와
  `message` 형식을 유지한다.

## 공통 오류 응답

오류 코드는 `com.project.jarihana.exception.ErrorCode` enum에서 관리한다.

- 새로운 API 오류를 추가할 때 enum에 고정된 코드와 HTTP 상태 코드를 등록한다.
- 외부 메시지는 오류가 발생하는 지점에서 순수 문자열로 전달한다. 도메인·서비스는
  오류 코드 문자열을 직접 만들지 않고 다음 형식으로 `JarihanaException`을 발생시킨다.

```java
throw JarihanaException.of(
        ErrorCode.INVALID_PARAMETER,
        "요청 파라미터가 올바르지 않습니다."
);
```

- `GlobalExceptionHandler`가 예외를 다음 공통 봉투로 변환한다.

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "INVALID_PARAMETER",
    "message": "요청 파라미터가 올바르지 않습니다."
  }
}
```

오류 응답의 HTTP 상태 코드와 JSON 본문은 서로 다른 계약이다.

- 외부 JSON의 `error` 객체에는 `code`와 `message`만 포함한다. `httpStatus`를
  JSON 필드로 추가하거나 `ErrorCode` enum 자체를 응답으로 직렬화하지 않는다.
- `ErrorCode.httpStatus`는 서버 내부의 HTTP 매핑 메타데이터다. 예외의 메시지는
  `JarihanaException.of(...)`로 전달된 문자열을 사용한다. 응답 변환 시
  `GlobalExceptionHandler`가 이를 읽어 `ResponseEntity.status(...)`로 HTTP 상태를
  설정한다.
- 따라서 클라이언트는 HTTP 상태 코드로 전송 수준을 판단하고, 세부 분기는
  `error.code`를 기준으로 한다. 오류 메시지는 표시 가능한 외부 메시지로 관리한다.

```text
ErrorCode(code, httpStatus) + JarihanaException.of(errorCode, message)
    -> GlobalExceptionHandler
    -> HTTP status + ApiResponse.error(code, message)
```

기능 패키지별 예외 처리기와 오류 코드 문자열 상수는 만들지 않는다. 기능별 특수한
오류가 필요하면 `ErrorCode`에 항목을 추가하고 전역 처리 흐름을 사용한다.
