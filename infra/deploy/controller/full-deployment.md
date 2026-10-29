# 전체 배포 경로와 dev 적용 절차

이 문서는 Blue-Green 호스트 설치와 실행의 공통 기준이다.
예시를 복사한 것만으로 서버가 준비되거나 운영 배포가 활성화되지는 않는다.
실제 dev 도메인을 자동 배포로 바꾸는 순서는 [dev 자동화 적용 순서](dev-automatic-deployment.md)를 따른다.

## 확정된 실행 방식

```text
develop 머지 -> BLUE_GREEN_DEV_ENABLED=false/미설정: 기존 dev 배포
               BLUE_GREEN_DEV_ENABLED=true: 아래 Blue-Green 순서
               최초 bootstrap은 별도 수동 실행

main 머지 -> BLUE_GREEN_PROD_ENABLED=true인 경우
  GitHub ARM runner: develop에서 만든 backend tree 이미지의 digest 확인
  Nginx runner: 실제 부모 실행/로컬 EC2 신원/관리자 설정 확인
    -> 현재 실제 HTTP 대상 A 확인
    -> B EC2 시작 -> native needs로 B 앱 작업 job 연결
    -> 고정 digest B 기동, 기본 PAUSED, readiness·관측 준비 확인
    -> A 신규 푸시 선점 중단 -> 작업 완료 -> DB 권한 반납
    -> Nginx 검증/reload -> 실제 B API 확인 -> B worker 활성화
    -> 앱 worker와 HTTP 관측 job 병렬 최소 900초: readiness/실제 API/5xx/응답 지연
    -> A HTTP·백그라운드 종료 -> 롤백 창 봉인
    -> A 앱 SIGTERM 정상 종료 증거 확인 -> A EC2 중지
  다음 배포: 같은 순서로 B -> A
```

업무용 DB·JWT·OAuth·푸시·S3 설정은 기존 GitHub `dev`/`prod` Variables·Secrets를 사용한다.
앱 작업 workflow가 해당 environment를 선택하며 EC2의 영구 앱 설정 파일로 복사하지 않는다.
dev 자동화 비활성 상태의 수동 실습은 실제 푸시와 주기적 delivery 선점을 강제로 비활성화한다.
실제 도메인의 dev 자동화는 기존 dev의 PUSH_ENABLED·PUSH_WORKER_ENABLED를 유지한다.
두 방식 모두 후보는 제어 활성·START_PAUSED로 시작하고 이전 worker의 발송·finish commit과
처리 권한 반납 후 활성화한다. 발송을 꺼 둔 실습 결과만으로 실제 발송을 검증했다고 표시하지 않는다.
prod는 기존 prod 환경의 푸시 설정을 사용한다.
기계 간 제어 토큰과 SSH 허가 조회 키는 별도 관리자 소유 파일로 보관한다.
비밀값을 명령 인자·로그·artifact에 넣지 않는다. Docker 접근 권한은 컨테이너 환경을 읽을 수 있는
강한 권한이므로 runner 계정을 신뢰할 수 있는 배포 작업에만 사용한다.

## 관리자 설정과 선행 준비

설치 전에 실제 인스턴스 ID·프라이빗 IP·VPC·계정·runner 이름을 다시 확인한다.
`full-coordinator.example.json`, `full-app-A.example.json`, `full-app-B.example.json`의 IP·0으로 채운
ID·a로 채운 SHA는 모두 placeholder다. 실제 값으로 바꾸기 전에는 실행하지 않는다.
prod는 environment·모든 경로·A/B ID·주소·HOST_ID를 prod 값으로 별도 작성한다.
dev A가 prod A라고 가정하지 않으며, dev 검증에 사용한 prod2를 운영에 재사용하기 전에는 dev 앱과
설정을 정리하고 prod 환경을 별도로 확인한다. 기존 prod는 이 dev 검증에 사용하지 않는다.

