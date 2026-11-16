# 실시간 아지트 입장

백엔드는 입장 토큰을 발급하고 [모임 공간 API](group-space.md)로 배치를 저장한다.
이동, 좌석 점유, 손에 든 소품과 상호작용은 별도 `realtime/` 서버가 처리한다.
토큰 발급에 성공하면 기존 API 응답 형식과 `Cache-Control: no-store`를 사용한다.

## POST /api/groups/{groupId}/space/join-token

로그인과 기존 CSRF 쿠키·헤더가 필요하다. 요청 본문은 없다. 탈퇴하지 않은 로그인
회원은 ACTIVE 동아리·스터디에 입장할 수 있다. 기존 공개 공간 정책을 따라 비소속
회원도 방문할 수 있으며, `SESSION`과 종료된 모임에는 새 실시간 입장을 허용하지 않는다.

```json
{"success":true,"data":{"token":"<서명된 일회 입장 JWT>","websocketUrl":"wss://realtime.example.test/ws/realtime","expiresAt":1794441660000},"error":null}
```

JWT는 HS256으로 서명한다. `iss`는 `prod` 프로필에서 `jarihana-api-prod`, 로컬·개발·테스트에서
`jarihana-api-dev`다. `aud`에는 `jarihana-realtime`을 사용한다. `sub`는 회원 ID 문자열,
`roomId`는 모임 ID 문자열이며 무작위 `jti`, `iat`, `exp`를 포함한다. 유효 기간은 60초다.
`iat`·`exp`는 JWT 규격의 epoch 초, `expiresAt`은 epoch 밀리초다. 해당 API의 기존
`ACCESS_TOKEN_SECRET`에서 환경별 입장 키를 계산해 realtime에 전달한다. 토큰에 닉네임·역할·배치·개인정보를
넣지 않는다. realtime은 발급자와 서명을 검증한 뒤 해당 환경의 DB에서 현재 상태를 확인한다.

토큰을 URL query에 넣지 않는다. realtime 연결의 인증 메시지로 보내며 `jti` 재사용
차단과 재연결 시 새 토큰 발급은 realtime 클라이언트·서버 계약을 따른다. 기존 서비스의
Access Token을 realtime 입장 토큰으로 재사용하지 않는다.

## 접속 후 권한과 배치 갱신

realtime은 읽기 전용 DB 연결로 접속 중 역할과 배치 버전을 주기적으로 조회한다.
기존 접속자가 새 버전을 받으면 브라우저에서 [모임 공간 API](group-space.md)로 배치를
다시 조회한다. DB 연결 설정과 반영 주기는 [realtime 배포 문서](../../../../../infra/realtime/README.md)를 따른다.

## 설정

| 환경 변수 | 기본값 / 조건 |
| --- | --- |
| ACCESS_TOKEN_SECRET | 기존 로그인 JWT 시크릿. 환경별 입장 키 계산에 재사용 |
| REALTIME_WEBSOCKET_URL | 미설정 시 `ws://localhost:8090/ws/realtime`. 배포 환경에서는 WSS URL 지정 |

잘못된 URL 설정은 애플리케이션 시작 시 거절한다.
WSS 주소 또는 localhost/127.0.0.1/::1의 WS 주소만 허용하며
URL 사용자정보, query, fragment는 허용하지 않는다.
비밀값을 저장소·로그·브라우저 설정에 넣지 않는다.

## 오류와 검증

| 상태 | 코드 | 조건 |
| --- | --- | --- |
| 400 | INVALID_PARAMETER | 잘못된 요청 식별자 |
| 401 | UNAUTHENTICATED | 로그인 인증 없음 또는 실패 |
| 403 | ACCESS_DENIED | 입장 토큰의 CSRF 검증 실패 |
| 403 | GROUP_ACCESS_DENIED | 탈퇴 회원 또는 입장 대상 회원 없음 |
| 404 | GROUP_NOT_FOUND | 토큰 발급 대상 모임 없음 |
| 404 | GROUP_SPACE_NOT_AVAILABLE | SESSION 모임 |
| 409 | GROUP_ENDED | 종료된 모임 |

`RealtimeJoinTokenAcceptanceTest`는 HTTP와 PostgreSQL로 활성화 설정 없이 토큰을 발급하는지와 서명, 60초 유효 기간,
인증과 CSRF, 탈퇴 회원과 종료·세션 모임의 토큰 발급 제한을 검증한다.
