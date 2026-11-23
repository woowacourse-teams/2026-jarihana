# 모임 공간

모임 구성원이 하나의 공간을 함께 조회하고 현재 모임장이 배치와 분위기를 저장한다.
동아리와 스터디에 제공하며, 같이해요(`SESSION`)에는 공간을 제공하지 않는다.
3D 렌더링·배치 충돌 판정은 프론트엔드가 담당하며 서버는 문서 형식·크기·권한·수정 충돌을 검증한다.
실시간 위치·상호작용은 별도 realtime 서버가 담당한다. 접속에는
[실시간 아지트 입장 토큰](group-space-realtime.md)이 필요하다. 공동 편집은 지원하지 않는다.

## GET /api/group-spaces/furniture-catalog

공개 조회다. 응답은 `Cache-Control: no-store`이며 요청마다 현재 환경의 DB를 조회한다.
`data.interactionCatalogVersion`은 가구 상호작용 계약 버전 1이며, `data.items`는 편집기의 표시 순서대로 정렬된 가구 목록이다.
각 항목에는 저장 키 `kind`, 이름, 크기(`width`, `depth`, `height`), 분류 `category`,
지원하는 가장 낮은 서버 문서 버전 `minRoomVersion`, 신규 배치 가능 여부 `placeable`이 있다.
`surfaces`는 소품을 놓을 표면들의 높이 배열이다. 빈 배열인 가구에는 소품을 부착할 수 없다.
가구별로 테마 모음(`collection`), 장착 위치(`mount`), 소품 여부(`prop`) 등의 정보가 추가된다.

가구별 `interaction`에는 동작 목록 `capabilities`, 좌석 수 `seatCount`,
상판 칸 수 `surface.slots`, 수납 용량과 허용 소품 `storage.capacity`·`storage.kinds`,
생산 종류와 시간 `producer.kinds`·`producer.durationMs`가 있다. 물 주기 대기 시간
`cooldownMs`와 패널 이름 `panel`도 해당 가구에만 제공한다. 상호작용이 없는 가구는
`interaction`을 생략할 수 있다. `surfaces`는 편집기에 저장하는 부착 위치의 높이이며
`surface.slots`는 방문 중 옮길 수 있는 소품의 슬롯 수다. 장면에 고정된
`room-general-light-switch`는 상호작용 정의를 조회할 수 있으며, 편집기 배치 대상에서 제외된다.

같은 응답에 `data.portableCatalogVersion: 1`과 `data.portableItems`를 제공한다.
`portableItems`는 소품 `kind`를 키로 사용한다. 값은 집기, 던지기, 소비 가능 여부를 나타내는
`portable`, `throwable`, `consumable`과 필요한 경우 `camera`, 소비 후 남을 소품 `emptyKind`를 포함한다.
가구와 휴대 소품 규칙은 같은 시점의 DB 상태에서 읽는다. `storage.kinds`, `producer.kinds`,
`emptyKind`가 참조하는 소품은 먼저 카탈로그에 등록해야 한다. 참조 중인 소품을 삭제하거나
저장 키를 바꾸려면 참조부터 제거해야 한다.

편집기와 realtime 서버는 같은 환경의 DB 카탈로그를 사용한다. 상호작용 규칙만 변경하면
API 재시작이나 배치 재저장 없이 이후 조회에 반영된다. 운영 중 신규 배치를 중단할 때는
가구의 행과 `kind`를 유지하고 `placeable`을 false로 변경한다.
비활성 가구도 이 응답에 포함되어 이미 배치된 방에서 계속 표시된다.
저장할 때는 해당 모임의 직전 저장 문서에 동일한 `id`와 `kind`가 있는 비활성 가구만 허용한다.
해당 인스턴스의 이동·설정 수정·삭제가 가능하며, 삭제를 저장한 뒤에는 다시 추가할 수 없다.

