package com.project.jarihana.groupmusic.client;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.net.http.HttpClient;
import java.time.Duration;
import java.time.format.DateTimeParseException;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;

@Component
public class YoutubeMusicClient {
    private final String apiKey;
    private final RestClient http;

    @Autowired
    public YoutubeMusicClient(@Value("${jarihana.group-music.youtube-api-key:}") String apiKey) {
        this(apiKey, createHttpClient());
    }

    YoutubeMusicClient(String apiKey, RestClient http) {
        this.apiKey = apiKey;
        this.http = http;
    }

    public Optional<Duration> findPlayableDuration(String videoId) {
        JsonNode items = fetchItems("videos", "contentDetails,status", "id", videoId, null);
        if (items.isEmpty()) {
            return Optional.empty();
        }
        JsonNode video = items.path(0);
        JsonNode embeddable = video.path("status").path("embeddable");
        if (!videoId.equals(video.path("id").asString()) || !embeddable.isBoolean()) {
            throw unavailable();
        }
        String privacy = video.path("status").path("privacyStatus").asString();
        if (!embeddable.booleanValue() || "private".equals(privacy)) {
            return Optional.empty();
        }
        try {
            Duration duration = Duration.parse(video.path("contentDetails").path("duration").asString());
            if (duration.isPositive()) {
                return Optional.of(duration);
            }
        } catch (DateTimeParseException exception) {
            throw unavailable();
        }
        throw unavailable();
    }

    public PlaylistTrack getPlaylistTrack(String playlistId, int index) {
        String page = null;
        int remaining = index;
        // Older saved sources can still use a YouTube playlist. Resolve only the current position.
        for (int i = 0; i < 100; i++) {
            JsonNode response = fetch("playlistItems", "contentDetails", "playlistId", playlistId, page);
            JsonNode items = response.path("items");
            if (!items.isArray()) {
                throw unavailable();
            }
            page = response.path("nextPageToken").asString();
            if (remaining < items.size()) {
                String videoId = items.path(remaining).path("contentDetails").path("videoId").asString();
                if (videoId.isEmpty()) {
                    throw unavailable();
                }
                return new PlaylistTrack(videoId, remaining + 1 < items.size() || !page.isEmpty());
            }
            if (page.isEmpty()) {
                break;
            }
            remaining -= items.size();
        }
        throw unavailable();
    }

    private JsonNode fetchItems(String path, String part, String parameter, String id, String page) {
        JsonNode items = fetch(path, part, parameter, id, page).path("items");
        if (!items.isArray()) {
            throw unavailable();
        }
        return items;
    }

    private JsonNode fetch(String path, String part, String parameter, String id, String page) {
        if (apiKey.isBlank()) {
            throw unavailable();
        }
        try {
            JsonNode response = http.get().uri("/" + path, builder -> {
                builder.queryParam("part", part).queryParam(parameter, id);
                if ("playlistItems".equals(path)) {
                    builder.queryParam("maxResults", 50);
                }
                if (page != null) {
                    builder.queryParam("pageToken", page);
                }
                return builder.build();
            }).header("X-Goog-Api-Key", apiKey).retrieve().body(JsonNode.class);
            if (response == null) {
                throw unavailable();
            }
            return response;
        } catch (RestClientException exception) {
            throw unavailable();
        }
    }

    private static RestClient createHttpClient() {
        HttpClient transport = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(Duration.ofSeconds(3));
        return RestClient.builder().baseUrl("https://www.googleapis.com/youtube/v3").requestFactory(factory).build();
    }

    private BusinessException unavailable() {
        return new BusinessException(ErrorCode.GROUP_MUSIC_VERIFICATION_UNAVAILABLE, "유튜브 영상 정보를 잠시 확인할 수 없습니다.");
    }

    public record PlaylistTrack(String videoId, boolean hasNext) {
    }
}
