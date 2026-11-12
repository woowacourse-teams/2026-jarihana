# 모임 공간

모임 구성원이 하나의 공간을 함께 조회하고 현재 모임장이 배치와 분위기를 저장한다.
동아리와 스터디에 제공하며, 같이해요(`SESSION`)에는 공간을 제공하지 않는다.
3D 렌더링·배치 충돌 판정은 프론트엔드가 담당하며 서버는 문서 형식·크기·권한·수정 충돌을 검증한다.
실시간 위치 동기화나 공동 편집 API는 포함하지 않는다.

## GET /api/groups/{groupId}/space

모임 상세와 동일하게 공개 조회한다. 종료된 모임도 조회할 수 있다.
비로그인 사용자와 비구성원에게는 저장된 배치를 제공하되 `notice`, `coverPhoto`,
각 에셋의 `title`, `note`, `photo`, `link` 내용을 빈 문자열로 반환한다.
구성원에게는 원본 문서를 반환하며 공개 조회 과정에서 저장된 원본을 변경하지 않는다.
저장 이력이 없으면 `room: null`, `revision: 0`, `updatedAt: null`을 반환한다.
`canEdit`은 현재 구성원이 ACTIVE 모임의 LEADER일 때만 참이다.

```json
{"success":true,"data":{"room":null,"revision":0,"canEdit":true,"updatedAt":null},"error":null}
```

## PUT /api/groups/{groupId}/space

현재 ACTIVE 모임의 LEADER만 저장한다. 인증 쿠키와 기존 CSRF 쿠키/헤더가 필요하다.
요청은 `{ "room": <v8~v12 공간 객체>, "expectedRevision": <마지막 조회 revision> }`이다.
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

v8의 `items[].kind`는 sofa, armchair, table, bookshelf, plant, rug, stool,
bench, beanbag, diningTable, gameTable, roundChair, clubSofa, gameCredenza, loungeRug,
gameShelf, gameChair, floorLamp, memory, musicConsole 중 하나다.

v9 이상은 아래 에셋도 모든 테마에서 공용으로 허용한다. 프리셋은 초기 배치일 뿐 테마별 에셋 제한이 아니다.

libraryShelfWood, libraryShelfDisplay, libraryShelfDark, gameWallBoard, gameWallArt, gameNeon, pendantLight, pendantBulb, loftPendant, shelfPendant, climbingWallWide, climbingWallOverhang, climbingWallNarrow, crashMat, crashMatWide, climbingShoeShelf, climbingHelmetShelf, climbingGearShelf, ropeRack, climbingPlant, climbingSign, climbingBoard, clubPinboard, cafeCounter, cafeFridge, kitchenCounter, kitchenIsland, kitchenRange, kitchenFridge, pantryShelf, cafeCabinet, feastTable, menuBoard, foodMap, drumKit, guitarRack, rehearsalKeyboard, amplifier, microphoneStand, mixingDesk, acousticPanel, bandPoster, rehearsalStage, stageLight, studyDesk, focusDesk, whiteboard, projectScreen, serverRack, projectShelf, studyCabinet, projectDisplay, photoBackdrop, softbox, photoTripod, cameraCabinet, photoEditDesk, photoPrintBench, galleryPartition, photoEquipmentCase, photoReflector.

공통 기능 에셋인 `activityBoard`(활동 기록 보드)와 `clubDashboard`(모임 대시보드)도
v9 이상에서 모든 테마에 배치할 수 있다. 기존 `musicConsole`과 함께 공통 기능 입구를 구성하며,
다른 가구와 동일한 위치·회전·색상 필드를 사용한다. 에셋을 지워도 방의 `notice`는 유지된다.
기존 100자 `notice` 필드는 이전 공간 문서와의 호환용이다. 실제 공지는 기존 공지 API에서
공개 범위를 확인해 조회한다. 사진 액자도 기존 활동 기록 API를 사용한다.

공용 카탈로그에는 coffeeTable, cafeTable, leafyPlant, vinePlanter, bandNeon,
diningNeon, studyNeon, photoNeon, galleryWall, posterWall, longCredenza, worktop,
openDisplayShelf, wallShelf, propBooks, propBookRow, propBottle, propCup, propPlant,
propPlates, propGameBox, propCamera, propLaptop, propFrame, propLamp, propGameBoard,
propMonitor, propCanisters, propPedals, hangingLamp, trackLight, ceilingBeam,
acousticCloud, wallPrint, acousticTile, pictureLight, loftPartition,
loftGlassPartition, lowEdgeLight도 포함한다.

선택 에셋 필드는 다음과 같다. 생략한 값은 서버에서 보충하거나 이전하지 않는다.

| 필드 | 제한 |
| --- | --- |
| scaleX, scaleY, scaleZ | 유한한 수 0.25~3 |
| elevation | 유한한 수 0~14; 다른 가구에 부착된 소품은 생략 또는 0 |
| finish | auto, oak, walnut, stone, fabric, metal |
| variant | 정수 0~5 |
| parentId | prop 접두사의 소품만 사용; 같은 층의 실제 표면 가구 id, 자기 자신·소품·중첩 부모 불가 |
| surfaceIndex | parentId가 있을 때만 정수 0~4; 책장·팬트리 0~3, 열린 진열장 0~4, 주방 카운터 0~2, 나머지 표면 0 |

부모로 허용하는 가구는 table, diningTable, feastTable, gameTable, coffeeTable,
cafeTable, kitchenIsland, kitchenCounter, cafeCabinet, gameCredenza, bookshelf,
pantryShelf, libraryShelfWood, libraryShelfDark, libraryShelfDisplay, studyDesk,
focusDesk, photoEditDesk, photoPrintBench, studyCabinet, mixingDesk, cameraCabinet,
longCredenza, openDisplayShelf, worktop, wallShelf다.
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
v8 호환·64개 경계도 검증한다. `src/test/resources/group-space-v9-catalog.json`은 프론트엔드와
서버가 함께 확인하는 저장 가능한 에셋 계약 목록이다.
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
2. v12 저장을 허용하는 서버를 배포한 뒤, v12 기본 배치 생성과 편집 저장을 켠
   프론트를 배포한다. 1단계 배포 전부터 열려 있던 탭은 새로고침해야 v12를 열 수 있다.

복층 저장을 켠 뒤 프론트를 되돌릴 때는 1단계 버전을 사용한다. 이미 저장한 v12
공간은 1단계에서도 열리고 편집은 비활성화된다.
