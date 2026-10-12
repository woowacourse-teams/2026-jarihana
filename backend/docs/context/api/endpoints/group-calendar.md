# 그룹 달력

## 공통 규칙

실제 API 계약은 Controller·요청/응답 DTO·ErrorCode와 RestAssured 인수 테스트를
기준으로 확인한다. 이 문서는 그룹 달력 API의 설계 의도와 주요 요청·응답 동작을
정리한다.

- `CLUB`, `STUDY`, `SESSION` 모두 그룹 상세의 월간 달력을 제공한다. `SESSION`은 독립된 그룹 유형이며 그룹의 일회성 일정이 달력에 표시된다.
- 이번 범위에는 반복 정기 일정, 모임장이 날짜별로 등록하는 `정기 모임` 회차와 개별 일정, 기존 `SESSION`의 단일 일정만 포함한다. 모임에 딸린 별도 세션과 RSVP는 포함하지 않는다.
- 달력 조회는 공개다. 개별 일정의 제목·날짜·시각은 공개 응답에 포함되지만 설명·장소는 포함하지 않는다. 일정 상세와 정기·세션 일정의 당시 장소는 그룹원 전용 API로 조회한다.
- 정기 일정의 달력 노출 설정은 세션 일정에도 함께 적용하며, 개별 일정에는 영향을 주지 않는다.
- 모든 날짜는 `YYYY-MM-DD`, 시간은 `HH:mm:ss` 형식을 사용한다. 날짜 범위는 시작일과 종료일을 포함한다.
- 개별 일정은 시작일부터 1년 이내로 제한한다. 종일 일정은 시각이 모두 `null`이고, 시간 지정 일정은 시작·종료 시각이 모두 필요하다.
- `GROUP_EVENT_CONFLICT`는 일정·정기 규칙 버전이 최신 상태와 다르거나, 수동으로 등록한 정기 모임 회차와 반복 규칙이 겹칠 때 반환한다. 요청의 최신 버전을 다시 조회한 뒤 수정해야 한다.

## `GET /api/groups/{groupId}/calendar`

- 설명: 모임의 공개 달력 조회
- 권한: `PUBLIC`
- Query Parameters: `from`, `to` (`YYYY-MM-DD`, 필수). 범위 양 끝을 포함해 최대 42일이며 `from`은 `to`보다 늦을 수 없다.

응답에는 `showBaseSchedule`, 첫 정기 등록 전의 유동적 기간, 정기 규칙 삭제 후의 유동적 기간과 달력 이벤트가 포함된다. 유동적 기간 정보가 없으면 해당 필드는 `null` 또는 빈 배열이다.

```json
{
  "success": true,
  "data": {
    "showBaseSchedule": true,
    "flexibleBeforeFirstRecurring": null,
    "flexibleAfterRecurring": [],
    "events": [{
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
    }]
  },
  "error": null
}
```

`kind`는 `GROUP_EVENT`, `REGULAR_MEETING`, `RECURRING`, `SESSION` 중 하나다. 날짜별 `REGULAR_MEETING` 회차는 동아리·스터디에서만 등록할 수 있고, 그 날짜에 반복 규칙이 회차를 이미 만들면 등록을 거절한다. 회차는 하루 일정이며 제목은 `정기 모임`으로 고정한다. 달력 응답에는 개별 일정과 날짜별 정기 모임의 설명·장소가 포함되지 않는다. 반복 정기 일정도 제목을 `정기 모임`으로 표시하고, `SESSION` 일정은 현재 그룹 이름을 제목으로 표시한다. 일반 반복 회차는 `id=null`이며, 모임장이 개별 수정한 회차는 안정적인 `group_event.id`를 가진다. 이동한 회차도 원래 날짜 기준 `occurrenceKey`를 유지한다.

## `GET /api/groups/{groupId}/calendar/schedule-details`

