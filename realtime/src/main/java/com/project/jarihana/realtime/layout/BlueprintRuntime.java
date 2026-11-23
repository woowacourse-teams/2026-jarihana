package com.project.jarihana.realtime.layout;

import com.project.jarihana.realtime.room.domain.Vec3;
import org.springframework.dao.DataRetrievalFailureException;
import tools.jackson.databind.JsonNode;

public record BlueprintRuntime(JsonNode geometry, Vec3 spawn, JsonNode defaultRoom) {
    public JsonNode document(JsonNode stored) {
        if (stored != null) return stored;
        if (defaultRoom == null) throw new DataRetrievalFailureException("Missing default room for unsaved layout");
        return defaultRoom;
    }
}
