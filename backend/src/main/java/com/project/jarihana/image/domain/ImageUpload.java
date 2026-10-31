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
@Table(name = "image_upload")
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ImageUpload extends BaseEntity {

    @Id
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "file_name", nullable = false, length = 255)
    private String fileName;

    @Column(name = "content_type", nullable = false, length = 100)
    private String contentType;

    @Column(name = "file_size", nullable = false)
    private long fileSize;

    @Column(name = "image_key", nullable = false, unique = true, length = 255)
    private String imageKey;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    @Column(name = "uploader_id")
    private Long uploaderId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private ImageUploadStatus status;

    @Column(name = "attached_group_id")
    private Long attachedGroupId;

    @Column(name = "attached_sparring_id")
    private Long attachedSparringId;

    @Column(name = "source_image_key", length = 255)
    private String sourceImageKey;

    @Column(name = "attached_at")
    private LocalDateTime attachedAt;

    @Column(name = "delete_requested_at")
    private LocalDateTime deleteRequestedAt;

    @Column(name = "next_cleanup_at")
    private LocalDateTime nextCleanupAt;

    @Column(name = "cleanup_attempts", nullable = false)
    private int cleanupAttempts;

    @Column(name = "last_cleanup_error", length = 1000)
    private String lastCleanupError;

    private ImageUpload(
            UUID id,
            String fileName,
            String contentType,
            long fileSize,
            String imageKey,
            LocalDateTime expiresAt,
            LocalDateTime createdAt,
            Long uploaderId
    ) {
        super(createdAt);
        this.id = id;
        this.fileName = fileName;
        this.contentType = contentType;
        this.fileSize = fileSize;
        this.imageKey = imageKey;
        this.expiresAt = expiresAt;
        this.uploaderId = uploaderId;
        this.status = ImageUploadStatus.TEMPORARY;
        this.cleanupAttempts = 0;
    }

    public static ImageUpload create(
            UUID id,
            String fileName,
            String contentType,
            long fileSize,
            String imageKey,
            LocalDateTime expiresAt,
            LocalDateTime createdAt
    ) {
        return new ImageUpload(id, fileName, contentType, fileSize, imageKey, expiresAt, createdAt, null);
    }

    public static ImageUpload create(
            UUID id,
            String fileName,
            String contentType,
            long fileSize,
            String imageKey,
            LocalDateTime expiresAt,
            LocalDateTime createdAt,
            Long uploaderId
    ) {
        return new ImageUpload(id, fileName, contentType, fileSize, imageKey, expiresAt, createdAt, uploaderId);
    }

    public UUID getId() {
        return id;
    }

    public String getImageKey() {
        return imageKey;
    }

    public String getContentType() {
        return contentType;
    }

    public long getFileSize() {
        return fileSize;
    }

    public Long getUploaderId() {
        return uploaderId;
    }

    public ImageUploadStatus getStatus() {
        return status;
    }

    public Long getAttachedGroupId() {
        return attachedGroupId;
    }

    public Long getAttachedSparringId() {
        return attachedSparringId;
    }

    public String getSourceImageKey() {
        return sourceImageKey;
    }

    public LocalDateTime getNextCleanupAt() {
        return nextCleanupAt;
    }

    public int getCleanupAttempts() {
        return cleanupAttempts;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public boolean isExpiredAt(LocalDateTime now) {
        return !expiresAt.isAfter(now);
    }

    public boolean canBePreviewedBy(Long memberId, LocalDateTime now) {
        return status == ImageUploadStatus.TEMPORARY
                && uploaderId != null
                && uploaderId.equals(memberId)
                && !isExpiredAt(now);
    }

    public boolean canAttachTo(Long memberId, long groupId, LocalDateTime now) {
        if (attachedSparringId != null) {
            return false;
        }
        if (uploaderId != null && !uploaderId.equals(memberId)) {
            return false;
        }
        if (attachedGroupId != null && !attachedGroupId.equals(groupId)) {
            return false;
        }
        if (attachedGroupId != null && attachedGroupId.equals(groupId)
                && status == ImageUploadStatus.ATTACHED) {
            return true;
        }
        if (attachedGroupId == null && status == ImageUploadStatus.ATTACHED) {
            return false;
        }
        return status != ImageUploadStatus.DELETE_PENDING && !isExpiredAt(now);
    }

    public void startPromotion(long groupId, String targetImageKey) {
        if (attachedSparringId != null || (attachedGroupId != null && !attachedGroupId.equals(groupId))) {
            throw new IllegalStateException("이미 다른 그룹에 연결된 이미지입니다.");
        }
        if (sourceImageKey == null) {
            sourceImageKey = imageKey;
        }
        imageKey = targetImageKey;
        attachedGroupId = groupId;
        status = ImageUploadStatus.PROMOTING;
    }

    public boolean canAttachToSparring(long memberId, long topicId, LocalDateTime now) {
        if (uploaderId == null || uploaderId != memberId || attachedGroupId != null) {
            return false;
        }
        if (attachedSparringId != null) {
            return attachedSparringId == topicId && status == ImageUploadStatus.ATTACHED;
        }
        return status == ImageUploadStatus.TEMPORARY && !isExpiredAt(now);
    }

    public void startSparringPromotion(long topicId, String targetImageKey) {
        if (attachedGroupId != null || (attachedSparringId != null && attachedSparringId != topicId)) {
            throw new IllegalStateException("이미 다른 대상에 연결된 이미지입니다.");
        }
        if (sourceImageKey == null) {
            sourceImageKey = imageKey;
        }
        imageKey = targetImageKey;
        attachedSparringId = topicId;
        status = ImageUploadStatus.PROMOTING;
    }

    public void completeAttachment(LocalDateTime now) {
        status = ImageUploadStatus.ATTACHED;
        attachedAt = attachedAt == null ? now : attachedAt;
        deleteRequestedAt = null;
        nextCleanupAt = null;
        lastCleanupError = null;
    }

    public void attachLegacyAt(LocalDateTime now) {
        completeAttachment(now);
    }

    public void requestDeletion(LocalDateTime now, LocalDateTime executeAfter) {
        status = ImageUploadStatus.DELETE_PENDING;
        deleteRequestedAt = deleteRequestedAt == null ? now : deleteRequestedAt;
        nextCleanupAt = executeAfter;
    }

    public void restoreAttachment(LocalDateTime now) {
        completeAttachment(now);
    }

    public void recordCleanupFailure(LocalDateTime retryAt, String error) {
        status = ImageUploadStatus.DELETE_PENDING;
        cleanupAttempts++;
        nextCleanupAt = retryAt;
        lastCleanupError = error == null ? null : error.substring(0, Math.min(error.length(), 1000));
    }
}
