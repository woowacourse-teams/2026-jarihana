# Grafana Slack 장애 알림

Grafana는 시작할 때 마운트된 provisioning 파일을 읽어 health·HTTP 500·호스트 자원 알림 정의 12개, Slack 연락처,
메시지 템플릿과 전달 정책을 등록한다. 이후 시작할 때도 파일 설정을 다시 적용하며 변경은 UI가 아닌 파일에서
관리한다. Prometheus·Loki 데이터 소스도 기존 파일 provisioning을 유지한다.
실제 AWS 배포와 Slack 전송은 수행하지 않았다.

## 설정 파일과 비밀값

[contact-points.yaml](../../monitoring/grafana/provisioning/alerting/contact-points.yaml)은
조직 1에 이름·receiver UID가 모두 `jarihana-slack`인 Slack 연락처를 등록한다.
`disableResolveMessage: false`로 조건 해제 시 해제 알림도 전달한다. 해제는 정상 복구뿐 아니라
주의에서 긴급으로 전환되거나 지표가 사라진 경우에도 발생하므로 아래 조건 설명과 함께 판단한다.

Slack 앱의 Incoming Webhook을 활성화하고 알림을 받을 채널에 연결된 URL을 발급한다.
이 방식에서는 별도의 Bot OAuth token을 입력하지 않는다. 연락처 하나는 Webhook에 연결된
채널 하나를 사용한다. 채널을 바꾸려면 해당 채널의 Webhook을 준비한다.
[Grafana Slack 연동 문서](https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/configure-slack/)

Webhook은 저장소 Settings → Secrets and variables → Actions의 repository secret `SLACK_WEBHOOK_URL`로 저장한다.
모니터링 서버 자동 배포 workflow가 이 값을 shell 환경변수로 주입하고 `--env-file /dev/null`로
Compose를 실행하므로 EC2에 `.env` 파일을 둘 필요는 없다. [.env.example](../../monitoring/.env.example)은
터미널에서 같은 명령을 임시로 재현할 때 확인하는 보조 자료다. URL 원문은 추적되는 설정·문서·커밋·작업 로그에 남기지 않는다.
Secret 값만 바꾸면 push 이벤트가 없으므로 변경 직후에는 `workflow_dispatch`로 `develop`의 모니터링 배포를 다시 실행한다.

```dotenv
# 실제 URL로 채운다. 아래 문자열은 형식 예시다.
SLACK_WEBHOOK_URL='https://hooks.slack.com/services/<workspace>/<webhook>/<secret>'
```

Compose는 비어 있거나 누락된 `SLACK_WEBHOOK_URL`을 거부하고 Grafana 컨테이너에 전달한다.
Grafana가 연락처 파일의 `url: $SLACK_WEBHOOK_URL`을 이 환경변수로 치환한다.
관리자 초기 비밀번호는 Compose의 `GF_SECURITY_ADMIN_PASSWORD`에 고정되어 있으며
관리자 사용자명도 Compose의 `GF_SECURITY_ADMIN_USER: admin`으로 고정한다. 기존 Grafana 계정의 비밀번호는 Compose나
환경변수 변경만으로 바뀌지 않는다. 알림 등록을 위한 별도 관리자 API 인증은 필요하지 않다.

