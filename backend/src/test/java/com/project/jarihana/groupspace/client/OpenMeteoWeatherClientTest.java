package com.project.jarihana.groupspace.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.groupspace.config.GroupSpaceWeatherProperties;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class OpenMeteoWeatherClientTest {
    private static final String FORECAST = """
            {"current":{"weather_code":61},"daily":{"sunrise":["2026-11-09T07:05"],
            "sunset":["2026-11-09T17:25"]}}
            """;

    @Test
    @DisplayName("시제품 날씨는 서울 좌표와 한국 시각으로 조회한다")
    void fetchesPrototypeForecastInSeoulTime() {
        // Given
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        OpenMeteoWeatherClient client = new OpenMeteoWeatherClient(
                new GroupSpaceWeatherProperties(true, ""), true, builder.build());
        server.expect(requestTo(startsWith("https://api.open-meteo.com/v1/forecast?")))
                .andExpect(queryParam("latitude", "37.5665"))
                .andExpect(queryParam("longitude", "126.978"))
                .andExpect(queryParam("timezone", "Asia/Seoul"))
                .andExpect(queryParam("current", "weather_code"))
                .andExpect(queryParam("daily", "sunrise,sunset"))
                .andRespond(withSuccess(FORECAST, MediaType.APPLICATION_JSON));

        // When
        var weather = client.fetchWeather();

        // Then
        assertThat(weather.weatherCode()).isEqualTo(61);
        assertThat(weather.sunrise().toString()).isEqualTo("2026-11-09T07:05");
        server.verify();
    }

    @Test
    @DisplayName("운영 날씨는 활성화와 고객용 키가 필요하다")
    void requiresEnabledCustomerKeyOutsidePrototype() {
        // Given
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        OpenMeteoWeatherClient missingKey = new OpenMeteoWeatherClient(
                new GroupSpaceWeatherProperties(true, ""), false, builder.build());
        OpenMeteoWeatherClient disabled = new OpenMeteoWeatherClient(
                new GroupSpaceWeatherProperties(false, "test-key"), false, builder.build());

        // When / Then
        assertThatThrownBy(missingKey::fetchWeather).isInstanceOf(BusinessException.class);
        assertThatThrownBy(disabled::fetchWeather).isInstanceOf(BusinessException.class);
        server.verify();
    }

    @Test
    @DisplayName("고객용 키는 고객 전용 API에만 보낸다")
    void sendsConfiguredKeyToCustomerEndpoint() {
        // Given
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        var properties = new GroupSpaceWeatherProperties(true, "test-key");
        OpenMeteoWeatherClient client = new OpenMeteoWeatherClient(properties, false, builder.build());
        server.expect(requestTo(startsWith("https://customer-api.open-meteo.com/v1/forecast?")))
                .andExpect(queryParam("apikey", "test-key"))
                .andRespond(withSuccess(FORECAST, MediaType.APPLICATION_JSON));

        // When / Then
        assertThat(client.fetchWeather().weatherCode()).isEqualTo(61);
        assertThat(properties.toString()).doesNotContain("test-key");
        server.verify();
    }

    @Test
    @DisplayName("알 수 없는 코드와 손상된 일출·일몰·외부 오류를 실패로 처리한다")
    void rejectsMalformedWeatherAndUpstreamFailure() {
        // Given
        List<String> invalid = List.of("{}", FORECAST.replace("61", "4"),
                FORECAST.replace("61", "4294967296"), FORECAST.replace("07:05", "invalid"),
                FORECAST.replace("17:25", "06:00"), FORECAST.replace("2026-11-09T17", "2026-11-10T17"));

        // When / Then
        for (String body : invalid) {
            RestClient.Builder builder = RestClient.builder();
            MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
            server.expect(requestTo(startsWith("https://api.open-meteo.com/")))
                    .andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
            OpenMeteoWeatherClient client = new OpenMeteoWeatherClient(
                    new GroupSpaceWeatherProperties(true, ""), true, builder.build());
            assertThatThrownBy(client::fetchWeather).isInstanceOf(BusinessException.class);
            server.verify();
        }
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(startsWith("https://api.open-meteo.com/"))).andRespond(withServerError());
        OpenMeteoWeatherClient client = new OpenMeteoWeatherClient(
                new GroupSpaceWeatherProperties(true, ""), true, builder.build());
        assertThatThrownBy(client::fetchWeather).isInstanceOf(BusinessException.class)
                .hasMessage("날씨를 잠시 불러올 수 없습니다.");
        server.verify();
    }
}
