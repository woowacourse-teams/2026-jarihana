# 그룹 달력

## 공통 규칙

실제 API 계약은 Controller·요청/응답 DTO·ErrorCode와 RestAssured 인수 테스트를
기준으로 확인한다. 이 문서는 그룹 달력 API의 현재 요청·응답 동작을
정리한다.

- `CLUB`, `STUDY`, `SESSION` 모두 그룹 상세의 월간 달력을 제공한다. `SESSION`은 독립된 그룹 유형이며 그룹의 일회성 일정이 달력에 표시된다.
- 이번 범위에는 반복 정기 일정, 모임장이 날짜별로 등록하는 `정기 모임` 회차와 개별 일정, 기존 `SESSION`의 단일 일정만 포함한다. 모임에 딸린 별도 세션과 RSVP는
  포함하지 않는다.
- 달력 조회는 공개다. 개별 일정의 제목·날짜·시각은 공개 응답에 포함되지만 설명·장소는 포함하지 않는다. 일정 상세와 정기·세션 일정의 당시 장소는 그룹원 전용 API로
  조회한다.
- 정기 일정의 달력 노출 설정은 세션 일정에도 함께 적용하며, 개별 일정에는 영향을 주지 않는다.
- 모든 날짜는 `YYYY-MM-DD`, 시간은 `HH:mm:ss` 형식을 사용한다. 날짜 범위는 시작일과 종료일을 포함한다.
- 경로의 `groupId`, `eventId`, `periodId`와 버전은 JSON 숫자에 대응하는 `Long`이다. 요청 본문이 있는 API는 JSON을 사용한다. 인증 쿠키와 변경 요청의 CSRF 규칙은 [공통 계약](../common-contract.md)을 따른다.
- 개별 일정은 `startDate <= endDate <= startDate.plusYears(1)`로 제한한다. 종일 일정은 시각이 모두 `null`이고, 시간 지정 일정은 시작·종료 시각이 모두 필요하며 시작 일시가 종료 일시보다 빨라야 한다. 여러 날 일정에서는 종료 시각 자체가 시작 시각보다 빠를 수 있다.
- 개별 일정의 제목은 최대 50자, 장소는 최대 255자, 설명은 최대 10,000자다. 과거 날짜의 일정도 등록·수정할 수 있다. 종료된 그룹에서는 개별 일정을 변경할 수
  없다.
- `GROUP_EVENT_CONFLICT`는 일정·정기 규칙 버전이 최신 상태와 다르거나, 수동으로 등록한 정기 모임 회차와 반복 규칙이 겹칠 때 반환한다. 요청의 최신 버전을
  다시 조회한 뒤 수정해야 한다.
- 일정 상세·정기/세션 당시 장소·정기 관리·규칙 구간 조회의 성공 응답에는 `Cache-Control: no-store`가 포함된다.

## 조회

### `GET /api/groups/{groupId}/calendar`

- 설명: 모임의 공개 달력 조회
- 권한: `PUBLIC`