좌석과 상판의 위치는 프론트엔드 모델에 포함된다. DB의 `seat_anchor_count`와
`surface_anchor_count`는 가구별로 배포된 위치의 개수이며 카탈로그 API에는 노출하지 않는다.
신규 가구에서 두 값을 생략하면 모두 0이다. DB는 `seatCount`와 `surface.slots`가 각 개수를
넘는 규칙을 거부한다. 운영에서 상한을 올릴 때는 해당 가구의 위치를 먼저 지원 중인 모든
프론트엔드 빌드에 배포한다. 배포된 상한 안에서 활성 좌석과 상판 칸 수를 조절할 수 있다.

## GET /api/group-spaces/blueprints/{templateKey}/default

신규 방 또는 모임장이 직접 선택한 전체 배치 교체에 사용할 기본 도면이다. 공개 GET의
`data`는 `blueprintRef: {templateKey, version}`, `geometry`, 미터 단위의 시작점 `spawn: {x, z}`와 초기 방 문서 `defaultRoom`을 포함한다.
이 기본 도면의 배치를 선택하면 편집기는 DB 초기값을 사용한다. 저장된 방의 GET/PUT은 기존 `room`과 시작점을 반환한다.
그룹 생성 요청에서 테마를 선택하면 서버는 발행된 기본 도면과 신규 배치 가능한 가구를 사용해 배치를 그룹과 함께 저장한다. 이때 배치할 수 없는 가구 위에 놓인 소품도 제외한다.
미저장 방의 GET은 `room: null`, `revision: 0`을 유지하고 단층 lounge v11의 `defaultRoom`을 반환한다. 새로 꾸밀 때 선택하는 기본 lounge는 별도 발행된 v12 복층이다.
지원하는 기존 테마의 벽·층·계단·야외 경계 등 도면 형식 1을 제공한다. 발행한
도면은 불변이며 변경본은 같은 테마의 새 버전으로 추가한다. 기본 도면을 변경해도
기존 모임은 저장된 버전을 유지한다. 지원하지 않는 도면 형식은 로드하지 않는다.

## GET /api/groups/{groupId}/space

모임 상세와 동일하게 공개 조회한다. 종료된 모임도 조회할 수 있다.
비로그인 사용자와 비구성원에게는 저장된 배치를 제공하되 `notice`, `coverPhoto`,
각 에셋의 `title`, `note`, `photo`, `link` 내용을 빈 문자열로 반환한다.
구성원에게는 원본 문서를 반환하며 공개 조회 과정에서 저장된 원본을 변경하지 않는다.
저장 이력이 없으면 `room: null`, `revision: 0`, `updatedAt: null`을 반환한다.
그룹 생성 시 아지트를 선택했다면 첫 조회부터 `room`, `revision: 1`, 저장된 `blueprintRef`를 반환한다.
`canEdit`은 현재 구성원이 ACTIVE 모임의 LEADER일 때만 참이다.
응답의 `blueprintRef`와 `geometry`는 이 방이 사용하는 정확한 도면이다.
미저장 방의 공유 장면은 호환용 단층 `lounge/11`을 사용하며 첫 설정 화면은 테마별 기본 도면을 조회한다.
아래 예시는 도면과 초기 배치의 세부 필드를 생략한다.

```json
{"success":true,"data":{"room":null,"revision":0,"canEdit":true,"updatedAt":null,"blueprintRef":{"templateKey":"lounge","version":11},"geometry":{},"spawn":{"x":-2,"z":6.8},"defaultRoom":{"template":"lounge","version":11}},"error":null}
```

## PUT /api/groups/{groupId}/space

