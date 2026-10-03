package com.project.jarihana.notification.command.repository;

import com.project.jarihana.notification.domain.Notification;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface NotificationCommandRepository extends Repository<Notification, Long> {

    Notification save(Notification notification);

    Optional<Notification> findByIdAndMemberId(long id, long memberId);

    Optional<Notification> findByEventKeyAndMemberId(String eventKey, long memberId);

    @Modifying
    @Query(value = """
            insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
            values (:memberId, :eventKey, :eventType, :payloadVersion, cast(:payload as jsonb), :now, :now)
            on conflict (event_key, member_id) do nothing
            """, nativeQuery = true)
    int insertIfAbsent(
            @Param("memberId") long memberId,
            @Param("eventKey") String eventKey,
            @Param("eventType") String eventType,
            @Param("payloadVersion") int payloadVersion,
            @Param("payload") String payload,
            @Param("now") LocalDateTime now
    );
}
