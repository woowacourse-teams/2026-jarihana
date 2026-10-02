# 웹푸시·알림함 구현 단계

관련 결정: [백엔드 ADR 0015](../backend/docs/adr/0015-web-push-and-notification-inbox.md).
기능은 아래 순서로 구현한다. **각 단계의 변경과 검증을 마친 뒤 사용자에게 커밋 허락을 받고,
커밋한 다음 다음 단계로 넘어간다.** 커밋 승인은 그 단계에만 적용한다.

이 문서는 구현 중 사용하는 진행표다. **6단계 구현·검증과 결과 기록을 마치면 이 파일을 삭제한다.**
삭제할 때 이 파일로 연결된 ADR 등 문서의 링크도 함께 제거한다. 팀이 계속 참고할 구조·결정 이유와
DB·API·화면 계약, 검증 결과는 ADR과 각 상세 문서에 남긴다.

| 단계 | 범위 | 완료 증거 | 커밋 제목 |
| --- | --- | --- | --- |
| 1 | ADR, DB 모델, Markdown API 계약, 화면 연결 계약 | 문서 링크·내부 참조·API 계약 일치 확인. 아직 구현되지 않은 계약 명시 | `docs(notification): 웹푸시와 알림함 구현 계약을 정리한다` |
| 2 | 알림함·구독·전송 대기 엔티티, Repository, SQL 마이그레이션 | 도메인 테스트, DB 제약·중복·조회 통합 테스트, SQL 적용 후 validate, truncate 격리 | `feat(notification): 알림과 구독별 전송 데이터 모델을 추가한다` |
| 3 | 기존 업무 사건 발행, 동기 저장, 알림함 조회·읽음·삭제 API | 기존 정책 회귀, 동일 TX rollback, 구독0개 기록, RestAssured, 전체읽음/삭제 경합 | `feat(notification): 업무 알림과 알림함 API를 구현한다` |
| 4 | 구독 API, 현재 브라우저 로그아웃 연결 해제, 푸시 워커·외부 어댑터 | 소유권·CSRF·expired-access logout, 선점·lease·부분 실패·재시도 상한, Java21 연동 | `feat(push): 브라우저 구독과 푸시 전송 워커를 구현한다` |
| 5 | 종 버튼·알림함 UI, 읽음·삭제, 이 기기 설정, 설치 안내·SW·클릭 복귀 | lint, 관련 Jest, build, 직접 브라우저·키보드·접근성·모션·계정 전환 확인 | `feat(push): 알림함 UI와 PWA 웹푸시를 연결한다` |
| 6 | 전체 회귀, 실기기, SQL·CDN·SW 배포 경로, 운영 설정·관측 문서, 완료 후 진행표·참조 링크 삭제 | backend 전체 test, frontend lint/typecheck/test/build/core e2e, 지원 환경 실제 수신·클릭, 배포 리허설, 결과 기록·문서 링크 검증 | `test(push): 웹푸시 통합 동작과 배포 경로를 검증한다` |

## 고정 동작

- 기존 코드가 실제 수행하는 신청·승인·미승인만 알린다. 정원 마감 때 대기 신청을 유지한다.
- 푸시 구독이 없어도 알림함에 저장한다. 같은 사건은 수신 회원당 한 건이다.
- 모든 활성 브라우저 구독에 각각 전송한다. 부분 실패는 실패한 구독만 제한적으로 재시도한다.
- 전체 읽음은 목록을 유지한다. 삭제 성공 때만 해당 행이 슬라이드 퇴장한다.
- 알림 조회·변경·푸시 클릭은 서버에서 현재 회원의 소유권을 확인한다.
- 알림과 업무·전송 대기는 같은 TX에 저장하고, 외부 HTTP는 커밋 뒤 수행한다.
- 실제 Push Service 수락·기기 표시·사용자 읽음을 서로 다른 상태로 취급한다.

## 실행과 검증 경계

백엔드는 기존 Java21·Spring·PostgreSQL과 TDD/RestAssured/Testcontainers 규칙을 따른다.
프론트는 기존 JS/JSX·React·Webpack·공통 API client를 사용하고 별도 에이전트 QA를 하지 않는다.
Markdown API 계약을 Controller·요청/응답 DTO·ErrorCode에 반영하고, 해당 API의
RestAssured 테스트와 함께 이 기능 PR에서 완성한다.

테스트 환경의 create-drop과 실제 운영 SQL 적용은 각각 검증한다. 현재 수동 SQL 적용 방식을
유지하며, 배포는 additive SQL → 호환 backend → frontend 순서로 리허설한다.
운영 배포·병합·push는 단계 커밋 허락과 별개의 요청이다.

실기기·외부 push·운영 자격 증명이 없는 검증은 미검증으로 남긴다.
그 항목을 mock 테스트로 통과했다고 표시하거나 전체 기능 완료로 보고하지 않는다.

## 계약 문서

- [알림·구독·전송 모델](../backend/docs/context/domain/model/notification.md)
- [알림함·웹푸시 API](../backend/docs/context/api/endpoints/notifications.md)
- [프론트 연결 계약](../frontend/docs/IMPLEMENTATION_MAP.md#웹푸시알림함-구현-계약-구현-전)
