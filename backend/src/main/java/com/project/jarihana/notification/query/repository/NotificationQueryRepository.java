package com.project.jarihana.notification.query.repository;

import com.project.jarihana.activitypost.domain.ReactionEmoji;
import com.project.jarihana.notification.domain.Notification;
import com.project.jarihana.notification.query.repository.dto.ActivityPostReactionSummaryProjection;
import com.project.jarihana.notification.query.repository.dto.NotificationProjection;
import com.project.jarihana.notification.query.repository.dto.NotificationGroupProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Slice;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface NotificationQueryRepository extends Repository<Notification, Long> {

    @Query("""
            select new com.project.jarihana.notification.query.repository.dto.NotificationProjection(
                notification.id, notification.eventType, notification.payloadVersion,
                notification.payload, notification.readAt, notification.createdAt)
            from Notification notification
            where notification.id = :id and notification.member.id = :memberId and notification.deletedAt is null
              and (:includeAnnouncements = true or notification.eventType <>
                   com.project.jarihana.notification.domain.NotificationEventType.GROUP_ANNOUNCEMENT_CREATED)
            """)
    Optional<NotificationProjection> findActiveByIdAndMemberId(
            @Param("id") long id, @Param("memberId") long memberId,
            @Param("includeAnnouncements") boolean includeAnnouncements);

    @Query("""
            select new com.project.jarihana.notification.query.repository.dto.NotificationProjection(
                notification.id, notification.eventType, notification.payloadVersion,
                notification.payload, notification.readAt, notification.createdAt)
            from Notification notification
            where notification.member.id = :memberId
              and notification.deletedAt is null
              and (:includeAnnouncements = true or notification.eventType <>
                   com.project.jarihana.notification.domain.NotificationEventType.GROUP_ANNOUNCEMENT_CREATED)
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
            @Param("includeAnnouncements") boolean includeAnnouncements,
            Pageable pageable
    );

    @Query("""
            select new com.project.jarihana.notification.query.repository.dto.NotificationGroupProjection(g.id, g.name)
            from Group g where g.id in :groupIds
            """)
    List<NotificationGroupProjection> findGroupNames(@Param("groupIds") Collection<Long> groupIds);

    @Query("""
            select new com.project.jarihana.notification.query.repository.dto.ActivityPostReactionSummaryProjection(
                reaction.post.id, reaction.member.crewName,
                (select count(counted) from ActivityPostReaction counted
                 where counted.post.id = reaction.post.id and counted.emoji = :emoji
                   and counted.member.id <> counted.post.author.id))
            from ActivityPostReaction reaction
            where reaction.post.id in :activityPostIds
              and reaction.id = (
                  select max(latest.id) from ActivityPostReaction latest
                  where latest.post.id = reaction.post.id and latest.emoji = :emoji
                    and latest.member.id <> latest.post.author.id
              )
            """)
    List<ActivityPostReactionSummaryProjection> findReactionSummaries(
            @Param("activityPostIds") Collection<Long> activityPostIds,
            @Param("emoji") ReactionEmoji emoji
    );

    @Query("""
            select count(notification)
            from Notification notification
            where notification.member.id = :memberId
              and notification.deletedAt is null
              and notification.readAt is null
              and (:includeAnnouncements = true or notification.eventType <>
                   com.project.jarihana.notification.domain.NotificationEventType.GROUP_ANNOUNCEMENT_CREATED)
            """)
    long countUnread(@Param("memberId") long memberId,
                     @Param("includeAnnouncements") boolean includeAnnouncements);
}