현재 ACTIVE 모임의 LEADER만 저장한다. 인증 쿠키와 기존 CSRF 쿠키/헤더가 필요하다.
요청은 `room`, `expectedRevision`, 선택 필드인 `blueprintRef`와 `replaceLayout`을 받는다.
`room.version`은 기존 저장문서 형식이고, 도면 버전은 별도 `blueprintRef.version`으로
관리한다. 일반 저장은 GET에서 받은 참조와 문서 버전을 유지한다. 첫 설정은 선택한
테마의 기본 도면을 보낸다. 모임장이 템플릿 전체를 다시 선택하면 현재 기본 참조와
전체 교체 배치를 `replaceLayout: true`로 전송한다. 도면 선택 이후 기본 버전이 바뀌면
409로 거절한다. 참조가 없는 구 클라이언트는 기존 도면과 문서 버전이 일치하는 방만
저장할 수 있다. 새 좌석 동작이나 에셋 종류는 도면 발행만으로 추가되지 않는다.
성공하면 GET과 동일한 envelope를 반환하고 revision을 1 증가시킨다.
`updatedAt`은 기존 공통 계약의 Asia/Seoul LocalDateTime 문자열이다.

처음 저장할 때도 `expectedRevision: 0`을 전달한다. 그룹 행의 쓰기 잠금으로 첫 저장과
리더 위임·종료·삭제를 직렬화한다. 일치하지 않는 revision은 저장하지 않고
409 `GROUP_SPACE_CONFLICT`를 반환한다. 첫 아지트 선택이 충돌하면 클라이언트는 먼저
저장된 공간을 다시 조회해 연다. 기존 공간을 편집하던 중에 충돌하면 편집 초안을 유지한다.
충돌 후 자동 덮어쓰기는 하지 않는다.

## 문서 제한

| 필드 | 제한 |
| --- | --- |
| version | 정수 8~12. v12는 복층 기본 아지트(`lounge`) 전용 |
| name | 공백만으로 구성되지 않은 30자 이하 문자열 |
| template | lounge, climbing, boardgame, dining, band, study, photo (study/photo는 v9 이상) |
| theme | blue, sage, rose, wood, chalk, walnut, rehearsal, studio, gallery (추가 3종은 v9 이상) |
| avatarColor | #536bd6, #c991ba, #7b9b6d, #d99559 |
| accentColor, matColor | avatarColor 색상 또는 #7d8b9d |
| food | pizza, ramen, dessert |
| notice | 100자 이하 |
| coverPhoto, items[].photo | 빈 문자열 또는 JPEG/PNG base64 data URL, 각각 220,000자 이하 |
| items | v10~v12 최대 400개, v9 최대 160개, v8 최대 64개. id 중복 불가 |
| items[].id / title / note | 각각 1~80자 / 최대40자 / 최대500자 |
| items[].x, z | 유한한 수, -64~64 (정확한 배치 가능 여부는 클라이언트 검증) |
| items[].rotation | 정수 0~3 |
| items[].level | 생략 또는 0. `lounge`는 v12에서만 1 허용. 다른 테마는 v9 이상, v8은 climbing/boardgame에서 1 허용 |
| items[].color | 생략 또는 #RRGGBB |
| items[].link | memory에만 허용, 빈 문자열 또는 사용자정보 없는 HTTP(S) 절대 URL, 최대1,000자 |
| 전체 문서 | 공백을 제거한 JSON UTF-8 바이트 기준 2,097,152바이트 이하 |

v8은 기존 지원 가구 20종을 저장할 수 있고, v9 이상은 카탈로그에 등록된 각 종류의 `minRoomVersion`을 따른다.
프리셋은 초기 배치를 제공하며 모든 테마에서 같은 카탈로그를 사용한다.
`musicConsole`, `activityBoard`, `clubDashboard` 등 기능 가구를 삭제해도 음악·활동·공지 내용은 유지된다.

선택 에셋 필드는 다음과 같다. 생략한 값은 서버에서 보충하거나 이전하지 않는다.

| 필드 | 제한 |
| --- | --- |
| scaleX, scaleY, scaleZ | 유한한 수 0.25~3 |
| elevation | 유한한 수 0~14; 다른 가구에 부착된 소품은 생략 또는 0 |
| finish | auto, oak, walnut, stone, fabric, metal |
| variant | 정수 0~5 |
| parentId | 카탈로그에서 `prop: true`인 소품에 허용. 같은 층에 있는 부모의 유효한 표면에 부착하며 중첩은 불가 |
| surfaceIndex | parentId가 있을 때만 허용. 부모 가구의 `surfaces` 배열 범위 안에 있는 0부터 시작하는 정수 |

