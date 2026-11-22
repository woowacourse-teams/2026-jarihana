package com.project.jarihana.realtime.layout;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class TestBlueprints {
    private static final Map<String, JsonNode> SEED = loadSeed();

    private TestBlueprints() {}

    public static JsonNode geometry(String key) {
        JsonNode geometry = SEED.get(key);
        if (geometry == null) throw new IllegalArgumentException("Missing migration fixture " + key);
        return geometry;
    }

    private static Map<String, JsonNode> loadSeed() {
        var source = new ClassPathResource("V45__versioned_space_blueprints.sql");
        var entry = Pattern.compile("^\\s*\\('([a-z]+)', (\\d+), 1, '(.*)'::jsonb\\)[,;]$");
        var mapper = JsonMapper.builder().build();
        Map<String, JsonNode> geometries = new HashMap<>();
        try (var reader = new BufferedReader(new InputStreamReader(source.getInputStream(), StandardCharsets.UTF_8))) {
            reader.lines().map(entry::matcher).filter(matcher -> matcher.matches()).forEach(matcher ->
                    geometries.put(matcher.group(2) + ":" + matcher.group(1), mapper.readTree(matcher.group(3).replace("''", "'"))));
        } catch (IOException error) {
            throw new IllegalStateException(error);
        }
        return Map.copyOf(geometries);
    }
}
