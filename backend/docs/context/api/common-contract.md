# API 공통 설계

> 상태: 저장소 최신 설계 기준
>
> 구현·테스트·Swagger/OpenAPI와 충돌하면 임의로 해석하지 않고 차이를 보고한다.

저장소의 구속력 있는 API 문서화 규칙은 [API 문서화 컨벤션](../../conventions/api.md)을 따른다. 이 문서는 저장소에 정리된 최신 API 설계 의도를 전달하며, 실행 가능한 계약은 Swagger/OpenAPI와 인수 테스트로 검증한다.

## Base Path

```plain text
/api
```

URL에 버전 경로를 붙이지 않는다.

## 인증과 권한

| 권한 | 의미 | 자격 증명 |
| --- | --- | --- |
| `PUBLIC` | 누구나 접근 가능 | 없음 |
| `AUTH` | GitHub 인증 완료, 회원 가입 전후 | 가입 세션 또는 Access Token |
| `MEMBER` | 가입 완료 회원 | Access Token |
| `LEADER` | 해당 그룹의 현재 모임장 | Access Token + `GroupMemberRole.LEADER` |

- 신규 가입 구간은 서버 세션을 사용한다.
- 일반 API는 `Authorization: Bearer {accessToken}` 헤더를 사용한다.
- `LEADER` 권한은 요청 대상 그룹의 현재 `LEADER`인지 매 요청마다 검증한다.

## 페이지네이션
모든 목록 API는 무한 스크롤용 커서 방식을 사용한다.

| 구분 | 필드 | 규칙 |
| --- | --- | --- |
| 요청 | `cursor` | 첫 요청은 생략, 이후 응답의 `nextCursor` 사용 |
| 요청 | `size` | 기본 20, 최소 1, 최대 100 |
| 응답 | `items`, `nextCursor`, `hasNext` | 마지막 페이지는 `nextCursor = null`, `hasNext = false` |

기본 정렬은 `createdAt DESC, id DESC`이며, 커서는 정렬 기준 값을 불투명 문자열로 인코딩한다.
잘못되거나 만료된 `cursor`와 허용 범위를 벗어난 `size`는 `INVALID_PARAMETER`로 응답한다.

## 응답 형식
`204 No Content`를 제외한 성공과 실패 응답은 동일한 봉투를 사용한다.

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "GROUP_NOT_FOUND",
    "message": "그룹을 찾을 수 없습니다."
  }
}
```

- 클라이언트는 `error.code`로 분기한다.
- 필드 검증 오류는 `INVALID_PARAMETER`와 사용자용 한국어 메시지로 응답하며, 필드별 상세 오류는 제공하지 않는다.
- 생성은 `201 Created`, 조회·상태 변경은 `200 OK`, 본문 없는 삭제·탈퇴는 `204 No Content`를 사용한다.

## 날짜·시간 형식
- 기준 시간대: `Asia/Seoul`
- 날짜: `YYYY-MM-DD` (예: `2026-08-13`)
- 날짜·시간: `YYYY-MM-DDTHH:mm:ss` (예: `2026-08-13T19:00:00`)
- 시각: `HH:mm:ss` (예: `19:00:00`)

## 공통 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 요청 형식·필드 검증 실패 | `INVALID_PARAMETER` | 400 |
| 인증 정보 없음·만료 | `UNAUTHENTICATED` | 401 |
| 권한 부족 | `ACCESS_DENIED` | 403 |
| 리소스 없음 | `*_NOT_FOUND` | 404 |
| 현재 상태와 요청 충돌 | `*_CONFLICT` | 409 |
