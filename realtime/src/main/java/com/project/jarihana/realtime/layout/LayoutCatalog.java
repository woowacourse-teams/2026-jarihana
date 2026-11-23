package com.project.jarihana.realtime.layout;

import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;

@Component
public final class LayoutCatalog {
    public RoomLayout read(long revision, long catalogGeneration, JsonNode room, BlueprintRuntime blueprint,
            JsonNode furniture, JsonNode portableItems) {
        JsonNode geometry = blueprint.geometry();
        if (room.path("version").asInt() < 11) throw new RuleViolation("LAYOUT_UPGRADE_REQUIRED");
        Map<String, JsonNode> instances = new LinkedHashMap<>();
        for (JsonNode item : room.path("items")) {
            if (instances.putIfAbsent(item.path("id").asString(), item) != null) throw new RuleViolation("INVALID_LAYOUT");
        }
        Map<String, RoomAsset> assets = new LinkedHashMap<>();
        for (JsonNode item : instances.values()) {
            RoomAsset asset = asset(item, geometry, instances, furniture);
            assets.put(asset.id(), asset);
        }
        JsonNode building = geometry.path("building");
        String switchKind = "room-general-light-switch";
        RoomAsset light = asset(switchKind, switchKind, furniture.path(switchKind),
                new Vec3(-0.38, 0, building.path("maxZ").asDouble() - 0.2), 0, 1, 1, 1,
                false, 0);
        assets.put(light.id(), light);
        return new RoomLayout(revision, catalogGeneration, assets, geometry, blueprint.spawn(), portableItems);
    }

    private RoomAsset asset(JsonNode item, JsonNode geometry, Map<String, JsonNode> instances, JsonNode furniture) {
        String kind = item.path("kind").asString();
        JsonNode definition = furniture.path(kind);
        if (definition.isMissingNode()) throw new RuleViolation("UNSUPPORTED_ASSET");
        JsonNode rules = definition.path("interaction");
        List<String> features = strings(rules.path("capabilities"));
        boolean useFloor = features.contains("surface") || features.contains("seatable");
        double interactionFloor = useFloor
                ? floorElevation(item, geometry, instances, furniture) : 0;
        return asset(item.path("id").asString(), kind, definition,
                new Vec3(item.path("x").asDouble(), elevation(item, geometry, instances, furniture, new HashSet<>()), item.path("z").asDouble()),
                item.path("rotation").asDouble(), scale(item, "scaleX"), scale(item, "scaleY"), scale(item, "scaleZ"),
                !definition.hasNonNull("mount") && !underlay(definition), interactionFloor);
    }

    private RoomAsset asset(String id, String kind, JsonNode definition, Vec3 position, double rotation,
            double scaleX, double scaleY, double scaleZ, boolean obstacle, double interactionFloor) {
        JsonNode rules = definition.path("interaction");
        return new RoomAsset(id, kind, position, rotation, scaleX, scaleY, scaleZ,
                definition.path("width").asDouble(), definition.path("depth").asDouble(), definition.path("height").asDouble(),
                Set.copyOf(strings(rules.path("capabilities"))), rules.path("seatCount").asInt(0), strings(rules.path("storage").path("kinds")),
                strings(rules.path("producer").path("kinds")), rules.path("storage").path("capacity").asInt(0),
                obstacle, definition.path("walkableHeight").asDouble(0), rules.path("surface").path("slots").asInt(0), interactionFloor,
                rules.path("producer").path("durationMs").asLong(0), rules.path("cooldownMs").asLong(0));
    }

    private double elevation(JsonNode item, JsonNode geometry, Map<String, JsonNode> instances, JsonNode furniture, Set<String> visited) {
        if (!visited.add(item.path("id").asString())) throw new RuleViolation("INVALID_LAYOUT");
        JsonNode parent = instances.get(item.path("parentId").asString(""));
        if (parent != null) {
            JsonNode surfaces = furniture.path(parent.path("kind").asString()).path("surfaces");
            int index = item.path("surfaceIndex").asInt(0);
            if (index < 0 || index >= surfaces.size()) throw new RuleViolation("INVALID_LAYOUT");
            return elevation(parent, geometry, instances, furniture, visited) + surfaces.get(index).asDouble() * scale(parent, "scaleY");
        }
        return floorElevation(item, geometry, instances, furniture) + item.path("elevation").asDouble(0);
    }

    private double floorElevation(JsonNode item, JsonNode geometry, Map<String, JsonNode> instances, JsonNode furniture) {
        double base = item.path("level").asInt(0) == 1 ? geometry.path("mezzanine").path("height").asDouble() : 0;
        return base + supportHeight(item, instances, furniture);
    }

    private double supportHeight(JsonNode item, Map<String, JsonNode> instances, JsonNode furniture) {
        JsonNode ownDefinition = furniture.path(item.path("kind").asString());
        if (underlay(ownDefinition) || ownDefinition.hasNonNull("mount") ||
                ownDefinition.path("connectedSurface").asBoolean()) return 0;
        double ownWidth = ownDefinition.path("width").asDouble() * scale(item, "scaleX");
        double ownDepth = ownDefinition.path("depth").asDouble() * scale(item, "scaleZ");
        if (item.path("rotation").asInt() % 2 != 0) { double previous = ownWidth; ownWidth = ownDepth; ownDepth = previous; }
        double support = 0;
        for (JsonNode platform : instances.values()) {
            if (platform == item || item.path("level").asInt() != platform.path("level").asInt()) continue;
            JsonNode definition = furniture.path(platform.path("kind").asString());
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

    private static boolean underlay(JsonNode definition) {
        return definition.path("underlay").asBoolean(false) || definition.hasNonNull("walkableHeight");
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
