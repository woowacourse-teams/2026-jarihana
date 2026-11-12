# 아지트 실시간 계약 v1

M1·M2를 함께 구현한다. 기존 API·DB는 접근 권한과 저장 배치의 원본이고 realtime은 방의 일시 상태를 소유한다. M3 LiveKit은 별도 범위다.

## 인증과 API

- 기존 API: `POST /api/groups/{groupId}/space/join-token`. 기존 로그인/CSRF 정책 사용. 일반 응답 envelope의 data는 `{token,websocketUrl,expiresAt}`. expiresAt은 Unix epoch milliseconds.
- 클라이언트는 응답의 `websocketUrl`로 연결한다. realtime의 WebSocket 경로는 `/ws/realtime`이다.
- JWT HS256의 `iss`는 개발 `jarihana-api-dev`, 운영 `jarihana-api-prod`다. 공통 필드는 `aud=jarihana-realtime`, `sub=memberId`, `roomId=groupId`, `jti`, `iat/exp`(seconds)다. 입장 수명은 60초다.
- realtime은 발급자와 환경별 입장 키로 서명을 함께 검증한 뒤 해당 환경의 PostgreSQL에서 회원, 모임, 역할, 저장 배치를 읽는다. 각 환경의 기존 API가 배치 저장과 스키마 변경을 담당한다.
- 서버는 발급 환경과 `roomId`를 묶어서 방을 구분한다. 같은 모임이나 회원 ID도 환경이 다르면 별도 상태를 갖는다. WebSocket 경로와 메시지의 `roomId` 형식은 공통이다.
- room=null이면 `space-runtime.json`의 defaultRoom을 사용한다. 저장 전 클라이언트 배치를 서버가 신뢰하지 않는다.
- 저장 문서는 version 11을 지원한다. 구버전은 `LAYOUT_UPGRADE_REQUIRED`로 거절한다. 프론트의 읽기 단계 이관 결과와 원본의 판정 좌표가 어긋나지 않도록, 모임장이 현재 편집기로 배치를 저장한 뒤 연결한다. 기존 조회·편집은 가능하다.
- 권한 유효 기한은 60초, 재확인 시작 주기는 20초를 기본으로 한다. 실패로 유효 기한을 연장하지 않는다. 모임원이 아니어도 기존 방문 정책이 허용하면 GUEST로 입장한다.
- realtime은 저장 배치에서 상호작용에 필요한 가구 정보를 계산하고 배치 revision을 알린다. 클라이언트는 기존 공개 API로 권한에 맞는 배치를 읽는다.

## 공통 필드

모든 ID(`roomId`, `memberId`, `selfId`, `itemId`, `assetId`, `roomEpoch`, `connectionGeneration`)는 문자열이다. slot은 0기반 정수. 위치는 `{x,y,z}`, yaw는 radians, 시각은 epoch milliseconds, remaining은 0..1이다.

AUTH_JOIN 이후 클라이언트 메시지는 `{type,roomEpoch,connectionGeneration,layoutRevision,...}`를 갖는다. 서버는 인증된 소켓의 사용자·방을 기준으로 처리하고 수신자가 신원을 바꿀 수 없다.

```json
{"type":"AUTH_JOIN","protocolVersion":1,"token":"<short-lived token>"}
```

```json
{"type":"MOVE","roomEpoch":"...","connectionGeneration":"...","layoutRevision":1,"moveSeq":1,"payload":{"x":-2,"y":0,"z":6.8,"yaw":0,"locomotion":"idle"}}
```

locomotion은 `idle`, `walking`, `running`, `jumping`이다. MOVE는 위치 제안이며 서버가 속도·경계·층을 검증한다.

```json
{"type":"COMMAND","roomEpoch":"...","connectionGeneration":"...","layoutRevision":1,"commandId":"unique-in-connection","payload":{"action":"SIT","assetId":"sofa","slot":0}}
```

명령 action: `SIT`, `STAND`, `POSE`, `TAKE`, `PICKUP`, `PLACE`, `DROP`, `THROW`, `CONSUME`, `RETURN`, `OPEN`, `CLOSE`, `PRODUCE`, `CANCEL_PRODUCTION`, `TOGGLE`, `WATER`, `EMOTE`.

payload는 action에 필요한 `assetId`, `slot`, `itemId`, `kind`, `position`, `velocity`, `pose`만 받는다. 거리·대상 capability·점유·소유·현재 배치·역할은 서버가 검사한다. 서버가 좌석 위치와 생산 완료 시각을 정한다. 중복 commandId는 동일 결과를 돌려주며 새 동작을 만들지 않는다.

`RESYNC`는 전체 스냅샷을 요청한다. `PING`/`PONG`은 연결 확인용이다. 재접속 시 미확정 COMMAND를 자동 재전송하지 않는다.

화면 이탈·아지트 변경처럼 의도한 퇴장은 WebSocket close `1000 / LEAVE`로 구분한다. 해당 연결 세대의 좌석·손 물건·생산을 즉시 정리한다. 비정상 연결 종료에는 기본 5초 재접속 유예를 적용한다.

## 서버 상태

`ROOM_SNAPSHOT`(입장/복구), `ROOM_STATE`(중요 상태 변경)는 다음 공통 형태다.

