# Worker child 연결 준비

상태 변경 전용 `backend-bluegreen-worker-child.yml`과 `worker-child.py`의 A/B 서버 시험 설정이다.
코드·workflow·설정 경계를 로컬에서 검증하고, A/B 설정과 Nginx의 별도 읽기 계정을 시험 서버에 설치했다.
각 전용 runner 계정으로 컨테이너 격리 설정·현재 관리 상태·Nginx 사설 허가 조회를 확인했다.
A와 B 각각 `BEGIN → COMPLETE`의 실제 부모·자식 실행과 결과 회수를 검증했다.
시험 후 `allowed_actions`는 다시 빈 목록으로 닫았다. A/B 자동 인계는 아직 검증하지 않았다.
기존 STATUS 설정·태그·읽기 계정·저널은 그대로 사용하며 worker 실행 권한으로 확대하지 않는다.

## 실행 순서

```text
고정 worker 태그의 workflow_dispatch / A 또는 B 전용 runner
  -> root 소유 설정 + 허용 동작 + 정확한 boot/ref/SHA 확인
  -> IMDSv2로 실제 B EC2 확인
  -> 고정 컨테이너의 DB·푸시 차단·이미지·시작 시각·재시작 횟수 확인
  -> 별도 SSH 계정으로 worker 저널의 최신 허가 조회
  -> 명령 직전 컨테이너·GitHub 실행·허가 재확인
  -> 관리 API POST 한 번 -> 후속 상태·허가·컨테이너 재확인
  -> 성공한 명령의 child-result.json 업로드
```

feature 브랜치의 workflow 파일을 push하면 hosted runner에서 등록 작업만 수행한다.
실제 worker job은 `refs/tags/bluegreen-worker-rehearsal-…`, `workflow_dispatch`, 첫 attempt, A/B slot만 받는다.
slot A는 `jarihana-bluegreen-rehearsal-a`, B는 `jarihana-bluegreen-rehearsal-b` 전용 runner를 선택한다.
두 슬롯의 실행 잠금은 분리하며 B의 기존 잠금 이름을 유지한다.
job은 최대 5분 실행하고 `contents: read`, `actions: read`만 사용한다.
명령은 셸 문자열로 삽입하지 않고 환경변수의 JSON으로 전달한다. 실패하면 결과 업로드를 성공으로 처리하지 않는다.

## 관리자 설정

`/etc/jarihana-deploy/worker-child.json`은 root 소유이고 runner가 수정할 수 없어야 한다.
설정 스키마는 `WorkerSettings`이며, 파일과 비밀 파일의 읽기 권한은 `root:jarihana-runner 0640`, 상위 디렉터리는 0750을 기준으로 한다.
설정 예시에 미확정 SHA·부팅 ID를 넣어 설치 가능한 값처럼 보이게 하지 않는다.

| 필드 | 확정 방법과 제한 |
| --- | --- |
| `repository` | 저장소 이름 `woowacourse-teams/2026-jarihana`, ID `1321030074` |
| `topology` | `dev-rehearsal`, coordinator `i-01449d708ceef309b`, A=기존 dev, B=`i-0430ff91d1af2fb37` |
| `topology.control` | 이번 worker workflow 코드가 포함된 새 고정 태그와 실제 SHA. STATUS 태그 재사용·이동 금지 |
| `local_slot` | A/B 중 해당 머신만 지정. 기존 B 설정과의 호환을 위해 생략 시 B. A는 반드시 A로 명시 |
| `coordinator_address` | 사설 주소 `10.0.3.51`; 실제 접근성과 host key 재확인 |
| `journal_key` | `/etc/jarihana-deploy/worker-grant-key`; B에서 생성하고 private key를 출력·반출하지 않음 |
| `known_hosts` | `/etc/jarihana-deploy/worker-known-hosts`; 신뢰된 관리 연결로 확인한 Nginx host key |
| `worker_token_file` | `/etc/jarihana-deploy/worker-control-token`; 앱에 주입된 머신 토큰과 일치. 값 출력 금지 |
| `management_port` | A=8081, B=18081로 제한. 해당 loopback 관리 포트와 앱 세대를 실제 확인 |
| `expected_boot` | 새 설정 설치 직전 관리 GET으로 확인한 B 앱의 실제 부팅 UUID |
| `expected_image` | 실제 Docker image ID와 앱 `APP_VERSION`이 같은 값 |
| `container` | 전체 container ID·image ID·StartedAt·RestartCount를 실제 inspect로 고정 |
| `allowed_actions` | 기본 빈 목록으로 실행 차단. 시험에 필요한 worker 동작만 관리자가 명시 |

