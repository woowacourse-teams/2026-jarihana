package com.project.jarihana.announcement.query.repository;

import com.project.jarihana.announcement.domain.Announcement;
import com.project.jarihana.announcement.query.repository.dto.AnnouncementDetailProjection;
import com.project.jarihana.announcement.query.repository.dto.AnnouncementSummaryProjection;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface AnnouncementQueryRepository extends Repository<Announcement, Long> {

    @Query("""
            select new com.project.jarihana.announcement.query.repository.dto.AnnouncementSummaryProjection(
                announcement.id, announcement.title, announcement.scope, author.crewName, announcement.createdAt)
            from Announcement announcement
            join announcement.author author
            where announcement.group.id = :groupId
              and (:groupMember = true or announcement.scope = com.project.jarihana.announcement.domain.AnnouncementScope.PUBLIC)
              and (
                  cast(:cursorCreatedAt as LocalDateTime) is null
                  or announcement.createdAt < :cursorCreatedAt
                  or (announcement.createdAt = :cursorCreatedAt and announcement.id < :cursorId)
              )
            order by announcement.createdAt desc, announcement.id desc
            """)
    List<AnnouncementSummaryProjection> findPage(
            @Param("groupId") long groupId,
            @Param("groupMember") boolean groupMember,
            @Param("cursorCreatedAt") LocalDateTime cursorCreatedAt,
            @Param("cursorId") Long cursorId,
            Pageable pageable
    );

    @Query("""
            select new com.project.jarihana.announcement.query.repository.dto.AnnouncementDetailProjection(
                announcement.id, announcement.title, announcement.content, announcement.scope,
                author.crewName, announcement.createdAt)
            from Announcement announcement
            join announcement.author author
            where announcement.id = :announcementId
              and announcement.group.id = :groupId
              and (:groupMember = true or announcement.scope = com.project.jarihana.announcement.domain.AnnouncementScope.PUBLIC)
            """)
    Optional<AnnouncementDetailProjection> findVisibleByIdAndGroupId(
            @Param("announcementId") long announcementId,
            @Param("groupId") long groupId,
            @Param("groupMember") boolean groupMember
    );
}
