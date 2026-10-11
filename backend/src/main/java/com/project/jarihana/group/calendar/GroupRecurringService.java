package com.project.jarihana.group.calendar;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
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
import java.util.Set;

@Service
public class GroupRecurringService {

    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository memberships;
    private final GroupRecurringSeriesRepository seriesRepository;
    private final GroupRecurringPeriodRepository periodRepository;
    private final Clock clock;

    public GroupRecurringService(GroupCommandRepository groups, GroupMemberCommandRepository memberships,
                                 GroupRecurringSeriesRepository seriesRepository,
                                 GroupRecurringPeriodRepository periodRepository, Clock clock) {
        this.groups = groups;
        this.memberships = memberships;
        this.seriesRepository = seriesRepository;
        this.periodRepository = periodRepository;
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
        GroupRecurringSeries series = seriesRepository.findFirstByGroupIdAndCurrentTrue(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "등록된 정기 일정이 없습니다."));
        if (request.version() == null || seriesRepository.incrementVersion(series.getId(), request.version()) != 1) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "정기 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        List<GroupRecurringPeriod> periods = periodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId());
        if (periods.isEmpty()) {
            throw new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND, "정기 일정 이력을 찾을 수 없습니다.");
        }
        switch (request.applyScope()) {
            case ALL -> periods.forEach(period -> periodRepository.save(period.withRule(
                    replacement.getActivityDays().values(), replacement.getStartTime(), replacement.getEndTime())));
            case PREVIOUS_RULE -> {
                GroupRecurringPeriod previous = periods.getLast();
                periodRepository.save(previous.withRule(replacement.getActivityDays().values(),
                        replacement.getStartTime(), replacement.getEndTime()));
            }
            case FROM_TODAY -> replaceFromToday(series, periods, replacement, LocalDate.now(clock));
        }
        groups.save(group.replaceRecurringSchedule(replacement));
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
        GroupRecurringPeriod period = periodRepository.findById(periodId)
                .filter(found -> found.getSeries().getGroup().getId().equals(groupId))
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "정기 일정 이력을 찾을 수 없습니다."));
        GroupRecurringSeries series = period.getSeries();
        RecurringGroupSchedule rule = RecurringGroupSchedule.of(
                request.daysOfWeek(), request.startTime(), request.endTime());
        if (seriesRepository.incrementVersion(series.getId(), request.version()) != 1) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "정기 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        periodRepository.save(period.withRule(rule.getActivityDays().values(), rule.getStartTime(), rule.getEndTime()));
        if (series.isCurrent() && periodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId())
                .getLast().getId().equals(periodId)) {
            groups.save(group.replaceRecurringSchedule(rule));
        }
        return request.version() + 1;
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
        if (group.getRecurringSchedule() == null) {
            throw new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND, "등록된 정기 일정이 없습니다.");
        }
        GroupRecurringSeries series = seriesRepository.findFirstByGroupIdAndCurrentTrue(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND,
                        "등록된 정기 일정 이력이 없습니다."));
        List<GroupRecurringPeriod> periods = periodRepository.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId());
        if (periods.isEmpty()) {
            throw new BusinessException(ErrorCode.RECURRING_SCHEDULE_NOT_FOUND, "정기 일정 이력을 찾을 수 없습니다.");
        }
        LocalDate today = LocalDate.now(clock);
        LocalDate stopBefore = switch (request.applyScope()) {
            case ALL -> null;
            case PREVIOUS_RULE -> periods.getLast().getEffectiveFrom().minusDays(1);
            case FROM_TODAY -> today.minusDays(1);
        };
        boolean hideAll = stopBefore == null || stopBefore.isBefore(series.getCalendarStartDate());
        LocalDate endDate = hideAll ? series.getCalendarEndDate() :
                series.getCalendarEndDate() == null || stopBefore.isBefore(series.getCalendarEndDate())
                        ? stopBefore : series.getCalendarEndDate();
        LocalDate flexibleFromDate = hideAll ? switch (request.applyScope()) {
            case ALL -> group.getCreatedAt().toLocalDate();
            case PREVIOUS_RULE -> periods.getLast().getEffectiveFrom();
            case FROM_TODAY -> today;
        } : null;
        if (seriesRepository.stop(series.getId(), request.version(), endDate, hideAll, flexibleFromDate) != 1) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "정기 일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
        if (request.applyScope() == ScopedRuleRequest.ApplyScope.ALL) {
            seriesRepository.hideOtherSeries(groupId, series.getId(), group.getCreatedAt().toLocalDate());
        }
        groups.save(group.removeRecurringSchedule());
    }

    private void replaceFromToday(GroupRecurringSeries series, List<GroupRecurringPeriod> periods,
                                  RecurringGroupSchedule replacement, LocalDate today) {
        boolean changed = false;
        for (GroupRecurringPeriod period : periods) {
            if (period.getEffectiveUntil() != null && period.getEffectiveUntil().isBefore(today)) continue;
            if (period.getEffectiveFrom().isBefore(today)) {
                LocalDate originalUntil = period.getEffectiveUntil();
                periodRepository.save(period.endingOn(today.minusDays(1)));
                periodRepository.save(GroupRecurringPeriod.create(series,
                        replacement.getActivityDays().values(), replacement.getStartTime(), replacement.getEndTime(),
                        today, originalUntil, LocalDateTime.now(clock)));
            } else {
                periodRepository.save(period.withRule(replacement.getActivityDays().values(),
                        replacement.getStartTime(), replacement.getEndTime()));
            }
            changed = true;
        }
        if (!changed) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "오늘 이후에 적용할 정기 일정이 없습니다.");
        }
    }

    private void requireLeader(Long memberId, Long groupId) {
        if (memberships.findByGroupIdAndMemberId(groupId, memberId)
                .filter(membership -> membership.getRole() == GroupMemberRole.LEADER).isEmpty()) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "그룹 모임장만 일정을 변경할 수 있습니다.");
        }
    }
}