Docker 환경 값은 파싱 과정에서 비밀 문자열로 보관하며 오류에 원문을 노출하지 않는다.
명령 직전에는 다음 값이 모두 일치해야 한다.

- `DB_URL=jdbc:postgresql://jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com:5432/jarihana_dev?sslmode=require`
- `PUSH_ENABLED=false`, `PUSH_WORKER_ENABLED=false`, `PUSH_WORKER_CONTROL_ENABLED=true`
- `PUSH_WORKER_ENVIRONMENT=dev-rehearsal`, `PUSH_WORKER_HOST_ID=topology.host(local_slot).host_id`
- `APP_VERSION=expected_image`, 관리자 설정과 같은 실제 컨테이너 세대, 실행 중 상태

운영·temporal RDS나 실제 푸시 설정을 허용하는 일반 배포 CLI가 아니다.
현재 DB와 푸시 차단 값은 사용자가 선택한 dev 시험 범위를 코드로 제한한 것이다.

## 별도 실행 허가 읽기

Nginx에 아래 별도 경로를 설치했다. 초기 저널에는 실행 중인 명령이 없으며 실행 허가를 부여하지 않는다.

| 항목 | 값 |
| --- | --- |
| SSH 읽기 사용자 | `jarihana-worker-grant` |
| 고정 helper | `/usr/local/libexec/jarihana-read-worker-grant`, root:root 0755 |
| sudoers | 이 디렉터리의 `read-worker-grant.sudoers`, root:root 0440 |
| worker 저널 | `/var/lib/jarihana-deploy/worker-rehearsal/state.json` |
| 저널 소유·권한 | coordinator 소유 0600, 전용 상위 디렉터리 0700 |

`authorized_keys`는 root 소유로 유지하고 A=`10.0.3.232`, B=`10.0.3.184` 각각의 키에 출발지를 제한한다.
한 키의 출발지 제한을 넓히지 않고 머신별 공개키 항목을 추가한다.
`restrict`와 다음 고정 명령만 허용한다.

```text
sudo -n -u jarihana-coordinator /usr/local/libexec/jarihana-read-worker-grant
```

읽기 사용자에게 Docker·일반 sudo·저널 쓰기 권한을 주지 않는다. helper는 인자를 받지 않고 고정 worker 저널만 읽는다.
runner는 root 설정의 별도 키·known_hosts로 매번 새 SSH 연결을 연다. 설정·계정·허가 파일이 없으면 실행은 실패한다.

## 다음 실제 검증

`backend-bluegreen-worker-coordinator.yml`과 `worker-coordinator.py`는 Nginx에서 실행하는
별도 worker 부모 경로다. 기존 `scenario=smoke`는 원격 설정 설치와 실제 Actions 실행을 확인했다.
기본 smoke 시험은 선택한 앱을 `PAUSED`로 유지하면서 `BEGIN → COMPLETE` 두 명령의 왕복만 확인한다.
smoke는 worker 활성화·발송·A/B 인계·HTTP 전환·EC2 종료를 수행하지 않는다.
추가한 `round-trip` 모드는 아래 전체 시험 절의 관리자 허용이 필요하며 아직 실제 Actions에서 실행하지 않았다.

```text
Nginx 부모의 실제 GitHub 실행·IMDS 신원 확인
  -> root 설정에 고정한 B의 이전 상태로 저널 생성
  -> 명령과 일회성 발행 기록을 디스크에 저장
  -> 고정 태그의 B child를 한 번 요청
  -> 정확한 child run을 저널에 연결
  -> artifact의 명령·실행·권한 변경 결과 검증
  -> 성공한 명령만 닫고 다음 명령으로 진행
```

발행 응답이 유실되면 같은 명령의 실행을 검색한다. 발행 기록이 있는 상태로 부모가 재시작해도
다시 POST하지 않는다. 실행을 찾지 못하거나 결과가 불명확하면 명령·실행 정보를 보존하고
`NEEDS_ATTENTION`으로 멈춘다. `dispatch-<command UUID>.json`은 자동 삭제하거나 재시도를 위해 지우지 않는다.
외부에서 철회한 저널도 부모가 덮어쓰지 않는다.

