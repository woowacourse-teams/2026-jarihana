import { ALMOND_MILLIGRAMS, CELL_CM, CELL_MILLIGRAMS } from "./puzzle";

// 1cm 조각과 아몬드 하나의 무게(mg)다. 칸 무게표에서 바로 계산해 화면과 판정이 같은 값을 쓰게 한다.
const PER_CM = 1 / CELL_CM;
const ROWS = [
  { kind: "biscuit", label: "과자 1cm", milligrams: CELL_MILLIGRAMS.NONE * PER_CM },
  { kind: "thin", label: "얇은 초코 1cm", milligrams: CELL_MILLIGRAMS.THIN * PER_CM },
  { kind: "thick", label: "두꺼운 초코 1cm", milligrams: CELL_MILLIGRAMS.THICK * PER_CM }
];
const ALMOND_ROWS = [
  { kind: "almond", label: "작은 아몬드", milligrams: ALMOND_MILLIGRAMS.SMALL },
  { kind: "almond", label: "큰 아몬드", milligrams: ALMOND_MILLIGRAMS.LARGE }
];
const LONGEST = CELL_MILLIGRAMS.THICK * PER_CM;

// 재료별 무게표다. 막대 길이를 무게에 비례하게 그려 재료끼리 얼마나 무거운지 숫자를 읽기 전에 보이게 한다.
export function WeightTable({ stick }) {
  const rows = stick.almonds.length ? [...ROWS, ...ALMOND_ROWS] : ROWS;
  return (
    <section aria-label="무게표" className="weight-table">
      <strong className="weight-table__title">무게표</strong>
      <ul className="weight-table__rows">
        {rows.map((row) => (
          <li key={row.label}>
            <span className="weight-table__name">{row.label}</span>
            <span aria-hidden="true" className="weight-table__track">
              <span
                className={`weight-table__bar weight-table__bar--${row.kind}`}
                style={{ inlineSize: `${(row.milligrams / LONGEST) * 100}%` }}
              />
            </span>
            <b>{(row.milligrams / 1000).toFixed(2)}g</b>
          </li>
        ))}
      </ul>
      <p className="weight-table__note">초코 무게는 속 과자 포함</p>
    </section>
  );
}
