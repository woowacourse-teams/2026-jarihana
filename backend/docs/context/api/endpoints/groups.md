# 그룹

## 공통 규칙

그룹 목록·상세 조회는 대표 이미지 키가 없거나 기본 이미지 키인 경우
`images/default-group.png`를 반환한다. 업로드된 이미지 키가 연결된 경우에는
설정된 공개 이미지 Base URL과 스토리지 키를 조합한 URL을 반환한다.
공개 Base URL이 비어 있으면 업로드 이미지의 스토리지 키를 그대로 반환한다.

목록·상세의 `activeRecruitment.approvedCount`는 해당 공고의 모집으로 가입한 인원(APPROVED·RECRUITMENT)이다.
초대 출처 승인은 제외한다. `memberCount`는 실제 GroupMember 수이며 모임장과 초대 합류자도 포함한다.
`recruiting=true`는 기간상 열린 공고의 모집으로 가입한 인원이 정원보다 적은 그룹을,
`recruiting=false`는 그런 공고가 없는 그룹을 조회한다.
목록·상세의 `activeRecruitment`는 `startsAt <= now`이고 `endsAt`이 없거나
`now < endsAt`인 공고 중 ID가 가장 큰 공고다. 모집 예정·마감 공고는 포함하지 않으며,
해당 공고가 없으면 `null`이다. 정원 조건은 `recruiting` 필터에만 추가로 적용한다.
모임장 정보의 `generation`은 `COACH`이면 `null`이며, 모임장 소속을 찾지 못하면 `leader`는 `null`이다.
그룹 상세의 `description`, `location`과 모집의 `endsAt`도 nullable이다.
그룹 생성·기본 정보 교체·삭제·종료·기존 일정 변경은 인증된 ID의 회원이 없으면
`MEMBER_NOT_FOUND` (`404`)로 응답한다.

### `GET /api/groups`

- 설명: 그룹 목록 조회 — 관계·상태·유형 필터 지원
- 권한: `PUBLIC`

#### 엔드포인트 규칙
- `relation`, `role` 필터는 현재 로그인한 회원을 기준으로 하므로 인증이 필요하다.
#### Query Parameters

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `status` | GroupStatus | X | `ACTIVE`, `ENDED`. 생략 시 `ACTIVE` |
| `relation` | String | X | `joined`: 현재 사용자의 GroupMember가 존재하는 그룹만. 사용 시 MEMBER 권한 필요 |
| `role` | GroupMemberRole | X | `LEADER`, `MEMBER`. `relation=joined`일 때만 허용 |
| `type` | GroupType | X | `CLUB`, `STUDY`, `SESSION` |
| `excludedType` | GroupType | X | 제외할 그룹 유형. `CLUB`, `STUDY`, `SESSION` |
| `sessionDate` | LocalDate | X | `YYYY-MM-DD`. SESSION의 일회성 일정 날짜 |
| `recruiting` | Boolean | X | `true`이면 기간상 열려 있고 모집 정원이 남은 공고가 있는 그룹만, `false`이면 그런 공고가 없는 그룹만 |
| `keyword` | String | X | 이름·한 줄 소개 대소문자 구분 없는 부분 일치. 빈 값·공백만 있는 값은 필터 생략 |
| `cursor` | String | X | 다음 페이지 커서 |
| `size` | Integer | X | 기본 20, 최소 1, 최대 100 |

목록은 `createdAt DESC, id DESC`로 정렬한다. 빈 값·공백만 있는 `cursor`는 첫 페이지로 처리한다.
커서는 날짜·정수 ID 형식만 검증하며 현재 회원·조회 필터와 결합하지 않는다.

