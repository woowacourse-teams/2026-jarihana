# 랜딩 이미지

승인된 랜딩 브랜치 `d6112dc`의 현재 사용 자산만 가져왔다. 제품 이용 예시는 실제 공통 UI를 사용하는 DOM 애니메이션이며, 서비스 전체 화면 캡처는 포함하지 않는다. 3D 경기장이라 DOM으로 옮길 수 없는 토론해요만 경기장 부분을 녹화한 영상을 쓴다.

- `default-group-{study,club,session}.webp`: 서비스의 기존 1254×1254 대표 일러스트를 WebP로 인코딩한 자산. 원본은 `../illustrations/default-group-*-3d.png`.
- `landing-brand-hero.webp`, `landing-hero-room.webp`: 기존 브랜드 장면과 의자를 분리한 배경(1672×941). 사용자가 승인한 imagegen 편집 이미지.
- `landing-brand-hero-mobile.webp`, `landing-hero-room-mobile.webp`: 같은 장면의 모바일 세로 버전(941×1672).
- `landing-hero-chair.webp`: 프레임 밖으로 나오는 민트 의자 투명 레이어(1254×1254). 정지 이미지는 동작 줄이기 및 레이어 로딩 실패 시에도 사용한다.
- `activity-study-photo.webp`: Marvin Meyer의 [Unsplash 사진](https://unsplash.com/photos/SYTO3xs06fU), Unsplash License. 1200px WebP. 실제 회원의 기록이 아닌 사진 첨부 기능의 이용 예시다.
- `sparring-arena-demo.mp4`: 토론 상세(`/sparring/:id`)의 경기장 부분을 860×900 화면, 2배 해상도에서 예시 데이터로 조작하며 녹화한 영상(1146×1090, H.264, 16.4초, 소리 없음). 앱 헤더와 상세 화면의 뒤로 가기, 연결 상태는 잘라내거나 가렸다. 편 고르기, 지난 한마디에 받아치기, 보내기, VS 장면 순서이며 캡슐 이동 구간은 3배속, 조작 구간은 1.25배속이다. 회색 원은 누르는 위치를 알리는 녹화용 표시다. 주제와 이름(모아, 하루)은 실제 회원의 기록이 아니다.
- `landing-clubhouse-orbit-poster.webp`: 아지트(PR #617, `abcd936b`)의 꾸미기 체험 화면을 메뉴와 버튼 없이 3D 화면만 남겨 1440×810 화면, 2배 해상도로 녹화한 영상에서 고른, 아지트를 둘러보는 구도의 장면(1600×832)이다. 첫 화면은 실제 아지트 3D 장면을 그리며, 이 이미지는 장면을 불러오기 전과 그래픽 가속을 쓸 수 없을 때 보인다. 아지트 화면의 캐릭터와 소품은 체험 공간의 기본 예시다.
- `landing-clubhouse-decorate.webp`: 같은 녹화에서 고른 장면(960px). 짙은 나무색 테마로 바꾼 아지트다.
- `landing-clubhouse-inside.webp`, `landing-clubhouse-music.webp`: dev 서버의 예시 모임 아지트에 방문자로 들어가 1440×900 화면, 2배 해상도로 찍은 1인칭 장면을 메뉴와 버튼 없이 잘라 낸 이미지(960px)다. 앞의 것은 현관 앞에서 열린 문과 손을 흔드는 캐릭터, 안쪽 탁자에 둘러앉은 캐릭터들이 보이는 장면이고, 뒤의 것은 현관 안쪽에서 보드게임 탁자에 둘러앉은 캐릭터들과 위층의 캐릭터가 보이는 장면이다. 캐릭터는 의자 배치를 따라 앉거나 마당에서 맞이하는 장식용 인물이며 실제 접속자가 아니다.
- `sparring-arena-demo-start.webp`, `sparring-arena-demo-end.webp`: 같은 영상의 첫 장면과 마지막 장면. 재생 전 포스터와 동작 줄이기 설정의 정지 화면으로 쓴다.
- `landing-sparring-faceoff.mp4`: 랜딩의 토론하나? 카드용. `sparring-arena-demo.mp4`의 10.4초부터 끝까지(약 6초)를 경기장 부분(가로 173, 세로 150에서 800×640)만 잘라 H.264로 다시 인코딩했다(소리 없음). 캡슐이 내려온 뒤 두 캐릭터가 VS로 맞서 한마디를 주고받는 장면이다.
- `landing-sparring-faceoff.webp`: 같은 영상의 2.9초 장면. 영상을 불러오기 전과 동작 줄이기 설정에서 보인다.
