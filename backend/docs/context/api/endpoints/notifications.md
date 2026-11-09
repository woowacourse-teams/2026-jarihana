# 알림함·웹푸시

> 상태: 알림함 API 6개, 구독·공개 설정·푸시 내용 조회 API 5개, 기존 채팅 STOMP의 계정 활성 보고와 로그아웃 확장을 구현했다.
> 알림함 화면·Service Worker 연결을 구현했다. 환경별 검증 상태는 [웹푸시 운영 가이드](../../../operations/web-push.md#구현과-검증-상태)를 따른다.

[API 공통 설계](../common-contract.md)를 따른다. 구현 시 Controller·요청/응답 DTO·ErrorCode와
RestAssured 인수 테스트로 계약을 검증한다. 알림함 API는 Controller·DTO·ErrorCode와 인수 테스트에 반영했다. 선택 이유는
[백엔드 ADR 0015](../../../adr/0015-web-push-and-notification-inbox.md), 저장 규칙은
[알림·구독·전송 모델](../../domain/model/notification.md)에 있다.

## 공통 규칙

- 신규 API의 권한은 모두 가입 완료 회원인 `MEMBER`다. 회원 ID는 요청 본문이나 쿼리로 받지 않고 인증 정보에서 확인한다.
- `accessToken` 쿠키로 인증한다. 변경 요청은 `XSRF-TOKEN` 쿠키와 `X-XSRF-TOKEN` 헤더를 검증한다.
- 성공·오류 응답은 공통 봉투를 사용하며, `204 No Content` 응답에는 본문이 없다.
- 날짜·시간은 서울 기준 `YYYY-MM-DDTHH:mm:ss` 형식이다.
- 알림 조회·읽음·삭제, 구독 조회·변경, 푸시 내용 조회는 매 요청 회원 소유권을 확인한다. 없는 리소스와 다른 회원의 리소스는 동일한 `404`로 응답한다.
- 개인 목록·개별 조회·푸시 내용 응답에는 `Cache-Control: no-store`를 적용한다.
- 푸시 수신 주소와 암호화 키는 로그·분석 및 일반 구독 목록에 노출하지 않는다.
- 목록은 `createdAt DESC, id DESC` 기준 커서 페이지네이션을 사용한다. `size`의 기본값은 20이며 허용 범위는 1~100이다.

### 공통 예외

아래 예외는 각 엔드포인트의 개별 예외와 함께 적용한다.

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 인증 정보 없음 또는 만료 | `UNAUTHENTICATED` | 401 |
| 변경 요청의 CSRF 검증 실패 | `ACCESS_DENIED` | 403 |
| 처리되지 않은 서버 오류 | `INTERNAL_ERROR` | 500 |

## 알림함

### 공지·채팅 알림의 클라이언트 읽기 계약

목록, 상세, 안 읽은 수·푸시 내용 조회와 전체 읽음은 선택 쿼리 `clientVersion`을 받는다.
생략하거나 `1`이면 기존 계약이고, `2`이면 공지 알림을, `3`이면 공지와 채팅 알림을 포함한다. 그 외 값은
`400 INVALID_PARAMETER`로 거부한다. 저장된 `payloadVersion`은 계속 1이며
클라이언트의 이해 범위를 고르는 이 파라미터와 별개다.

- 계약 1에서는 공지와 채팅을, 계약 2에서는 `CHAT_MESSAGE_RECEIVED`를 DB 쿼리에서 제외한 뒤
  커서와 안 읽은 수를 계산한다. 지원하지 않는 종류의 상세·푸시 내용을 직접 요청하면 404다.
- 계약 2의 공지 알림은 제목 `새 공지`, 모임 이름이 들어간 안내와
  `target: {kind: GROUP_ANNOUNCEMENT, groupId, announcementId}`를 반환한다.
  푸시 payload에는 `groupId`, `announcementId`만 넣는다. 공지 제목·본문은 넣지 않는다.
- 모든 계약은 기존 인증·본인 알림·활성 구독·generation 검증을 유지한다.
  전체 읽음은 해당 계약에 표시하지 않는 공지·채팅 알림을 처리하지 않는다.
  개별 읽음·삭제는 계약 버전과 무관하게 본인 알림의 식별자로 처리한다.
- 프론트 API와 새 Service Worker는 `clientVersion=3`을 보낸다. 호환 선배포 단계의
  공지 알림 클릭은 모임 상세로 이동한다. 공지 기능 배포 후에는 별도 공지 권한 확인과
  상세 URL 이동으로 전환한다.
- 선행 호환 PR #490은 읽기 호환성만 준비하며 공지를 등록하거나 새 종류의 알림을 생성하지 않는다.
  DB event type 허용 범위 변경도 포함하지 않으며, 공지 사건 생성은 후속 #459의 V13 배포부터 시작한다.

- 채팅 알림은 계약 1·2의 목록·상세·안 읽은 수·푸시 내용·전체 읽음에서 제외한다.
  계약 3에서는 `target: {kind: GROUP_CHAT, groupId}`, 제목 `새 메시지`,
  본문 `‘모임 이름’ 모임에 새 채팅 메시지가 도착했습니다.`를 반환한다.
- 채팅 payload는 `groupId`만 포함하며 메시지 본문과 보낸 사람을 복사하지 않는다.
  클릭 시 현재 채팅 접근 권한을 조회한 뒤 읽음 처리하고 해당 채팅방을 연다.
- 채팅 푸시는 활성 SW 계약 3 구독에만 생성한다. 선점과 전송 준비 시 버전을 재검사하여
  이전 버전으로 바뀐 구독의 미완료 채팅 전송은 취소한다.

배포·롤백 순서는 [공지 알림 호환성 전환](../../../operations/announcement-notification-compatibility-rollout.md)을 따른다.

### 채팅 알림 읽기 선행 배포

- `CHAT_MESSAGE_RECEIVED`와 `payload: {groupId}`를 읽을 수 있다. 계약 3은 제목 `새 메시지`,
  본문 `‘모임 이름’ 모임에 새 채팅 메시지가 도착했습니다.`, `target: {kind: GROUP_CHAT, groupId}`를 반환한다.
- V20은 event type과 구독 버전 3의 DB 허용 범위만 넓힌다. 선행 PR #586은 채팅 메시지로 알림을 생성하지 않는다. 현재 기능 PR #579부터 생성한다.
- 선행 PR #586의 워커는 채팅 전송 작업을 선점하지 않고 일반 알림만 처리한다.
  현재 기능 PR #579의 워커는 활성 상태·읽음·묶음 처리 정책으로 채팅 전송을 판단한다.
- 백엔드 HTTP 읽기 호환 범위와 배포·롤백 하한은
  [채팅 알림 호환성 전환](../../../operations/chat-notification-compatibility-rollout.md)을 따른다.

### `GET /api/notifications`

- 설명: 본인의 알림함 목록 조회
- 권한: `MEMBER`

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `cursor` | X | 다음 페이지 커서. 첫 요청은 생략 |
| `size` | X | 기본 20, 최소 1, 최대 100 |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 501,
      "eventType": "REGISTRATION_APPROVED",
      "payloadVersion": 1,
      "title": "신청 승인",
      "body": "‘자바 스터디’ 모임의 신청이 승인되었습니다.",
      "createdAt": "2026-10-03T10:00:00",
      "readAt": null,
      "target": {
        "kind": "MY_GROUPS",
        "groupId": 12,
        "recruitmentId": 45,
        "registrationId": 123
      }
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

- 읽은 알림도 목록에 포함하며, 삭제된 알림만 제외한다.
- `readAt = null`이면 안 읽음이다.
- `title`은 사건 종류, `body`는 모임 이름과 발생한 일을 함께 표시한다. 모임 이름은 조회 시 현재 이름을 사용하며, 삭제된 모임은 `삭제된 모임`으로 표시한다. 목록의 모임 이름은 일괄 조회한다.
- `target.kind`는 사건에 따라 아래 목적지를 나타낸다. `recruitmentId`는 사건의 모집 식별 정보로 유지한다.

| 사건 | target.kind | 이동 경로 |
| --- | --- | --- |
| 새 모임 등록 (`GROUP_CREATED`) | `GROUP_DETAIL` | `/groups/{groupId}` |
| 새 가입 신청 | `LEADER_REGISTRATIONS` | `/groups/{groupId}/manage/registrations` |
| 새 구성원 참여 | `LEADER_MEMBERS` | `/groups/{groupId}/manage/members` |
| 신청 승인 | `MY_GROUPS` | `/my?focusGroup={groupId}` |
| 수동 미승인·재모집 미승인·모임 종료 미승인 | `MY_PAGE` | `/my?registrationStatus=REJECTED&focusRegistration={registrationId}` |
| 내 활동 기록의 새 댓글, 좋아요 | `ACTIVITY_POST` | `/activities?mine=true&post={activityPostId}` |
| 모임 공지 등록 | `GROUP_ANNOUNCEMENT` | `/groups/{groupId}/announcements/{announcementId}` |
| 모임 채팅 수신 (`CHAT_MESSAGE_RECEIVED`) | `GROUP_CHAT` | `/chat/{groupId}` |

- 클라이언트는 `target`을 내부 화면 경로로 해석한다. 외부 URL을 목적지로 전달하지 않는다.
- `GROUP_CREATED`의 `target`에는 `kind`, `groupId`만 포함한다. 알림함 제목은 `새 모임`, 본문은 `‘모임 이름’ 모임이 새로 등록되었습니다.`다. 기존 신청·참여 알림의 모집·신청 식별자는 유지한다.
- `GROUP_ANNOUNCEMENT_CREATED`의 `target`에는 `kind`, `groupId`, `announcementId`를 포함한다. 알림함 제목은 `새 공지`, 본문은 `‘모임 이름’ 모임에 새 공지가 등록되었습니다.`다.
- 목록 조회나 알림함을 여는 동작만으로 읽음 처리하지 않는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |

### `GET /api/notifications/{id}`

- 설명: 푸시 클릭 후 본인 알림과 이동할 화면 정보 조회
- 권한: `MEMBER`

#### Path Parameters

- `id`: 알림 식별자

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 501,
    "eventType": "REGISTRATION_APPROVED",
    "payloadVersion": 1,
    "title": "신청 승인",
    "body": "‘자바 스터디’ 모임의 신청이 승인되었습니다.",
    "createdAt": "2026-10-03T10:00:00",
    "readAt": null,
    "target": {
      "kind": "MY_GROUPS",
      "groupId": 12,
      "recruitmentId": 45,
      "registrationId": 123
    }
  },
  "error": null
}
```

- 목록의 개별 항목과 같은 응답 필드를 사용한다.
- 미삭제 본인 알림만 조회하며, 조회 자체로 읽음 상태를 변경하지 않는다.
- 알림함과 푸시 클릭은 같은 진입 경로에서 본인 알림을 조회하고 사건별 목적지로 이동한다. 관리 화면은 현재 모임장인지 확인한 뒤 읽음 처리한다. 승인과 미승인은 읽음 처리 후 마이페이지에서 해당 참여 모임 또는 미승인 신청을 찾아 포커스·강조한다. 권한 변경이나 모임 조회 403/404이면 읽음 처리 없이 알림함 복귀를 안내한다. 승인·미승인 알림은 모임 개별 조회 없이 마이페이지의 본인 목록에서 대상을 찾는다. 목록의 다음 페이지도 조회하며, 탈퇴·삭제 등으로 대상이 없으면 안내한다. `registrationId`는 같은 모임의 여러 신청 중 정확한 항목을 선택하는 데 사용한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 알림 ID 형식 오류 | `INVALID_PARAMETER` | 400 |
| 알림 없음, 다른 회원의 알림 또는 삭제된 알림 | `NOTIFICATION_NOT_FOUND` | 404 |

### `GET /api/notifications/unread-count`

- 설명: 본인의 안 읽은 알림 수 조회
- 권한: `MEMBER`

#### 요청

요청 값은 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "unreadCount": 4
  },
  "error": null
}
```

