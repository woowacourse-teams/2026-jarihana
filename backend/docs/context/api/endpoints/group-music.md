# 모임 음악

모임 상세와 3D 아지트가 공유하는 유튜브 음악 설정이다. 공간 배치와 별도의 문서·revision으로
저장하므로 음악 수정이 공간 배치의 저장 충돌을 만들지 않는다. 서버는 YouTube Data API로
영상 길이와 외부 재생 허용 여부를 확인한다. 실제 재생은 클라이언트의 유튜브 플레이어가 담당한다.

## GET /api/groups/{groupId}/music

그룹 상세처럼 공개 조회한다. ACTIVE 모임의 구성원에게는 공통 재생을 제어할 수 있는
`canEdit: true`와 곡을 신청할 수 있는 `canAdd: true`를 반환한다.
공개 방문자·비구성원·종료 모임에서는 두 필드 모두 `false`다. 음악 설정 전체 저장은 모임장 권한이다.
저장 이력이 없을 때 응답은 다음과 같다.

```json
{"success":true,"data":{"music":{"enabled":false,"autoplay":true,"title":"우리 모임의 음악","url":""},"revision":0,"canEdit":false,"canAdd":false,"updatedAt":null,"serverTime":"2026-11-08T16:00:00Z","playback":{"state":"PAUSED","playlistIndex":0,"positionSeconds":0,"anchorTime":"2026-11-08T16:00:00Z","revision":0}},"error":null}
```

## GET /api/groups/{groupId}/music/events

음악 조회와 같은 공개 범위의 SSE 연결이다. 연결 직후 및 음악 변경 커밋 후
`event: change`와 `{"revision":4,"playbackRevision":2}` 형태의 데이터를 보낸다.
이벤트에 곡 정보나 사용자 권한을 싣지 않는다. 클라이언트가 GET으로 최신 스냅샷을 읽어
누락된 변경을 따라잡고 접속 계정에 맞는 권한을 확인한다.

연결이 정상일 때 클라이언트는 주기적으로 조회하지 않는다. 연결이 끊기면 EventSource로
재연결하며 그동안 느린 조회를 사용한다. 서버는 활성 스트림이 있는 모임 단위로 다른
인스턴스에서 발생한 변경을 확인한다.

## PUT /api/groups/{groupId}/music

현재 ACTIVE 모임장만 저장하며 기존 인증 쿠키와 CSRF 쿠키·헤더가 필요하다.
요청은 `{ "music": { "enabled": true, "autoplay": true, "title": "우리 모임의 음악",
"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }, "expectedRevision": 0 }` 형태다.
성공 시 GET과 동일한 envelope를 반환하고 설정 revision을 1 증가시킨다.
url/enabled/autoplay가 바뀌면 공통 재생 상태를 index0/position0으로 초기화하며 playback.revision도
증가시킨다. enabled와 autoplay가 모두 참이면 PLAYING, 그렇지 않으면 PAUSED로 시작한다.
title 또는 playlists만 바꾸면 기존 재생 위치·기준 시각·playback.revision을 보존한다. 최초 설정 저장 시 playback.revision은 1이다.
updatedAt은 기존 공통 계약의 Asia/Seoul LocalDateTime이다.

그룹 행의 쓰기 잠금으로 최초 저장·리더 위임·종료·삭제와 직렬화한다.
`expectedRevision` 불일치 시 409 `GROUP_MUSIC_CONFLICT`이며 기존 설정은 보존한다.
클라이언트는 수정 초안을 보존하고 최신 설정을 다시 불러올 수 있어야 한다.

## POST /api/groups/{groupId}/music/queue

ACTIVE 모임의 구성원 누구나 유튜브 단일 영상을 신청할 수 있다. 인증 쿠키와 CSRF가 필요하다.

```json
{"title":"저녁 재즈","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
```

- title은 공백이 아닌 1~80자, url은 1~500자이며 아래 유튜브 주소 검증을 따른다.
- 신청 권한을 확인하고 DB 트랜잭션 밖에서 영상 정보를 조회한다. 그룹 쓰기 잠금을 얻은 뒤 권한을 다시 확인하고 추가한다.
- 그룹 쓰기 잠금 안에서 이미 끝난 곡을 제외한 시점의 대기열에 추가한다.
- 추가 요청에는 expectedRevision이 없으며 동시 신청을 모두 보존한다.
- 재생목록 전용 주소는 400으로 거절한다. 영상과 list 매개변수가 함께 있으면 해당 영상의 watch 주소로 정규화한다.
- 삭제·비공개·외부 재생 금지 영상은 400 GROUP_MUSIC_VIDEO_UNPLAYABLE이다.
- 조회 장애·응답 이상·API 키 미설정은 503 GROUP_MUSIC_VERIFICATION_UNAVAILABLE이며 기존 음악을 보존한다.
- 현재 활성 음악이 없으면 새 항목을 곧바로 index0/position0/PLAYING으로 시작한다.
- 현재 음악이 있으면 재생·정지 상태, 현재 위치와 playback.revision을 유지하며 대기열 끝에 추가한다.
- music.queue는 **아직 재생하지 않은 항목만** 담는다. 최대 50개이며 각 항목은 서버 UUID id, title, url, durationSeconds, verifiedAt이다.
  현재 곡의 durationSeconds와 verifiedAt도 music 문서에 저장한다. verifiedAt은 UTC Instant다.
