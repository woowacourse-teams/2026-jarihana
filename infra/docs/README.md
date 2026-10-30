# 인프라 문서

모니터링과 배포 DB의 결정, 설계, 실행 방법과 학습 자료를 모아 둔다.

| 문서 | 내용 |
| --- | --- |
| [인프라 ADR 목록](adr/README.md) | 기술 선택의 배경, 대안과 감수하는 비용 |
| [블루그린 배포 개요](../blue-green-deploy/README.md) | 구조와 배포 흐름 요약 |
| [블루그린 동작 구조](../blue-green-deploy/controller/architecture.md) | 구성요소, worker 인계, 프론트 릴리스와 실행 보호 |
| [블루그린 배포 환경 구성](../blue-green-deploy/controller/environment.md) | 필수 호스트, 권한과 관측 설정, 환경 재구성과 최초 worker 등록 |
| [블루그린 배포 실행](../blue-green-deploy/controller/deployment.md) | 적용 버전, workflow 입력과 정상 배포 순서 |
| [블루그린 상태 확인](../blue-green-deploy/controller/status.md) | 실행과 저널, 관찰 기준과 지표 최신성 |
| [블루그린 장애 복구](../blue-green-deploy/controller/recovery.md) | 실패 시 처리, 복구 기한과 수동 조사 |
| [블루그린 검증](../blue-green-deploy/controller/verification.md) | 배포 스크립트, 계측과 관제 변경 검증 |
| [모니터링·로그 아키텍처](observability/ARCHITECTURE.md) | 수집 경로, 서버 배치, 장애·전환 기준 |
| [모니터링 실행 가이드](observability/OPERATIONS.md) | Docker Compose 실행, 환경변수, 마운트와 수집 확인 |
| [Tempo 트레이스 선택 구성](observability/TRACING.md) | 필요할 때 켜는 Java Agent·Alloy·Tempo 연결, 보관·샘플링과 실제 요청 검증 |
| [Grafana Canvas](observability/CANVAS.md) | 앱·DB health와 최근 2분 평균 요청 흐름을 보여주는 시스템 흐름 화면 |
| [배포 관제 대시보드](observability/DEPLOYMENT.md) | 화면 사용과 상태 해석 |
| [Grafana Slack 장애 알림](observability/SLACK.md) | health·HTTP 500·CPU·메모리·디스크·inode 알림, Webhook과 파일 provisioning |
| [모니터링 학습 노트](learning/observability.md) | 대화에서 나온 질문, 용어와 계산 예시 |

dev·prod 앱은 각자 EC2에서 Alloy 서비스를 직접 정의한 앱 Compose 파일로 실행한다. 저장·조회는
별도 모니터링 EC2에서 맡고, DB는 dev·prod 모두 RDS PostgreSQL을 사용한다. 실행 설정은 [infra/monitoring](../monitoring/README.md)에 있고,
앱·수집기 공통 입력은 [infra/.env.example](../.env.example)을 기준으로 준비한다.