`unreadCount`는 본인의 미삭제 알림 중 `readAt = null`인 전체 개수다.

#### 예외

공통 예외를 따른다.

### `PATCH /api/notifications/{id}/read`

- 설명: 본인의 개별 알림 읽음 처리
- 권한: `MEMBER`

#### Path Parameters

- `id`: 알림 식별자

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "id": 501,
    "readAt": "2026-10-03T10:05:00"
  },
  "error": null
}
```

#### 부수 효과

- 최초 읽은 시각을 기록한다.
- 이미 읽은 알림의 반복 요청도 `200`이며, 최초 `readAt`을 유지한다.
- 읽음 처리 후에도 해당 항목은 알림함 목록에 남는다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 알림 ID 형식 오류 | `INVALID_PARAMETER` | 400 |
| 알림 없음, 다른 회원의 알림 또는 삭제된 알림 | `NOTIFICATION_NOT_FOUND` | 404 |

### `PATCH /api/notifications/read-all`

- 설명: 본인의 안 읽은 알림 전체 읽음 처리
- 권한: `MEMBER`

#### 요청

Request Body는 없다.

#### 응답 200

```json
{
  "success": true,
  "data": {
    "updatedCount": 4,
    "readAt": "2026-10-03T10:05:00"
  },
  "error": null
}
```

#### 부수 효과

- 화면에 불러온 한 페이지만이 아니라, DB UPDATE 시작 시점의 snapshot에 포함된 본인의 모든 미삭제·미읽음 알림을 처리한다.
- `updatedCount`는 이번 요청으로 읽음 상태가 변경된 알림 수다.
- 이미 읽은 항목의 최초 읽음 시각은 변경하지 않는다.
- UPDATE 시작 snapshot 뒤 생성되거나 커밋된 알림은 안 읽음으로 남는다.
- 읽음 표시만 변경하며 목록 항목을 삭제하거나 슬라이드 퇴장시키지 않는다.
- 응답 후 클라이언트는 목록과 안 읽은 수를 재조회한다. 요청 중 새로 도착한 알림까지 무조건 읽음으로 표시하지 않는다.

#### 예외

공통 예외를 따른다.

### `DELETE /api/notifications/{id}`

- 설명: 본인의 알림 삭제
- 권한: `MEMBER`

#### Path Parameters

- `id`: 알림 식별자

#### 요청

Request Body는 없다.

#### 응답 204 No Content

본문이 없다.

#### 부수 효과

- `deletedAt`을 기록하는 soft delete로 처리하고 일반 목록·안 읽은 수에서 제외한다.
- 본인이 이미 삭제한 알림을 다시 삭제해도 `204`로 응답한다.
- 원 신청·모집·그룹 데이터는 변경하지 않는다.
- 삭제한 알림의 미완료 푸시 전송 작업은 취소한다. 이미 외부 푸시 서비스가 수락했거나 전송 중인 요청의 회수는 보장하지 않는다.
- 클라이언트는 삭제 성공 후에만 해당 항목을 슬라이드 퇴장시킨다. 삭제가 실패하면 항목을 유지한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 알림 ID 형식 오류 | `INVALID_PARAMETER` | 400 |
| 알림 없음 또는 다른 회원의 알림 | `NOTIFICATION_NOT_FOUND` | 404 |

## 브라우저 구독

### `GET /api/push-config`

- 설명: 웹푸시 사용 가능 여부와 공개 설정 조회
- 권한: `MEMBER`

#### 요청

요청 값은 없다.

#### 응답 200 — 기능 활성

```json
{
  "success": true,
  "data": {
    "enabled": true,
    "vapidPublicKey": "<VAPID 공개키의 Base64URL 문자열>",
    "payloadVersions": [1]
  },
  "error": null
}
```

`vapidPublicKey`의 예시는 형식 설명용 값이며, 실제 응답에는 서버의 VAPID 공개키를 제공한다.

#### 응답 200 — 기능 비활성

```json
{
  "success": true,
  "data": {
    "enabled": false,
    "vapidPublicKey": null,
    "payloadVersions": [1]
  },
  "error": null
}
```

#### 예외

공통 예외를 따른다.

### `GET /api/push-subscriptions`

- 설명: 본인의 브라우저 구독 목록 조회
- 권한: `MEMBER`

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `cursor` | X | 다음 페이지 커서. 첫 요청은 생략 |
| `size` | X | 기본 20, 최소 1, 최대 100 |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "items": [{
      "id": 81,
      "generation": 1,
      "enabled": true,
      "lastSeenAt": "2026-10-03T09:00:00"
    }],
    "nextCursor": null,
    "hasNext": false
  },
  "error": null
}
```

