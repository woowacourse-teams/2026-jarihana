package com.project.jarihana.realtime.room.domain;

import com.project.jarihana.realtime.auth.Admission;

public record ParticipantState(String memberId, String displayName, String avatarColor, AvatarAppearance avatarAppearance, String role,
        String connectionGeneration, Vec3 position, double yaw, String locomotion, Seat seat,
        String heldItemId, String pose, Emote emote, long lastMoveSeq, long lastMovedAt) {
    public record Seat(String assetId, int slot) {}
    public record Emote(String kind, long startedAt, long expiresAt) {}

    public static ParticipantState join(Admission admission, String generation, Vec3 position, long now) {
        return new ParticipantState(admission.memberId(), admission.displayName(), admission.avatarColor(), admission.avatarAppearance(),
                admission.role(), generation, position, 0, "idle", null, null, "relaxed", null, 0, now);
    }

    public ParticipantState move(Vec3 point, double angle, String motion, long seq, long now) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, point, angle,
                motion, seat, heldItemId, pose, emote, seq, now);
    }

    public ParticipantState sit(Seat value, Vec3 approach) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration,
                approach, yaw, "idle", value, heldItemId, pose, emote, lastMoveSeq, lastMovedAt);
    }

    public ParticipantState stand(Vec3 point, long now) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration,
                point, yaw, "idle", null, heldItemId, "relaxed", emote, lastMoveSeq, now);
    }

    public ParticipantState hold(String itemId) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, position, yaw,
                locomotion, seat, itemId, itemId == null ? "relaxed" : pose, emote, lastMoveSeq, lastMovedAt);
    }

    public ParticipantState withPose(String value) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, position, yaw,
                locomotion, seat, heldItemId, value, emote, lastMoveSeq, lastMovedAt);
    }

    public ParticipantState withEmote(Emote value) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role, connectionGeneration, position, yaw,
                locomotion, seat, heldItemId, pose, value, lastMoveSeq, lastMovedAt);
    }

    public ParticipantState withRole(String role) {
        return new ParticipantState(memberId, displayName, avatarColor, avatarAppearance, role,
                connectionGeneration, position, yaw, locomotion, seat, heldItemId, pose, emote,
                lastMoveSeq, lastMovedAt);
    }

    public ParticipantState reconnect(Admission admission, String generation, long now) {
        return new ParticipantState(memberId, admission.displayName(), admission.avatarColor(), admission.avatarAppearance(), admission.role(),
                generation, position, yaw, "idle", seat, heldItemId, pose, emote, 0, now);
    }

}
