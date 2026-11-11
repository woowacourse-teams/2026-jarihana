import { LEVELS } from "./engine.mjs";

// 난이도마다 치는 곡이다. ANOTHER는 스윙 편곡과 전용 채보를, 나머지는 원곡 채보를 단순화해 쓴다.
// chartVersion은 서버 랭킹 도전 채보의 판본과 같아야 한다(ranked-run.mjs의 assertRankedVersions).
export const STAGES = Object.freeze({
  original: Object.freeze({
    chartVersion: "bars-13-16-1",
    chart: "/game-assets/rhythm-harpoon/assets/chart.json?v=bars-13-16-1",
    music: "/game-assets/rhythm-harpoon/assets/pixel-circuit.ogg?v=spiral-melody-5",
    bpmLabel: "128 BPM",
    title: "Pixel Circuit",
    meta: "128 BPM / 90초 루프"
  }),
  swing: Object.freeze({
    chartVersion: "swing-another-2",
    chart: "/game-assets/rhythm-harpoon/assets/swing-chart.json?v=swing-another-2",
    music: "/game-assets/rhythm-harpoon/assets/pixel-circuit-swing.ogg?v=another-1",
    bpmLabel: "144 BPM SWING",
    title: "Pixel Circuit (Swing)",
    meta: "144 BPM 스윙 / 80초 루프"
  })
});

export function stageOf(level) {
  return LEVELS[level]?.song ?? "original";
}