##### 관계 필터 예시
- 내 소속 그룹: `GET /api/groups?relation=joined`
- 내가 모임장인 그룹: `GET /api/groups?relation=joined&role=LEADER`
- 내 종료 그룹: `GET /api/groups?status=ENDED&relation=joined`
- 오늘의 같이해요: `GET /api/groups?type=SESSION&sessionDate=2026-08-19`
- 스터디·동아리 탐색: `GET /api/groups?excludedType=SESSION`
- `owned`는 사용하지 않는다. 모임장은 소유자가 아니라 `GroupMember.role`이다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 12,
      "type": "STUDY",
      "status": "ACTIVE",
      "name": "알고리즘 스터디",
      "introduction": "매주 함께 문제를 풉니다.",
      "location": "서울 캠퍼스",
      "representativeImageUrl": "images/default-group.png",
      "recurringSchedule": {
        "daysOfWeek": ["MONDAY", "WEDNESDAY"],
        "startTime": "19:00:00",
        "endTime": "21:00:00"
      },
      "sessionSchedule": null,
      "leader": {"memberId": 3, "crewName": "크루A", "generation": 8, "memberType": "CREW", "avatarUrl": "https://avatars.githubusercontent.com/u/3"},
      "memberCount": 6,
      "activeRecruitment": {
        "id": 45,
        "joinMethod": "APPROVAL",
        "capacity": 8,
        "approvedCount": 5,
        "startsAt": "2026-08-13T00:00:00",
        "endsAt": "2026-08-31T23:59:59"
      }
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

목록의 일정 필드는 상세와 같은 형태다. 유동적 `CLUB`·`STUDY`는 두 일정이 모두
`null`이고, `SESSION`은 `sessionSchedule`만 반환한다. `location`도 `null`일 수 있다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| relation 사용 시 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| relation 없이 role 사용 | `INVALID_PARAMETER` | 400 |
| 정의되지 않은 필터 값 | `INVALID_PARAMETER` | 400 |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |

### `POST /api/groups`

- 설명: 그룹 개설
- 권한: `MEMBER`

#### 엔드포인트 규칙
- `meetingType`은 필수이며 `ONLINE`, `OFFLINE`, `FLEXIBLE` 중 하나를 사용한다. `FLEXIBLE`은 고정된 온라인·오프라인 방식 없이 유동적으로 정하는 경우다.
- `meetingType`은 생성·수정 요청과 그룹 상세 응답에서 항상 포함한다.
- `location`은 최대 255자의 nullable 문자열이다. 오프라인 장소 또는 온라인 접속 정보를 저장할 수 있다.
- `representativeImageKey`는 nullable 스토리지 키이며, `null`이면 기본 대표 이미지를 사용한다.
- `name`과 `introduction`은 공백만 있는 값을 허용하지 않으며 각각 최대 50자, 100자다.
  `description`은 nullable이며 최대 10,000자, `representativeImageKey`는 최대 255자다.
#### 요청 — CLUB 또는 STUDY

```json
{
  "type": "STUDY",
  "name": "알고리즘 스터디",
  "introduction": "매주 함께 문제를 풉니다.",
  "description": "문제 풀이와 코드 리뷰를 진행합니다.",
  "meetingType": "OFFLINE",
  "location": "서울 캠퍼스",
  "representativeImageKey": "groups/tmp/sample.webp",
  "recurringSchedule": {
    "daysOfWeek": ["MONDAY", "WEDNESDAY"],
    "startTime": "19:00:00",
    "endTime": "21:00:00"
  }
}
```

`recurringSchedule`을 생략하면 요일과 시간을 모두 정하지 않은 유동적 일정으로 생성한다.

`recurringSchedule`을 보내되 `startTime`과 `endTime`을 함께 `null`로 두면 요일만 고정하고 시간은 정하지 않은 시간 유동적 일정으로 생성한다. 한쪽만 `null`인 요청은 `SCHEDULE_INVALID_RULE`로 허용하지 않는다.

```json
{
  "recurringSchedule": {
    "daysOfWeek": ["MONDAY", "WEDNESDAY"],
    "startTime": null,
    "endTime": null
  }
}
```

`sessionSchedule`의 `startTime`과 `endTime`은 여전히 필수다.

#### 요청 — SESSION

```json
{
  "type": "SESSION",
  "name": "동시성 세션",
  "introduction": "한 번 진행하는 기술 세션입니다.",
  "description": null,
  "meetingType": "ONLINE",
  "location": "Zoom",
  "representativeImageKey": null,
  "sessionSchedule": {
    "sessionDate": "2026-08-20",
    "startTime": "19:00:00",
    "endTime": "21:00:00"
  }
}
```

