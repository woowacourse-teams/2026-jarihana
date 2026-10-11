package com.project.jarihana.group.calendar;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.command.repository.GroupCommandRepository;
import com.project.jarihana.group.domain.Group;
import com.project.jarihana.group.domain.GroupEvent;
import com.project.jarihana.group.domain.GroupEventStatus;
import com.project.jarihana.group.domain.GroupEventType;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import com.project.jarihana.groupmember.domain.GroupMemberRole;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
public class GroupEventService {

    private final GroupCommandRepository groups;
    private final GroupMemberCommandRepository memberships;
    private final GroupEventRepository events;
    private final GroupRecurringSeriesRepository recurringSeries;
    private final GroupRecurringPeriodRepository recurringPeriods;
    private final Clock clock;

    public GroupEventService(GroupCommandRepository groups, GroupMemberCommandRepository memberships,
                             GroupEventRepository events, GroupRecurringSeriesRepository recurringSeries,
                             GroupRecurringPeriodRepository recurringPeriods, Clock clock) {
        this.groups = groups;
        this.memberships = memberships;
        this.events = events;
        this.recurringSeries = recurringSeries;
        this.recurringPeriods = recurringPeriods;
        this.clock = clock;
    }

    @Transactional
    public GroupEventResponse create(Long memberId, Long groupId, GroupEventRequest request) {
        Group group = lockedActiveGroup(groupId);
        requireLeader(memberId, groupId);
        GroupEventType eventType = request.resolvedEventType();
        GroupEventStatus status = request.resolvedStatus();
        requireNoRecurringOccurrence(groupId, eventType, request.startDate());
        GroupEvent event = GroupEvent.create(group, eventType, status, request.title(), request.startDate(), request.endDate(),
                request.allDay(), request.startTime(), request.endTime(), request.description(), request.location(),
                LocalDateTime.now(clock));
        return GroupEventResponse.from(events.save(event), LocalDate.now(clock));
    }

    @Transactional
    public boolean setBaseScheduleVisibility(Long memberId, Long groupId, boolean visible) {
        Group group = lockedActiveGroup(groupId);
        requireLeader(memberId, groupId);
        groups.save(group.withBaseScheduleVisibility(visible));
        return visible;
    }

    @Transactional(readOnly = true)
    public GroupEventResponse detail(Long memberId, Long groupId, Long eventId) {
        if (!groups.findById(groupId).isPresent()) {
            throw new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다.");
        }
        if (memberships.findByGroupIdAndMemberId(groupId, memberId).isEmpty()) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "그룹원만 일정 상세를 볼 수 있습니다.");
        }
        return GroupEventResponse.from(findEvent(groupId, eventId), LocalDate.now(clock));
    }

    @Transactional
    public GroupEventResponse update(Long memberId, Long groupId, Long eventId, GroupEventRequest request) {
        lockedActiveGroup(groupId);
        requireLeader(memberId, groupId);
        GroupEvent existing = findEvent(groupId, eventId);
        requireVersion(existing, request.version());
        GroupEventType eventType = request.eventType() == null ? existing.getEventType() : request.eventType();
        GroupEventStatus status = request.status() == null ? existing.getStatus() : request.status();
        if (eventType == GroupEventType.INDIVIDUAL) {
            status = GroupEventStatus.AUTO;
        }
        requireNoRecurringOccurrence(groupId, eventType, request.startDate());
        return GroupEventResponse.from(events.saveAndFlush(existing.modify(eventType, status, request.title(), request.startDate(),
                request.endDate(), request.allDay(), request.startTime(), request.endTime(),
                request.description(), request.location())), LocalDate.now(clock));
    }

    @Transactional
    public void delete(Long memberId, Long groupId, Long eventId, Long version) {
        lockedActiveGroup(groupId);
        requireLeader(memberId, groupId);
        GroupEvent existing = findEvent(groupId, eventId);
        requireVersion(existing, version);
        events.save(existing.deleteAt(LocalDateTime.now(clock)));
    }

    private Group lockedActiveGroup(Long groupId) {
        Group group = groups.findWithLockById(groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_NOT_FOUND, "그룹을 찾을 수 없습니다."));
        if (!group.isActive()) {
            throw new BusinessException(ErrorCode.GROUP_ENDED, "종료된 그룹은 일정을 변경할 수 없습니다.");
        }
        return group;
    }

    private void requireLeader(Long memberId, Long groupId) {
        if (memberships.findByGroupIdAndMemberId(groupId, memberId)
                .filter(membership -> membership.getRole() == GroupMemberRole.LEADER).isEmpty()) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "그룹 모임장만 일정을 변경할 수 있습니다.");
        }
    }

    private GroupEvent findEvent(Long groupId, Long eventId) {
        return events.findByIdAndGroupIdAndDeletedAtIsNull(eventId, groupId)
                .orElseThrow(() -> new BusinessException(ErrorCode.GROUP_EVENT_NOT_FOUND, "일정을 찾을 수 없습니다."));
    }

    private void requireVersion(GroupEvent event, Long version) {
        if (version == null || !version.equals(event.getVersion())) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT, "일정이 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
        }
    }

    private void requireNoRecurringOccurrence(Long groupId, GroupEventType eventType, LocalDate date) {
        if (eventType != GroupEventType.REGULAR_MEETING) {
            return;
        }
        boolean overlaps = recurringSeries.findAllByGroupIdOrderByCalendarStartDateAsc(groupId).stream()
                .filter(series -> !series.isHideAll())
                .filter(series -> !date.isBefore(series.getCalendarStartDate()))
                .filter(series -> series.getCalendarEndDate() == null || !date.isAfter(series.getCalendarEndDate()))
                .anyMatch(series -> recurringPeriods.findAllBySeriesIdOrderByEffectiveFromAsc(series.getId()).stream()
                        .filter(period -> !date.isBefore(period.getEffectiveFrom()))
                        .filter(period -> period.getEffectiveUntil() == null || !date.isAfter(period.getEffectiveUntil()))
                        .anyMatch(period -> period.getDaysOfWeek().values().contains(date.getDayOfWeek())));
        if (overlaps) {
            throw new BusinessException(ErrorCode.GROUP_EVENT_CONFLICT,
                    "이 날짜에는 정기 일정이 이미 있어요. 다른 날짜를 선택해 주세요.");
        }
    }
}
