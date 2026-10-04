package com.project.jarihana.notification.query.repository;

import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Optional;

public interface NotificationQueryRepository extends Repository<Notification, Long> {

    @Query("""
            select new com.project.jarihana.notification.query.repository.dto.NotificationProjection(
                notification.id, notification.eventType, notification.payloadVersion,
                notification.payload, notification.readAt, notification.createdAt)
            from Notification notification
            where notification.id = :id and notification.member.id = :memberId and notification.deletedAt is null
            """)
    Optional<NotificationProjection> findActiveByIdAndMemberId(@Param("id") long id, @Param("memberId") long memberId);

    @Query("""
            select new com.project.jarihana.notification.query.repository.dto.NotificationProjection(
                notification.id, notification.eventType, notification.payloadVersion,
                notification.payload, notification.readAt, notification.createdAt)
            from Notification notification
            where notification.member.id = :memberId
              and notification.deletedAt is null
              and (
                  cast(:cursorCreatedAt as LocalDateTime) is null
                  or notification.createdAt < :cursorCreatedAt
                  or (notification.createdAt = :cursorCreatedAt and notification.id < :cursorId)
              )
            order by notification.createdAt desc, notification.id desc
            """)
    Slice<NotificationProjection> findPage(
            @Param("memberId") long memberId,
            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @Query("""
            select count(notification)
            from Notification notification
            where notification.member.id = :memberId
              and notification.deletedAt is null
              and notification.readAt is null
            """)
    long countUnread(@Param("memberId") long memberId);
}
