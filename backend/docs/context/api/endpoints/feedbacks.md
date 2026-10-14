# 피드백

피드백은 가입을 완료한 로그인 회원만 작성할 수 있다. `memberId`는 요청 본문으로 받지 않고,
서버가 인증 정보에서 작성 회원을 확인해 저장한다.

## 피드백 생성

| 항목 | 계약 |
| --- | --- |
| Method | `POST` |
| Endpoint | `/api/feedbacks` |
| 권한 | `MEMBER` |
| Request | `{ "content": "..." }` |
| 성공 | `201 Created`, `{ "success": true, "data": { "id": 1 }, "error": null }` |
| 검증 | `content`는 필수 String이며 공백이 아니고 1,000자 이하. 앞뒤 공백을 제거하지 않고 저장한다. |
| 저장 | `feedback.content`, `feedback.member_id` (필수 인증 회원 ID) |
| 오류 | `UNAUTHENTICATED` (401), `INVALID_PARAMETER` (400), `MEMBER_NOT_FOUND` (404), 공통 CSRF 실패의 `ACCESS_DENIED` (403) |

응답의 `id`는 Long 타입이며 `Location` 헤더는 반환하지 않는다. 인증 쿠키와 변경 요청의 CSRF
요구 사항은 [API 공통 계약](../common-contract.md)을 따른다.

피드백은 현재 내용과 필수 작성 회원만 저장한다. 유형, 상태, 답변과 조회 API는 제공하지 않는다.
