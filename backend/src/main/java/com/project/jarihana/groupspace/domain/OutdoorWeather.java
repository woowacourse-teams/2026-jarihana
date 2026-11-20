package com.project.jarihana.groupspace.domain;

import java.time.LocalDateTime;
import java.util.Set;

public record OutdoorWeather(int weatherCode, LocalDateTime sunrise, LocalDateTime sunset) {
    private static final Set<Integer> WEATHER_CODES = Set.of(0, 1, 2, 3, 45, 48, 51, 53, 55,
            56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99);

    public OutdoorWeather {
        if (!WEATHER_CODES.contains(weatherCode) || sunrise == null || sunset == null
                || !sunrise.toLocalDate().equals(sunset.toLocalDate()) || !sunrise.isBefore(sunset)) {
            throw new IllegalArgumentException("날씨와 일출·일몰 데이터 형식을 확인해 주세요.");
        }
    }

    public static OutdoorWeather of(int weatherCode, LocalDateTime sunrise, LocalDateTime sunset) {
        return new OutdoorWeather(weatherCode, sunrise, sunset);
    }
}
