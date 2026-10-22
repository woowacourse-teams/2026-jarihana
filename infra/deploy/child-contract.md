# 서버별 배포 작업의 실행 허가와 결과

이 문서는 coordinator가 앱 A/B의 child 작업을 호출할 때 사용할 코드 계약이다.
현재는 라이브러리·읽기 전용 검증 CLI·로컬 앱 e2e에 연결했다.
**EC2 IMDSv2 신원 조회와 SSH 최신 허가 조회를 구현하고 실제 B→Nginx 격리 시험을 통과했다.
읽기 전용 STATUS child workflow의 실제 B 실행과 부모의 artifact 검증까지 통과했다.
전체 배포 coordinator 연결과 상태 변경 작업은 남아 있다.**
STATUS 전용 Nginx 부모의 실제 Actions 실행과 B 결과 수집·영속 저널 일치도 검증했다.
부모의 요청·실패 보존 동작은 [Actions 연결 문서](github-actions-adapter.md#status-전용-nginx-부모)를 따른다.
기존 prod workflow는 계속 기존 배포 방식이며, 이 코드만으로 운영 배포가 바뀌지 않는다.

## Worker 상태 변경 실행 경로

`child_worker.worker_artifact()`와 `SpringWorker`는 worker 상태 변경을 연결하는 라이브러리다.
현재는 로컬 HTTP 검증과 격리된 실제 Spring·PostgreSQL 검증에 연결했다.
상태 변경 전용 CLI·GitHub workflow·관리자 설정 스키마와 격리 프로필 검사는 로컬 구현·검증했다.
[A/B 전용 연결](worker-child/README.md)의 시험 서버 설치와 실제 runner의 격리 프로필·사설 허가 조회는 확인했다.
`WorkerCoordinator`와 별도 부모 CLI·workflow로 실제 Nginx에서 B와 A 각각의
`BEGIN → COMPLETE`를 요청하고 두 child 결과를 회수했다.
두 시험 모두 푸시가 차단된 대기 상태에서 수행했다. 실제 A/B 자동 인계 검증은 남아 있다.
설정과 제한 시험 범위는 [worker 연결 문서](worker-child/README.md#다음-실제-검증)를 따른다.
기존 STATUS workflow는 계속 조회만 허용하며 이번 코드로 상태 변경 권한이 생기지 않는다.

```text
정확한 child run/attempt·control SHA·최신 pending 허가 확인
  -> 로컬 관리 GET: host/boot·현재 authority 확인
  -> command의 authority와 일치 확인
  -> 최신 허가 + 실행 중인 GitHub run 재확인
  -> 고정 loopback POST 한 번
  -> 응답 authority + 후속 관리 GET 대조
  -> 최신 허가·run·boot 재확인 -> 명령에 묶인 결과 artifact
```

- 허용 동작은 `BEGIN`, `HANDOFF`, `PAUSE`, `RELEASE`, `ACTIVATE`, `OBSERVE`, `COMPLETE`다.
  phase 동작만 Spring의 `phase` 경로와 고정 `nextPhase`로 변환한다. EC2·Nginx·앱 종료·임의 경로는 거부한다.
- 명령의 deployment/command ID, epoch, expected revision, host/boot와 deadline을 전달한다.
  새로운 GET에서 읽은 revision으로 오래된 명령을 자동 보정하지 않는다. BEGIN만 기존 세대에서 새 배포로 진입한다.
- deadline은 백엔드 `ClockConfig`의 `Asia/Seoul` 기준 `LocalDateTime`으로 변환한다.
  매 요청마다 시간을 늘리지 않고 원래 명령의 만료 시각을 유지한다.
- `PAUSE` 뒤 `DRAINING`·in-flight가 남은 상태를 그대로 반환한다. 성공 응답이 drain 완료를 의미하지 않는다.
  `RELEASE`는 현재 owner·HANDOFF·DRAINING 권한·로컬 PAUSED/in-flight 0/unresolved 0을 확인한 뒤에만 전송한다.
- `ACTIVATE`는 readiness 정상, 기존 권한 UNASSIGNED, owner 없음과 로컬 drain을 확인한다.
  서버의 DB CAS 검증도 유지하므로 조회 뒤 다른 명령이 들어오면 성공으로 추측하지 않는다.
- `HANDOFF → COMPLETE` 시험 정리는 권한 UNASSIGNED·owner 없음·로컬 drain일 때만 허용한다.
  처리 권한 반납 전에 완료로 건너뛰지 않는다. 이 경로는 900초 운영 관찰 완료를 증명하지 않는다.
- 성공 응답의 authority는 예상 revision+1·epoch·phase·owner/status와 일치해야 한다.
  후속 GET도 같은 authority를 보여야 하며 활성화는 ACTIVE, 중단은 PAUSED/DRAINING을 확인한다.
  이 상태로 프로세스 정상 종료를 증명하거나 `normal_exit=true`를 만들지 않는다.
- 상태 변경 전용 HTTP client는 proxy·redirect·transport retry를 사용하지 않는다.
  전송 유실, 5xx·redirect·잘못된 200·응답 크기 초과·응답 후 조회 실패는 불명확한 결과로 취급한다.
  같은 명령이나 새로운 ID로 자동 재전송하지 않고 저널을 조정해야 한다.
- 응답 후 허가 철회·GitHub 종료·boot 변경이 확인되면 성공 artifact를 만들지 않는다.
  이미 실행된 POST를 취소했다는 뜻은 아니며 실제 상태를 확인해야 한다.

`child_github.py`는 STATUS와 worker 작업이 함께 쓰는 run·binding 검사다.
동작 허용 범위는 각 진입 함수에서 따로 검사한다. 기존 `app-operation.py`는 호환성을 위해 유지했으며
이 새 실행 경로에서 호출하지 않는다.

격리된 실제 JVM 검증은 저장소 루트에서 다음 명령으로 실행한다. 로컬 Java 21 이미지의 digest를 먼저 확인해야 한다.
기존 로컬 backend bootJar와 Docker의 PostgreSQL·Nginx 이미지를 사용한다. 운영 DB/토큰 입력은 받지 않는다.

```sh
PYTHONPATH=infra/scripts/deploy:infra/tests/deploy \
JARIHANA_E2E_JAVA_IMAGE=sha256:<검증한-로컬-Java21-이미지-ID> \
uv run --no-project --script infra/tests/deploy/run_local_worker_control_e2e.py
```

시험은 실제 Spring 두 개에서 A→B→A 권한 변경 14회, 각 명령 뒤 HTTP 응답 14회와 오래된 명령 거부를 확인한다.
외부 push와 scheduler는 비활성화하며 생성한 컨테이너만 정리하고 JSON·로그를 `local-plans/`에 남긴다.
같은 로컬 JAR의 권한 인계 검증으로, 버전 간 DB 호환성·실제 알림 전송·지속 부하·실제 GitHub 실행 검증은 아니다.

## 요청과 결과 흐름

```text
coordinator: command intent 저장 → child run 확인 → 정확한 run/attempt 저장
                                       |
앱 child: 승인된 control ref/SHA + 실제 머신 + 최신 명령 허가 확인
          → 고정 작업 실행 직전 재확인
          → 실행 결과와 종료 증거를 하나의 JSON으로 생성
                                       |
coordinator: 최신 pending 명령·정확한 run·artifact 검사
             → 정상 결과만 저널에 수용 → 다음 단계

기한 만료·취소·다른 run/boot·증거 누락 → 실패 / cleanup 보류
```

`child_execution.py`의 `ChildGate`는 매 호출마다 `JournalReader.read()`로 최신 상태를 읽는다.
저널의 command ID·phase·deadline·parent run/attempt·pending child run과 topology digest를 비교한다.
승인된 control workflow/ref/SHA, `workflow_dispatch`, 첫 attempt만 허용한다.
허가 철회는 다음 검사에서 반영하며 최초 입력 JSON을 캐시해 계속 실행하지 않는다.

`MachineIdentity`는 환경·고정 host ID와 실제 instance ID를 함께 대조하기 위한 값이다.
프로세스가 있으면 관리 API의 환경·host·boot도 확인한다. PREPARE만 기존 프로세스 없이 시작할 수 있고,
현재 대기 slot만 준비할 수 있다. 상태 변경에는 정확한 boot가 필요하다.
EC2 시작·중지와 Nginx 전환은 앱 child에서 수행할 수 없다.

실제 연결 시 `ChildContext.run`은 GitHub가 반환한 실행 정보로 검증해야 한다. 입력 JSON이나
`GITHUB_RUN_ID`만 신뢰해 검증을 완료했다고 할 수 없다. 실제 instance ID도 AWS 메타데이터 등에서
확인해야 한다. 로컬 e2e에서는 이 두 값이 명시적인 fixture다.
원격 `JournalReader`에는 인증·출발지 제한·요청 timeout·최신 조회가 필요하다.
오래된 state.json 복사본을 앱 서버에 전달하는 것으로 대체하지 않는다.

### 실제 머신과 원격 허가 읽기

`ec2_identity.local_machine()`은 고정 IMDS 주소에 PUT으로 토큰을 요청하고,
그 토큰으로 실제 instance ID를 읽는다. IMDSv1 대체, proxy 환경변수, redirect는 사용하지 않는다.
환경과 host ID는 설정값이며, 실제 instance ID와의 조합은 기존 `ChildGate`가 topology와 대조한다.
`metadata_client()`의 context 안에서 사용한다. 토큰이나 응답 원문을 오류 로그에 남기지 않는다.

`ssh_journal.SshJournal`은 각 `read()`마다 새 SSH 연결로 현재 journal을 읽는다.
별도 키, 고정 coordinator 사설 IP, 관리 경로로 확인한 host key를 담은 known_hosts가 필요하다.
host key 자동 수락, SSH agent, 사용자 SSH 설정, multiplex 재사용, 포트 전달은 차단한다.
조회·파싱 실패, 64KiB 초과 응답, 10초 초과 연결은 허가가 없는 것으로 처리한다.
SSH 성공은 실행 승인이 아니며, 받은 상태를 `ChildGate`가 다시 검사해야 한다.

서버 쪽 키는 `jarihana-grant` 전용 계정에서 다음처럼 제한해야 한다.
아래 경로와 출발지 IP는 설명용이며 시험 경로를 운영에 재사용하지 않는다.

```text
from="APP_PRIVATE_IP",restrict,command="/usr/bin/head -c 65537 -- /FIXED/ENVIRONMENT/state.json" ssh-ed25519 PUBLIC_KEY
```

계정에는 journal을 읽을 권한만 부여하고 Docker·sudo·journal 쓰기 권한을 부여하지 않는다.
authorized_keys와 상위 설정은 관리자 소유로 유지하고 키마다 출발지를 제한한다.
실제 `StateStore`는 파일을 0600으로 새로 만들기 때문에 운영 연결에는 전용 읽기 ACL이나
최소 권한의 고정 읽기 helper가 추가로 필요하다. 권한 문제를 해결하려고 journal을 공개하지 않는다.
연결 가능한 네트워크와 SSH 포트, 고정 host key, 키 교체 절차도 운영 준비 항목이다.

`run_cloud_grant_e2e.py`는 실제 B의 전용 runner 계정에서 IMDSv2 조회 후 임시 키로 Nginx에 접속한다.
합성 STATUS 허가의 승인과 같은 프로세스에서의 철회 반영, 임의 SSH 명령이 forced command를
우회하지 못함을 확인한다. 임시 계정과 키·경로는 종료 시 제거한다. 시험 journal은 비밀 없는
합성 데이터이며 실제 journal의 파일 권한 구성 검증을 대신하지 않는다.
실제 GitHub run 확인, 앱 boot/status 확인, 앱 작업 실행은 이 시험의 범위가 아니다.

### STATUS child workflow

`backend-bluegreen-status-child.yml`은 B의 전용 runner만 사용한다.
`workflow_dispatch`의 명령 JSON과 UUID·slot은 환경변수로 전달하며 shell 코드에 삽입하지 않는다.
`status-child.py`는 관리자 소유 `/etc/jarihana-deploy/status-child.json`을 읽고
저장소·시험용 A/B/coordinator·관리 포트·전용 키·known_hosts·토큰 파일을 확인한다.
현재 설정 모델은 `dev-rehearsal`과 실제 시험 인스턴스만 허용한다.

설정에는 다음 필드가 필요하다. topology/control은 검토·커밋한 SHA와 그 커밋을 가리키는
`refs/tags/bluegreen-status-...` 태그를 사용한다. 입력에서 topology나 실행 코드를 선택하지 않는다.

```text
repository: 기존 RepositoryPin(id, full_name, download_hosts)
topology: 기존 Topology(environment, coordinator_instance_id, a, b, control)
coordinator_address: 10.0.3.51
journal_key: 관리자가 설치한 B 전용 키의 절대 경로
known_hosts: 관리 경로로 확인한 Nginx host key 파일의 절대 경로
worker_token_file: 현재 B 앱의 제어 토큰을 보관한 관리자 소유 파일의 절대 경로
management_port: 18081
```

설정과 비밀 파일은 root 소유이며 group/others 쓰기를 금지한다. 토큰은 others 읽기도 금지하고
runner의 전용 그룹에만 읽기를 허용한다. 토큰이나 설정 원문을 로그·artifact에 넣지 않는다.
현재 CLI는 STATUS와 정확한 앱 boot만 허용한다. 실제 GitHub API에서 저장소·control tag/SHA·workflow·
run/attempt·명령 이름과 `in_progress`를 확인한다. 최신 허가 검사 후 localhost 관리 API를 GET으로 읽고,
앱 환경·host·boot를 대조한 뒤 GitHub 실행과 허가를 다시 확인한다. 취소·철회 시 결과를 발급하지 않는다.
반환 파일은 기존 `ChildArtifact`와 동일하며 shutdown은 null이다.

`spring_status.py`는 실제 worker/HTTP/background 수치를 보존한다. 누락된 activity를 0으로 채우지 않는다.
readiness DOWN은 healthy=false로 기록하고, 인증·파싱 오류는 STATUS 작업 실패다.
이 모듈의 실제 B 관리 API 조회는 `run_cloud_status_probe.py`로 검증했다.
해당 시험은 앱 재시작·제어 POST 없이 수행하며 GitHub child 실행 성공을 의미하지 않는다.

0600 journal의 읽기 권한을 위해 [고정 helper](status-child/read-status-grant.sh)와
[최소 sudoers 예시](status-child/read-status-grant.sudoers)를 준비했다. helper는 root 소유·쓰기 금지로
`/usr/local/libexec/jarihana-read-status-grant`에 설치한다. grant 계정에는 이 helper를
coordinator 사용자로 인자 없이 실행하는 권한 하나만 허용한다. 관리용 shell·일반 sudo·Docker 권한은 없다.
키의 forced command는 `sudo -n -u jarihana-coordinator /usr/local/libexec/jarihana-read-status-grant`로 고정한다.
helper는 `/var/lib/jarihana-deploy/status-rehearsal/state.json` 한 개만 읽는다.
dev 리허설 B/Nginx에 계정·키·helper·sudoers·고정 태그 설정과 실제 pending/run journal을 설치했다.
보호된 0600 journal 조회와 다른 sudo 명령 거부를 확인했다. 시험 완료 후 pending/run은 비워
해당 명령이 더 실행되지 않도록 닫았다. 이 설정은 prod 적용 설정이 아니다.

feature push의 register job은 GitHub-hosted runner에서 등록 표식만 출력하며 앱 서버에서 작업하지 않는다.
STATUS job은 승인된 태그의 dispatch에서만 실행한다. GitHub 공식 문서상 dispatch에는 기본 브랜치
등록 전제가 있으며, 한 번 실행된 workflow의 branch/tag dispatch도 지원한다. feature push 등록 이후
실제 API 허용 여부를 확인해야 한다. 등록이 거부되면 main 변경이나 기본 브랜치 변경으로 우회하지 않는다.
2026-10-23에는 feature push 등록 후 태그 dispatch가 실제로 허용됐다.
`bluegreen-status-rehearsal-20261023-02`(SHA `1ff51384f80c6a12913506af3508c87b9efcfc43`)의
[run 39954155638](https://github.com/woowacourse-teams/2026-jarihana/actions/runs/39954155638)이
B 전용 runner29에서 성공했다. 실제 GitHub run/attempt·artifact 출처·ZIP digest·내용과 최신 허가를
기존 GitHubApplications 검증기로 확인했고, 반환된 worker는 PAUSED·healthy=true였다.
부모 역할은 승인된 로컬 시험 도구가 Nginx의 저널을 관리하며 수행했다. Nginx coordinator workflow가
이 과정을 자동 실행한 것은 아니며, 전체 자동 배포 연결은 후속 작업이다.
완료 전환 순간 두 API 조회의 status/conclusion 차이로 부모 수집이 한 차례 보류됐고,
안정된 상태를 다시 조회해 검증을 완료했다. 자동 수집의 이 상태 전환 경계는 후속 보완 항목이다.

## 결과 파일 계약

`child_artifacts.py`의 `ChildArtifact`는 최대 64 KiB의 JSON이다.

```text
schema_version: 1
receipt:
  schema_version: 1
  command: 원래 명령 전체
  run: 정확한 workflow/ref/SHA/event/run ID/attempt
  success: true
  status: 환경·instance·host·boot·이미지·worker·실제 활동 수치
shutdown: STOP_APP의 ShutdownEvidence, 그 외에는 명시적인 null
```

Boolean·카운터·버전은 엄격하게 읽는다. 문자열 `"true"`나 버전의 `true`를 1로 변환하지 않는다.
`normal_exit`, HTTP 수치와 background 상태는 명시해야 한다. 알 수 없는 필드와 스키마 누락도 거부한다.
검증 오류에 원문 payload나 비밀값을 출력하지 않는다.

STOP_APP은 `success=true`만으로 통과하지 않는다. 다음을 추가 검사한다.

- 종료 증거의 command ID·boot와 receipt·명령이 일치한다.
- 앱이 정지했고 worker·HTTP·업무 스케줄러가 drain됐으며 이전 worker 권한을 보유하지 않는다.
- 종료 코드는 0/143이고 컨테이너 시작 시각 뒤에 종료됐다. 미래 시각은 초안 오차 5초 이내만 허용한다.
- 현재 저널의 sealed cleanup 허가와 deadline이 여전히 유효하다.

컨테이너 세대·OOM·재시작 검사는 증거를 생성하는 [Docker 종료 어댑터](README.md#앱-종료-증거)가 담당한다.
artifact 검증은 실제 Docker 조회를 대신하지 않는다. 종료 증거는 다른 명령으로 재사용할 수 없다.
부모 저널에는 기존 `Receipt` 형식으로 변환해 저장하므로 파일 재조회와 CAS 비교도 같은 타입을 사용한다.

JSON 내부의 ID 검사는 파일의 출처 검증과 별개다. 실제 GitHub 어댑터는 정확한 child run/attempt의
성공 conclusion·artifact ID·만료 여부를 확인하고, ZIP의 크기·파일 수·경로도 제한해야 한다.
다운로드 어댑터는 [GitHub 연결 계약](github-actions-adapter.md)에 구현 범위를 기록했다.
producer/consumer workflow의 실제 연결과 GitHub 권한 검증은 아직 남아 있다.

## 읽기 전용 검증 CLI

```sh
uv run infra/scripts/deploy/verify-child-artifact.py \
  topology.json /var/lib/jarihana-deploy/prod/state.json child-result.json
```

종료 코드 0은 **현재 pending 명령에 대한 파일 내용 검증 성공**이다. 1은 입력/계약 검사 실패,
2는 잘못된 사용법이다. 성공 시 command ID·run ID·attempt만 출력하고 저널이나 서버를 변경하지 않는다.
이미 완료·취소된 배포의 결과로 새 작업을 승인하지 않으므로, 나중에 보관된 artifact와 완료 저널을
넣으면 실패하는 것이 정상이다. 이 CLI는 GitHub 파일 출처·권한 검증 또는 실행 허가 API가 아니다.

## 현재 검증과 다음 연결

로컬 e2e는 매 작업의 실제 Spring 상태를 읽고 `ChildGate`를 통과한 뒤 고정 작업을 호출한다.
worker POST 직전과 Docker 종료 polling 중에도 재검사한다. `child-<command ID>.json`을 생성하고
coordinator 쪽 `accept_artifact()`로 수용한 결과만 반환한다.
실제 Docker 종료 시각과 비교할 수 있도록 가상 관찰 시계는 실행 시작의 실제 UTC에 맞춘다.
900초 관찰은 여전히 가상 시간이며, 실제 GitHub·AWS·telemetry는 fixture다.

읽기 전용 STATUS의 실제 run/attempt·앱 boot·최신 허가·artifact 검증 다음은
상태 전환 시 조회 일관성을 보완하고 Nginx coordinator 및 상태 변경 child 작업에 연결하는 작업이다.
그 뒤 Compose·관측을 연결한다. 실제 두 EC2 시작·중지는 별도 비운영 리허설에서
검증하고, 추가 dev EC2가 필요한 시점에 준비 사항을 안내한다.