- 구독 항목의 필드는 `id`, `generation`, `enabled`, `lastSeenAt`이다.
- `endpoint`, `p256dh`, `auth`는 응답에 포함하지 않는다.
- 접근 권한은 계정 기준이다. 클라이언트는 현재 브라우저에 보관한 구독 `id`·`generation`으로 현재 브라우저의 연결을 구분한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 잘못된 cursor 또는 size | `INVALID_PARAMETER` | 400 |

### `POST /api/push-subscriptions`

- 설명: 현재 브라우저의 푸시 구독 등록 또는 갱신
- 권한: `MEMBER`

#### 요청

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/<구독별 수신 주소>",
  "keys": {
    "p256dh": "<공개키의 Base64URL 문자열>",
    "auth": "<인증값의 Base64URL 문자열>"
  }
}
```

예시의 주소·키는 형식 설명용 값이며 실제 요청에는 브라우저가 발급한 값을 사용한다.

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `endpoint` | O | 허용 푸시 서비스 호스트의 HTTPS 주소. UTF-8 최대 2048바이트 |
| `keys.p256dh` | O | Base64URL 디코딩 후 65바이트인 P-256 공개키 |
| `keys.auth` | O | Base64URL 디코딩 후 16바이트인 인증값 |
| `clientVersion` | X | 실제 활성 SW가 확인한 푸시 지원 버전. 1(기본), 2(공지 지원), 3(공지·채팅 지원), null도 1. 범위 밖은 400 |

- `endpoint`는 HTTPS 443, userinfo·fragment 없음 등 데이터 모델의 주소 검증 규칙을 따른다. 내부 주소 접근을 막는다.
- 길이는 문자 수가 아닌 UTF-8 바이트 수로 검사한다. 검증 후 주소 원문을 저장하며 임의 재작성하지 않는다.
- 회원 ID는 요청에서 받지 않는다.

#### 응답 201 — 신규 등록

```json
{
  "success": true,
  "data": {
    "id": 81,
    "generation": 1,
    "enabled": true,
    "lastSeenAt": "2026-10-03T09:00:00"
  },
  "error": null
}
```

#### 응답 200 — 기존 구독 등록 또는 갱신

신규 등록과 같은 응답 필드를 사용하며 기존 구독의 현재 값을 반환한다.

#### 부수 효과

- `endpoint` 자체의 전역 DB UNIQUE 제약으로 중복을 막고 동시 등록에도 같은 계약을 적용한다.
- 같은 회원의 동일 `endpoint`·암호화 키·활성 상태 재요청은 기존 행을 사용하고 `generation`을 증가시키지 않는다.
- 비활성 구독 재연결·키 교체 시 `generation`을 증가시켜 과거 연결의 작업을 무효화한다.
- 다른 회원의 `endpoint`는 자동 양도하지 않는다. 계정 전환 시 브라우저의 기존 구독을 해제하고 새 구독을 생성해 현재 회원으로 등록한다.
- 구독을 새로 켜도 과거 알림함 기록의 전송 작업을 추가하지 않는다.
- 기존 구독의 `clientVersion`도 요청 값으로 갱신한다. 누락 시 1로 되돌리며 버전만 바뀌어도 `generation`은 유지한다.
- 새 프론트는 `registration.active`의 메시지 응답에서 확인한 지원 버전 1·2·3을 전송한다. 페이지나 설치·대기 중 SW 버전으로 추정하지 않는다.
- 공지 푸시는 지원 버전 2 이상인 구독에만 대기 작업을 만들며, 워커가 선점과 전송 준비 시 다시 검사한다. 미지원 구독의 기존 공지 작업은 취소한다. 일반 알림 전송에는 영향을 주지 않는다.
- 조회용 `clientVersion=2`나 push-content 404만으로 구버전 SW의 일반 OS 알림을 막을 수 없다. 서버 전송 대상 제한을 함께 사용한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 주소 형식·호스트·길이 또는 암호화 키 검증 실패 | `INVALID_PARAMETER` | 400 |
| 다른 회원의 endpoint 또는 허용되지 않는 재연결 | `PUSH_SUBSCRIPTION_CONFLICT` | 409 |
| 서버 웹푸시 기능 비활성 | `PUSH_UNAVAILABLE` | 503 |

### `DELETE /api/push-subscriptions/{id}`

- 설명: 본인의 브라우저 구독 연결 해제
- 권한: `MEMBER`

#### Path Parameters

- `id`: 푸시 구독 식별자

#### 요청

Request Body는 없다.

#### 응답 204 No Content

본문이 없다.

#### 부수 효과

- 구독 행을 물리 삭제하지 않고 `enabled = false`로 변경한다.
- 연결 해제 시 `generation`을 증가시키고 과거 연결의 미완료 전송 작업을 취소한다.
- 본인의 이미 해제된 구독을 다시 해제해도 `204`로 응답한다.
- 클라이언트는 현재 브라우저의 구독을 선택한다. 다른 브라우저의 연결은 유지한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 구독 ID 형식 오류 | `INVALID_PARAMETER` | 400 |
| 구독 없음 또는 다른 회원의 구독 | `PUSH_SUBSCRIPTION_NOT_FOUND` | 404 |

## 푸시 내용 조회

### `GET /api/notifications/{id}/push-content`

- 설명: Service Worker에서 현재 연결의 본인 알림 내용 조회
- 권한: `MEMBER`

#### Path Parameters

- `id`: 알림 식별자

#### Query Parameters

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `subscriptionId` | O | 현재 브라우저의 구독 식별자 |
| `generation` | O | 현재 브라우저 연결 버전. 양수 |

#### 응답 200

```json
{
  "success": true,
  "data": {
    "notificationId": 501,
    "eventType": "REGISTRATION_APPROVED",
    "payloadVersion": 1,
    "payload": {
      "groupId": 12,
      "recruitmentId": 45,
      "registrationId": 123
    }
  },
  "error": null
}
```

- 기존 `accessToken` 쿠키로 인증한다.
- 본인의 미삭제 알림, 본인의 활성 구독, 현재 `generation`을 모두 검증한다.
- payload 버전 1에서 `GROUP_CREATED`와 `CHAT_MESSAGE_RECEIVED`는 `groupId`만, `GROUP_ANNOUNCEMENT_CREATED`는 `groupId`, `announcementId`를 포함한다. 기존 신청·참여 사건은 `groupId`, `recruitmentId`, `registrationId`를 포함하고 시스템 미승인에는 `reasonCode`를 추가한다.
- 새 모임 등록 푸시는 제목 `자리하나?`, 본문 `새로운 모임이 등록되었어요.`로 표시한다. 알림함과 푸시 클릭은 동일한 본인 알림 확인 경로를 거쳐 새 모임 상세로 이동한다.
- `reasonCode`는 `RERECRUITMENT` 또는 `GROUP_ENDED`다. 신청 본문·미승인 사유 문장·회원명은 포함하지 않는다.
- 예외로 좋아요 알림(`ACTIVITY_POST_REACTED`)은 OS 알림 문구를 위해 `reactionSummary`에 가장 최근에 누른 회원의 `crewName`을 담는다. 자세한 형식은 아래 [활동 기록 알림 응답 확장 계약](#활동-기록-알림-응답-확장-계약)을 따른다.
- Service Worker는 사건 종류와 payload로 표시 문구를 구성한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 알림 ID·구독 ID·generation 형식 오류 또는 필수 쿼리 누락 | `INVALID_PARAMETER` | 400 |
| 알림 없음·타인·삭제, 구독 소유권·활성 상태·generation 불일치 | `NOTIFICATION_NOT_FOUND` | 404 |

### 푸시 수신 규칙

암호화 푸시 본문에는 아래 참조 정보만 담는다. HTTP API 응답 봉투와는 별개의 메시지다.

```json
{
  "notificationId": 501,
  "subscriptionId": 81,
  "generation": 1,
  "payloadVersion": 1
}
```

- Service Worker는 현재 활성 구독 `id`·`generation`을 내용 조회 전과 응답 수신 후에 다시 확인한다.
- 로그아웃·계정 전환 중인 이전 요청의 응답은 상세 알림 표시와 캐시에 반영하지 않는다.
- 네트워크·인증 확인 실패 시 상세 정보 없는 일반 안내를 사용한다.
- 클릭 뒤에는 앱의 기존 로그인·토큰 재발급 흐름에서 본인 알림을 확인한다.

## 기존 로그아웃의 호환 확장

### `POST /api/auth/logout`

- 설명: 기존 로그아웃과 함께 현재 브라우저의 푸시 연결 해제
- 권한: `AUTH`. 푸시 연결 해제는 가입 회원의 본인 구독에만 적용
- [인증·회원 API](auth-members.md)의 본문 없는 로그아웃을 유지하며 현재 브라우저 연결 해제를 선택적으로 처리한다.

#### 요청

기존처럼 Request Body 없이 호출할 수 있다. 푸시 연결을 함께 해제하려면 다음 본문을 전달한다.

```json
{
  "pushSubscriptionId": 81,
  "generation": 1
}
```

| 필드 | 필수 | 규칙 |
| --- | --- | --- |
| `pushSubscriptionId` | 본문 사용 시 O | 현재 브라우저의 구독 식별자 |
| `generation` | 본문 사용 시 O | 현재 브라우저 연결 버전. 양수 |

두 필드는 함께 존재하거나 Request Body 자체가 없어야 한다. 회원 ID는 입력으로 받지 않는다.
본문이 있다면 `Content-Type: application/json`을 사용한다. 빈 본문은 기존 호출 형식 그대로 허용한다.
JSON `null`, 잘못된 JSON, 필수 값 누락·0·음수는 `400`이다.

#### 응답 204 No Content

본문이 없다. 기존 인증 쿠키 만료와 가입 세션 처리를 유지한다.

#### 부수 효과

- 유효한 Access Token의 회원을 확인한다. Access Token이 만료됐으면 기존 Refresh Token 행의 소유 회원을 폐기 전에 읽는다.
- 해당 회원의 구독 소유권과 현재 `generation`을 검증한다.
- 검증 후 Refresh Token 폐기와 구독 비활성화·연결 버전 변경·미완료 전송 취소를 같은 트랜잭션에서 처리한다.
- 기존 로그아웃의 만료 Refresh Token·폐기 처리 의미를 바꾸지 않는다.
- 푸시 해제를 함께 요청할 때 Access Token 회원과 저장된 Refresh Token 회원이 다르면 `401`로 거절한다.
- 없는 구독·다른 회원의 구독·연결 버전 불일치는 거부하며 해당 구독을 변경하지 않는다.

#### 클라이언트 동작

- 서버 요청 전에 Service Worker의 로컬 푸시 처리를 중지하고 완료 확인을 받는다.
- 서버 요청이 실패하면 로그아웃 완료로 표시하지 않는다. 로컬 푸시는 중지 상태로 유지하고 오류·재시도를 제공한다.
- 현재 브라우저의 구독 정보를 사용하며 다른 브라우저의 연결은 유지한다.

#### 예외

| 상황 | 코드 | HTTP |
| --- | --- | --- |
| 본문의 필드 조합 또는 값 형식 오류 | `INVALID_PARAMETER` | 400 |
| 유효한 인증 정보 없음 | `UNAUTHENTICATED` | 401 |
| 구독 없음, 다른 회원의 구독 또는 generation 불일치 | `PUSH_SUBSCRIPTION_NOT_FOUND` | 404 |

## 인수 테스트 검증 항목

오류 코드는 `ErrorCode` enum과 실제 RestAssured 인수 테스트로 검증한다.

- 회원 소유권과 변경 요청의 CSRF 검증
- 커서 페이지네이션과 요청·응답 필드
- 반복 읽음·삭제·구독 등록 및 동시 중복 등록
- 전체 읽음의 전체 페이지 처리와 동시 알림 생성
- 삭제 후 재조회에서의 제외
- endpoint의 UTF-8 길이 경계와 주소·암호화 키 검증
- 계정 전환, Access Token 만료 시 Refresh Token만으로 로그아웃, 이전 연결 버전의 로그아웃
- 웹푸시 비활성 상태와 민감값 미노출

## 초대 알림 응답 확장 계약

> 상태: 백엔드 알림 저장·목록·개별 조회·푸시 내용 조회·전송 대기를 구현했다.
> 프론트 schema·초대 클릭·Service Worker의 전용 문구도 구현했다. 기존 알림 응답 형식은 유지한다.

[초대 API](invitations.md)의 DIRECT 신규 발급은 대상 회원 알림을 생성한다.
알림함 목록과 개별 조회는 다음 사건·표시 내용·target을 반환한다.
표의 title·body는 서비스 안의 알림함 표시값이며 OS 푸시 알림의 제목·본문과 구분한다.

| 응답 필드 | 초대 사건 |
| --- | --- |
| eventType | INVITATION_RECEIVED |
| payloadVersion | 1; 기존 알림과 동일, 사건 종류로 필수 데이터를 구분 |
| title | 모임 초대 |
| body | ‘현재 모임 이름’ 모임에 초대되었습니다. |
| target.kind | INVITATION |
| target.groupId | 초대한 모임 ID |
| target.invitationId | 초대 ID |

- target에 모집·신청 ID의 가짜 값을 넣지 않는다. 초대 target에는 recruitmentId·registrationId를 요구하지 않는다.
- 알림 목록·개별 조회의 회원 소유권 검사와 조회만으로 읽음 처리하지 않는 계약을 유지한다.
- 푸시 내용 조회는 payload에 groupId·invitationId만 제공한다. 초대 메시지·원본 토큰은 포함하지 않는다. 실제 푸시 전송 참조의 payloadVersion과 push-config의 payloadVersions도 기존 1을 유지한다.
- OS 푸시 알림은 Service Worker가 제목 '자리하나?'와 본문 '새 모임 초대가 도착했어요.'로 표시한다. 초대에는 개인 메시지가 없다.
- 클릭·인증 복귀·대상 확인·읽음 처리 순서는 [프론트 초대 계약](../../../../../frontend/docs/IMPLEMENTATION_MAP.md#초대-기능-설계-계약)을 따른다.

초대 알림도 기존 삭제 API를 사용한다. 삭제는 알림함 표시와 미전송 푸시를 취소하며 초대의 상태와 수락 이력은 변경하지 않는다. 거절 이력은 생성하지 않는다.

## 활동 기록 알림 응답 확장 계약

> 상태: 댓글과 좋아요 알림의 저장, 목록, 개별 조회, 푸시 내용 조회, 전송 대기를 구현했다.
> 프론트 schema, 기록 상세로 이동, Service Worker 문구도 구현했다. 기존 알림 응답 형식은 유지한다.

[활동 기록 API](activity-posts.md)의 댓글 작성과 하트 추가는 기록 작성자의 알림을 만든다.
저장과 묶음 규칙은 [알림 모델](../../domain/model/notification.md)을 따른다.

| 응답 필드 | 새 댓글 | 좋아요 |
| --- | --- | --- |
| eventType | `ACTIVITY_POST_COMMENTED` | `ACTIVITY_POST_REACTED` |
| payloadVersion | 1 | 1 |
| title | `새 댓글` | `좋아요` |
| body | `‘현재 모임 이름’ 모임 활동 기록에 새 댓글이 달렸습니다.` | 아래 좋아요 문구 |
| target.kind | `ACTIVITY_POST` | `ACTIVITY_POST` |
| target.groupId | 기록의 모임 ID | 기록의 모임 ID |
| target.activityPostId | 활동 기록 ID | 활동 기록 ID |

좋아요 문구는 조회할 때 기록의 현재 하트로 만든다. 인원은 기록 작성자 본인의 하트를 뺀 수다.

| 현재 인원 | body |
| --- | --- |
| 1명 | `가온님이 좋아요를 눌렀어요.` |
| 2명 이상 20명 이하 | `가온 외 2명이 좋아요를 눌렀어요.`(가장 최근에 누른 회원과 나머지 인원) |
| 20명 초과 | `회원님의 댓글이 무수한 관심을 받고 있어요.` |
| 0명(모두 취소) | `‘현재 모임 이름’ 모임 활동 기록의 좋아요가 모두 취소되었습니다.` |

- target에는 모집, 신청, 초대 ID를 넣지 않는다. 기존 사건의 target에는 activityPostId를 추가하지 않는다.
- 푸시 내용 조회의 payload는 `groupId`, `activityPostId`만 담는다. 댓글 내용은 담지 않는다.
- 좋아요 알림의 푸시 내용 조회에는 `reactionSummary`를 더한다. 하트가 모두 취소됐으면 이 필드를 생략한다. 다른 사건에는 넣지 않는다.

```json
{
  "notificationId": 601,
  "eventType": "ACTIVITY_POST_REACTED",
  "payloadVersion": 1,
  "payload": { "groupId": 12, "activityPostId": 77 },
  "reactionSummary": { "latestReactorName": "가온", "otherReactorCount": 2 }
}
```

- 하트를 누른 회원 목록은 활동 기록 화면에서도 공개되는 정보라, 이 사건에 한해 OS 알림에 이름을 표시한다.
  이름은 암호화 푸시 본문이 아니라 연결과 소유권을 확인한 푸시 내용 조회 응답으로만 전달한다.
- OS 푸시 알림의 제목은 `자리하나?`다. 본문은 새 댓글이면 `내 활동 기록에 새 댓글이 달렸어요.`이고, 좋아요는
  `reactionSummary`로 위 표와 같은 문구를 만든다. 요약이 없거나 형식이 맞지 않으면 `내 활동 기록에 좋아요가 도착했어요.`를 쓴다.
- 클릭하면 `/notifications/open/:id`에서 본인 알림과 모임을 확인하고 읽음 처리한 뒤 내가 쓴 기록 피드의 해당 기록 상세를 연다.

## 모임 공지 알림 응답 확장 계약

> 상태: 공지 등록 알림의 저장, 알림함 응답, 푸시 내용 조회와 전송 대기를 구현했다.
> 알림 확인 경로의 공지 권한 검사·읽음 처리·상세 이동과 Service Worker 표시 문구도 프론트엔드에 연결했다.

공지 등록은 작성자를 제외한 현재 모임 구성원에게 알린다. 알림함 행은 푸시 구독 여부와 관계없이 저장하며, 당시 활성 구독별 전송 대기를 만든다.

| 응답 필드 | 값 |
| --- | --- |
| eventType | `GROUP_ANNOUNCEMENT_CREATED` |
| payloadVersion | 1 |
| title | `새 공지` |
| body | `‘현재 모임 이름’ 모임에 새 공지가 등록되었습니다.` |
| target.kind | `GROUP_ANNOUNCEMENT` |
| target.groupId | 공지가 속한 모임 ID |
| target.announcementId | 공지 ID |

- 푸시 내용 조회의 payload에는 `groupId`, `announcementId`만 포함한다. 공지 제목·본문과 공개 범위는 알림 payload에 복사하지 않는다.
- 공개 범위가 `PUBLIC`이어도 알림 수신자는 공지 모임의 현재 구성원으로 한정한다.

```json
{
  "notificationId": 701,
  "eventType": "GROUP_ANNOUNCEMENT_CREATED",
  "payloadVersion": 1,
  "payload": { "groupId": 12, "announcementId": 101 }
}
```

### 채팅 알림 배포 경계

`V20__chat_message_notifications.sql`은 새 사건과 구독 계약 3을 허용한다.
브라우저 계약 1·2 호환 처리와 별개로, 이전 백엔드는 새 사건 enum과 구독 계약 3을
해석하지 못한다. 신규 사건을 기록하기 전 모든 요청·푸시 처리 서버가 이를 읽을 수 있어야 한다.
선행 읽기 호환 PR #586은 병합되어 이 브랜치에 반영했다. 환경별 실제 배포 성공은
[채팅 알림 호환성 전환](../../../operations/chat-notification-compatibility-rollout.md)에 따라 별도로 확인해야 한다. 신규 행이 생긴 뒤
이를 지원하지 않는 백엔드로 바로 롤백하지 않는다. 운영 배포와 실제 기기의 푸시 수신은
로컬 통합 테스트의 검증 범위에 포함되지 않는다.

### 계정 활성 보고

정책과 저장소 선택, 작성자가 수용한 장애 영향은
[백엔드 ADR 0030](../../../adr/0030-account-activity-and-unlogged-chat-push.md)을 따른다.

기존 채팅 STOMP 연결의 `SEND /app/presence/active`만 활성 보고에 사용한다. 본문은 비운다.
서버는 인증된 소켓의 회원과 주입 Clock의 시각만 사용하고, 클라이언트 회원 ID·시각은 사용하지 않는다.
기존 handshake 인증·Origin·CONNECT CSRF 검증과 개인 구독 제한을 유지한다.
별도 소켓이나 활성 보고용 HTTP 폴링은 만들지 않는다. 기존 `PUT /api/chats/view`는 제거한다.

활성 조건은 로그인, `document.visibilityState === "visible"`, `document.hasFocus()`,
마지막 사용자 활동 후 5분 미만을 모두 만족하는 것이다. 마우스 이동·클릭·키보드 입력·스크롤·터치를
활동으로 기록하며 마우스 이동의 로컬 시각 갱신은 1초에 한 번으로 제한한다.
스크롤은 휠·터치·키보드·마우스 입력으로 감지하며, 새 메시지의 자동 스크롤 등 `scroll` 이벤트 자체는 활동으로 처리하지 않는다.
최초 진입과 활성 화면 복귀는 활동이지만, 소켓 재연결 자체는 활동이 아니다.
다른 탭·앱에서 발생한 활동은 현재 페이지의 활동으로 계산하지 않는다.

활성일 때만 10초마다 보고하며 매 전송 직전에 조건을 다시 확인한다.
활동 재개·화면 복귀·소켓 재연결 시에도 현재 조건을 만족하면 즉시 보고한다.
끊긴 동안의 신호는 쌓거나 재전송하지 않는다. 숨김·포커스 해제·5분 무활동은 보고만 중단하며,
배지를 받는 소켓을 의도적으로 끊지 않는다. 로그아웃·계정 전환은 이전 타이머와 소켓을 정리한다.

`member_activity`는 계정당 한 행의 `last_active_at`을 저장한다. 여러 화면의 보고가 같은 행을 갱신하며
시각이 과거로 돌아가지 않도록 한다. 화면 종료·연결 종료 때 행을 삭제하거나 비활성으로 덮어쓰지 않는다.
모든 화면의 보고가 멈춘 뒤 마지막 보고로부터 **15초**가 지나면 비활성이다. 여러 백엔드와 워커가 같은 DB를 조회한다.
10초 보고가 5초 이상 늦거나 유실되면 실제 사용 중에도 잠시 비활성으로 판단할 수 있다.
WebSocket을 재사용해도 DB 갱신 비용은 남는다.

### 채팅 푸시 보류와 재판정

푸시 워커는 선점과 전송 준비 시 계정 활성 상태와 원본 채팅의 읽음 순번을 확인한다.
어느 기기에서든 홈·모임 상세 등 서비스를 활성 상태로 사용하면 **모든 방의 채팅 푸시를 보류**한다.
푸시 권한·구독이 없는 기기도 적용하며 다른 종류의 알림은 이 정책에 포함하지 않는다.

- 활성 중에는 영구 취소하지 않고 다음 판단 시각을 예약한다. 보류는 외부 전송 실패 횟수를 소진하지 않는다.
- 보류 중 원본 메시지를 읽으면 해당 전송을 취소한다. 활성 신호·배지 수신 자체는 읽음이 아니다.
- 마지막 보고 후 15초가 지나면 다음 워커 처리에서 미읽음 전송을 다시 판단한다. **활성 중 받은 미읽음 메시지도 비활성 전환 후 푸시가 올 수 있다.**
- 같은 계정·구독·방의 누적 전송은 최신 메시지를 대표로 묶고, 메시지별 알림함 기록은 유지한다.
- 기존 전송 만료 시각을 연장하지 않는다. 여러 워커는 구독별 선점 잠금과 lease token으로 같은 방의 전송을 중복 선점하지 않는다. 선점은 오래된 판단 예정 시각을 우선한다.

원본 메시지는 기존 `chat-message:{id}:created` 사건 키로 찾고 `chat_read_state.last_read_sequence`와 비교한다.
원본을 찾을 수 없거나 모임이 일치하지 않는 채팅 전송은 취소한다. 전송 준비의 보류·취소·발송 판정은 하나의 DB 스냅샷에서 수행한다.
알림함 읽음과 채팅 읽음은 구분한다. Service Worker에서 도착한 push를 무음으로 소비하는 방식은 사용하지 않는다.
전송 준비 후 활성·읽음 상태가 바뀌면 이미 시작한 외부 전송은 도착할 수 있다.
외부 서비스 수락 직후 워커가 중단되는 경계의 정확히 한 번 전송은 보장하지 않는다.

### 활성 상태 마이그레이션

알림 읽기 호환 마이그레이션은 `V20__chat_message_notifications.sql`을 유지한다.
`V30__chat_views.sql`은 `chat_views`를 만든다. `V31__member_activity_and_deferred_chat_push.sql`은 `member_activity`와 묶음 조회 인덱스를 만들고 `chat_views`를 제거한다.
`V32__member_activity_unlogged.sql`은 `member_activity`와 그 인덱스를 UNLOGGED로 전환한다. 회원·메시지·읽음·알림·전송 대기는 LOGGED를 유지한다.
전환은 테이블 재작성·ACCESS EXCLUSIVE 잠금을 수반한다. PostgreSQL 비정상 종료 뒤 재보고 전까지 일시적인 추가 푸시가 갈 수 있다는 영향은 ADR 결정자가 수용했다.
기존 `chat_views`를 조회하는 구버전 워커와 새 스키마를 동시에 운영할 수 없으므로,
전환 시 이전 워커를 먼저 중단하고 새 서버·프론트를 함께 적용해야 한다.
운영 배포 및 실제 기기의 외부 푸시 수신은 로컬 검증과 구분한다.
