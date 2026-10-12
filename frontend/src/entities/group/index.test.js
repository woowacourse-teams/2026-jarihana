import { groupCalendarSchema } from "./index.js";

test("반복 일정 응답의 null 식별자 필드를 허용한다", () => {
  const response = {
    showBaseSchedule: true,
    flexibleBeforeFirstRecurring: null,
    flexibleAfterRecurring: [],
    events: [{
      kind: "RECURRING",
      id: null,
      occurrenceKey: "recurring:2:2026-10-12",
      periodId: 2,
      title: "정기 모임",
      startDate: "2026-10-12",
      endDate: "2026-10-12",
      allDay: false,
      startTime: "19:00:00",
      endTime: "21:00:00"
    }, {
      kind: "SESSION",
      id: null,
      occurrenceKey: "session:18:2026-10-10",
      periodId: null,
      title: "같이해요",
      startDate: "2026-10-10",
      endDate: "2026-10-10",
      allDay: false,
      startTime: "13:00:00",
      endTime: "15:00:00"
    }]
  };

  expect(groupCalendarSchema.parse(response)).toEqual(response);
});
