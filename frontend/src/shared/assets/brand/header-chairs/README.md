# 헤더 입체 의자 아이콘

대화에서 승인한 "입체 의자 캐릭터형" 시안의 왼쪽 아이콘을 built-in ImageGen으로 각각 분리했다.
시안에 포함된 민트색 의자, 크림색 소품, 카메라 각도와 재질을 보존했다.
후속 색상 편집에서는 기존 `jarihana-favicon.png`를 색상 참고 이미지로 사용해
연두빛을 제거하고 브랜드의 선명한 민트/청록색(`#2ac1bc`)으로 의자만 조정했다.

| 파일 | 용도 | 소품 |
| --- | --- | --- |
| `browse.png` | 뭐있나? | 돋보기 |
| `memories.png` | 뭐했나? | 사진 |
| `proposal.png` | 뭐할래? | 말풍선 |

생성 프롬프트의 공통 요구:

> Extract only the corresponding icon from the approved LEFT dropdown as one isolated UI icon on a genuinely transparent alpha background. Preserve the exact mint toy chair, cream accessory, camera angle, soft highlights and styling. Remove all surrounding UI, text, card backgrounds and other objects. Keep the entire chair and accessory visible and readable at 36px, with no badge, tile, watermark or additional features.

각 프롬프트의 대상은 위 표의 돋보기/사진/말풍선이다. 이미지 원본은 별도로 보존하고,
배포 파일만 중앙 960px 정사각형으로 자른 뒤 `sips`로 144px PNG로 축소했다.
투명 알파를 유지하며 실제 화면에서는 `--header-group-icon-size`의 36px로 표시한다.

색상 편집 프롬프트의 공통 요구:

> Recolor only the plastic chair to match the brand chair reference: saturated mint aqua/turquoise teal, brand hue #2ac1bc. Remove the pale yellow-green cast. Preserve the geometry, camera angle, lighting, cream accessory and golden details, composition and transparent alpha. Change nothing except the chair color.
