package com.project.jarihana.image.command.repository;

import com.project.jarihana.image.domain.ImageUpload;
import java.util.Optional;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import jakarta.persistence.LockModeType;

public interface ImageUploadCommandRepository extends Repository<ImageUpload, UUID> {

    ImageUpload save(ImageUpload imageUpload);

    Optional<ImageUpload> findByImageKey(String imageKey);

    Optional<ImageUpload> findById(UUID id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select upload from ImageUpload upload where upload.imageKey = :imageKey")
    Optional<ImageUpload> findWithLockByImageKey(String imageKey);

    @Query("""
            select upload from ImageUpload upload
            where upload.status = com.project.jarihana.image.domain.ImageUploadStatus.TEMPORARY
              and upload.expiresAt <= :now
            order by upload.createdAt asc
            """)
    List<ImageUpload> findCleanupCandidates(LocalDateTime now, Pageable pageable);

    void delete(ImageUpload imageUpload);
}
