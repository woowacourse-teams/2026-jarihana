# 랜딩 이미지

승인된 랜딩 브랜치 `d6112dc`의 현재 사용 자산만 가져왔다. 제품 이용 예시는 실제 공통 UI를 사용하는 DOM 애니메이션이며, 서비스 전체 화면 캡처는 포함하지 않는다.

- `default-group-{study,club,session}.webp`: 서비스의 기존 1254×1254 대표 일러스트를 WebP로 인코딩한 자산. 원본은 `../illustrations/default-group-*-3d.png`.
- `landing-brand-hero.webp`, `landing-hero-room.webp`: 기존 브랜드 장면과 의자를 분리한 배경(1672×941). 사용자가 승인한 imagegen 편집 이미지.
- `landing-brand-hero-mobile.webp`, `landing-hero-room-mobile.webp`: 같은 장면의 모바일 세로 버전(941×1672).
- `landing-hero-chair.webp`: 프레임 밖으로 나오는 민트 의자 투명 레이어(1254×1254). 정지 이미지는 동작 줄이기 및 레이어 로딩 실패 시에도 사용한다.
- `landing-hero-chair-turn.webp`: 위 의자 원본을 참조해 내장 imagegen으로 만든 4×4 회전 시트(1254×1254, 16시점)를 WebP로 인코딩했다. 뒷모습에서 정면으로 돌아서는 짧은 구간에만 쓰며, 마지막에는 기존 고해상도 의자로 연결한다. 별도 3D 모델과 런타임 의존성은 추가하지 않았다.
  생성 지시: 동일한 민트 의자의 일체형 등받이·좌판, 가로 구멍, 짧고 두꺼운 네 다리와 질감을 유지한다. 고정 카메라에서 뒷면→옆면→원본 정면 각도를 16개 동일 크기 셀에 배치한다. 배경·그림자·글자 없이 실제 투명 배경으로 만든다.
- `activity-study-photo.webp`: Marvin Meyer의 [Unsplash 사진](https://unsplash.com/photos/SYTO3xs06fU), Unsplash License. 1200px WebP. 실제 회원의 기록이 아닌 사진 첨부 기능의 이용 예시다.
