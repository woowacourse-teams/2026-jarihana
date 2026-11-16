package com.project.jarihana.groupspace.query.controller.dto;

import com.project.jarihana.groupspace.query.service.dto.GroupSpaceWeatherResult;
import java.time.format.DateTimeFormatter;

public record GroupSpaceWeatherResponse(int weatherCode, String sunrise, String sunset, boolean stale) {
    private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("uuuu-MM-dd'T'HH:mm");

    public static GroupSpaceWeatherResponse from(GroupSpaceWeatherResult result) {
        return new GroupSpaceWeatherResponse(result.weatherCode(), MINUTE.format(result.sunrise()),
                MINUTE.format(result.sunset()), result.stale());
    }
}
