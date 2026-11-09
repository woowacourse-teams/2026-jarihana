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
  return column === 2 ? "&" : column === 1 ? "e" : "a";
}

export function layoutRhythmBar(columns) {
  const filled = new Set(columns.map((column) => ((column % 16) + 16) % 16));
  const beats = [];
  for (let beat = 0; beat < 4; beat++) {
    const left = FIRST_BEAT_X + beat * BEAT_WIDTH;
    const x = (column) => left + 8 + column * COLUMN_WIDTH;
    const onsets = [0, 1, 2, 3].filter((column) => filled.has(beat * 4 + column));
    if (!onsets.length) {
      beats.push({ rests: [{ length: 4, x: left + 22 }], notes: [], beams: [], flags: 0 });
      continue;
    }
    // 박 안에서 첫 음 앞의 빈자리는 쉼표로, 각 음의 길이는 다음 음까지로 정한다.
    const rests = onsets[0] > 0 ? [{ length: onsets[0], x: x(0) }] : [];
    const notes = onsets.map((column, index) => {
      const step = beat * 4 + column;
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
    beats.push({ rests, notes, beams, flags });
  }
  return beats;
}
