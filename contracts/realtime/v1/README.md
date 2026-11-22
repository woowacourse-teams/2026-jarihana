# 아지트 실시간 계약 v1

M1·M2를 함께 구현한다. 기존 API·DB는 접근 권한과 저장 배치의 원본이고 realtime은 방의 일시 상태를 소유한다. M3 LiveKit은 별도 범위다.

## 인증과 API

- 기존 API: `POST /api/groups/{groupId}/space/join-token`. 기존 로그인/CSRF 정책 사용. 일반 응답 envelope의 data는 `{token,websocketUrl,expiresAt}`. expiresAt은 Unix epoch milliseconds.
- 클라이언트는 응답의 `websocketUrl`로 연결한다. realtime의 WebSocket 경로는 `/ws/realtime`이다.
- 일반 HTTP `GET /ws/realtime`은 가구와 소품의 기능 정의를 공개한다. `Upgrade` 헤더 없이 호출하며 응답은 `{success: true, data: {capabilities}, error: null}`이다. 로그인과 입장 토큰 없이 요청할 수 있다. 다른 origin에서 조회할 때는 자격 증명을 생략한다. 혼자 둘러보기, 독립 스튜디오와 랜딩에서도 이 정의를 사용한다.
- JWT HS256의 `iss`는 개발 `jarihana-api-dev`, 운영 `jarihana-api-prod`다. 공통 필드는 `aud=jarihana-realtime`, `sub=memberId`, `roomId=groupId`, `jti`, `iat/exp`(seconds)다. 입장 수명은 60초다.
- realtime은 발급자와 환경별 입장 키로 서명을 함께 검증한 뒤 해당 환경의 PostgreSQL에서 회원, 모임, 역할, 저장 배치를 읽는다. 각 환경의 기존 API가 배치 저장과 스키마 변경을 담당한다.
- 서버는 발급 환경과 `roomId`를 묶어서 방을 구분한다. 같은 모임이나 회원 ID도 환경이 다르면 별도 상태를 갖는다. WebSocket 경로와 메시지의 `roomId` 형식은 공통이다.
- 저장된 방이 없으면 해당 환경 DB의 단층 도면 `lounge:11`에 발행한 기본 방과 시작 위치를 사용한다. 입장만으로 `group_space` 행을 만들거나 revision을 올리지 않는다.
- 저장 문서는 v11과 기본 아지트 v12를 지원한다. 도면 발행 버전은 저장 문서 형식과 독립적이다. v10 이하 문서로 공동 입장하면 `LAYOUT_UPGRADE_REQUIRED`를 반환한다. 기존 가구를 편집하고 저장하면 문서 버전을 유지한다. 모임장이 템플릿 전체 교체를 선택하고 저장하면 새 템플릿의 기본 가구가 적용되고 공동 입장이 가능해진다.
- 권한 유효 기한은 60초, 재확인 시작 주기는 20초를 기본으로 한다. 실패로 유효 기한을 연장하지 않는다. 모임원이 아니어도 기존 방문 정책이 허용하면 GUEST로 입장한다.
- realtime은 저장 배치에서 상호작용에 필요한 가구 정보를 계산하고 배치 revision을 알린다. 클라이언트는 기존 공개 API로 권한에 맞는 배치를 읽는다.

편집기와 저장 API, realtime은 같은 환경의 가구 카탈로그를 사용한다. `placeable=false`인 종류도 기존 방의 충돌과 상호작용에 참여한다. 새 종류에 전용 3D 모델이나 행동이 필요하면 대응하는 클라이언트·서버를 먼저 배포한다.

## 공통 필드

모든 ID(`roomId`, `memberId`, `selfId`, `itemId`, `assetId`, `roomEpoch`, `connectionGeneration`)는 문자열이다. slot은 0기반 정수. 위치는 `{x,y,z}`, yaw는 radians, 시각은 epoch milliseconds, remaining은 0..1이다.

AUTH_JOIN 이후 클라이언트 메시지는 `{type,roomEpoch,connectionGeneration,layoutRevision,...}`를 갖는다. 서버는 인증된 소켓의 사용자·방을 기준으로 처리하고 수신자가 신원을 바꿀 수 없다.

```json
{"type":"AUTH_JOIN","protocolVersion":1,"token":"<short-lived token>","seatRefs":true}
```

