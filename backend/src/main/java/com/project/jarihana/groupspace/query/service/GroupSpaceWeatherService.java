package com.project.jarihana.groupspace.query.service;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupspace.client.OpenMeteoWeatherClient;
import com.project.jarihana.groupspace.domain.OutdoorWeather;
import com.project.jarihana.groupspace.query.service.dto.GroupSpaceWeatherResult;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class GroupSpaceWeatherService {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final OpenMeteoWeatherClient client;
    private final Clock clock;
    private OutdoorWeather cached;
    private LocalDateTime nextFetchAt = LocalDateTime.MIN;
    private LocalDate lastAttemptDate = LocalDate.MIN;
    private boolean stale;

    public synchronized GroupSpaceWeatherResult findWeather() {
        LocalDateTime now = LocalDateTime.now(clock.withZone(SEOUL));
        LocalDate today = now.toLocalDate();
        if (!now.isBefore(nextFetchAt) || !today.equals(lastAttemptDate)) {
            lastAttemptDate = today;
            try {
                OutdoorWeather weather = client.fetchWeather();
                if (!weather.sunrise().toLocalDate().equals(today)) throw unavailable();
                cached = weather;
                stale = false;
                nextFetchAt = now.plusMinutes(15);
            } catch (BusinessException exception) {
                stale = true;
                nextFetchAt = now.plusMinutes(1);
            }
        }
        if (cached == null || !cached.sunrise().toLocalDate().equals(today)) throw unavailable();
        return GroupSpaceWeatherResult.from(cached, stale);
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.GROUP_SPACE_WEATHER_UNAVAILABLE, "날씨를 잠시 불러올 수 없습니다.");
    }
}
