# Registration

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 신청 식별자 |
| `version` | Long | NOT NULL, 영속화 전 null | 승인·미승인·확인 처리 사이의 낙관적 잠금 버전 |
| `recruitmentId` | Long | NOT NULL, FK | 신청 대상 모집 공고 |
| `memberId` | Long | NOT NULL, FK | 신청한 `Member` |
| `message` | String | nullable, 최대 1000자 | 신청 메시지 |
| `status` | Enum | NOT NULL | `PENDING`, `APPROVED`, `REJECTED` |
| `approvalOrigin` | Enum | NOT NULL | `RECRUITMENT` 또는 `INVITATION` |
| `rejectReason` | String | nullable, 최대 1000자 | 미승인 사유 |
| `registeredAt` | LocalDateTime | NOT NULL | 신청 시각 |
| `decidedAt` | LocalDateTime | nullable | 승인 또는 미승인 시각 |
| `decidedBy` | DecisionActor | `PENDING`이면 nullable, 결정 후 NOT NULL | 수동 결정은 `MEMBER(memberId)`, 자동 미승인은 `SYSTEM` |
| `leaderViewedAt` | LocalDateTime | nullable | 현재 모임장이 신청 관리 목록에서 신청을 처음 확인한 시각. `null`이면 미확인 |

## 모델 규칙

- 상태 전이로 만든 새 인스턴스는 읽은 버전을 보존한다. 일반 승인과 초대 승인이 같은 신청을 변경하면 버전 충돌로 오래된 변경을 롤백한다. 동시성 선택은 [백엔드 ADR 0019](../../../adr/0019-optimistic-invitation-acceptance.md)를 따른다.
- 기존 데이터와 일반 신청 경로의 approvalOrigin은 RECRUITMENT다. 초대로 기존 PENDING을 승인하면 APPROVED·SYSTEM·INVITATION으로 기록하고 leaderViewedAt을 유지한다.
- 초대 합류에 기존 신청이 없으면 Registration을 만들지 않는다. 선택 이유는 [ADR 0017](../../../adr/0017-separate-invitation-acceptance-history.md)을 따른다. 초대 수락 서비스가 같은 그룹/회원의 모든 PENDING을 초대 출처의 시스템 승인으로 변경하며 마감된 공고도 포함한다. 일반 승인 사건을 발행하지 않고 기존 확인 시각과 결정된 이력을 보존한다.
- 모집 정원 집계는 APPROVED·RECRUITMENT만 센다. 신청 목록의 APPROVED 필터와 상태별 이력 개수는 출처와 관계없이 승인된 기존 신청을 모두 포함한다.
- 신청 확인 여부는 신청 상태와 독립적으로 관리한다.
- `AUTO`의 즉시 승인 신청과 `APPROVAL`의 대기 신청 모두 생성 시 `leaderViewedAt`이 `null`이다.
- 승인·미승인 상태 전이는 기존 `leaderViewedAt`을 유지한다.
- 신청 관리 목록을 실제로 불러온 뒤에만 현재 모집에서 확인한 마지막 신청 ID까지 동일한 확인 시각을 기록한다.
