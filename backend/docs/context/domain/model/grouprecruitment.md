# GroupRecruitment

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 모집 공고 식별자 |
| `groupId` | Long | NOT NULL, FK | 모집을 진행하는 그룹 |
| `joinMethod` | Enum | NOT NULL | `AUTO`, `APPROVAL` |
| `capacity` | Integer | NOT NULL, 1 이상 | 이 모집 공고에서 모집할 인원의 제한 |
| `startsAt` | LocalDateTime | NOT NULL | 모집 시작 시각 |
| `endsAt` | LocalDateTime | nullable | 모집 종료 시각. `null`이면 상시 모집 |
| `createdAt` | LocalDateTime | NOT NULL | 공고 생성 시각 |
| `updatedAt` | LocalDateTime | NOT NULL | 최종 수정 시각 |

## 모집 공고 모델 규칙
- `RecruitmentStatus` 필드를 저장하지 않는다. 모집 예정·모집 중·마감·상시 모집 여부는 기간으로 계산한다.
- 기간 불변식은 `startsAt <= endsAt`이다. 즉시 마감 시 두 값이 같을 수 있다.
