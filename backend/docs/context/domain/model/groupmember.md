# GroupMember

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 그룹 소속 식별자 |
| `groupId` | Long | NOT NULL, FK | 소속 그룹 |
| `memberId` | Long | NOT NULL, FK | 소속 회원 |
| `role` | Enum | NOT NULL | `LEADER`, `MEMBER` |
| `joinedAt` | LocalDateTime | NOT NULL | 그룹 가입 시각 |

## 모델 관계

- `Registration`은 신청 사건 이력이고 `GroupMember`는 실제 소속 상태이므로 분리한다.
- 추후 그룹 내 게시판 같은 기능이 생긴다면 `GroupPost`는 `GroupMember`가 아닌 `Member`를 참조한다.
