# PR #369 프론트엔드 화면 비교

- 캡처 날짜: 2026-10-14, 변경 후 화면은 하트 반응으로 바꾼 뒤 2026-10-16에 다시 캡처
- 변경 전 커밋: c3245f5f22e8319156d034936e8a5bac936f5b75 (develop)
- 변경 후 커밋: 167381fb (PR #369, 하트 반응). 사진 크게 보기만 4d14465cc824de7be0b85c6aa9c466c3d6892964 기준
- 데스크톱 화면: 1440 x 1000
- 모바일 화면: 390 x 1000
- 브라우저: Playwright Chromium, 한국어, Asia/Seoul
- 실행 방식: Node.js 24, Webpack 개발 서버 2개, 브라우저 API fixture. 하트 반응 화면은 Node.js 22, 프로덕션 빌드, 브라우저 API fixture
- 사진과 기본 게시물은 공개 활동 피드를 사용했다. 댓글, 반응, 종료 상태, 회원 및 그룹 상세 정보는 비교용 예시 데이터다.

| 파일 | 화면 |
| --- | --- |
| before-feed-desktop.png | 변경 전 데스크톱 활동 피드 |
| after-feed-desktop.png | 변경 후 데스크톱 활동 피드, 하트 수, 댓글 수, 종료된 모임 카드 |
| before-card-open-desktop.png | 변경 전 카드 선택 후 그룹 상세의 활동 기록 탭 |
| after-detail-desktop.png | 변경 후 카드 선택 후 기록 상세 다이얼로그와 하트 반응 |
| before-feed-mobile.png | 변경 전 모바일 활동 피드 |
| after-feed-mobile.png | 변경 후 모바일 활동 피드 |
| after-detail-mobile.png | 모바일 전체 화면 기록 상세와 댓글 입력 |
| after-photo-viewer-desktop.png | 사진 크게 보기 |

두 화면에 같은 게시물과 사진을 적용하고 이미지 로딩을 기다린 뒤 캡처했다. 모든 PNG를 직접 확인했다.
