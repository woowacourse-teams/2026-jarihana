# prod 중앙 배포 수집기

이 문서는 2026-10-28 AWS Session Manager의 읽기 전용 조회로 확인한 운영 설치본을 설명한다.
앱 A/B의 공통 `config.alloy`, 모니터링 EC2의 `monitoring.alloy`와 별개로 배포 Nginx EC2에
중앙 배포 수집기와 전용 Alloy가 있다. 앱 호스트용
[observability-compose.yml](../../deploy/controller/observability-compose.yml)로 설치하는 대상이 아니다.

## 수집 경로와 실제 설치 위치

```text
배포 Nginx EC2의 systemd timer
  -> collect.sh -> deployment.prom -> 같은 EC2의 textfile 전용 Alloy
  -> 모니터링 EC2의 사설 Nginx :8080 -> Prometheus -> Grafana prod health 규칙
```

| 구성 | 확인한 운영 설치본 |
| --- | --- |
| timer/service | `/etc/systemd/system/jarihana-observability@.timer`, `jarihana-observability@.service`, prod 인스턴스 사용 |
| 실행 | `User=jarihana-coordinator`, `Type=oneshot`, `TimeoutStartSec=110`, `/opt/jarihana-observability/infra/monitoring/deployment/collect.sh %i` |
| 입력 | `/etc/jarihana-deploy/prod/coordinator.json`, `/var/lib/jarihana-deploy/prod/state.json`, 로컬 Nginx probe, EC2 상태/트래픽 관측 |
| 출력 | `/var/lib/jarihana-observability/prod/textfile/deployment.prom` |
| 전용 Compose/Alloy 설정 | `/opt/jarihana-observability/infra/monitoring/deployment/docker-compose.yml`, 같은 디렉터리의 `config.alloy` |
| Alloy | `grafana/alloy:v1.20.1`, 컨테이너 `jarihana-observability-prod-alloy-1`, 실제 관리 주소 `127.0.0.1:12347` |
| 데이터 | prod textfile 디렉터리 read-only 마운트, `jarihana-observability-prod_alloy-data`에 Alloy 상태 저장 |
| 전송 | `http://10.0.0.137:8080/prometheus/api/v1/write` |

컨테이너 이름은 prod2 앱 Alloy와 같지만 **서로 다른 EC2의 별도 컨테이너**다.
호스트와 마운트된 설정을 함께 확인해 대상을 구분한다.

timer는 `OnBootSec=5s`, `OnUnitInactiveSec=5s`, `AccuracySec=1s`다. 이전 실행이 끝난 뒤
5초를 기다리므로 실제 관측 간격에는 스크립트 실행 시간이 더해진다. 정확히 5초마다 실행된다는
보장은 없다. 조회 당시 timer는 active/waiting, service는 inactive/dead, 종료 결과는 성공이었다.
이 service 상태는 oneshot 실행 완료 후의 정상 대기 상태다.

전용 Alloy는 unix exporter의 textfile collector만 사용하고, 출력 파일을 `5s` 간격,
`4s` timeout으로 scrape한 뒤 remote write한다. 중앙 Alloy가 최신 scrape를 계속 보내더라도
파일의 내용이 오래됐을 수 있으므로 알림은 파일 안의 관측 시각도 검사한다.

## Nginx 경로 판별과 prod health 계약

수집기는 설정된 로컬 probe 포트의 `/__deployment`를 호출한다. `X-Jarihana-Slot`,
`X-Jarihana-Target`, 실제 `X-Jarihana-Upstream`이 설정과 일치하는지, 응답 JSON이
`success=true`인지 검사한다. 정상 관측이면 A/B의 `jarihana_nginx_route`는 선택된 슬롯이
`1`, 다른 슬롯이 `0`이다. 관측 실패는 `-1`이다. 두 앱이 drain 동안 모두 정상이어도
실제 활성 경로는 하나다. 두 route가 모두 `1`인 상태를 정상 전환으로 취급하지 않는다.

