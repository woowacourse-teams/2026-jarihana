package com.project.jarihana.realtime.room.domain;

import com.project.jarihana.realtime.auth.Admission;
import java.util.LinkedHashMap;
import java.util.Map;

public record ParticipantState(String memberId, String displayName, String avatarColor, AvatarAppearance avatarAppearance, String role,
        String connectionGeneration, Vec3 position, double yaw, String locomotion, Seat seat,
        String heldItemId, String pose, Emote emote, long lastMoveSeq, long lastMovedAt, long leaseExpiresAt) {
    public record Seat(String assetId, int slot, Vec3 position, Vec3 approach, double yaw) {}
    public record Emote(String kind, long startedAt, long expiresAt) {}

    public static ParticipantState join(Admission admission, String generation, Vec3 position, long now) {
        return new ParticipantState(admission.memberId(), admission.displayName(), admission.avatarColor(), admission.avatarAppearance(),
                admission.role(), generation, position, 0, "idle", null, null, "relaxed", null, 0, now, admission.leaseExpiresAt());
    }

    public ParticipantState move(Vec3 point, double angle, String motion, long seq, long now) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, point, angle,
                motion, seat, heldItemId, pose, emote, seq, now, leaseExpiresAt);
    }

    public ParticipantState sit(Seat value) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration,
                value.position(), value.yaw(), "idle", value, heldItemId, pose, emote, lastMoveSeq, lastMovedAt, leaseExpiresAt);
    }

    public ParticipantState stand(Vec3 point, long now) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration,
                point, yaw, "idle", null, heldItemId, "relaxed", emote, lastMoveSeq, now, leaseExpiresAt);
    }

    public ParticipantState hold(String itemId) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, position, yaw,
                locomotion, seat, itemId, itemId == null ? "relaxed" : pose, emote, lastMoveSeq, lastMovedAt, leaseExpiresAt);
    }

    public ParticipantState withPose(String value) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, position, yaw,
                locomotion, seat, heldItemId, value, emote, lastMoveSeq, lastMovedAt, leaseExpiresAt);
    }

    public ParticipantState withEmote(Emote value) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, position, yaw,
                locomotion, seat, heldItemId, pose, value, lastMoveSeq, lastMovedAt, leaseExpiresAt);
    }

    public ParticipantState renew(Admission admission) {
        return new ParticipantState(memberId, admission.displayName(), admission.avatarColor(), admission.avatarAppearance(), admission.role(),
                connectionGeneration, position, yaw, locomotion, seat, heldItemId, pose, emote,
                lastMoveSeq, lastMovedAt, admission.leaseExpiresAt());
    }

    public ParticipantState reconnect(Admission admission, String generation, long now) {
        return new ParticipantState(memberId, admission.displayName(), admission.avatarColor(), admission.avatarAppearance(), admission.role(),
                generation, position, yaw, "idle", seat, heldItemId, pose, emote, 0, now, admission.leaseExpiresAt());
    }

    public Map<String, Object> view() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("memberId", memberId);
        result.put("displayName", displayName);
        result.put("avatarColor", avatarColor);
        result.put("avatarAppearance", avatarAppearance);
        result.put("position", position);
        result.put("yaw", yaw);
        result.put("locomotion", locomotion);
        result.put("seat", seat);
        result.put("heldItemId", heldItemId);
        result.put("pose", pose);
        result.put("emote", emote);
        return result;
    }
}
