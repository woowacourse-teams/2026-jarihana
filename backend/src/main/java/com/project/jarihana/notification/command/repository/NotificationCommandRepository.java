package com.project.jarihana.notification.command.repository;

import com.project.jarihana.notification.domain.Notification;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface NotificationCommandRepository extends Repository<Notification, Long> {

    Notification save(Notification notification);

    Optional<Notification> findByIdAndMemberId(long id, long memberId);

    Optional<Notification> findByEventKeyAndMemberId(String eventKey, long memberId);

    @Query(value = """
            select exists (
                select 1 from notifications
                where member_id = :memberId and event_type = 'ACTIVITY_POST_REACTED'
                  and read_at is null and deleted_at is null
                  and cast(payload ->> 'activityPostId' as bigint) = :activityPostId
            )
            """, nativeQuery = true)
    boolean existsUnreadActivityPostReaction(@Param("memberId") long memberId,
                                             @Param("activityPostId") long activityPostId);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            update notifications set read_at = :now, updated_at = :now
            where id = :id and member_id = :memberId and deleted_at is null and read_at is null
            """, nativeQuery = true)
    int markRead(@Param("id") long id, @Param("memberId") long memberId, @Param("now") LocalDateTime now);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            update notifications set read_at = :now, updated_at = :now
            where member_id = :memberId and deleted_at is null and read_at is null
              and (:includeAnnouncements = true or event_type <> 'GROUP_ANNOUNCEMENT_CREATED')
            """, nativeQuery = true)
    int markAllRead(@Param("memberId") long memberId, @Param("now") LocalDateTime now,
                    @Param("includeAnnouncements") boolean includeAnnouncements);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query(value = """
            update notifications set deleted_at = :now, updated_at = :now
            where id = :id and member_id = :memberId and deleted_at is null
            """, nativeQuery = true)
    int softDelete(@Param("id") long id, @Param("memberId") long memberId, @Param("now") LocalDateTime now);

    @Transactional(propagation = Propagation.MANDATORY)
    @Query(value = """
            insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
            values (:memberId, :eventKey, :eventType, :payloadVersion, cast(:payload as jsonb), :now, :now)
            on conflict (event_key, member_id) do nothing
            returning id, member_id, event_key, event_type, payload_version, payload,
                      read_at, deleted_at, created_at, updated_at
            """, nativeQuery = true)
    Optional<Notification> insertIfAbsentReturning(
            @Param("memberId") long memberId,
            @Param("eventKey") String eventKey,
            @Param("eventType") String eventType,
            @Param("payloadVersion") int payloadVersion,
            @Param("payload") String payload,
            @Param("now") LocalDateTime now
    );

    @Transactional(propagation = Propagation.MANDATORY)
    @Query(value = """
            insert into notifications (member_id, event_key, event_type, payload_version, payload, created_at, updated_at)
            select cast(recipient.value as bigint), :eventKey, :eventType, :payloadVersion, cast(:payload as jsonb), :now, :now
            from jsonb_array_elements_text(cast(:memberIds as jsonb)) as recipient(value)
            order by cast(recipient.value as bigint)
            on conflict (event_key, member_id) do nothing
            returning id, member_id, event_key, event_type, payload_version, payload,
                      read_at, deleted_at, created_at, updated_at
            """, nativeQuery = true)
    List<Notification> insertAllIfAbsentReturning(
            @Param("memberIds") String memberIds,
            @Param("eventKey") String eventKey,
            @Param("eventType") String eventType,
            @Param("payloadVersion") int payloadVersion,
            @Param("payload") String payload,
            @Param("now") LocalDateTime now
    );
}