`seatRefs`는 선택 항목이다. `true`로 입장한 연결은 좌석을 가구 ID와 슬롯 번호로 받는다. 생략한 연결의 좌석 호환 필드는 아래 서버 상태를 따른다.

```json
{"type":"MOVE","roomEpoch":"...","connectionGeneration":"...","layoutRevision":1,"moveSeq":1,"payload":{"x":-2,"y":0,"z":6.8,"yaw":0,"locomotion":"idle"}}
```

locomotion은 `idle`, `walking`, `running`, `jumping`이다. MOVE는 위치 제안이며 서버가 속도·경계·층을 검증한다.

`payload.path`는 직전 전송 위치부터 이번 위치까지의 바닥 좌표 배열이다(최대 64개).
클라이언트 보행기의 0.15m 이하 X→Z 미세 이동마다 끝점을 기록한다. 서버는 시작점이 현재 위치와
일치하는지, 각 X→Z 구간의 충돌·층, 마지막 점과 payload 위치가 일치하는지 검사한다.
속도 검증에는 각 미세 이동의 수평 변위 길이를 합산하며, 서버 시각 기준 초당 5.8m를 충전하고
최대 1초 지연분과 0.25m 여유만 유지한다. 경로가 있는 MOVE는 큐에서 생략하지 않으며 기존 방 큐 상한을 따른다.
path가 없는 이전 클라이언트는 직선 경로 검증을 유지한다. 배포 시 서버를 먼저 갱신한다.

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
  seat:{assetId,slot}|null,
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

새 연결의 `position`과 `yaw`는 서버 판정용 자세다. 착석 중 `position`은 가구에 접근한 안전한 바닥 위치를 유지한다. 기존 연결의 호환 응답에는 `seat.position`, `seat.approach`, `seat.yaw`와 기존 브라우저가 기대하는 참가자의 착석 `position`, `yaw`를 포함한다. 입장, RESYNC, 오류 복구, 브로드캐스트와 이동 프레임은 접속할 때 고른 직렬화 방식을 유지한다. production은 진행 중 `{id,itemId,kind,startedAt,completesAt}` 또는 null이다.

`SURFACE`와 `STORAGE` 소품의 위치는 `assetId`와 `slot`으로 식별한다. 두 상태의 `position`은 null 또는 생략이다. 브라우저는 상판의 표시와 클릭에 현재 가구 배치와 로컬 좌표를 사용하고, 수납은 슬롯 점유와 꺼내기 동작으로 표시한다. 바닥의 `WORLD` 위치와 `THROWN`의 위치·속도는 서버가 제공한다. 이전 프론트가 열려 있는 탭은 새 프론트 게시 뒤 새로고침한다.

`avatarAppearance`은 입장 토큰의 발급 환경에 해당하는 DB에서 읽은 회원의 외형이다. 버전 1은 `{version,hair,skin,hairColor,face,eyes,eyebrows,nose,mouth,glasses,outfit,shoes,shoeColor,hat,hatColor,bag,bagColor,handheld}`를 보낸다. 저장한 외형이 없거나 필드가 없는 이전 메시지에는 `avatarColor`로 기본 캐릭터를 표시한다. 권한 재확인 때 외형이 바뀌면 `ROOM_STATE`에 반영한다.

`MOVEMENT_FRAME`은 같은 context와 `participants:[{memberId,position,yaw,locomotion}]`을 포함한다. controlSeq는 해당 프레임의 전제 상태 순번이다. 제어 상태를 먼저 적용하고 이후 프레임을 적용한다. frameSeq 공백은 허용하며, 이전 frame/epoch/generation은 버린다. ROOM_STATE는 전체 상태이므로 더 최신의 전체 상태로 건너뛰어도 복구할 수 있다.

`COMMAND_RESULT`: `{type,commandId,success,code,message,...context}`. 성공 code는 `OK`. 개별 결과가 방 controlSeq를 증가시키지 않는다.

`ERROR`: `{type,code,message,retryable,...context}`. 권한 없음·교체·프로토콜 불일치는 자동 재접속하지 않는다. 일시 연결 실패에는 backoff+jitter를 사용한다. 서버의 CLOSE 상세 코드는 realtime README에서 실행 구현과 함께 기록한다.

