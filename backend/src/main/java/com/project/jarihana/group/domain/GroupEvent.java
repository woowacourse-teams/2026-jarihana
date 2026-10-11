package com.project.jarihana.group.domain;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
        @Index(name = "idx_group_event_group_range", columnList = "group_id, start_date, end_date")
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

    @Column(name = "deleted_at")
    private LocalDateTime deletedAt;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private GroupEvent(
            Long id,
            Group group,
            String title,
            LocalDate startDate,
            LocalDate endDate,
            boolean allDay,
            LocalTime startTime,
            LocalTime endTime,
            String description,
            String location,
            LocalDateTime deletedAt,
            Long version,
            LocalDateTime createdAt
    ) {
        super(require(createdAt, "생성 시각"));
        this.id = id;
        this.group = require(group, "모임");
        this.title = requiredText(title, 50, "일정 제목");
        this.startDate = require(startDate, "시작일");
        this.endDate = require(endDate, "종료일");
        this.allDay = allDay;
        this.startTime = startTime;
        this.endTime = endTime;
        this.description = requiredText(description, 10_000, "설명");
        this.location = optionalText(location, 255, "장소");
        this.deletedAt = deletedAt;
        this.version = version;
        validateRange();
    }

    public static GroupEvent create(
            Group group,
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
        return new GroupEvent(null, group, title, startDate, endDate, allDay, startTime, endTime,
                description, location, null, null, createdAt);
    }

    public GroupEvent modify(
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
        return new GroupEvent(id, group, title, startDate, endDate, allDay, startTime, endTime,
                description, location, null, version, getCreatedAt());
    }

    public GroupEvent deleteAt(LocalDateTime now) {
        requireNotDeleted();
        return new GroupEvent(id, group, title, startDate, endDate, allDay, startTime, endTime,
                description, location, require(now, "삭제 시각"), version, getCreatedAt());
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
    public String getTitle() { return title; }
    public LocalDate getStartDate() { return startDate; }
    public LocalDate getEndDate() { return endDate; }
    public boolean isAllDay() { return allDay; }
    public LocalTime getStartTime() { return startTime; }
    public LocalTime getEndTime() { return endTime; }
    public String getDescription() { return description; }
    public String getLocation() { return location; }
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
