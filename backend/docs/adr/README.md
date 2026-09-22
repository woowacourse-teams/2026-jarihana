# 백엔드 ADR 목록

이 목록은 백엔드 기술 결정을 기록한다. 프론트엔드 결정은 별도 [프론트엔드 ADR 목록](../../../frontend/docs/adr/README.md)에서
관리한다. 모노레포의 ADR 영역 구분과 교차 참조 방식은 [저장소 컨벤션](../../../docs/repository-conventions.md)에,
백엔드 ADR 작성과 번호 관리는 [프로젝트 운영 컨벤션](../conventions/project-operations.md)의 "ADR 운영" 절에 있다.

## 기록된 결정

| 번호 | 제목 | 상태 | 날짜 | 대체 관계 |
| --- | --- | --- | --- | --- |
| 0001 | [GitHub OAuth 로그인의 세션과 토큰 전달 방식](0001-github-oauth-authentication.md) | 채택 | 2026-08-19 | 결정 4는 0002가, 결정 2는 0004가 대체 |
| 0002 | [Access Token의 형식과 전달 방식](0002-access-token-cookie.md) | 채택 | 2026-08-19 | 0001의 Bearer 헤더 결정을 대체 |
| 0003 | [그룹 목록 조회의 DB cursor 페이지네이션](0003-group-list-database-cursor-pagination.md) | 채택 | 2026-08-19 | |
| 0004 | [GitHub OAuth 인가 시작의 소유와 state 검증](0004-oauth-authorization-ownership.md) | 채택 | 2026-08-20 | 0001 결정 2를 대체 |
| 0005 | [CSRF 토큰의 저장소와 전달 방식](0005-csrf-token-delivery.md) | 채택 | 2026-08-20 | 0002가 남긴 후속 작업을 받음 |
| 0006 | [로컬 개발 인증 우회의 제거](0006-remove-local-development-auth-bypass.md) | 채택 | 2026-08-24 | |
| 0007 | [`/api` 접두사를 백엔드 context-path로 받는다](0007-api-prefix-backend-context-path.md) | 채택 | 2026-08-24 | 0005에 결정 6(쿠키 경로)을 낳음 |
| 0008 | [4인 병렬 개발을 위한 CQRS-lite 협업 경계](0008-cqrs-lite-collaboration-boundary.md) | 채택 | 2026-08-19 | |
| 0009 | [제한된 AWS 환경에서 단일 진입점과 단일 EC2를 사용한다](0009-aws-deployment-topology.md) | 채택 | 2026-08-25 | 0001, 0002, 0004, 0005의 후속 작업을 닫음 |
| 0010 | [단일 저장소에서 애플리케이션과 인프라 경계 분리](0010-monorepo-application-infrastructure-boundaries.md) | 채택 | 2026-08-19 | |
| 0011 | [운영 RDBMS로 PostgreSQL을 선택한다](0011-postgresql-rdbms-selection.md) | 채택 | 2026-08-26 | |
| 0012 | [데이터베이스 스키마를 저장소에서 관리한다](0012-database-schema-management.md) | 제안 | 2026-08-27 | 도구 미확정. 채택되면 0011의 감수 비용을 닫는다 |
| 0013 | [자동화 테스트의 PostgreSQL을 Testcontainers로 실행한다](0013-testcontainers-test-database.md) | 채택 | 2026-09-14 | 0012의 테스트 DB Docker Compose 재사용 결정을 대체 |

관련 회고: [`/api` 접두사는 누가 떼는가](../retrospectives/api-prefix-troubleshooting.md)는
ADR 0006과 0007에 이르기까지의 기록이다.

## 병합 대기 중인 ADR

현재 없다.

## 번호를 다시 매긴 이력

2026-09-14에 겹치거나 비어 있던 번호를 한꺼번에 정리했다. 옛 번호로 된 PR 본문이나 외부 문서를
읽을 때는 아래 표로 현재 번호를 찾는다.

| 옛 번호 | 현재 번호 | 문서 |
| --- | --- | --- |
| 0002 | 0003 | 그룹 목록 조회의 DB cursor 페이지네이션 (Access Token ADR과 번호 중복) |
| 0003 | 0004 | GitHub OAuth 인가 시작의 소유와 state 검증 |
| 0004 | 0005 | CSRF 토큰의 저장소와 전달 방식 |
| 0005 | 0006 | 로컬 개발 인증 우회의 제거 |
| 0006 | 0007 | `/api` 접두사를 백엔드 context-path로 받는다 |
| 0006 | 0008 | 4인 병렬 개발을 위한 CQRS-lite 협업 경계 (`/api` 접두사 ADR과 번호 중복) |
| 0007 | 0010 | 단일 저장소에서 애플리케이션과 인프라 경계 분리 |
| 0008 | 0009 | 제한된 AWS 환경에서 단일 진입점과 단일 EC2를 사용한다 |
| 0009 | 0011 | 운영 RDBMS로 PostgreSQL을 선택한다 |
| 0012 | 0012 | 데이터베이스 스키마를 저장소에서 관리한다 (0010, 0011이 비어 있던 동안의 번호) |
