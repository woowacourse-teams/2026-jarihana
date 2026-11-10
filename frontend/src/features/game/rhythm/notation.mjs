import { noteColor } from "./engine.mjs";

// 4/4 한 마디를 한 줄 타악기 보표로 그리기 위한 배치. 마디 안 위치는 16분 단위(0~15)다.
export const SCORE_SIZE = Object.freeze({ width: 318, height: 96, staff: 56, beamTop: 26 });
const FIRST_BEAT_X = 44;
const BEAT_WIDTH = 66;
const COLUMN_WIDTH = 14;
const STEM_OFFSET = 5.6;
const STUB = 9;

export function countLabel(step) {
  const column = step % 4;
  if (column === 0) return String((Math.floor(step / 4) % 4) + 1);
  // 셋잇단 자리(박의 1/3, 2/3)는 "트", "렛"으로 센다.
  if (!Number.isInteger(column)) return column < 2 ? "트" : "렛";
  return column === 2 ? "&" : column === 1 ? "e" : "a";
}

export function layoutRhythmBar(columns) {
  // 0~16 안의 값은 그대로 둔다(16을 더했다 빼면 8/3 같은 실수가 조금 달라진다).
  const filled = new Set(columns.map((column) => (column >= 0 && column < 16 ? column : ((column % 16) + 16) % 16)));
  const beats = [];
  for (let beat = 0; beat < 4; beat++) {
    const left = FIRST_BEAT_X + beat * BEAT_WIDTH;
    const x = (column) => left + 8 + column * COLUMN_WIDTH;
    // 셋잇단처럼 16분 칸 사이에 오는 음표도 박 안 위치(0 이상 4 미만) 그대로 놓는다.
    const sources = [...filled]
      .filter((column) => column >= beat * 4 && column < beat * 4 + 4)
      .sort((a, b) => a - b);
    const onsets = sources.map((column) => column - beat * 4);
    if (!onsets.length) {
      beats.push({ rests: [{ length: 4, x: left + 22 }], notes: [], beams: [], flags: 0 });
      continue;
    }
    // 박 안에서 첫 음 앞의 빈자리는 쉼표로, 각 음의 길이는 다음 음까지로 정한다.
    const rests = onsets[0] > 0 ? [{ length: onsets[0], x: x(0) }] : [];
    const notes = onsets.map((column, index) => {
      // 악보 강조가 패턴 값과 정확히 같은 수로 비교하도록 빼기 전의 값을 쓴다.
      const step = sources[index];
      return {
        step,
        x: x(column),
        stemX: x(column) + STEM_OFFSET,
        duration: (onsets[index + 1] ?? 4) - column,
        color: noteColor(step)
      };
    });
    const beams = [];
    let flags = 0;
    if (notes.length === 1) {
      const [note] = notes;
      flags = note.duration === 4 ? 0 : note.duration === 1 ? 2 : 1;
    } else {
      beams.push({ x1: notes[0].stemX, x2: notes[notes.length - 1].stemX, level: 0 });
      notes.forEach((note, index) => {
        if (note.duration !== 1) return;
        const next = notes[index + 1];
        const previous = notes[index - 1];
        if (next?.duration === 1) beams.push({ x1: note.stemX, x2: next.stemX, level: 1 });
        else if (previous?.duration !== 1)
          beams.push(
            next
              ? { x1: note.stemX, x2: note.stemX + STUB, level: 1 }
              : { x1: note.stemX - STUB, x2: note.stemX, level: 1 }
          );
      });
    }
    beats.push({ rests, notes, beams, flags, triplet: onsets.some((column) => !Number.isInteger(column)) });
  }
  return beats;
}
