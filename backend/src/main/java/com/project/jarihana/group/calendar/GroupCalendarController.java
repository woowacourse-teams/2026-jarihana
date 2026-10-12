package com.project.jarihana.group.calendar;

import com.project.jarihana.common.auth.LoginMember;
import com.project.jarihana.common.response.ApiResponse;
import com.project.jarihana.common.response.LocationUri;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.calendar.controller.dto.GroupCalendarRequest;
import com.project.jarihana.group.calendar.controller.dto.ScheduleDetailRequest;
import com.project.jarihana.groupmember.command.repository.GroupMemberCommandRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/groups/{groupId}")
public class GroupCalendarController {

    private final GroupCalendarService calendar;
    private final GroupEventService events;
    private final GroupMemberCommandRepository memberships;
    private final GroupRecurringService recurring;

    public GroupCalendarController(GroupCalendarService calendar, GroupEventService events,
                                   GroupMemberCommandRepository memberships, GroupRecurringService recurring) {
        this.calendar = calendar;
        this.events = events;
        this.memberships = memberships;
        this.recurring = recurring;
    }

    public record ScopedRuleResponse(Long version) {}

    @PostMapping("/recurring-schedule/series")
    public ResponseEntity<ApiResponse<GroupRecurringService.ManageDetail>> registerRule(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Valid @RequestBody RuleRegistrationRequest request, HttpServletRequest servletRequest) {
        GroupRecurringService.ManageDetail result = recurring.register(memberId, groupId, request);
        return ResponseEntity.created(LocationUri.of(servletRequest.getContextPath(),
                        "/groups/%d/recurring-schedule/manage", groupId))
                .body(ApiResponse.success(result));
    }

    @PutMapping("/recurring-schedule/scoped")
    public ResponseEntity<ApiResponse<ScopedRuleResponse>> replaceScopedRule(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Valid @RequestBody ScopedRuleRequest request) {
        return ResponseEntity.ok(ApiResponse.success(new ScopedRuleResponse(
                recurring.replaceScoped(memberId, groupId, request))));
    }

    @PutMapping("/recurring-schedule/periods/{periodId}")
    public ResponseEntity<ApiResponse<ScopedRuleResponse>> editRecurringPeriod(
            @LoginMember Long memberId, @PathVariable Long groupId, @PathVariable Long periodId,
            @Valid @RequestBody RuleEditRequest request) {
        return ResponseEntity.ok(ApiResponse.success(new ScopedRuleResponse(
                recurring.editPeriod(memberId, groupId, periodId, request))));
    }

    @GetMapping("/recurring-schedule/manage")
    public ResponseEntity<ApiResponse<GroupRecurringService.ManageDetail>> manageRecurring(
            @LoginMember Long memberId, @PathVariable Long groupId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(recurring.manage(memberId, groupId)));
    }

    @GetMapping("/recurring-schedule/periods/{periodId}")
    public ResponseEntity<ApiResponse<GroupRecurringService.PeriodDetail>> recurringPeriod(
            @LoginMember Long memberId, @PathVariable Long groupId, @PathVariable Long periodId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(recurring.periodDetail(memberId, groupId, periodId)));
    }

    @PutMapping("/recurring-schedule/calendar-range")
    public ResponseEntity<ApiResponse<ScopedRuleResponse>> updateRecurringRange(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Valid @RequestBody CalendarRangeRequest request) {
        return ResponseEntity.ok(ApiResponse.success(new ScopedRuleResponse(
                recurring.updateRange(memberId, groupId, request))));
    }

    @DeleteMapping("/recurring-schedule/scoped")
    public ResponseEntity<Void> deleteRecurringScoped(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Valid @RequestBody DeleteRuleRequest request) {
        recurring.deleteScoped(memberId, groupId, request);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/recurring-schedule/occurrences")
    public ResponseEntity<ApiResponse<GroupEventResponse>> overrideRecurringOccurrence(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Valid @RequestBody RecurringOccurrenceRequest request, HttpServletRequest servletRequest) {
        GroupEventResponse result = events.overrideOccurrence(memberId, groupId, request);
        return ResponseEntity.created(LocationUri.of(servletRequest.getContextPath(),
                        "/groups/%d/events/%d", groupId, result.id()))
                .body(ApiResponse.success(result));
    }

    @DeleteMapping("/recurring-schedule/occurrences")
    public ResponseEntity<Void> deleteRecurringOccurrence(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Valid @RequestBody RecurringOccurrenceDeleteRequest request) {
        events.hideOccurrence(memberId, groupId, request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/calendar/schedule-details")
    public ResponseEntity<ApiResponse<GroupCalendarService.ScheduleDetail>> scheduleDetail(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Validated @ModelAttribute ScheduleDetailRequest request) {
        if (memberships.findByGroupIdAndMemberId(groupId, memberId).isEmpty()) {
            throw new BusinessException(ErrorCode.GROUP_ACCESS_DENIED, "그룹원만 일정 상세를 볼 수 있습니다.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(ApiResponse.success(
                calendar.scheduleDetail(groupId, request.kind().name(), request.date())));
    }

    @GetMapping("/calendar")
    public ResponseEntity<ApiResponse<GroupCalendarResponse>> findCalendar(
            @PathVariable Long groupId, @Validated @ModelAttribute GroupCalendarRequest request) {
        return ResponseEntity.ok(ApiResponse.success(calendar.find(groupId, request.from(), request.to())));
    }

    public record CalendarSettingsRequest(@jakarta.validation.constraints.NotNull Boolean showBaseSchedule) {}
    public record CalendarSettingsResponse(boolean showBaseSchedule) {}

    @PutMapping("/calendar/settings")
    public ResponseEntity<ApiResponse<CalendarSettingsResponse>> updateCalendarSettings(
            @LoginMember Long memberId, @PathVariable Long groupId,
            @Valid @RequestBody CalendarSettingsRequest request) {
        return ResponseEntity.ok(ApiResponse.success(new CalendarSettingsResponse(
                events.setBaseScheduleVisibility(memberId, groupId, request.showBaseSchedule()))));
    }

    @PostMapping("/events")
    public ResponseEntity<ApiResponse<GroupEventResponse>> createEvent(
            @LoginMember Long memberId, @PathVariable Long groupId, @Valid @RequestBody GroupEventRequest request,
            HttpServletRequest servletRequest) {
        GroupEventResponse result = events.create(memberId, groupId, request);
        return ResponseEntity.created(LocationUri.of(servletRequest.getContextPath(),
                        "/groups/%d/events/%d", groupId, result.id()))
                .body(ApiResponse.success(result));
    }

    @GetMapping("/events/{eventId}")
    public ResponseEntity<ApiResponse<GroupEventResponse>> eventDetail(
            @LoginMember Long memberId, @PathVariable Long groupId, @PathVariable Long eventId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(ApiResponse.success(events.detail(memberId, groupId, eventId)));
    }

    @PutMapping("/events/{eventId}")
    public ResponseEntity<ApiResponse<GroupEventResponse>> updateEvent(
            @LoginMember Long memberId, @PathVariable Long groupId, @PathVariable Long eventId,
            @Valid @RequestBody GroupEventRequest request) {
        return ResponseEntity.ok(ApiResponse.success(events.update(memberId, groupId, eventId, request)));
    }

    @DeleteMapping("/events/{eventId}")
    public ResponseEntity<Void> deleteEvent(
            @LoginMember Long memberId, @PathVariable Long groupId, @PathVariable Long eventId,
            @RequestParam Long version) {
        events.delete(memberId, groupId, eventId, version);
        return ResponseEntity.noContent().build();
    }
}
