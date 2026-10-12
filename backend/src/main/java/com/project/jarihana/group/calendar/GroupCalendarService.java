package com.project.jarihana.group.calendar;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupEvent;
import com.project.jarihana.group.domain.GroupEventType;
import com.project.jarihana.group.domain.GroupStatus;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.MeetingType;
import com.project.jarihana.group.query.repository.GroupJpaRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class GroupCalendarService {

    private final GroupJpaRepository groups;
    private final GroupEventRepository events;
    private final GroupRecurringSeriesRepository series;
    private final GroupRecurringPeriodRepository periods;
    private final GroupLocationHistoryRepository locations;

    public GroupCalendarService(GroupJpaRepository groups, GroupEventRepository events,
                                GroupRecurringSeriesRepository series, GroupRecurringPeriodRepository periods,
                                GroupLocationHistoryRepository locations) {
        this.groups = groups;
        this.events = events;
        this.series = series;
        this.periods = periods;
        this.locations = locations;
    }

    @Transactional(readOnly = true)
    public ScheduleDetail scheduleDetail(Long groupId, String kind, LocalDate date) {
        if (date == null || !("RECURRING".equals(kind) || "SESSION".equals(kind))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "일정 종류와 날짜가 올바르지 않습니다.");
        }
        Group group = groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        GroupCalendarResponse.CalendarEvent occurrence = find(groupId, date, date).events().stream()
                .filter(event -> event.kind().equals(kind))
                .findFirst()
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_EVENT_NOT_FOUND, "일정을 찾을 수 없습니다."));
        var locationRecords = locations.findAllByGroupIdOrderByEffectiveFromAtAscIdAsc(groupId);
        java.time.LocalDateTime cutoff = occurrence.startTime() == null
                ? date.plusDays(1).atStartOfDay() : date.atTime(occurrence.startTime());
        GroupLocationHistory applicableLocation = locationRecords.stream()
                .filter(record -> occurrence.startTime() == null
                        ? record.getEffectiveFromAt().isBefore(cutoff)
                        : !record.getEffectiveFromAt().isAfter(cutoff)
                            && (record.getEffectiveUntilAt() == null || cutoff.isBefore(record.getEffectiveUntilAt())))
                .reduce((previous, latest) -> latest)
                .orElse(null);
        String location = applicableLocation == null ? null : applicableLocation.getLocation();
        return new ScheduleDetail(occurrence.kind(), occurrence.title(), occurrence.startDate(),
                occurrence.startTime(), occurrence.endTime(), location);
    }

    public record ScheduleDetail(String kind, String title, LocalDate date,
                                 java.time.LocalTime startTime, java.time.LocalTime endTime, String location) {}

    @Transactional(readOnly = true)
    public GroupCalendarResponse find(Long groupId, LocalDate from, LocalDate to) {
        if (from == null || to == null || to.isBefore(from) || ChronoUnit.DAYS.between(from, to) > 41) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "달력 조회 범위는 최대 42일입니다.");
        }
        Group group = groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        LocalDate endedOn = group.getEndedOn();
        if (endedOn == null && group.getStatus() == GroupStatus.ENDED) {
            // Pre-calendar rows lack an explicit end date; updated_at is the rollout fallback
            // until the production backfill is verified.
            endedOn = group.getUpdatedAt().toLocalDate();
        }
        LocalDate visibleTo = endedOn == null ? to : min(to, endedOn);
        if (visibleTo.isBefore(from)) {
            return new GroupCalendarResponse(group.isShowBaseScheduleInCalendar(), null, List.of(), List.of());
        }
        List<GroupCalendarResponse.CalendarEvent> results = new ArrayList<>();
        List<GroupRecurringSeries> recurringSeries = group.isShowBaseScheduleInCalendar()
                ? series.findAllByGroupIdOrderByCalendarStartDateAsc(groupId) : List.of();
        Map<Long, GroupRecurringSeries> visibleSeriesById = recurringSeries.stream()
                .filter(recurring -> !recurring.isHideAll())
                .collect(Collectors.toMap(GroupRecurringSeries::getId, recurring -> recurring));
        List<GroupEvent> occurrenceOverrides = !visibleSeriesById.isEmpty()
                ? events.findAllByGroupIdAndRecurringSeriesIdIsNotNullAndRecurrenceSourceDateBetween(
                        groupId, from, visibleTo)
                : List.of();
        Set<String> overriddenOccurrences = occurrenceOverrides.stream()
                .filter(event -> visibleSeriesById.containsKey(event.getRecurringSeriesId()))
                .filter(event -> isWithinCalendarRange(visibleSeriesById.get(event.getRecurringSeriesId()),
                        event.getRecurrenceSourceDate()))
                .map(event -> occurrenceKey(event.getRecurringSeriesId(), event.getRecurrenceSourceDate()))
                .collect(Collectors.toSet());
        for (GroupEvent event : events.findAllByGroupIdAndDeletedAtIsNullAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAscIdAsc(
                groupId, visibleTo, from)) {
            if (event.isRecurringOverride() && !group.isShowBaseScheduleInCalendar()) continue;
            if (event.isRecurringOverride()) {
                GroupRecurringSeries recurring = visibleSeriesById.get(event.getRecurringSeriesId());
                if (recurring == null || !isWithinCalendarRange(recurring, event.getRecurrenceSourceDate())) continue;
                results.add(new GroupCalendarResponse.CalendarEvent("RECURRING", event.getId(),
                        occurrenceKey(event.getRecurringSeriesId(), event.getRecurrenceSourceDate()),
                        event.getRecurringPeriodId(), "정기 모임", event.getStartDate(), event.getEndDate(),
                        event.isAllDay(), event.getStartTime(), event.getEndTime()));
                continue;
            }
            String eventKind = event.getEventType() == GroupEventType.REGULAR_MEETING
                    ? "REGULAR_MEETING" : "GROUP_EVENT";
            results.add(new GroupCalendarResponse.CalendarEvent(eventKind, event.getId(), null, null,
                    event.getTitle(), event.getStartDate(), min(event.getEndDate(), visibleTo), event.isAllDay(),
                    event.getStartTime(), event.getEndTime()));
        }
        GroupCalendarResponse.FlexibleBeforeFirstRecurring flexible = null;
        List<GroupCalendarResponse.FlexibleAfterRecurring> flexibleAfter = new ArrayList<>();
        if (group.isShowBaseScheduleInCalendar()) {
            List<GroupRecurringSeries> visibleSeries = recurringSeries.stream()
                    .filter(recurring -> !recurring.isHideAll()).toList();
            if (recurringSeries.isEmpty() && group.getType() != GroupType.SESSION
                    && group.getMeetingType() == MeetingType.FLEXIBLE) {
                LocalDate flexibleFrom = group.getCreatedAt().toLocalDate();
                if (!flexibleFrom.isAfter(visibleTo) && (endedOn == null || !endedOn.isBefore(from))) {
                    flexibleAfter.add(new GroupCalendarResponse.FlexibleAfterRecurring(flexibleFrom, endedOn));
                }
            }
            if (!visibleSeries.isEmpty()) {
                LocalDate createdOn = group.getCreatedAt().toLocalDate();
                LocalDate firstStart = visibleSeries.getFirst().getCalendarStartDate();
                LocalDate flexibleUntil = firstStart.minusDays(1);
                if (endedOn != null) flexibleUntil = min(flexibleUntil, endedOn);
                if (firstStart.isAfter(createdOn) && !createdOn.isAfter(visibleTo)
                        && !flexibleUntil.isBefore(from) && !flexibleUntil.isBefore(createdOn)) {
                    flexible = new GroupCalendarResponse.FlexibleBeforeFirstRecurring(
                            createdOn, flexibleUntil, firstStart);
                }
            }
            for (int index = 0; index < visibleSeries.size(); index++) {
                GroupRecurringSeries recurring = visibleSeries.get(index);
                if (recurring.getCalendarEndDate() == null) continue;
                LocalDate flexibleFrom = recurring.getCalendarEndDate().plusDays(1);
                LocalDate nextStart = index + 1 < visibleSeries.size()
                        ? visibleSeries.get(index + 1).getCalendarStartDate() : null;
                if (nextStart != null && !flexibleFrom.isBefore(nextStart)) continue;
                LocalDate flexibleUntil = nextStart == null ? endedOn : nextStart.minusDays(1);
                if (endedOn != null && (flexibleUntil == null || flexibleUntil.isAfter(endedOn))) {
                    flexibleUntil = endedOn;
                }
                if (!flexibleFrom.isAfter(visibleTo) && (flexibleUntil == null || !flexibleUntil.isBefore(from))
                        && (flexibleUntil == null || !flexibleUntil.isBefore(flexibleFrom))) {
                    flexibleAfter.add(new GroupCalendarResponse.FlexibleAfterRecurring(flexibleFrom, flexibleUntil));
                }
            }
            for (GroupRecurringSeries recurring : recurringSeries) {
                LocalDate flexibleFrom = recurring.getFlexibleFromDate();
                if (!recurring.isHideAll() || flexibleFrom == null
                        || flexibleAfter.stream().anyMatch(marker -> marker.fromDate().equals(flexibleFrom))) {
                    continue;
                }
                LocalDate nextStart = visibleSeries.stream()
                        .map(GroupRecurringSeries::getCalendarStartDate)
                        .filter(start -> start.isAfter(flexibleFrom))
                        .min(Comparator.naturalOrder())
                        .orElse(null);
                LocalDate flexibleUntil = nextStart == null ? endedOn : nextStart.minusDays(1);
                if (endedOn != null && (flexibleUntil == null || flexibleUntil.isAfter(endedOn))) {
                    flexibleUntil = endedOn;
                }
                if (flexibleFrom.isAfter(visibleTo) || flexibleUntil != null && flexibleUntil.isBefore(from)
                        || flexibleUntil != null && flexibleUntil.isBefore(flexibleFrom)) {
                    continue;
                }
                flexibleAfter.add(new GroupCalendarResponse.FlexibleAfterRecurring(flexibleFrom,
                        flexibleUntil));
            }
            for (GroupRecurringSeries recurring : recurringSeries) {
                if (recurring.isHideAll()) continue;
                LocalDate seriesFrom = max(from, recurring.getCalendarStartDate());
                LocalDate seriesTo = recurring.getCalendarEndDate() == null
                        ? visibleTo : min(visibleTo, recurring.getCalendarEndDate());
                if (seriesTo.isBefore(seriesFrom)) continue;
                for (GroupRecurringPeriod period : periods.findAllBySeriesIdOrderByEffectiveFromAsc(recurring.getId())) {
                    LocalDate periodFrom = max(seriesFrom, period.getEffectiveFrom());
                    LocalDate periodTo = period.getEffectiveUntil() == null
                            ? seriesTo : min(seriesTo, period.getEffectiveUntil());
                    if (periodTo.isBefore(periodFrom)) continue;
                    for (LocalDate date = periodFrom; !date.isAfter(periodTo); date = date.plusDays(1)) {
                        if (!period.getDaysOfWeek().contains(date.getDayOfWeek())) continue;
                        if (overriddenOccurrences.contains(occurrenceKey(recurring.getId(), date))) continue;
                        results.add(new GroupCalendarResponse.CalendarEvent("RECURRING", null,
                                occurrenceKey(recurring.getId(), date), period.getId(),
                                "정기 모임", date, date, false, period.getStartTime(), period.getEndTime()));
                    }
                }
            }
        }
        if (group.isShowBaseScheduleInCalendar() && group.getSessionSchedule() != null) {
            var schedule = group.getSessionSchedule();
            if (!schedule.getSessionDate().isBefore(from) && !schedule.getSessionDate().isAfter(visibleTo)) {
                results.add(new GroupCalendarResponse.CalendarEvent("SESSION", null,
                        "session:" + groupId + ":" + schedule.getSessionDate(), null,
                        group.getName(), schedule.getSessionDate(), schedule.getSessionDate(), false,
                        schedule.getStartTime(), schedule.getEndTime()));
            }
        }
        results.sort(Comparator.comparing(GroupCalendarResponse.CalendarEvent::startDate)
                .thenComparing(event -> event.startTime() == null ? java.time.LocalTime.MIN : event.startTime()));
        return new GroupCalendarResponse(group.isShowBaseScheduleInCalendar(), flexible, flexibleAfter, results);
    }

    private LocalDate min(LocalDate left, LocalDate right) {
        return left.isBefore(right) ? left : right;
    }

    private LocalDate max(LocalDate left, LocalDate right) {
        return left.isAfter(right) ? left : right;
    }

    private String occurrenceKey(Long seriesId, LocalDate sourceDate) {
        return "recurring:" + seriesId + ":" + sourceDate;
    }

    private boolean isWithinCalendarRange(GroupRecurringSeries recurring, LocalDate date) {
        return !date.isBefore(recurring.getCalendarStartDate())
                && (recurring.getCalendarEndDate() == null || !date.isAfter(recurring.getCalendarEndDate()));
    }
}
