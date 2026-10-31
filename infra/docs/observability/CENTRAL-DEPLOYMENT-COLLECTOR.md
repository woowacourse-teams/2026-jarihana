# 중앙 배포 수집기 운영

배포 Nginx EC2의 중앙 수집기는 배포 저널, 실제 요청 경로, EC2와 완료 요청 수를 관측한다.
배포 단계 실행과 Nginx 전환, worker 제어는 [배포 제어기](../../blue-green-deploy/controller/architecture.md)가 담당한다.
앱 A/B의 Alloy 구성은 [배포 환경 구성](../../blue-green-deploy/controller/environment.md#앱-alloy와-조회-경로)을 따른다.

## 수집 경로와 구성

```text
Nginx EC2의 systemd timer
  -> collect.sh -> deployment.prom
  -> 같은 EC2의 textfile 전용 Alloy
  -> 모니터링 EC2의 사설 Nginx -> Prometheus -> Grafana
```

이 수집기는 앱 A/B의 전체 앱 Alloy, 모니터링 EC2의 호스트 Alloy와 별도다.
배포 설정과 저널, Nginx와 EC2는 읽기만 하고 관측 결과와 요청 수 cursor는 수집기 전용 디렉터리에 기록한다.
수집 성공이 배포 성공을 승인하거나 복구를 실행하지는 않는다.
한 번의 수집 결과는 같은 디렉터리의 임시 파일에서 완성한 뒤 rename으로 교체한다.
이 경계는 일부만 갱신된 파일을 읽는 일을 막지만 Prometheus 전송과 Grafana 평가 전체의 원자성을 뜻하지 않는다.

| 구성 | 운영 경로와 계약 |
| --- | --- |
| timer/service | `jarihana-observability@prod.timer`, `jarihana-observability@prod.service` |
| 기본 unit | `/etc/systemd/system/jarihana-observability@.timer`, `jarihana-observability@.service` |
| prod timer override | `/etc/systemd/system/jarihana-observability@prod.timer.d/30-second-interval.conf` |
| 실행 | `jarihana-coordinator` 계정, `collect.sh prod`, oneshot, 제한 시간 110초 |
| 수집기 설치 파일 | `/opt/jarihana-observability/infra/monitoring/deployment/`의 `collect.sh`, `journal.sh`, `traffic.sh` |
| 공통 helper 복사본 | `/opt/jarihana-observability/infra/scripts/deploy/actions/{common,cloud,nginx}.sh` |
| 입력 | `/etc/jarihana-deploy/prod/coordinator.json`, `/var/lib/jarihana-deploy/prod/state.json`, 로컬 Nginx probe와 access log |
| 출력 | `/var/lib/jarihana-observability/prod/textfile/deployment.prom` |
| Alloy 설정과 Compose | 수집기 설치 디렉터리의 `config.alloy`, `docker-compose.yml`, `prod.env` |
| Alloy 컨테이너 | `jarihana-observability-prod-alloy-1`, `grafana/alloy:v1.20.1`, `restart: unless-stopped` |
| 관리 주소 | 호스트 loopback `127.0.0.1:12347`에서 컨테이너의 12345로 연결 |
| WAL | `jarihana-observability-prod_alloy-data` named volume을 `/var/lib/alloy/data`에 mount |

Alloy는 textfile collector만 활성화한다. 설정과 prod textfile 디렉터리는 read-only mount이며
Docker socket은 mount하지 않는다. 전송 대상은 `PROMETHEUS_REMOTE_WRITE_URL`로 지정한
사설 monitoring gateway의 `/prometheus/api/v1/write`다. 공개 Grafana 주소를 전송 대상으로 사용하지 않는다.

컨테이너 이름만으로 호스트를 식별하지 않는다. 다른 EC2에 같은 이름의 컨테이너가 있을 수 있으므로
접속한 호스트와 config, textfile, WAL의 실제 mount를 함께 확인한다.

## 실행 주기와 권한

기본 timer 파일의 `OnUnitInactiveSec=5s` 위에 prod 전용 drop-in이 적용된다.
drop-in은 기존 `OnUnitInactiveSec` 값을 비운 뒤 `30s`를 지정한다.
기본 unit 파일만 읽고 운영 수집 주기를 5초로 판단하지 않는다.

| 설정 | 값과 의미 |
| --- | --- |
| `OnBootSec` | 부팅 후 5초 |
| prod의 `OnUnitInactiveSec` | 직전 수집이 끝난 뒤 30초 대기 |
| `AccuracySec` | 1초 |
| Alloy scrape | 5초 간격, timeout 4초 |

실제 수집 간격에는 스크립트 실행 시간이 더해진다. Alloy가 5초마다 파일을 읽어도
파일 내용이 5초마다 갱신되는 것은 아니다. timer의 active/waiting과 oneshot service의
inactive/dead, 종료 코드 0은 실행 사이의 정상 대기 상태일 수 있다.
서비스 종료 결과와 다음 실행, 파일 안의 관측 시각을 함께 확인한다.

수집기 전용 prod 디렉터리는 `jarihana-coordinator` 소유 0750,
textfile 디렉터리는 0755, 출력 파일은 0644다. `prod.env`는 root 소유 0600으로 유지한다.
실행 계정에는 보호된 coordinator 설정과 저널 읽기, 필요한 Docker 조회와
EC2 DescribeInstances, 사설 monitoring gateway 접근이 필요하다.

## 관측값 해석

- A/B와 host_id, instance_id의 매핑은 검증한 coordinator topology에서 가져온다.
- Nginx 경로는 로컬 `/__deployment`의 슬롯, 예상 upstream, 실제 upstream과 API 성공 응답을 함께 검사한다.
  저널의 전환 의도나 양쪽 앱의 healthy 상태만으로 활성 경로를 정하지 않는다.
- `jarihana_nginx_active_slot`은 A=1, B=2, unknown=-1이다.
  `jarihana_nginx_route`는 선택된 슬롯이 1, 다른 슬롯이 0, 관측 실패는 -1이다.
- phase는 idle=0, PREPARING=1, HANDOFF=2, SWITCHING=3, OBSERVING=4, SEALED=5,
  COMPLETE=6, ROLLING_BACK=7, ROLLED_BACK=8, NEEDS_ATTENTION=9이며 검증 실패는 -1이다.
  `lease_valid`는 phase와 별도로 해석한다.
  진행 중인 배포의 lease가 유효하지 않으면 phase=-1이다. COMPLETE, ROLLED_BACK과 NEEDS_ATTENTION은
  오래된 heartbeat 때문에 phase를 unknown으로 덮어쓰지 않는다.
- `old_workers_drained`는 같은 Nginx 컨테이너와 generation에서 이전 PID/starttick이 사라져야 1이다.
  이전 worker가 있으면 0, ticket 부재나 재시작 등으로 판단할 수 없으면 -1이다.
- 완료 요청 수는 실제 upstream access log를 누적하며 `/__deployment` probe는 제외한다.
  컨테이너나 A/B 매핑이 바뀌면 counter가 초기화될 수 있다. 로그 유실 구간의 전체 요청 수를 보장하지 않는다.
  파싱 실패나 처리 상한 초과를 요청 수 0으로 해석하지 않는다.

`jarihana_deployment_collector_timestamp_seconds`는 실제 수집 시작 시각이다.
오래된 textfile을 Alloy가 계속 읽으면 scrape 시각만 새로워질 수 있다.
`source_success`와 성공 때만 갱신되는 `source_observed_timestamp_seconds`도 함께 본다.
config, journal, nginx, ec2_A/B, nginx_drain과 traffic은 독립된 source다.
한 source의 성공을 전체 수집 성공으로 해석하지 않는다.

설치된 `journal.sh`는 old와 target이 서로 다른 A/B인 저널을 검증한다.
프론트엔드 단독 배포의 `old==target` 저널은 phase와 lease가 unknown이 될 수 있다.
이 경우 실제 API 경로와 프론트 상태를 [상태 확인](../../blue-green-deploy/controller/status.md)에서 별도로 대조한다.
이 문서 변경은 수집기의 저널 검증 동작을 바꾸지 않는다.

## 읽기 전용 확인

아래 명령은 배포 Nginx 호스트에서 실행한다. 보호 파일과 컨테이너 환경 전체를 출력하지 않는다.

```sh
systemctl cat --no-pager jarihana-observability@prod.timer
systemctl show --no-pager jarihana-observability@prod.timer \
  -p ActiveState -p UnitFileState -p DropInPaths -p TimersMonotonic
systemctl show --no-pager jarihana-observability@prod.service \
  -p User -p Group -p ExecStart -p TimeoutStartUSec -p ExecMainStatus
stat /var/lib/jarihana-observability/prod/textfile/deployment.prom
docker inspect --format '{{.Config.Image}} {{.State.Running}}' \
  jarihana-observability-prod-alloy-1
docker inspect --format '{{range .Mounts}}{{println .Type .Source .Destination .RW}}{{end}}' \
  jarihana-observability-prod-alloy-1
curl --fail http://127.0.0.1:12347/-/ready
```

필요한 파일 조회와 Docker 접근은 해당 서버의 허용된 관리자 권한으로 수행한다.
Prometheus에서는 다음 지표를 실제 경로와 앱 health에 대조한다.

```promql
jarihana_nginx_route{environment="prod"}
time() - jarihana_deployment_collector_timestamp_seconds{environment="prod"}
jarihana_deployment_source_success{environment="prod",source="nginx"}
time() - jarihana_deployment_source_observed_timestamp_seconds{environment="prod",source="nginx"}
```

화면과 알림의 유효 시간은 [관측 최신성](../../blue-green-deploy/controller/status.md#관측-최신성)을 따른다.
위 실행 주기와 소비자의 유효 시간은 서로 다른 설정이다.
수신된 job/instance 라벨은 실제 series로 확인하며 scrape 설정의 job_name만으로 단정하지 않는다.

## 재구성과 갱신의 경계

중앙 수집기는 앱 Alloy Compose나 Monitoring Deploy만으로 복원되지 않는다.
재구성하려면 수집 스크립트, 실제 참조 경로의 helper, 전용 Compose/Alloy와 env,
기본 service/timer와 prod drop-in을 검토한 설치 원본으로 함께 준비해야 한다.
운영 복사본의 helper 경로는 현재 배포 제어 패키지의 저장소 경로와 다르므로 경로를 함께 대조한다.
패키지 경로 변경이나 Git 병합만으로 기존 서버의 복사본이 갱신되지는 않는다.

기존 설치 버전, 파일 소유권과 읽기 권한, DescribeInstances 권한, 사설 gateway 연결,
부팅 시 시작 설정과 WAL mount를 확인한다. timer 기본값과 prod override를 함께 복원하고,
활성 WAL을 새 빈 볼륨으로 바꾸거나 다른 호스트의 textfile을 읽게 만들지 않는다.
원본과 배포 저널, 수집기 전용 상태 및 WAL을 보존한 뒤 수집기만의 갱신 범위를 검토한다.
상태가 불확실하면 [수동 조사](../../blue-green-deploy/controller/recovery.md#수동-조사)를 따른다.