#### 응답 201

```json
{
  "success": true,
  "data": {
    "id": 12,
    "status": "ACTIVE"
  },
  "error": null
}
```

```plain text
Location: /api/groups/12
```

#### 부수 효과
요청 회원의 `GroupMember(role = LEADER)`를 함께 생성한다. 모집 공고는 별도 API로 생성한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 이름 중복 | `GROUP_NAME_DUPLICATED` | 409 |
| 필수 type·meetingType·이름·소개 누락 또는 값·문자열 제약 위반 | `INVALID_PARAMETER` | 400 |
| CLUB·STUDY에 sessionSchedule 전달 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| SESSION에 sessionSchedule 누락 | `SCHEDULE_REQUIRED` | 400 |
| 두 일정 동시 전달 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| 요일 누락·빈 배열·null 원소, 시각 한쪽만 지정, 세션 날짜·시각 누락 또는 시작 시각이 종료 시각 이상 | `SCHEDULE_INVALID_RULE` | 400 |
| 대표 이미지 키가 비어 있거나 업로드 없음·만료·스토리지 객체 없음·확인 실패 | `IMAGE_NOT_FOUND` | 400 |

### `DELETE /api/groups/{groupId}`

- 설명: 생성 후 24시간 이내 그룹 삭제
- 권한: `LEADER`

#### 요청
Request Body는 없다.

#### 응답 204 No Content
본문이 없다.

#### 동작
- `ACTIVE`이고 생성 시각부터 정확히 24시간이 되는 시각까지 가능하다.
- 그룹, 초대·수락 이력, 모집 공고, 신청, 구성원, 현재 일정, 달력의 개별 일정·정기 규칙 이력·장소 이력을 Hard Delete한다.
- 사진 활동 기록은 숨김 처리한다.
- 수신자의 초대 알림은 유지하고 PENDING·RETRY·IN_FLIGHT 초대 전송을 취소한다. 삭제된 초대의 상세·공유 미리보기·수락은 INVITATION_NOT_FOUND(404)로 안내한다. 이미 전달된 OS 알림은 회수하지 않는다.
- `Group.status`를 변경하지 않는다.
- 삭제 요청을 종료 요청으로 자동 전환하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 생성 후 24시간 경과 | `GROUP_DELETE_WINDOW_EXPIRED` | 409 |
| 이미 ENDED 상태 | `GROUP_ENDED` | 409 |

### `GET /api/groups/{groupId}`

- 설명: 그룹 상세 조회
- 권한: `PUBLIC`

#### Path Parameters
- `groupId`: 조회할 그룹 식별자

#### 응답 200 — 반복 일정 그룹

```json
{
  "success": true,
  "data": {
    "id": 12,
    "type": "STUDY",
    "meetingType": "OFFLINE",
    "location": "서울 캠퍼스",
    "status": "ACTIVE",
    "name": "알고리즘 스터디",
    "introduction": "매주 함께 문제를 풉니다.",
    "description": "문제 풀이와 코드 리뷰를 진행합니다.",
    "representativeImageUrl": "images/default-group.png",
    "recurringSchedule": {
      "daysOfWeek": ["MONDAY", "WEDNESDAY"],
      "startTime": "19:00:00",
      "endTime": "21:00:00"
    },
    "sessionSchedule": null,
    "leader": {"memberId": 3, "crewName": "가온", "generation": 8, "memberType": "CREW", "avatarUrl": "https://avatars.githubusercontent.com/u/3"},
    "memberCount": 6,
    "activeRecruitment": null,
    "currentMemberRole": null,
    "currentMemberRegistrationId": null,
    "currentMemberRegistrationStatus": null,
    "createdAt": "2026-08-13T10:00:00"
  },
  "error": null
}
```