| 위치 | 필요한 준비 |
| --- | --- |
| Nginx | Bash 5+, jq, curl, util-linux(flock), GNU coreutils, Git, Docker, AWS CLI v2, 전용 `jarihana-coordinator` runner, 고정된 Nginx 이미지 |
| 각 앱 | Bash 5+, jq, curl, GNU coreutils, tzdata(Asia/Seoul), Git, OpenSSH, Docker Compose v2, 전용 `jarihana-runner` runner, RDS/레지스트리 접근 |
| 관측 | 각 앱 호스트의 Alloy, Nginx 중앙 배포 수집기와 전용 Alloy, Prometheus 조회 경로, 정확한 environment/host_id 라벨 |
| 네트워크 | Nginx→앱 private app port, 앱→Nginx 허가 조회 SSH, 앱→RDS, outbound GitHub/GHCR |

앱 관리 포트는 host loopback으로만 게시한다. public app port는 Nginx에서만 접근 가능하게 한다.
Nginx의 `/__deployment` probe는 host loopback에만 게시하고, public `/actuator`는 차단한다.
Nginx 이미지에는 `curl`, `sh`, `tr`, `awk`가 있어야 한다. 로컬 검증에는 `nginx:1.30.5-alpine`을
사용하며 실제 설치는 검증한 digest로 고정한다. Nginx upstream은 앱의 프라이빗 IP를 사용한다.

각 호스트의 Alloy `HOST_ID`와 앱 설정의 `host_id`를 같게 맞추고, `APP_METRICS_TARGET`은
해당 호스트의 실제 loopback 관리 포트를 가리켜야 한다. B가 켜지면 Alloy도 시작돼야 한다.
Alloy app scrape는 `host_id=HOST_ID`를 `up`과 HTTP 지표에 함께 부여한다.
기존 Alloy 설정에도 이 라벨을 반영해야 배포 coordinator의 호스트별 조회가 동작한다.
이전 모니터링 Compose를 함께 쓰는 경우 앱 준비 작업이 Alloy를 삭제하거나 재시작하지 않는다.
Blue-Green 전용 호스트는 [독립 Alloy Compose](observability-compose.yml)로 공통
[`config.alloy`](../../monitoring/alloy/config.alloy)와
[`postgres-queries.yaml`](../../monitoring/alloy/postgres-queries.yaml)을 설치한다.
이 공통 설정은 기존부터 health, DB, 호스트, 자체 메트릭, 로그 수집을 포함한다.
앱 scrape만 있는 임시 설정으로 대체하면 이 관측이 빠지므로 전체 설정을 재사용한다.
보호된 env 파일에 `DEPLOY_ENVIRONMENT`, `DEPLOY_HOST_ID`, `PROMETHEUS_REMOTE_WRITE_URL`,
`LOKI_PUSH_URL`, `POSTGRES_MONITOR_DSN`, 두 설정 파일의 절대 경로인 `ALLOY_CONFIG_FILE`·
`POSTGRES_QUERIES_FILE`, 기존 WAL 볼륨명인 `ALLOY_STORAGE_VOLUME`을 지정한다.
선택 입력 `MANAGEMENT_PORT`는 기본 `8081`이며 해당 호스트 앱 설정의 `management_port`와
같아야 한다. 앱 env와 observability env는 별도 파일이라 포트 변경이 자동 동기화되지 않는다.
신규 호스트에서는 시작 전에 `docker volume create <ALLOY_STORAGE_VOLUME>`으로 외부 볼륨을
생성한다. 기존 수집기를 교체할 때는 기존 WAL 볼륨을 그대로 지정하고 삭제하지 않는다.
기존 Alloy가 있으면 설정 검증 후 해당 수집기만 중지하고 전환하며, 같은 host_id의 앱 지표를
두 수집기가 중복 전송하지 않게 한다. backend 배포 Compose와 프로젝트는 분리한다.
관리 HTTP와 자체 메트릭은 loopback `12345`를 사용한다. `docker compose --env-file
<보호된-env> -p jarihana-observability-prod -f <observability-compose.yml> run --rm --no-deps
alloy validate /etc/alloy/config.alloy` 검증 후 같은 인자로 `up -d alloy`를 실행한다.
A/B 양쪽에서 재부팅 후 자동 시작과 `jarihana-backend`, `jarihana-health`, `jarihana-liveness`,
`jarihana-database`, `jarihana-postgres`, `jarihana-host`, `jarihana-alloy`의 최신 `up=1`,
health probe·`pg_up=1`, 해당 host_id의 Loki 로그 도착을 확인한다. 정상 대기 서버의
앱이 중지돼 있으면 앱 scrape·probe 실패는 정상이며 실제 활성 서버와 구분한다.
용도를 모르는 PostgreSQL 컨테이너나 다른 팀 작업을 정리 대상으로 삼지 않는다.

