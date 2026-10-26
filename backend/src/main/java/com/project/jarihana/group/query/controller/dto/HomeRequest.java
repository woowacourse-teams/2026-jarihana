package com.project.jarihana.group.query.controller.dto;

import com.project.jarihana.group.query.service.dto.HomeQuery;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.Clock;
import java.time.LocalDate;

public record HomeRequest(@DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate sessionDate) {

    public HomeQuery toQuery(Clock clock) {
        return new HomeQuery(sessionDate == null ? LocalDate.now(clock) : sessionDate);
    }
}
