# Worker child 연결 준비

상태 변경 전용 `backend-bluegreen-worker-child.yml`과 `worker-child.py`의 B 서버 시험 설정이다.
코드·workflow·설정 경계를 로컬에서 검증하고, B 설정과 Nginx의 별도 읽기 계정을 시험 서버에 설치했다.
실제 B runner 계정으로 컨테이너 격리 설정·현재 관리 상태·Nginx 사설 허가 조회를 확인했다.
설치한 `allowed_actions`는 빈 목록이다. 정상 worker 상태 변경과 A/B 자동 인계는 아직 검증하지 않았다.
기존 STATUS 설정·태그·읽기 계정·저널은 그대로 사용하며 worker 실행 권한으로 확대하지 않는다.

## 실행 순서

```text
고정 worker 태그의 workflow_dispatch / B 전용 runner
  -> root 소유 설정 + 허용 동작 + 정확한 boot/ref/SHA 확인
  -> IMDSv2로 실제 B EC2 확인
  -> 고정 컨테이너의 DB·푸시 차단·이미지·시작 시각·재시작 횟수 확인
  -> 별도 SSH 계정으로 worker 저널의 최신 허가 조회
  -> 명령 직전 컨테이너·GitHub 실행·허가 재확인
  -> 관리 API POST 한 번 -> 후속 상태·허가·컨테이너 재확인
  -> 성공한 명령의 child-result.json 업로드
```

feature 브랜치의 workflow 파일을 push하면 hosted runner에서 등록 작업만 수행한다.
실제 worker job은 `refs/tags/bluegreen-worker-rehearsal-…`, `workflow_dispatch`, 첫 attempt, B slot만 받는다.
job은 `jarihana-bluegreen-rehearsal-b` runner에서 최대 5분 실행하고 `contents: read`, `actions: read`만 사용한다.
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
| `local_slot` | 현재 구현은 B만 지원. A는 별도 runner·설정 준비 후 연결 |
| `coordinator_address` | 사설 주소 `10.0.3.51`; 실제 접근성과 host key 재확인 |
| `journal_key` | `/etc/jarihana-deploy/worker-grant-key`; B에서 생성하고 private key를 출력·반출하지 않음 |
| `known_hosts` | `/etc/jarihana-deploy/worker-known-hosts`; 신뢰된 관리 연결로 확인한 Nginx host key |
| `worker_token_file` | `/etc/jarihana-deploy/worker-control-token`; 앱에 주입된 머신 토큰과 일치. 값 출력 금지 |
| `management_port` | 실제 B의 loopback 관리 포트 확인. 기존 시험은 18081 |
| `expected_boot` | 새 설정 설치 직전 관리 GET으로 확인한 B 앱의 실제 부팅 UUID |
| `expected_image` | 실제 Docker image ID와 앱 `APP_VERSION`이 같은 값 |
| `container` | 전체 container ID·image ID·StartedAt·RestartCount를 실제 inspect로 고정 |
| `allowed_actions` | 기본 빈 목록으로 실행 차단. 시험에 필요한 worker 동작만 관리자가 명시 |

Docker 환경 값은 파싱 과정에서 비밀 문자열로 보관하며 오류에 원문을 노출하지 않는다.
명령 직전에는 다음 값이 모두 일치해야 한다.

- `DB_URL=jdbc:postgresql://jarihana-db.cqsc6pyqhwww.ap-northeast-2.rds.amazonaws.com:5432/jarihana_dev?sslmode=require`
- `PUSH_ENABLED=false`, `PUSH_WORKER_ENABLED=false`, `PUSH_WORKER_CONTROL_ENABLED=true`
- `PUSH_WORKER_ENVIRONMENT=dev-rehearsal`, `PUSH_WORKER_HOST_ID=topology.b.host_id`
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

`authorized_keys`는 root 소유로 유지하고 B 사설 IP `10.0.3.184`로 출발지를 제한한다.
`restrict`와 다음 고정 명령만 허용한다.

```text
sudo -n -u jarihana-coordinator /usr/local/libexec/jarihana-read-worker-grant
```

읽기 사용자에게 Docker·일반 sudo·저널 쓰기 권한을 주지 않는다. helper는 인자를 받지 않고 고정 worker 저널만 읽는다.
runner는 root 설정의 별도 키·known_hosts로 매번 새 SSH 연결을 연다. 설정·계정·허가 파일이 없으면 실행은 실패한다.

## 다음 실제 검증

`backend-bluegreen-worker-coordinator.yml`과 `worker-coordinator.py`는 Nginx에서 실행하는
별도 worker 부모 경로다. 현재는 로컬 구현 단계이며 아직 원격에 설치하거나 실행하지 않았다.
첫 시험은 B를 `PAUSED`로 유지하면서 `BEGIN → COMPLETE` 두 명령의 요청·결과 회수만 확인한다.
worker 활성화·발송·A/B 인계·HTTP 전환·EC2 종료를 수행하지 않는다.

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
`before`는 설치 직전 실제 B 관리 GET으로 읽은 `AppStatus` 전체 값이며,
정상·대기·작업 종료·권한 미할당·DB 단계 IDLE 또는 COMPLETE여야 한다. 오래된 값을 자동으로 보정하지 않는다.
저널 경로는 기존 worker 전용 디렉터리, 부모 ref는 기능 브랜치로 고정한다.
B의 허용 목록도 이 시험에 필요한 `begin`, `phase_complete`만 별도로 열어야 한다.
설정 파일은 root 소유로 coordinator 그룹에 읽기만 허용하고, 기존 STATUS 설정을 변경하지 않는다.

정상 시험 후 DB의 `dev-rehearsal` 제어 행에는 시험 배포 ID와 `COMPLETE/UNASSIGNED`가 남는다.
이는 초기 `IDLE`로 DB를 되돌렸다는 뜻이 아니다. 푸시·업무 데이터·스키마를 변경하는 시험은 아니며,
실패하면 DB와 영속 저널의 실제 상태를 먼저 대조한다. 자동 DB 삭제·임의 롤백·명령 재전송은 하지 않는다.
이후 전체 A/B 시험에는 각 서버의 실제 상태를 새로 확인해야 한다.

설치한 코드의 고정 태그는 `bluegreen-worker-rehearsal-20261024-01`,
SHA는 `e2f784f428036d71ac8a6d04122324ff898fc7dd`다.
이후 worker 부모가 저널 기록·exact child run 연결·결과 수집을 수행하도록 연결해야 한다.
현재 STATUS 부모는 worker 명령을 요청하지 않는다.
부모 연결과 시험 후 정리 절차를 갖춘 뒤 필요한 동작만 허용하여,
실제 푸시가 차단된 B의 정상 명령 시험부터 수행하고 준비된 dev A와 같은 DB로 인계를 검증한다.
현재 사용자가 dev 서버 시험 가능 상태를 확인했지만, 시험 직전 원래 앱·DB·재시작 정책을 기록하고 종료 후 복구해야 한다.
기존 dev가 자동으로 시험 DB로 바뀌거나 이번 workflow push로 앱이 재시작되는 구조는 아니다.
