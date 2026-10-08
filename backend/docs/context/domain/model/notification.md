# 알림·브라우저 구독·전송 작업

> 상태: 데이터 모델·업무 이벤트·알림함·구독 API·푸시 워커·화면·Service Worker 연결을 구현했다.
> 환경별 검증 상태는 [웹푸시 운영 가이드](../../../operations/web-push.md#구현과-검증-상태)를 따른다.

선택 이유는 [백엔드 ADR 0015](../../../adr/0015-web-push-and-notification-inbox.md)에 있다.
계약은 [알림 API](../../api/endpoints/notifications.md)와 함께 구현·검증한다.

## 세 테이블을 읽는 방법

예를 들어 한 회원의 신청이 승인되고, 그 회원이 휴대폰과 노트북에서 푸시를 켜 두었다고 하자.

| 테이블 | 답하는 질문 | 이 예시에서의 데이터 |
| --- | --- | --- |
| `notifications` | 누구에게 어떤 소식이 생겼고, 읽거나 삭제했는가? | 승인 알림 1행 |
| `push_subscriptions` | 그 회원의 어느 브라우저로 푸시를 보낼 수 있는가? | 미리 등록한 휴대폰·노트북 구독 2행 |
| `notification_deliveries` | 그 알림을 각 브라우저에 보내는 일이 어디까지 진행됐는가? | 휴대폰 전송 작업 1행 + 노트북 전송 작업 1행 |

휴대폰 전송이 수락되고 노트북 전송이 실패하면 노트북 작업만 다시 시도한다.
회원이 휴대폰에서 알림을 읽으면 알림 1행의 `readAt`을 바꾸므로 다른 브라우저에서도 읽음으로 보인다.
아래 필드 표의 마지막 열은 각 값이 이 흐름에서 왜 필요한지 설명한다.

## Notification (`notifications`)

회원이 알림함에서 확인하는 사건 기록이다. 신청·참여 사건은 푸시 허용 여부와 무관하게 저장한다.
새 모임 등록 사건은 생성자를 제외한 활성 푸시 구독 회원에게만 저장한다.

| 필드 | 타입/DB | 규칙 | 왜 필요한가 · 예시 |
| --- | --- | --- | --- |
| id | Long / bigint PK | 알림 식별자 | 알림 한 건을 가리키는 번호다. 사용자가 특정 알림을 읽거나 삭제하거나 푸시를 클릭했을 때 이 번호로 찾는다. |
| member | Member / member_id FK | NOT NULL, 수신 회원 | 누구의 알림인지 정한다. 본인의 목록만 조회하고 다른 회원의 알림을 읽거나 삭제하지 못하게 한다. |
| eventKey | String / varchar(160) | 서버가 생성하는 사건 의미키, NOT NULL | 같은 사건을 두 번 처리해도 알림을 중복 생성하지 않기 위한 이름이다. 예: `registration:123:approved`. `member`와 묶어서 회원당 한 건만 허용한다. |
| eventType | enum / varchar(50) | 사건 종류, NOT NULL | 새 신청인지 승인 결과인지 구분해 표시 문구와 이동할 화면을 결정한다. `eventKey`가 특정 사건의 이름이라면 이 값은 사건의 종류다. |
| payloadVersion | int / smallint | 최초1, 양수 | 저장된 알림 내용의 형식 번호다. 나중에 내용 구조를 바꾸더라도 예전 형식의 알림을 올바르게 해석할 수 있다. |
| payload | JSON object / jsonb | groupId, recruitmentId, registrationId, 시스템 미승인 원인 분류 | 어느 그룹·모집·신청에서 생긴 소식인지 기억한다. 클릭할 목적지와 시스템 미승인의 원인을 구분하는 데 사용한다. |
| readAt | LocalDateTime | nullable, 최초 읽음 시각 | 비어 있으면 안 읽음, 값이 있으면 읽음이다. 안 읽은 개수와 표시를 계산하며 전체 읽음도 이 값만 채운다. |
| deletedAt | LocalDateTime | nullable, 일반 조회 제외 시각 | 사용자가 삭제했는지 기록한다. 값이 있으면 목록에서 숨기되 행은 남겨서 같은 사건 재처리로 알림이 다시 생기는 것을 막는다. |
| createdAt | LocalDateTime | BaseEntity, NOT NULL | 소식이 저장된 시각이다. 알림함을 최신순으로 정렬하고 다음 페이지를 조회하는 기준으로 쓴다. |
| updatedAt | LocalDateTime | BaseEntity, NOT NULL | 읽음·삭제 등 마지막 변경 시각이다. 언제 알림 상태가 바뀌었는지 확인하는 공통 기록이다. |

타입: GROUP_CREATED, REGISTRATION_SUBMITTED, PARTICIPANT_JOINED, REGISTRATION_APPROVED,
REGISTRATION_REJECTED, REGISTRATION_SYSTEM_REJECTED.
시스템 미승인 원인: RERECRUITMENT 또는 GROUP_ENDED. 사유 본문·신청 내용·토큰은 payload에 넣지 않는다.

유일키는 `(event_key, member_id)`다. 예: `registration:123:approved`.
모임 등록은 `group:123:created`를 사용하며 payload에는 `groupId`만 저장한다.
모집·신청 사건의 `recruitmentId`, `registrationId` 필수 규칙은 유지한다.
같은 사건 재처리는 기존 행을 재사용한다. 삭제된 행도 이 유일키에 남겨 알림이 부활하지 않게 한다.
새 알림을 실제 생성한 경우에만 구독별 전송 대기를 생성한다.
이 정책은 soft delete 유일키 충돌을 새 INSERT로 해결하지 않는 이 기능의 설계 기준이다.

목록 인덱스: `(member_id, created_at DESC, id DESC) WHERE deleted_at IS NULL`.
안 읽음 인덱스: `(member_id, id) WHERE deleted_at IS NULL AND read_at IS NULL`.
업무 ID는 payload의 값이며 업무 테이블 FK를 두지 않는다. 그룹·신청 물리 삭제 후에도 알림 기록은
남고, 클릭 시 없어진 목적지를 안전하게 처리한다. 회원 FK는 기본 삭제 제한을 유지한다.

알림함의 제목은 사건 종류, 본문은 현재 모임 이름과 발생한 일을 함께 표시한다.
모임 이름은 목록 단위로 일괄 조회하며 별도 스냅샷 필드를 두지 않는다. 삭제된 모임은 `삭제된 모임`으로 표시한다.
클릭 목적지는 사건별로 신청 관리·참여자 관리·마이페이지의 해당 참여 모임·미승인 신청으로 나뉜다. 구체적인 경로는 알림 API 계약을 따른다. 관리 화면의 접근 확인 실패 시 읽음 처리 없이 복귀를 안내하며, 승인·미승인은 모임 개별 조회 없이 마이페이지의 본인 목록에서 해당 모임·신청을 찾아 강조한다.

## PushSubscription (`push_subscriptions`)

물리적 기기 대신 실제 브라우저의 PushSubscription을 저장한다.

| 필드 | 타입/DB | 규칙 | 왜 필요한가 · 예시 |
| --- | --- | --- | --- |
| id | Long / bigint PK | 구독 식별자, NOT NULL | 서버가 브라우저 구독 한 건을 찾는 번호다. 특정 구독을 해제하거나 전송 작업과 연결할 때 사용한다. |
| member | Member / member_id FK | 소유 회원, NOT NULL | 이 브라우저가 어느 회원의 푸시를 받는지 정한다. 해당 회원에게 소식이 생기면 그 회원의 활성 구독을 찾는다. |
| endpoint | String / varchar(2048) | 검증된 HTTPS push 주소, NOT NULL, 전역 UNIQUE, UTF-8 최대2048바이트 | 브라우저가 발급받은 푸시 수신 주소다. 서버는 이 주소로 외부 푸시 서비스에 전송을 요청한다. 주소 자체에 DB 유일 제약을 걸어 같은 구독의 중복 등록을 막는다. |
| p256dh | String | Base64URL 공개키65바이트 | 푸시 내용을 해당 브라우저가 풀어 읽을 수 있게 암호화하는 데 필요한 공개키다. 브라우저가 구독 생성 시 제공한다. |
| auth | String | Base64URL 인증값16바이트 | `p256dh`와 함께 푸시 내용 암호화에 쓰는 값이다. 브라우저가 제공하며 회원 로그인 토큰과는 별개다. |
| enabled | boolean | 활성 연결 여부, 해제는 false | 지금 이 구독에 보낼 수 있는지 판단한다. 사용자가 푸시를 끄거나 현재 브라우저에서 로그아웃하면 비활성화한다. |
| generation | long | 양수, 연결 해제·재연결·키 교체 시 증가 | 브라우저 연결의 버전 번호다. 예전 연결에서 만든 전송 작업을 새 연결에 보내지 않도록 한다. 연결 버전 3에서 만든 작업은 현재 버전이 4라면 취소한다. |
| lastSeenAt | LocalDateTime | 최근 등록·갱신 시각 | 브라우저가 마지막으로 구독을 등록하거나 갱신한 시점을 확인한다. 구독 상태를 점검하는 기록이며 계속 온라인인지 확인하는 값은 아니다. |
| disabledAt | LocalDateTime | nullable, 연결 해제 시각 | 언제 구독이 비활성화됐는지 확인한다. `enabled`가 현재 상태를 나타내고 이 값은 해제 시점을 남긴다. |
| createdAt | LocalDateTime | BaseEntity, NOT NULL | 구독 행을 처음 만든 시각이다. 구독 목록 정렬과 등록 이력 확인에 사용한다. |
| updatedAt | LocalDateTime | BaseEntity, NOT NULL | 키 교체·연결 해제 등 구독 정보를 마지막으로 바꾼 시각이다. |

활성 인덱스: `(member_id, id) WHERE enabled = true`.
구독 목록 인덱스: `(member_id, created_at DESC, id DESC)`. 비활성 구독도 목록에 포함한다.
`endpoint` 원문에 전역 UNIQUE를 두며 비활성 행도 포함한다. 중복 조회만으로 끝내지 않고 DB 제약으로
동시 등록도 막는다. 검증 후 원문을 저장하며 주소를 임의 재작성하지 않는다.
API에서 UTF-8 최대2048바이트를 검사하고 DB에도 `CHECK (octet_length(endpoint) BETWEEN 1 AND 2048)`을 둔다.
문자 수만으로 제한하지 않으며 최대 길이 저장·중복·동시 등록을 실제 PostgreSQL에서 검증한다.
같은 회원의 동일 endpoint·키·활성 상태 재시도는 행과 generation을 유지한다.
키 교체 또는 비활성 구독 재연결은 generation을 증가시킨다.
다른 회원에게 속한 endpoint는 자동 양도하지 않고409를 반환한다. 계정 전환 시 브라우저의 기존
구독을 해제한 뒤 새 구독을 생성해 현재 회원으로 등록한다.

endpoint는 HTTPS443, userinfo/fragment 없음, 허용 push 서비스 호스트만 허용한다.
private/link-local/redirect 등 내부 주소 접근을 막는다.
endpoint·키는 로그·분석·일반 구독 목록에 노출하지 않는다.

브라우저 연결은 구독 `id`와 `generation`으로 구분하며 별도 구독용 비밀값을 발급하지 않는다.
접근 권한은 계정 기준이다. 서버는 인증된 회원과 알림·구독의 소유 회원을 비교한다.
같은 회원의 여러 브라우저 중 실제 요청 브라우저를 서버가 별도로 증명하는 계약은 두지 않는다.
UI는 현재 브라우저의 구독을 선택하며, Service Worker는 현재 연결을 조회 전과 응답 수신 후에
다시 확인하고 로그아웃 때 푸시 처리를 중지한다.

## NotificationDelivery (`notification_deliveries`)

알림과 구독을 연결하는 Outbox 전송 작업이다. 같은 사건 트랜잭션에서 당시 활성 구독 수만큼 생성한다.

| 필드 | 타입/DB | 규칙 | 왜 필요한가 · 예시 |
| --- | --- | --- | --- |
| id | Long / bigint PK | 작업 식별자 | 푸시 전송 작업 한 건을 찾는 번호다. 워커가 작업을 가져오고 결과를 기록할 때 사용한다. |
| notification | Notification / notification_id FK | NOT NULL, 알림 참조 | 어떤 소식을 보내는 작업인지 정한다. 같은 알림에 휴대폰 작업과 노트북 작업이 각각 연결될 수 있다. |
| pushSubscription | PushSubscription / push_subscription_id FK | NOT NULL, 구독 참조 | 어느 브라우저에 보내는 작업인지 정한다. 그 구독의 수신 주소와 암호화 키를 찾는다. |
| subscriptionGeneration | long | 작업 생성 당시 연결 버전 | 작업이 만들어질 때 구독의 `generation`을 복사한다. 전송 전 현재 값과 비교해서 연결 해제·재연결로 오래된 작업이 됐는지 판단한다. |
| status | enum | PENDING, IN_FLIGHT, RETRY, ACCEPTED, FAILED, CANCELLED | 대기·처리 중·재시도·수락·실패·취소를 구분한다. 워커가 처리할 작업과 이미 끝난 작업을 판단한다. |
| attemptCount | int | >=0, 최초 시도 포함 최대5 | 지금까지 몇 번 전송을 시도했는지 센다. 장애가 나도 같은 요청을 무한히 반복하지 않도록 상한을 적용한다. |
| nextAttemptAt | LocalDateTime | 다음 처리 가능 시각 | 실패 직후 계속 재요청하지 않도록 다음 시점을 정한다. 예: 10:00:00에 실패하고 이 값이 10:00:05면 그때까지 기다린다. |
| expiresAt | LocalDateTime | 생성 후24시간 유효기간 | 소식이 너무 오래되면 전송 시도를 끝내는 기한이다. 이 기한이 지나도 알림함 기록은 남는다. |
| leaseToken | UUID | IN_FLIGHT 동안만 존재, 선점 식별자 | 이번에 작업을 가져간 워커에게 주는 표식이다. 작업을 다른 워커가 이어받았다면 예전 워커의 늦은 결과로 새 상태를 덮어쓰지 못하게 한다. |
| lockedUntil | LocalDateTime | IN_FLIGHT 동안만 존재, 선점 만료 시각 | 이번 워커가 처리할 수 있는 시간의 끝이다. 워커가 전송 도중 멈춰도 이 시간이 지나면 다른 워커가 작업을 다시 가져갈 수 있다. |
| acceptedAt | LocalDateTime | nullable, 외부 푸시 서비스 수락 시각 | 외부 푸시 서비스가 요청을 받아들인 시각을 기록한다. 브라우저에 실제 표시된 시각이나 사용자가 읽은 시각과는 다르다. |
| lastErrorCode | String | nullable, 제한된 결과 분류. 원격 body 보관 안 함 | 네트워크 실패 등 마지막 실패 원인을 정해진 코드로 남긴다. 외부 응답 전문과 민감한 정보를 저장하지 않고도 문제 유형을 확인할 수 있다. |
| createdAt | LocalDateTime | BaseEntity, NOT NULL | 전송 작업을 만든 시각이다. 유효기간의 기준과 전송 지연 확인에 사용한다. |
| updatedAt | LocalDateTime | BaseEntity, NOT NULL | 마지막 시도·재시도 예약·수락 등 작업 상태를 바꾼 시각이다. 멈춘 작업을 점검할 때 참고한다. |

외부 HTTP 응답 코드는 전송 처리 중 수락·재시도·실패를 판단하는 데 사용한다.
DB에는 작업 `status`와 제한된 `lastErrorCode` 분류를 남긴다.

`generation`과 `leaseToken`은 서로 다른 문제를 해결한다.
전자는 **연결이 바뀌었으니 과거 푸시를 보내지 말라**는 검증이고,
후자는 **담당 워커가 바뀌었으니 과거 워커의 결과를 반영하지 말라**는 검증이다.

유일키: `(notification_id, push_subscription_id, subscription_generation)`.
due 인덱스: `(next_attempt_at, id)`의 PENDING/RETRY partial index.
만료 선점 인덱스: `(locked_until, id)`의 IN_FLIGHT partial index.
구독별 취소 인덱스: `(push_subscription_id, subscription_generation)`의 PENDING/RETRY/IN_FLIGHT partial index.
status·attemptCount·lease 필드 일관성을 DB check 제약과 도메인 테스트로 검증한다.

## 상태·동시성 규칙

- 실제 업무 변경 성공 후 동기 BEFORE_COMMIT 리스너가 알림과 전송 대기를 같은 TX에 기록한다.
- 신청·참여 사건은 구독0개여도 알림을 저장한다. 모임 등록 사건은 당시 활성 구독이 있는 회원만 대상으로 하며 생성자와 탈퇴 회원은 제외한다. 회원당 알림 1건, 활성 브라우저 구독당 전송 1건을 생성한다. 이후 등록한 구독에 과거 알림을 소급 전송하지 않는다.
- 외부 HTTP는 TX 밖에서 수행한다. SKIP LOCKED 선점 + 만료 lease 복구 + leaseToken 조건부 결과 저장을 사용한다.
- 한 건씩 선점·전송 준비·결과 반영을 별도 짧은 TX로 처리한다. 결과 반영은 구독 행을 먼저 잠그고,
  연결 버전과 현재 leaseToken을 모두 확인한다. 과거 워커의 응답으로 새 연결이나 다른 워커의 상태를 변경하지 않는다.
- 최초 전송을 포함해 최대 5회 시도한다. 네트워크·429·5xx 실패는 기본 5·10·20·40초 간격으로 재시도한다.
  더 늦은 Retry-After를 우선하고, 다음 시도가 유효기간 밖이면 실패로 종료한다. 404·410은 해당 연결만 해제한다.
- 알림을 삭제하거나 구독을 해제하는 동안 이미 시작한 외부 요청은 전달될 수 있다.
  늦은 응답은 취소 상태를 덮어쓰지 않으며, 상세 정보 보호는 Service Worker의 연결 재확인과 내용 API 소유권 검증으로 처리한다.
- 구독 해제/generation 변경/알림 삭제는 미완료 작업을 취소한다. 이미 수락·전송 중인 요청은 회수 보장하지 않는다.
- 전체 읽음은 회원·미삭제·미읽음 조건의 단일 UPDATE snapshot을 경계로 한다. max(id)를 commit 순서로 사용하지 않는다.
- native UPDATE는 updated_at도 갱신한다. 목록은 읽은 행도 포함하고 삭제된 행만 제외한다.
- 개별 읽음·삭제는 회원·기존 상태 조건을 둔 UPDATE로 최초 시각을 보존한다.
  이전 객체 전체를 저장하지 않으므로 읽음·삭제 경합에서도 삭제 상태를 되돌리지 않는다.
  알림 삭제와 미완료 전송 취소는 같은 TX에서 처리한다.
- 시각은 주입 Clock과 LocalDateTime, DB는 TIMESTAMP WITHOUT TIME ZONE을 사용한다.