실행 전 Nginx의 root 소유 `/etc/jarihana-deploy/worker-coordinator.json`을 설치해야 한다.
`WorkerParentSettings`의 `repository`, `topology`, `before`, `state_directory`, `parent_ref`를 사용한다.
`target_slot`은 관리자 설정에서 A/B 중 하나로 고정하며, 생략 시 기존 B 동작을 유지한다.
`before`의 host·instance가 그 슬롯과 다르면 실행을 거부한다. GitHub 입력으로 임의 대상을 선택하지 않는다.
`before`는 설치 직전 선택한 슬롯의 관리 GET으로 읽은 `AppStatus` 전체 값이며,
정상·대기·작업 종료·권한 미할당·DB 단계 IDLE 또는 COMPLETE여야 한다. 오래된 값을 자동으로 보정하지 않는다.
저널 경로는 기존 worker 전용 디렉터리, 부모 ref는 기능 브랜치로 고정한다.
B의 허용 목록도 이 시험에 필요한 `begin`, `phase_complete`만 별도로 열어야 한다.
설정 파일은 root 소유로 coordinator 그룹에 읽기만 허용하고, 기존 STATUS 설정을 변경하지 않는다.

실제 검증 부모는 [40046513294](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/40046513294)다.
Nginx runner 30에서 B runner 29의 BEGIN 실행 40046539183, COMPLETE 실행 40046588177을 요청했다.
세 실행 모두 성공했고 두 child receipt가 부모 결과와 일치했다.
업로드한 `state.json`과 Nginx 영속 저널의 SHA256은
`42788d46e93903d16fd931d51b3e0deae859af21aa28e30d856ef4aed982abb6`으로 같았다.
B는 같은 부팅 ID로 정상·PAUSED·진행 중 작업 0을 유지했다.
DB 제어 행은 시험 배포 `15bd5a06-cd40-4333-8f1d-a463a7eb1398`, epoch 1/revision 2,
`COMPLETE/UNASSIGNED`로 남겼다. 시험을 마친 뒤 B의 명령 허용 목록은 다시 닫았다.
기존 부모 root 설정의 `before`는 시험 전 IDLE 상태이므로 다음 시험에 그대로 재사용하지 않는다.

정상 시험 후 DB의 `dev-rehearsal` 제어 행에는 시험 배포 ID와 `COMPLETE/UNASSIGNED`가 남는다.
이는 초기 `IDLE`로 DB를 되돌렸다는 뜻이 아니다. 푸시·업무 데이터·스키마를 변경하는 시험은 아니며,
실패하면 DB와 영속 저널의 실제 상태를 먼저 대조한다. 자동 DB 삭제·임의 롤백·명령 재전송은 하지 않는다.
이후 전체 A/B 시험에는 각 서버의 실제 상태를 새로 확인해야 한다.

설치한 코드의 고정 태그는 `bluegreen-worker-rehearsal-20261024-01`,
SHA는 `e2f784f428036d71ac8a6d04122324ff898fc7dd`다.
부모 코드의 검증 커밋은 `23a660f1bdab6dbda06d04303ae5a595698ae422`다.
현재 STATUS 부모는 worker 명령을 요청하지 않는다.

A 후속 시험 부모 [40066410302](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/40066410302)는
Nginx runner 30에서 A runner 31의 BEGIN 40066426744, COMPLETE 40066471282를 요청했다.
부모 SHA는 `425b1ab62eafc6dc3958ac9234055cd036bafb26`, 두 child는 새 고정 태그
`bluegreen-worker-rehearsal-20261024-02`의 `ff6a3ea77d205a768ff966fcef9ea6bcba78f346`으로 성공했다.
child receipt와 부모 결과가 일치했고, 업로드한 저널과 Nginx 실제 파일의 SHA256은
`218f2353bdedaf5e1739da54dc5d20576b0c64cc9f479805a54aadb40fc3f545`으로 같았다.
A는 같은 부팅 ID로 정상·대기·작업 0을 유지했고, 최종 DB 제어 행은
`50976c03-a0b1-4f30-a689-921c70be046c`, epoch 2/revision 4, `COMPLETE/UNASSIGNED`다.
A의 명령 허용 목록도 시험 후 닫았다. 현재 부모 설정의 `before`는 시험 전 상태이므로 재사용하지 않는다.
시험 앱을 정상 종료한 뒤 기존 dev 컨테이너·이미지·`unless-stopped` 정책·temporal DB 연결·
푸시 설정과 일반 dev runner를 복구했다. readiness `UP`과 용도를 모르는 PostgreSQL 컨테이너 유지도 확인했다.

