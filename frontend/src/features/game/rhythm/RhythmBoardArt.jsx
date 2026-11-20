import { SPRITE_ATLAS } from "./sprite-atlas.mjs";

const FRAMES = {
  calm: SPRITE_ATLAS.frames[0],
  fierce: SPRITE_ATLAS.frames[1],
  red: SPRITE_ATLAS.frames[4],
  blue: SPRITE_ATLAS.frames[5],
  yellow: SPRITE_ATLAS.frames[6]
};
const ARMS = [
  { x: 0, y: 128, width: 300, height: 44 },
  { x: 128, y: 0, width: 44, height: 300 }
];
const JUDGE_LINES = [
  [70, 116, 70, 184],
  [230, 116, 230, 184],
  [116, 70, 184, 70],
  [116, 230, 184, 230]
];

function Sprite({ frame, x, y, size }) {
  const [sx, sy, sw, sh] = FRAMES[frame];
  return (
    <svg x={x - size / 2} y={y - size / 2} width={size} height={size} viewBox={`${sx} ${sy} ${sw} ${sh}`}>
      <image href={SPRITE_ATLAS.url} width={SPRITE_ATLAS.width} height={SPRITE_ATLAS.height} />
    </svg>
  );
}

function Board({ face, germs }) {
  return (
    <svg className="rhythm-board-art__board" viewBox="0 0 300 300" aria-hidden="true">
      <rect width="300" height="300" rx="22" className="rhythm-board-art__field" />
      {ARMS.map((arm) => (
        <rect key={arm.x + "-" + arm.y} {...arm} className="rhythm-board-art__arm" />
      ))}
      <circle cx="150" cy="150" r="80" className="rhythm-board-art__ring" />
      {JUDGE_LINES.map(([x1, y1, x2, y2]) => (
        <line key={x1 + "-" + y1} x1={x1} y1={y1} x2={x2} y2={y2} className="rhythm-board-art__judge" />
      ))}
      {germs.map(([frame, x, y]) => (
        <Sprite key={frame + x + y} frame={frame} x={x} y={y} size={32} />
      ))}
      <Sprite frame={face} x={150} y={150} size={58} />
    </svg>
  );
}

// 첫 화면 패널 그림. 싱글은 판 하나, 온라인 매칭은 판 두 개를 나란히 그린다.
export function RhythmBoardArt({ variant = "single" }) {
  if (variant === "duo")
    return (
      <div className="rhythm-board-art rhythm-board-art--duo">
        <Board face="calm" germs={[["red", 40, 150], ["blue", 150, 34]]} />
        <Board face="fierce" germs={[["red", 262, 150], ["yellow", 150, 270]]} />
      </div>
    );
  return (
    <div className="rhythm-board-art">
      <Board
        face="calm"
        germs={[
          ["red", 36, 150],
          ["blue", 150, 30],
          ["red", 264, 150],
          ["yellow", 150, 262]
        ]}
      />
    </div>
  );
}
