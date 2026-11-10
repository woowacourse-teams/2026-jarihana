# 오목 효과음

효과음 파일은 Git에 넣지 않고 S3에 별도로 업로드한다. `soundAssets.js`에는 환경별 URL만 둔다.

- 개발: `s3://techcourse-project-2026/jarihana-dev/sounds/gomoku/`
- 운영: `s3://techcourse-project-2026/jarihana/sounds/gomoku/`
- `APP_DEPLOY_ENV=production`만 운영 파일을 사용하며 나머지는 개발 파일을 사용한다.
- 기존 프론트엔드 배포의 `frontend/` 경로 밖에 두므로 `s3 sync --delete` 대상에 포함되지 않는다.
- 파일명에 SHA-256 앞 12자리를 넣는다. 교체할 때 새 파일을 먼저 업로드하고 코드의 URL을 변경한다.
- 두 환경 모두 `audio/wav`로 제공한다. Web Audio 다운로드에는 해당 사이트 origin의 S3 CORS GET 허용이 필요하다. 기존 버킷 설정이 개발/운영 origin을 허용한다.

## 시작음

- 객체: `start-1500ms-725a2f7fce07.wav`, 1.5초, 48 kHz stereo PCM16 WAV
- 원본: [Small Gong_Soft Hit_RAW](https://freesound.org/people/cabled_mess/sounds/369428/), cabled_mess
- 라이선스: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 편집: 기존 징의 타격음과 음량을 살리고 원래 잔향을 1.5초까지 이어 붙였다. 0.64초부터 점진적으로 감쇠하며 끝 샘플을 0으로 맞췄다. 피크는 -1 dBFS다.
- SHA-256: `725a2f7fce070edd4beaa7b901e796cb3a328a7800bd0f09bf737371f5b9adb6`

## 검증

Playwright는 기본적으로 테스트 코드에서 만든 무음 WAV로 재생 조건과 실제 AudioContext 동작을 확인한다.
승인된 실제 파일을 별도로 검증할 때는 Git 밖의 파일 디렉터리를 `GOMOKU_SOUND_DIR`로 지정할 수 있다.
S3 객체의 HTTP 상태, Content-Type, 사이트별 CORS와 SHA-256은 업로드 후 별도로 확인한다.