#### Query Parameters

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `from` | LocalDate | O | 조회 시작일 (`YYYY-MM-DD`) |
| `to` | LocalDate | O | 조회 종료일 (`YYYY-MM-DD`). 시작일과 종료일을 포함해 최대 42일이며 `from`은 `to`보다 늦을 수 없다. |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "showBaseSchedule": true,
    "flexibleBeforeFirstRecurring": null,
    "flexibleAfterRecurring": [],
    "events": [
      {
        "kind": "GROUP_EVENT",
        "id": 24,
        "occurrenceKey": null,
        "periodId": null,
        "title": "보드게임 모임",
        "startDate": "2026-10-14",
        "endDate": "2026-10-14",
        "allDay": false,
        "startTime": "19:00:00",
        "endTime": "21:00:00"
      }
    ]
  },
  "error": null
}
```

#### 동작

응답에는 `showBaseSchedule`, 첫 정기 등록 전의 유동적 기간, 정기 규칙 삭제 후의 유동적 기간과 달력 이벤트가 포함된다. 유동적 기간 정보가 없으면 해당 필드는
`null` 또는 빈 배열이다.

| 필드 | JSON 타입 | 설명 |
| --- | --- | --- |
| `showBaseSchedule` | boolean | 기본 정기·세션 일정 표시 여부 |
| `flexibleBeforeFirstRecurring` | object 또는 null | 첫 표시 묶음 시작 전의 유동적 기간 |
| `flexibleBeforeFirstRecurring.fromDate` | string (날짜) | 그룹 개설일 |
| `flexibleBeforeFirstRecurring.untilDate` | string (날짜) | 첫 표시 묶음 시작 전날. 종료 그룹은 종료일까지 |
| `flexibleBeforeFirstRecurring.registeredOn` | string (날짜) | 첫 표시 묶음의 현재 `startDate`; 별도 등록 시각 필드가 아니다 |
| `flexibleAfterRecurring` | object[] | 유동적 운영 기간. 정기 묶음을 한 번도 만들지 않은 경우에는 `CLUB`·`STUDY`이면서 `meetingType=FLEXIBLE`인 그룹만 개설일부터의 기간을 이 배열로 반환 |
| `flexibleAfterRecurring[].fromDate` | string (날짜) | 기간 시작일 |
| `flexibleAfterRecurring[].untilDate` | string (날짜) 또는 null | 기간 종료일. 종료 제한이 없으면 null |
| `events` | object[] | 조회 범위에 걸치는 이벤트. 없으면 빈 배열 |

유동적 기간은 조회 범위와 겹칠 때 반환되지만 `fromDate`·`untilDate`를 요청 범위로 잘라내지 않는다. `showBaseSchedule=false`이면 유동적 기간도 반환하지 않는다.
현재 구현은 정기 묶음 이력이 없는 그룹의 최초 유동적 기간을 `meetingType`으로 판별한다. `ONLINE`·`OFFLINE` 그룹은 `recurringSchedule`이 없어도 이 최초 기간 안내를 반환하지 않는다.

| `events[]` 필드 | JSON 타입 | 설명 |
| --- | --- | --- |
| `kind` | string | `GROUP_EVENT`, `REGULAR_MEETING`, `RECURRING`, `SESSION` |
| `id` | number 또는 null | 저장한 일정 ID. 계산된 반복 회차와 세션은 null |
| `occurrenceKey` | string 또는 null | 반복은 `recurring:{seriesId}:{sourceDate}`, 세션은 `session:{groupId}:{date}`. 일반 개별·날짜별 정기 모임은 null |
| `periodId` | number 또는 null | 반복 회차의 규칙 구간 ID. 다른 종류는 null |
| `title` | string | 공개 제목 |
| `startDate`, `endDate` | string (날짜) | 표시 시작·종료일 |
| `allDay` | boolean | 저장한 일정은 종일 여부. 계산된 반복 회차와 세션은 false |
| `startTime`, `endTime` | string (시각) 또는 null | 종일 일정 또는 시간 유동적 반복 회차는 둘 다 null |

`kind`는 `GROUP_EVENT`, `REGULAR_MEETING`, `RECURRING`, `SESSION` 중 하나다. 달력 응답에는 개별 일정과 날짜별 정기 모임의
설명·장소가 포함되지 않는다. 반복 정기 일정의 제목은 `정기 모임`, `SESSION` 일정의 제목은 현재 그룹 이름이다. 일반 반복 회차는 `id=null`이며, 모임장이 개별
수정한 회차는 안정적인 `group_event.id`를 가진다. 이동한 회차도 원래 날짜 기준 `occurrenceKey`를 유지한다.

날짜별 `REGULAR_MEETING` 회차는 동아리·스터디에서만 등록할 수 있으며, 같은 날짜에 반복 규칙이 회차를 이미 만들면 등록을 거절한다. 회차는 하루 일정이고 제목은
`정기 모임`으로 고정한다.

이벤트는 `startDate` 오름차순, 같은 날짜에서는 `startTime` 오름차순으로 정렬하며 null 시각은 가장 먼저 온다. 조회 범위와 겹치는 여러 날 개별 일정은 저장된 `startDate`를 유지하고 `endDate`는 요청 `to`까지로 줄인다. 종료된 그룹은 종료일 이후를 숨기며 `endDate`를 종료일까지만 표시한다. 조회 시작일이 종료일 이후면 이벤트와 유동적 기간은 비어 있다.

### `GET /api/groups/{groupId}/calendar/schedule-details`

- 설명: 정기 또는 세션 일정의 당시 장소 조회
- 권한: `MEMBER + 해당 그룹의 현재 소속`

#### Query Parameters

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `kind` | enum | O | 대문자 `RECURRING` 또는 `SESSION` |
| `date` | LocalDate | O | 조회할 날짜 (`YYYY-MM-DD`) |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "kind": "RECURRING",
    "title": "정기 모임",
    "date": "2026-10-14",
    "startTime": "19:00:00",
    "endTime": "21:00:00",
    "location": "서울 캠퍼스"
  },
  "error": null
}
```

