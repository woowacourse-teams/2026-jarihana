# 자리하나 회원가입 보충 이미지

기존 `signup-crew.png`, `signup-coach.png`의 둥근 얼굴, 단순한 표정과 부드러운 3D 클레이 질감을 기준으로 제작한 이미지다.

## 파일

| 파일 | 용도 | 구분 요소 |
| --- | --- | --- |
| `signup-bootcamp.webp` | 부트캠프 소속 카드 | 민트 후드, 헤드폰, 태블릿과 펜 |
| `signup-company.webp` | 회사 소속 카드 | 하늘색 셔츠, 베이지 바지와 텀블러 |
| `signup-others.webp` | 그 외 소속 묶음 그림(현재 미사용) | 코치, 부트캠프 수강생과 현직자의 묶음 |
| `signup-complete.webp` | 가입 완료 그림(현재 미사용) | 민트 의자, 체크 토큰과 작은 축하 장식 |
| `icons/affiliation-crew.svg` | 크루 소속 아이콘 | 백팩 |
| `icons/affiliation-coach.svg` | 코치 소속 아이콘 | 설명 보드 |
| `icons/affiliation-bootcamp.svg` | 부트캠프 소속 아이콘 | 코드 태블릿 |
| `icons/affiliation-company.svg` | 회사 소속 아이콘 | 서류 가방 |
| `icons/wooteco-logo.svg` | 우테코 크루 인증 버튼 로고 | 가운데 채운 원, 같은 중심의 얇은 고리, 고리 위 대각선 양 끝의 작은 원 두 개 |

그림 4종은 512 x 512 WebP(품질 85)이며 투명 알파 채널을 포함한다. 화면에서 최대 240 CSS px 안팎으로 쓰므로 2배 해상도로 줄였고, 1254 x 1254 PNG 원본에서 장당 20~50KB가 되었다. 흰색과 옅은 민트색 배경에서 사용하며, `object-fit: contain`으로 전신과 소품을 유지한다. 기존 그림과 함께 사용할 때에는 같은 정사각형 이미지 영역에 배치한다. 캐릭터는 160~240 CSS px, 묶음 그림은 180~280 CSS px, 가입 완료는 120~240 CSS px를 권장한다.

소속 아이콘 SVG는 `24 x 24` viewBox, `1.75` 선 두께, 둥근 선 끝과 `currentColor`를 사용한다. 우테코 로고는 같은 viewBox에 `currentColor` 채움을 쓰고, 고리는 `vector-effect="non-scaling-stroke"`로 표시 크기와 관계없이 1.5px 두께를 유지한다. 검은 배경 버튼 안에서는 흰색으로 쓴다. 인라인 SVG로 넣으면 부모의 `color`를 따르며, 외부 파일을 `img`로 불러오면 기본 검정으로 표시된다. 옆에 소속 이름이 있으면 아이콘은 `aria-hidden="true"` 또는 `alt=""`로 처리한다. 단독으로 사용하는 인라인 SVG의 제목 ID는 페이지에서 중복되지 않도록 조정한다.

## 사용처와 검증

- 가입 첫 화면 카드에 `signup-bootcamp.webp`, `signup-company.webp`를 쓴다. `signup-others.webp`, `signup-complete.webp`와 소속 아이콘은 아직 화면에서 쓰지 않는다.
- '우테코 크루 인증' 버튼은 `wooteco-logo.svg`와 같은 모양을 `SignupPage`에 인라인 SVG로 넣었다.
- 원본 이미지는 이미지 생성 도구로, SVG는 직접 작성했다.
- WebP 4종의 디코딩, 512 x 512 크기, RGBA와 투명 알파 채널을 확인했다.
- SVG 5종의 XML 구문과 viewBox를 확인했고, 우테코 로고는 모든 원이 24 x 24 영역 안에 있는지와 160px, 48px, 18px 렌더링을 확인했다.
