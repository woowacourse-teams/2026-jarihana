package com.project.jarihana.groupmusic.domain;

import java.time.Instant;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ArrayNode;
import tools.jackson.databind.node.ObjectNode;

public final class MusicQueueTimeline {

    private MusicQueueTimeline() {}

    public static String currentQueueId(JsonNode music) {
        JsonNode id = music.get("currentQueueId");
        return id != null && id.isString() ? id.asString() : null;
    }

    public static boolean isScheduled(JsonNode music) {
        return music.path("enabled").asBoolean() && currentQueueId(music) != null && durationSeconds(music) > 0;
    }

    /**
     * Advances the caller's in-memory document to the track at the supplied time.
     * Playback revisions change only when a command commits a new timeline.
     */
    public static MusicPlayback project(ObjectNode music, MusicPlayback playback, Instant now) {
        if (playback.state() != PlaybackState.PLAYING || !isScheduled(music)) {
            return playback;
        }
        double position = playback.positionAt(now);
        double duration = durationSeconds(music);
        if (position < duration) {
            return playback;
        }
        do {
            position -= duration;
            if (!selectNext(music)) {
                return MusicPlayback.of(PlaybackState.PAUSED, 0, 0, now, playback.revision());
            }
            duration = durationSeconds(music);
        } while (duration > 0 && position >= duration);
        return MusicPlayback.of(PlaybackState.PLAYING, 0, position, now, playback.revision());
    }

    public static boolean selectNext(ObjectNode music) {
        ArrayNode queue = music.has("queue") ? (ArrayNode) music.get("queue") : music.putArray("queue");
        if (queue.isEmpty()) {
            clearCurrent(music);
            return false;
        }
        select(music, queue.remove(0));
        return true;
    }

    public static void select(ObjectNode music, JsonNode entry) {
        clearTrackDetails(music);
        if (entry.has("durationSeconds")) {
            music.set("durationSeconds", entry.get("durationSeconds"));
        }
        if (entry.has("verifiedAt")) {
            music.set("verifiedAt", entry.get("verifiedAt"));
        }
        music.put("enabled", true).put("autoplay", true).put("title", entry.get("title").asString())
                .put("url", entry.get("url").asString()).put("currentQueueId", entry.get("id").asString());
    }

    private static void clearCurrent(ObjectNode music) {
        clearTrackDetails(music);
        music.put("enabled", false).put("url", "").put("title", "우리 모임의 음악");
        music.remove("currentQueueId");
    }

    private static void clearTrackDetails(ObjectNode music) {
        music.remove("lastSkippedTitle");
        music.remove("durationSeconds");
        music.remove("verifiedAt");
    }

    private static double durationSeconds(JsonNode music) {
        JsonNode value = music.path("durationSeconds");
        double duration = value.isNumber() ? value.asDouble() : 0;
        return Double.isFinite(duration) && duration > 0 ? duration : 0;
    }
}