- 동일한 URL도 다시 신청할 수 있다. music.currentQueueId는 현재 큐 항목 UUID로, 같은 URL을 연속 재생해도 바뀐다.
- 기존 url/title과 playlists는 첫 추가 시 보존한다. playlists 저장 목록은 자동으로 대기열에 들어가지 않는다.
- 성공 시 GET과 같은 응답을 반환하며 설정 revision이 1 증가한다. 새 현재 곡을 시작하면 playback.revision도 증가한다.

큐가 도입된 문서는 서버가 관리한다. 기존 PUT 전체 문서 교체로 큐를 덮어쓰려 하면 409
GROUP_MUSIC_CONFLICT를 반환한다. 큐가 없는 기존 저장 요청은 이전 계약대로 지원한다.
queue, currentQueueId, durationSeconds, verifiedAt, lastSkippedTitle은 서버 응답 전용 필드다.

### POST /api/groups/{groupId}/music/queue/skip

ACTIVE 모임의 구성원이 `{ "expectedRevision": 3, "expectedCurrentQueueId": "..." }`으로
현재 소스를 건너뛴다. expectedRevision은 playback.revision이다. 대기열의 곡을 대상으로 할 때
expectedCurrentQueueId에는 music.currentQueueId를 담는다. 이 필드는 기존 클라이언트와 호환하기
위해 생략할 수 있다. 유튜브 재생목록 소스라면 그 목록 전체를 건너뛴다.
대기열의 첫 항목을 제거하여 현재 곡으로 선택하고 index0/position0/PLAYING으로 시작한다.
마지막 소스 뒤에는 enabled=false, url="", title="우리 모임의 음악", queue=[]가 되며
currentQueueId를 제거하고 PAUSED/position0으로 멈춘다. 설정·재생 revision은 각각 1 증가한다.
중복/오래된 요청은 409이며 큐를 추가로 소비하지 않는다.

## 설정 검증

- enabled, autoplay: 필수 boolean. autoplay는 재생 의도이며 브라우저 자동 재생 허용을 보장하지 않는다.
- title: 필수 문자열, 최대 80자.
- url: 필수 문자열, 최대 500자. 빈 문자열은 enabled=false일 때만 허용한다.
- playlists: 선택 배열, 최대 20개. 생략한 기존 요청과 저장 문서도 계속 지원한다.
  각 항목은 title(공백이 아닌 1~80자 문자열), url(1~500자 유튜브 주소) 두 필드만 가진다.
  항목 URL도 아래 검증을 따르며 동일한 URL 문자열을 중복 저장할 수 없다.
- playlists를 보낸 경우 활성 url과 title이 일치하는 항목이 목록에 있어야 한다.
  url이 빈 문자열이고 enabled=false이면 재생 항목을 선택하지 않고 목록만 저장할 수 있다.
- enabled, autoplay, title, url, playlists 외 추가 필드를 허용하지 않는다.
- HTTPS만 허용하며 사용자정보와 명시적인 포트는 거절한다.
- 호스트는 youtube.com, www.youtube.com, m.youtube.com, music.youtube.com, youtu.be만 허용한다.
- youtube 호스트의 경로는 /watch?v=VIDEO, /playlist?list=PLAYLIST, /shorts/VIDEO, /embed/VIDEO다.
- youtu.be는 /VIDEO 형태만 허용한다.
- VIDEO는 `[A-Za-z0-9_-]{11}`, PLAYLIST는 `[A-Za-z0-9_-]{10,100}`이다.
- watch/share 주소의 list 매개변수도 동일하게 검증한다. si/t 등 공유 매개변수는 허용하되 중복 키는 거절한다.
- 서버는 입력 URL에 직접 접속하지 않는다. 검증한 ID로 고정된 YouTube Data API 주소에 요청한다.

### 플레이리스트 추가 예시

