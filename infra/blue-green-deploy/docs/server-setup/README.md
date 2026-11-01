# Blue-Green 서버 구성

운영(prod) 환경을 처음 구성하거나 서버를 교체할 때 필요한 설정과 재구성 순서다.
코드 기준은 [적용 버전](../deployment.md#적용-버전), 구성요소의 역할은 [동작 구조](../architecture.md)를 따른다.
반복 배포는 [배포 실행](../deployment.md), 기존 상태가 불확실한 경우는 [장애 복구](../recovery.md)를 따른다.

- [필수 설정](#필수-설정)
- [구성 시작 전 준비](#구성-시작-전-준비)
- [프론트엔드 사전 준비](#프론트엔드-사전-준비)
- [앱 Alloy와 조회 경로](#앱-alloy와-조회-경로)
- [재구성 절차](#재구성-절차)
- [완료 판정과 검증 범위](#완료-판정과-검증-범위)

설정의 기준과 준비 순서는 이 문서에,
호스트별 명령은 [Nginx 구성](coordinator.md)과 [앱 A/B 구성](app-hosts.md)에 둔다.
명령은 **새 서버의 관리자와 운영 담당자가 수행할 절차**다. 문서 보완 과정에서는 서버에
실행하지 않았으며, 새 서버 전체 재구성과 실제 배포/롤백의 성공을 검증했다고 간주하지 않는다.

| 구성 상황 | 진행 범위 |
| --- | --- |
| 신규 환경, worker 권한 미할당 | 호스트 구성, A의 PAUSED 준비, Nginx 경로 확인 후 최초 worker 등록 |
| 동일 topology와 pin의 복구 | 보존된 상태와 실제 앱 boot/owner를 대조한 뒤 복구 판단. 복사만으로 재개하지 않음 |
| 기존 운영의 EC2 교체, 주소/instance ID/control pin 변경 | 새 호스트 준비까지 진행. 기존 저널과 DB 권한 이관은 [수동 조사](../recovery.md#수동-조사)에서 별도 판단 |

`coordinator.sh`의 plan은 기존 저널의 topology digest와 control SHA가 다르면 거부한다.
이 경우 저널 삭제, digest 수정이나 bootstrap 재실행으로 통과시키는 절차는 제공하지 않는다.

## 필수 설정

### 호스트와 네트워크

설치 전에 실제 instance ID, private IP, AWS 계정, VPC, 보안 그룹과 runner 라벨을 확인한다.
[coordinator 예시](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/controller/full-coordinator.example.json), [앱 A 예시](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/controller/full-app-A.example.json),
[앱 B 예시](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/controller/full-app-B.example.json)의 주소와 ID, SHA는 placeholder다.
A/B는 논리 슬롯이며 runner 표시 이름의 A/B와 같다고 가정하지 않는다.

| 위치 | 필요한 준비 |
| --- | --- |
| Nginx coordinator | Bash 5+, jq, curl, flock, 아래 coreutils 호환 옵션, Git, Docker Compose v2, AWS CLI v2와 전용 runner |
| 앱 A/B | Bash 5+, jq, curl, flock, 아래 coreutils 호환 옵션, Asia/Seoul tzdata, Git, OpenSSH, Docker Compose v2와 서로 다른 전용 runner |
| 관측 | 앱별 Alloy, Prometheus 읽기 경로와 정확한 environment/host_id |
| 통신 | Nginx에서 앱 private port, 앱에서 Nginx의 읽기 전용 SSH, 앱에서 RDS, GitHub/GHCR outbound |

앱 관리 포트와 Nginx probe는 host loopback으로만 게시한다. 앱 포트는 Nginx에서만
접근 가능하게 하고 공개 `/actuator`와 `/api/actuator`는 차단한다.
Nginx 이미지에는 curl, sh, tr, awk가 있어야 하며 실제 설치는 검증한 digest로 고정한다.

앱 호스트는 JVM 하나씩 실행한다. 두 앱이 함께 켜지는 기간의 DB 연결 예산은
`prod A 최대 + prod B 최대 + dev 최대 + 기타 연결과 운영 여유`로 계산한다.
Hikari 풀 외에 채팅 LISTEN 연결, 별도 worker 풀과 모니터링 연결도 포함한다.
미확인 최대값을 0으로 계산하지 않으며 실제 `max_connections`와 reserved connection을 대조한다.
두 앱은 같은 운영 DB, JWT 키와 인증 설정을 사용해야 한다.
스키마와 데이터 호환성은 [DB 변경 규칙](../../../../docs/database-changes.md)을 따른다.

### 보호된 설정과 권한

prod는 아래 경로의 환경 부분을 prod로 사용하고 dev 설정을 복사하지 않는다.

| 파일 또는 디렉터리 | 기준 |
| --- | --- |
| `/etc/jarihana-deploy/<env>/coordinator.json` | root 소유, 실제 topology, Nginx와 telemetry 설정 |
| 각 앱의 같은 경로 아래 `app-A.json` 또는 `app-B.json` | 해당 호스트의 local_slot, 포트와 파일 경로 |
| `app-compose.yml` | 고정 control tag의 [앱 템플릿](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/controller/app-compose.yml)과 byte 단위 일치 |
| `worker-token`, `grant-key`, `known-hosts` | 관리자 소유 비밀 파일과 검증한 Nginx host key |
| `/var/lib/jarihana-deploy/<env>/state.json` | coordinator 소유 0700 디렉터리, 저널 0600 |
| 각 앱의 `/var/lib/jarihana-deploy/<env>/app-A` 또는 `app-B` | 해당 runner 소유 0700, worker/stop intent와 잠금, 실행 기록 |

관리자 설정은 runner 전용 그룹에 읽기만 허용하고 config는 0640, 비밀 파일은 0640 이하로
설치한다. 앱 상태 디렉터리는 미리 생성하며 runtime이 자동 생성한다고 가정하지 않는다.
worker 토큰은 호스트마다 32바이트 이상이고 JWT/VAPID와 공유하지 않는다.
비밀값을 명령 인자, 환경 전체 출력, 로그나 artifact에 남기지 않는다.
Docker 접근 권한으로 컨테이너 환경을 읽을 수 있으므로 전용 runner를 신뢰한 배포에만 사용한다.

앱에서 coordinator로 연결하는 SSH는 `jarihana-grant` 계정의 한 환경 저널 읽기만 허용한다.
앱 private IP로 출발지를 제한하고 `restrict,command=...`로 고정한다.
root 소유 [허가 조회 helper](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/controller/read-deployment-grant.sh)의 환경을 literal 값으로 고정하고,
coordinator 사용자로 인자 없이 실행하는 최소 sudoers만 둔다. shell, 임의 sudo와 Docker 권한은 주지 않는다.
helper와 앱의 저널 읽기 한도는 4 MiB로 맞춘다.

coordinator의 EC2 역할은 DescribeInstances와 해당 환경의 A/B에 한정된 Start/Stop 권한을 갖춰야 한다.
S3는 버킷 조회와 공개/보관 prefix에 제한한 ListBucket, GetObject, PutObject를 확인한다.
CloudFront는 GetDistributionConfig, GetCachePolicy, GetFunction 읽기 권한을 사용한다.
새 장기 AWS 키를 추가하지 않으며 실제 IAM, 조직 정책과 EC2 dry-run은 별도로 확인한다.
AWS CLI 준비와 임시 파일은 `RUNNER_TEMP`의 디스크를 사용하고 대용량 메모리 파일시스템을 쓰지 않는다.

### GitHub 설정

| 범위 | 설정 |
| --- | --- |
| repository | `BLUE_GREEN_PROD_ENABLED`, `BLUE_GREEN_DEV_ENABLED`, `BLUE_GREEN_CONTROL_REF` |
| repository | `BLUE_GREEN_PROD_A_RUNNER`, `BLUE_GREEN_PROD_B_RUNNER` |
| runner | coordinator는 `jarihana-bluegreen-coordinator`, A/B는 각 호스트만 가진 서로 다른 라벨 |
| prod environment | `RDS_URL`, 기존 DB, JWT, OAuth, 푸시, S3 Variables/Secrets |

RDS_URL은 endpoint만 지정한다. Compose가 환경별 DB 이름과 TLS JDBC URL을 구성한다.
`BLUE_GREEN_RDS_URL` 프로세스 별칭도 같은 RDS_URL에서 전달하며 별도 DB를 고르지 않는다.
활성화 변수는 repository에서만 관리하고 environment에 같은 이름으로 중복 등록하지 않는다.
구성 중에는 두 활성화 변수를 false로 두고, control ref와 A/B runner 라벨부터 준비한다.
이 상태에서도 명시적인 최초 bootstrap은 허용된다. 완료 판정 후에만 prod deploy를 활성화한다.
운영 A/B와 전용 runner는 개발 환경과 구분한다. 공통 엔진은 dev/prod 동시 활성화를
거부하므로 운영 배포에서는 `BLUE_GREEN_PROD_ENABLED`만 활성화한다.

environment의 배포 branch 제한과 job별 승인 규칙이 허가 기한에 맞는지 확인한다.
control tag와 설치본을 맞추는 순서는 [재구성 절차](#재구성-절차)를 따른다.

## 구성 시작 전 준비

### 관리자 입력과 복원 원본

다음 표를 운영 권한자가 채운 뒤 설치를 시작한다. placeholder를 실제 값으로 추정하지 않는다.
비밀 원본의 위치는 접근이 제한된 인수 기록에 남기며 저장소나 PR에 값을 적지 않는다.

| 입력/보존 대상 | 확보 위치와 확인할 항목 |
| --- | --- |
| 호스트 목록 | EC2에서 Nginx/A/B instance ID, private IP, VPC, region, architecture와 host_id 확인 |
| 네트워크 | SG와 경로의 실제 규칙 확보. Nginx→앱 포트, 앱→Nginx 22, RDS/관측 gateway, GitHub/GHCR outbound를 각각 확인 |
| IAM | EC2 역할 원본과 조직 정책. DescribeInstances, A/B에 한정한 Start/Stop 및 S3/CloudFront 권한은 [보호된 설정](#보호된-설정과-권한) 기준 |
| control 원본 | 승인된 불변 tag와 40자리 commit SHA. GitHub 변수와 세 호스트의 topology에 동일 값 사용 |
| 수집기 원본 | 중앙 수집기와 helper를 포함한 별도 승인 commit. control tag에 수집기가 있다고 가정하지 않음 |
| 앱 비밀 설정 | 운영 담당자의 보호된 DB/JWT/OAuth/초대/푸시/이미지 키 원본. 실제 키 이름은 [앱 workflow](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/.github/workflows/backend-app-operation.yml)의 env와 대조 |
| DB 사전 준비 | RDS의 `jarihana_prod`와 접근 역할, TLS 및 migration 권한. 기존 스키마의 baseline을 임의로 바꾸지 않으며 [DB 변경 규칙](../../../../docs/database-changes.md)을 따름 |
| 상태와 키 | `/etc/jarihana-deploy/prod`, `/var/lib/jarihana-deploy/prod`의 저널, 앱별 intent와 실행 기록, worker-token, grant-key, known-hosts의 보호된 백업 |
| 프론트 원본 | S3 공개 prefix와 릴리스 원본, state.json/ETag, current/previous/pending manifest. S3와 로컬 coordinator 저널은 별개 |
| 관측 | 앱/중앙 수집기 env, Alloy 설정, 실제 WAL volume 이름과 데이터, 수집기의 traffic cursor. 소유자 UID/GID와 권한도 보존 |
| 외부 연결 | CloudFront origin과 ETag, Nginx host key 지문, Prometheus allowlist, GitHub runner/환경 보호 규칙 |

GitHub Secrets는 조회해서 평문을 복원하는 저장소가 아니다. 별도 보호 원본이 없으면 비밀값을
추정하거나 기존 값을 새 값으로 대체하지 말고 담당자에게 복원 원본을 확보한다.
아래 기본 경로는 이 절차가 정하는 배치 경로이며, 현재 조직의 백업 서비스 위치를 뜻하지 않는다.

신규 서버가 같은 prod를 대체하는지, 별도 환경인지 먼저 정한다. 기준 코드의 프론트엔드
버킷/prefix, 공개 URL과 Distribution은 `frontend.sh`의 prod 상수다. JSON의 주소만 바꿔
독립된 시험 환경을 만들 수 없다. 다른 리소스를 쓰는 환경은 제어 코드와 별도 릴리스를 먼저 검토한다.

### OS와 실행 도구

아래와 호스트 문서의 명령은 Linux/systemd와 Bash를 전제로 한다. 관리자 Bash에서 실행한다.
패키지 설치와 신규 OS 전체 동작은 미검증이며, 실제 OS/ARM64 지원을 확인한다.
먼저 기본 패키지를 준비한다.

```bash
# 새 Ubuntu 계열 서버의 기본 도구 예시. 기존 운영 호스트에 일괄 적용하지 않는다.
set -euo pipefail
test "$(id -u)" -eq 0
apt-get update
apt-get install --yes bash jq curl git openssh-client openssh-server \
  ca-certificates openssl tzdata util-linux coreutils sudo
bash --version
jq --version
flock --version
test -f /usr/share/zoneinfo/Asia/Seoul
timedatectl show -p NTPSynchronized -p Timezone
```

이어서 [공식 Ubuntu 설치 절차](https://docs.docker.com/engine/install/ubuntu/)에 따라 Docker Engine과
Compose plugin을 설치한다. distro 패키지와 공식 패키지를 섞지 않는다. Nginx에는 상시 수집기가
사용할 AWS CLI v2도 [공식 설치/서명 검증 절차](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html)로
준비하고 coordinator 계정의 PATH에서도 읽히게 한다. 앱에는 AWS CLI가 필수인 것은 아니다.

```bash
systemctl enable --now docker
docker version
docker compose version
# Nginx에서만 실행한다. workflow가 임시 준비하는 CLI 버전과 호스트 기본 CLI는 별개다.
aws --version
```

시간 동기화가 되지 않으면 허가 만료와 관찰 시각이 어긋나므로 다음 단계로 진행하지 않는다.
GNU 구현체로 한정하지 않는다. 기존 설치본에는 uutils 구현체도 있다. 필요한 것은
`stat -Lc`, `date +%s`와 `date -d`, `head -c`, `sha256sum`, `timeout`, `sync -f`와 원자적 rename 등의
코드 사용 옵션이다. 기존 서버의 일부 옵션 대조가 새 OS의 전체 호환성을 증명하지 않는다.
새 서버에서 [검증](../verification.md)의 관련 계약 검사를 수행한다.

### 고정 제어 릴리스 준비

Nginx와 앱 A/B에서 각각 관리자 Bash로 준비한다. 아래 변수는 같은 Bash 세션에서 후속
호스트 문서까지 유지한다. tag 이름이나 SHA가 비어 있거나 다르면 설치를 중단한다.

```bash
read -r -p '승인 control ref (refs/tags/deployment-control-...): ' CONTROL_REF
read -r -p '승인 commit SHA: ' CONTROL_SHA
[[ $CONTROL_REF =~ ^refs/tags/deployment-control-[A-Za-z0-9._-]+$ ]]
[[ $CONTROL_SHA =~ ^[a-f0-9]{40}$ ]]
CONTROL_DIR="/opt/jarihana-prod-deploy/releases/$CONTROL_SHA"
install -d -o root -g root -m 0755 /opt/jarihana-prod-deploy/releases
test ! -e "$CONTROL_DIR"
git init "$CONTROL_DIR"
git -C "$CONTROL_DIR" remote add origin https://github.com/woowacourse-teams/2026-jarihana.git
git -C "$CONTROL_DIR" fetch --depth=1 origin "$CONTROL_REF"
test "$(git -C "$CONTROL_DIR" rev-parse 'FETCH_HEAD^{commit}')" = "$CONTROL_SHA"
git -C "$CONTROL_DIR" checkout --detach "$CONTROL_SHA"
test -f "$CONTROL_DIR/infra/blue-green-deploy/scripts/actions/coordinator.sh"
```

각 블록은 `set -e`가 활성화된 관리자 Bash에서 실행하고 검사가 실패하면 다음 블록으로
진행하지 않는다. 이미 있는 릴리스는 덮어쓰지 말고 HEAD와 파일 해시를 대조한다.
`.git`을 제거한 소스 복사본은 실행 시 control SHA 검증을 통과하지 못한다.

### runner 등록과 부팅 설정

호스트 문서가 지정하는 계정과 디렉터리를 먼저 만든다. 저장소 Settings → Actions → Runners →
New self-hosted runner에서 해당 OS/architecture의 패키지, 버전과 checksum을 확인해 내려받는다.
등록은 [GitHub 공식 절차](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/add-runners)를
따르며 해당 서비스 계정에서 `config.sh`를 실행한다. root 실행 허용 변수를 사용하지 않는다.

| 호스트 | 계정 | 예시 설치 경로 | 전용 라벨 |
| --- | --- | --- | --- |
| Nginx | jarihana-coordinator | /opt/jarihana-coordinator-runner | jarihana-bluegreen-coordinator |
| A | jarihana-runner | /opt/jarihana-prod-actions-runner | BLUE_GREEN_PROD_A_RUNNER에 설정한 고유 라벨 |
| B | jarihana-runner | /opt/jarihana-prod-actions-runner | BLUE_GREEN_PROD_B_RUNNER에 설정한 고유 라벨 |

서비스 계정으로 `./config.sh --url https://github.com/woowacourse-teams/2026-jarihana --name <고유이름> --no-default-labels --labels <전용라벨>`을
실행하고 등록 토큰은 대화형 프롬프트에 입력한다. 토큰을 명령 인자나 저장소 파일에 넣지 않는다.
이후 관리자가 runner 디렉터리에서 `./svc.sh install <서비스계정>`, `./svc.sh start`, `./svc.sh status`를
실행한다. [서비스 설정 원본](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/configure-the-application)을 따른다.
전용 라벨만 등록해 일반 self-hosted job의 대상이 되지 않게 하고, 허용 workflow/branch 범위도 대조한다.
GitHub의 runner ID/라벨과 실제 서버를 대응시키고, 같은 라벨을 교체 전후 두 호스트에 동시에 주지 않는다.
등록 파일, `.credentials`나 `_work` 전체를 다른 서버에 복제하지 않는다.

### Nginx와 CloudFront

`current.conf`는 확인된 활성 앱의 실제 upstream을 가리켜야 한다.
[Nginx Compose](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/nginx/docker-compose.yml)로 시작한다. 설정 디렉터리는 read-only로 mount하고
container 이름과 probe port를 coordinator 설정에 맞춘다. probe는 실제 앱 API를 경유한다.

CloudFront API behavior의 origin은 Nginx의 현재 public DNS와 host 공개 listener 포트다.
`/api/*`의 메서드, 캐시, 쿠키와 Authorization 전달, 정적 S3와 이미지 behavior를 보존한다.
HTTPS viewer 정책, CloudFront origin 접근 제한과 보안 그룹 전체 허용 규칙을 함께 검토한다.
서버 교체 시 public DNS와 origin, 같은 origin을 참조하는 다른 경로도 확인한다.
반복 배포에서는 CloudFront origin을 바꾸지 않는다.

## 프론트엔드 사전 준비

원본과 상태 저장 방식, 게시 순서는 [프론트엔드 릴리스](../architecture.md#프론트엔드-릴리스)를 따른다.

### 사전 검사와 최초 baseline

제어 릴리스는 `FE_RELEASE_CAPABILITY=3`을 지원해야 한다. coordinator는 공식 AWS CLI
2.38.5를 고정 해시로 검증해 RUNNER_TEMP에 준비하고 job 뒤 정리한다.
저널 디스크에 최소 2 GiB 여유를 확인한다. 원본은 1,000개 이하, 파일당 64 MiB 이하,
합계 512 MiB 이하이며 빈 파일, symlink와 특수 파일은 거부한다.
index.html, sw.js, manifest.webmanifest, assets와 HTML이 참조하는 로컬 JavaScript가 필요하다.

최초 plan은 live 파일을 baseline으로 보관한다. 재구성 시에는 기존 원본과 state.json을 보존하고,
current manifest와 live가 일치하는지 확인한다. 미완료 pending이나 해시 불일치는
[수동 조사](../recovery.md#수동-조사)로 해결한다. 조회 성공만으로 쓰기 권한이 검증되지는 않는다.

### CloudFront 조건

| 항목 | 게시 전에 확인할 조건 |
| --- | --- |
| Distribution | `E1YDHL1SDC4C1C` |
| 기본 origin | `techcourse-project-2026` S3의 `/jarihana/frontend` |
| cache policy | Managed-CachingDisabled, `4135ea2d-6df8-44a3-9df3-4b5a84be39ad`, 최소/기본/최대 TTL 0 |
| 다른 경로 | API Nginx origin과 별도 이미지 origin 및 behavior 유지 |

기본 behavior의 viewer-request 함수는 없거나, 제어 코드가 승인한 `jarihana-group-share-preview`
하나여야 한다. LIVE 코드 해시는 [프론트 제어 코드](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/scripts/actions/frontend.sh)의 preflight와
대조한다. Lambda@Edge, 다른 함수나 코드 변경, 읽기 실패는 게시 전 차단한다.
함수를 변경하면 동작 검토와 승인 해시, 제어 릴리스를 함께 갱신한다.
캐시 조건이 달라지면 변경이나 invalidation으로 우회하지 않고 게시 및 복구 계약을 재검토한다.

## 앱 Alloy와 조회 경로

[독립 Alloy Compose](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/blue-green-deploy/controller/observability-compose.yml)에서 공통 [config.alloy](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/monitoring/alloy/config.alloy)와
[postgres-queries.yaml](https://github.com/woowacourse-teams/2026-jarihana/blob/2f2cc2cc91ea7216acb677b9f89c16b1cce398dd/infra/monitoring/alloy/postgres-queries.yaml)을 사용한다.
HOST_ID는 앱 host_id와 일치해야 하고 APP_METRICS_TARGET은 실제 loopback 관리 포트다.
앱 호스트 기동 시 Alloy도 자동 시작돼야 한다. 앱 scrape만 있는 임시 설정으로 대체하지 않는다.

보호된 env에는 DEPLOY_ENVIRONMENT, DEPLOY_HOST_ID, PROMETHEUS_REMOTE_WRITE_URL,
LOKI_PUSH_URL, POSTGRES_MONITOR_DSN, ALLOY_CONFIG_FILE, POSTGRES_QUERIES_FILE과
기존 WAL 볼륨명 ALLOY_STORAGE_VOLUME을 지정한다. MANAGEMENT_PORT 기본값은 8081이며
별도 앱 설정과 자동 동기화되지 않는다. 외부 WAL 볼륨은 사전에 만들고 교체 시 보존한다.
같은 host_id를 두 수집기가 중복 전송하지 않게 하고 backend Compose와 프로젝트를 분리한다.
실제 mount로 활성 WAL 볼륨을 확인해 보존한다. 공통 설정을 바꾸면
각 호스트의 독립 Alloy에 별도로 적용하고 중지된 EC2도 다음 기동의 설정을 확인한다.
앱 Alloy 설치본은 모니터링 workflow만으로 자동 갱신되지 않는다.

원본 배치, env 작성, 신규 volume과 복원 volume의 분기, validate와 기동 명령은
[앱 호스트의 Alloy 구성](app-hosts.md#앱-alloy)에 둔다.

관리 주소는 loopback 12345다. 구성 후 앱, DB와 호스트 지표 및 Loki 로그 도착을 확인한다.
최신성과 활성 앱 판정은 [상태 확인](../status.md)을 따른다.

Prometheus 9090은 loopback으로 두고 coordinator는 private gateway 8080의
`/prometheus/api/v1/query`만 사용한다. coordinator private IP의 정확한 allowlist와 보안 그룹을
확인하며 query_range, 관리 API나 다른 경로를 열지 않는다. coordinator 교체 시 allowlist도 갱신한다.
조회 URL 형식은 `http://<monitoring-private-IP>:8080/prometheus`다.

Nginx 서버의 중앙 수집기는 별도 설치 단위다. 실행 계정, timer와 prod drop-in,
전용 Alloy 및 WAL은 [중앙 배포 수집기 운영](../../../docs/observability/CENTRAL-DEPLOYMENT-COLLECTOR.md)을 따른다.

## 재구성 절차

1. 새 배포를 막고 대기 실행을 정리한 뒤 진행 중인 배포, guardian과 watchdog oneshot이 없는지 확인한다.
   기존 운영 환경에서 이 조치를 하는 것은 별도 변경 작업이다. 새 서버의 명령을 기존 호스트에 실행하지 않는다.
   실제 HTTP 대상, 앱 digest와 DB owner를 확인하고 보호된 설정, 저널, intent,
   S3 원본과 state/ETag, CloudFront 설정/ETag 및 활성 WAL을 보존한다.
2. 검증한 `refs/tags/deployment-control-*`와 SHA를 정한다. BLUE_GREEN_CONTROL_REF,
   Nginx/A/B의 topology.control.ref/sha, 설치 Compose와 watchdog checkout을 같은 release로 맞춘다.
   부모 workflow, 앱 이미지와 control checkout은 각각 대조하고 기존 태그는 이동하지 않는다.
3. [구성 시작 전 준비](#구성-시작-전-준비)를 마치고 [Nginx](coordinator.md),
   [앱 A/B](app-hosts.md)를 각각 구성한다. 교체 호스트의 instance ID, 주소, runner, local_slot,
   known-hosts와 SSH 출발지, 보안 그룹 및 Prometheus allowlist를 실제 호스트와 맞춘다.
4. 확인된 활성 앱을 가리키도록 Nginx를 구성하고 앱 Alloy를 준비한다.
   CloudFront를 변경했다면 Deployed 상태가 된 뒤 공개 도메인의 요청 경로를 확인한다.
5. worker 권한이 처음부터 미할당인 환경만 [최초 worker 등록](#최초-worker-등록)을 수행한다.
   기존 owner가 있는 환경에서는 bootstrap을 반복하지 않는다.
6. [검증 가이드](../verification.md)의 관련 검증과 [상태 확인](../status.md)을 수행한다.
   실제 인증, 쓰기, 이미지, 채팅과 푸시를 확인한 뒤 [배포 실행](../deployment.md)을 재개한다.

완료 저널도 control SHA와 topology digest에 묶여 있다. pin 변경이나 저널 복사만으로
새 구성을 자동 채택하지 않는다. 미해결 intent, ATTENTION, cleanup_deferred 또는 실제 상태와의
불일치가 있으면 [수동 조사](../recovery.md#수동-조사)를 먼저 수행한다.
저널의 control SHA와 topology를 직접 바꾸거나 SQL로 처리 권한을 초기화하지 않는다.
기존 owner가 남았거나 새 instance ID로 topology가 달라진 경우는 여기서 멈춘다.
저장소에는 이를 새 topology로 자동 이관하는 명령이 없다. 보존 원본과 실제 boot/owner를
근거로 [수동 조사](../recovery.md#수동-조사)에서 이관안을 별도로 판단해야 한다.

### 최초 worker 등록

1. 기존 worker의 신규 선점을 막고 진행 발송과 DB commit을 마친 뒤 정상 종료한다.
   관리 API의 부재나 응답 거부를 작업 종료의 증거로 삼지 않는다. 기존 앱 교체 시 중단 가능성을 확인한다.
2. 승인 digest의 앱 A가 READY/PAUSED, inFlight/unresolved 0, HTTP/background drained인지 확인한다.
   DB 권한은 null 또는 owner 없는 UNASSIGNED, Nginx 대상은 A, B EC2는 stopped여야 한다.
   정상 종료 증거가 없는 기존 컨테이너는 별도 확인하고 정리한다.
3. main의 Production Release에서 `blue_green_mode=bootstrap`과 현재 A 이미지의 40자리 SHA를 지정한다.
   bootstrap은 앱 설치나 기존 worker 종료를 대신하지 않는다.
4. ACTIVE owner와 실제 서비스 및 관측을 확인한 뒤 운영 deploy를 활성화한다.
   최초 교대와 역방향 교대, 관찰, 정상 종료와 EC2 중지는 실제 환경에서 검증한다.

## 완료 판정과 검증 범위

| 항목 | 기존 환경/코드에서 확인한 범위 | 새 서버에서 완료해야 할 검사 |
| --- | --- | --- |
| 제어기와 보호 설정 | Nginx와 활성 A의 pin, 파일 원본, 소유권과 주요 옵션을 읽기 대조 | A/B/Nginx 모두 실제 SHA, config, runner ID/라벨과 권한 대조 |
| 네트워크와 IAM | 기존 경로 일부의 읽기 성공 | 새 IP/SG/역할과 조직 정책, RDS TLS, gateway allowlist 검증. Describe 성공만으로 Start/Stop 쓰기 권한을 확정하지 않음 |
| 앱과 허가 조회 | 활성 A의 readiness/worker와 runner SSH 읽기 확인 | 양쪽 앱에서 승인 digest, PAUSED/권한 상태, SSH 강제 명령과 관리 포트 제한 확인 |
| 관측 | 기존 A와 중앙 수집기 설정/수신 확인 | 새 host_id의 앱/DB/호스트 지표와 로그, 수집기 source와 관측 최신성, 부팅 후 자동 시작 확인 |
| 보존 데이터 | 보존해야 할 경로와 코드의 거부 조건 확인 | 실제 보호 백업에서 복원, WAL/저널/intent/ETag 보존 및 이관 적합성 검증 |
| 전체 구성 | 아래 호스트별 수동 절차는 새로 문서화, 빈 호스트 실행 미검증 | 처음부터 설치해 최초 등록, 양방향 배포, 공동/단독 배포, 롤백/취소 및 정상 종료를 실제 검증 |

중지된 B의 현재 내부 설정과 A/B 인증값 동일성은 기존 읽기 점검에서 확인하지 못했다.
명령의 구문 검사나 기존 서버와 원본의 일치는 새 서버 설치 성공을 뜻하지 않는다.
위 검사에서 미확인인 항목이 있으면 재구성 완료로 표시하지 않고, 작업 시각과 환경, 결과를
접근이 제한된 운영 기록에 남긴다. 일회성 실행 로그와 비밀값을 이 문서에 누적하지 않는다.
