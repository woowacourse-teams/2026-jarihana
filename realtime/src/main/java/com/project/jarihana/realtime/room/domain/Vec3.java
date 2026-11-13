package com.project.jarihana.realtime.room.domain;

public record Vec3(double x, double y, double z) {
    public Vec3 {
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            throw new RuleViolation("INVALID_POSITION");
        }
    }

    public double distance(Vec3 other) {
        return Math.sqrt(Math.pow(x - other.x, 2) + Math.pow(y - other.y, 2) + Math.pow(z - other.z, 2));
    }

    public Vec3 add(Vec3 other) { return new Vec3(x + other.x, y + other.y, z + other.z); }
    public Vec3 scale(double amount) { return new Vec3(x * amount, y * amount, z * amount); }
}
