# Feedback

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 피드백 식별자 |
| `content` | String | NOT NULL, 공백 불가, 최대 1,000자 | 작성한 피드백 |
| `member` | Member | NULL 허용, `member_id` FK | 인증된 작성 회원. 비회원 피드백은 `null` |
| `createdAt` | LocalDateTime | NOT NULL, `BaseEntity` | 작성 시각 |
| `updatedAt` | LocalDateTime | NOT NULL, `BaseEntity` | 수정 시각 |

현재 피드백 기능은 생성만 제공한다. 분류, 처리 상태, 답변과 별도 수정·삭제 정책은 두지 않는다.
