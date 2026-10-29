package com.project.jarihana.announcement.command.repository;

import com.project.jarihana.announcement.domain.Announcement;
import org.springframework.data.repository.Repository;

public interface AnnouncementCommandRepository extends Repository<Announcement, Long> {

    Announcement save(Announcement announcement);
}
