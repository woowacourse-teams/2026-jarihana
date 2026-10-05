# 홈 히어로 32:9 전체 장면 재생성

## 개발용 원본 구도 비교 세트

2026-10-05 추가한 비교 세트는 개발 화면의 `히어로 이미지 버전`에서만 선택한다. 기본값 `현재 버전`과 아래 기존 responsive PNG 3개는 유지한다. production 빌드에는 비교용 PNG와 선택 상자가 포함되지 않는다.

- `보정 세트 (낮·노을·밤)`: 낮·노을·은은한 성운의 밤. 각각 `jarihana-hero-{day,sunset,night}-classic.png`.
- `성운 강조 (밤 전용)`: 낮·노을은 보정 세트를 공유하며 밤에만 `jarihana-hero-night-nebula.png`를 사용한다.
- 시간대 선택은 이미지 버전과 독립적이다. 자동 옵션에는 현재 시간대도 표시한다. `현재 버전`으로 돌아가면 비교 이미지 override를 제거하고, 새로고침하면 두 선택은 `자동`과 `현재 버전`으로 초기화된다.
- 모바일은 선택 상자를 한 줄로 줄여 히어로 문구를 가리지 않는다. 화면 낭독기용 각 선택 이름은 유지한다.

4개 파일 모두 2144 × 603, 정확한 32:9다. 내장 image_gen으로 좌우 배경이 넓고 모든 인물과 중앙 행성이 세로 안전 범위 안에 놓이도록 새 장면을 생성했다. 생성 도구가 반환한 약 3:1 캔버스에서 계획된 32:9 영역을 추출했으며, 도구가 native 32:9를 반환한 것은 아니다. 리사이즈·합성·후처리 색 보정은 하지 않았다. 최종 PNG와 각 새 생성 원본의 지정 영역은 픽셀 차이 0으로 검증했다. 이는 새 생성 원본과의 비교이며, 기존 참고 이미지와 픽셀 동일성을 의미하지 않는다.

선택한 버전과 무관하게 같은 히어로 레이아웃과 `background-size: auto 100%`, 중앙 정렬을 사용한다. 화면 폭이 달라지면 좌우의 보이는 범위가 달라지고, 세로 전체는 유지된다. 반응형 히어로 높이 자체는 기존 브레이크포인트 규칙을 따른다.

2026-10-05 추가 refined 세트 `얼굴 보정 (낮·노을·밤)`도 개발 모드 비교용이다. 파일은 `jarihana-hero-{day,sunset,night}-refined.png`이며, 기본 현재 버전·classic·nebula 세트를 대체하지 않고 production에는 포함하지 않는다. 현재 기본 responsive의 작고 먼 피사체 구도를 기준으로 `jarihana-signature.png`와 `default-group-session-3d.png`의 얼굴 인상을 참고해 전체 새 장면으로 생성했다. 세 파일 모두 2112 × 594, 정확한 32:9다. native 원본과 crop은 낮 `2135×736` crop `(11,71,2123,665)`, 노을 `2172×724` crop `(30,40,2142,634)`, 밤 `2172×724` crop `(30,70,2142,664)`다. 리사이즈·합성·색 보정 없이 새 생성 원본 crop과 픽셀 차이 0으로 검증하며, 과거 원본과 동일 픽셀이라는 의미는 아니다.

최종 생성 프롬프트, native 원본 파일명, crop 좌표, SHA-256은 [hero-comparison-prompts.json](hero-comparison-prompts.json)과 refined 세트용 [hero-refined-prompts.json](hero-refined-prompts.json)에 기록한다. 결과 파일은 모두 `src/shared/assets/brand/`에 있다.

## 결과와 보존 범위

