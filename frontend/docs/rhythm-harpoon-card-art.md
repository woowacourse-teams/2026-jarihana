# 리듬 작살 게임 카드 이미지

- 생성 도구: 기본 제공 image_gen, 이미지 참조를 사용한 style-transfer
- 배포 자산: `public/game-assets/rhythm-harpoon/assets/rhythm-lounge-harpoon-v2.webp`
- 크기: 1536 x 1024, WebP quality 90
- 참조: 기존 게임방 리듬 카드의 클레이 스타일, `public/game-assets/rhythm-harpoon/assets/sprites-clay-v1.png`의 행성이와 세균 및 작살
- 소비 위치: `src/pages/games/artworkAssets.js`의 rhythm, 게임방 카탈로그
- 기존 원격 자산을 덮어쓰지 않고 새 버전 파일을 프론트엔드와 함께 배포한다.
- 서비스 도메인의 `/images/games/`는 dev에서 403을 반환하므로, 기존 음악과 스프라이트처럼 `/game-assets/rhythm-harpoon/assets/`에서 전달한다.

## 생성 프롬프트

```text
Use case: style-transfer. Asset type: final website game catalog illustration, landscape 1536x1024, 3:2 aspect ratio. Reimagine reference image 1 to accurately illustrate the game 'Haengseong rhythm harpoon'. Reference 1 is ONLY the soft premium handmade clay render style and pale mint/ivory background and friendly mood. Reference 2 is the character identity and game objects: the top row is Haengseong, a simple ivory cream spherical planet with small dark brown eyes and a cheerful mouth; the second row has scalloped round red, blue, yellow, lime germs; the bottom left is a toy-like brown shaft harpoon with an ivory triangular arrowhead. Make ONE finished cohesive illustration, not a sprite sheet. Scene: Haengseong at the center of a clean lightly mint tinted cross-shaped game arena, defending against germs arriving from the four cardinal directions. Slightly elevated front three-quarter view, clear centered composition with the central character large and legible at thumbnail size. Show four short toy-like harpoons extending radially from around the central planet, directed at the approaching germs. One harpoon has just caught a red scalloped germ and gently squashed it against its tip, matching the caught germ face from reference 2, with a small warm yellow impact sparkle; blue, yellow and lime germs are still approaching along the other directions. The central planet looks happily focused and has no human body, hair, hands or headphones. The image must convey four-direction rhythm timing and catching germs immediately. A couple of tiny mint musical-note motifs subtly suggest rhythm. Keep generous clean margin around all outer germs, soft contact shadows, rounded sculpted clay textures, warm diffused studio lighting, restrained pastel mint and cream ground with the brightly colored germs as accents. Match the tactile clay aesthetic of both references. No human person, no music pad, no desk, no chair, no metronome, no weapons that look realistic, no gore, no UI panels, no border, no lettering, no words, no logo, no watermark.
```