다음은 실제 푸시가 차단된 A/B가 같은 DB에서 권한을 주고받는 과정을 검증하는 것이다.
dev 사용 여부를 매번 확인하고 시험 직전 원래 앱·DB·재시작 정책을 기록한 뒤 종료 후 복구해야 한다.
기존 dev가 자동으로 시험 DB로 바뀌거나 이번 workflow push로 앱이 재시작되는 구조는 아니다.

## dev A 시험 앱 교체와 복구

`infra/tests/deploy/run_cloud_prepare_a.py`와 `run_cloud_restore_a.py`는 확인한
dev A 인스턴스와 컨테이너에만 사용하는 실습 도구다. 운영 서버용 설치 도구가 아니다.
원래 컨테이너 ID·이미지·재시작 정책이 다르면 중단하며, 현재 서버를 다시 확인한 뒤
사용해야 한다. 복구 도구와 의존성을 먼저 준비한 다음 실행한다.

준비 도구는 원래 dev runner를 잠시 멈추고 원래 앱을 정상 종료한 뒤,
같은 인증 정보를 프로세스 환경으로 전달하여 main RDS의 `jarihana_dev`에 시험 앱을 실행한다.
여러 줄 값을 보존하도록 Docker의 `--env KEY` 상속을 사용하며, 값을 명령 인자나 로그로 출력하지 않는다.
실제 푸시와 스케줄러는 비활성화한다. 원래 컨테이너를 보존하며 root 전용 복구 기록을
먼저 디스크에 저장한다. 다른 PostgreSQL 컨테이너에는 손대지 않는다.

시험 성공 여부와 관계없이 복구 도구로 시험 앱을 정상 종료하고 원래 dev 앱과
runner를 되살린다. 시험 앱 종료가 지연되면 강제 종료하지 않고 중단한다.
시험의 worker 허용 동작은 복구 전에 빈 목록으로 닫으며, 복구 기록은 남긴다.

## 인계 전 최신 상태 조회 연결

한 서버에서 공유 DB의 권한을 변경하면 다른 서버에 기록해 둔 상태는 오래된 값이 된다.
다음 서버를 활성화하기 전에 실제 작업 수와 DB 권한을 다시 읽어야 한다.
`WorkerCoordinator`와 worker child는 이를 위한 `STATUS` 요청·결과 회수를 지원한다.
worker용 root 설정의 `allowed_actions`에 `status`를 명시한 서버만 조회할 수 있다.
기존 STATUS 전용 workflow와 그 관리자 설정은 변경하지 않는다.

```text
A의 권한 반납 결과 확인 -> B에 STATUS 요청
  -> B의 고정 컨테이너·부팅 ID와 실제 관리 상태 조회
  -> 부모가 알고 있는 DB 권한과 일치하는지 확인
  -> B의 상태 기록 갱신 -> 후속 활성화 조건 판단
```

조회는 관리 API의 GET만 사용하고 worker 상태나 DB 권한을 바꾸지 않는다.
조회 전후 컨테이너 격리 설정을 검사하며, 앱 재시작·실행 허가 철회·예상하지 못한
DB 권한 변경이 확인되면 성공 결과를 채택하지 않는다. 불명확한 실행과 명령은
저널에 보존한다. 작업이 남아 있는 상태를 조회하는 것은 가능하지만, 그 상태에서
활성화 명령은 차단한다.

이 경로는 로컬 HTTP·저널·artifact 경계에서 검증했다. 기존 고정 태그에는 이 추가 코드가
포함되지 않으며, 원격 적용 전 새 고정 태그와 관리자 허용 목록을 별도로 준비해야 한다.
부모 CLI는 기본 `smoke`와 명시적으로 허용한 `round-trip`을 구분한다.

## Worker 양방향 인계 실습 로직

`bluegreen/worker_handoff.py`의 `WorkerHandoff`는 이미 정상적으로 처리 권한을 가진
서버에서 대기 서버로 권한을 넘기는 격리 시험용 순서 제어다. `prod` 환경에서는
사용할 수 없다. 호출 전에 부모 실행 정보와 A/B의 정확한 앱 상태를 저널에 준비해야 한다.

