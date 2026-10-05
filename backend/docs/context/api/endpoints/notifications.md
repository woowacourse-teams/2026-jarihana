# 알림함·웹푸시

> 상태: 알림함 API 6개, 구독·공개 설정·푸시 내용 조회 API 5개와 로그아웃 확장을 구현했다.
> 알림함 화면·Service Worker 연결은 구현했다. 실제 Push Service 수신·실기기 클릭과 배포는 별도 검증이 필요하다.

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
      "body": "신청이 승인되었습니다.",
      "createdAt": "2026-10-03T10:00:00",
      "readAt": null,
      "target": {
        "kind": "MY_REGISTRATIONS",
        "groupId": 12,
        "recruitmentId": 45
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
- `title`과 `body`는 사건 종류에 맞춰 서버가 제공하는 표시 문구다. 예시 문구는 응답 구조를 설명하기 위한 것이다.
- `target.kind`는 `LEADER_REGISTRATIONS` 또는 `MY_REGISTRATIONS`이며, 목적지에 필요한 `groupId`·`recruitmentId`를 포함한다.
- 클라이언트는 `target`을 내부 화면 경로로 해석한다. 외부 URL을 목적지로 전달하지 않는다.
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
    "body": "신청이 승인되었습니다.",
    "createdAt": "2026-10-03T10:00:00",
    "readAt": null,
    "target": {
      "kind": "MY_REGISTRATIONS",
      "groupId": 12,
      "recruitmentId": 45
    }
  },
  "error": null
}
```

- 목록의 개별 항목과 같은 응답 필드를 사용한다.
- 미삭제 본인 알림만 조회하며, 조회 자체로 읽음 상태를 변경하지 않는다.
- 클릭 후 클라이언트는 본인 알림·목적지를 확인하고 개별 읽음 API를 호출한 뒤 관련 화면으로 이동한다.

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
- payload 버전 1은 `groupId`, `recruitmentId`, `registrationId`를 포함하고 시스템 미승인에는 `reasonCode`를 추가한다.
- `reasonCode`는 `RERECRUITMENT` 또는 `GROUP_ENDED`다. 신청 본문·미승인 사유 문장·회원명은 포함하지 않는다.
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