```json
{
  "music": {
    "enabled": true,
    "autoplay": true,
    "title": "우리 모임의 음악",
    "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "playlists": [
      {"title": "우리 모임의 음악", "url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
      {"title": "저녁 재즈", "url": "https://www.youtube.com/playlist?list=PL1234567890_jazz"}
    ]
  },
  "expectedRevision": 1
}
```

playlists는 모임에서 선택할 수 있는 저장 목록이고, 최상위 url/title이 현재 재생 선택이다.
기존 music_json 컬럼에 함께 저장되며 GET에서도 반환한다. PUT은 전체 교체이므로 playlists를
생략하는 기존 클라이언트의 저장은 목록 없는 문서로 교체한다. 선택 URL·enabled·autoplay를
유지한 채 다른 항목을 추가·삭제하는 것은 재생 중인 곡과 위치를 바꾸지 않는다.

## 오류·저장 수명

| 상태 | 코드 | 조건 |
| --- | --- | --- |
| 400 | INVALID_PARAMETER | 잘못된 설정·유튜브 주소·revision |
| 400 | GROUP_MUSIC_VIDEO_UNPLAYABLE | 재생할 수 없는 영상 신청 |
| 503 | GROUP_MUSIC_VERIFICATION_UNAVAILABLE | 유튜브 정보 조회 실패 또는 API 키 미설정 |
| 401 | UNAUTHENTICATED | 로그인하지 않은 저장 요청 |
| 403 | GROUP_ACCESS_DENIED | 비구성원의 재생 제어·신청 또는 모임장이 아닌 구성원의 설정 저장 |
| 404 | GROUP_NOT_FOUND | 모임 없음 |
| 409 | GROUP_ENDED | 종료된 모임 저장 |
| 409 | GROUP_MUSIC_CONFLICT | revision 불일치 |

`group_music.group_id`는 유일하며 그룹 삭제 시 FK ON DELETE CASCADE로 함께 삭제한다.
모든 환경에서 Flyway `V41__group_music.sql`로 스키마를 생성하고 Hibernate `validate`로 확인한다.
음악 설정은 공개 응답에 포함되므로 비공개 주소나 개인 정보를 입력하지 않는 UI가 필요하다.

`GroupMusicControllerTest`는 실제 PostgreSQL에서 기본값·공개/회원별 조회·저장·충돌·종료·
인증/CSRF·허용/금지 주소·그룹 삭제를 검증한다. `GroupSpaceControllerTest`를 함께 실행해
기존 공간 API를 확인한다. v8 배치 아이템 `musicConsole`은 별도 음악 설정을 여는 가구이며,
음악 설정 자체를 room JSON에 중복 저장하지 않는다.

## 공통 재생 타임라인

GET과 모든 음악 변경 응답에 `serverTime`과 `playback`을 포함한다.
`serverTime`과 `anchorTime`은 UTC Instant(Z), 기존 `updatedAt`은 Asia/Seoul LocalDateTime이다.

```json
{"serverTime":"2026-11-08T16:02:00Z","playback":{"state":"PLAYING","playlistIndex":0,"positionSeconds":10,"anchorTime":"2026-11-08T16:00:00Z","revision":3}}
```

positionSeconds는 anchorTime 순간의 저장 위치다. PLAYING이면 현재 위치는
`positionSeconds + max(0, serverTime - anchorTime)`이며 위 예시에서는 130초다.
PAUSED이면 저장 위치 그대로다. 설정 revision과 playback.revision은 독립적이다.

현재 곡에 music.currentQueueId와 양수의 music.durationSeconds가 있으면 현재 곡과 뒤에 있는
곡들의 길이가 재생 시간표가 된다. 클라이언트는 응답 수신 후 단조 시계로 경과 시간을 더하고,
곡 길이만큼 차례로 빼서 해당 시각의 곡과 위치를 계산한다. 경과 시간이 여러 곡의 길이 합을
넘으면 지난 곡을 모두 제외한다. 대기열이 소진되면 음악이 꺼진 상태로 표시한다.

접속자가 없는 동안에도 같은 방식으로 시간이 흐른다. 서버는 GET 시점에 현재 곡과 남은
대기열을 계산한다. 재생할 곡이 바뀌었다면 anchorTime을 serverTime으로 두고 그 곡에 진입한
뒤 경과한 시간을 positionSeconds로 반환한다. 이 계산은 DB와 revision을 변경하지 않는다.
곡 추가·일시 정지·재개·건너뛰기는 현재 시각의 시간표를 반영한 뒤 저장한다. SSE로 변경을
받은 클라이언트는 GET으로 갱신한다. 기존 소스에 길이 정보가 없으면 그 곡부터 기존 종료 보고를 사용한다.

### PUT /api/groups/{groupId}/music/playback

