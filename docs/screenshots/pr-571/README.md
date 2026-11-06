# PR #571 비교 캡처

- 변경 전: develop 0517df4b8d126915786ecf55b5de22b263730796
- 변경 후: PR head 31007ce9ea88911974770361993316843f0a28a6
- 환경: 로컬 Webpack 개발 서버, headless Chrome 156.0.8078.81, 한국어, Asia/Seoul, deviceScaleFactor 1, reduced motion
- 데스크톱 viewport: 1440x900, 모바일 viewport: 390x844
- 헤더와 본문을 캡처하고 푸터는 제외했다. 긴 모바일 본문은 전체 높이를 캡처했다.
- 인증 API는 비로그인 UNAUTHENTICATED 401 fixture로 응답했다. 실제 백엔드는 연결하지 않았다.
- 게임방 그림은 개발 S3의 gomoku-lounge-v1.webp와 rhythm-lounge-v1.webp 원본을 변경 없이 임시 다운로드해 브라우저 요청에 공급했다. 캡처 브라우저의 외부 네트워크 접근 제한 때문이다.
- 연습의 음악, 채보, 스프라이트는 해당 커밋의 실제 정적 파일이다. 오디오는 음소거했다.
- lesson-playing-desktop은 들어보기 자동 시연 장면이다. 실제 사용자 입력 통과를 의미하지 않는다.
- single-folded-desktop은 따라 하기의 건너뛰기 링크를 눌러 안내가 접힌 상태다.
- 신규 라우트는 develop에 대응 화면이 없어 변경 후 캡처만 제공한다.

검증 결과: 캡처 16개 모두 가로 넘침 없음, 브라우저 pageerror 0건. 두 개발 서버의 Webpack 컴파일 성공. 화면 캡처 작업으로 코드와 테스트는 수정하지 않았다. 실제 소리와 iOS 실기기는 확인하지 않았다.

이미지는 PR 코드 diff에 추가하지 않고 docs/pr-571-comparison-captures 브랜치에 보관한다. 상세 조건은 capture-report.json에 기록했다.