유동적 CLUB·STUDY는 두 일정이 모두 `null`이다. SESSION은 `sessionSchedule`만 반환한다. ENDED 그룹도 직접 조회할 수 있다.
인증된 요청이면 `currentMemberRole`에 현재 사용자의 그룹 소속 역할(`LEADER` 또는 `MEMBER`)을 반환하고, `currentMemberRegistrationId`와 `currentMemberRegistrationStatus`에 `activeRecruitment`에 대한 본인 신청 식별자와 상태(`PENDING`, `APPROVED`, `REJECTED`)를 반환한다. 비로그인 사용자의 세 필드는 모두 `null`이다. 소속이 없으면 역할은 `null`이고, 현재 열린 공고나 해당 공고의 신청이 없으면 신청 식별자와 상태는 `null`이다. 마감 공고의 신청은 이 필드에 반환하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| groupId가 양수가 아님 | `INVALID_PARAMETER` | 400 |

### `PATCH /api/groups/{groupId}`

- 설명: 생성 후 24시간이 지난 그룹 종료
- 권한: `LEADER`

#### 요청

```json
{
  "status": "ENDED"
}
```

`ACTIVE → ENDED` 단방향 상태 전이만 허용한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 12,
    "status": "ENDED",
    "updatedAt": "2026-08-15T10:00:01"
  },
  "error": null
}
```

#### 부수 효과
- `Group.status`를 `ACTIVE`에서 `ENDED`로 변경한다.
- 마감되지 않은 모집 공고를 마감한다.
- 해당 공고의 `PENDING` 신청을 `SYSTEM` 주체로 즉시 미승인한다.
- 그룹과 모든 연관 이력을 보존하며 다시 `ACTIVE`로 되돌릴 수 없다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| 생성 후 24시간 이내 | `GROUP_TERMINATION_NOT_AVAILABLE` | 409 |
| 이미 ENDED 상태 | `GROUP_ALREADY_ENDED` | 409 |
| ENDED 이외의 상태 요청 | `INVALID_PARAMETER` | 400 |

### `PUT /api/groups/{groupId}`

- 설명: 그룹 기본 정보 전체 교체
- 권한: `LEADER`

#### 요청

```json
{
  "name": "새 그룹 이름",
  "introduction": "수정된 한 줄 소개",
  "description": "수정된 상세 소개",
  "meetingType": "ONLINE",
  "location": "Zoom",
  "representativeImageKey": "groups/tmp/new.webp"
}
```

- 수정 가능한 기본 정보의 전체 표현을 전달한다. 전달하지 않은 필드를 기존 값으로 보존하는 부분 수정은 지원하지 않는다.
- `description`, `location`, `representativeImageKey`는 nullable 필드지만 요청에 반드시 포함해야 하며, 비우려면 각각 `null`을 명시한다.
- 문자열 길이와 빈 이름·소개 제약은 그룹 생성과 같다. nullable 필드는 문자열 또는 `null`만 허용한다.
- `type`, `status`, 일정은 이 API에서 수정하지 않는다.
- `meetingType`과 `location`은 그룹의 모임 방식과 장소를 전체 교체한다. `meetingType`은 필수이며 `ONLINE`, `OFFLINE`, `FLEXIBLE` 중 하나를 보낸다. 장소를 비우려면 `null`을 명시한다.

#### 응답 200
수정된 그룹 상세 응답을 반환한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 그룹 이름 중복 | `GROUP_NAME_DUPLICATED` | 409 |
| 필수 필드 누락 또는 값 제약 위반 | `INVALID_PARAMETER` | 400 |
| 변경한 대표 이미지 키가 비어 있거나 업로드 없음·만료·스토리지 객체 없음·확인 실패 | `IMAGE_NOT_FOUND` | 400 |

### `DELETE /api/groups/{groupId}/recurring-schedule`

- 설명: 동아리·스터디를 유동적 일정으로 변경
- 권한: `LEADER`

#### 요청
Request Body는 없다.

#### 응답 204 No Content
본문이 없다. 현재 반복 일정 값을 제거하고 오늘 이후의 반복 표시를 중단한다.
정기 규칙 이력은 물리 삭제하지 않으며 과거 달력 표시와 그룹·구성원·모집 이력을 유지한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| SESSION 그룹 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 등록된 반복 일정 없음 | `RECURRING_SCHEDULE_NOT_FOUND` | 404 |
| 구버전 정기 일정 변경 비활성 | `CALENDAR_CLIENT_OUTDATED` | 409 |
| 정기 일정 이력의 동시 변경 | `GROUP_EVENT_CONFLICT` | 409 |

### `PUT /api/groups/{groupId}/recurring-schedule`

- 설명: 동아리·스터디 반복 일정 등록 또는 교체
- 권한: `LEADER`

#### 요청

```json
{
  "daysOfWeek": ["TUESDAY", "THURSDAY"],
  "startTime": "19:30:00",
  "endTime": "21:30:00"
}
```

`startTime`과 `endTime`은 함께 정하거나 함께 `null`로 둔다. 두 값을 함께 비우면 요일만 고정하고 시간은 정하지 않은 시간 유동적 일정이 된다. `daysOfWeek`는 이때도 하나 이상이어야 한다.

```json
{
  "daysOfWeek": ["TUESDAY", "THURSDAY"],
  "startTime": null,
  "endTime": null
}
```

한쪽만 `null`인 요청은 `SCHEDULE_INVALID_RULE`로 허용하지 않는다. 반복 일정을 통째로 없애 요일까지 유동적으로 두려면 이 엔드포인트가 아니라 `DELETE /api/groups/{groupId}/recurring-schedule`을 사용한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "daysOfWeek": ["TUESDAY", "THURSDAY"],
    "startTime": "19:30:00",
    "endTime": "21:30:00"
  },
  "error": null
}
```