파일로 등록한 알림 규칙·연락처·정책은 Grafana UI에서 편집할 수 없다. 설정 파일을 수정하고
Grafana를 다시 시작해 적용한다. 최초 실행 여부를 연락처 존재나 marker로 판별하지 않는다.
[Grafana 파일 provisioning 문서](https://grafana.com/docs/grafana/latest/alerting/set-up/provision-alerting-resources/file-provisioning/)

## Slack 메시지 표시

[templates.yaml](../../monitoring/grafana/provisioning/alerting/templates.yaml)의
`jarihana.slack.title`과 `jarihana.slack.text`를 연락처의 제목·본문에 연결한다.
Grafana가 시작할 때 규칙·연락처와 함께 등록하므로 UI에서 따로 설정할 필요가 없다.
발생 조건과 전달 주기는 바꾸지 않고 메시지만 정리한다.

- 제목에는 `긴급`·`주의`·`해제`, 알림 대상, 서버 또는 환경을 표시한다.
- 본문에는 환경·서버·마운트, 측정값, 발생 또는 해제 기준, 확인할 내용과 Grafana 링크를 표시한다.
- CPU·메모리·디스크·inode는 소수점 한 자리와 `%`, 최근 5분 HTTP 500 로그는 정수와 `건`으로 표시한다.
  표시할 때만 반올림하며 임계치 판단은 원래 값으로 수행한다.
- 헬스체크의 `1`은 실패 횟수가 아니다. `정상 상태 확인 실패`, `0`은 `정상 응답 확인`으로 표시한다.
- `A`·`B`와 전체 라벨 목록은 메시지에 출력하지 않는다. `B`는 알림 조건의 참·거짓을 나타내는 내부 값이다.
- Slack 굵게 표시는 `*문구*`, 링크는 `<URL|문구>`를 사용한다.

CPU 긴급 알림이 해제되면 다음처럼 표시한다.

```text
[해제] CPU 사용률 높음 · jarihana-prod-ec2

알림 해제 · CPU 사용률 높음
서버: jarihana-prod-ec2
평가 시 CPU 사용률: 1.5%
해제 기준: 90% 미만 (80% 이상이 5분 지속되면 주의 알림 대상)
Grafana에서 확인
```

`1.5%`는 이 예시의 측정값이며 해제 기준이 아니다. 긴급 조건은 90% 미만에서 해제된다.
주의 조건은 80% 미만뿐 아니라 90% 이상이 되어도 해제되므로, 이때는 긴급 알림 대상을 함께 안내한다.
따라서 메시지에서는 `정상 복구` 대신 `알림 해제`라고 표현한다.

`MissingSeries`·`NoData` 등 지표 부재로 해제된 경우에는 수치상 복구로 표현하지 않고
해제 사유와 수집 상태 확인 안내를 표시한다. 값이 없으면 `0%` 대신 `확인 불가`로 표시한다.
`DatasourceError`·`DatasourceNoData`도 각각 지표 조회 오류·지표 없음으로 구분한다.

메시지를 수정한 뒤 Grafana의 알림 템플릿 미리보기에서 발생·해제, 0값, 값 없음,
지표 부재, 여러 알림이 섞인 메시지를 확인한다. 템플릿 미리보기는 Slack 전송이 아니며,
연락처의 **Test**는 실제 채널로 보내므로 두 기능을 구분한다.

## 어떤 상태를 감지하는가

[rules.yaml](../../monitoring/grafana/provisioning/alerting/rules.yaml)은 `Jarihana` 폴더에
다음 알림 정의 12개를 등록한다. health와 HTTP 500은 dev·prod별로 하나씩, CPU·메모리·디스크·inode는
호스트별 결과를 warning·critical 두 규칙에서 각각 평가한다. 따라서 호스트가 늘면 실제 알림 인스턴스 수는
정의 수보다 많아질 수 있다.

| 대상 | 발생 조건 | 수준·추가 대기 | 의미와 확인할 곳 |
| --- | --- | --- | --- |
| dev·prod health (2개) | health probe 실패 또는 150초 이내의 새 health 샘플 없음 | critical·0초 | 앱 health 응답과 Alloy·전송 경로를 확인한다 |
| dev·prod HTTP 500 (2개) | 최근 5분의 앱 요청 완료 로그에 정확히 HTTP 500이 1건 이상 | critical·0초 | 요청 ID로 해당 서버 오류 로그를 확인한다 |
| 호스트 CPU (2개) | 80% 이상 90% 미만이 5분 지속 / 90% 이상 | warning·5분 / critical·0초 | `host_id`별 CPU 부하와 실행 중인 프로세스를 확인한다 |
| 호스트 메모리 (2개) | `(1 - MemAvailable / MemTotal) × 100`이 80% 이상 90% 미만으로 5분 지속 / 90% 이상 | warning·5분 / critical·0초 | `host_id`별 가용 메모리와 프로세스 사용량을 확인한다 |
| 호스트 디스크 (2개) | 사용률이 80% 이상 90% 미만으로 5분 지속 / 90% 이상 | warning·5분 / critical·0초 | `host_id`·`mountpoint`별 남은 디스크 공간을 확인한다 |
| 호스트 inode (2개) | inode 사용률이 80% 이상 90% 미만으로 5분 지속 / 90% 이상 | warning·5분 / critical·0초 | 공간이 남아도 파일을 만들 수 없는 상황인지 확인한다 |

Alloy의 내장 blackbox exporter가 `http://<APP_METRICS_TARGET>/actuator/health`를 **10초마다**
확인한다. 제한 시간은 5초이며 HTTP 200과 응답의 `status: UP`을 모두 기대한다.
health 메트릭의 job은 `jarihana-health`, 환경 라벨은 `dev` 또는 `prod`다. 기존
`/actuator/prometheus` 메트릭 수집과 별도이므로 메트릭 주소가 응답한다는 사실만으로 앱 health를
정상으로 판단하지 않는다.

Grafana는 10초마다 평가한다. health·500의 추가 대기(`for`)가 0초여도 다음 수집·전송·평가와
통지 전송 시간이 필요하므로 **장애 발생 후 1분 안의 Slack 수신을 보장하지 않는다.**
health 샘플이 끊기면 마지막 샘플의 150초 기준과 평가·전달 지연을 거쳐 알린다.
아직 수집한 적 없는 dev·prod도 health 부재 대상이다. dev부터 시작한다면 prod health 규칙을
파일에서 `isPaused: true`로 잠시 중지하고 prod 수집 준비 후 해제해 다시 적용한다.

HTTP 500은 Loki의 앱 요청 완료 이벤트만 센다. 404, 외부 API 호출 실패 로그, 시작 이벤트나
업무 로그는 이 조건에 넣지 않는다. 새 오류 카운터의 첫 값을 증가량 쿼리가 놓칠 수 있어
완료 로그를 사용한다. 로그가 도착해야 감지할 수 있으며 최근 5분 구간에 여러 오류가 있어도
오류마다 Slack 메시지를 하나씩 보내는 방식은 아니다. 500이 다시 없으면 마지막 해당 로그가
5분 구간에서 벗어난 뒤 조건이 해제된다. 로그 수집이 끊겨 해제되는 상황도 있으므로 복구 메시지만으로
서버 정상 여부를 판단하지 않는다.

CPU는 `node_cpu_seconds_total`의 idle 비율을 `irate(...[2m])`로 계산해 사용률로 바꾼다.
2분은 최근 샘플을 찾는 범위이며, 실제 계산은 가장 최근 두 샘플(수집 간격 약 10초)을 사용한다.
따라서 2분 평균값은 아니다.
메모리는 `MemAvailable`을 사용해 회수 가능한 캐시를 가용량에 반영한다. 둘 다 **EC2 호스트 전체**
기준이며 컨테이너·JVM heap·RDS 사용률이 아니다. `host_id`별 알림이며 호스트 메트릭에는
별도의 environment 라벨을 추가하지 않는다. warning은 80% 이상 90% 미만이 5분 지속될 때만
알려 일시적인 임계치 초과를 거른다. 90% 이상이면 warning 조건은 꺼지고 critical이 추가 대기
없이 평가된다. critical의 첫 통지 대기도 0초다. 다만 다음 수집(약 10초)과 평가(10초)는
기다려야 하며 10초보다 짧은 급증은 놓칠 수 있다. 이는 연속 측정이나 즉시 수신 보장이 아니다.

CPU·메모리·디스크·inode 알림은 dev·prod 앱 EC2와 모니터링 EC2의 `jarihana-host` 지표에
공통으로 적용한다. 모니터링 서버도 전용 Alloy가 호스트와 Alloy 자체 메트릭을 수집한다.
각 EC2의 `HOST_ID`는 서로 달라야 한다.

디스크는 가용 바이트로 사용률을 계산하고 inode는 전체 파일 노드 수 대비 남은 노드 수로
계산한다. inode는 파일·디렉터리에 배정하는 관리 단위여서 작은 파일이 많으면 바이트 공간보다
먼저 부족해질 수 있다. `ext2`·`ext3`·`ext4`·`xfs`·`btrfs` 중 쓰기 가능하고 전체 크기나
inode 수가 양수인 대상만 평가한다. 가상 파일시스템과 목록 밖의 파일시스템은 제외하므로
다른 종류를 사용하면 규칙의 `fstype` 목록을 검토한다. 파일시스템별 `host_id`·`mountpoint`로 구분하고
동일한 warning·critical 임계값과 대기 시간을 적용한다. 앱·모니터링 Alloy 모두 `/dev`,
`/proc`, `/sys`, `/run/credentials` 하위 마운트를 제외한다. `/var/lib/docker` 아래의
실제 디스크 마운트는 수집 대상에 남기고 overlay 파일시스템은 제외한다.

health 규칙의 데이터 없음 상태는 `Alerting`, HTTP 500과 호스트 자원 규칙은 `OK`다.
앱 EC2의 Alloy가 멈춘 경우는 health 샘플 부재로 감지한다. 모니터링 Alloy 중단이나 호스트 지표만 빠진 상태는 별도 감지하지 않는다.
500 로그가 없다는 사실은 로그 전송 경로의 정상 동작을 증명하지 않는다. 모든 규칙의 평가 오류는
`execErrState: Error`로 처리하며 `DatasourceError`는 앱 장애와 구분해 데이터 소스 접근부터 확인한다.
호스트 지표 일부가 사라지는 경우와 전체 쿼리에 데이터가 없는 경우도 같지 않다. 호스트별
수집 중단을 따로 추적하는 알림이나 모니터링 서버 외부 감시는 아직 없다.

## 전달 정책과 조정 값

[notification-policies.yaml](../../monitoring/grafana/provisioning/alerting/notification-policies.yaml)은
조직 1의 기본 전달 경로를 `jarihana-slack`으로 지정한다. 이 열두 정의뿐 아니라 이 정책 트리를
사용하는 조직 1의 모든 알림이 기본적으로 이 연락처로 간다. 폴더·알림 이름·환경이 같은
알림을 묶으며 호스트도 구분한다(`grafana_folder`, `alertname`, `environment`, `host_id`, `mountpoint`).
기본 첫 통지 대기는 30초이며 `severity=critical` 하위 경로는 `group_wait: 0s`로 설정한다.
health·HTTP 500·자원 critical 알림에는 의도적인 첫 통지 대기를 추가하지 않는다.

**정책 파일은 조직 1의 notification policy 트리 전체를 관리하며 적용 시 기존 트리를 덮어쓴다.**
기존 Grafana를 사용한다면 현재 정책을 확인하고 필요한 경로를 파일에 함께 반영한 뒤 적용한다.
규칙에서 연락처를 직접 지정해 생성한 내부 경로는 policy 트리와 별도다.

기존 API나 UI에서 같은 이름·UID의 리소스를 만들었다면 파일 provisioning과 충돌할 수 있다.
설정을 백업하고 중복 리소스와 이관 절차를 확인한 뒤 적용한다. 이번 작업에서는 실제 AWS
리소스를 삭제하거나 이관하지 않았다. 파일 변경이 자동으로 실행 중인 Grafana에 반영되는
것은 아니므로 아래 적용 절차를 따른다.

파일을 지우는 것만으로 Grafana DB의 리소스가 삭제되지는 않는다. 의도적으로 제거할 때는
규칙의 `deleteRules`, 연락처의 `deleteContactPoints`, 정책 초기화의 `resetPolicies`를 사용한다.
삭제 대상 UID·조직과 기존 설정을 확인한 뒤 적용하며, `resetPolicies`는 정책 트리를 기본값으로
돌린다는 점에 주의한다. 이번 규칙 파일에는 이전 백엔드 scrape·metrics missing 규칙
UID 4개를 `deleteRules`로 명시해 중복 평가를 제거한다. 실제 AWS 적용은 수행하지 않았다.

| 조정 항목 | 현재 값 | 바꿀 때 살필 점 |
| --- | --- | --- |
| 평가 주기 | 10초 | 감지 지연과 Prometheus·Grafana 부하 |
| health 수집 / 제한 시간 / 최신 샘플 기준 | 10초 / 5초 / 150초 | 확인 주기와 수집·전송 지연 |
| HTTP 500 조회 구간 / 건수 | 5분 / 1건 이상 | 로그 전달 지연과 반복 오류 |
| CPU 계산 | `irate`의 최근 두 샘플, 조회 범위 2분 | 수집 간격보다 짧은 급증은 놓칠 수 있음 |
| 호스트 자원 warning | 80% 이상 90% 미만 / 5분 | 일시적인 부하와 지속 과부하 구분 |
| 호스트 자원 critical | 90% 이상 / 추가 대기 0초 | 수집·평가·전송 시간은 여전히 필요 |
| 첫 알림 대기 `group_wait` | 기본 30초 / critical 0초 | 같은 그룹의 초기 알림을 모으는 시간 |
| 변경 알림 간격 `group_interval` | 5분 | 이미 보낸 그룹의 변경 사항을 다시 알리는 간격 |
| 지속 장애 재통지 `repeat_interval` | 4시간 | 변화 없는 장애의 반복 알림 간격 |

## 적용과 확인

기존 앱 EC2를 갱신할 때는 **Alloy에 새 health 수집 설정을 먼저 적용**한다. 이전 설정을
사용한 채 Grafana 규칙부터 적용하면 health 샘플 부재 알림이 발생한다. 앱 EC2의 저장소
루트에서 dev는 다음 명령을 실행하고, prod는 파일명을 `infra/docker-compose.yml`로 바꾼다.

```bash
docker compose --env-file infra/.env -f infra/docker-compose.dev.yml up -d --no-deps --force-recreate alloy
```

재생성 중에는 수집이 잠시 멈춘다. Grafana Explore의 Prometheus에서
`probe_success{job="jarihana-health",environment="dev"}`(prod는 `prod`)의 최신 샘플이
도착하고 값이 `1`인지 확인한 뒤 아래 Grafana 설정을 적용한다. 전체 앱 배포와 수집 확인은
[앱과 Alloy 실행 절차](OPERATIONS.md#2-앱과-alloy-함께-실행)를 참고한다.

`develop` 브랜치에 알림 파일이나 모니터링 Compose 구성이 push되면
[모니터링 배포 workflow](OPERATIONS.md#1-모니터링-서버-실행과-자동-배포)가 모니터링 EC2에서
자동으로 재생성한다. 별도 초기화 컨테이너나 호스트 스크립트는 필요하지 않다.

```bash
cd infra/monitoring
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml config --quiet
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml up -d --no-build --force-recreate
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml ps grafana
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml logs --tail 100 grafana
```

`up -d`는 분리 실행이므로 명령 반환만으로 설정 적용을 판단하지 않는다. Grafana의 health와
로그에서 시작·provisioning 오류 여부를 확인하고 아래 UI에서 등록된 리소스를 확인한다.

알림 파일이나 Webhook을 변경한 뒤에는 다음 명령으로 Grafana를 재생성한다.

```bash
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml config --quiet
docker compose --env-file /dev/null --project-name jarihana-monitoring --file docker-compose.yml up -d --no-deps --no-build --force-recreate grafana
```

`config --quiet`는 치환한 비밀값을 출력하지 않고 구성을 검사한다. workflow는 repository Actions variables/secrets에서
주입한 shell 환경변수를 사용한다. 터미널에서 수동 실행할 때는 같은 이름의 shell 변수가
의도한 값인지 확인한다. 단순 `docker compose restart`는 변경한
Compose 환경변수를 다시 넣지 않는다. 재생성은 새 환경변수와 파일을 읽고 `grafana-data`는
유지하며, 그동안 Grafana 조회와 알림 기능은 잠시 중단된다.

시작 시 별도 Test 메시지를 보내지는 않지만 규칙이 활성화되면 조건에 따라 실제 Slack 알림이
발생할 수 있다. 최초 수집이 아직 없는 환경의 규칙도 적용 전에 확인한다.

Grafana의 **Alerts & IRM → Alerting → Notification configuration → Contact points**에서
`jarihana-slack`이 등록됐는지 확인한다. **Test는 실제 Slack 채널에 메시지를 보내는 기능**이다.
운영자가 전송할 채널과 시점을 확인한 뒤 별도로 실행한다. 이번 작업에서는 Test를 누르거나
외부 Webhook을 호출하지 않았다. 수신 성공은 전달 경로 확인이며 장애 조건의 감지까지
검증한 것은 아니다.

Alert rules에서 알림 정의 12개와 환경·호스트별 평가 상태를 확인한다. 실제 운영 전에는 health
실패·health 샘플 부재·HTTP 500·CPU·메모리·디스크·inode 조건을 각각 재현하고 발생·복구·전달을 구분해 검증한다. UI의 Test만으로 이 과정이
확인되지는 않는다.

이 규칙은 HTTP 500 이외의 5xx, GC·RDS 내부 상태와 호스트·Alloy 자체 지표의
수집 중단을 각각 별도 규칙으로 검사하지 않는다.
서비스 전체의 가용성이나 무중단을 보장하지 않는다. 모니터링 서버나 Grafana가 완전히 중단되면 같은 서버에서 알릴 수 없다. 호스트 수집을
추가해도 이 한계는 남으며 외부 watchdog은 아직 구현하지 않았다.

인프라 설정 적용은 모니터링 전용 workflow가 자동으로 시작한다. 이 workflow는 `develop`의
`infra/monitoring/**` 또는 workflow 파일 변경에만 반응하며, backend 배포 workflow를 실행하지 않는다.
`workflow_dispatch`는 같은 `develop` revision을 다시 적용할 때 사용한다.