#### 동작

`kind`, `title`, `date`는 문자열이고 `startTime`, `endTime`, `location`은 문자열 또는 null이다. 시간 지정 일정의 장소는 시작 시각에 적용된 장소 이력에서, 시간이 없는 정기 일정의 장소는 그날 마지막으로 적용된 장소 이력에서 조회한다. 이력이 없으면 `location=null`이며 현재 장소로 과거를 채우지 않는다.

해당 날짜의 공개 달력에 요청한 종류가 없으면 `GROUP_EVENT_NOT_FOUND` (`404`)다. 표시 설정으로 숨긴 일정이나 종료일 이후 일정도 동일하다. 반복 회차 예외의 저장된 설명·장소는 `/events/{eventId}`로 조회한다.

### `GET /api/groups/{groupId}/events/{eventId}`

- 설명: 개별 일정, 날짜별 정기 모임 또는 개별 수정한 반복 회차 상세 조회
- 권한: `MEMBER + 해당 그룹의 현재 소속`

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 24,
    "eventType": "INDIVIDUAL",
    "status": "AUTO",
    "effectiveStatus": "UPCOMING",
    "title": "보드게임 모임",
    "startDate": "2026-10-14",
    "endDate": "2026-10-14",
    "allDay": false,
    "startTime": "19:00:00",
    "endTime": "21:00:00",
    "description": "보드게임을 함께 합니다.",
    "location": "서울 캠퍼스",
    "version": 0,
    "recurrenceSourceDate": null
  },
  "error": null
}
```

반복 회차를 개별 수정한 일정은 `eventType`이 `REGULAR_MEETING`이고 `recurrenceSourceDate`에 원래 회차 날짜를 반환한다.

`id`, `version`은 숫자, `allDay`는 boolean이고 나머지는 문자열이다. `startTime`·`endTime`·`location`·`recurrenceSourceDate`는 null일 수 있다. `eventType`은 `INDIVIDUAL` 또는 `REGULAR_MEETING`, `status`는 `AUTO`·`UPCOMING`·`COMPLETED`, `effectiveStatus`는 `UPCOMING` 또는 `COMPLETED`다. `AUTO`는 **시작일**이 오늘보다 과거면 `COMPLETED`, 오늘·미래면 `UPCOMING`으로 계산한다. 개별 일정은 항상 `status=AUTO`다. 삭제한 일정과 다른 그룹에 속한 일정은 `GROUP_EVENT_NOT_FOUND` (`404`)다.

### `GET /api/groups/{groupId}/recurring-schedule/manage`

- 설명: 현재 정기 일정 관리 정보 조회
- 권한: `LEADER`

#### 응답 200

```json
{
  "success": true,
  "data": {
    "seriesId": 7,
    "periodId": 12,
    "startDate": "2026-09-15",
    "endDate": null,
    "version": 3,
    "daysOfWeek": ["TUESDAY", "SATURDAY"],
    "startTime": "19:00:00",
    "endTime": "21:00:00"
  },
  "error": null
}
```

`seriesId`, `periodId`, `version`은 숫자이고 `startDate`·`endDate`는 날짜 문자열이다. `endDate`와 시각 두 개는 null일 수 있다. `daysOfWeek`는 대문자 요일 문자열 배열이다. 현재 묶음의 전체 표시 기간과 가장 마지막 규칙 구간의 요일·시각을 반환한다. 현재 묶음이 없으면 `RECURRING_SCHEDULE_NOT_FOUND` (`404`)다.

### `GET /api/groups/{groupId}/recurring-schedule/periods/{periodId}`

- 설명: 선택한 회차 날짜에 적용된 정기 규칙 조회
- 권한: `LEADER`

#### Path Parameters

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `periodId` | Long | 조회할 정기 규칙 구간 ID |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "periodId": 11,
    "effectiveFrom": "2026-09-15",
    "effectiveUntil": "2026-10-11",
    "version": 3,
    "daysOfWeek": ["MONDAY", "WEDNESDAY"],
    "startTime": "19:00:00",
    "endTime": "21:00:00"
  },
  "error": null
}
```

