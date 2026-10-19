# PR #437 프론트엔드 화면 비교

- 캡처 날짜: 2026-10-20
- 변경 전 커밋: ea4004bc (develop)
- 변경 후 커밋: 204ba268 (PR #437, 100명 초과 문구 변경 반영)
- 데스크톱 화면: 1440 x 1000, 모바일 화면: 390 x 1000
- 브라우저: Playwright로 구동한 Chrome, 한국어, Asia/Seoul
- 실행 방식: 프로덕션 빌드, 브라우저 API fixture
- 알림 문구는 서버가 만드는 형식 그대로의 예시 데이터다. 활동 기록 사진은 저장소의 서비스 일러스트를 썼고, 기록, 댓글, 반응은 비교용 예시 데이터다.

| 파일 | 화면 |
| --- | --- |
| before-inbox-desktop.png | 변경 전 데스크톱 알림함, 활동 기록 알림 없음 |
| after-inbox-desktop.png | 변경 후 데스크톱 알림함, 좋아요 묶음, 새 댓글, 100명 초과 문구(회원님의 댓글이 무수한 관심을 받고 있어요.) |
| before-inbox-mobile.png | 변경 전 모바일 알림함 |
| after-inbox-mobile.png | 변경 후 모바일 알림함 |
| before-post-link-desktop.png | 변경 전 `/activities?mine=true&post=77` 진입, 2번째 페이지 기록이라 상세가 열리지 않고 주소만 지워짐 |
| after-post-link-desktop.png | 변경 후 좋아요 알림 클릭, 2번째 페이지까지 찾아 기록 상세가 열림 |
| after-post-link-mobile.png | 변경 후 모바일에서 좋아요 알림 클릭 후 전체 화면 기록 상세 |
