package com.project.jarihana.group.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import java.time.LocalDate;
import java.time.LocalTime;

@Embeddable
public class SessionGroupSchedule {

    @Column(name = "session_date")
    private LocalDate sessionDate;

    @Column(name = "start_time")
    private LocalTime startTime;

    @Column(name = "end_time")
    private LocalTime endTime;

    protected SessionGroupSchedule() {
    }

    private SessionGroupSchedule(LocalDate sessionDate, LocalTime startTime, LocalTime endTime) {
        this.sessionDate = validateSessionDate(sessionDate);
        this.startTime = validateTime(startTime, "시작 시각");
        this.endTime = validateTime(endTime, "종료 시각");
        validateTimeRange(this.startTime, this.endTime);
    }

    public static SessionGroupSchedule of(LocalDate sessionDate, LocalTime startTime, LocalTime endTime) {
        return new SessionGroupSchedule(sessionDate, startTime, endTime);
    }

    private static LocalDate validateSessionDate(LocalDate sessionDate) {
        if (sessionDate == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "세션 날짜는 필수입니다.");
        }
        return sessionDate;
    }

    private static LocalTime validateTime(LocalTime time, String fieldName) {
        if (time == null) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, fieldName + "은 필수입니다.");
        }
        return time;
    }

    private static void validateTimeRange(LocalTime startTime, LocalTime endTime) {
        if (!startTime.isBefore(endTime)) {
            throw new BusinessException(ErrorCode.INVALID_PARAMETER, "시작 시각은 종료 시각보다 빨라야 합니다.");
        }
    }

    public LocalDate getSessionDate() {
        return sessionDate;
    }

    public LocalTime getStartTime() {
        return startTime;
    }

    public LocalTime getEndTime() {
        return endTime;
    }
}
