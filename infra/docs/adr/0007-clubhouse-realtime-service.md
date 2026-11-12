# 0007. 아지트 상태를 별도 Spring 실시간 앱에서 처리한다

상태: 채택 · 로컬 구현·검증 기록 있음 · 운영 적용 미확인

날짜: 2026-11-12

갱신: 2026-11-13 — DB 직접 조회, 공용 개발·운영 분리와 토큰 선택 이유 보강

## 배경

아지트의 이동·좌석 점유·공용 물건 상태는 현재 접속한 사용자끼리 공유해야 한다. 늦게 들어온 사람도 누가 앉아 있고 무엇을 들고 있는지 알아야 하므로 M1의 입퇴장·이동과 M2의 상호작용을 함께 개발했다. 사용자는 새 EC2와 Docker를 사용하되, 개발·운영은 당분간 하나의 realtime 컨테이너로 배포하기를 요청했다.

## 결정 1. 모노레포 안에서 실행 단위를 분리한다

루트 `realtime/`에 Java 21·Spring Boot 독립 Gradle 앱을 둔다. 기존 API의 배포와 장기 WebSocket 연결·방 메모리의 수명을 분리한다. 기존 Java/Spring 기반을 유지하면서 방 상태 규칙을 별도 앱에서 구현한다. 서버·실행 구성·메시지 계약을 같은 저장소에서 변경하고 검증할 수 있다.

기존 backend는 로그인·방문 정책·가구 배치·아바타 저장과 Flyway를 소유한다. realtime은 입장 상태를 확인하고 이동·좌석·물건을 방 메모리에서 관리한다. 별도 게임 엔진이나 Java 엔티티 공유 모듈은 추가하지 않는다. 가구의 좌석·표면 정보는 프론트 카탈로그에서 생성한 판정용 JSON으로 공유하고 메시지는 버전 있는 계약으로 관리한다.

분리로 인해 앱 두 개의 호환성을 관리해야 한다. API 배포만으로 realtime이 재시작되지는 않지만, 같은 develop 변경이 두 workflow의 조건을 만족하면 둘 다 각각 배포된다. [인프라 ADR 0008](0008-shared-realtime-deployment.md)

## 결정 2. 기존 DB를 직접 읽고 쓰기는 backend에 둔다

초기에는 realtime이 기존 backend의 내부 API로 권한과 저장 배치를 조회하는 안을 검토했다. 사용자는 이 호출의 필요성과 쓰기 작업의 유무를 물었고, DB 직접 조회를 선택했다. 현재 realtime에는 해당 내부 HTTP 호출을 두지 않는다.

환경별 PostgreSQL 연결에서 회원·모임·가입 관계·저장 배치·아바타를 조회한다. 브라우저가 제시한 배치를 각자 판정 기준으로 삼으면 같은 좌석 ID라도 좌표나 존재 여부가 다를 수 있다. DB의 저장 배치를 방의 공통 기준으로 사용한다. 이 결정이 저장 즉시 모든 브라우저가 같은 화면을 본다는 보장은 아니다.

활성 방의 저장 배치는 10초, 권한·아바타는 20초 간격으로 재확인한다. DB 갱신 결과를 방 실행 큐에서 적용한다. 조회 실패가 권한 유효 기한을 넘으면 접속을 유지하지 않는다. 저장 배치 적용 시 좌석·물건 부착·진행 작업을 함께 조정하며, 원본의 공지·사진·링크는 실시간 스냅샷에 복제하지 않는다.

| 대안 | 얻는 것 | 이번 선택에서 감수하는 비용 |
| --- | --- | --- |
| 내부 API 조회 | backend가 DB 스키마와 업무 규칙을 감춤 | 직접 조회는 HTTP 경로·내부 인증을 줄이는 대신 컬럼과 방문 규칙에 결합됨 |
| DB 직접 조회 — 채택 | 저장된 권한·배치를 별도 HTTP API 없이 읽음 | DB 접근 설정, 조회 부하, backend와의 규칙·마이그레이션 호환성을 관리해야 함 |
| 브라우저 배치를 그대로 신뢰 | 서버 조회를 줄임 | 서로 다른 배치를 기준으로 판정할 수 있으므로 채택하지 않음 |
| 저장 이벤트 전달·CDC | 갱신 지연을 줄일 수 있음 | 현재는 주기 조회를 사용하며 이벤트 전달·유실 복구 체계를 추가하지 않음 |

애플리케이션은 읽기 전용 연결과 조회 SQL을 사용한다. 배포는 기존 API DB 계정을 재사용하므로 DB 권한 자체가 SELECT로만 제한됐다는 뜻은 아니다. 위치·착석·임시 물건을 DB에 쓰는 기능과 realtime의 Flyway 실행은 없다. [조회 구현](../../../realtime/src/main/java/com/project/jarihana/realtime/room/persistence/RoomReadRepository.java), [DB 연결](../../../realtime/src/main/java/com/project/jarihana/realtime/room/persistence/RealtimeDatabases.java)

## 결정 3. 검증한 발급자로 DB와 방을 구분한다

개발·운영이 같은 URL을 쓰므로 URL이나 브라우저가 보낸 환경 문자열로 DB를 고르지 않는다. 기존 API가 발급한 입장 JWT의 서명과 발급자 `iss`를 검증해 환경을 결정한다. 허용된 발급자별 키로 검증이 성공해야 DB·방에 접근한다.

