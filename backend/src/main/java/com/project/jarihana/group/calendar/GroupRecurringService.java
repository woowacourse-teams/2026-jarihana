package com.project.jarihana.group.calendar;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupEvent;
import com.project.jarihana.group.domain.GroupEventType;
import com.project.jarihana.group.domain.GroupType;
import com.project.jarihana.group.domain.RecurringGroupSchedule;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Set;

@Service
public class GroupRecurringService {

    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository memberships;
    private final GroupRecurringSeriesRepository seriesRepository;
    private final GroupRecurringPeriodRepository periodRepository;
    private final GroupEventRepository events;
    private final Clock clock;

    public GroupRecurringService(GroupCommandRepository groups, GroupMemberCommandRepository memberships,
                                 GroupRecurringSeriesRepository seriesRepository,
                                 GroupRecurringPeriodRepository periodRepository,
                                 GroupEventRepository events, Clock clock) {
        this.groups = groups;
        this.memberships = memberships;
        this.seriesRepository = seriesRepository;
        this.periodRepository = periodRepository;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public ManageDetail register(Long memberId, Long groupId, RuleRegistrationRequest request) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        requireLeader(memberId, groupId);
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹은 일정을 변경할 수 없습니다.");
        }
        if (group.getType() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "같이해요에는 정기 일정이 없습니다.");
        }
        if (group.getRecurringSchedule() != null ||
                seriesRepository.findFirstByGroupIdAndCurrentTrue(groupId).isPresent()) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT,
                    "정기 일정이 이미 등록되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        RecurringGroupSchedule rule = RecurringGroupSchedule.of(
                request.daysOfWeek(), request.startTime(), request.endTime());
        LocalDateTime now = LocalDateTime.now(clock);
        LocalDate today = LocalDate.now(clock);
        requireNoRegularMeetingConflict(groupId, today, null,
                List.of(new RulePeriod(today, null, rule.getActivityDays().values())));
        GroupRecurringSeries series = seriesRepository.save(GroupRecurringSeries.create(group, today, null, now));
        GroupRecurringPeriod period = periodRepository.save(GroupRecurringPeriod.create(series,
                rule.getActivityDays().values(), rule.getStartTime(), rule.getEndTime(), today, null, now));
        groups.save(group.replaceRecurringSchedule(rule));
        return new ManageDetail(series.getId(), period.getId(), today, null, series.getVersion(),
                rule.getActivityDays().values(), rule.getStartTime(), rule.getEndTime());
    }

    @Transactional
    public Long replaceScoped(Long memberId, Long groupId, ScopedRuleRequest request) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        requireLeader(memberId, groupId);
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹은 일정을 변경할 수 없습니다.");
        }
        if (group.getType() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.SCHEDULE_TYPE_MISMATCH, "같이해요에는 정기 일정이 없습니다.");
        }
        RecurringGroupSchedule replacement = RecurringGroupSchedule.of(
                request.daysOfWeek(), request.startTime(), request.endTime());
        GroupRecurringSeries series = findTargetSeries(groupId, request.periodId());
        if (request.version() == null || !request.version().equals(series.getVersion())) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "정기 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        List<GroupRecurringPeriod> periods = periodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId());
        if (periods.isEmpty()) {
            throw new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND, "정기 일정 이력을 찾을 수 없습니다.");
        }
        LocalDate fromDate = scopeStartDate(request.applyScope(), request.fromDate());
        List<RulePeriod> candidatePeriods = candidatePeriods(periods, replacement,
                request.applyScope(), fromDate);
        if (!series.isHideAll()) {
            requireNoRegularMeetingConflict(groupId, series.getCalendarStartDate(), series.getCalendarEndDate(),
                    candidatePeriods);
        }
        if (seriesRepository.incrementVersion(series.getId(), request.version()) != 1) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "정기 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        switch (request.applyScope()) {
            case ALL -> periods.forEach(period -> periodRepository.save(period.withRule(
                    replacement.getActivityDays().values(), replacement.getStartTime(), replacement.getEndTime())));
            case FROM_TODAY -> replaceFromDate(series, periods, replacement, fromDate);
        }
        if (series.isCurrent()) {
            groups.save(group.replaceRecurringSchedule(replacement));
        }
        return request.version() + 1;
    }

    @Transactional
    public Long editPeriod(Long memberId, Long groupId, Long periodId, RuleEditRequest request) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        requireLeader(memberId, groupId);
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹은 일정을 변경할 수 없습니다.");
        }
        periodRepository.findById(periodId)
                .filter(found -> found.getSeries().getGroup().getId().equals(groupId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "정기 일정 이력을 찾을 수 없습니다."));
        throw new BusinessException(ErrorCode.CALENDAR_CLIENT_OUTDATED,
                "화면이 오래되었습니다. 새로고침한 뒤 날짜 기준 변경 범위를 선택해 주세요.");
    }

    public record ManageDetail(Long seriesId, Long periodId, LocalDate startDate, LocalDate endDate, Long version,
                               Set<DayOfWeek> daysOfWeek, LocalTime startTime, LocalTime endTime) {}

    public record PeriodDetail(Long periodId, LocalDate effectiveFrom, LocalDate effectiveUntil,
                               Long version, Set<DayOfWeek> daysOfWeek,
                               LocalTime startTime, LocalTime endTime) {}

    @Transactional(readOnly = true)
    public ManageDetail manage(Long memberId, Long groupId) {
        groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        requireLeader(memberId, groupId);
        GroupRecurringSeries series = seriesRepository.findFirstByGroupIdAndCurrentTrue(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "등록된 정기 일정이 없습니다."));
        GroupRecurringPeriod latest = periodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId())
                .getLast();
        return new ManageDetail(series.getId(), latest.getId(), series.getCalendarStartDate(), series.getCalendarEndDate(),
                series.getVersion(), latest.getDaysOfWeek().values(), latest.getStartTime(), latest.getEndTime());
    }

    @Transactional(readOnly = true)
    public PeriodDetail periodDetail(Long memberId, Long groupId, Long periodId) {
        groups.findById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        requireLeader(memberId, groupId);
        GroupRecurringPeriod period = periodRepository.findById(periodId)
                .filter(found -> found.getSeries().getGroup().getId().equals(groupId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "정기 일정 이력을 찾을 수 없습니다."));
        return new PeriodDetail(period.getId(), period.getEffectiveFrom(), period.getEffectiveUntil(),
                period.getSeries().getVersion(), period.getDaysOfWeek().values(),
                period.getStartTime(), period.getEndTime());
    }

    @Transactional
    public Long updateRange(Long memberId, Long groupId, CalendarRangeRequest request) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        requireLeader(memberId, groupId);
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹은 일정을 변경할 수 없습니다.");
        }
        if (request.startDate().isBefore(group.getCreatedAt().toLocalDate()) ||
                request.endDate() != null && request.endDate().isBefore(request.startDate())) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "정기 일정 전체 표시 기간이 올바르지 않습니다.");
        }
        GroupRecurringSeries series = seriesRepository.findFirstByGroupIdAndCurrentTrue(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "등록된 정기 일정이 없습니다."));
        List<RulePeriod> candidatePeriods = periodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId())
                .stream().map(RulePeriod::from).toList();
        requireNoRegularMeetingConflict(groupId, request.startDate(), request.endDate(), candidatePeriods);
        if (seriesRepository.updateRange(series.getId(), request.version(),
                request.startDate(), request.endDate()) != 1) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "정기 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        return request.version() + 1;
    }

    @Transactional
    public void deleteScoped(Long memberId, Long groupId, DeleteRuleRequest request) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        requireLeader(memberId, groupId);
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹은 일정을 변경할 수 없습니다.");
        }
        GroupRecurringSeries series = findTargetSeries(groupId, request.periodId());
        List<GroupRecurringPeriod> periods = periodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId());
        if (periods.isEmpty()) {
            throw new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND, "정기 일정 이력을 찾을 수 없습니다.");
        }
        LocalDate fromDate = scopeStartDate(request.applyScope(), request.fromDate());
        LocalDate stopBefore = request.applyScope() == ScopedRuleRequest.ApplyScope.ALL
                ? null : fromDate.minusDays(1);
        boolean hideAll = stopBefore == null || stopBefore.isBefore(series.getCalendarStartDate());
        LocalDate endDate = hideAll ? series.getCalendarEndDate() :
                series.getCalendarEndDate() == null || stopBefore.isBefore(series.getCalendarEndDate())
                        ? stopBefore : series.getCalendarEndDate();
        LocalDate flexibleFromDate = hideAll
                ? request.applyScope() == ScopedRuleRequest.ApplyScope.ALL
                        ? series.isCurrent() ? group.getCreatedAt().toLocalDate() : null
                        : fromDate
                : null;
        if (seriesRepository.stop(series.getId(), request.version(), endDate, hideAll, flexibleFromDate) != 1) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "정기 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        if (request.applyScope() == ScopedRuleRequest.ApplyScope.ALL && series.isCurrent()) {
            seriesRepository.hideOtherSeries(groupId, series.getId(), group.getCreatedAt().toLocalDate());
        }
        if (series.isCurrent()) {
            groups.save(group.removeRecurringSchedule());
        }
    }

    private GroupRecurringSeries findTargetSeries(Long groupId, Long periodId) {
        if (periodId == null) {
            return seriesRepository.findFirstByGroupIdAndCurrentTrue(groupId)
                    .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                            "등록된 정기 일정이 없습니다."));
        }
        return periodRepository.findById(periodId)
                .filter(period -> period.getSeries().getGroup().getId().equals(groupId))
                .map(GroupRecurringPeriod::getSeries)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "정기 일정 이력을 찾을 수 없습니다."));
    }

    private void replaceFromDate(GroupRecurringSeries series, List<GroupRecurringPeriod> periods,
                                 RecurringGroupSchedule replacement, LocalDate fromDate) {
        boolean changed = false;
        for (GroupRecurringPeriod period : periods) {
            if (period.getEffectiveUntil() != null && period.getEffectiveUntil().isBefore(fromDate)) continue;
            if (period.getEffectiveFrom().isBefore(fromDate)) {
                LocalDate originalUntil = period.getEffectiveUntil();
                periodRepository.save(period.endingOn(fromDate.minusDays(1)));
                periodRepository.save(GroupRecurringPeriod.create(series,
                        replacement.getActivityDays().values(), replacement.getStartTime(), replacement.getEndTime(),
                        fromDate, originalUntil, LocalDateTime.now(clock)));
            } else {
                periodRepository.save(period.withRule(replacement.getActivityDays().values(),
                        replacement.getStartTime(), replacement.getEndTime()));
            }
            changed = true;
        }
        if (!changed) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "선택한 날짜 이후에 적용할 정기 일정이 없습니다.");
        }
    }

    private LocalDate scopeStartDate(ScopedRuleRequest.ApplyScope applyScope, LocalDate fromDate) {
        if (applyScope == ScopedRuleRequest.ApplyScope.ALL) return null;
        if (fromDate == null) {
            throw new BusinessException(ErrorCode.CALENDAR_CLIENT_OUTDATED,
                    "화면이 오래되었습니다. 새로고침한 뒤 일정을 다시 저장해 주세요.");
        }
        return fromDate;
    }

    private void requireLeader(Long memberId, Long groupId) {
        if (memberships.findByGroupIdAndMemberId(groupId, memberId)
                .filter(membership -> membership.getRole() == GroupMemberRole.LEADER).isEmpty()) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "그룹 모임장만 일정을 변경할 수 있습니다.");
        }
    }

    private List<RulePeriod> candidatePeriods(List<GroupRecurringPeriod> periods,
                                               RecurringGroupSchedule replacement,
                                               ScopedRuleRequest.ApplyScope applyScope,
                                               LocalDate fromDate) {
        if (applyScope == ScopedRuleRequest.ApplyScope.ALL) {
            return periods.stream().map(period -> new RulePeriod(period.getEffectiveFrom(),
                    period.getEffectiveUntil(), replacement.getActivityDays().values())).toList();
        }
        return replaceRulesFromDate(periods, replacement, fromDate);
    }

    private List<RulePeriod> replaceRulesFromDate(List<GroupRecurringPeriod> periods,
                                                   RecurringGroupSchedule replacement,
                                                   LocalDate fromDate) {
        List<RulePeriod> candidates = new ArrayList<>();
        boolean changed = false;
        for (GroupRecurringPeriod period : periods) {
            if (period.getEffectiveUntil() != null && period.getEffectiveUntil().isBefore(fromDate)) {
                candidates.add(RulePeriod.from(period));
            } else if (period.getEffectiveFrom().isBefore(fromDate)) {
                candidates.add(new RulePeriod(period.getEffectiveFrom(), fromDate.minusDays(1),
                        period.getDaysOfWeek().values()));
                candidates.add(new RulePeriod(fromDate, period.getEffectiveUntil(),
                        replacement.getActivityDays().values()));
                changed = true;
            } else {
                candidates.add(new RulePeriod(period.getEffectiveFrom(), period.getEffectiveUntil(),
                        replacement.getActivityDays().values()));
                changed = true;
            }
        }
        if (!changed) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "선택한 날짜 이후에 적용할 정기 일정이 없습니다.");
        }
        return candidates;
    }

    private void requireNoRegularMeetingConflict(Long groupId, LocalDate seriesFrom, LocalDate seriesUntil,
                                                  List<RulePeriod> periods) {
        if (periods.isEmpty()) return;
        boolean overlaps = events.findAllByGroupIdAndEventTypeAndDeletedAtIsNullOrderByStartDateAscIdAsc(
                        groupId, GroupEventType.REGULAR_MEETING).stream()
                .filter(event -> !event.isRecurringOverride()
                        || !event.getStartDate().equals(event.getRecurrenceSourceDate()))
                .map(GroupEvent::getStartDate)
                .filter(date -> !date.isBefore(seriesFrom))
                .filter(date -> seriesUntil == null || !date.isAfter(seriesUntil))
                .anyMatch(date -> periods.stream().anyMatch(period -> period.includes(date)));
        if (overlaps) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT,
                    "반복 규칙이 수동 등록한 정기 모임과 겹칩니다. 겹치는 회차를 옮기거나 삭제한 뒤 다시 시도해 주세요.");
        }
    }

    private record RulePeriod(LocalDate from, LocalDate until, Set<DayOfWeek> days) {
        private static RulePeriod from(GroupRecurringPeriod period) {
            return new RulePeriod(period.getEffectiveFrom(), period.getEffectiveUntil(),
                    period.getDaysOfWeek().values());
        }

        private boolean includes(LocalDate date) {
            return !date.isBefore(from) && (until == null || !date.isAfter(until))
                    && days.contains(date.getDayOfWeek());
        }
    }
}