스크립트는 같은 디렉터리의 임시 파일에 한 번의 수집 결과를 완성한 뒤 rename으로
`deployment.prom`을 교체한다. A/B 일부만 갱신된 파일을 읽지 않도록 하는 장치이며,
Prometheus 전송 전체나 Grafana 평가 전체의 원자성을 보장한다는 뜻은 아니다.

[prod health 규칙](../../monitoring/grafana/provisioning/alerting/rules.yaml)은 다음을 결합한다.

- Nginx 관측에 성공하고, 유효한 활성 `host_id`가 정확히 하나여야 한다.
- route 샘플, collector의 실행 시각/샘플, Nginx source의 성공/관측 시각/샘플은 45초 이내여야 한다.
- 그 활성 호스트의 앱 Alloy health 결과는 150초 이내이며 정상이어야 한다.
- 활성 경로가 없거나 여러 개, 관측 실패, 오래된 파일, 활성 앱 health 실패/누락이면 알린다.
  대기 호스트만 중지됐거나 drain 중 두 앱이 모두 정상이면 활성 경로를 기준으로 평가한다.

여기서 사용하는 source는 `source="nginx"`다. 다른 source까지 모두 정상이라는 의미는 아니다.
실제 조회한 `nginx_drain` source 값은 `0`이었으며 prod health 규칙의 의존 대상과 구분한다.

## 읽기 전용 확인

Nginx 호스트에서 다음 상태와 파일 시각을 확인한다. 출력 파일에는 호스트 정보가 있으므로
공개 로그에 그대로 붙이지 않는다. 설정 파일과 컨테이너 환경의 비밀값을 출력하지 않는다.

```bash
systemctl status jarihana-observability@prod.timer jarihana-observability@prod.service --no-pager
stat /var/lib/jarihana-observability/prod/textfile/deployment.prom
docker ps --filter name=jarihana-observability-prod-alloy-1
curl --fail http://127.0.0.1:12347/-/ready
```

Prometheus에서 다음을 조회하고, route 값과 `host_id`, `source="nginx"`의 성공 및 관측 시각,
활성 앱 `probe_success{job="jarihana-health",environment="prod"}`를 함께 확인한다.

```promql
jarihana_nginx_route{environment="prod"}
time() - jarihana_deployment_collector_timestamp_seconds{environment="prod"}
jarihana_deployment_source_success{environment="prod",source="nginx"}
time() - jarihana_deployment_source_observed_timestamp_seconds{environment="prod",source="nginx"}
```

2026-10-28 조회 당시 textfile과 Prometheus 모두 A=`0`, B=`1`, Nginx source 성공=`1`이었다.
collector age는 약 8.8초로 45초 기준 이내였다. 실제 수신 라벨은 `job="integrations/unix"`,
`instance="704999df0d2c"`였다. 설정의 scrape job 이름만 보고 수신 라벨을 단정하지 않는다.
`jarihana_nginx_active_slot=2`는 슬롯 B를 뜻하며 활성 호스트가 두 개라는 뜻은 아니다.

## 재설치 원본과 검증 공백

**이 설치본의 `collect.sh`, 전용 Compose/Alloy 설정, systemd unit과 설치 절차는 현재 저장소에
포함되지 않는다.** 모니터링 배포 workflow나 앱 Alloy Compose만 적용해서 중앙 수집기를
재설치할 수 없다. 운영 prod health의 필수 의존성이므로 서버 교체/복구 전에 검토 가능한 원본과
버전, 설치/권한/부팅 절차를 확보해 형상 관리해야 한다. 이 문서의 경로는 설치 명령의 대체물이 아니다.

이번 확인은 현재 상태의 조회다. 실제 A/B 전환, 중앙 수집기 재시작, 네트워크 장애 주입은 하지
않았으며, PR의 새 health 식이 운영에 적용됐다는 검증도 포함하지 않는다.
