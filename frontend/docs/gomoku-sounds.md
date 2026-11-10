# 오목 효과음

효과음 파일은 Git에 넣지 않고 S3에 별도로 업로드한다. `soundAssets.js`에는 환경별 URL만 둔다.

- 개발: `s3://techcourse-project-2026/jarihana-dev/sounds/gomoku/`
- 운영: `s3://techcourse-project-2026/jarihana/sounds/gomoku/`
- `APP_DEPLOY_ENV=production`만 운영 파일을 사용하며 나머지는 개발 파일을 사용한다.
- 기존 프론트엔드 배포의 `frontend/` 경로 밖에 두므로 `s3 sync --delete` 대상에 포함되지 않는다.
- 파일명에 SHA-256 앞 12자리를 넣는다. 교체할 때 새 파일을 먼저 업로드하고 코드의 URL을 변경한다.
- 두 환경 모두 `audio/wav`로 제공한다. Web Audio 다운로드에는 해당 사이트 origin의 S3 CORS GET 허용이 필요하다. 기존 버킷 설정이 개발/운영 origin을 허용한다.

## 시작음

- 객체: `start-1s-90628cac3b08.wav`, 1초, 48 kHz stereo PCM16 WAV
- 원본: [Small Gong_Soft Hit_RAW](https://freesound.org/people/cabled_mess/sounds/369428/), cabled_mess
- 라이선스: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 편집: 선택한 징의 1초 길이와 스테레오 잔향을 유지하고, 직전 로컬 시안 대비 420 Hz~3.4 kHz 대역을 약 6 dB 높였다. 피크는 -1 dBFS로 제한했다.
- SHA-256: `90628cac3b0870d0cd34efa3c6e7763fd62ed995e42f1d72955191b29f4f68b4`

## 검증

Playwright는 기본적으로 테스트 코드에서 만든 무음 WAV로 재생 조건과 실제 AudioContext 동작을 확인한다.
승인된 실제 파일을 별도로 검증할 때는 Git 밖의 파일 디렉터리를 `GOMOKU_SOUND_DIR`로 지정할 수 있다.
S3 객체의 HTTP 상태, Content-Type, 사이트별 CORS와 SHA-256은 업로드 후 별도로 확인한다.