```text
A/B 최신 STATUS -> A가 실제 소유자이고 B가 정상 대기 상태인지 확인
  -> BEGIN -> HANDOFF -> A PAUSE
  -> A STATUS로 실행 중 작업과 DB 완료 확인 작업이 모두 0인지 기다림
  -> A RELEASE -> B 최신 STATUS -> B ACTIVATE
  -> A 최신 STATUS -> 양쪽이 같은 B 소유권을 확인
  -> OBSERVE·COMPLETE -> A 최신 STATUS -> 완료 저널 보존
```

이후 새 배포 저널에서 A/B 역할을 바꾸면 B → A를 검증할 수 있다. 양쪽 앱은 계속
실행하며 HTTP 트래픽과 EC2 상태를 변경하지 않는다. 작업 종료 대기 상한은 기존
초안 정책의 120초이며, 각 상태 조회에도 남은 대기 시간을 적용한다.
작업 실행 수가 0이어도 `unresolved`가 남으면 권한을 반납하지 않는다.

대기 상한 초과·후보 이상·결과 유실 시 `NEEDS_ATTENTION`과 확인된 저널을 보존한다.
응답을 잃은 활성화 명령을 재전송하거나, 추측으로 반대 서버를 활성화하지 않는다.
서버 종료·DB 직접 수정·자동 복구는 수행하지 않으며 운영자의 기존 철회 기록도 보존한다.

로컬의 실제 Spring 두 개·PostgreSQL·Nginx에서 양방향 인계와 지속 HTTP 요청을 검증했다.
재현 명령은 `infra/tests/deploy/run_local_worker_handoff_e2e.py`의 실행 안내를 따른다.
이 실습의 `OBSERVE`는 worker 제어 단계 변경이며 **900초 운영 관찰 검증이 아니다**.
GitHub 실제 실행·원격 A/B 인계·HTTP 전환·자동 롤백 검증도 별도로 남아 있다.

## 시험 시작과 종료 정리

`bluegreen/worker_trial.py`의 `WorkerTrial`은 동일한 명령·결과 회수 경로로 초기 권한을
준비하거나 시험을 정리한다. 두 프로세스의 정확한 상태를 새 저널에 기록한 뒤 호출한다.
`WorkerHandoff`와 같은 격리 환경 제한을 적용하며, 전체 시험 부모의 `round-trip` 모드에 연결했다.

```text
BOOTSTRAP: 양쪽 최신 STATUS·대기·권한 미할당 확인
  -> BEGIN -> HANDOFF -> A ACTIVATE -> OBSERVE -> COMPLETE -> B STATUS

A → B → A 인계 시험

CLEANUP: 양쪽 최신 STATUS·A 소유권·B 대기 확인
  -> BEGIN -> HANDOFF -> A PAUSE -> drain 대기 -> A RELEASE
  -> B STATUS -> B에서 COMPLETE -> A STATUS
  -> 양쪽 PAUSED·같은 COMPLETE/UNASSIGNED 권한 확인
```

Spring은 owner가 없고 로컬 작업이 모두 끝난 경우에만 `HANDOFF → COMPLETE` 시험 정리를
허용한다. ACTIVE·DRAINING owner나 미확정 작업을 완료 처리로 숨기지 않는다.
DB를 직접 수정하거나 권한 행을 삭제하지 않으며, 이력을 보존한 채 다음 `begin`을 받을 수 있다.
기존 owner가 남으면 BOOTSTRAP을 거부한다. 초기 활성화의 응답이 유실되거나 종료 대기가
실패하면 그 명령과 실행을 보존하고 자동 정리·재전송·다른 서버 활성화를 하지 않는다.
이 절차는 legacy worker가 실제로 멈췄는지 대신 확인해 주지 않는다.

로컬의 새 JAR로 초기 권한 준비·왕복 인계·종료 정리를 모두 실행해 검증했다.
실제 EC2에서 실행하려면 새 종료 계약을 포함한 **A/B 앱 이미지**, 새 worker 제어 태그,
양쪽 root 설정과 부모 CLI 연결이 필요하다. 기존 고정 이미지·태그를 그대로 사용하지 않는다.
권한 정리가 확인되어도 HTTP·백그라운드 활동 확인과 원래 dev 복구는 별도로 수행한다.

