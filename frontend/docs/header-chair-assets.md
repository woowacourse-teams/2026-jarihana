# 헤더 입체 의자 아이콘

대화에서 승인한 "입체 의자 캐릭터형" 시안의 왼쪽 아이콘을 built-in ImageGen으로 각각 분리했다.
시안에 포함된 민트색 의자, 크림색 소품, 카메라 각도와 재질을 보존했다.
후속 색상 편집에서는 기존 `jarihana-favicon.png`를 색상 참고 이미지로 사용해
연두빛을 제거하고 브랜드의 선명한 민트/청록색(`#2ac1bc`)으로 의자만 조정했다.

| S3 객체 파일명 | 용도 | 소품 |
| --- | --- | --- |
| `browse-4f688d968a42.png` | 뭐있나? | 돋보기 |
| `memories-a90bf2e651a0.png` | 뭐했나? | 사진 |
| `proposal-bbe9cc84d137.png` | 뭐할래? | 말풍선 |

이미지 파일은 저장소와 프론트엔드 번들에 포함하지 않는다. 같은 파일을 다음 두 S3 경로에
저장하고 `src/app/headerChairAssets.js`에서 공개 객체 URL을 직접 참조한다.

- dev: `s3://techcourse-project-2026/jarihana-dev/images/header-chairs/`
- prod: `s3://techcourse-project-2026/jarihana/images/header-chairs/`
- 공개 URL: `https://techcourse-project-2026.s3.ap-northeast-2.amazonaws.com/{prefix}/images/header-chairs/{파일명}`

기존 게임 이미지와 같이 `APP_DEPLOY_ENV=production`일 때 prod, 로컬과 나머지 환경은 dev를 사용한다.
객체의 Content-Type은 `image/png`, Cache-Control은 `public, max-age=31536000, immutable`이다.
파일명에 SHA-256 앞 12자리를 붙여 변경 시 새 객체로 게시한다. 기존 객체를 덮어쓰지 않는다.

생성 프롬프트의 공통 요구:

> Extract only the corresponding icon from the approved LEFT dropdown as one isolated UI icon on a genuinely transparent alpha background. Preserve the exact mint toy chair, cream accessory, camera angle, soft highlights and styling. Remove all surrounding UI, text, card backgrounds and other objects. Keep the entire chair and accessory visible and readable at 36px, with no badge, tile, watermark or additional features.

각 프롬프트의 대상은 위 표의 돋보기/사진/말풍선이다. 이미지 원본은 별도로 보존하고,
배포 파일만 중앙 960px 정사각형으로 자른 뒤 `sips`로 144px PNG로 축소했다.
투명 알파를 유지하며 실제 화면에서는 `--header-group-icon-size`의 36px로 표시한다.

색상 편집 프롬프트의 공통 요구:

> Recolor only the plastic chair to match the brand chair reference: saturated mint aqua/turquoise teal, brand hue #2ac1bc. Remove the pale yellow-green cast. Preserve the geometry, camera angle, lighting, cream accessory and golden details, composition and transparent alpha. Change nothing except the chair color.