- 설명: 정기 또는 세션 일정의 당시 장소 조회
- 권한: `MEMBER`
- Query Parameters: `kind` (`RECURRING` 또는 `SESSION`), `date` (`YYYY-MM-DD`), 모두 필수

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

시간이 없는 정기 일정은 `startTime`과 `endTime`이 `null`이다. 해당 날짜의 장소는 그날 마지막으로 적용된 장소 이력에서 조회한다.

## `PUT /api/groups/{groupId}/calendar/settings`

- 설명: 기존 정기·세션 일정의 달력 표시 설정
- 권한: `LEADER`
- 요청: `{"showBaseSchedule": true}`
- 응답: `{"success":true,"data":{"showBaseSchedule":true},"error":null}`

이 설정은 반복 정기·세션 일정에 적용하며, 반복 회차의 예외 일정도 함께 숨긴다. 개별 일정, 날짜별 정기 모임 회차와 그룹 정보는 변경하지 않는다.

## 개별 일정

### `POST /api/groups/{groupId}/events`

- 설명: 개별 일정 등록
- 권한: `LEADER`
- 요청 필드: `title`, `startDate`, `endDate`, `allDay`, `startTime`, `endTime`, `description`, `location`
- `eventType`을 생략하면 기존 동작대로 `INDIVIDUAL`로 처리한다. `REGULAR_MEETING`은 날짜가 하루로 고정되고 제목은 서버가 `정기 모임`으로 저장한다.
- `status`는 `AUTO`, `UPCOMING`, `COMPLETED` 중 하나다. `AUTO`는 과거 날짜에 `COMPLETED`, 오늘과 미래 날짜에 `UPCOMING`을 응답한다. 모임장은 `UPCOMING` 또는 `COMPLETED`로 덮어쓸 수 있고, `AUTO`로 되돌리면 날짜 기준 계산을 다시 적용한다. 생성 요청에서 생략하면 `AUTO`, 수정 요청에서 생략하면 기존 설정을 유지한다.
- `description`은 필수, `location`은 선택이다. `allDay=true`이면 시각 두 개를 `null`로 보내고, `allDay=false`이면 두 시각을 모두 지정한다.
- 응답: `201 Created`, 생성된 일정 정보와 `Location: /api/groups/{groupId}/events/{eventId}`

### `GET /api/groups/{groupId}/events/{eventId}`

- 설명: 개별 일정 또는 개별 수정한 반복 회차 상세 조회
- 권한: `MEMBER`
- 응답: `id`, `eventType`, `status`, `effectiveStatus`, `title`, `startDate`, `endDate`, `allDay`, `startTime`, `endTime`, `description`, `location`, `version`, nullable `recurrenceSourceDate`

### `PUT /api/groups/{groupId}/events/{eventId}`

- 설명: 개별 일정 전체 교체
- 권한: `LEADER`
- 요청: 등록 요청 필드에 조회한 `version`을 추가한다.
- 응답: 수정된 일정 정보와 증가한 `version`

### `DELETE /api/groups/{groupId}/events/{eventId}?version={version}`

- 설명: 개별 일정 삭제
- 권한: `LEADER`
- 응답: `204 No Content`. 삭제는 soft delete다.

개별 일정의 제목은 최대 50자, 장소는 최대 255자, 설명은 최대 10,000자다. 과거 날짜의 일정도 등록·수정할 수 있다. 종료된 그룹에서는 개별 일정을 변경할 수 없다.

반복 회차를 개별 수정한 뒤에는 위 `PUT/DELETE /events/{eventId}` 경로로 같은 안정 ID를 수정·삭제한다. 삭제된 연결 행은 원래 반복 날짜를 숨기는 tombstone으로 남아 규칙 변경이나 새로고침 뒤에도 회차가 다시 나타나지 않는다.

### `POST /api/groups/{groupId}/recurring-schedule/occurrences`

