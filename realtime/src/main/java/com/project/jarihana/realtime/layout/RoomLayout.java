package com.project.jarihana.realtime.layout;

import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import tools.jackson.databind.JsonNode;

public record RoomLayout(long revision, Map<String, RoomAsset> assets, JsonNode geometry, Vec3 arrival, JsonNode itemRules) {
    public RoomLayout { assets = Map.copyOf(assets); }

    public boolean itemCapability(String kind, String capability) { return itemRules.path(kind).path(capability).asBoolean(false); }
    public String emptyKind(String kind) { return itemRules.path(kind).path("emptyKind").asString(null); }

    public RoomAsset asset(String id, String capability) {
        RoomAsset asset = assets.get(id);
        if (asset == null) throw new RuleViolation("ASSET_NOT_FOUND");
        if (!asset.has(capability)) throw new RuleViolation("UNSUPPORTED_ACTION");
        return asset;
    }

    public double floorAt(Vec3 point) {
        JsonNode stairs = geometry.path("stairs"), mezzanine = geometry.path("mezzanine");
        if (inside(stairs, point.x(), point.z())) {
            return (stairs.path("maxZ").asDouble() - point.z()) /
                    (stairs.path("maxZ").asDouble() - stairs.path("minZ").asDouble()) * stairs.path("height").asDouble();
        }
        double base = inside(mezzanine, point.x(), point.z()) && point.y() >= mezzanine.path("height").asDouble() - 0.2
                ? mezzanine.path("height").asDouble() : 0;
        double platform = 0;
        for (RoomAsset asset : assets.values()) {
            if (asset.platformHeight() <= 0 || Math.abs(asset.position().y() - base) > 0.1) continue;
            Vec3 local = asset.local(point);
            if (Math.abs(local.x()) <= asset.width() / 2 && Math.abs(local.z()) <= asset.depth() / 2) {
                platform = Math.max(platform, asset.platformHeight() * asset.scaleY());
            }
        }
        return base + platform;
    }

    public boolean valid(Vec3 point, boolean jumping) {
        double floor = floorAt(point);
        if (point.y() < floor - 0.05 || point.y() > floor + (jumping ? 1.2 : 0.05)) return false;
        Vec3 ground = new Vec3(point.x(), floor, point.z());
        JsonNode mezzanine = geometry.path("mezzanine");
        boolean elevated = !mezzanine.isMissingNode() && (floor >= mezzanine.path("height").asDouble() - 0.2 ||
                inside(geometry.path("stairs"), point.x(), point.z()));
        List<JsonNode> areas = new ArrayList<>();
        if (elevated) {
            areas.add(mezzanine);
            var stairs = geometry.path("stairs").deepCopy();
            if (stairs instanceof tools.jackson.databind.node.ObjectNode bounds) {
                bounds.put("maxZ", bounds.path("maxZ").asDouble() + 0.3);
            }
            areas.add(stairs);
        } else {
            areas.add(geometry.path("building"));
            for (JsonNode area : geometry.path("exterior")) areas.add(area);
            if (areas.size() == 1) areas.add(geometry.hasNonNull("terrace") ? geometry.path("terrace") : geometry.path("entrance"));
        }
        for (double dx : new double[]{-0.3, 0.3}) {
            for (double dz : new double[]{-0.3, 0.3}) {
                if (areas.stream().noneMatch(area -> inside(area, point.x() + dx, point.z() + dz))) return false;
            }
        }
        for (String kind : List.of("walls", "pillars", "stairRails")) {
            for (JsonNode wall : geometry.path(kind)) if (overlaps(wall, point)) return false;
        }
        if (floor >= mezzanine.path("height").asDouble(Double.MAX_VALUE) - 0.2) {
            for (JsonNode rail : geometry.path("railings")) if (overlaps(rail, point)) return false;
        }
        if (!elevated) {
            for (JsonNode fixture : geometry.path("terrace").path("fixtures")) if (overlaps(fixture, point)) return false;
        }
        if (!elevated || floor < 2.5) {
            for (JsonNode area : geometry.path("facilityWalk")) {
                if (point.x() + 0.3 > area.path("minX").asDouble() && point.x() - 0.3 < area.path("maxX").asDouble() &&
                        point.z() + 0.3 > area.path("minZ").asDouble() && point.z() - 0.3 < area.path("maxZ").asDouble()) return false;
            }
        }
        return assets.values().stream().noneMatch(asset -> asset.blocks(ground));
    }

