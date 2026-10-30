# 스파링 체험판 복원 지점

v1~v6 브랜치: `feat/sparring-capsule-prototype`.
v7 브랜치: `feat/sparring-fast-slide` (v6에서 분기).
v8 브랜치: `feat/sparring-capsule-inlet` (v7에서 분기).
v9 브랜치: `feat/sparring-directional-inlet` (v8에서 분기).
v10 브랜치: `fix/sparring-flow-and-pipe-route` (v9에서 분기).
현재 작업 브랜치: `feat/sparring-capsule-characters` (v10에서 분기).
각 버전은 별도 커밋과 로컬 Git 태그로 보관한다. 기존 커밋을 덮어쓰거나 합치지 않는다.
원격 저장소에는 아직 올리지 않았다. Git 태그가 남아 있는 한 사이드 채팅과 무관하게 복원할 수 있다.

| 복원 이름 | 커밋 | 내용 |
| --- | --- | --- |
| `sparring/v1-capsules` | `9e4e5303` | 최초 보존한 체험판과 기획 맥락. 이전 충돌 말풍선 |
| `sparring/v2-soft-vs` | `da389c8a` | 받아치기 중복 배출 제거, 둥근 카드형 VS, 페이드인·아웃 |
| `sparring/v3-comic-balloons` | `c45d2bf9` | 비대칭 만화 말풍선, 큰 본문, 의자 작성자, 안내 문구 축소 |
| `sparring/v4-pipe-stations` | `f4ef8608` | 파이프에 연결한 주장 깃발, 의자 투표, 착석 반응과 수치 계기 |
| `sparring/v5-toon-arena` | `66bd5177` | 의자 착석 제거, 주장 클릭 선택, 파이프 수치, 큰 통과 카툰 셰이딩 |
| `sparring/v6-brand-studio` | `c9d44a88` | 기존 캐릭터 에셋 기준의 부드러운 재질·환경광·그림자, 큰 통과 간단한 투표 유지 |
| `sparring/v7-fast-slide` | `0ba70673` | 빠른 구르기, 실제 앞 범퍼 충돌과 즉시 의견 표시, 빠른 껍질 열림 |
| `sparring/v8-capsule-inlet` | `5ac4dbef` | 투입구 입력창, 충격파 제거, 불규칙한 구르기와 물리 껍질 분리 |
| `sparring/v9-directional-inlet` | `d9af380e` | 편 방향의 투입구와 화면 끝 파이프, 메시지를 담아 이동하는 캡슐 버튼 |
| `sparring/v10-connected-pipes` | `8c139f12` | 미끄럼틀 배출 간격·개수 제한, 입력구에서 가장자리를 거쳐 위 통까지 이어지는 배관 |
| `sparring/v11-capsule-characters` | 태그가 가리키는 커밋 | 캡슐 속 백팩·사원증 캐릭터, 미끄럼틀 등장·손짓·퇴장, 두 캐릭터의 받아치기 |

## 이전 버전을 별도 폴더에서 보기

현재 변경을 건드리지 않고 별도 작업 폴더를 만든다. 아래 경로가 이미 있으면 새로운 이름을 쓴다.

```sh
git worktree add --detach /Users/cws/workspace/2026-jarihana-sparring-v2 sparring/v2-soft-vs
```

만들어진 폴더의 `prototypes/chair-sparring/`에서 서버를 실행한다.
현재 체험판의 48733 포트를 유지하고, 복원 버전은 비어 있는 별도 포트를 사용한다.

```sh
python3 -m http.server 48734 --bind 127.0.0.1
```

새 버전으로 돌아오려면 48733 주소의 기존 체험판을 다시 연다.
현재 브랜치 자체를 되돌려야 하면 변경 내용을 확인한 뒤 해당 커밋을 `git revert`로
취소해 되돌린 이력도 남긴다. `reset --hard`로 이력을 삭제할 필요가 없다.

주의: 커밋과 태그는 코드·문서를 보존한다. 브라우저에 저장된 투표와 채팅은 Git에
포함되지 않으며 포트별로 저장소가 나뉜다. 과거 코드를 열어도 과거 데이터 시점까지
자동으로 돌아가지는 않는다.
