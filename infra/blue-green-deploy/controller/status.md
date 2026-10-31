# Blue-Green 상태 확인

배포 진행 단계, 실제 요청 경로, worker 권한과 관측 상태를 대조할 때 읽는다.
운영 전제는 [배포 실행의 적용 버전](deployment.md#적용-버전)을 따른다.
중앙 수집기의 실행 주기, 설치 경로와 점검 명령은 [수집기 운영](../../docs/observability/CENTRAL-DEPLOYMENT-COLLECTOR.md)을 따른다.

- [실제 실행과 저널](#실제-실행과-저널)
- [관찰 기준](#관찰-기준)
- [관측 최신성](#관측-최신성)
- [프론트엔드 관찰](#프론트엔드-관찰)

## 실제 실행과 저널

```sh
gh run list --workflow backend-prod-deploy.yml --branch main --limit 5
# <run-id>를 실제 실행 번호로 치환한다.
gh run view <run-id>
```

진행 단계, 실행 SHA와 control pin, 실제 Nginx 대상, A/B 전원과 이미지, worker owner를
함께 대조한다. coordinator 저널의 switched 의도만으로 실제 경로를 단정하지 않는다.
Nginx probe는 슬롯, 예상 upstream, 실제 upstream 헤더와 실제 API 성공 응답을 함께 검증한다.

coordinator는 `/var/lib/jarihana-deploy/<env>/state.json`을 보존한다.
phase, run_id, deployment_id, old/target, image, pending, sealed와 cleanup_deferred를 확인한다.
앱의 worker-intent.json과 stop-intent.json도 현재 boot, 컨테이너와 DB 권한에 대조한다.
상태 파일과 환경 전체를 공개 로그에 출력하지 않는다.

## 관찰 기준

각 관찰은 최소 900초이고 검사 사이 5초를 기다린다. 연속 3회 unhealthy이면 실패다.
조회와 API 처리 시간이 더해지므로 정확한 5초 주기나 15초 내 장애 감지를 보장하지 않는다.
worker 관찰은 boot와 DB 권한이 유지되고 unresolved=0인지 확인한다.
HTTP 관찰은 실제 후보 경로와 호스트별 fresh up, 최근 2분 요청 수, 5xx 비율과 평균 시간을 본다.

telemetry 예시의 실패 임계값은 5xx 1%, 평균 응답 1초다. 실제 보호된 설정을
확인하며 이 응답 시간은 p95가 아니다. up 최신성은 [관측 최신성](#관측-최신성)을 따른다. 총 요청 수가 0인 값과 지표 누락을 구분한다.
누락, NaN, 경고, 다중 series와 관측 불확실성은 UNKNOWN으로 실패한다.
총 요청 지표가 존재할 때 아직 생성되지 않은 5xx series만 0으로 처리할 수 있다.
후보 전환 전에 실제 API와 지표가 준비될 때까지 기다린다.

Nginx는 `nginx -t` 뒤 설정을 원자적으로 교체하고 reload하며 실제 후보 응답을 확인한다.
기존 Nginx worker 세대가 끝나야 이전 연결 drain이다. 양쪽 관찰 후 최대 300초 더 기다려도
연결이 남고 새 앱은 정상이면 cleanup_deferred=true와 NEEDS_ATTENTION을 남긴다.
새 앱과 권한을 유지하고 양쪽 EC2를 보존하며 자동 롤백과 종료를 보류한다.

## 관측 최신성

같은 Grafana 안에서도 화면과 알림의 기준은 다르다. 아래 값은 설치 완료 기록이 아니라
기준 코드의 소비 규칙이다. 수집 주기와 유효 시간은 같은 값이 아니다.

| 사용 위치 | 기준 | 코드 근거 |
| --- | --- | --- |
| 배포 제어기의 앱 up | 보호된 telemetry의 max_age_seconds, 예시는 최대 45초 | [설정 예시](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/blue-green-deploy/controller/full-coordinator.example.json), [제어기](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/blue-green-deploy/scripts/actions/coordinator.sh) |
| 배포 관제 화면의 앱/DB와 DEV metric sample | 45초 이하 | [관제 쿼리](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/source/queries.json) |
| 배포 관제 화면의 PROD 수집기/route sample과 실제 관측 | 90초 미만 | [관제 쿼리](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/source/queries.json) |
| 배포 관제 화면의 DEV Actions 실제 관측 | 360초 미만, 수집 성공도 필요 | [관제 쿼리](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/source/queries.json) |
| Slack health 알림의 앱 probe | 150초 미만 | [알림 규칙](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/provisioning/alerting/rules.yaml) |
| Slack prod 알림의 중앙 수집기와 Nginx 관측 | 90초 미만, 활성 host_id 하나와 source 성공 필요 | [알림 규칙](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/provisioning/alerting/rules.yaml) |
| 배포 관제 화면 갱신 | 5초 | [화면 원본](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/source/dashboard.json) |

원본의 전체 PromQL은 표의 코드 링크를 따른다.

## 프론트엔드 관찰

프론트엔드가 바뀐 배포는 `index.html`, `sw.js`, `manifest.webmanifest`의 공개 응답 해시를
30초 간격 기준으로 재검사하고, 배포 확정 직전에는 manifest에 선언한 모든 파일을 검사한다.
검사와 전송 시간이 더해지므로 정확한 고정 주기를 보장하지 않는다. 백엔드 전용 배포는
공개 파일을 다시 게시하지 않으며 현재 릴리스 조합의 상태를 확인한다.
검사 경계는 [제어기](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/blue-green-deploy/scripts/actions/coordinator.sh)와 [프론트 제어 코드](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/blue-green-deploy/scripts/actions/frontend.sh)를 따른다.

관찰 실패나 종료 보류가 발생하면 [장애 복구](recovery.md)를 따른다. 다음 정상 배포는 [배포 실행](deployment.md)에서 확인한다.
