package com.project.jarihana.image.command.repository;

import com.project.jarihana.image.domain.ImagePromotionTask;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface ImagePromotionTaskRepository extends JpaRepository<ImagePromotionTask, UUID> {

    Optional<ImagePromotionTask> findByImageUploadId(UUID imageUploadId);

    @Query("""
            select task from ImagePromotionTask task
            where task.reconcileAfter <= :now
            order by task.reconcileAfter asc
            """)
    List<ImagePromotionTask> findDue(LocalDateTime now, Pageable pageable);
}
