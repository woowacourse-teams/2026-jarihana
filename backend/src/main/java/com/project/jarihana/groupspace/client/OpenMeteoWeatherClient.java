package com.project.jarihana.groupspace.client;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import com.project.jarihana.groupspace.config.GroupSpaceWeatherProperties;
import com.project.jarihana.groupspace.domain.OutdoorWeather;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.DateTimeException;
import java.time.LocalDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;

@Component
public class OpenMeteoWeatherClient {
    private final GroupSpaceWeatherProperties properties;
    private final boolean prototype;
    private final RestClient http;

    @Autowired
    public OpenMeteoWeatherClient(GroupSpaceWeatherProperties properties, Environment environment) {
        this(properties, environment.acceptsProfiles(Profiles.of("local | dev"))
                && !environment.acceptsProfiles(Profiles.of("prod")), createHttpClient());
    }

    OpenMeteoWeatherClient(GroupSpaceWeatherProperties properties, boolean prototype, RestClient http) {
        this.properties = properties;
        this.prototype = prototype;
        this.http = http;
    }

    private static RestClient createHttpClient() {
        HttpClient transport = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(Duration.ofSeconds(3));
        return RestClient.builder().requestFactory(factory).build();
    }

    public OutdoorWeather fetchWeather() {
        if (!properties.enabled() || (!prototype && properties.apiKey().isEmpty())) {
            throw unavailable();
        }
        String host = properties.apiKey().isEmpty() ? "https://api.open-meteo.com" : "https://customer-api.open-meteo.com";
        try {
            JsonNode response = http.get().uri(host + "/v1/forecast", builder -> {
                builder.queryParam("latitude", "37.5665").queryParam("longitude", "126.978")
                        .queryParam("current", "weather_code").queryParam("daily", "sunrise,sunset")
                        .queryParam("forecast_days", 1).queryParam("timezone", "Asia/Seoul");
                if (!properties.apiKey().isEmpty()) builder.queryParam("apikey", properties.apiKey());
                return builder.build();
            }).retrieve().body(JsonNode.class);
            if (response == null || !response.path("current").path("weather_code").isIntegralNumber()
                    || !response.path("current").path("weather_code").canConvertToInt()
                    || !response.path("daily").path("sunrise").path(0).isString()
                    || !response.path("daily").path("sunset").path(0).isString()) {
                throw unavailable();
            }
            return OutdoorWeather.of(response.path("current").path("weather_code").intValue(),
                    LocalDateTime.parse(response.path("daily").path("sunrise").path(0).asString()),
                    LocalDateTime.parse(response.path("daily").path("sunset").path(0).asString()));
        } catch (RestClientException | IllegalArgumentException | DateTimeException exception) {
            throw unavailable();
        }
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.GROUP_SPACE_WEATHER_UNAVAILABLE, "날씨를 잠시 불러올 수 없습니다.");
    }
}
