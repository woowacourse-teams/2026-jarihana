package com.project.jarihana.group.query.controller.dto;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;

class HomeRequestTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-19T15:00:00Z"), ZoneId.of("Asia/Seoul"));

    @DisplayName("홈 날짜 기본값은 UTC와 날짜가 다른 서울 자정의 날짜다.")
    @Test
    void defaultsToSeoulDateAtUtcBoundary() {
        // Given
        HomeRequest request = new HomeRequest(null);

        // When / Then
        assertThat(request.toQuery(CLOCK).sessionDate()).isEqualTo(LocalDate.of(2026, 10, 20));
    }

    @DisplayName("요청에 지정한 홈 날짜는 현재 날짜로 덮어쓰지 않는다.")
    @Test
    void preservesExplicitDate() {
        // Given
        LocalDate date = LocalDate.of(2026, 10, 21);

        // When / Then
        assertThat(new HomeRequest(date).toQuery(CLOCK).sessionDate()).isEqualTo(date);
    }
}