| 환경 | `iss` | DB | 방 식별 예시 |
| --- | --- | --- | --- |
| 개발 | `jarihana-api-dev` | `jarihana_dev` | `(dev, 10)` |
| 운영 | `jarihana-api-prod` | `jarihana_prod` | `(prod, 10)` |

방 키는 `(검증된 환경, 모임 ID)`다. 회원 ID와 모임 ID가 같아도 참여자·좌석·물건·접속 교체는 각 환경의 방에 속한다. 토큰 재사용 방지용 `jti`도 환경과 함께 식별한다. Origin 허용 목록은 접속 출처를 검사하며 개발·운영의 데이터 라우팅을 대신하지 않는다.

프로세스를 함께 쓰는 만큼 CPU·메모리·장애·재시작 범위는 공유한다. 방 데이터의 논리적 분리와 인프라의 물리적 격리는 다르다. 운영 안정성이나 독립 배포가 필요해지면 컨테이너·러너를 분리한다. [검증 구현](../../../realtime/src/main/java/com/project/jarihana/realtime/auth/AdmissionTokenVerifier.java), [방 등록부](../../../realtime/src/main/java/com/project/jarihana/realtime/room/runtime/RoomRegistry.java)

## 결정 4. 기존 JWT 시크릿에서 입장 전용 키를 유도한다

별도 `REALTIME_PRIVATE_KEY`·공개키를 등록하는 안 대신 기존 `ACCESS_TOKEN_SECRET`를 재사용하라는 요청을 반영했다. 기존 로그인 토큰을 WebSocket에서 그대로 쓰는 방식은 아니다. backend가 로그인·방문 권한을 확인한 뒤 모임에 한정된 60초 입장 JWT를 발급한다.

```text
입장 키 = HMAC-SHA256(
  key = 해당 환경의 ACCESS_TOKEN_SECRET,
  message = "jarihana-realtime:v1:" + issuer
)
입장 JWT: HS256, aud=jarihana-realtime, sub=회원 ID, roomId=모임 ID,
          iss=환경별 발급자, jti=일회 식별자, iat/exp=발급·만료 시각
```

API는 키를 유도해 토큰을 발급한다. 배포 workflow는 같은 방식으로 유도한 키를 realtime에 전달한다. 토큰은 WebSocket URL에 붙이지 않고 첫 인증 메시지로 보낸다. 재접속할 때는 새 토큰을 발급받는다.

이 방식은 새 키 쌍의 수동 등록을 없애고 발급 목적을 분리한다. 반면 API와 workflow의 유도 규칙을 일치시켜야 하고, 기존 JWT 시크릿을 교체하면 realtime 설정도 함께 갱신해야 한다. 대칭키이므로 realtime이 가진 검증 키로 입장 토큰 서명도 가능하다. 공개키 검증만 허용하는 서비스 경계가 필요해지면 비대칭키 방식으로 재검토한다. [API 발급 구현](../../../backend/src/main/java/com/project/jarihana/auth/token/RealtimeJoinTokenProvider.java), [배포 키 유도](../../realtime/derive-token-key.mjs)

## 결정 5. 일시 상태는 방 하나가 순서대로 처리한다

`RoomRuntime`의 제한된 큐를 공용 실행 풀에서 처리하며, 같은 방의 `RoomState` 변경은 순차 실행한다. DB 조회와 소켓 전송은 각각 별도 실행 흐름에 두어 한 느린 작업이 방 규칙 처리를 붙잡지 않게 한다. 방 세대·연결 세대·배치 버전으로 이전 연결의 종료나 늦은 조회 결과를 구분한다.

이동 프레임은 최신 값으로 합칠 수 있지만 좌석·물건 명령의 순서는 보존한다. 명령 ID로 중복 실행을 제어하고 재접속 뒤 미확정 명령을 자동 재생하지 않는다. 큐·연결·방·물건 수에는 상한이 있다. 이 상한은 검증된 운영 수용량을 뜻하지 않는다.

Redis나 다중 서버 방 인계는 현재 도입하지 않는다. 빈 방 정리 또는 프로세스 재시작 때 위치·좌석·임시 물건은 초기화된다. 저장 배치는 DB에서 다시 읽고 사용자는 새 방 세대로 입장한다. 한 EC2·컨테이너는 고가용성 구성이 아니다. 재시작 중 상태 보존, 여러 인스턴스, 무중단 방 이전이 요구되면 방 소유권·라우팅·복구를 별도 결정한다.

## 관련 결정과 검증 경계

가구 이동 중 착석·물건 처리와 개인 아바타는 [공통 아키텍처 문서](../../../docs/clubhouse-realtime-architecture.md)에 기록했다. 배포·관측은 [인프라 ADR 0008](0008-shared-realtime-deployment.md), 미래 화면 공유는 [인프라 ADR 0009](0009-projector-livekit-direction.md)를 따른다.

메시지 상세는 [실시간 v1 계약](../../../contracts/realtime/v1/README.md), 실행은 [배포 가이드](../../realtime/README.md), 기존 로컬 결과와 남은 운영 확인은 [검증 기록](../../realtime/VERIFICATION.md)에 둔다. 이번 문서 보강 자체가 운영 배포나 성능 검증의 근거는 아니다.