prod health 알림은 앱 A/B의 health뿐 아니라 배포 Nginx EC2의 중앙 배포 수집기에 의존한다.
이 수집기는 systemd timer가 실제 Nginx `/__deployment`와 설정/상태를 읽어 textfile을 만들고,
Nginx 호스트의 별도 Alloy가 Prometheus로 전송한다. 앱 A/B의 공통 설정이나 모니터링 EC2의
호스트 Alloy와는 별도다. 정상 route는 A/B 중 하나만 `1`이며 다른 하나는 `0`이다.
drain 중 두 앱이 동시에 정상이어도 활성 경로는 하나여야 한다. 알림은 유효한 활성 호스트가
정확히 하나인지, collector/Nginx 관측이 45초 이내인지, 해당 앱 health가 150초 이내이며
정상인지 확인한다. 대기 서버 중지와 활성 경로 관측 실패를 구분한다.
실제 서버의 timer, 전용 Alloy, 점검 방법은
[중앙 배포 수집기](../../docs/observability/CENTRAL-DEPLOYMENT-COLLECTOR.md)에 기록한다.
현재 이 중앙 수집기 설치 소스와 재설치 절차는 저장소에 없으므로 앱/모니터링 Compose만으로
복구되지 않는다. 운영 활성화/서버 교체 전에 검토 가능한 원본과 설치 절차를 확보해야 한다.

