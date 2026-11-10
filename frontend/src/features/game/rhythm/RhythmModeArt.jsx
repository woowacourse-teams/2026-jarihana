// 싱글 플레이 카드 그림. 모양은 lucide-react(ISC)의 UserRound, Trophy, Drum을 바탕으로 하고,
// 안을 칠할 수 있게 칠할 부분을 닫힌 도형으로 다시 그렸다. 선 색은 currentColor,
// 칠하는 색은 rhythm-hub.css의 카드별 변수(--mode-art-fill, --mode-art-skin)를 따른다.
const SVG_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  focusable: "false"
};

function PersonArt() {
  return (
    <svg {...SVG_PROPS}>
      <circle className="rhythm-mode__fill" cx="12" cy="8" r="5" />
      <path className="rhythm-mode__fill" d="M20 21a8 8 0 0 0-16 0z" />
    </svg>
  );
}

function TrophyArt() {
  return (
    <svg {...SVG_PROPS}>
      <path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3" />
      <path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3" />
      <path
        className="rhythm-mode__fill"
        d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2h10v-2a2 2 0 0 0-2-2 1 1 0 0 1-1-1v-2.34z"
      />
      <path className="rhythm-mode__fill" d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z" />
      <path d="M4 22h16" />
    </svg>
  );
}

function DrumArt() {
  return (
    <svg {...SVG_PROPS}>
      <path className="rhythm-mode__fill" d="M2 9v8a10 5 0 0 0 20 0V9z" />
      <path d="M7 13.4v7.9" />
      <path d="M12 14v8" />
      <path d="M17 13.4v7.9" />
      <ellipse className="rhythm-mode__skin" cx="12" cy="9" rx="10" ry="5" />
      <path d="m2 2 8 8" />
      <path d="m22 2-8 8" />
    </svg>
  );
}

const ARTS = { practice: PersonArt, record: TrophyArt, lesson: DrumArt };

export function RhythmModeArt({ kind }) {
  const Art = ARTS[kind];
  return (
    <span className="rhythm-mode__art" aria-hidden="true">
      <Art />
    </span>
  );
}
