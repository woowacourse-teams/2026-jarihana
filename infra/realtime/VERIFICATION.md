# M1·M2 로컬 구현 검증

최종 PR 검증: 2026-11-13 · 브랜치 `feat/clubhouse-realtime`

## PR 작성 전 재검증

최신 `develop`의 `dd618100`을 반영한 뒤 실행했다. 아래 결과는 이번 PR 작성 시점의 검증이며, 뒤의 기존 구현 기록과 횟수를 합산하지 않는다.

| 검증 | 결과 |
| --- | --- |
| Java 21 backend 토큰 설정·발급·입장·groupspace 테스트 | 31개 통과 |
| Java 21 realtime `test bootJar --rerun-tasks` | 60개 통과, 실행 JAR 생성 |
| Node 24 frontend 전체 Jest | 268개 suite, 3,595개 테스트 통과 |
| frontend lint / production build | 통과. 기존 webpack 번들 크기 경고 2건 |
| `node infra/realtime/verify-protocol.mjs --browser` | 프로토콜 17개와 브라우저 5개, 총 22개 시나리오 통과 |
| Linux 프론트 배포 계약 | 42개 통과. 정확한 `/ws/realtime`, wildcard, 혼합 패턴 허용과 예상 밖 `/assets/*` 거절 포함 |
| 배포 정적 검사 | YAML 7개, workflow shell 블록 39개, Compose 구성, Alloy 설정 통과 |
| Grafana 대시보드 | PromQL 규칙 18개와 개발·운영 구분, 수집 실패·오래된 표본 시나리오 통과 |
| 생성된 판정 자료 | `export-runtime.cjs --check`: 에셋 122개·배치 42개 일치 |

프로토콜 검증은 임시 PostgreSQL 17의 두 DB와 실제 Spring 서버 하나를 사용했다. 같은 모임·회원·토큰 ID를 가진 개발·운영 연결이 섞이지 않았고, 서로 다른 DB의 아바타·배치·좌석·탈퇴 상태를 따랐다. 브라우저 두 세션의 계정 HTTP 응답은 fixture이며 WebSocket은 실제 서버다. 각 회원의 아바타, 원격 인사·이동, 카메라 꺼내기 → 촬영 미리보기 → 활동 작성 화면 첨부까지 확인했다. 양쪽 스크린샷을 확인했고 브라우저 page error는 0건이다. 실제 게시·외부 업로드는 하지 않았다.

미리보기는 임시 loopback 포트를 사용했다. 기존 5193 서버와 개인 Chrome을 조작하지 않았고, 검증용 서버·Chromium·DB 컨테이너는 스크립트가 종료했다.

로컬 증거는 임시 디렉터리 `jarihana-realtime-protocol-H7l8uH`의 `receipt.json`, `browser-receipt.json`, `browser-1.png`, `browser-2.png`, `camera-preview.png`와 `/private/tmp/jarihana-realtime-pr-{frontend-tests,frontend-lint,frontend-build,protocol}.log`에 보관했다. 전체 backend 테스트, 실제 Actions·EC2 배포/롤백, 현재 CloudFront 설정, 운영 WSS·Grafana 수집·외부 네트워크·부하는 이번 재검증에 포함하지 않았다.

## 구현 범위

- `backend/`: 로그인·방문 정책에 따른 단기 입장 토큰과 기존 아지트 배치 저장.
- `realtime/`: 독립 Java 21 Spring 앱. 검증한 토큰 발급자에 따라 개발·운영 PostgreSQL에서 읽기 전용으로 권한과 배치를 확인한다. 방별 순차 처리, 이동 검증, 원격 참여자 상태, 늦은 입장·재접속, 좌석·물건·제작·가구 상태와 배치 변경 정리를 담당한다.
- `frontend/`: 실제 모임 상세의 놀러가기 연결, 원격 캐릭터·보간·공유 상호작용, 촬영 미리보기와 기존 활동 작성 화면 첨부.
- `contracts/realtime/`: 메시지와 기능 정의, 기존 프론트 카탈로그·배치에서 생성한 서버 판정 데이터. 별도 수작업 좌표 목록을 유지하지 않는다.
- `infra/realtime/`: HTTP 8080의 realtime Compose, 실제 WebSocket·격리 브라우저 검증 스크립트.

기존 통합 체크아웃의 미커밋 화면·하늘·HUD 변경 위에 작업했다. 시작 시점의 tracked 변경은 `/private/tmp/jarihana-m1m2-baseline-20261112.patch`에 보존했다. 이 문서의 구현 범위와 기존 변경을 혼동하지 않는다.

