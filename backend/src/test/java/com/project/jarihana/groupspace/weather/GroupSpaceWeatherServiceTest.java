package com.project.jarihana.groupspace.weather;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupspace.client.OpenMeteoWeatherClient;
import com.project.jarihana.groupspace.domain.OutdoorWeather;
import com.project.jarihana.groupspace.query.service.GroupSpaceWeatherService;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class GroupSpaceWeatherServiceTest {
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private final OpenMeteoWeatherClient client = mock(OpenMeteoWeatherClient.class);
    private final Clock clock = mock(Clock.class);
    private final GroupSpaceWeatherService service = new GroupSpaceWeatherService(client, clock);
    private final OutdoorWeather weather = OutdoorWeather.of(3,
            LocalDateTime.parse("2026-11-09T07:05"), LocalDateTime.parse("2026-11-09T17:25"));

    private void at(String value) {
        when(clock.instant()).thenReturn(LocalDateTime.parse(value).atZone(SEOUL).toInstant());
        when(clock.getZone()).thenReturn(SEOUL);
        when(clock.withZone(SEOUL)).thenReturn(clock);
    }

    @Test
    @DisplayName("같은 날의 성공 응답은 15분 동안 공유한다")
    void sharesSuccessfulWeatherForFifteenMinutes() {
        // Given
        at("2026-11-09T12:00");
        when(client.fetchWeather()).thenReturn(weather);

        // When / Then
        assertThat(service.findWeather().stale()).isFalse();
        at("2026-11-09T12:14:59");
        assertThat(service.findWeather().weatherCode()).isEqualTo(3);
        verify(client, times(1)).fetchWeather();
        at("2026-11-09T12:15");
        service.findWeather();
        verify(client, times(2)).fetchWeather();
    }

    @Test
    @DisplayName("외부 오류는 1분 후 재시도하고 같은 날의 이전 응답임을 표시한다")
    void backsOffFailureAndMarksSameDayFallbackStale() {
        // Given
        at("2026-11-09T12:00");
        when(client.fetchWeather()).thenReturn(weather)
                .thenThrow(new BusinessException(ErrorCode.GROUP_SPACE_WEATHER_UNAVAILABLE, "날씨 조회 실패"));
        service.findWeather();

        // When / Then
        at("2026-11-09T12:15");
        assertThat(service.findWeather().stale()).isTrue();
        at("2026-11-09T12:15:59");
        assertThat(service.findWeather().stale()).isTrue();
        verify(client, times(2)).fetchWeather();
        at("2026-11-09T12:16");
        assertThat(service.findWeather().stale()).isTrue();
        verify(client, times(3)).fetchWeather();
    }

    @Test
    @DisplayName("날짜가 바뀌면 이전 날씨와 일출 시간을 반환하지 않는다")
    void refusesPriorDayWeatherAndBacksOffWithoutCache() {
        // Given
        at("2026-11-09T23:59");
        when(client.fetchWeather()).thenReturn(weather);
        service.findWeather();

        // When / Then
        at("2026-11-10T00:00");
        assertThatThrownBy(service::findWeather).isInstanceOf(BusinessException.class);
        verify(client, times(2)).fetchWeather();
        at("2026-11-10T00:00:30");
        assertThatThrownBy(service::findWeather).isInstanceOf(BusinessException.class);
        verify(client, times(2)).fetchWeather();
    }
}
