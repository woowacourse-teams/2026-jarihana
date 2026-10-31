# 자리하나 의자 캡슐 스파링 체험판

이 폴더는 스파링 참여 흐름과 연출을 실험하는 **독립 로컬 프로토타입**이다.
실제 자리하나 서비스에 연결된 기능이나 확정된 제품 설계가 아니다.

처음 이어받는 사람은 [기획 맥락과 결정 사항](./CONTEXT.md)을 먼저 읽는다.
사용자가 왜 이 구조를 선택했는지, 최근 피드백, 확인한 동작과 미결 사항을 담았다.
버전별 커밋과 이전 화면 복원 방법은 [복원 지점](./VERSIONS.md)을 참고한다.

## 실행

이 폴더에서 다음을 실행한다. Python 3와 WebGL을 지원하는 브라우저가 필요하다.

```sh
python3 serve.py
```

브라우저에서 `http://127.0.0.1:48732/`를 연다. 같은 포트에 이전 체험판이 이미
실행 중이면 그 프로세스가 기존 폴더를 제공하므로, 이 폴더에서 별도 포트를 쓰려면
`python3 -m http.server 48733 --bind 127.0.0.1`을 실행하고 48733으로 접속한다.
브라우저 저장소는 주소와 포트별로 나뉜다.

화면 하단의 ‘다른 탭에서 함께 참여해보기’는 같은 브라우저에서 다른 참여자를
흉내 내는 기능이다. 데이터는 브라우저에 저장되므로 브라우저 데이터가 지워지면
함께 지워지고, 다른 브라우저나 기기에는 공유되지 않는다.

## 확인

```sh
node --test --test-concurrency=1 src/*.test.mjs
```

물리 검증은 병렬 부하에 따른 cannon-es의 시간 예산 중단을 피하도록 순차 실행한다.
받아치기 중복과 모션의 브라우저 회귀 검증은 별도 실행 중인 48733 체험판을 대상으로 한다.
기존 Playwright 설치를 재사용하며 새 의존성을 설치할 필요는 없다.

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tests/clash.browser.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tests/stations.browser.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tests/slide.browser.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tests/composer.browser.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tests/conduit.browser.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tests/flow.browser.cjs
PLAYWRIGHT_MODULE=/absolute/path/to/node_modules/playwright node tests/characters.browser.cjs
```

다른 주소를 쓰면 `PREVIEW_URL`로 지정한다. 테스트는 자체 격리 브라우저에서 실행하고,
스크린샷과 영상은 `/tmp/sparring-*`에 남긴다.

별도의 설치나 빌드 없이 실행할 수 있도록 Three.js와 cannon-es 파일 및 라이선스를
`vendor/`에 포함했다. 이 구조를 본서비스의 의존성 선택으로 간주하지 않는다.

## 코드 길잡이

- `src/app.js`, `src/room-store.js`: 주제, 편 선택, 의견, 받아치기와 로컬 저장
- `src/scene.js`, `src/capsules.js`, `src/physics.js`: 통, 파이프와 캡슐 흐름
- `src/composer.js`, `composer.css`: 투입구 입력, 전송 연출과 모바일 키보드 배치
- `src/studio-materials.js`: 기존 캐릭터 에셋에 맞춘 반무광 재질과 스튜디오 환경광
- `src/characters.js`, `src/character-motion.js`: 백팩·사원증 피규어와 등장·손짓·퇴장
- `src/dispenser.js`, `src/capsule-reveals.js`: 미끄럼틀과 의견 말풍선
- `src/clash.js`: 받아치기 캡슐의 대면 발사와 충돌 지점 말풍선 연출
- `src/fixtures.js`: 예시 주제에서만 사용하는 예시 의견
- `QA.md`: 시점별 검증과 한계

v11은 기존 캐릭터 이미지의 특징을 참고한 절차적 3D 근사다. 원본 3D 에셋을
가져온 것이 아니며, 최종 캐릭터 조형과 모바일 성능은 별도 확인이 필요하다.
