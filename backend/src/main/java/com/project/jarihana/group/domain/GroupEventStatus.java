package com.project.jarihana.group.domain;

import java.time.LocalDate;

public enum GroupEventStatus {
    AUTO,
    UPCOMING,
    COMPLETED;

    public GroupEventStatus effectiveFor(LocalDate eventDate, LocalDate today) {
        if (this != AUTO) {
            return this;
        }
        return eventDate.isBefore(today) ? COMPLETED : UPCOMING;
    }
}
