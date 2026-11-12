package com.project.jarihana.groupmusic.domain;

import com.project.jarihana.common.exception.BusinessException;
import com.project.jarihana.common.exception.ErrorCode;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
@RequiredArgsConstructor
public class MusicDocumentValidator {
    public static final String DEFAULT_MUSIC = """
            {"enabled":false,"autoplay":true,"title":"우리 모임의 음악","url":""}
            """;
    private static final Pattern VIDEO = Pattern.compile("[A-Za-z0-9_-]{11}");
    private static final Pattern PLAYLIST = Pattern.compile("[A-Za-z0-9_-]{10,100}");
    private static final Set<String> HOSTS = Set.of("youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com");
    private final ObjectMapper mapper;

    public String validateAndSerialize(JsonNode music) {
        require(music != null && music.isObject()
                && music.propertyNames().containsAll(Set.of("enabled", "autoplay", "title", "url"))
                && Set.of("enabled", "autoplay", "title", "url", "playlists").containsAll(music.propertyNames()));
        require(music.get("enabled").isBoolean() && music.get("autoplay").isBoolean());
        String title = text(music.get("title"), 80);
        String url = text(music.get("url"), 500);
        if (url.isEmpty()) {
            require(!music.get("enabled").asBoolean());
        } else {
            validateUrl(url);
        }
        if (music.has("playlists")) {
            validatePlaylists(music.get("playlists"), title, url);
        }
        return mapper.writeValueAsString(music);
    }

    public String validateQueueEntry(String title, String url) {
        require(title != null && !title.isBlank() && title.length() <= 80);
        require(url != null && !url.isBlank() && url.length() <= 500);
        validateUrl(url);
        return videoId(url).orElseThrow(() -> new BusinessException(ErrorCode.INVALID_PARAMETER,
                "재생목록 대신 유튜브 영상 링크를 입력해 주세요."));
    }

    public Optional<String> videoId(String url) {
        URI uri = URI.create(url);
        String path = uri.getRawPath();
        if ("/playlist".equals(path)) {
            return Optional.empty();
        }
        if ("/watch".equals(path)) {
            return Optional.ofNullable(query(uri.getRawQuery()).get("v"));
        }
        return Optional.of(path.substring(path.lastIndexOf('/') + 1));
    }

    public Optional<String> playlistId(String url) {
        return Optional.ofNullable(query(URI.create(url).getRawQuery()).get("list"));
    }

    private void validatePlaylists(JsonNode playlists, String selectedTitle, String selectedUrl) {
        require(playlists.isArray() && playlists.size() <= 20);
        Set<String> urls = new HashSet<>();
        boolean selectedPresent = selectedUrl.isEmpty();
        for (JsonNode playlist : playlists) {
            require(playlist.isObject() && playlist.size() == 2
                    && Set.of("title", "url").containsAll(playlist.propertyNames()));
            String title = text(playlist.get("title"), 80);
            require(!title.isBlank());
            String url = text(playlist.get("url"), 500);
            validateUrl(url);
            require(urls.add(url));
            selectedPresent |= selectedTitle.equals(title) && selectedUrl.equals(url);
        }
        require(selectedPresent);
    }

    private void validateUrl(String url) {
        try {
            URI uri = new URI(url);
            require("https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                    && uri.getRawUserInfo() == null && uri.getPort() == -1
                    && uri.getRawAuthority().equalsIgnoreCase(uri.getHost()));
            String host = uri.getHost().toLowerCase(Locale.ROOT);
            String path = uri.getRawPath();
            Map<String, String> query = query(uri.getRawQuery());
            if (query.containsKey("list")) require(PLAYLIST.matcher(query.get("list")).matches());
            if (host.equals("youtu.be")) {
                require(path != null && path.startsWith("/") && VIDEO.matcher(path.substring(1)).matches());
            } else {
                require(HOSTS.contains(host));
                if ("/watch".equals(path)) {
                    require(VIDEO.matcher(query.getOrDefault("v", "")).matches());
                } else if ("/playlist".equals(path)) {
                    require(PLAYLIST.matcher(query.getOrDefault("list", "")).matches());
                } else if (path != null && (path.startsWith("/shorts/") || path.startsWith("/embed/"))) {
                    require(VIDEO.matcher(path.substring(path.lastIndexOf('/') + 1)).matches()
                            && path.split("/", -1).length == 3);
                } else {
                    throw invalid();
                }
            }
        } catch (URISyntaxException | IllegalArgumentException exception) {
            throw invalid();
        }
    }

    private Map<String, String> query(String raw) {
        Map<String, String> values = new HashMap<>();
        if (raw == null || raw.isEmpty()) return values;
        for (String entry : raw.split("&")) {
            String[] pair = entry.split("=", 2);
            String key = URLDecoder.decode(pair[0], StandardCharsets.UTF_8);
            String value = pair.length == 2 ? URLDecoder.decode(pair[1], StandardCharsets.UTF_8) : "";
            require(values.putIfAbsent(key, value) == null);
        }
        return values;
    }

    private String text(JsonNode node, int max) {
        require(node != null && node.isString());
        String value = node.asString();
        require(value.length() <= max);
        return value;
    }

    private void require(boolean condition) { if (!condition) throw invalid(); }
    private BusinessException invalid() {
        return new BusinessException(ErrorCode.INVALID_PARAMETER, "음악 설정과 유튜브 영상 또는 재생목록 주소를 확인해 주세요.");
    }
}
