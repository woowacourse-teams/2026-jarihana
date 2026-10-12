package com.project.jarihana.group.calendar;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.Group;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "group_recurring_series")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupRecurringSeries extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private Group group;

    @Column(name = "calendar_start_date", nullable = false)
    private LocalDate calendarStartDate;

    @Column(name = "calendar_end_date")
    private LocalDate calendarEndDate;

    @Column(name = "flexible_from_date")
    private LocalDate flexibleFromDate;

    @Column(name = "is_current", nullable = false)
    private boolean current;

    @Column(name = "hide_all", nullable = false)
    private boolean hideAll;

    @Version
    @Column(name = "version", nullable = false)
    private Long version;

    private GroupRecurringSeries(Group group, LocalDate start, LocalDate end, LocalDateTime createdAt) {
        super(createdAt);
        if (group == null || start == null || createdAt == null || end != null && end.isBefore(start)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "정기 일정 전체 표시 기간이 올바르지 않습니다.");
        }
        this.group = group;
        this.calendarStartDate = start;
        this.calendarEndDate = end;
        this.current = true;
        this.hideAll = false;
    }

    public static GroupRecurringSeries create(Group group, LocalDate start, LocalDate end, LocalDateTime createdAt) {
        return new GroupRecurringSeries(group, start, end, createdAt);
    }

    public Long getId() { return id; }
    public Group getGroup() { return group; }
    public LocalDate getCalendarStartDate() { return calendarStartDate; }
    public LocalDate getCalendarEndDate() { return calendarEndDate; }
    public LocalDate getFlexibleFromDate() { return flexibleFromDate; }
    public boolean isCurrent() { return current; }
    public boolean isHideAll() { return hideAll; }
    public Long getVersion() { return version; }
}