- 설명: 반복 정기 모임의 한 회차를 예외 일정으로 수정
- 권한: `LEADER`
- 요청: `sourceDate`, `periodId`, `seriesVersion`, 새 `startDate`, `allDay`, 선택적 `startTime`·`endTime`, `description`, 선택적 `location`과 `status`
- `sourceDate`는 기존 반복 규칙이 만든 원래 회차 날짜다. 새 날짜가 다른 반복 회차와 겹치면 `GROUP_EVENT_CONFLICT`로 거절한다.
- 제목은 `정기 모임`으로 고정한다. 설명은 필수, 장소는 선택이고, 종일/시간 지정 규칙과 회차 상태는 날짜별 정기 모임과 같다.
- 응답: `201 Created`, `GroupEvent`와 안정적인 일정 ID

### `DELETE /api/groups/{groupId}/recurring-schedule/occurrences`

- 설명: 원래 반복 규칙은 두고 선택한 회차 한 건만 달력에서 숨김
- 권한: `LEADER`
- 요청: `sourceDate`, `periodId`, `seriesVersion`
- 응답: `204 No Content`. 숨김 행은 soft delete로 보존하며 같은 반복 회차를 다시 표시하지 않는다.

수정·삭제 요청은 조회한 시리즈 `version`과 `periodId`를 함께 보낸다. 이미 예외 일정으로 바뀐 회차는 새로고침 후 기존 일정 ID의 수정·삭제 API를 사용한다.

### 날짜별 정기 모임

모임장은 종일 또는 시작·종료 시각, 장소(선택), 설명(필수)을 지정해 하루짜리 회차를 등록·수정·삭제할 수 있다. 기본 상태는 날짜에 따라 오늘·미래 `예정`, 과거 `개최 완료`로 계산한다. 모임장은 상태를 직접 `예정` 또는 `개최 완료`로 설정할 수 있으며 `날짜 기준 자동`으로 되돌릴 수 있다. 제목은 `정기 모임`으로 고정한다. 종일·시간 지정 모드 모두 필수 선택이며 과거 날짜도 등록할 수 있다. `CLUB`·`STUDY`만 지원하고, 반복 규칙이 같은 날짜에 회차를 이미 만들거나 변경 후 만들게 되면 `GROUP_EVENT_CONFLICT`를 반환한다. 삭제한 회차는 공개 달력에서 숨긴다.

## 정기 규칙

### `POST /api/groups/{groupId}/recurring-schedule/series`

- 설명: 첫 정기 규칙 등록
- 권한: `LEADER`
- 요청: `daysOfWeek`는 하나 이상의 요일이며, `startTime`·`endTime`은 함께 지정하거나 함께 `null`로 둔다.
- 첫 정기 등록은 오늘부터 적용하며 변경 범위 선택을 받지 않는다.
- 응답: `201 Created`, `seriesId`, `periodId`, `startDate`, `endDate`, `version`, `daysOfWeek`, `startTime`, `endTime`

### `GET /api/groups/{groupId}/recurring-schedule/manage`

- 설명: 현재 정기 일정 관리 정보 조회
- 권한: `LEADER`
- 응답: 현재 `seriesId`, 최신 `periodId`, 전체 표시 기간, `version`, 요일과 시각

### `GET /api/groups/{groupId}/recurring-schedule/periods/{periodId}`

- 설명: 선택한 회차 날짜에 적용된 정기 규칙 조회
- 권한: `LEADER`
- 응답: `periodId`, `effectiveFrom`, `effectiveUntil`, 시리즈 `version`, 요일과 시각

### `PUT /api/groups/{groupId}/recurring-schedule/scoped`