ACTIVE 모임의 구성원이 사용한다. 인증/CSRF가 필요하며 음악이 활성화되어 있어야 한다.

```json
{"expectedRevision":3,"expectedCurrentQueueId":"...","state":"PAUSED","playlistIndex":0,"positionSeconds":130.5}
```

expectedRevision은 **playback.revision**이다. expectedCurrentQueueId를 보내면 서버가 계산한
현재 곡과 일치해야 한다. state는 PLAYING/PAUSED, playlistIndex는 0 이상의 정수,
positionSeconds는 0 이상의 유한수다. 시간표를 사용하는 곡은 서버가 계산한 위치에서
일시 정지·재개한다. 기존 소스는 모임장의 탐색과 구성원의 다음 재생목록 항목 건너뛰기를 지원한다.
성공 시 서버 현재 시각을 anchorTime으로 저장하고 playback.revision을 1 증가시킨다.
설정 revision은 유지한다.

### POST /api/groups/{groupId}/music/playback/advance

ACTIVE 모임의 구성원이 기존 소스의 곡 종료 또는 영상 오류를 보고할 수 있다.
시간표를 사용하는 곡은 영상 오류 재확인에만 이 API를 사용한다. 인증/CSRF가 필요하다.

```json
{"expectedRevision":3}
```

- expectedRevision은 현재 playback.revision과 일치해야 한다. PLAYING 상태와 활성 음악이 필요하다.
- 영상 길이는 YouTube Data API로 확인한다.
- 서버 현재 시각과 anchorTime·positionSeconds로 계산한 위치가 확인된 영상 길이 이상일 때만 전환한다.
- 이전 클라이언트의 playlistIndex, trackDurationSeconds, queueLength 필드는 호환을 위해 무시한다.
- 기존 소스가 끝나고 신청곡이 남아 있으면 다음 신청곡을 index0/position0으로 시작한다.
- 기존 저장 재생목록은 서버가 현재 index의 영상과 다음 항목 유무를 조회해 진행한다.
  같은 소스 안에서는 초과 시간을 다음 영상으로 전달한다. 큐 없는 기존 소스의 반복 재생도 지원한다.
- 그룹 쓰기 잠금과 revision 비교로 같은 종료 지점에 대한 요청 하나만 성공한다.
  외부 조회 중 곡·재생 상태·권한이 바뀌면 잠금 안에서 재검증하여 오래된 결과를 거절한다.
- 성공하면 anchorTime과 playback.revision을 갱신하고 SSE change 이벤트를 발행한다.
- 오래된 revision, PAUSED, 너무 이른 요청, 비활성 음악은 409 GROUP_MUSIC_CONFLICT다.
  비구성원은 403, 비로그인은 401, 종료 모임은 409 GROUP_ENDED다.

유튜브 오류 100·101·150을 받은 구성원 클라이언트는 다음 요청으로 재확인을 요청한다.

```json
{"expectedRevision":3,"expectedCurrentQueueId":"...","checkUnavailable":true}
```

서버가 삭제·비공개·외부 재생 금지를 확인하면 대기열을 진행하고 music.lastSkippedTitle로 안내할 곡명을 반환한다.
서버 조회에서 재생 가능하면 409로 현재 곡을 유지한다. API 장애는 503으로 반환하며 큐와 재생 위치를 유지한다.
개인 네트워크 오류·자동 재생 차단·플레이어 오류 5·153은 공통 건너뛰기 요청을 보내지 않는다.
공개 방문자는 공통 타임라인을 읽을 수 있다.

### 유튜브 API 설정

서버 환경 변수 YOUTUBE_DATA_API_KEY에 YouTube Data API v3 사용이 가능한 키를 설정한다.
GitHub Actions 배포는 같은 이름의 시크릿을 읽는다. 개발 배포는 개발용 Compose로 전달한다.
운영은 배포 main SHA의 `app-compose.yml`에 포함된 환경 변수 매핑으로 `prepare`에서 전달한다.
키가 미설정이면 기존처럼 빈 값을 전달한다. 최초 검증기 v2 설치 조건은
[운영 Compose 적용 절차](../../../../../infra/blue-green-deploy/docs/deployment.md#최초-적용과-자동화-범위)를 따른다.
키는 HTTP X-Goog-Api-Key 헤더로 보내고 클라이언트 응답에 포함하지 않는다.
연결 제한은 2초, 응답 제한은 3초다. 영상 정보 조회 실패를 영상 삭제로 취급하지 않는다.

[YouTube 영상 정보](https://developers.google.com/youtube/v3/docs/videos),
[기존 재생목록 항목 조회](https://developers.google.com/youtube/v3/docs/playlistItems/list).
