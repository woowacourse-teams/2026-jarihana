# 인프라 ADR 목록

인프라의 기술 결정은 이 목록에서 관리한다. 번호는 백엔드, 프론트엔드 ADR과 독립적으로
부여하며, 다른 영역에서 참조할 때는 영역 이름과 번호를 함께 쓴다.
공통 기준은 [ADR 문서 컨벤션](../../../docs/repository-conventions/adr.md)에 있다.

## 기록된 결정

| 번호 | 제목 | 상태 | 날짜 | 대체 관계 |
| --- | --- | --- | --- | --- |
| 0001 | [로컬 Alloy에서 Prometheus와 Loki로 직접 전송한다](0001-local-alloy-observability.md) | 채택(초기 설정 작성, 미배포) | 2026-10-03 | Alloy, Prometheus, Loki, Grafana로 수집, 조회. 기본 앱 로그 수집 적용 |
| 0002 | [dev, prod DB는 RDS PostgreSQL을 사용한다](0002-rds-deployment-database.md) | 채택(2026-10-12 최신 develop 통합에서 재개정) | 2026-10-05 | [백엔드 ADR 0009](../../../backend/docs/adr/0009-aws-deployment-topology.md)의 dev/prod 호스트 공유 결정을 대체 |
| 0003 | [Java Agent와 로컬 Alloy로 수집한 트레이스를 Tempo에 저장한다](0003-tempo-tracing.md) | 채택 후 기본 비활성(ADR 0004) | 2026-10-09 | ADR 0001의 트레이스 도입 보류를 해제, 이후 선택 구성으로 변경 |
| 0004 | [Tempo는 기본 모니터링 경로에서 비활성화하고 DB 호출 지표는 JDBC 메트릭으로 본다](0004-disable-tempo-by-default.md) | 채택(저장소 구성 반영, AWS 미배포) | 2026-10-13 | 메모리 부족으로 ADR 0003의 상시 실행을 중단하고 JDBC 지표로 대시보드 유지 |
| 0005 | [별도 Nginx와 고정된 운영 EC2 두 대로 Blue-Green 배포한다](0005-nginx-ec2-blue-green-deployment.md) | 채택 | 2026-10-21 | A/B 교대, 5분 관찰, 롤백, worker 인계와 호환 DB 변경. 기존 이미지 공급 방식은 유지 |
| 0006 | [프론트엔드 원본을 S3에 보관하고 백엔드와 함께 복구한다](0006-s3-paired-frontend-rollback.md) | 채택 | 2026-10-29 | ADR 0005의 prod 배포와 복구를 프론트엔드 릴리스 쌍으로 확장 |
| 0007 | [아지트 상태를 별도 Spring 실시간 앱에서 처리한다](0007-clubhouse-realtime-service.md) | 채택 · 로컬 구현·검증, 운영 적용 미확인 | 2026-11-12 | M1·M2 독립 앱, DB 직접 조회, 환경·방 분리와 입장 키 |
| 0008 | [기존 환경 설정으로 공용 realtime 컨테이너를 배포한다](0008-shared-realtime-deployment.md) | 채택 · 구성 구현, 운영 적용 미확인 | 2026-11-13 | ADR 0007의 배포 상세. 기존 Environment 준비 잡, CloudFront 8080, 복구·관측 |
| 0009 | [프로젝터 화면 공유는 LiveKit SFU를 사용하고 구현은 보류한다](0009-projector-livekit-direction.md) | 방향 채택 · M3 구현·네트워크 구성 보류 | 2026-11-13 | 초기 P2P·coturn 구상을 변경. 현재 M1·M2 배포에는 미포함 |

아지트 논의의 전체 흐름과 HLD는 [아지트 멀티플레이 아키텍처와 결정 이력](../../../docs/clubhouse-realtime-architecture.md)에 있다. ADR 0007~0009의 상태는 설계 선택과 저장소 구현을 구분하며 운영 성공을 뜻하지 않는다. 실행 증거는 [M1·M2 검증 기록](../../realtime/VERIFICATION.md)에서 관리한다.

## 배포 ADR의 운영 적용 상태

ADR 0005/0006의 "채택"은 설계 결정을 뜻하며, 모든 운영 검증의 완료를 뜻하지 않는다.
실제 적용 버전, 확인 근거와 미검증 범위는 [배포 실행의 운영 적용 상태](../../blue-green-deploy/docs/deployment.md#운영-적용-상태)에서 관리한다.

## 문서 이동 이력

2026-10-05에 모니터링 문서를 인프라 영역으로 모으면서, 병합 전 백엔드 ADR 0015였던
문서를 인프라 ADR 0001로 옮겼다. 결정 내용과 최초 작성 날짜는 유지한다.