`periodId`, `version`은 숫자, `effectiveFrom`·`effectiveUntil`은 날짜 문자열이며 `effectiveUntil`과 시각 두 개는 null일 수 있다. `version`은 구간 자체가 아닌 그 구간이 속한 시리즈의 버전이다. 다른 그룹의 구간이나 없는 구간은 `RECURRING_SCHEDULE_NOT_FOUND` (`404`)다.

## 달력 표시 설정

### `PUT /api/groups/{groupId}/calendar/settings`

- 설명: 기존 정기·세션 일정의 달력 표시 설정
- 권한: `LEADER`

#### 요청

`showBaseSchedule`은 필수 boolean이며 생략하거나 null로 보내면 `INVALID_PARAMETER` (`400`)다.

```json
{
  "showBaseSchedule": true
}
```

#### 응답 200

```json
{
  "success": true,
  "data": {
    "showBaseSchedule": true
  },
  "error": null
}
```

#### 동작

이 설정은 반복 정기·세션 일정에 적용하며 반복 회차의 예외 일정도 함께 숨긴다. 개별 일정, 날짜별 정기 모임 회차와 그룹 정보는 변경하지 않는다.

## 일정 등록·수정·삭제

### `POST /api/groups/{groupId}/events`

- 설명: 개별 일정 등록
- 권한: `LEADER`

#### 요청

| 필드 | JSON 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `title` | string | O | 공백만 허용하지 않음, 최대 50자. `REGULAR_MEETING` 요청에도 필수이며 저장 제목은 `정기 모임`으로 고정 |
| `startDate`, `endDate` | string (날짜) | O | 시작·종료일. `REGULAR_MEETING`이면 동일해야 함 |
| `allDay` | boolean | O | 종일 여부 |
| `startTime`, `endTime` | string (시각) 또는 null | 조건부 | 종일이면 둘 다 null/생략, 시간 지정이면 둘 다 필수 |
| `description` | string | O | 공백만 허용하지 않음, 최대 10,000자 |
| `location` | string 또는 null | X | 최대 255자. null/생략/공백은 null로 저장 |
| `eventType` | string 또는 null | X | `INDIVIDUAL`, `REGULAR_MEETING`. null/생략이면 `INDIVIDUAL` |
| `status` | string 또는 null | X | `AUTO`, `UPCOMING`, `COMPLETED`. null/생략이면 `AUTO` |
| `version` | number 또는 null | X | 생성 시 사용하지 않음 |

제목·설명·장소는 앞뒤 공백을 제거해 저장한다. 길이 검증은 요청 문자열에도 적용되므로 공백을 포함한 입력 길이가 제한을 넘으면 거절한다.

`description`은 필수이고 `location`은 선택이다. `allDay=true`이면 시각 두 개를 `null`로 보내고, `allDay=false`이면 두 시각을 모두
지정한다.

`INDIVIDUAL`은 요청한 `status`와 관계없이 `AUTO`로 저장한다. `REGULAR_MEETING`만 `UPCOMING` 또는 `COMPLETED`로 직접 설정할 수 있으며, `AUTO`로 되돌리면 시작일 기준 계산을 다시 적용한다.

#### 응답 201 Created

```json
{
  "success": true,
  "data": {
    "id": 24,
    "eventType": "INDIVIDUAL",
    "status": "AUTO",
    "effectiveStatus": "UPCOMING",
    "title": "보드게임 모임",
    "startDate": "2026-10-14",
    "endDate": "2026-10-14",
    "allDay": false,
    "startTime": "19:00:00",
    "endTime": "21:00:00",
    "description": "보드게임을 함께 합니다.",
    "location": "서울 캠퍼스",
    "version": 0,
    "recurrenceSourceDate": null
  },
  "error": null
}
```

다음 `Location` 헤더를 함께 반환한다.

```plain text
Location: /api/groups/{groupId}/events/{eventId}
```

#### 날짜별 정기 모임

`REGULAR_MEETING`은 동아리·스터디에서만 사용할 수 있다. 모임장은 종일 또는 시작·종료 시각, 장소(선택), 설명(필수)을 지정해 하루짜리 회차를 등록·수정·삭제할
수 있다. 기본 상태는 날짜에 따라 오늘·미래 `예정`, 과거 `개최 완료`로 계산한다. 모임장은 상태를 직접 `예정` 또는 `개최 완료`로 설정할 수 있으며 `날짜 기준
자동`으로 되돌릴 수 있다. 제목은 `정기 모임`으로 고정한다. 종일·시간 지정 모드 모두 필수 선택이며 과거 날짜도 등록할 수 있다. 반복 규칙이 같은 날짜에 회차를 이미
만들거나 변경 후 만들게 되면 `GROUP_EVENT_CONFLICT`를 반환한다. 삭제한 회차는 공개 달력에서 숨긴다.