## 가구 변경 정책

| 변경 | 새 배치 적용 시 처리 |
| --- | --- |
| 다른 모임의 아지트로 이동 | 이전 연결의 좌석·손 물건·제작을 즉시 정리하고 새 방 스냅샷으로 입장 |
| 같은 모임의 테마·배치 변경 | 현재 참여자와 손 물건을 보존하고 유효하지 않은 위치를 보정 |
| 착석 중인 의자·소파 이동/삭제/종류 변경 | 점유 해제 후 안전한 위치에 서기 |
| 물건이 올라간 가구 이동 | 같은 종류·표면 슬롯이면 같은 물건을 새 앵커로 이동 |
| 물건이 올라간 가구 삭제/종류 변경 | 물건 ID를 유지하고 안전한 바닥으로 내려놓기 |
| 물건을 꺼낸 원본 가구 삭제 | 이미 손에 든 물건은 유지 |
| 제작 중인 기계 이동/삭제 | 제작 취소, 컵 보존, 이전 완료 시각이 지나도 결과를 다시 생성하지 않음 |

저장 전 꾸미기 초안은 개인 상태다. DB에 저장된 revision을 realtime이 기본 10초 주기로 조회한다. 참여자에게 적용되는 시점은 realtime의 다음 조회와 브라우저의 배치 갱신에 따라 달라진다. 새 revision 적용 후 이전 revision 명령은 거절한다. 비정상 연결 종료만 기본 5초 동안 상태를 보존하고, 의도한 퇴장은 `1000 / LEAVE`로 즉시 처리한다.

## 확인한 결과

### 한 컨테이너의 개발·운영 격리

`feat/realtime-environment-isolation`에서 Spring WebSocket 서버 하나와 임시 PostgreSQL 17의 개발·운영 DB 두 개로 프로토콜 16개 시나리오를 검증했다.

- 같은 모임 ID, 회원 ID, 토큰 ID를 각 환경에서 사용했다. 두 연결은 각 DB의 회원 이름과 배치 버전을 받았고 방 세대도 달랐다. 같은 환경에서 이미 사용한 토큰 ID로 다시 접속하면 거절됐다.
- 한 환경의 키로 다른 환경의 발급자를 적어 서명한 토큰은 양방향으로 거절됐다.
- 양쪽에서 같은 좌석을 동시에 사용할 수 있었다. 좌석 좌표, 다른 참여자, 배치 갱신, 회원 탈퇴에 따른 접속 종료도 각 환경의 데이터와 방을 따랐다.
- 각 DB에서 차례로 `member.crew_name` 조회 권한을 제거하고 복원했을 때 헬스체크가 `200 → 503 → 200`을 반환했다.

로컬 증거는 `/var/folders/tk/9q13yffx48l_7mbszf148sv00000gn/T/jarihana-realtime-protocol-83jsbi/receipt.json`에 있다. Compose 설정 검사와 배포 워크플로 YAML 및 Bash 구문 검사도 통과했다.

### PostgreSQL 직접 조회 전환

임시 PostgreSQL 17에 기존 기반 스키마와 아지트 마이그레이션을 적용하고, 네 테이블의 필요 컬럼에만 `SELECT` 권한이 있는 사용자로 실제 Spring WebSocket 서버를 연결했다. 입장과 방 격리, 가구 위치 변경 감지, 계정 탈퇴 시 연결 종료를 포함한 프로토콜 12개 시나리오가 통과했다. `member.crew_name` 조회 권한을 제거했을 때 헬스체크가 `503 DOWN`을 반환했고 권한을 복원한 뒤 `200`을 반환했다.

로컬 증거는 `/var/folders/tk/9q13yffx48l_7mbszf148sv00000gn/T/jarihana-realtime-protocol-QpoO8U/receipt.json`에 있다. 아래 브라우저 검증은 이전 HTTP 조회 방식의 실행 기록이다.

### 기존 M1·M2 통합 검증

환경: macOS, Node 24.19.0, JDK 21, Docker Desktop, 별도 Playwright Chromium. 개인 Chrome은 사용하지 않았다.