## 부모의 전체 A/B 시험 모드

새 앱은 `backend-bluegreen-image.yml`을 기능 브랜치에서 수동 실행해 먼저 빌드한다.
이 workflow는 GitHub ARM64 runner에서 백엔드 테스트·이미지 업로드·JVM 기동 검사만 수행한다.
push에서는 등록 작업만 실행하며 EC2, RDS, 앱 컨테이너 설정은 변경하지 않는다.
실행 artifact `worker-trial-image-<run ID>`에 소스 commit, 레지스트리 manifest digest,
Docker image ID를 별도로 기록한다. 성공 후 두 서버에서 실제로 pull한 이미지와 대조하고
새 worker 고정 태그 및 root 설정을 준비한 뒤 전체 시험을 시작한다.
JVM 기동 검사는 Spring readiness나 DB 연결 검증을 대신하지 않는다.

GitHub Actions 입력 `scenario=round-trip`과 root 설정의 `round_trip`이 **둘 다** 있어야 실행한다.
기본 `smoke` 설정으로 전체 시험을 요청하거나, 전체 시험 관리자 설정에서 smoke를 요청하면 거부한다.
feature 브랜치의 첫 `workflow_dispatch`만 허용하며 push는 기존처럼 등록 작업만 실행한다.
main 배포 workflow는 변경하지 않는다.

| 관리자 설정 | 조건 |
| --- | --- |
| `target_slot`, `before` | A 및 설치 직전 A의 전체 AppStatus |
| `round_trip.a` | `before`와 같은 AppStatus |
| `round_trip.b` | 실제 B의 AppStatus. A와 다른 boot, 정상·실행 중·대기·작업 종료 상태 |
| 양쪽 권한·이미지 | 같은 최신 미할당 권한과 같은 새 앱 이미지. 이전 상태를 자동 보정하지 않음 |
| `round_trip.completion_contract` | `released-handoff-v1` 명시. 관리자가 새 앱의 종료 계약을 확인했다는 표시이며 자동 지원 탐지가 아님 |
| `round_trip.total_seconds` | 시험 한도 초안. 300~2700초, 기본2700초. 실제 dev 실측 후 조정 |

앱별 컨테이너 세대·boot·이미지·실푸시 차단은 각 서버의 worker child root 설정과 프로필 검사로
계속 확인한다. 부모 설정만으로 child의 빈 명령 허용 목록이 열리지 않는다.
이 시험은 같은 새 이미지로 제어 기능을 검증한다. 신구 버전 혼재·DB 호환성 검증을 대신하지 않는다.

```text
입력·root 허용 일치 -> 실제 부모 run/ref/SHA/attempt 및 Nginx IMDS 확인
  -> 한 부모의 일회성 시험 시작 기록
  -> BOOTSTRAP -> A-to-B -> B-to-A -> CLEANUP
  -> 각 단계 완료 상태를 저장한 뒤에만 다음 저널 생성
```

부모가 계속 실행 중인지와 전체 시간 한도를 명령 발행·조회·결과 회수 전후에 확인한다.
명령의 원래 기한이 전체 한도 안에 들어오지 않으면 새로 발행하지 않는다. 벽시계가 뒤로 움직여도
monotonic 한도는 늘어나지 않는다. workflow 상한은 준비 시간을 포함한55분이다.

완료된 단계는 각각 `bootstrap.json`, `A-to-B.json`, `B-to-A.json`, `cleanup.json`으로 보존한다.
실패하면 가능한 경우 `interrupted.json`도 남기고, 마지막 Nginx 저널과 pending/run을 유지한다.
이미 발행된 명령은 부모 취소 직전에 적용됐을 수도 있으므로 추측으로 되돌리거나 재전송하지 않는다.
다음 단계·자동 cleanup은 시작하지 않는다. 같은 부모의 재시작은 `round-trip-<run>-<attempt>.json`
기록으로 차단하며, 이를 자동 삭제하지 않는다. 새 부모를 실행할 때도 실제 상태와 root 핀을 다시 확인한다.

새 전체 부모 순서는 로컬의 실제 Spring 두 개와 PostgreSQL에서 검증했다. 실제 GitHub 왕복 인계와
새 root 설정 설치는 아직 하지 않았다. 운영 HTTP 전환·900초 관찰·자동 롤백·EC2 시작/중지는 별도다.