### `PUT /api/groups/{groupId}/events/{eventId}`

- 설명: 개별 일정 전체 교체
- 권한: `LEADER`

#### Path Parameters

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `eventId` | Long | 수정할 일정 ID |

#### 요청

등록 요청과 같은 필드를 사용하되 `version`은 조회한 최신 일정 버전이어야 한다. `version`을 생략하거나 null로 보내거나 버전이 다르면 `GROUP_EVENT_CONFLICT` (`409`)다. `eventType`·`status`는 생략하거나 null로 보내면 기존 값을 유지한다. `INDIVIDUAL`로 저장할 때는 상태가 항상 `AUTO`다. 일반 일정은 종류를 바꿀 수 있지만 반복 회차 예외는 `REGULAR_MEETING`을 유지해야 한다 (`INVALID_PARAMETER`, `400`).

선택적인 장소·시각은 생략하면 기존 값을 유지하는 것이 아니라 null로 교체한다. 반복 회차 예외의 원래 `recurrenceSourceDate`는 변경되지 않는다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 24,
    "eventType": "INDIVIDUAL",
    "status": "AUTO",
    "effectiveStatus": "UPCOMING",
    "title": "보드게임 모임",
    "startDate": "2026-10-14",
    "endDate": "2026-10-14",
    "allDay": false,
    "startTime": "19:00:00",
    "endTime": "21:00:00",
    "description": "보드게임을 함께 합니다.",
    "location": "서울 캠퍼스",
    "version": 1,
    "recurrenceSourceDate": null
  },
  "error": null
}
```

### `DELETE /api/groups/{groupId}/events/{eventId}?version={version}`

- 설명: 개별 일정 삭제
- 권한: `LEADER`

#### Path Parameters

| 이름 | 타입 | 설명 |
| --- | --- | --- |
| `eventId` | Long | 삭제할 일정 ID |

#### Query Parameters

| 이름 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `version` | Long | O | 조회한 일정 버전 |

#### 응답 204 No Content

본문이 없다. 삭제는 soft delete다.

`version` 누락·형식 오류는 `INVALID_PARAMETER` (`400`), 최신 버전과 불일치는 `GROUP_EVENT_CONFLICT` (`409`)다. 이미 삭제한 일정에 다시 요청하면 `GROUP_EVENT_NOT_FOUND` (`404`)다.

### `POST /api/groups/{groupId}/recurring-schedule/occurrences`

- 설명: 반복 정기 모임의 한 회차를 예외 일정으로 수정
- 권한: `LEADER`

#### 요청

| 필드 | JSON 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `sourceDate` | string (날짜) | O | 기존 반복 규칙이 만든 원래 회차 날짜 |
| `periodId` | number | O | 양수인 원래 규칙 구간 ID |
| `seriesVersion` | number | O | 0 이상인 시리즈 최신 버전 |
| `startDate` | string (날짜) | O | 새 회차 날짜. `endDate`도 이 날짜로 저장 |
| `allDay` | boolean | O | 종일 여부 |
| `startTime`, `endTime` | string (시각) 또는 null | 조건부 | 종일이면 둘 다 null/생략, 시간 지정이면 둘 다 필수이며 시작 시각이 종료 시각보다 빠름 |
| `description` | string | O | 공백만 허용하지 않음, 최대 10,000자 |
| `location` | string 또는 null | X | 최대 255자, 공백은 null로 저장 |
| `status` | string 또는 null | X | `AUTO`, `UPCOMING`, `COMPLETED`. null/생략이면 `AUTO` |

`sourceDate`가 지정한 구간의 요일·구간·시리즈 전체 기간에 해당하지 않거나 숨긴 시리즈이면 `GROUP_EVENT_CONFLICT` (`409`)다. 새 날짜가 다른 반복 회차와 겹쳐도 같은 코드로 거절한다. `title`, `eventType`, `endDate`, 일정 `version`은 이 요청의 필드가 아니다.

제목은 `정기 모임`으로 고정한다. 설명은 필수이고 장소는 선택이다. 종일·시간 지정 규칙과 회차 상태는 날짜별 정기 모임과 같다.

#### 응답 201 Created

```json
{
  "success": true,
  "data": {
    "id": 31,
    "eventType": "REGULAR_MEETING",
    "status": "AUTO",
    "effectiveStatus": "UPCOMING",
    "title": "정기 모임",
    "startDate": "2026-10-14",
    "endDate": "2026-10-14",
    "allDay": false,
    "startTime": "19:00:00",
    "endTime": "21:00:00",
    "description": "정기 모임 회차 안내입니다.",
    "location": "서울 캠퍼스",
    "version": 0,
    "recurrenceSourceDate": "2026-10-14"
  },
  "error": null
}
```

다음 `Location` 헤더를 함께 반환한다.

```plain text
Location: /api/groups/{groupId}/events/{eventId}
```

### `DELETE /api/groups/{groupId}/recurring-schedule/occurrences`

- 설명: 원래 반복 규칙은 두고 선택한 회차 한 건만 달력에서 숨김
- 권한: `LEADER`

#### 요청

JSON 본문에 필수 날짜 `sourceDate`, 양수 숫자 `periodId`, 0 이상 숫자 `seriesVersion`을 전달한다. 선택 회차·시리즈 버전 검증은 occurrence 생성과 같다.

#### 응답 204 No Content

본문이 없다. 숨김 행은 soft delete로 보존하며 같은 반복 회차를 다시 표시하지 않는다.

반복 회차 예외를 생성하거나 삭제할 때는 조회한 시리즈 `version`과 `periodId`를 함께 보낸다. 이미 예외 일정으로 바뀐 회차는 새로고침 후 기존 일정 ID의
`PUT/DELETE /events/{eventId}` API를 사용한다. 예외 일정을 삭제하면 연결 행이 원래 반복 날짜를 숨기는 tombstone으로 남아 규칙 변경이나
새로고침 뒤에도 회차가 다시 나타나지 않는다.

회차 예외 생성·숨김은 시리즈 버전을 확인하지만 증가시키지 않는다. 이미 변경하거나 숨긴 원래 회차에 다시 occurrence API를 요청하면 `GROUP_EVENT_CONFLICT` (`409`)다.

## 정기 규칙

### `POST /api/groups/{groupId}/recurring-schedule/series`

- 설명: 현재 정기 규칙이 없는 모임에 새 정기 묶음 등록
- 권한: `LEADER`

#### 요청

| 필드 | JSON 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `daysOfWeek` | string[] | O | 하나 이상의 대문자 요일. `MONDAY`, `TUESDAY`, `WEDNESDAY`, `THURSDAY`, `FRIDAY`, `SATURDAY`, `SUNDAY`; null 원소 불가, 중복은 제거 |
| `startTime`, `endTime` | string (시각) 또는 null | X | 둘 다 지정하거나 둘 다 null/생략. 지정하면 시작 시각이 종료 시각보다 빨라야 함 |

오늘부터 적용하며 변경 범위 선택이나 전체 시작·종료일을 받지 않는다. 현재 embedded 정기 규칙 또는 현재 시리즈가 이미 있으면 `GROUP_EVENT_CONFLICT` (`409`)다. 규칙을 제거한 뒤에는 새 묶음을 다시 등록할 수 있다. 새 규칙이 저장된 날짜별 정기 모임이나 이동한 반복 회차와 겹쳐도 같은 코드로 거절한다.

#### 응답 201 Created

```json
{
  "success": true,
  "data": {
    "seriesId": 7,
    "periodId": 12,
    "startDate": "2026-10-12",
    "endDate": null,
    "version": 0,
    "daysOfWeek": ["TUESDAY", "SATURDAY"],
    "startTime": "19:00:00",
    "endTime": "21:00:00"
  },
  "error": null
}
```

응답 필드와 null 허용 여부는 정기 관리 조회와 같다. 다음 `Location` 헤더를 반환한다.

```plain text
Location: /api/groups/{groupId}/recurring-schedule/manage
```

### `PUT /api/groups/{groupId}/recurring-schedule/scoped`

- 설명: 정기 규칙의 요일·시각 변경
- 권한: `LEADER`

#### 요청

| 필드 | JSON 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `daysOfWeek` | string[] | O | 등록 요청과 같은 요일 검증 |
| `startTime`, `endTime` | string (시각) 또는 null | X | 등록 요청과 같은 시각 검증. 생략하면 null로 교체 |
| `applyScope` | string | O | `ALL` 또는 `FROM_TODAY` |
| `fromDate` | string (날짜) 또는 null | 조건부 | `FROM_TODAY`일 때 필수. `ALL`에서는 무시 |
| `periodId` | number 또는 null | X | 지정하면 양수. 해당 구간이 속한 시리즈를 변경하며, null/생략이면 현재 시리즈 사용 |
| `version` | number | O | 대상 시리즈의 최신 버전 |

`applyScope`는 `ALL`, `FROM_TODAY`다. 캘린더 회차에서 요청할 때 `periodId`로 해당 회차가 속한 반복 일정을 지정한다. `ALL`은 그 반복
일정의 모든 규칙 구간에 요일·시각을 적용한다. `FROM_TODAY`는 요청의 `fromDate`부터 포함해 이후 일정을 바꾸며, 해당 날짜를 기준으로 구간을 나눈다.
`FROM_TODAY`에서 `fromDate`가 빠진 오래된 화면 요청은 새로고침 오류로 거절한다. 전체 시작·종료일은 별도 API로 수정한다.

`FROM_TODAY`라는 이름과 관계없이 실제 적용 기준은 전달한 `fromDate`이며 과거 날짜도 허용한다. 해당 날짜가 실제 발생일인지는 검사하지 않는다. 선택일 이후에 적용할 규칙 구간이 없으면 `INVALID_PARAMETER` (`400`)다. 규칙 변경이 날짜별 정기 모임이나 이동한 반복 회차와 겹치면 `GROUP_EVENT_CONFLICT` (`409`)다. 기존 회차 예외의 내용은 바꾸지 않는다.

위 범위는 반복 규칙 자체에 적용한다. `이 일정만`은 선택한 발생일에 예외 일정을 저장하므로 반복 규칙 변경 API가 아니라
`/recurring-schedule/occurrences` API를 사용한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "version": 4
  },
  "error": null
}
```

