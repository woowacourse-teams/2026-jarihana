package com.project.jarihana.image.command.repository;

import com.project.jarihana.image.domain.ImageDeletionTask;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import jakarta.persistence.LockModeType;

public interface ImageDeletionTaskRepository extends JpaRepository<ImageDeletionTask, UUID> {

    Optional<ImageDeletionTask> findByImageUploadId(UUID imageUploadId);

    Optional<ImageDeletionTask> findByImageKey(String imageKey);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select task from ImageDeletionTask task where task.id = :id")
    Optional<ImageDeletionTask> findWithLockById(UUID id);

    @Query("""
            select task from ImageDeletionTask task
            where task.executeAfter <= :now
              and (task.lockedUntil is null or task.lockedUntil <= :now)
            order by task.executeAfter asc
            """)
    List<ImageDeletionTask> findDue(LocalDateTime now, Pageable pageable);
}
