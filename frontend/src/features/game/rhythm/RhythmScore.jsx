import { NOTE_SYLLABLES } from "./lesson.mjs";
import { SCORE_SIZE, countLabel, layoutRhythmBar } from "./notation.mjs";

const { width: WIDTH, height: HEIGHT, staff: STAFF, beamTop: TOP } = SCORE_SIZE;

function EighthRest({ x, y }) {
  return (
    <>
      <circle className="rhythm-score__ink" cx={x} cy={y} r="2.6" />
      <path
        className="rhythm-score__stroke"
        d={`M${x + 1.5} ${y + 1} Q${x + 5} ${y + 1} ${x + 7} ${y - 3} L${x + 2} ${y + 15}`}
        fill="none"
        strokeWidth="1.8"
      />
    </>
  );
}

function Rest({ length, x }) {
  if (length === 4)
    return (
      <path
        className="rhythm-score__stroke"
        d={`M${x} ${STAFF - 14} L${x + 5} ${STAFF - 7} L${x + 1} ${STAFF - 2} L${x + 6} ${STAFF + 4} C${x + 1} ${STAFF + 2} ${x - 1} ${STAFF + 7} ${x + 4} ${STAFF + 11}`}
        fill="none"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
    );
  if (length === 1)
    return (
      <>
        <EighthRest x={x} y={STAFF - 7} />
        <EighthRest x={x - 2} y={STAFF + 1} />
      </>
    );
  return (
    <>
      <EighthRest x={x} y={STAFF - 4} />
      {length === 3 ? <circle className="rhythm-score__ink" cx={x + 11} cy={STAFF - 4} r="1.8" /> : null}
    </>
  );
}

// 한 마디 리듬 악보. 음표 머리 색은 세균 색과 같고 data-score-step으로 지금 울리는 음표를 표시한다.
export function RhythmScore({ columns, label, caption, labels = "syllable" }) {
  const beats = layoutRhythmBar(columns);
  return (
    <figure className="rhythm-score">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={label}>
        <line className="rhythm-score__line" x1="4" y1={STAFF} x2={WIDTH - 4} y2={STAFF} strokeWidth="1.4" />
        <rect className="rhythm-score__ink" x="9" y={STAFF - 11} width="3.2" height="22" />
        <rect className="rhythm-score__ink" x="15" y={STAFF - 11} width="3.2" height="22" />
        <text className="rhythm-score__ink rhythm-score__time" x="31" y={STAFF - 2} textAnchor="middle">
          4
        </text>
        <text className="rhythm-score__ink rhythm-score__time" x="31" y={STAFF + 15} textAnchor="middle">
          4
        </text>
        <rect className="rhythm-score__ink" x={WIDTH - 9} y={STAFF - 11} width="1.6" height="22" />
        <rect className="rhythm-score__ink" x={WIDTH - 6} y={STAFF - 11} width="3.4" height="22" />
        {beats.map((beat, index) => (
          <g key={index}>
            {beat.rests.map((rest) => (
              <Rest key={rest.x} length={rest.length} x={rest.x} />
            ))}
            {beat.notes.map((note) => (
              <g key={note.step}>
                <ellipse
                  className={`rhythm-score__head rhythm-score__c${note.color}`}
                  data-score-step={note.step}
                  cx={note.x}
                  cy={STAFF}
                  rx="6.4"
                  ry="4.5"
                  transform={`rotate(-22 ${note.x} ${STAFF})`}
                />
                <rect
                  className="rhythm-score__ink"
                  x={note.stemX - 0.7}
                  y={TOP}
                  width="1.5"
                  height={STAFF - TOP - 1}
                />
                {note.duration === 3 ? (
                  <circle className="rhythm-score__ink" cx={note.x + 10.5} cy={STAFF - 2} r="1.9" />
                ) : null}
                <text
                  className={`rhythm-score__label rhythm-score__c${note.color}`}
                  x={note.x}
                  y={STAFF + 30}
                  textAnchor="middle"
                >
                  {labels === "count" ? countLabel(note.step) : NOTE_SYLLABLES[note.color]}
                </text>
              </g>
            ))}
            {beat.triplet ? (
              // 셋잇단 묶음은 빔 위에 3을 적는다.
              <text
                className="rhythm-score__ink rhythm-score__tuplet"
                x={(beat.notes[0].stemX + beat.notes[beat.notes.length - 1].stemX) / 2}
                y={TOP - 4}
                textAnchor="middle"
              >
                3
              </text>
            ) : null}
            {beat.beams.map((beam) => (
              <rect
                key={`${beam.level}-${beam.x1}`}
                className="rhythm-score__ink"
                x={beam.x1 - 0.7}
                y={TOP + beam.level * 7}
                width={beam.x2 - beam.x1 + 1.4}
                height="4.6"
              />
            ))}
            {Array.from({ length: beat.flags }, (_, flag) => {
              const x = beat.notes[0].stemX;
              const y = TOP + flag * 7;
              return (
                <path
                  key={flag}
                  className="rhythm-score__stroke"
                  d={`M${x} ${y} C${x + 2} ${y + 8} ${x + 10} ${y + 10} ${x + 8} ${y + 20}`}
                  fill="none"
                  strokeWidth="2.2"
                />
              );
            })}
          </g>
        ))}
      </svg>
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  );
}