### `DELETE /api/groups/{groupId}/recurring-schedule/scoped`

- 설명: 범위를 선택해 정기 규칙 제거
- 권한: `LEADER`

#### 요청

JSON 본문에 필수 문자열 `applyScope` (`ALL`, `FROM_TODAY`), 선택적 날짜 `fromDate`, 선택적 양수 숫자 `periodId`, 필수 숫자 `version`을 전달한다. `FROM_TODAY`이면 `fromDate`가 필수이며 누락/null은 `CALENDAR_CLIENT_OUTDATED` (`409`)다. `ALL`에서는 `fromDate`를 무시한다. `periodId`를 생략하거나 null로 보내면 현재 시리즈를 사용한다.

규칙 삭제도 수정과 같은 선택 날짜 범위를 사용한다. 캘린더 회차에서 요청하면 `periodId`가 지정한 반복 일정에 적용하고, 관리 화면에서 요청하면 현재 반복 일정에
적용한다. `ALL`은 선택한 반복 일정의 정기 발생을 모두 숨기고, `FROM_TODAY`는 `fromDate`부터 정기 발생을 숨긴다. `이 일정만`은 occurrence 삭제
API를 사용한다.

현재 시리즈를 `ALL`로 삭제하면 같은 그룹의 이전 시리즈도 모두 숨긴다. 과거 시리즈를 `periodId`로 선택해 삭제하면 그 시리즈만 적용한다. 현재 시리즈를 삭제하면 embedded 정기 규칙을 제거하고 현재 시리즈 여부를 해제한다. `FROM_TODAY`의 날짜가 전체 시작일 이전/당일이면 전체 시리즈를 숨기며, 기존 종료일 뒤면 종료일을 더 늦추지 않는다. DB 행을 물리적으로 삭제하지 않고 시리즈 버전을 1 증가시킨다. 연결된 회차 예외도 시리즈 표시 기간·숨김 여부에 따라 숨겨진다.