시간 유동적 일정으로 저장하면 `startTime`과 `endTime`을 `null`로 응답한다. 그룹 상세 조회의 `recurringSchedule`도 같은 형태다.

```json
{
  "success": true,
  "data": {
    "daysOfWeek": ["TUESDAY", "THURSDAY"],
    "startTime": null,
    "endTime": null
  },
  "error": null
}
```

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| SESSION 그룹 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 요일 누락·빈 배열·null 원소, 시간 역전 또는 두 시각 중 한쪽만 지정 | `SCHEDULE_INVALID_RULE` | 400 |
| 구버전 정기 일정 변경 비활성 | `CALENDAR_CLIENT_OUTDATED` | 409 |
| 정기 일정 이력 없음 | `RECURRING_SCHEDULE_NOT_FOUND` | 404 |
| 수동 정기 모임과 반복 규칙 충돌 또는 정기 일정 이력의 동시 변경 | `GROUP_EVENT_CONFLICT` | 409 |
| 오늘 이후에 적용할 정기 규칙 구간 없음 | `INVALID_PARAMETER` | 400 |

### `PUT /api/groups/{groupId}/session-schedule`

- 설명: 세션 일정 교체
- 권한: `LEADER`

#### 요청

```json
{
  "sessionDate": "2026-09-01",
  "startTime": "13:00:00",
  "endTime": "15:00:00"
}
```

SESSION의 일정은 필수이므로 삭제 API를 제공하지 않는다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "sessionDate": "2026-09-01",
    "startTime": "13:00:00",
    "endTime": "15:00:00"
  },
  "error": null
}
```

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 모임장이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 없음 | `GROUP_NOT_FOUND` | 404 |
| CLUB·STUDY 그룹 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| ENDED 그룹 | `GROUP_ENDED` | 409 |
| 날짜·시각 누락 또는 시작 시각이 종료 시각 이상 | `SCHEDULE_INVALID_RULE` | 400 |

### 캘린더를 통한 정기 일정 관리

신규 프론트엔드는 [그룹 달력 API](group-calendar.md)의 별도 정기 규칙 API를 사용한다. 기존
`PUT/DELETE /api/groups/{groupId}/recurring-schedule`은 구버전 화면 호환용이며,
`GROUP_CALENDAR_LEGACY_RECURRING_WRITE_ENABLED=true`일 때만 오늘 이후 범위로 이력을 함께
수정한다. 기본값은 `false`다. 비활성 상태에서 기존 정기 일정 변경 요청은
`CALENDAR_CLIENT_OUTDATED` (`409`)로 거절된다. 모임 기본 정보 수정과 `SESSION` 일정 수정은
계속 허용한다.
