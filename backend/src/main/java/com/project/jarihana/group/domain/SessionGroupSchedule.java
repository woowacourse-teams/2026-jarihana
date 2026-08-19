package com.project.jarihana.group.domain;

import java.time.LocalDate;
import java.time.LocalTime;

public final class SessionGroupSchedule {

    private final LocalDate sessionDate;
    private final LocalTime startTime;
    private final LocalTime endTime;

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
            throw new IllegalArgumentException("세션 날짜는 필수입니다.");
        }
        return sessionDate;
    }

    private static LocalTime validateTime(LocalTime time, String fieldName) {
        if (time == null) {
            throw new IllegalArgumentException(fieldName + "은 필수입니다.");
        }
        return time;
    }

    private static void validateTimeRange(LocalTime startTime, LocalTime endTime) {
        if (!startTime.isBefore(endTime)) {
            throw new IllegalArgumentException("시작 시각은 종료 시각보다 빨라야 합니다.");
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
