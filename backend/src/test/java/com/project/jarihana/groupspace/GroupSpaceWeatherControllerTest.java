package com.project.jarihana.groupspace;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.nullValue;
import static org.mockito.Mockito.when;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupspace.query.service.GroupSpaceWeatherService;
import com.project.jarihana.groupspace.query.service.dto.GroupSpaceWeatherResult;
import com.project.jarihana.support.IntegrationTestSupport;
import java.time.LocalDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

class GroupSpaceWeatherControllerTest extends IntegrationTestSupport {
    @MockitoBean
    private GroupSpaceWeatherService service;

    @Test
    @DisplayName("로그인 없이 서울 날씨와 일출·일몰을 공통 봉투로 조회한다")
    void readsWeatherPubliclyWithMinuteFormatAndStaleStatus() {
        // Given
        when(service.findWeather()).thenReturn(new GroupSpaceWeatherResult(61,
                LocalDateTime.parse("2026-11-09T07:05"), LocalDateTime.parse("2026-11-09T17:25"), true));

        // When / Then
        given().get("/group-spaces/weather").then().statusCode(200)
                .body("success", equalTo(true)).body("data.weatherCode", equalTo(61))
                .body("data.sunrise", equalTo("2026-11-09T07:05"))
                .body("data.sunset", equalTo("2026-11-09T17:25"))
                .body("data.stale", equalTo(true));
    }

    @Test
    @DisplayName("조회 불가 날씨는 민감한 내부 정보 없이 503으로 응답한다")
    void returnsUnavailableWeatherAsServiceUnavailable() {
        // Given
        when(service.findWeather()).thenThrow(new BusinessException(
                ErrorCode.GROUP_SPACE_WEATHER_UNAVAILABLE, "날씨를 잠시 불러올 수 없습니다."));

        // When / Then
        given().get("/group-spaces/weather").then().statusCode(503)
                .body("success", equalTo(false)).body("data", nullValue())
                .body("error.code", equalTo("GROUP_SPACE_WEATHER_UNAVAILABLE"));
    }
}