#### 응답 204 No Content

본문이 없다.

### `PUT /api/groups/{groupId}/recurring-schedule/periods/{periodId}`

- 설명: 구버전 화면의 규칙 구간 직접 수정 요청을 거절
- 권한: `LEADER`

#### 요청

`daysOfWeek`, `startTime`, `endTime`, `version`을 전달한다.

`daysOfWeek`는 필수 문자열 배열, `version`은 필수 숫자이고 시각 두 개는 선택적 시각 문자열이다. 유효한 요청의 그룹·모임장·활성 상태와 구간 소속을 확인한 뒤 아래 오류를 반환한다. 요청 바인딩·필수값 오류는 `INVALID_PARAMETER` (`400`), 없거나 다른 그룹의 구간은 `RECURRING_SCHEDULE_NOT_FOUND` (`404`)다.

#### 응답 409 Conflict

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "CALENDAR_CLIENT_OUTDATED",
    "message": "화면이 오래되었습니다. 새로고침한 뒤 날짜 기준 변경 범위를 선택해 주세요."
  }
}
```

### `PUT /api/groups/{groupId}/recurring-schedule/calendar-range`

- 설명: 정기 일정 전체의 시작일·종료일 수정
- 권한: `LEADER`

#### 요청

필수 날짜 문자열 `startDate`, 선택적 날짜 문자열 `endDate`, 필수 숫자 `version`을 전달한다. `endDate`는 null/생략이면 무기한이다. 시작일은 모임 개설일보다 이를 수 없고, 종료일은 시작일보다 빠를 수 없다. 현재 시리즈에만 적용하며 과거 시리즈를 선택하는 `periodId` 필드는 없다. 규칙 구간의 적용 경계는 바꾸지 않으며 계산되는 회차는 전체 표시 기간과 규칙 구간의 교집합에만 나타난다.

새 표시 범위의 반복 회차가 날짜별 정기 모임이나 이동한 회차 예외와 겹치면 `GROUP_EVENT_CONFLICT` (`409`)다. 성공하면 시리즈 버전이 1 증가한다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "version": 4
  },
  "error": null
}
```

