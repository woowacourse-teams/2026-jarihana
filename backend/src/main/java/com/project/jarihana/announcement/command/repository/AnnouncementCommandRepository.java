package com.project.jarihana.announcement.command.repository;

import com.project.jarihana.announcement.domain.Announcement;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.data.repository.Repository;

import java.util.Optional;

public interface AnnouncementCommandRepository extends Repository<Announcement, Long> {

    Announcement save(Announcement announcement);

    @Query("""
            select announcement
            from Announcement announcement
            where announcement.id = :announcementId
              and announcement.group.id = :groupId
              and announcement.deletedAt is null
            """)
    Optional<Announcement> findActiveByIdAndGroupId(
            @Param("announcementId") long announcementId,
            @Param("groupId") long groupId
    );
}
