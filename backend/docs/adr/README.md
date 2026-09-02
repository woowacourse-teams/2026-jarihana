# ADR 목록

되돌리기 어렵거나 영향 범위가 넓은 기술 결정을 이 디렉터리에 기록한다. 무엇을 ADR로 남기고
어떻게 번호를 매기는지는 [프로젝트 운영 컨벤션](../conventions/project-operations.md)의
"ADR 운영" 절에 있다.

## 기록된 결정

| 번호 | 제목 | 상태 | 날짜 | 대체 관계 |
| --- | --- | --- | --- | --- |
| 0001 | [GitHub OAuth 로그인의 세션과 토큰 전달 방식](0001-github-oauth-authentication.md) | 채택 | 2026-08-19 | 결정 4는 0002(Access Token)가, 결정 2는 0003이 대체 |
| 0002 | [Access Token의 형식과 전달 방식](0002-access-token-cookie.md) | 채택 | 2026-08-19 | 0001의 Bearer 헤더 결정을 대체 |
| 0002 | [그룹 목록 조회의 DB cursor 페이지네이션](0002-group-list-database-cursor-pagination.md) | 채택 | 2026-08-19 | 번호 중복. 맨 아래 절 참고 |
| 0003 | [GitHub OAuth 인가 시작의 소유와 state 검증](0003-oauth-authorization-ownership.md) | 채택 | 2026-08-20 | 0001 결정 2를 대체 |
| 0004 | [CSRF 토큰의 저장소와 전달 방식](0004-csrf-token-delivery.md) | 채택 | 2026-08-20 | 0002(Access Token)가 남긴 후속 작업을 받음 |
| 0005 | [로컬 개발 인증 우회의 제거](0005-remove-local-development-auth-bypass.md) | 채택 | 2026-08-24 | |
| 0006 | [`/api` 접두사를 백엔드 context-path로 받는다](0006-api-prefix-backend-context-path.md) | 채택 | 2026-08-24 | 0004에 결정 6(쿠키 경로)을 낳음 |
| 0012 | [데이터베이스 스키마를 저장소가 소유한다](0012-database-schema-management.md) | 제안 | 2026-08-27 | 도구 미확정. 채택되면 0009의 감수 비용을 닫는다 |

관련 회고: [`/api` 접두사는 누가 떼는가](../retrospective/api-prefix-troubleshooting.md)는
ADR 0005와 0006에 이르기까지의 기록이다.

## 병합 대기 중인 ADR

다음 문서는 아직 `docs/cqrs-lite-adr` 브랜치에만 있다. 위 표의 ADR 0001, 0002(Access Token),
0004, 0012가 **ADR 0008과 0009를 링크하므로** 저 브랜치가 병합되기 전에는 그 링크가 깨진 것처럼
보인다. 특히 0001, 0002, 0004의 "닫힘(2026-08-27)" 항목은 근거가 전부 ADR 0008이다.

| 번호 | 제목 | 비고 |
| --- | --- | --- |
| 0006 | 4인 병렬 개발을 위한 CQRS-lite 협업 경계 | **0006이 양쪽에 있다.** 병합 전에 한쪽을 다시 매겨야 한다 |
| 0007 | 단일 저장소에서 애플리케이션과 인프라 경계 분리 | |
| 0008 | 제한된 AWS 환경에서 단일 진입점과 단일 EC2를 사용한다 | 0001, 0002, 0003, 0004, 0012가 링크한다 |
| 0009 | 운영 RDBMS로 PostgreSQL을 선택한다 | 0012가 링크한다 |

0010과 0011은 비어 있다. 0011은 이미지 업로드 ADR이었으나 초안 단계에서 내렸다.

## 번호가 겹치는 ADR을 가리키는 방법

ADR 0002는 두 개다. 하나는 Access Token, 하나는 그룹 목록 페이지네이션이고, 둘 다 이미 `main`에
병합돼 번호를 바꿀 수 없다. 다른 문서의 링크가 깨지기 때문이다.

그래서 산문에서 ADR을 가리킬 때는 **번호와 링크를 함께 쓰고, 겹치는 번호에는 괄호로 무엇에 관한
결정인지 덧붙인다.**

```text
나쁨   ADR 0002를 따른다
좋음   [ADR 0002(그룹 목록 커서 페이지네이션)](0002-group-list-database-cursor-pagination.md)를 따른다
```
