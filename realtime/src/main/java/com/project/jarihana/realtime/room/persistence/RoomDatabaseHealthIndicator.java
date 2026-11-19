package com.project.jarihana.realtime.room.persistence;

import com.project.jarihana.realtime.config.RealtimeEnvironment;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.health.contributor.Health;
import org.springframework.boot.health.contributor.HealthIndicator;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(prefix = "realtime", name = "enabled", havingValue = "true")
final class RoomDatabaseHealthIndicator implements HealthIndicator {
    private final RoomReadRepository rooms;

    RoomDatabaseHealthIndicator(RoomReadRepository rooms) {
        this.rooms = rooms;
    }

    @Override
    public Health health() {
        boolean healthy = true;
        for (RealtimeEnvironment environment : RealtimeEnvironment.values()) {
            try {
                rooms.verifyReadAccess(environment);
            } catch (DataAccessException | IllegalStateException error) {
                healthy = false;
            }
        }
        return healthy ? Health.up().build() : Health.down().build();
    }
}
