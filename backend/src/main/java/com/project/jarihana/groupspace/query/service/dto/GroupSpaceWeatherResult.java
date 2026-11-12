package com.project.jarihana.groupspace.query.service.dto;

import com.project.jarihana.groupspace.domain.OutdoorWeather;
import java.time.LocalDateTime;

public record GroupSpaceWeatherResult(int weatherCode, LocalDateTime sunrise, LocalDateTime sunset, boolean stale) {
    public static GroupSpaceWeatherResult from(OutdoorWeather weather, boolean stale) {
        return new GroupSpaceWeatherResult(weather.weatherCode(), weather.sunrise(), weather.sunset(), stale);
    }
}