## 공통 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 인증이 필요한 요청에 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 변경 요청의 CSRF 토큰 누락·불일치 | `ACCESS_DENIED` | 403 |
| 그룹 모임장이 아님 또는 그룹원이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 또는 개별 일정 없음 | `GROUP_NOT_FOUND`, `GROUP_EVENT_NOT_FOUND` | 404 |
| 정기 규칙 또는 규칙 구간 없음 | `RECURRING_SCHEDULE_NOT_FOUND` | 404 |
| 요청 값·조회 범위·일정 기간이 올바르지 않음 | `INVALID_PARAMETER` | 400 |
| 종료된 그룹 또는 최신 버전과 충돌 | `GROUP_ENDED`, `GROUP_EVENT_CONFLICT` | 409 |
| 구간 직접 수정, 범위 요청의 `fromDate` 누락, 비활성 legacy 쓰기 | `CALENDAR_CLIENT_OUTDATED` | 409 |
| JPA 낙관적 잠금 충돌 | `CONCURRENT_MODIFICATION` | 409 |
| `SESSION` 그룹에 `POST /recurring-schedule/series` 또는 `PUT /recurring-schedule/scoped` 요청 | `SCHEDULE_TYPE_MISMATCH` | 400 |
| `SESSION`에 날짜별 정기 모임 등록·수정 또는 반복 회차 종류 변경 | `INVALID_PARAMETER` | 400 |

정기 관리 조회·규칙 구간 조회·전체 표시 기간 변경·범위 삭제는 그룹 유형만으로 `SCHEDULE_TYPE_MISMATCH`를 반환하지 않는다. 대상 시리즈/구간이 없으면 `RECURRING_SCHEDULE_NOT_FOUND` (`404`)다. 장소 상세 조회는 그룹 소속을 먼저 확인하므로 소속 없는 그룹 ID에도 `GROUP_ACCESS_DENIED` (`403`)를 반환할 수 있다.

일정 변경은 그룹 행의 쓰기 잠금 안에서 처리한다. 일정 수정·삭제는 일정의 `version`, 규칙 수정·삭제·전체 기간 변경은 시리즈 `version`, 회차 예외 생성·숨김은 `seriesVersion`을 비교한다. 시리즈 버전에는 별도 구간 버전이 없으며 규칙·전체 기간 변경은 성공 시 1 증가한다. 필수로 검증되는 시리즈 버전의 누락은 `INVALID_PARAMETER` (`400`)이고 이벤트 수정의 버전 누락은 `GROUP_EVENT_CONFLICT` (`409`)다.

## 기존 정기 일정 API 호환

기존 `PUT/DELETE /api/groups/{groupId}/recurring-schedule`은 구버전 화면 호환용이다.
`GROUP_CALENDAR_LEGACY_RECURRING_WRITE_ENABLED=true`일 때만 허용하고 오늘 이후 범위로 이력을 함께 갱신한다. 기본값은 `false`이며
비활성 상태에서 호출하면 `CALENDAR_CLIENT_OUTDATED` (`409`)를 반환한다. 기존 모임 정보 수정과 `SESSION` 일정 수정 API는 유지한다.
