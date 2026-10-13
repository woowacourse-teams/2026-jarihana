# 인프라 ADR 목록

인프라의 기술 결정은 이 목록에서 관리한다. 번호는 백엔드·프론트엔드 ADR과 독립적으로
부여하며, 다른 영역에서 참조할 때는 영역 이름과 번호를 함께 쓴다.
공통 기준은 [ADR 문서 컨벤션](../../../docs/repository-conventions/adr.md)에 있다.

## 기록된 결정

| 번호 | 제목 | 상태 | 날짜 | 대체 관계 |
| --- | --- | --- | --- | --- |
| 0001 | [로컬 Alloy에서 Prometheus와 Loki로 직접 전송한다](0001-local-alloy-observability.md) | 채택(초기 설정 작성, 미배포) | 2026-10-03 | Alloy·Prometheus·Loki·Grafana로 수집·조회. 기본 앱 로그 수집 적용 |
| 0002 | [dev·prod DB는 RDS PostgreSQL을 사용한다](0002-rds-deployment-database.md) | 채택(2026-10-12 최신 develop 통합에서 재개정) | 2026-10-05 | [백엔드 ADR 0009](../../../backend/docs/adr/0009-aws-deployment-topology.md)의 dev/prod 호스트 공유 결정을 대체 |
| 0003 | [Java Agent와 로컬 Alloy로 수집한 트레이스를 Tempo에 저장한다](0003-tempo-tracing.md) | 채택(로컬 수집 검증, AWS 미배포) | 2026-10-09 | ADR 0001의 트레이스 도입 보류를 해제 |
| 0004 | [Tempo는 기본 모니터링 경로에서 비활성화하고 DB 호출 지표는 JDBC 메트릭으로 본다](0004-disable-tempo-by-default.md) | 채택(저장소 구성 반영, AWS 미배포) | 2026-10-13 | ADR 0003의 Tempo 상시 실행 결정을 기본 비활성 구성으로 변경 |

## 병합 대기 중인 ADR

인프라 ADR 0001·0002·0003·0004는 `feat/monitoring-canvas` 계열 작업에서 작성했으며 아직 병합하지 않았다.
앱 Compose 두 파일에 Alloy 서비스를 직접 정의하는 방식으로 정리했다.
병합할 때 번호 충돌 여부를 다시 확인한다.

## 문서 이동 이력

2026-10-05에 모니터링 문서를 인프라 영역으로 모으면서, 병합 전 백엔드 ADR 0015였던
문서를 인프라 ADR 0001로 옮겼다. 결정 내용과 최초 작성 날짜는 유지한다.
