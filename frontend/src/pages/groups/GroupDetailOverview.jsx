import { CalendarDays, ChevronRight, MapPin } from "lucide-react";
import { scheduleLines } from "./pageUtils.js";

export function GroupScheduleSummary({ group, onOpenSchedule }) {
  return <section className="group-detail-schedule" aria-labelledby="group-detail-schedule-title">
    <header className="group-detail-schedule__header">
      <h2 id="group-detail-schedule-title">모임 일정</h2>
      <button type="button" data-ph-capture-attribute-action="group_schedule_open" onClick={onOpenSchedule}>
        자세히<ChevronRight size={16} aria-hidden="true" />
      </button>
    </header>
    <dl className="group-detail-schedule__details">
      <div><dt><CalendarDays size={20} aria-hidden="true" />활동 일정</dt>
        <dd>{scheduleLines(group).map((line) => <span key={line}>{line}</span>)}</dd></div>
      <div><dt><MapPin size={20} aria-hidden="true" />모임 장소</dt>
        <dd>{group.location || "아직 정해지지 않았어요"}</dd></div>
    </dl>
  </section>;
}
