import { SPRITE_ATLAS } from "./sprite-atlas.mjs";

// 클레이 스프라이트 시트(SPRITE_ATLAS)의 프레임 번호. 난이도 버튼마다 세균 하나를 붙이고,
// Hardest는 화난 행성이, 스윙 곡의 ANOTHER는 초록 세균으로 구분한다.
export const SPRITE_FRAME = { angryPlanet: 1, red: 4, blue: 5, yellow: 6, green: 7, burst: 13 };
export const LEVEL_SPRITE = {
  easy: SPRITE_FRAME.red,
  medium: SPRITE_FRAME.blue,
  hard: SPRITE_FRAME.yellow,
  hardest: SPRITE_FRAME.angryPlanet,
  anotherHard: SPRITE_FRAME.green,
  anotherHardest: SPRITE_FRAME.green
};

// 스프라이트 시트에서 프레임 하나만 잘라 보여 주는 장식 그림이다.
export function SpriteFrame({ className, frame }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      focusable="false"
      viewBox={SPRITE_ATLAS.frames[frame].join(" ")}
    >
      <image href={SPRITE_ATLAS.url} width={SPRITE_ATLAS.width} height={SPRITE_ATLAS.height} />
    </svg>
  );
}

// 하트는 CSS(rhythm-clay.css)에서 같은 스프라이트 시트를 배경으로 잘라 쓴다. 시트 주소는 public 경로라 변수로 넘긴다.
export const CLAY_STYLE = { "--rhythm-sprite-sheet": `url("${SPRITE_ATLAS.url}")` };