```text
type, protocolVersion:1, roomId, roomEpoch, connectionGeneration,
layoutRevision, controlSeq, frameSeq, serverTime, selfId,
participants: [{
  memberId, displayName, avatarColor, avatarAppearance?:object|null,
  position:{x,y,z}, yaw, locomotion,
  seat:{assetId,slot,position,approach,yaw}|null,
  heldItemId:string|null, pose,
  emote:{kind,startedAt,expiresAt}|null
}],
items: [{
  id, kind, holderId:string|null, sourceAssetId:string|null,
  location:HELD|WORLD|SURFACE|STORAGE|THROWN,
  position:{x,y,z}, assetId:string|null, slot:int|null, remaining,
  velocity:{x,y,z}|null, startedAt:number|null
}],
assets:{ [assetId]:{open,on,wateredAt,production} }
```

participant.position은 착석 시 seat.position과 같다. seat.approach는 일어날 때의 후보 위치다. production은 진행 중 `{id,itemId,kind,startedAt,completesAt}` 또는 null이다.

`avatarAppearance`은 입장 토큰의 발급 환경에 해당하는 DB에서 읽은 회원의 외형이다. 버전 1은 `{version,hair,skin,hairColor,face,eyes,eyebrows,nose,mouth,glasses,outfit,shoes,shoeColor,hat,hatColor,bag,bagColor,handheld}`를 보낸다. 저장한 외형이 없거나 필드가 없는 이전 메시지에는 `avatarColor`로 기본 캐릭터를 표시한다. 권한 재확인 때 외형이 바뀌면 `ROOM_STATE`에 반영한다.

`MOVEMENT_FRAME`은 같은 context와 `participants:[{memberId,position,yaw,locomotion}]`을 포함한다. controlSeq는 해당 프레임의 전제 상태 순번이다. 제어 상태를 먼저 적용하고 이후 프레임을 적용한다. frameSeq 공백은 허용하며, 이전 frame/epoch/generation은 버린다. ROOM_STATE는 전체 상태이므로 더 최신의 전체 상태로 건너뛰어도 복구할 수 있다.

`COMMAND_RESULT`: `{type,commandId,success,code,message,...context}`. 성공 code는 `OK`. 개별 결과가 방 controlSeq를 증가시키지 않는다.

`ERROR`: `{type,code,message,retryable,...context}`. 권한 없음·교체·프로토콜 불일치는 자동 재접속하지 않는다. 일시 연결 실패에는 backoff+jitter를 사용한다. 서버의 CLOSE 상세 코드는 realtime README에서 실행 구현과 함께 기록한다.

## 가구·물건과 배치 교체

- asset-capabilities.json은 종류별 capability·로컬 앵커 설정이다. 같은 종류도 배치 인스턴스 ID는 다르다.
- instance rotation은 기존 저장 계약의 사분회전(0..3), scaleX/Y/Z, elevation, level, parentId/surfaceIndex를 적용한다.
- 좌석 y는 좌판 높이이며 avatarOffsetY는 캐릭터 원점 보정이다. 서버 좌석의 worldY는 배치 elevation + y*scaleY + avatarOffsetY로 계산한다. 화면에서는 `seatFit`으로 좌판 앞쪽과 팔걸이 간격에 맞춰 착석 위치를 보정한다. 좁거나 낮은 가구에서는 앉아 있는 동안만 캐릭터를 줄인다.
- space-runtime.json은 기존 프론트 카탈로그·층·통로·기본 배치에서 생성한다. 서버가 브라우저가 보낸 앵커나 capability를 신뢰하지 않는다.
- 좌석을 옮기거나 삭제·종류 변경하면 점유를 해제하고 유효한 위치로 보정한다.
- surface slot은 `surface-anchors.json`에 있는 종류별 로컬 x·y·z 배열의 인덱스이며 한 위치에 하나의 물건을 둔다. 좌표는 소품 밑면을 받치는 위치다. 가구 이동·회전·크기 변경 뒤 같은 종류·슬롯이 남으면 새 월드 좌표로 옮긴다. 삭제/종류 변경/기능 제거 시 안전한 바닥으로 옮긴다. storage 용량과 편집기에서 저장한 장식의 높이 배열은 별개다.
- 선반에 놓인 소품은 같은 층에서 가구에 다가가 집을 수 있다. 높은 선반은 가구 메뉴에서도 소품을 집을 수 있다. 카페 음료 생성도 동일한 배치 좌표를 사용한다.
- 손에 든 물건은 source 가구와 별개인 인스턴스다. source 삭제로 제거하지 않는다.
- 생산 중 기계 이동·삭제는 취소하며 컵을 복구한다. 작업 ID·방 세대·배치 버전으로 오래된 완료를 차단한다.
- 퇴장 시 좌석 해제, 손 물건 내려놓기, 생산 취소를 같은 방 처리 구간에서 수행한다.
- DB 커밋 뒤 새 layoutRevision을 적용한다. 이전 revision 명령은 LAYOUT_MISMATCH로 거절한다. 프론트는 최신 저장 배치를 읽은 뒤 조작을 재개한다.
- 배치는 기본 10초, 권한은 20초 주기로 조회한다. 저장 직후 모든 참가자에게 동시에 적용되는 것은 아니다. 다른 groupId로 이동하면 기존 연결을 정리하고 새 방의 스냅샷을 받는다.

## 검증 범위

규칙·동시 점유·중복 명령·세대/배치 변경·늦은 입장·느린 연결은 서버 테스트로 검증한다. 프론트는 메시지 적용·재접속·렌더 연결·공유 행동 승인/거절을 테스트한다. 실사용 흐름은 별도 로그인 A/B와 늦은 C로 검증한다. 이 계약 작성은 구현·운영 배포 완료를 뜻하지 않는다.
