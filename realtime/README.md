# Realtime M1 + M2

Java 21 / Spring Boot 기반 독립 애플리케이션이다. 개발과 운영의 `backend/`는 각 환경의 JWT 발급과 가구 배치 저장을 담당한다. 이 서버는 발급 환경에 맞는 PostgreSQL에서 입장 권한과 가구 배치를 조회하고 공통 `/ws/realtime` 경로로 입퇴장, 이동, 좌석, 물건과 가구 상호작용을 동기화한다.

구조를 선택한 이유와 트레이드오프는 [아키텍처·결정 이력](../docs/clubhouse-realtime-architecture.md), 서버 경계는 [인프라 ADR 0007](../infra/docs/adr/0007-clubhouse-realtime-service.md), 배포는 [인프라 ADR 0008](../infra/docs/adr/0008-shared-realtime-deployment.md)에 기록한다. 화면 공유는 [인프라 ADR 0009](../infra/docs/adr/0009-projector-livekit-direction.md)의 M3 방향이며 현재 실행 범위에 포함하지 않는다.

```sh
cd realtime
./gradlew test bootJar
REALTIME_ENABLED=false java -jar build/libs/jarihana-realtime-0.0.1-SNAPSHOT.jar
```

실행 JAR 이름은 Gradle 프로젝트 버전 설정에 따라 달라질 수 있다. 저장소 루트에서 `docker build -f realtime/Dockerfile -t jarihana-realtime .`로 빌드한다. 배포 구성은 `../infra/realtime/`에 있다.

## 설정

| 환경 변수 | 기본값 / 의미 |
| --- | --- |
| `PORT` | 로컬 JAR `8090`, Docker 이미지·Compose `8080` |
| `REALTIME_ENABLED` | `false`. 활성화할 때 개발·운영 설정을 모두 채운다. |
| `REALTIME_DEV_TOKEN_KEY`, `REALTIME_PROD_TOKEN_KEY` | 환경별 기존 API JWT 시크릿에서 계산한 base64url 입장 키 |
| `REALTIME_DEV_DB_JDBC_URL`, `REALTIME_PROD_DB_JDBC_URL` | 개발·운영 PostgreSQL의 JDBC URL |
| `REALTIME_DEV_DB_USERNAME`, `REALTIME_PROD_DB_USERNAME` | 각 PostgreSQL에 접속하는 계정 |
| `REALTIME_DEV_DB_PASSWORD`, `REALTIME_PROD_DB_PASSWORD` | 각 DB 계정의 비밀번호 |
| `REALTIME_ALLOWED_ORIGINS` | 기본 `http://localhost:5173`. 개발·운영 origin을 쉼표로 구분한다. |
| `REALTIME_LEASE_VALIDITY` | 조회로 확인한 권한의 유효 기간. 기본 60초 |

Spring 설정 `realtime.*`로 제한값을 조절할 수 있다. 기본 제한은 방 128개, 방당 24명, 방당 물건 256개, 연결 1,024개, 방 입력 256개(정리 작업 예약 64개), 연결 송신 256 KiB/256개, 메시지 8 KiB/초당 60개다. 인증 5초, heartbeat 30초, 비정상 연결 종료 후 상태 보존 5초, 송신 지연 5초가 기본값이다. 명시적인 퇴장이나 다른 아지트로 이동할 때는 클라이언트가 `close(1000, "LEAVE")`를 보내며 서버는 좌석 해제·든 물건 내려놓기·제작 취소를 즉시 처리한다. 이전 연결의 늦은 LEAVE는 현재 generation을 바꾸지 않는다.

## 상태와 순서

공통 메시지 규격은 [실시간 v1 계약](../docs/clubhouse-realtime-contract-v1.md)에 있다. 가구 상호작용 규칙은 입장 환경의 `space_furniture_catalog.definition.interaction`에서, 휴대 소품 규칙은 `space_portable_item_catalog.definition`에서 읽는다. 상판 `surface.slots`와 수납 `storage.capacity`는 서로 다른 0부터 시작하는 슬롯 범위와 점유를 갖는다. 상판·수납 소품은 가구 ID와 슬롯으로 관리하고 WebSocket 응답에는 기존 클라이언트 호환을 위한 월드 좌표도 계산해 보낸다.

방마다 bounded mailbox 하나에서 상태를 변경한다. DB 조회와 WebSocket 송신은 별도 bounded executor를 사용한다. 연속 MOVE는 command 경계를 넘지 않고 최신 입력으로 합치며 출력 movement도 control 메시지 경계 뒤에서만 합친다. 초기 snapshot을 먼저 큐에 넣고 이후 full state와 movement frame을 보낸다. `roomEpoch`, 연결 generation, 배치 revision, command ID와 move sequence가 오래된 요청을 거부한다. command 결과는 사용자별 128개/60초 보관하며 중복 적용을 막는다. 같은 사용자 새 연결이 기존 연결을 교체하고, 오래된 인증 응답은 새 연결을 교체하지 못한다.

