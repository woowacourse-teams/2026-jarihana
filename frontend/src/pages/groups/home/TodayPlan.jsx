import { participationLabel, timeRange } from "./TodaySessionTicket.jsx";

export function TodayPlan({ activeIndex, groups }) {
  return (
    <aside className="today-plan" aria-label="오늘의 같이해요 일정">
      <div className="today-plan__header">
        <div>
          <span>TODAY&apos;S PLAN</span>
          <h2>오늘의 일정</h2>
        </div>
      </div>
      <div className="today-plan__dial" aria-live="off">
        <ul className="today-plan__items">
          {groups.map((group, index) => (
            <li
              aria-hidden={index !== activeIndex ? "true" : undefined}
              className="today-plan__item"
              key={group.id}
              style={{
                "--today-plan-row-distance": Math.abs(index - activeIndex),
                "--today-plan-row-offset": index - activeIndex
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
