package com.project.jarihana.realtime.layout;

import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@Component
public final class LayoutCatalog {
    private final JsonNode runtime;
    private final JsonNode capabilities;
    private final JsonNode surfaceAnchors;

    public LayoutCatalog(ObjectMapper mapper) throws IOException {
        try (var source = new ClassPathResource("contracts/space-runtime.json").getInputStream();
             var rules = new ClassPathResource("contracts/asset-capabilities.json").getInputStream();
             var anchors = new ClassPathResource("contracts/surface-anchors.json").getInputStream()) {
            runtime = mapper.readTree(source);
            capabilities = mapper.readTree(rules);
            surfaceAnchors = mapper.readTree(anchors);
        }
    }

    public RoomLayout read(long revision, JsonNode source) {
        JsonNode room = source == null || source.isNull() ? runtime.path("defaultRoom") : source;
        if (room.path("version").asInt() < 11) throw new RuleViolation("LAYOUT_UPGRADE_REQUIRED");
        String key = room.path("version").asInt(11) + ":" + room.path("template").asString("lounge");
        JsonNode geometry = runtime.path("layouts").path(key);
        if (geometry.isMissingNode()) throw new RuleViolation("UNSUPPORTED_LAYOUT");
        Map<String, JsonNode> instances = new LinkedHashMap<>();
        for (JsonNode item : room.path("items")) {
            if (instances.putIfAbsent(item.path("id").asString(), item) != null) throw new RuleViolation("INVALID_LAYOUT");
        }
        Map<String, RoomAsset> assets = new LinkedHashMap<>();
        for (JsonNode item : instances.values()) {
            RoomAsset asset = asset(item, geometry, instances);
            assets.put(asset.id(), asset);
        }
        JsonNode building = geometry.path("building");
        RoomAsset light = new RoomAsset("room-general-light-switch", "room-general-light-switch",
                new Vec3(-0.38, 0, building.path("maxZ").asDouble() - 0.2),
                0, 1, 1, 1, 0.3, 0.3, 1.2, Set.of("switchable"), List.of(), List.of(), List.of(), 0,
                false, 0, List.of(), 0, 0, 0);
        assets.put(light.id(), light);
        JsonNode spawn = runtime.path("player").path("spawn");
        return new RoomLayout(revision, assets, geometry, new Vec3(spawn.path("x").asDouble(), 0, spawn.path("z").asDouble()), capabilities.path("items"));
    }

    private RoomAsset asset(JsonNode item, JsonNode geometry, Map<String, JsonNode> instances) {
        String kind = item.path("kind").asString();
        JsonNode definition = runtime.path("assets").path(kind);
        if (definition.isMissingNode()) throw new RuleViolation("UNSUPPORTED_ASSET");
        JsonNode rules = capabilities.path("assets").path(kind);
        double width = definition.path("width").asDouble(), depth = definition.path("depth").asDouble();
        double height = definition.path("height").asDouble();
        Set<String> features = new HashSet<>(strings(rules.path("capabilities")));
        List<Vec3> seats = new ArrayList<>();
        for (JsonNode seat : rules.path("seats")) {
            seats.add(new Vec3(seat.path("x").asDouble(), seat.path("y").asDouble() +
                    seat.path("avatarOffsetY").asDouble(0) / scale(item, "scaleY"), seat.path("z").asDouble()));
        }
        List<Vec3> surfaces = new ArrayList<>();
        for (JsonNode anchor : surfaceAnchors.path(kind)) {
            surfaces.add(new Vec3(anchor.path("x").asDouble(), anchor.path("y").asDouble(), anchor.path("z").asDouble()));
        }
        double interactionFloor = features.contains("surface") ? floorElevation(item, geometry, instances) : 0;
        return new RoomAsset(item.path("id").asString(), kind,
                new Vec3(item.path("x").asDouble(), elevation(item, geometry, instances, new HashSet<>()), item.path("z").asDouble()),
                item.path("rotation").asDouble(), scale(item, "scaleX"), scale(item, "scaleY"), scale(item, "scaleZ"),
                width, depth, height, features, seats, strings(rules.path("storage").path("kinds")),
                strings(rules.path("producer").path("kinds")), rules.path("storage").path("capacity").asInt(8),
                !definition.path("mounted").asBoolean(false) && !definition.path("underlay").asBoolean(false),
                definition.path("walkableHeight").asDouble(0), surfaces, interactionFloor,
                rules.path("producer").path("durationMs").asLong(4000), rules.path("cooldownMs").asLong(30000));
    }

    private double elevation(JsonNode item, JsonNode geometry, Map<String, JsonNode> instances, Set<String> visited) {
        if (!visited.add(item.path("id").asString())) throw new RuleViolation("INVALID_LAYOUT");
        JsonNode parent = instances.get(item.path("parentId").asString(""));
        if (parent != null) {
            JsonNode surfaces = runtime.path("assets").path(parent.path("kind").asString()).path("surfaces");
            int index = item.path("surfaceIndex").asInt(0);
            if (index < 0 || index >= surfaces.size()) throw new RuleViolation("INVALID_LAYOUT");
            return elevation(parent, geometry, instances, visited) + surfaces.get(index).asDouble() * scale(parent, "scaleY");
        }
        return floorElevation(item, geometry, instances) + item.path("elevation").asDouble(0);
    }

    private double floorElevation(JsonNode item, JsonNode geometry, Map<String, JsonNode> instances) {
        double base = item.path("level").asInt(0) == 1 ? geometry.path("mezzanine").path("height").asDouble() : 0;
        return base + supportHeight(item, instances);
    }

    private double supportHeight(JsonNode item, Map<String, JsonNode> instances) {
        JsonNode ownDefinition = runtime.path("assets").path(item.path("kind").asString());
        if (ownDefinition.path("underlay").asBoolean() || ownDefinition.path("mounted").asBoolean() ||
                ownDefinition.path("connectedSurface").asBoolean()) return 0;
        double ownWidth = ownDefinition.path("width").asDouble() * scale(item, "scaleX");
        double ownDepth = ownDefinition.path("depth").asDouble() * scale(item, "scaleZ");
        if (item.path("rotation").asInt() % 2 != 0) { double previous = ownWidth; ownWidth = ownDepth; ownDepth = previous; }
        double support = 0;
        for (JsonNode platform : instances.values()) {
            if (platform == item || item.path("level").asInt() != platform.path("level").asInt()) continue;
            JsonNode definition = runtime.path("assets").path(platform.path("kind").asString());
            double height = definition.path("walkableHeight").asDouble(0);
            if (height <= 0) continue;
            double width = definition.path("width").asDouble() * scale(platform, "scaleX");
            double depth = definition.path("depth").asDouble() * scale(platform, "scaleZ");
            if (platform.path("rotation").asInt() % 2 != 0) { double old = width; width = depth; depth = old; }
            if (Math.abs(item.path("x").asDouble() - platform.path("x").asDouble()) + ownWidth / 2 <= width / 2 &&
                    Math.abs(item.path("z").asDouble() - platform.path("z").asDouble()) + ownDepth / 2 <= depth / 2) {
                support = Math.max(support, height * scale(platform, "scaleY"));
            }
        }
        return support;
    }

    private static double scale(JsonNode item, String field) {
        double value = item.path(field).asDouble(1);
        if (!Double.isFinite(value) || value <= 0 || value > 10) throw new RuleViolation("INVALID_LAYOUT");
        return value;
    }

    private static List<String> strings(JsonNode values) {
        List<String> result = new ArrayList<>();
        for (JsonNode value : values) result.add(value.asString());
        return result;
    }
}
