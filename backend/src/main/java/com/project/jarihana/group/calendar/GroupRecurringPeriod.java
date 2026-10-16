package com.project.jarihana.group.calendar;

import com.project.jarihana.common.domain.BaseEntity;
import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.group.domain.ActivityDays;
import com.project.jarihana.group.domain.ActivityDaysConverter;
import jakarta.persistence.*;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Set;

@Entity
@Table(name = "group_recurring_schedule_period")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class GroupRecurringPeriod extends BaseEntity {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "series_id", nullable = false)
    private GroupRecurringSeries series;

    @Convert(converter = ActivityDaysConverter.class)
    @Column(name = "days_of_week", nullable = false)
    private ActivityDays daysOfWeek;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    @Column(name = "effective_from", nullable = false)
    private LocalDate effectiveFrom;

    @Column(name = "effective_until")
    private LocalDate effectiveUntil;

    private GroupRecurringPeriod(Long id, GroupRecurringSeries series, Set<DayOfWeek> days,
                                 LocalTime startTime, LocalTime endTime,
                                 LocalDate from, LocalDate until, LocalDateTime createdAt) {
        super(createdAt);
        if (series == null || from == null || createdAt == null || until != null && until.isBefore(from)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "정기 일정 적용 기간이 올바르지 않습니다.");
        }
        if ((startTime == null) != (endTime == null) ||
                startTime != null && !startTime.isBefore(endTime)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "정기 일정 시각이 올바르지 않습니다.");
        }
        this.id = id;
        this.series = series;
        this.daysOfWeek = ActivityDays.from(days);
        this.startTime = startTime;
        this.endTime = endTime;
        this.effectiveFrom = from;
        this.effectiveUntil = until;
    }

    public static GroupRecurringPeriod create(GroupRecurringSeries series, Set<DayOfWeek> days,
                                              LocalTime startTime, LocalTime endTime,
                                              LocalDate from, LocalDate until, LocalDateTime createdAt) {
        return new GroupRecurringPeriod(null, series, days, startTime, endTime, from, until, createdAt);
    }

    public GroupRecurringPeriod withRule(Set<DayOfWeek> days, LocalTime startTime, LocalTime endTime) {
        return new GroupRecurringPeriod(id, series, days, startTime, endTime,
                effectiveFrom, effectiveUntil, getCreatedAt());
    }

    public GroupRecurringPeriod endingOn(LocalDate until) {
        return new GroupRecurringPeriod(id, series, daysOfWeek.values(), startTime, endTime,
                effectiveFrom, until, getCreatedAt());
    }

    public Long getId() { return id; }
    public GroupRecurringSeries getSeries() { return series; }
    public ActivityDays getDaysOfWeek() { return daysOfWeek; }
    public LocalTime getStartTime() { return startTime; }
    public LocalTime getEndTime() { return endTime; }
    public LocalDate getEffectiveFrom() { return effectiveFrom; }
    public LocalDate getEffectiveUntil() { return effectiveUntil; }
}
