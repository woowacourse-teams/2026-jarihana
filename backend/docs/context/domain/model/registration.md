# Registration

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 신청 식별자 |
| `recruitmentId` | Long | NOT NULL, FK | 신청 대상 모집 공고 |
| `memberId` | Long | NOT NULL, FK | 신청한 `Member` |
| `message` | String | nullable, 최대 1000자 | 신청 메시지 |
| `status` | Enum | NOT NULL | `PENDING`, `APPROVED`, `REJECTED` |
| `rejectReason` | String | nullable, 최대 1000자 | 거절 사유 |
| `registeredAt` | LocalDateTime | NOT NULL | 신청 시각 |
| `decidedAt` | LocalDateTime | nullable | 승인 또는 거절 시각 |
| `decidedBy` | DecisionActor | `PENDING`이면 nullable, 결정 후 NOT NULL | 수동 결정은 `MEMBER(memberId)`, 자동 거절은 `SYSTEM` |
| `leaderViewedAt` | LocalDateTime | nullable | 현재 모임장이 신청 관리 목록에서 신청을 처음 확인한 시각. `null`이면 미확인 |

## 모델 규칙

- 신청 확인 여부는 신청 상태와 독립적으로 관리한다.
- `AUTO`의 즉시 승인 신청과 `APPROVAL`의 대기 신청 모두 생성 시 `leaderViewedAt`이 `null`이다.
- 승인·거절 상태 전이는 기존 `leaderViewedAt`을 유지한다.
- 신청 관리 목록을 실제로 불러온 뒤에만 현재 모집에서 확인한 마지막 신청 ID까지 동일한 확인 시각을 기록한다.
