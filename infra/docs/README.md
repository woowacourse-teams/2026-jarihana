# 인프라 문서

모니터링과 배포 DB의 결정, 설계, 실행 방법과 학습 자료를 모아 둔다.

| 문서 | 내용 |
| --- | --- |
| [인프라 ADR 목록](adr/README.md) | 기술 선택의 배경, 대안과 감수하는 비용 |
| [모니터링·로그 아키텍처](observability/ARCHITECTURE.md) | 수집 경로, 서버 배치, 장애·전환 기준 |
| [모니터링 실행 가이드](observability/OPERATIONS.md) | Docker Compose 실행, 환경변수, 마운트와 수집 확인 |
| [Tempo 트레이스 수집](observability/TRACING.md) | Java Agent·Alloy·Tempo 연결, 보관·샘플링과 실제 요청 검증 |
| [Grafana Canvas](observability/CANVAS.md) | 앱·DB health와 최근 2분 평균 요청 흐름을 보여주는 시스템 흐름 화면 |
| [Grafana Slack 장애 알림](observability/SLACK.md) | health·HTTP 500·CPU·메모리·디스크·inode 알림, Webhook과 파일 provisioning |
| [모니터링 학습 노트](learning/observability.md) | 대화에서 나온 질문, 용어와 계산 예시 |

dev·prod 앱은 각자 EC2에서 Alloy 서비스를 직접 정의한 앱 Compose 파일로 실행한다. 저장·조회는
별도 모니터링 EC2에서 맡고, DB는 dev·prod 모두 RDS PostgreSQL을 사용한다. 실행 설정은 [infra/monitoring](../monitoring/README.md)에 있고,
앱·수집기 공통 입력은 [infra/.env.example](../.env.example)을 기준으로 준비한다.
