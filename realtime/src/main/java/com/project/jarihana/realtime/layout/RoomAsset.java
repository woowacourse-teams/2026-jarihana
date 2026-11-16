package com.project.jarihana.realtime.layout;

import com.project.jarihana.realtime.room.domain.RuleViolation;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.util.List;
import java.util.Set;

public record RoomAsset(String id, String kind, Vec3 position, double rotation, double scaleX, double scaleY,
        double scaleZ, double width, double depth, double height, Set<String> capabilities,
        List<Vec3> seats, List<String> supplies, List<String> products, int slots,
        boolean obstacle, double platformHeight, List<Vec3> surfaces, double interactionFloor, long productionMs, long cooldownMs) {
    public RoomAsset {
        capabilities = Set.copyOf(capabilities);
        seats = List.copyOf(seats);
        supplies = List.copyOf(supplies);
        products = List.copyOf(products);
        surfaces = List.copyOf(surfaces);
    }

    public boolean has(String capability) { return capabilities.contains(capability); }

    public Vec3 world(Vec3 local) {
        double angle = rotation * Math.PI / 2;
        return new Vec3(position.x() + local.x() * scaleX * Math.cos(angle) + local.z() * scaleZ * Math.sin(angle),
                position.y() + local.y() * scaleY,
                position.z() - local.x() * scaleX * Math.sin(angle) + local.z() * scaleZ * Math.cos(angle));
    }

    public Vec3 local(Vec3 point) {
        double angle = rotation * Math.PI / 2;
        double x = point.x() - position.x(), z = point.z() - position.z();
        return new Vec3((x * Math.cos(angle) - z * Math.sin(angle)) / scaleX,
                (point.y() - position.y()) / scaleY,
                (x * Math.sin(angle) + z * Math.cos(angle)) / scaleZ);
    }

    public Vec3 seat(int slot) {
        if (!has("seatable") || slot < 0 || slot >= seats.size()) throw new RuleViolation("INVALID_SLOT");
        return world(seats.get(slot));
    }

    public Vec3 surface(int slot) {
        if (slot < 0 || slot >= surfaces.size()) throw new RuleViolation("INVALID_SLOT");
        return world(surfaces.get(slot));
    }

    public Vec3 storage(int slot) {
        if (slot < 0 || slot >= slots) throw new RuleViolation("INVALID_SLOT");
        return world(new Vec3((slot - (slots - 1) / 2.0) * Math.min(0.28, width / Math.max(slots, 1)),
                surfaces.isEmpty() ? Math.min(height, 1.2) : surfaces.getFirst().y(), 0));
    }

    public boolean reachable(Vec3 point) {
        return withinReach(point) && Math.abs(point.y() - position.y()) <= 2;
    }

    public boolean surfaceReachable(Vec3 point) {
        return withinReach(point) && Math.abs(point.y() - interactionFloor) <= 1.2;
    }

    private boolean withinReach(Vec3 point) {
        Vec3 local = local(point);
        double dx = Math.max(0, Math.abs(local.x()) * scaleX - width * scaleX / 2);
        double dz = Math.max(0, Math.abs(local.z()) * scaleZ - depth * scaleZ / 2);
        return Math.hypot(dx, dz) <= 2.3;
    }

    public boolean blocks(Vec3 point) {
        if (!obstacle || platformHeight > 0) return false;
        Vec3 local = local(point);
        return point.y() + 1.7 > position.y() + 0.05 && point.y() < position.y() + height * scaleY - 0.05 &&
                Math.abs(local.x()) < width / 2 + 0.3 / scaleX &&
                Math.abs(local.z()) < depth / 2 + 0.3 / scaleZ;
    }
}