| 검증 | 결과 |
| --- | --- |
| realtime `test bootJar` | 58개 통과. 인증, 배치·층·충돌, 소유·점유·제작, 세대·종료 경쟁, 제한 큐·송신 포함 |
| backend 최종 변경 관련 테스트 | 입장 토큰·admission·비활성화 경로 12개 통과. 이전 전체 대상 실행 결과와 중복 합산하지 않음 |
| frontend 변경 관련 Jest | 7개 suite 84개 통과. 최종 퇴장·종료 사유 변경 후 연결/store 2개 suite 11개 재검증 통과 |
| frontend lint / production build | 통과. 기존 webpack asset/entry 크기 경고 2건 |
| 기존 Playwright 화면 흐름 | 데스크톱 이동·채팅·패널·꾸미기와 모바일 방문 흐름 각각 통과 |
| 카탈로그 생성물 `--check` | 프론트 원본과 일치 |
| Docker 이미지 빌드·기동 | readonly, UID 999, 768 MiB, cap-drop 환경에서 health `UP` |
| Compose / HTTP 8080 | 로컬 컨테이너에서 `/actuator/health`의 `UP`과 `/ws/realtime`의 WebSocket 업그레이드 확인. 기존 로컬 이미지에 최신 JAR을 마운트해 검증 |
| 배포 워크플로 | 문법 검사와 HTTP 8080 헬스체크 실패 시 직전 성공 버전으로 복구하는 모의 테스트 통과 |

컨테이너 확인 이미지: `sha256:8673ce8b73536f6c4e1c81d924cf91419e50bd62cbc675eb387362cd8a655f27`.

이전 `verify-protocol.mjs`는 실제 Spring WebSocket과 내부 API 응답 fixture로 입장·방 격리, 좌석 경쟁·늦은 입장, 가구 이동과 오래된 요청, 물건 소유·중복 요청, 원본 삭제·던지기, 제작 취소, 표면 이동·삭제, 연결 교체, 권한 회수, 명시적 퇴장을 검증했다. `--browser`는 production bundle과 별도 브라우저 세션 두 개로 같은 연결을 사용했다.

최종 통합 실행은 프로토콜 10개와 브라우저 4개, 총 14개 시나리오가 통과했다. 두 브라우저의 입장·인사·이동과 카메라 꺼내기 → 촬영 미리보기 → 활동 작성 화면 첨부를 확인했다. 브라우저 page error는 0건이며 Chromium 버전은 `151.0.7922.34`다. 미리보기 이미지와 양쪽 원격 캐릭터 스크린샷도 확인했다.

로컬 증거:

- `/var/folders/tk/9q13yffx48l_7mbszf148sv00000gn/T/jarihana-realtime-protocol-yfmb5m/receipt.json`
- 같은 디렉터리의 `browser-receipt.json`, `server.log`, `camera-preview.png`, `browser-1.png`, `browser-2.png`
- `/private/tmp/jarihana-realtime-container-smoke.json`, `/private/tmp/jarihana-realtime-final-docker-build.log`
- `/private/tmp/jarihana-frontend-final-tests.log`, `/private/tmp/jarihana-frontend-lint.log`, `/private/tmp/jarihana-frontend-final-leave-build.log`

브라우저 검증 과정에서 fixture의 잘못된 가구 배치를 고쳤고, 격리 브라우저의 포커스·낮은 software WebGL 프레임 속도에 맞게 입력과 대기를 조정했다. 마지막 실행은 위 14개 시나리오를 한 번에 통과했다. 테스트용 Java·브라우저·HTTP 서버와 Docker smoke 컨테이너는 종료했다.

## 운영 전 남은 확인

- 신규 EC2의 기존 PostgreSQL 접속·조회 권한과 운영 WSS 경로는 배포 환경에서 확인해야 한다. 설정 주석(2026-11-13): realtime 앱의 로컬 `REALTIME_ENABLED` 기본값은 false지만 배포 Compose는 true다. 기존 API의 입장권 발급에는 별도 활성화 플래그를 사용하지 않는다. [인프라 ADR 0008](../docs/adr/0008-shared-realtime-deployment.md)
- 실제 계정, 서로 다른 기기·네트워크, 모든 프리셋의 수동 조작과 동시 방 부하·수용 정원 측정은 별도 확인이 필요하다.
- 일시 상태는 단일 realtime 프로세스 메모리에 있다. 빈 방 정리·프로세스 재시작 시 초기화된다. 저장 가구 배치·게시물·음악 데이터는 기존 API·DB에 남는다.
- 원본 저장 배치가 version 11보다 오래되면 모임장이 현재 편집기로 한 번 저장해야 공유 연결이 가능하다.
- 촬영 검증은 미리보기와 작성 화면 첨부까지다. 게시 버튼을 누르거나 외부 계정으로 사진을 업로드하지 않았다.
- M3 LiveKit 화면 공유, 다중 replica·Redis 복구는 이번 구현 범위에 포함하지 않는다.

실행 명령은 [실행 구성](README.md), 메시지와 배치 규칙은 [v1 계약](../../contracts/realtime/v1/README.md)을 따른다.
