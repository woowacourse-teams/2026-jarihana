# 모임 음악

모임 상세와 3D 아지트가 공유하는 유튜브 음악 설정이다. 공간 배치와 별도의 문서·revision으로
저장하므로 음악 수정이 공간 배치의 저장 충돌을 만들지 않는다. 오디오 파일이나 외부 메타데이터를
서버가 내려받지 않으며 실제 재생은 클라이언트의 유튜브 플레이어가 담당한다.

## GET /api/groups/{groupId}/music

그룹 상세처럼 공개 조회한다. 로그인한 현재 ACTIVE 모임장만 `canEdit: true`이고, ACTIVE 모임의 구성원은 `canAdd: true`이다.
공개 방문자·비구성원·종료 모임에서는 `canAdd: false`이다.
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

ACTIVE 모임의 구성원 누구나 유튜브 영상 또는 재생목록을 신청할 수 있다. 인증 쿠키와 CSRF가 필요하다.

```json
{"title":"저녁 재즈","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}
```

- title은 공백이 아닌 1~80자, url은 1~500자이며 아래 유튜브 주소 검증을 따른다.
- 그룹 쓰기 잠금 안에서 추가한다. 추가 요청에는 expectedRevision이 없으며 동시 신청을 모두 보존한다.
- 현재 활성 음악이 없으면 새 항목을 곧바로 index0/position0/PLAYING으로 시작한다.
- 현재 음악이 있으면 재생·정지 상태, 위치, anchorTime, playback.revision을 그대로 둔 채 대기열 끝에 추가한다.
- music.queue는 **아직 재생하지 않은 항목만** 담는다. 최대 50개이며 각 항목은 서버 UUID id, title, url이다.
- 동일한 URL도 다시 신청할 수 있다. music.currentQueueId는 현재 큐 항목 UUID로, 같은 URL을 연속 재생해도 바뀐다.
- 기존 url/title과 playlists는 첫 추가 시 보존한다. playlists 저장 목록은 자동으로 대기열에 들어가지 않는다.
- 성공 시 GET과 같은 응답을 반환하며 설정 revision이 1 증가한다. 새 현재 곡을 시작하면 playback.revision도 증가한다.

큐가 도입된 문서는 서버가 관리한다. 기존 PUT 전체 문서 교체로 큐를 덮어쓰려 하면 409
GROUP_MUSIC_CONFLICT를 반환한다. 큐가 없는 기존 저장 요청은 이전 계약대로 지원한다.
queue와 currentQueueId는 서버 응답 전용 필드이며 PUT 입력으로 받지 않는다.

### POST /api/groups/{groupId}/music/queue/skip

ACTIVE 모임장만 `{ "expectedRevision": 3 }`으로 현재 소스를 건너뛴다. expectedRevision은
playback.revision이다. 유튜브 재생목록 소스라면 그 목록 전체를 건너뛴다.
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
- 서버는 URL을 요청하거나 리디렉션을 따라가지 않는다.

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
| 401 | UNAUTHENTICATED | 로그인하지 않은 저장 요청 |
| 403 | GROUP_ACCESS_DENIED | 모임장이 아닌 회원의 저장 |
| 404 | GROUP_NOT_FOUND | 모임 없음 |
| 409 | GROUP_ENDED | 종료된 모임 저장 |
| 409 | GROUP_MUSIC_CONFLICT | revision 불일치 |

`group_music.group_id`는 유일하며 그룹 삭제 시 FK ON DELETE CASCADE로 함께 삭제한다.
모든 환경에서 Flyway `V39__group_music.sql`로 스키마를 생성하고 Hibernate `validate`로 확인한다.
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
PAUSED이면 저장 위치 그대로다. 클라이언트는 응답 수신 이후 단조 시계로 경과 시간을 더하고
변경 이벤트를 받으면 서버 상태를 다시 읽는다. 설정 revision과 playback.revision은 독립적이다.

### PUT /api/groups/{groupId}/music/playback

ACTIVE 모임의 현재 모임장만 사용한다. 인증/CSRF가 필요하며 음악이 활성화되어 있어야 한다.

```json
{"expectedRevision":3,"state":"PAUSED","playlistIndex":0,"positionSeconds":130.5}
```

expectedRevision은 **playback.revision**이다. state는 PLAYING/PAUSED, playlistIndex는 0 이상의
정수, positionSeconds는 0 이상의 유한수다. 성공 시 서버 현재 시각을 anchorTime으로 저장하고
playback.revision을 1 증가시킨다. 설정 revision은 유지한다. 재생·정지·탐색은 구성원 전체에 적용된다.

### POST /api/groups/{groupId}/music/playback/advance

ACTIVE 모임의 로그인한 현재 구성원만 곡이 끝났음을 알릴 수 있다. 인증/CSRF가 필요하다.

```json
{"expectedRevision":3,"playlistIndex":0,"trackDurationSeconds":120,"queueLength":8}
```

- expectedRevision과 playlistIndex가 현재 재생 상태와 일치해야 한다.
- PLAYING 상태, 활성화된 음악이어야 한다.
- duration은 0 초과~86,400 이하 유한수, queueLength는 1~5,000 정수다.
- playlistIndex는 queueLength보다 작아야 한다.
- 서버가 계산한 현재 위치가 보고된 duration-1초 이상일 때만 전환한다.
- queueLength는 현재 유튜브 소스의 **내부 영상 수**이며 music.queue의 길이가 아니다.
- 큐 모드에서 단일 영상은 queueLength=1, playlistIndex=0이어야 한다.
- 유튜브 재생목록 내부에 다음 영상이 있으면 index를 1 증가시키며 설정 revision은 유지한다.
- 큐 모드의 현재 소스가 끝나면 대기열 첫 항목을 제거해 선택하고 index0으로 시작한다.
  초과 시간은 max(0,현재위치-duration)으로 전달하며 설정 revision도 1 증가한다.
- 대기열이 비었으면 skip과 같은 종료 상태로 멈춘다. 마지막 소스를 반복하지 않는다.
- 모든 성공에서 anchorTime=서버현재시각, playback.revision+=1이다.
- 아직 큐를 도입하지 않은 기존 문서는 호환성을 위해 index=(index+1)%queueLength로 반복한다.
- 같은 끝 지점을 여러 구성원이 보고해도 그룹 쓰기 잠금과 revision 비교로 하나만 성공한다.
- stale revision/index, PAUSED, 너무 이른 요청, 미설정/비활성 음악은 409 GROUP_MUSIC_CONFLICT다.
  범위·형식 오류는 400 INVALID_PARAMETER, 비구성원은 403, 비로그인은 401, 종료 모임은 409 GROUP_ENDED다.

영상 길이와 큐 길이는 유튜브 플레이어를 가진 구성원 클라이언트가 보고한다. 서버는 실제 유튜브
길이를 외부 조회하지 않으므로 허위 길이 보고까지 판별하지 못한다. CAS는 중복 전환과 보고된
길이 기준의 조기 전환을 제한한다. 공개 방문자는 타임라인을 읽지만 다음 곡 전환 요청 권한은 없다.
구성원이 없는 동안 여러 곡이 지나간 경우에도 다음 연결 구성원의 보고를 통해 한 곡씩 전환한다.