- 낮·노을·밤 모두 Codex 내장 image_gen으로 새 전체 장면을 생성했다. 기존 원본 PNG는 색감, 스타일, 캐릭터 정체성과 구도 참고로 보존하며, 런타임은 새 `jarihana-hero-{day,sunset,night}-responsive.png`를 사용한다.
- 새 생성 원본은 모두 2172 × 724다. 최종 앱 파일은 세 버전 모두 같은 중앙 crop `(14, 60, 2158, 663)`을 잘라 만든 2144 × 603 PNG다.
- 최종 파일은 정확한 32:9 비율이다. crop 이후 리사이즈, 합성, 색 보정은 하지 않았다.
- 이전 `jarihana-hero-night-starry-source.png`는 밤 하늘 스타일 참고로만 사용했다. 런타임 배경은 `jarihana-hero-night-responsive.png`다.
- 예전 원본 픽셀 보존 합성 방식은 현재 산출물에 적용하지 않는다. 새 결과는 전체 장면 재생성이므로 기존 원본과의 전체 픽셀 동일성을 주장하지 않는다.

## 생성 방향

- day: 원본의 캐릭터 정체성, 민트/화이트 색감과 조형 품질을 유지하되 전체 장면을 균일하게 약 20% 축소해 상하 여유를 확보한다. 왼쪽 43%는 카피용 조용한 배경으로 둔다.
- sunset: 새 day 장면의 구도, FOV, 피사체 크기와 여백을 유지하고 시간대만 노을 조명과 라벤더-피치 하늘로 바꾼다.
- night: 새 day 장면의 정확한 기하, 원형 행성, FOV, 피사체 크기와 위치를 유지하고 이전 화려한 밤 버전의 푸른 성운/별빛 스타일만 하늘에 반영한다.

내장 이미지 생성 도구에 전달한 최종 프롬프트는 아래에 기록한다.

## 픽셀 검증

검증은 `/private/tmp/jarihana-all-new/verification.json` 기준이다. 각 최종 PNG를 다시 열어, 해당 버전의 새 생성 원본에서 같은 crop 영역을 잘라 비교했다. 세 버전 모두 crop 픽셀 차이는 0이며, 리사이즈·합성·색 보정 플래그는 false다.

| 버전 | 생성 원본 | 생성 원본 크기 | 최종 크기 | 최종 PNG SHA-256 |
| --- | --- | --- | --- | --- |
| day | `exec-84bc7fa2-d73c-47aa-964d-146ce5b886db.png` | 2172 × 724 | 2144 × 603 | `b5d318770109eb1b140eed88741eaf2191d5579874863c814a4eec52a3e2bb45` |
| sunset | `exec-73b986c6-24d2-4f96-a500-cb3f466a2a83.png` | 2172 × 724 | 2144 × 603 | `d624502df9e3b5f9e74c1101dd4cc48e25981003e2dc80dff5c3df4c32a12041` |
| night | `exec-efd629a1-63f7-40e2-bd96-76447a5dbe54.png` | 2172 × 724 | 2144 × 603 | `ad865a7ac6bcffb7896175f476b7f112023b5e59aec40b30df5d5b6d3364d38a` |

공통 crop bounds: `(14, 60, 2158, 663)`.

## 렌더링

- 전체 화면에서 중앙 정렬과 `background-size: auto 100%`로 이미지의 세로 전체를 표시한다.
- 데스크톱의 최소 높이에 `28.125vw`를 포함해 32:9보다 넓은 히어로에서 가로 빈 공간이 생기지 않게 한다.
- 좁은 화면에서는 좌우가 대칭으로 잘릴 수 있지만 세로는 추가로 잘리지 않는다.
- 새 파일은 기존 원본보다 상하 여유를 더 가진 32:9 결과물이므로, 다양한 브라우저 비율에서 캐릭터와 행성이 경계선에 딱 붙는 문제를 줄인다.

## 최종 생성 프롬프트

### 낮

