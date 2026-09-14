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