    public Vec3 safe(Vec3 preferred) {
        Vec3 ground = new Vec3(preferred.x(), floorAt(preferred), preferred.z());
        if (valid(ground, false)) return ground;
        for (double radius = 0.5; radius <= 4; radius += 0.5) {
            for (int direction = 0; direction < 16; direction++) {
                double angle = direction * Math.PI / 8;
                Vec3 candidate = new Vec3(preferred.x() + Math.cos(angle) * radius, preferred.y(), preferred.z() + Math.sin(angle) * radius);
                candidate = new Vec3(candidate.x(), floorAt(candidate), candidate.z());
                if (valid(candidate, false)) return candidate;
            }
        }
        for (int z = 0; z <= 30; z++) {
            for (int x = -10; x <= 10; x++) {
                Vec3 candidate = new Vec3(arrival.x() + x, 0, geometry.path("building").path("maxZ").asDouble() + z * 0.5);
                if (valid(candidate, false)) return candidate;
            }
        }
        throw new RuleViolation("NO_SAFE_POSITION");
    }

    public Vec3 spawn() { return safe(arrival); }

    public Vec3 spawn(List<Vec3> occupied) {
        Vec3 origin = spawn();
        if (occupied.stream().noneMatch(point -> point.distance(origin) < 0.85)) return origin;
        for (double radius = 0.9; radius <= 6; radius += 0.9) {
            for (int direction = 0; direction < 16; direction++) {
                double angle = direction * Math.PI / 8;
                Vec3 candidate = new Vec3(origin.x() + Math.cos(angle) * radius, origin.y(), origin.z() + Math.sin(angle) * radius);
                Vec3 ground = new Vec3(candidate.x(), floorAt(candidate), candidate.z());
                if (valid(ground, false) && occupied.stream().noneMatch(point -> point.distance(ground) < 0.85)) return ground;
            }
        }
        return origin;
    }

    public boolean pathAllowed(Vec3 from, Vec3 to, boolean jumping) {
        int steps = Math.max(1, (int) Math.ceil(Math.hypot(to.x() - from.x(), to.z() - from.z()) / 0.15));
        Vec3 previous = from;
        for (int step = 1; step <= steps; step++) {
            double ratio = (double) step / steps;
            Vec3 sample = new Vec3(from.x() + (to.x() - from.x()) * ratio, previous.y(), from.z() + (to.z() - from.z()) * ratio);
            double ground = floorAt(sample);
            if (Math.abs(ground - floorAt(previous)) > 0.4) return false;
            Vec3 point = new Vec3(sample.x(), ground, sample.z());
            if (!valid(point, false)) return false;
            previous = point;
        }
        return valid(to, jumping) && Math.abs(floorAt(to) - floorAt(previous)) < 0.4;
    }

    private static boolean inside(JsonNode bounds, double x, double z) {
        return bounds.has("minX") && x >= bounds.path("minX").asDouble() && x <= bounds.path("maxX").asDouble() &&
                z >= bounds.path("minZ").asDouble() && z <= bounds.path("maxZ").asDouble();
    }

    private static boolean overlaps(JsonNode box, Vec3 point) {
        return Math.abs(point.x() - box.path("x").asDouble()) < box.path("width").asDouble() / 2 + 0.3 &&
                Math.abs(point.z() - box.path("z").asDouble()) < box.path("depth").asDouble() / 2 + 0.3;
    }
}
