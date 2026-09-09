# Group

| 필드 | 타입 | 제약 | 설명 |
| --- | --- | --- | --- |
| `id` | Long | PK | 그룹 식별자 |
| `type` | Enum | NOT NULL | `CLUB`, `STUDY`, `SESSION` |
| `meetingType` | Enum (`MeetingType`) | NOT NULL | 모임 진행 방식. `ONLINE`, `OFFLINE`, `FLEXIBLE` |
| `location` | String | nullable, 최대 255자 | 오프라인 모임 장소 또는 온라인 접속 정보 |
| `recurringSchedule` | RecurringGroupSchedule | `CLUB`, `STUDY` 전용, nullable | 매주 반복되는 고정 활동 요일·시간. 값이 없으면 유동적 일정 |
| `sessionSchedule` | SessionGroupSchedule | `SESSION`일 때 필수, 그 외 `null` | 한 번만 진행되는 세션의 활동 날짜·시간 |
| `name` | String | NOT NULL, UNIQUE, 1–50자 | 그룹 이름 |
| `introduction` | String | NOT NULL, 1–100자 | 카드에 표시하는 한 줄 소개 |
| `description` | String | nullable, 최대 10000자 | 상세 소개 |
| `representativeImageKey` | String | nullable | 이미지 URL이 아닌 스토리지 키 |
| `status` | Enum (`GroupStatus`) | NOT NULL, 기본값 `ACTIVE` | 그룹의 활동 상태. `ACTIVE`는 활동 중인 모임, `ENDED`는 종료된 모임 |
| `createdAt` | LocalDateTime | NOT NULL | 그룹 생성 시각 |
| `updatedAt` | LocalDateTime | NOT NULL | 최종 수정 시각 |

## 모델 경계

- 그룹 전체 인원에는 제한을 두지 않는다. 모집할 인원 제한은 `GroupRecruitment`가 소유한다.

## GroupType

```javascript
CLUB     친목·취미 중심 동아리
STUDY    학습 중심 스터디
SESSION  한 번 진행하는 일회성 모임
```

## MeetingType

```javascript
ONLINE   온라인으로 진행하는 모임
OFFLINE  오프라인으로 진행하는 모임
FLEXIBLE 고정된 온라인·오프라인 방식 없이 유동적으로 정하는 모임
```

`type`은 그룹 종류를, `meetingType`은 모임 진행 방식을 표현한다. 두 값은 서로 다른 의미를 가지며 `meetingType`이 `ONLINE`인 경우에도 `location`에는 접속 정보 등을 저장할 수 있다.

## GroupStatus

```javascript
ACTIVE   활동 중인 모임
ENDED    종료된 모임
```

## 역할 모델

- 모임장은 `Group.leaderId`로 중복 저장하지 않고 `GroupMember.role = LEADER`로 표현한다.

## 일정 연결 규칙

- `CLUB`, `STUDY`는 `recurringSchedule`만 사용할 수 있고 `sessionSchedule`은 반드시 `null`이어야 한다.
- `CLUB`, `STUDY`의 `recurringSchedule`이 없으면 활동 요일과 시간이 고정되지 않은 유동적 일정으로 해석한다.
- `SESSION`은 `sessionSchedule`을 반드시 가져야 하고 `recurringSchedule`은 반드시 `null`이어야 한다.
- `recurringSchedule`과 `sessionSchedule`은 동시에 존재할 수 없다.