- 설명: 정기 규칙의 요일·시각 변경
- 권한: `LEADER`
- 요청: `daysOfWeek`, `startTime`, `endTime`, `applyScope`, `fromDate`, 캘린더 회차의 `periodId`, `version`
- `applyScope`는 `ALL`, `FROM_TODAY`다. 캘린더 회차에서 요청할 때 `periodId`로 해당 회차가 속한 반복 일정을 지정한다. `ALL`은 그 반복 일정의 모든 규칙 구간에 요일·시각을 적용한다. `FROM_TODAY`는 요청의 `fromDate`부터 포함해 이후 일정을 바꾸며, 해당 날짜를 기준으로 구간을 나눈다. `FROM_TODAY`에서 `fromDate`가 빠진 오래된 화면 요청은 새로고침 오류로 거절한다. 전체 시작·종료일은 별도 API로 수정한다.
- 위 범위는 반복 규칙 자체에 적용한다. `이 일정만`은 선택한 발생일에 예외 일정을 저장하므로 반복 규칙 변경 API가 아니라 `/recurring-schedule/occurrences` API를 사용한다.
- 응답: 증가한 시리즈 `version`

### `PUT /api/groups/{groupId}/recurring-schedule/periods/{periodId}`

- 설명: 구버전 화면의 규칙 구간 직접 수정 요청을 거절
- 권한: `LEADER`
- 요청: `daysOfWeek`, `startTime`, `endTime`, `version`
- 응답: `409 CALENDAR_CLIENT_OUTDATED`; 새 화면에서 날짜 기준 변경 범위를 선택해야 한다.

### `PUT /api/groups/{groupId}/recurring-schedule/calendar-range`

- 설명: 정기 일정 전체의 시작일·종료일 수정
- 권한: `LEADER`
- 요청: `startDate`, nullable `endDate`, `version`. 시작일은 모임 개설일보다 이를 수 없고, 종료일은 시작일보다 빠를 수 없다.
- 응답: 증가한 시리즈 `version`

### `DELETE /api/groups/{groupId}/recurring-schedule/scoped`

- 설명: 범위를 선택해 정기 규칙 제거
- 권한: `LEADER`
- 요청: `applyScope` (`ALL`, `FROM_TODAY`), `fromDate` (`FROM_TODAY`일 때 필수), 선택한 회차의 `periodId`, `version`
- 응답: `204 No Content`
- 규칙 삭제도 수정과 같은 선택 날짜 범위를 사용한다. 캘린더 회차에서 요청하면 `periodId`가 지정한 반복 일정에 적용하고, 관리 화면에서 요청하면 현재 반복 일정에 적용한다. `ALL`은 선택한 반복 일정의 정기 발생을 모두 숨기고, `FROM_TODAY`는 `fromDate`부터 정기 발생을 숨긴다. `이 일정만`은 occurrence 삭제 API를 사용한다.

## 공통 오류

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 인증이 필요한 요청에 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 그룹 모임장이 아님 또는 그룹원이 아님 | `GROUP_ACCESS_DENIED` | 403 |
| 그룹 또는 개별 일정 없음 | `GROUP_NOT_FOUND`, `GROUP_EVENT_NOT_FOUND` | 404 |
| 정기 규칙 또는 규칙 구간 없음 | `RECURRING_SCHEDULE_NOT_FOUND` | 404 |
| 요청 값·조회 범위·일정 기간이 올바르지 않음 | `INVALID_PARAMETER` | 400 |
| 종료된 그룹 또는 최신 버전과 충돌 | `GROUP_ENDED`, `GROUP_EVENT_CONFLICT` | 409 |
| 정기 규칙을 지원하지 않는 `SESSION` 그룹 | `SCHEDULE_TYPE_MISMATCH` | 400 |

## 기존 정기 일정 API 호환

기존 `PUT/DELETE /api/groups/{groupId}/recurring-schedule`은 구버전 화면 호환용이다. `GROUP_CALENDAR_LEGACY_RECURRING_WRITE_ENABLED=true`일 때만 허용하고 오늘 이후 범위로 이력을 함께 갱신한다. 기본값은 `false`이며, 비활성 상태에서 호출하면 `CALENDAR_CLIENT_OUTDATED` (`409`)를 반환한다. 기존 모임 정보 수정과 `SESSION` 일정 수정 API는 유지한다.
