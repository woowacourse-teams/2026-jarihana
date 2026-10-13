package com.project.jarihana.image.domain;

import com.project.jarihana.common.domain.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "image_promotion_task")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ImagePromotionTask extends BaseEntity {

    @Id
    private UUID id;

    @Column(name = "image_upload_id", nullable = false, unique = true)
    private UUID imageUploadId;

    @Column(name = "source_image_key", nullable = false, length = 255)
    private String sourceImageKey;

    @Column(name = "target_image_key", nullable = false, unique = true, length = 255)
    private String targetImageKey;

    @Column(name = "reconcile_after", nullable = false)
    private LocalDateTime reconcileAfter;

    @Column(name = "attempts", nullable = false)
    private int attempts;

    @Column(name = "last_error", length = 1000)
    private String lastError;

    private ImagePromotionTask(
            UUID imageUploadId,
            String sourceImageKey,
            String targetImageKey,
            LocalDateTime reconcileAfter,
            LocalDateTime now
    ) {
        super(now);
        this.id = UUID.randomUUID();
        this.imageUploadId = imageUploadId;
        this.sourceImageKey = sourceImageKey;
        this.targetImageKey = targetImageKey;
        this.reconcileAfter = reconcileAfter;
    }

    public static ImagePromotionTask create(
            UUID imageUploadId,
            String sourceImageKey,
            String targetImageKey,
            LocalDateTime reconcileAfter,
            LocalDateTime now
    ) {
        return new ImagePromotionTask(imageUploadId, sourceImageKey, targetImageKey, reconcileAfter, now);
    }

    public UUID getId() {
        return id;
    }

    public UUID getImageUploadId() {
        return imageUploadId;
    }

    public String getSourceImageKey() {
        return sourceImageKey;
    }

    public String getTargetImageKey() {
        return targetImageKey;
    }

    public void retarget(
            String sourceImageKey,
            String targetImageKey,
            LocalDateTime reconcileAfter
    ) {
        this.sourceImageKey = sourceImageKey;
        this.targetImageKey = targetImageKey;
        this.reconcileAfter = reconcileAfter;
        this.lastError = null;
    }

    public void retryAt(LocalDateTime retryAt, String error) {
        reconcileAfter = retryAt;
        attempts++;
        lastError = error == null ? null : error.substring(0, Math.min(error.length(), 1000));
    }
}
