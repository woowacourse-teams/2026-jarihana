# 배포 관제 대시보드

Grafana의 `자리하나 배포 관제`는 UID `jarihana-deployment`로 연다.
문서 기준은 [배포 실행의 적용 버전](../../blue-green-deploy/docs/deployment.md#적용-버전)이다.
관제 화면은 배포와 앱 상태를 읽는 화면이며 배포 성공을 승인하거나 롤백을 실행하지 않는다.

## 화면에서 확인할 내용

환경 드롭다운의 기본값은 PROD다. PROD는 Nginx와 A/B, DEV는 단일 앱 배포 상태를 표시한다.
현재 단계, 실제 요청 대상, 관측 호스트, 요청률과 앱/DB 상태를 함께 읽는다.
EC2 전원, Nginx 경로, 앱 health와 배포 단계는 서로 다른 관측값이다.

PROD의 A/B 매핑은 쿼리의 slot_info와 실제 host_id, instance_id를 사용한다.
서버 이름의 숫자나 두 앱의 healthy 여부로 활성 슬롯을 추정하지 않는다.
신규 요청 경로는 Nginx probe, 완료 요청률은 upstream 로그의 집계이므로 둘을 같은 값으로 보지 않는다.
이전 worker 연결 정리도 별도로 확인한다.

DEV의 단일 앱 구성선은 실제 Nginx 탐침 결과가 아니다. 짧은 Actions 중간 단계는 수집 시점 사이에
지나갈 수 있다. 수집 실패와 오래된 값을 EC2 중지나 요청률 0으로 해석하지 않는다.

## 수집과 상태 해석

기준 코드의 쿼리는 DEV Actions 지표와 PROD 중앙 수집기 지표를 소비한다.
수집기 운영 정보는 기존 [중앙 수집기 문서](CENTRAL-DEPLOYMENT-COLLECTOR.md)를 참조한다.
화면 갱신, metric sample과 실제 관측 시각의 판정 기준은
[관측 최신성](../../blue-green-deploy/docs/status.md#관측-최신성)에 둔다.

기존 textfile이 반복 scrape되어도 실제 관측이 갱신되었다고 판단하지 않는다.
배포 이상은 [상태 확인](../../blue-green-deploy/docs/status.md)에서 실제 실행과 저널에 대조하고,
[장애 복구](../../blue-green-deploy/docs/recovery.md)에서 대응 범위를 확인한다.

## 화면 변경과 검증

원본과 생성물의 책임은 [화면 계약](../../monitoring/grafana/deployment/DESIGN.md)에 있다.
생성 JSON을 직접 편집하지 않는다. 생성과 구조, PromQL, 파일 프로비저닝 명령은
[관제 검증](../../blue-green-deploy/docs/verification.md#배포-관제-원본)을 따른다.
로컬 구조와 프로비저닝 시험은 실제 서버의 수집 성공이나 다음 운영 배포의 관측을 대신하지 않는다.
