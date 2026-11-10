import { toGrams } from "./puzzle";

const ROWS = [
  { coins: 4, grams: "0.20g", kind: "biscuit", label: "과자만 1cm" },
  { coins: 6, grams: "0.30g", kind: "thin", label: "얇은 초코 1cm" },
  { coins: 8, grams: "0.40g", kind: "thick", label: "두꺼운 초코 1cm" }
];
const ALMOND_ROWS = [
  { coins: 1, grams: "0.05g", kind: "almond-small", label: "작은 아몬드" },
  { coins: 2, grams: "0.10g", kind: "almond-large", label: "큰 아몬드" }
];

function Piece({ kind }) {
  if (kind === "almond-small" || kind === "almond-large") {
    const large = kind === "almond-large";
    return (
      <svg aria-hidden="true" className="weight-table__piece" viewBox="0 0 28 24">
        <ellipse className="weight-table__almond" cx="14" cy="12" rx={large ? 8.5 : 5.5} ry={large ? 5.5 : 3.5} />
      </svg>
    );
  }
  const height = { biscuit: 10, thick: 20, thin: 15 }[kind];
  return (
    <svg aria-hidden="true" className="weight-table__piece" viewBox="0 0 28 24">
      <rect className={`weight-table__${kind}`} height={height} rx="2" width="24" x="2" y={12 - height / 2} />
    </svg>
  );
}

function Coins({ count }) {
  return (
    <span aria-hidden="true" className="weight-table__coins">
      {Array.from({ length: count }, (_, index) => (
        <i className="weight-table__coin" key={index} />
      ))}
    </span>
  );
}

// 재료별 무게표다. 조각 그림은 모두 같은 1cm 길이로 그리고, 무게는 재료색 없는 0.05g 추로 센다.
export function WeightTable({ stick }) {
  const rows = stick.almonds.length ? [...ROWS, ...ALMOND_ROWS] : ROWS;
  return (
    <section aria-label="무게표" className="weight-table">
      <div className="weight-table__head">
        <strong>무게표</strong>
        <span className="weight-table__total">
          이 막대 전체 <b>{toGrams(stick.totalMilligrams).toFixed(2)}g</b>
        </span>
      </div>
      <ul className="weight-table__rows">
        {rows.map((row) => (
          <li key={row.kind}>
            <Piece kind={row.kind} />
            <span className="weight-table__name">{row.label}</span>
            <span aria-hidden="true" className="weight-table__equals">=</span>
            <Coins count={row.coins} />
            <b>{row.grams}</b>
          </li>
        ))}
      </ul>
      <p className="weight-table__note">
        <i aria-hidden="true" className="weight-table__coin" /> 추 하나가 0.05g이에요. 조각 길이는 모두 1cm이고, 초코 조각 무게에는 속의 과자도 들어 있어요.
      </p>
    </section>
  );
}