부모 가구의 표면 개수와 순서는 카탈로그의 `surfaces` 배열을 따른다.
벽·천장 장착 방식과 충돌 영역은 카탈로그 메타데이터이며 저장 문서에 받지 않는다.
`photo`/`link`는 memory에만 허용한다. 서버는 링크를 요청하거나 HTML로 해석하지 않는다.
알려지지 않은 문서 필드는 거절한다. v8 문서는 기존 카탈로그와 64개 한도를 그대로 유지한다.

`atmosphere`는 backgroundColor(#RRGGBB), backgroundStyle(gradient/solid),
ambient/sunlight/lamps(0~150), warmth/shadowSoftness(0~100), sunAngle(0~360),
shadows(boolean), wallColor/floorColor(빈 문자열 또는 #RRGGBB)를 가진다.
선택 필드 wallMaterial은 auto/plaster/limewash/brick/wallpaper/woodpanel/acoustic,
floorMaterial은 auto/oak/walnut/herringbone/concrete/stone/terrazzo/checker이며,
wallPatternScale/floorPatternScale은 0.5~2다. 모든 범위는 양끝을 포함한다.

선택 필드 `atmosphere.outdoors`를 지정하면 아래 세 문자열을 모두 전달한다.

| 필드 | 허용 값 |
| --- | --- |
| mode | live, fixed, custom |
| phase | dawn, day, dusk, night |
| weather | clear, cloudy, rain, snow |

`live`는 현재 시간·날씨, `fixed`는 선택한 시간대·날씨, `custom`은 기존 조명·배경
수치를 사용한다. 모임장만 공간 저장 API로 변경하며 공개 방문자에게도 동일한 야외 설정을
제공한다. `outdoors`가 없는 기존 v8·v9 문서도 그대로 저장·조회할 수 있다.
누락된 하위 필드, null, 허용 목록에 없는 값과 추가 하위 필드는 거절한다.

## GET /api/group-spaces/weather

로그인 없이 서울(위도 37.5665, 경도 126.978)의 현재 WMO 날씨 코드와 당일 일출·일몰을
조회한다. 모임별 장소 좌표와 방문자의 기기 위치는 사용하지 않는다.

```json
{"success":true,"data":{"weatherCode":61,"sunrise":"2026-11-09T07:05","sunset":"2026-11-09T17:25","stale":false},"error":null}
```

일출·일몰은 `Asia/Seoul`의 분 단위 시각이다. 서버 인스턴스에서 성공 응답을 15분간 공유하고,
조회 실패 후 1분간 재시도를 늦춘다. 실패 시 서울 기준 당일의 이전 응답이 있으면
`stale: true`로 제공하며, 이전 날짜 응답은 재사용하지 않는다. 사용할 당일 응답이 없거나
기능이 꺼져 있으면 503 `GROUP_SPACE_WEATHER_UNAVAILABLE`을 반환한다.
클라이언트는 날씨 오류가 공간이나 시간대 표시를 차단하지 않게 처리한다.

외부 연동은 Open-Meteo의 `current=weather_code`, `daily=sunrise,sunset`,
`forecast_days=1`, `timezone=Asia/Seoul` 요청을 사용한다. 연결은 2초, 응답은 3초로 제한한다.
제공자의 URL·오류 본문·인증키는 API 오류에 포함하지 않는다.

- `GROUP_SPACE_WEATHER_ENABLED`는 local/dev에서 기본 true, 그 외에는 기본 false다.
- local/dev 시제품은 키 없이 `api.open-meteo.com`을 사용한다. prod가 함께 활성화되면
  고객 키가 필요하다. 테스트 기본 설정에서는 외부 조회를 하지 않는다.
- 고객용 `OPEN_METEO_API_KEY`를 설정하면 `customer-api.open-meteo.com`을 사용한다.
  운영은 활성화 설정과 고객용 키가 모두 필요하며 키는 서버 환경변수로만 주입한다.
- 무료 API의 시제품·비상업 사용 조건과 유료 운영 조건, 데이터 출처 표시는
  [Open-Meteo 이용 안내](https://open-meteo.com/en/pricing)와
  [날씨 API 문서](https://open-meteo.com/en/docs)를 따른다.

## 오류와 수명 주기

| 상태 | 코드 | 조건 |
| --- | --- | --- |
| 400 | INVALID_PARAMETER | 잘못된 문서·크기·revision |
| 401 | UNAUTHENTICATED | 로그인하지 않고 저장 |
| 403 | GROUP_ACCESS_DENIED | 모임장이 아닌 회원의 저장 |
| 404 | GROUP_NOT_FOUND | 모임이 없음 |
| 404 | GROUP_SPACE_NOT_AVAILABLE | 같이해요 모임의 공간 조회 또는 저장 |
| 409 | GROUP_ENDED | 종료된 모임에 저장 |
| 409 | GROUP_SPACE_CONFLICT | 저장 revision 불일치 |

`group_space.group_id`는 유일하며 그룹 삭제 시 FK ON DELETE CASCADE로 함께 삭제한다.
탈퇴·리더 위임 후 권한은 매 요청의 현재 멤버십을 기준으로 판단한다.
모든 환경에서 Flyway `V40__group_space.sql`로 스키마를 생성하고 Hibernate `validate`로 확인한다.

## 검증과 문서 범위

`GroupSpaceControllerTest`는 실제 PostgreSQL Testcontainers에서 저장/재조회, 수정 충돌,
동시 최초 저장, 인증·권한·CSRF, 종료, 리더 위임, 마이그레이션과 삭제, 입력 한도를 검증한다. v9 공용 카탈로그·7개 프리셋 저장/재조회와 160개 경계,
v8 호환·64개 경계도 검증한다. `src/test/resources/group-space-v9-catalog.json`은 기존 v9
클라이언트가 사용한 가구 93종과 템플릿 7종의 호환성 검증 기준이다. 현재 전체 가구 목록은
가구 카탈로그 API에서 조회한다.
이 체크아웃에는 공통 문서가 언급하는 Swagger/OpenAPI 생성 설정·기존 명세 파일이 없다.
따라서 위 계약과 실행 가능한 인수 테스트를 함께 관리하며 Swagger 배포 완료로 주장하지 않는다.

### 구조 개정 호환 검증

`group-space-v10-presets.json`과 `group-space-v11-presets.json`은 각각 여섯 테마의
전체 저장 문서다. validator 테스트는 두 버전의 전체 에셋·재질·부착 관계와 400개 한도를
검증하고, 인수 테스트는 각 문서에 `outdoors`를 함께 넣어 저장한 뒤 멤버 조회 결과가
원본과 정확히 같은지 검증한다. v8/v9, 공개 정보 가림, 모임장 권한, CSRF,
revision 충돌 및 날씨 API 검증도 유지한다. DB 마이그레이션이나 저장 시 버전 변환은 없다.

### 복층 기본 아지트 배포 순서

1. v11 단층과 v12 복층을 모두 열 수 있는 프론트를 먼저 배포한다. 이 버전은
   기본 아지트를 v11로 저장하고, 서버에 저장된 v12 공간은 읽기 전용으로 연다.
2. v12 저장을 허용하는 API 서버와 v12 복층 배치를 읽는 실시간 서버를 배포한 뒤,
   v12 기본 배치 생성과 편집 저장을 켠 프론트를 배포한다.
   1단계 배포 전부터 열려 있던 탭은 새로고침해야 v12를 열 수 있다.

복층 저장을 켠 뒤 프론트를 되돌릴 때는 1단계 버전을 사용한다. 이미 저장한 v12
공간은 1단계에서도 열리고 편집은 비활성화된다.
