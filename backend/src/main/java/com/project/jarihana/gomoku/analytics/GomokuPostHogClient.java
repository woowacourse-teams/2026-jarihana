package com.project.jarihana.gomoku.analytics;

import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

import java.time.ZoneId;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

class GomokuPostHogClient {
    private final RestClient http;
    private final String projectToken;
    private final ZoneId zone;

    GomokuPostHogClient(RestClient http, String projectToken, ZoneId zone) {
        this.http = http;
        this.projectToken = projectToken;
        this.zone = zone;
    }

    void capture(List<GomokuPostHogEvent> events) {
        http.post()
                .uri("/batch/")
                .contentType(MediaType.APPLICATION_JSON)
                .body(Map.of("api_key", projectToken, "batch", events.stream().map(this::payload).toList()))
                .retrieve()
                .onStatus(status -> status.is3xxRedirection(), (request, response) -> {
                    throw new IllegalStateException("PostHog 수집 주소가 리다이렉트를 반환했습니다.");
                })
                .toBodilessEntity();
    }

    private Map<String, Object> payload(GomokuPostHogEvent event) {
        String gameId = "gomoku-game-" + event.gameId();
        Map<String, Object> properties = new HashMap<>();
        properties.put("game_id", gameId);
        properties.put("$process_person_profile", false);
        properties.put("$geoip_disable", true);
        if (event.endReason() != null) {
            properties.put("end_reason", event.endReason());
            properties.put("duration_ms", event.durationMs());
            properties.put("move_count", event.moveCount());
        }
        return Map.of(
                "uuid", event.id().toString(),
                "event", event.name(),
                "timestamp", event.occurredAt().atZone(zone).toInstant().toString(),
                "distinct_id", gameId,
                "properties", properties);
    }
}
