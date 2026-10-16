package com.project.jarihana.image.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "image_deletion_task")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ImageDeletionTask extends BaseEntity {

    @Id
    private UUID id;

    @Column(name = "image_upload_id")
    private UUID imageUploadId;

    @Column(name = "image_key", nullable = false, unique = true, length = 255)
    private String imageKey;

    @Column(name = "execute_after", nullable = false)
    private LocalDateTime executeAfter;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ImageDeletionTaskStatus status;

    @Column(name = "locked_until")
    private LocalDateTime lockedUntil;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    private ImageDeletionTask(
            UUID imageUploadId,
            String imageKey,
            LocalDateTime executeAfter,
            LocalDateTime createdAt
    ) {
        super(createdAt);
        this.id = UUID.randomUUID();
        this.imageUploadId = imageUploadId;
        this.imageKey = imageKey;
        this.executeAfter = executeAfter;
        this.status = ImageDeletionTaskStatus.PENDING;
    }

    public static ImageDeletionTask create(
            UUID imageUploadId,
            String imageKey,
            LocalDateTime executeAfter,
            LocalDateTime now
    ) {
        return new ImageDeletionTask(imageUploadId, imageKey, executeAfter, now);
    }

    public UUID getId() {
        return id;
    }

    public UUID getImageUploadId() {
        return imageUploadId;
    }

    public String getImageKey() {
        return imageKey;
    }

    public LocalDateTime getExecuteAfter() {
        return executeAfter;
    }

    public boolean canClaim(LocalDateTime now) {
        return !executeAfter.isAfter(now) && (lockedUntil == null || !lockedUntil.isAfter(now));
    }

    public void claimUntil(LocalDateTime until) {
        status = ImageDeletionTaskStatus.IN_PROGRESS;
        lockedUntil = until;
    }

    public void reschedule(LocalDateTime nextAttempt, String error) {
        status = ImageDeletionTaskStatus.PENDING;
        lockedUntil = null;
        executeAfter = nextAttempt;
        attempts++;
        lastError = error == null ? null : error.substring(0, Math.min(error.length(), 1000));
    }

    public void restore(LocalDateTime executeAt) {
        status = ImageDeletionTaskStatus.PENDING;
        lockedUntil = null;
        executeAfter = executeAt;
    }
}
