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

    private ImageUpload(
            UUID id,
            String fileName,
            String contentType,
            long fileSize,
            String imageKey,
            LocalDateTime expiresAt,
            LocalDateTime createdAt
    ) {
        super(createdAt);
        this.id = id;
        this.fileName = fileName;
        this.contentType = contentType;
        this.fileSize = fileSize;
        this.imageKey = imageKey;
        this.expiresAt = expiresAt;
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
        return new ImageUpload(id, fileName, contentType, fileSize, imageKey, expiresAt, createdAt);
    }

    public UUID getId() {
        return id;
    }

    public String getImageKey() {
        return imageKey;
    }

    public LocalDateTime getExpiresAt() {
        return expiresAt;
    }

    public boolean isExpiredAt(LocalDateTime now) {
        return !expiresAt.isAfter(now);
    }
}
