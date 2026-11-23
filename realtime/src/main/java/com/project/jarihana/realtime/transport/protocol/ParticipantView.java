package com.project.jarihana.realtime.transport.protocol;

import com.project.jarihana.realtime.layout.RoomAsset;
import com.project.jarihana.realtime.layout.RoomLayout;
import com.project.jarihana.realtime.room.domain.ParticipantState;
import com.project.jarihana.realtime.room.domain.Vec3;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

public final class ParticipantView {
    private ParticipantView() {}

    public static Map<String, Object> snapshot(ParticipantState actor, RoomLayout layout, boolean seatRefs) {
        LegacySeat legacy = legacySeat(actor, layout, seatRefs);
        Map<String, Object> result = movement(actor, legacy);
        result.put("displayName", actor.displayName());
        result.put("avatarColor", actor.avatarColor());
        result.put("avatarAppearance", actor.avatarAppearance());
        result.put("seat", legacy == null ? actor.seat() : legacy);
        result.put("heldItemId", actor.heldItemId());
        result.put("pose", actor.pose());
        result.put("emote", actor.emote());
        return result;
    }

    public static Map<String, Object> movement(ParticipantState actor, RoomLayout layout, boolean seatRefs) {
        return movement(actor, legacySeat(actor, layout, seatRefs));
    }

    private static Map<String, Object> movement(ParticipantState actor, LegacySeat legacy) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("memberId", actor.memberId());
        result.put("position", legacy == null ? actor.position() : legacy.position());
        result.put("yaw", legacy == null ? actor.yaw() : legacy.yaw());
        result.put("locomotion", actor.locomotion());
        return result;
    }

    private static LegacySeat legacySeat(ParticipantState actor, RoomLayout layout, boolean seatRefs) {
        if (seatRefs || actor.seat() == null) return null;
        return LegacySeat.project(actor, layout.assets().get(actor.seat().assetId()));
    }

    /** Frozen presentation values required by v1 peers without seatRefs. */
    record LegacySeat(String assetId, int slot, Vec3 position, Vec3 approach, double yaw) {
        private static final JsonNode ANCHORS = readAnchors();

        private static LegacySeat project(ParticipantState actor, RoomAsset asset) {
            int slot = actor.seat().slot();
            JsonNode anchor = ANCHORS.path(asset.kind()).path(slot);
            Vec3 local = new Vec3(anchor.path("x").asDouble(0), anchor.path("y").asDouble(asset.height() / 2)
                    + anchor.path("avatarOffsetY").asDouble(0) / asset.scaleY(), anchor.path("z").asDouble(0));
            double yaw = Math.PI - asset.rotation() * Math.PI / 2;
            return new LegacySeat(asset.id(), slot, asset.world(local), actor.position(), yaw);
        }

        private static JsonNode readAnchors() {
            try (var input = new ClassPathResource("contracts/legacy-seat-anchors.json").getInputStream()) {
                return new JsonMapper().readTree(input);
            } catch (IOException error) {
                throw new IllegalStateException("Legacy seat positions could not be loaded", error);
            }
        }
    }
}
