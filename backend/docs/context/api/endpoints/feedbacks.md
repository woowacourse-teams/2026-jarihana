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
| 검증 | `content`는 공백이 아니며 1,000자 이하 |
| 저장 | `feedback.content`, `feedback.member_id` (필수 인증 회원 ID) |
| 오류 | `UNAUTHENTICATED` (401), `INVALID_PARAMETER` (400), `MEMBER_NOT_FOUND` (404) |

피드백은 현재 내용과 필수 작성 회원만 저장한다. 유형, 상태, 답변과 조회 API는 제공하지 않는다.