Prometheus 9090은 모니터링 호스트 loopback으로 유지한다. 읽기 경로는 기존 사설 8080의
`/prometheus/api/v1/query` 한 개만 사용하며, 현재 확인된 배포 Nginx private IP `10.0.3.51`만 허용한다.
실제 적용 전 IP·보안 그룹을 다시 확인하고 coordinator를 바꾸면 이 정확한 allowlist도 바꾼다.
query_range·관리 API·다른 Prometheus 경로를 열지 않으며 공개 80 서버의 라우팅은 바꾸지 않는다.
조회 URL 예시는 `http://<모니터링 private IP>:8080/prometheus`다. dev 실환경 시험에서 조회를
확인했더라도 재설치 때는 실제 경로와 allowlist를 확인한다. 문서를 읽거나 머지했다고 서버에
설정이 자동 설치되는 것은 아니다.
`Monitoring Deploy`의 컨테이너 재생성은 이 조회 경로도 중단한다. Blue-Green과 모니터링 workflow의
공유 concurrency group으로 배포를 직렬화한다. 대기열·최초 적용과 수동 재시작 제한은
[Actions 계약](../github-actions-adapter.md#모니터링-배포와-동시-실행-방지)을 따른다.

### 파일·계정 경계

- Nginx: `/etc/jarihana-deploy/dev/coordinator.json` (prod는 별도 prod 경로).
- 앱 A/B: 각 호스트의 `/etc/jarihana-deploy/dev/app-A.json` 또는 `app-B.json`.
- 앱 파일: 같은 디렉터리의 `app-compose.yml`, `worker-token`, `grant-key`, `known-hosts`.
  Compose는 **고정 control tag의 저장소 템플릿과 byte 단위로 일치**해야 한다.
- 관리자 디렉터리는 root 소유, runner의 전용 그룹에 읽기만 허용한다. config는 0640,
  비밀 파일은 others 권한 없이 0640 이하로 설치한다. 앱 제어 토큰은 호스트마다 32바이트 이상으로
  생성하며 출력하지 않는다. 비밀값을 저장소나 대화에 넣지 않는다.
- 상태 디렉터리 `/var/lib/jarihana-deploy/dev`는 coordinator 소유 0700, 저널은 0600으로 유지한다.
  prod 저널은 `/var/lib/jarihana-deploy/prod`로 분리한다.
- 각 앱 호스트에도 runner 소유 0700 상태 디렉터리를 미리 만든다. A 호스트는
  `/var/lib/jarihana-deploy/dev/app-A`, B 호스트는 `/var/lib/jarihana-deploy/dev/app-B`를
  `install -d -o jarihana-runner -g jarihana-runner -m 0700 <해당 경로>`로 준비한다.
  prod는 `dev` 대신 `prod`를 사용한다. 앱 runtime은 이 경로를 자동 생성하지 않는다.
  이곳의 worker/SIGTERM intent·잠금·Compose 실행 기록은 앱 runner가 소유하며 coordinator
  저널과 별개다. 실패 후 unresolved intent를 지우지 말고 실제 프로세스·DB 권한과 대조한다.
- 앱 SSH 키는 Nginx의 전용 `jarihana-grant` 계정에서 **한 환경의 저널 읽기**만 허용한다.
  출발지를 앱의 private IP로 제한하고 `restrict,command=...`로 고정한다.
  root 소유 `read-deployment-grant.sh` 복사본의 `ENVIRONMENT`를 literal dev/prod로 치환하고
  coordinator 사용자로 **인자 없이** 실행하는 최소 sudoers만 허용한다.
  일반 shell·임의 sudo·Docker 권한을 grant 계정에 주지 않는다.
- `head -c 4194305`와 앱의 4MiB 읽기 제한을 함께 사용한다. 장시간 관측 결과가 포함되는 저널을
  과거 STATUS 시험용 64KiB helper로 읽으면 중간에 실패하므로 시험 helper를 재사용하지 않는다.
- Nginx host key는 신뢰할 수 있는 관리 경로로 확인하고 known_hosts에 설치한다.

### AWS 권한과 초기 Nginx

Nginx EC2 역할에는 DescribeInstances와 **해당 환경의 A/B 인스턴스만** StartInstances·StopInstances를
허용한다. 실제 ARN·조건·조직 정책은 관리자가 확인한다. CLI 자격 증명은 AWS 기본 체인을 사용하고
장기 access key를 workflow에 추가하지 않는다. 이 저장소는 IAM 정책이나 실제 권한을 변경하지 않았다.
운영 활성화 전 역할 신원과 EC2 dry-run을 별도로 확인해야 한다.

관리자가 root 설정의 A upstream·host ID와 맞는 최초 `current.conf`를 한 번 설치하고,
기존 `infra/deploy/nginx/docker-compose.yml`로 Nginx를 시작한다. 환경 변수의 설정 디렉터리·컨테이너
이름·probe port를 coordinator JSON과 일치시킨다. 예시 container 이름은 프로젝트 이름을
`jarihana-edge`로 시작했을 때의 `jarihana-edge-nginx-1`이다. 실제 이름이 다르면 설정을 바꾼다.
설정 디렉터리는 Nginx에 read-only로 mount하며 공개 리스닝 주소·포트와 보안 그룹은 실제 경로에
맞춰 지정한다. 기존 서비스의 CloudFront origin 변경은 최초 운영 전환 때 별도로 검토하는 인프라
작업이다. 이후 배포마다 origin을 바꾸지 않는다. 단일 Nginx EC2 장애를 막아주는 구조는 아니다.

## GitHub 설정과 최초 초기화

repository Variables에 다음 전용 runner 라벨을 등록한다. 여러 호스트를 같은 라벨로 묶지 않는다.

```text
BLUE_GREEN_DEV_A_RUNNER / BLUE_GREEN_DEV_B_RUNNER
BLUE_GREEN_PROD_A_RUNNER / BLUE_GREEN_PROD_B_RUNNER
BLUE_GREEN_DEV_ENABLED (repository 변수, 초기 false 또는 미설정)
BLUE_GREEN_PROD_ENABLED (초기 false 또는 미설정)
BLUE_GREEN_CONTROL_REF (repository 변수, refs/tags/deployment-control-...)
RDS_URL (dev/prod environment 변수, 해당 환경의 RDS endpoint)
```

coordinator 라벨은 `jarihana-bluegreen-coordinator`다. 앱 workflow에는 선택한 dev/prod의 기존
Variables·Secrets가 사용된다. environment 배포 제한은 dev/prod 부모 실행 branch를 허용해야 한다.
checkout은 별도로 보호된 control tag를 사용한다. environment에 매 job 승인 규칙이 있으면 각 단계가
승인을 기다리므로, 허가 기한과 자동
배포라는 목표와 보호 규칙을 함께 검토한다. 이 작업에서 보호 규칙을 임의로 변경하지 않는다.
dev 앱 A/B는 승인한 개발 RDS의 `jarihana_dev`를 사용한다.
일반 배포와 Blue-Green 모두 해당 environment의 `RDS_URL` 하나를 사용한다.
endpoint만 설정하며 JDBC 접두사·포트·DB 이름은 붙이지 않는다.
옛 immutable control release는 프로세스 환경 변수 `BLUE_GREEN_RDS_URL`도 요구하므로
앱 workflow가 같은 `RDS_URL` 값을 호환용 별칭으로 전달한다. 별도 GitHub 변수는 읽지 않는다.
이 workflow 변경을 develop/main에 반영하고 기존 실행이 끝난 뒤 임시 GitHub 변수
`BLUE_GREEN_RDS_URL`을 삭제한다. 호환 별칭 제거는 옛 release가 실행되지 않는 것을
확인한 뒤 별도 변경으로 진행하며, 기존 control tag를 이동하지 않는다.
prod에는 dev DB 이름·계정·endpoint 설정 묶음을 복사하지 않는다.

검토·반영한 코드에 새 `deployment-control-...` immutable tag를 만들고, 실제 SHA와 tag를
Nginx/A/B 세 설정과 `BLUE_GREEN_CONTROL_REF`에 동일하게 고정한다. 기존 태그를 이동하지 않는다.
각 Bash 작업은 실제 checkout HEAD와 root 설정 SHA를 대조한다. reusable workflow의 DAG는
검토된 부모 커밋에 있고 실행 스크립트는 control checkout을 사용하므로 두 변경을 함께 검토한다.
코드가 바뀌면 설치된 Compose와 control release도 같이 검토한다.

최초 bootstrap은 이미 새 제어 기능을 포함한 앱 A가 **해당 digest로 정상 실행·PAUSED**이고,
DB 권한은 UNASSIGNED이며, Nginx가 A를 가리키는 상태에서만 가능하다. 구버전 앱을 자동으로
새 제어 앱으로 바꾸는 명령이 아니다. 초기 A 설치는 별도 준비 작업이며 구버전 worker가 계속
발송 중인 상태에서 B를 먼저 활성화하지 않는다. 최초 bootstrap의 B EC2는 stopped여야 한다.
두 버전의 인증 키·세션 DB·payload·스키마 호환성도 이때 확인한다.

1. dev 자동화 변수는 false/미설정으로 두고 PR을 반영한다. 기존 이미지 빌드와 dev 배포 성공을 확인한다.
2. 서버·Nginx·관측·보호된 설정·현재 A 앱을 준비한다. prod 설정이나 기존 prod origin은 바꾸지 않는다.
3. Development Deploy를 수동 실행한다. `blue_green_mode=bootstrap`, `image_tag`에는 현재 A의
   이미지를 만든 40자리 SHA를 넣는다. 초기 등록은 반복 실행할 수 없으며 이미 owner가 있으면 거부한다.
4. 수동 실습은 `blue_green_mode=deploy`로 A→B→A, 장애·롤백을 검증한다. 실제 도메인의 자동화는
   [별도 전환 절차](dev-automatic-deployment.md)에 따라 live 푸시 설정·최초 등록·CloudFront를
   준비한다. 비활성 실습 앱에서 변수만 true로 바꾸는 것으로 설치를 대신하지 않는다.
5. prod 이관 전에 A로 정상 복귀하고 원래 dev 설정·runner를 복구한다.
   특히 A EC2를 중지한 채로 기존 dev runner 배포를 재개하지 않는다. DB 권한은 임의 SQL 삭제로
   초기화하지 않고 관리 API로 안전하게 정리한다. 모든 dev 배포가 종료되고 복구된 뒤
   `BLUE_GREEN_DEV_ENABLED=false`로 바꾸고 B의 dev 설정을 정리한다.
6. prod도 실제 환경에 맞춰 별도 초기 등록·검증한다. 마지막에 `BLUE_GREEN_PROD_ENABLED=true`를
   설정하면 이후 main push는 기존 Recreate job 대신 Blue-Green job을 실행한다.

prod를 활성화한 뒤 수동 배포는 `blue_green_mode=deploy`를 명시한다. 초기값 legacy는 자동으로
실행 경로를 바꾸지 않기 위한 값이며, prod flag가 true일 때 legacy job은 실행되지 않는다.
이미지는 GitHub ARM 호스트에서 pull해 digest를 확인하므로 Nginx의 작은 인스턴스에서 빌드하지 않는다.

## 관찰과 복구

초안은 5초 간격, 연속 3회 실패, 최소 900초 관찰이다. Prometheus는 호스트별 fresh up과
최근 2분의 요청 수·5xx 비율·평균 요청 시간을 조회한다. 초안 기준은 sample age 45초,
5xx 1%, 평균 1초이며 root 설정에서 바꿀 수 있다. **p95 지표가 아니다.** dev 결과를 설명한 뒤
확정해야 한다. 요청이 없다는 값과 지표가 없다는 상태는 구분한다. 없는 값·NaN·경고·불명확한
다중 series는 UNKNOWN이며 0으로 채우지 않는다. 전환 전에 후보 지표가 준비될 때까지 대기한다.
단, 총 요청 지표가 존재하는 상태에서 5xx series만 아직 생성되지 않았다면 오류 건수는 0으로
처리한다. 총 요청 지표 자체가 없는 경우에는 정상 처리하지 않는다.
건강 검사는 5초 대기, coordinator의 앱 관찰 job 실패 조회는 15초 간격이다.
읽기 전용 부모 run 검증의 성공만 최대 30초 재사용하며 변경 전 검증은 매번 새로 수행한다.
최신 SSH 저널 허가는 관찰 때마다 읽는다.
5초는 검사 사이의 대기 시간이며, 실제 검사 주기에는 GitHub 부모 조회·허가 SSH·로컬 API 시간이 더해진다.
5초마다 반드시 검사된다고 보장하지 않는다. 실제 간격과 장애 복구 시간은 dev에서 측정해야 한다.

- B 상태를 읽을 수 있고 이상이 반복되면 A HTTP 복구→B worker pause/drain/release→A worker
  activate 순서로 정상 자동 롤백한다. 롤백돼도 배포 job은 실패로 끝낸다.
- B 상태 자체를 읽을 수 없다면 미확정 pending을 보존하고 ATTENTION을 기록한다.
  Nginx 컨테이너 세대가 그대로이고 Nginx 안에서 A의 실제 API가 정상 응답하는 경우에만
  HTTP를 A로 복구한다. A worker는 PAUSED로 두며, B worker 상태는 미확정으로 남긴다.
  원래 pending/run과 양쪽 EC2를 보존하고 job 실패·실행 요약으로 확인을 요청한다.
  죽은 boot의 worker 권한을 시간만으로 강제 회수하지 않는다. 실제 수동 복구에서는 이전 프로세스의
  종료와 DB finish commit 상태를 확인하는 별도 절차가 필요하며 임의 SQL 삭제로 재활성화하지 않는다.
- 기존 연결·푸시 finish commit이 끝났는지 확인할 수 없으면 강제 종료나 EC2 중지를 하지 않는다.
  WebSocket·장시간 연결도 이 경우에 포함된다.
- 전환 후 양쪽 15분 관찰은 통과했지만 이전 Nginx 연결이 300초 더 기다려도 남아 있고
  B의 API·지표는 정상이라면, `cleanup_deferred=true`와 `NEEDS_ATTENTION`을 기록한다.
  B의 서비스와 worker 권한을 유지하고 양쪽 EC2를 켜 둔다. 자동 롤백·complete·이전 앱 종료·
  EC2 중지는 진행하지 않으며 Actions는 실패와 실행 요약으로 확인을 요청한다.
  이때 B도 비정상이거나 상태가 불명확하면 정상 B로 간주하지 않고 기존 장애 복구 경로를 따른다.
- 정상 롤백 후 B가 실행 중이어도, 다음 PREPARE는 최신 DB 권한이 A에 있고 B가 PAUSED이며
  모든 작업 종료가 확인된 경우에만 B를 SIGTERM 정상 종료하고 교체한다. 알 수 없는 실행 앱을
  무조건 지우지 않는다.
- 응답 유실·취소·watchdog 감지 후 같은 실행을 재실행하거나 marker/pending을 삭제하지 않는다.
  외부 동작이 이미 적용됐을 수 있으므로 저널과 실제 경로·프로세스를 대조해 수동 조정한다.

`jarihana-deploy-watchdog@.service/.timer`는 `jarihana-coordinator` 계정으로 각 환경 저널을 감시한다.
검토한 control 코드와 Bash/jq/coreutils를 `/opt/jarihana-deploy`에 준비한다. unit은
`BG_ENVIRONMENT=%i`와 `coordinator.sh watchdog`을 사용하며 Python/uv나 GitHub token이 필요 없다.
별도 watchdog.json 없이 root 소유 환경별 coordinator.json을 읽는다.
dev/prod timer를 필요한 환경에만 활성화한다. watchdog과 coordinator는 같은 사용자로 실행해야
0600 저널을 읽을 수 있다. pending이 있으면 operation deadline, 없으면 60초 heartbeat를 확인하고,
항상 전체 7200초 만료도 확인한다. 긴 native 앱 job 동안 coordinator heartbeat 갱신이 필요하지 않다.
prepare는 EC2 running 확인 후 1500초, observe는 1800초, 그 외 앱 허가는 600초다.
queue와 checkout도 이 기한을 소비하므로 runner가 늦게 시작하면 허가를 늘리지 않고 실패한다.
`timeout-minutes`는 self-hosted queue를 제한하지 않는다. hosted `queue-guardian`이 병렬로
30초마다 실제 run/jobs를 조회한다. queued 전용 runner job을 처음 본 뒤 300초 또는
전체 7200초 경과를 확인하면 현재 run
취소를 한 번 요청한다. 조회 실패도 실패·취소 요청으로 처리하며 응답 유실은 재전송하지 않는다.
guardian만 실행 중 GitHub Actions write token을 사용하고 서버·SSH·watchdog 권한은 늘리지 않는다.
기한 감지는 최대 30초 poll 경계와 API 요청 시간만큼 늦을 수 있다. guardian 자체의 기동·
GitHub 취소 지연까지 300초로 보장하지 않으며 실제 dev API의 queue 상태·
job 라벨·재사용 job 이름·취소 전달을 확인해야 한다. 세부 경계는 [Actions 계약](../github-actions-adapter.md)을 따른다.
watchdog은 권한을 넘겨받거나 서버를 종료하지 않고 pending을 보존해 ATTENTION만 기록한다.
`always()` finalizer도 runner 전원·네트워크 장애 때 실행을 보장하지 않는다.

## 검증 범위

실행 가능한 정적 명령은 [배포 README](../README.md#검증)에 있다. Bash 전환 뒤 실제 Spring 두 개·
PostgreSQL·Nginx로 bootstrap, 양방향 전환, 정상 종료, 자동 롤백과 HTTP만 복구하는 경로를
검증한다. 새 Bash 통합 하네스는 실제 JVM·PostgreSQL·Nginx·Prometheus로 이 경로를 실행하며,
GitHub·AWS·호스트 신원·SSH 전송과 로컬 JAR 후보 준비는 격리 fixture로 대체한다.
별도 `run-compose-e2e.sh`는 정식 Dockerfile 이미지의 캐시 제거 후 실제 registry pull과
변경 없는 Compose/prepare/profile을 검증한다. 격리된 Docker 데몬과 TLS PostgreSQL에서
READY/PAUSED, 이미지·포트·메모리 설정, 잘못된 digest·Compose 변조·안전하지 않은 교체 차단과
정상 SIGTERM을 확인한다. 이 시험도 외부 GitHub/AWS·호스트 설정·SSH 전송은 대역이다.
실제 15분 관찰은 로컬 결과에 포함하지 않는다.
과거 Python 통합 결과를 새 Bash runtime의 검증으로 간주하지 않는다.
로컬 API 대역과 가속 시계는 실제 AWS 역할·네트워크·GitHub native jobs·권한·runner 선택·
배포 보호·실제 15분 관찰을 증명하지 않는다. 별도 dev Nginx 경로의 실환경 시험 뒤에도 실제
dev 도메인의 develop push 자동 배포는 추가 검증해야 한다. 실제 발송을 켠 검증도 별도로 확인한다.