이동 거절의 `reason`은 `SPEED_LIMIT`, `BLOCKED_PATH`, `PATH_START`, `PATH_END`, `STEP_LIMIT`,
`PATH_LIMIT`, `INVALID_POSE`로 원인을 구분한다. `INVALID_MOVEMENT`와 `LAYOUT_MISMATCH`는 연결을
종료하지 않고 스냅샷으로 보정한다. 클라이언트는 보정 중 이동을 멈추고 RESYNC를 요청하며,
2.5초 안에 스냅샷을 받지 못하면 새 입장 토큰으로 자동 재접속한다. 일시적인 입장 API 503과
권한 재확인 유효 기한 만료도 새 입장 시도를 거치며, 실제 접근 거절·로그인 만료·기능 비활성화는 재시도하지 않는다.
복구는 상단의 작은 상태 알림으로 표시하고 복구 완료 알림은 3.5초 뒤 숨긴다.

## 가구·물건과 배치 교체

- realtime의 [asset-capabilities.json](../../../realtime/src/main/resources/contracts/asset-capabilities.json)은 종류별 기능을 정의한다. `seatCount`, `surface.slots`, `storage.capacity`는 각각 좌석, 상판과 수납의 칸 수다. 같은 종류도 배치 인스턴스 ID는 다르다.
- instance rotation은 기존 저장 계약의 사분회전(0..3), scaleX/Y/Z, elevation, level, parentId/surfaceIndex를 적용한다.
- 프론트에서 좌석 번호에 맞는 높이와 상대 좌표를 현재 가구 위치·회전·배율·층에 적용한다. `avatarOffsetY`는 캐릭터 원점, `seatFit`은 좌판 앞쪽과 팔걸이 간격에 맞춘 보정이다. 1인칭 카메라, 로컬 3인칭 아바타, 원격 참가자가 같은 계산을 사용한다.
- 환경 DB의 `space_furniture_catalog.definition`에서 치수·장착 방식·부착면 높이를 읽고, 모임에 연결된 도면 버전에서 지형과 시작 위치를 읽는다.
- 서버는 좌석 범위·가구와의 거리·같은 층·중복 점유를 검사하고, 앉아 있는 동안 이동을 거절한다. 일어나거나 좌석이 이동·삭제·종류 변경되면 점유를 해제하고 안전한 접근 위치로 복귀시킨다.
- realtime은 가구 ID, 상판·수납 구분과 슬롯 번호로 범위와 점유를 검사한다. 같은 가구의 상판 0번과 수납 0번을 각각 점유할 수 있다. 프론트의 가구 기준 좌표는 소품 밑면을 받치는 위치다. 가구를 옮기거나 돌리거나 크기를 바꿔도 슬롯이 남으면 소품은 가구를 따라간다.
- 선반에 놓인 소품은 같은 층에서 가구에 다가가 집을 수 있다. 높은 선반은 가구 메뉴에서도 소품을 집을 수 있다. 카페 음료는 생산 가구의 상판 슬롯에 놓인다.
- 가구가 삭제되거나 현재 슬롯을 잃으면 그곳에 놓였거나 수납된 소품을 방에서 제거한다. 바닥에 있거나 던져졌거나 손에 든 소품은 `sourceAssetId`로 출처만 기록하며 출처 가구를 삭제한 뒤에도 방에 남는다.
- 생산 중 기계 이동·삭제는 취소하며 컵을 복구한다. 작업 ID·방 세대·배치 버전으로 오래된 완료를 차단한다.
- 퇴장 시 좌석 해제, 손 물건 내려놓기, 생산 취소를 같은 방 처리 구간에서 수행한다.
- DB 커밋 뒤 새 layoutRevision을 적용한다. 이전 revision 명령은 LAYOUT_MISMATCH로 거절한다. 프론트는 최신 저장 배치를 읽은 뒤 조작을 재개한다.
- 배치는 기본 10초, 권한은 20초 주기로 조회한다. 저장 직후 모든 참가자에게 동시에 적용되는 것은 아니다. 다른 groupId로 이동하면 기존 연결을 정리하고 새 방의 스냅샷을 받는다.

## 검증 범위

규칙·동시 점유·중복 명령·세대/배치 변경·늦은 입장·느린 연결은 서버 테스트로 검증한다. 프론트는 메시지 적용·재접속·렌더 연결·공유 행동 승인/거절을 테스트한다. 실사용 흐름은 별도 로그인 A/B와 늦은 C로 검증한다. 이 계약 작성은 구현·운영 배포 완료를 뜻하지 않는다.
