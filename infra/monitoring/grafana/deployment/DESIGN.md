# 배포 관제 화면 계약

이 문서는 배포 관제의 원본 파일과 화면 표현의 책임을 정한다.
사용과 해석은 [관제 가이드](../../../docs/observability/DEPLOYMENT.md),
판정값은 [관측 최신성](../../../blue-green-deploy/controller/status.md#관측-최신성)을 따른다.

## 원본과 생성물

| 파일 | 책임 |
| --- | --- |
| [source/dashboard.json](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/source/dashboard.json) | V2 resource, 조건부 행, Canvas 도형과 연결, field 바인딩 |
| [source/colors.json](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/source/colors.json) | 화면 공통 색상 |
| [source/queries.json](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/source/queries.json) | 환경별 PromQL과 판정 조건 |
| [build-dashboard.mjs](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/build-dashboard.mjs) | 원본 참조를 해석하고 구조를 검증해 생성 |
| [queries.mjs](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/deployment/queries.mjs) | 패널과 PromQL 시험이 공유하는 쿼리 연결 |
| [생성 JSON](https://github.com/woowacourse-teams/2026-jarihana/blob/c1520946143c049cdcce57734c85daf1f540f26d/infra/monitoring/grafana/provisioning/dashboards/json/jarihana-deployment.json) | Grafana 파일 프로비저닝 결과 |

생성물을 직접 수정하지 않는다. 코드 링크는 [문서 기준 버전](../../../blue-green-deploy/controller/deployment.md#적용-버전)에 고정한다.
생성과 검증 명령은 [검증 가이드](../../../blue-green-deploy/controller/verification.md#배포-관제-원본)에 둔다.

## 화면 구조

environment는 단일 선택이며 PROD를 기본으로 저장한다. PROD와 DEV는 같은 드롭다운을 사용하는
조건부 RowsLayout으로 구성하고 미선택 환경을 숨긴다. 요약 카드는 단계, 요청 대상, 관측 호스트와 요청률을 표시한다.

PROD는 Nginx와 A/B 경로, DEV는 단일 앱 구성으로 표현한다.
호스트 이름과 단계는 지표 field에 바인딩하며 특정 서버 이름과 실행 상태를 화면에 고정하지 않는다.
정확한 geometry, 좌표와 field 연결은 dashboard.json을 따른다.

## 상태와 접근성

상태는 색과 텍스트로 함께 표시한다. 실제 phase와 같은 단계만 강조하고
실패, 롤백, 취소와 미확인을 완료로 표현하지 않는다. PROD 실제 수신 경로와 DEV 구성선을 구분한다.
조회 실패를 정상 값으로 대체하지 않는다. metric의 최신성과 source 성공은 queries.json의 조건을 따른다.
Canvas 확대와 이동을 사용하는 데스크톱 화면이며, 별도 모바일 배치는 정의하지 않는다.
