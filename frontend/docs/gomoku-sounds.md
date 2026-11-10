# 오목 효과음

효과음 파일은 Git에 넣지 않고 S3에 별도로 업로드한다. `soundAssets.js`에는 환경별 URL만 둔다.

- 개발: `s3://techcourse-project-2026/jarihana-dev/sounds/gomoku/`
- 운영: `s3://techcourse-project-2026/jarihana/sounds/gomoku/`
- `APP_DEPLOY_ENV=production`만 운영 파일을 사용하며 나머지는 개발 파일을 사용한다.
- 기존 프론트엔드 배포의 `frontend/` 경로 밖에 두므로 `s3 sync --delete` 대상에 포함되지 않는다.
- 파일명에 SHA-256 앞 12자리를 넣는다. 교체할 때 새 파일을 먼저 업로드하고 코드의 URL을 변경한다.
- 두 환경 모두 `audio/wav`로 제공한다. Web Audio 다운로드에는 해당 사이트 origin의 S3 CORS GET 허용이 필요하다. 기존 버킷 설정이 개발/운영 origin을 허용한다.

## 시작음

- 객체: `start-1s-eb641c00b98b.wav`, 1초, 48 kHz stereo PCM16 WAV
- 원본: [Small Gong_Soft Hit_RAW](https://freesound.org/people/cabled_mess/sounds/369428/), cabled_mess
- 라이선스: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 편집: 낮은 음역과 저음층, 스테레오 잔향, 1초 자르기와 끝 페이드, 음량 증가
- 승인한 최종 시안을 변환 없이 업로드한다.
- SHA-256: `eb641c00b98ba6389f70cfa8f1e599bcf5f4ffd590873eb1633cf102a158c3fd`

## 착수음

- 객체: `stone-e83122800fe1.wav`, 0.24초, 48 kHz mono PCM16 WAV
- 원본: [Freesound 840424](https://freesound.org/people/Hongsungbock/sounds/840424/), Hongsungbock
- 라이선스: [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)
- 편집: 원본 0.578253968~0.818253968초 구간 추출, 짧은 페이드와 -6 dBFS 피크 정규화
- 승인한 착수음 1번을 변환 없이 업로드한다.
- SHA-256: `e83122800fe1e8c18b3390337aa199464ace4c440899c371df1ea1e0eddb129e`

## 검증

Playwright는 기본적으로 테스트 코드에서 만든 무음 WAV로 재생 조건과 실제 AudioContext 동작을 확인한다.
승인된 실제 파일을 별도로 검증할 때는 Git 밖의 파일 디렉터리를 `GOMOKU_SOUND_DIR`로 지정할 수 있다.
S3 객체의 HTTP 상태, Content-Type, 사이트별 CORS와 SHA-256은 업로드 후 별도로 확인한다.