좌석 규칙은 DB의 `interaction.seatCount`를 사용한다. 앉아 있는 참여자는 좌석의 가구 ID와 슬롯, 안전한 접근 위치, 자세를 보관한다. 이동 요청은 거부하며 거리와 소품 투척은 접근 위치 기준으로 판정한다. `AUTH_JOIN`에서 `seatRefs: true`로 연결하면 좌석은 `assetId`와 `slot`만 전달한다. 이 기능을 요청하지 않은 v1 연결에는 `legacy-seat-anchors.json`에서 구 브라우저가 쓰는 좌석 표현을 계산한다.

JWT의 HS256 서명, issuer/audience/만료를 검증한 뒤 확인된 환경의 DB에서 회원, 모임 상태와 저장된 회원 아바타를 읽는다. jti는 발급 환경별로 만료까지 한 번만 사용한다. 동일한 모임 ID라도 개발과 운영의 방 상태는 각각 관리한다. 권한과 회원 아바타는 기본 20초마다 다시 읽고 배치는 기본 10초마다 조회한다. DB 조회가 실패하면 기존 권한 유효 기한이 연장되지 않는다. 회원 탈퇴, 모임 종료·삭제를 확인하면 연결을 닫는다.

배치 revision이 증가하거나 카탈로그가 바뀌면 새 규칙과 임시 상태를 같은 mailbox에서 재조정한다. 옮기거나 삭제한 좌석과 현재 규칙에서 범위를 벗어난 좌석은 해제하고 안전한 바닥으로 이동시킨다. 가구를 옮겨도 같은 종류의 가구 ID와 유효한 슬롯이 남아 있으면 상판·수납 소품을 유지한다. 가구를 제거하거나 슬롯이 무효가 되면 해당 상판·수납 소품을 제거한다. 손에 들거나 바닥에 놓거나 던진 소품은 출처 가구를 삭제해도 유지한다. 소품 종류를 비활성화하거나 카탈로그에서 삭제하면 해당 소품을 제거하고, 던지기만 비활성화하면 날아가는 소품을 안전한 바닥에 내려놓는다. 생산기의 위치나 생산 시간이 바뀌거나 결과 종류 또는 컵이 무효가 되면 제작을 취소한다. 제작 완료와 던지기 착지는 현재 방 상태의 tick에서 처리한다.

저장 배치 문서는 v11과 기본 아지트 v12를 지원한다. 미저장 모임은 단층 `lounge:11`의 기본 가구 배치를 사용하며 조회 시 방을 저장하지 않는다. 배치 목록에서 제외한 가구도 기존 방에서 규격과 상호작용을 유지한다. 서버는 접속한 방이 있는 환경마다 기본 10초 간격으로 두 카탈로그를 같은 PostgreSQL 스냅샷에서 조회한다. 조회에 실패하면 직전에 성공한 규칙을 사용한다. 두 카탈로그 중 하나가 변경되면 저장 배치 revision을 유지한 채 `catalogGeneration`이 올라간 전체 상태를 보낸다. v10 이하 문서는 공동 입장 시 `LAYOUT_UPGRADE_REQUIRED`를 반환한다. 모임장은 기존 가구를 그대로 편집·저장할 수 있다. 공동 입장을 사용하려면 편집기에서 템플릿 전체 교체를 선택하고 저장한다. 이때 가구는 선택한 템플릿의 기본 배치로 교체된다.

`--check-runtime`으로 실행하면 두 환경의 realtime 권한으로 필수 이관 완료 표시, 도면, 가구·휴대 소품 카탈로그, 시작 위치, 기본 방, 기존 방의 참조를 조회한다. 하나라도 준비되지 않았으면 종료 코드가 0이 아니므로 배포에서 기존 컨테이너를 유지한다.

## 운영 경계와 검증

모든 임시 상태는 단일 프로세스 메모리에 있다. 마지막 참여자가 나가면 방을 정리하고 서버가 재시작되면 두 환경의 좌석·물건·가구 상태가 초기화된다. `GET /actuator/health`는 활성화된 서버에서 두 DB의 연결과 조회 권한을 확인한다. Micrometer의 `realtime.rooms`, `realtime.connections`, `realtime.room.queue`, `realtime.outbound.bytes` 계측을 제공한다.

닫기 코드: 4001 인증/권한, 4002 새 연결로 교체, 4003 프로토콜/배치 업그레이드, 4004 과부하/지연/재시도, 4005 인증 시간 초과, 1001 재시작. close reason은 machine-readable 오류 코드이며 종료 직전 ERROR 전달은 네트워크 상태에 따라 생략될 수 있다. 클라이언트는 close reason도 처리해야 한다.

`./gradlew test bootJar`는 상태 전이, 권한, geometry, bounded executor/송신 회귀를 검증한다. PostgreSQL과 WebSocket을 함께 검증하려면 저장소 루트에서 `node infra/realtime/verify-protocol.mjs`를 실행한다.