```text
Regenerate this COMPLETE daytime 3D hero panorama as a new coherent render. Same polished character identities, vivid mint turquoise, neutral whites, sculpted surfaces and crisp premium rendering. This is a whole-image generation, not an outpaint patch or a collage.
CRITICAL COMPOSITION CHANGE: zoom the entire scene OUT uniformly by 20%, around the scene center (about 68% width,50% height). Keep all proportions perfectly correct: spherical planets, not squashed ovals. Move the top of the seated boy's hair DOWN to 20% of the canvas height; move the BOTTOM of the complete white ringed sphere UP to 80% of the canvas height. All three characters, all freestanding stars, and the complete white ringed planet must be contained within y=18%..82% of the canvas. The top 15% and bottom 15% of the wide canvas should contain only neutral-white sky, except the turquoise globe may naturally continue beyond the lower and right edges. This extra vertical breathing space is essential. Do NOT retain the reference's tight head or planet margins.
Quiet white negative space on the left 43%; characters and planets on center-right. Small floating ringed boy, seated boy on round white planet, waving girl and small mint flag on larger circular turquoise planet. Remove all the small fluffy clouds added in this reference. Use only the original floating rounded white/mint star shapes and thin dotted mint orbit trails. No extra people, typography, watermark, borders or cloud objects. Match detailed saturated texture and gray shadows; no washed-out haze, blur or loss of sharpness. Very wide panoramic single image, highest native detail.
```

### 노을

```text
Create a complete newly rendered SUNSET version of the provided 3D panorama, in one coherent high-quality image. Keep the provided image's precise layout, object scale, proportions, camera, viewing distance, FOV and object positions. Match its generous vertical breathing room. Do NOT enlarge or move the subjects. The seated boy's hair stays around y=26% height, white sphere bottom stays near y=87% height, same as reference. Main sphere remains perfectly round with the identical circular outline, diameter and tilted ring. Exactly the same characters, poses, face shapes, 3D material details, white/mint star props, dotted orbit trail, waving girl and turquoise sphere surface. Do NOT add additional stars or move the original ones. Reference's left 43% stays open sky.
Only the time-of-day and illumination are different: richly colored sunset sky with soft lavender-violet upper sky transitioning to luminous warm peach/orange low sky, fine natural cloud streaks with a few gold edges. Restrained low golden sun behind the right-hand turquoise globe, subtle warm rim light on hair, faces, white clothes, ring and textured planets. White sphere stays detailed neutral warm-gray with natural shadows, turquoise remains richly saturated with a gentle golden edge. No pale wash or overexposure. Sharp high-definition sculpted surfaces and antialiased fine details. A whole new render, no montage or composited strips. Same panoramic dimensions/aspect as input, all heads and white sphere comfortably inside frame. No text, watermark, borders.
```

### 밤

```text
Use case: stylized-concept. Generate one COMPLETE NEW coherent panoramic 3D illustration, not a collage, composite or outpainting patch.
Image 1 is the EXACT GEOMETRY AND CAMERA reference for a coordinated day/sunset/night hero set. Image 2 is ONLY a color/lighting/sky-style reference.
Use image 1's identical framing, subject scale, screen positions, poses, facial identities, camera angle, viewing distance, lens/FOV, spherical planet shapes and ring tilt. The main white ringed planet must be ROUND, with the same circular silhouette as image 1, never flattened or stretched. Do not inherit image 2's layout or larger/smaller character sizes. Keep image 1's generous top/bottom breathing space: all characters and the complete white ringed sphere inside the central 65% height of the canvas. Keep left 43% as unobstructed background for text. Exactly the same three figures, one small orbiting child, one seated boy on white planet, one waving girl on turquoise planet with a flag. Same rounded star props and cyan dashed orbit paths. No fluffy cloud objects.
Render EVERY part of the new image cohesively and crisply at maximum native detail. Vivid rich colors, clear sculpted microtexture, sharp faces and fabric, no haze or washed-out exposure, no anisotropic stretch. Single ultra-wide panorama with the same aspect ratio as image1 and safe margins for a final 32:9 crop. No text, logos, border or watermark.
NIGHT version: spectacular deep navy sky with luminous sapphire-blue nebula wisps and abundant varied sharp tiny star sparkles like image2. Rich electric-cyan rim light around figures and planets, luminous white and cyan floating star props and cyan dashed orbit trail. White sphere has rich cool blue-gray shadows; large planet saturated deep turquoise and bright cyan-lit edges. Keep dramatic dark sky and crisp luminous accents, not hazy or pale. Nebula should frame the scene naturally with a quieter dark patch in left center for website copy. MOST IMPORTANT: use image1's ROUND planet and exact camera/FOV, NOT image2's flattened planet or zoomed-out composition.
```
