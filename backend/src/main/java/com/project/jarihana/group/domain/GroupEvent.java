package com.project.jarihana.group.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Objects;

@Entity
@Table(name = "group_event", indexes = {
        @Index(name = "idx_group_event_group_range", columnList = "group_id, start_date, end_date"),
        @Index(name = "idx_group_event_recurring_source_date", columnList = "group_id, recurrence_source_date")
})
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupEvent extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id", nullable = false)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_type", nullable = false, length = 30)
    private GroupEventType eventType;

    @Enumerated(EnumType.STRING)
    @Column(name = "event_status", nullable = false, length = 30)
    private GroupEventStatus status;

    @Column(name = "title", nullable = false, length = 50)
    private String title;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Column(name = "all_day", nullable = false)
    private boolean allDay;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "description", nullable = false, length = 10_000)
    private String description;

    @Column(name = "location", length = 255)
    private String location;

    @Column(name = "recurring_series_id")
    private Long recurringSeriesId;

    @Column(name = "recurring_period_id")
    private Long recurringPeriodId;

    @Column(name = "recurrence_source_date")
    private LocalDate recurrenceSourceDate;

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private GroupEvent(
            Long id,
            Group group,
            GroupEventType eventType,
            GroupEventStatus status,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime,
            String description,
            String location,
            Long recurringSeriesId,
            Long recurringPeriodId,
            LocalDate recurrenceSourceDate,
            LocalDateTime deletedAt,
            Long version,
            LocalDateTime createdAt
    ) {
        super(require(createdAt, "생성 시각"));
        this.id = id;
        this.group = require(group, "모임");
        this.eventType = require(eventType, "일정 종류");
        this.status = eventType == GroupEventType.INDIVIDUAL
                ? GroupEventStatus.AUTO : require(status, "일정 상태");
        if (eventType == GroupEventType.REGULAR_MEETING && group.getType() == GroupType.SESSION) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "같이해요에는 정기 모임 회차를 등록할 수 없습니다.");
        }
        if (eventType == GroupEventType.REGULAR_MEETING && !Objects.equals(startDate, endDate)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "정기 모임 회차는 하루 일정으로 등록해 주세요.");
        }
        this.title = eventType == GroupEventType.REGULAR_MEETING
                ? "정기 모임" : requiredText(title, 50, "일정 제목");
        this.startDate = require(startDate, "시작일");
        this.endDate = require(endDate, "종료일");
        this.allDay = allDay;
        this.startTime = startTime;
        this.endTime = endTime;
        this.description = requiredText(description, 10_000, "설명");
        this.location = optionalText(location, 255, "장소");
        if ((recurringSeriesId == null) != (recurringPeriodId == null)
                || (recurringSeriesId == null) != (recurrenceSourceDate == null)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "반복 회차 참조가 올바르지 않습니다.");
        }
        if (recurringSeriesId != null && eventType != GroupEventType.REGULAR_MEETING) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "반복 회차 일정이 올바르지 않습니다.");
        }
        this.recurringSeriesId = recurringSeriesId;
        this.recurringPeriodId = recurringPeriodId;
        this.recurrenceSourceDate = recurrenceSourceDate;
        this.deletedAt = deletedAt;
        this.version = version;
        validateRange();
    }

    public static GroupEvent create(
            Group group,
            GroupEventType eventType,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime,
            String description,
            String location,
            LocalDateTime createdAt
    ) {
        return create(group, eventType, GroupEventStatus.AUTO, title, startDate, endDate,
                allDay, startTime, endTime, description, location, createdAt);
    }

    public static GroupEvent create(
            Group group,
            GroupEventType eventType,
            GroupEventStatus status,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime,
            String description,
            String location,
            LocalDateTime createdAt
    ) {
        return new GroupEvent(null, group, eventType, status, title, startDate, endDate, allDay, startTime, endTime,
                description, location, null, null, null, null, null, createdAt);
    }

    public static GroupEvent createRecurringOverride(
            Group group,
            Long seriesId,
            Long periodId,
            LocalDate sourceDate,
            GroupEventStatus status,
            LocalDate startDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime,
            String description,
            String location,
            LocalDateTime createdAt
    ) {
        if (group == null || seriesId == null || periodId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "반복 규칙 구간은 필수입니다.");
        }
        return new GroupEvent(null, group, GroupEventType.REGULAR_MEETING, status,
                "정기 모임", startDate, startDate, allDay, startTime, endTime, description, location,
                seriesId, periodId, sourceDate, null, null, createdAt);
    }

    public static GroupEvent createRecurringTombstone(
            Group group,
            Long seriesId,
            Long periodId,
            LocalDate sourceDate,
            LocalTime startTime,
            LocalTime endTime,
            LocalDateTime deletedAt
    ) {
        if (group == null || seriesId == null || periodId == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "반복 규칙 구간은 필수입니다.");
        }
        boolean allDay = startTime == null;
        return new GroupEvent(null, group, GroupEventType.REGULAR_MEETING,
                GroupEventStatus.AUTO, "정기 모임", sourceDate, sourceDate, allDay,
                allDay ? null : startTime, allDay ? null : endTime,
                "숨긴 정기 모임 회차", null, seriesId, periodId, sourceDate,
                require(deletedAt, "삭제 시각"), null,
                deletedAt);
    }

    public GroupEvent modify(
            GroupEventType eventType,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime,
            String description,
            String location
    ) {
        return modify(eventType, status, title, startDate, endDate, allDay, startTime, endTime, description, location);
    }

    public GroupEvent modify(
            GroupEventType eventType,
            GroupEventStatus status,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime,
            String description,
            String location
    ) {
        requireNotDeleted();
        if (recurringPeriodId != null && eventType != GroupEventType.REGULAR_MEETING) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "반복 회차는 정기 모임 종류를 유지해야 합니다.");
        }
        return new GroupEvent(id, group, eventType, status, title, startDate, endDate, allDay, startTime, endTime,
                description, location, recurringSeriesId, recurringPeriodId, recurrenceSourceDate,
                null, version, getCreatedAt());
    }

    public GroupEvent deleteAt(LocalDateTime now) {
        requireNotDeleted();
        return new GroupEvent(id, group, eventType, status, title, startDate, endDate, allDay, startTime, endTime,
                description, location, recurringSeriesId, recurringPeriodId, recurrenceSourceDate,
                require(now, "삭제 시각"), version, getCreatedAt());
    }

    private void requireNotDeleted() {
        if (deletedAt != null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "삭제된 일정은 변경할 수 없습니다.");
        }
    }

    private void validateRange() {
        if (startDate.isAfter(endDate)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "종료일은 시작일보다 빠를 수 없습니다.");
        }
        if (exceedsOneYear()) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "개별 일정은 시작일부터 1년 이내로 설정해 주세요.");
        }
        if (allDay) {
            if (startTime != null || endTime != null) {
                throw new BusinessException(ErrorCode.INVALID_PARAMETER, "종일 일정에는 시각을 지정할 수 없습니다.");
            }
            return;
        }
        if (startTime == null || endTime == null ||
                !startDate.atTime(startTime).isBefore(endDate.atTime(endTime))) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "종료 일시는 시작 일시보다 늦어야 합니다.");
        }
    }

    private boolean exceedsOneYear() {
        try {
            return endDate.isAfter(startDate.plusYears(1));
        } catch (DateTimeException ignored) {
            // At LocalDate.MAX, no representable end date can exceed the one-year boundary.
            return false;
        }
    }

    private static String requiredText(String value, int maxLength, String fieldName) {
        if (value == null || value.isBlank() || value.trim().length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 1자 이상 " + maxLength + "자 이하여야 합니다.");
        }
        return value.trim();
    }

    private static String optionalText(String value, int maxLength, String fieldName) {
        if (value == null || value.isBlank()) {
            return null;
        }
        if (value.trim().length() > maxLength) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 " + maxLength + "자 이하여야 합니다.");
        }
        return value.trim();
    }

    private static <T> T require(T value, String fieldName) {
        if (value == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return value;
    }

    public Long getId() { return id; }
    public Group getGroup() { return group; }
    public GroupEventType getEventType() { return eventType; }
    public GroupEventStatus getStatus() { return status; }
    public GroupEventStatus getEffectiveStatus(LocalDate today) { return status.effectiveFor(startDate, today); }
    public String getTitle() { return title; }
    public LocalDate getStartDate() { return startDate; }
    public LocalDate getEndDate() { return endDate; }
    public boolean isAllDay() { return allDay; }
    public LocalTime getStartTime() { return startTime; }
    public LocalTime getEndTime() { return endTime; }
    public String getDescription() { return description; }
    public String getLocation() { return location; }
    public Long getRecurringSeriesId() { return recurringSeriesId; }
    public Long getRecurringPeriodId() { return recurringPeriodId; }
    public LocalDate getRecurrenceSourceDate() { return recurrenceSourceDate; }
    public boolean isRecurringOverride() { return recurringPeriodId != null; }
    public LocalDateTime getDeletedAt() { return deletedAt; }
    public Long getVersion() { return version; }

    @Override
    public boolean equals(Object object) {
        if (this == object) return true;
        if (!(object instanceof GroupEvent other)) return false;
        return id != null && other.id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return Objects.hashCode(id);
    }
}
