import { participationLabel, timeRange } from "./TodaySessionTicket.jsx";

const DIAL_OVERSCAN = 4;

export function TodayPlan({ activePosition, groups, onMouseEnter, onMouseLeave }) {
  const radius = groups.length > 1 ? DIAL_OVERSCAN : 0;
  const rows = groups.length
    ? Array.from({ length: radius * 2 + 1 }, (_, index) => {
        const offset = index - radius;
        const position = activePosition + offset;
        const groupIndex = ((position % groups.length) + groups.length) % groups.length;
        return { group: groups[groupIndex], offset, position };
      })
    : [];

  return (
    <aside
      className="today-plan"
      aria-label="오늘의 같이해요 일정"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="today-plan__header">
        <h2>오늘의 일정</h2>
      </div>
      <div className="today-plan__dial" aria-live="off">
        <ul className="today-plan__items">
          {rows.map(({ group, offset, position }) => (
            <li
              aria-hidden={offset !== 0 ? "true" : undefined}
              className="today-plan__item"
              key={`${group.id}:${position}`}
              style={{
                "--today-plan-row-distance": Math.abs(offset),
                "--today-plan-row-offset": offset
              }}
            >
              <span className="today-plan__time">
                <strong>{timeRange(group).split(" - ")[0]}</strong>
                <small>{timeRange(group).split(" - ")[1] ?? "협의"}</small>
              </span>
              <span className="today-plan__copy">
                <strong>{group.name}</strong>
                <small>{participationLabel(group)}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
